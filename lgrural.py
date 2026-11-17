"""
LegislaGov Rural — servidor do app da horta (só biblioteca padrão do Python).

Usa o mesmo banco SQLite do LegislaGov (LG_BANCO=1), em tabelas próprias (rural_*):
nada das tabelas da Câmara é lido ou alterado.

Cada horta é uma "empresa" (código listado em ferramentas/aws/rural.txt). Dentro dela:
  - gestor (dono): vê e altera tudo;
  - vendedor: recebe do servidor só o que é dele (rotas, saídas, fiados e comprovantes das
    saídas dele, pedidos e fornecedores das rotas dele, produtos) e só grava isso.
Entrada por senha de 4 a 6 números (PBKDF2 no servidor, bloqueio após erros seguidos).

Rotas (prefixo /api/rural/):
  GET  entrada?e=CÓD        nome da horta e quem pode entrar (sem dados)
  POST primeiro             {e, pin} cria a senha do gestor (só enquanto não existe)
  POST entrar               {e, quem, pin} -> {token, sessao}
  POST sair
  GET  dados                tudo o que a pessoa pode ver + seq
  GET  mudancas?desde=N     espera até 25 s por alterações (tempo real)
  POST gravar               {docs:[{col,id,json,base}|{col,id,apagar:true,base}]}
  POST senha                {para:'gestor'|vendedorId, pin}            — gestor
  POST posicoes             {pontos:[{t,lat,lng,prec,saida,ev}]}       — vendedor
  GET  trajeto?vendedor=&de=&ate=                                       — gestor (ou o próprio vendedor)
  GET  aovivo               última posição de cada vendedor              — gestor
O app em si (HTML) é servido pelo server.py a partir de apps/rural/.
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import threading
import time

import lgapi

PASTA = os.path.dirname(os.path.abspath(__file__))
ARQ_EMPRESAS = os.path.join(PASTA, "ferramentas", "aws", "rural.txt")
COLS = ("config", "vendedores", "produtos", "pontos", "rotas", "saidas", "fiados", "comprovantes", "pedidos", "custos", "funcionarios")
COLS_VENDEDOR = ("vendedores", "produtos", "pontos", "rotas", "saidas", "fiados", "comprovantes", "pedidos")
SESSAO_DIAS = 180
ESPERA = 25
POS_DIAS = 120

_aviso = threading.Condition()
_estado = {"pronto": False, "empresas_lidas": 0.0, "empresas": set(), "limpeza": 0.0}


# ---------------------------------------------------------------- banco
def _db():
    c = lgapi._db()
    if not _estado["pronto"]:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS rural_acessos(empresa TEXT NOT NULL, id TEXT NOT NULL, tipo TEXT NOT NULL, pin TEXT,
            falhas INTEGER NOT NULL DEFAULT 0, janela REAL NOT NULL DEFAULT 0, bloqueio REAL NOT NULL DEFAULT 0,
            PRIMARY KEY(empresa, id));
        CREATE TABLE IF NOT EXISTS rural_sessoes(token TEXT PRIMARY KEY, empresa TEXT NOT NULL, quem TEXT NOT NULL,
            tipo TEXT NOT NULL, expira REAL NOT NULL, criado REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS rural_docs(empresa TEXT NOT NULL, col TEXT NOT NULL, id TEXT NOT NULL, json TEXT,
            seq INTEGER NOT NULL, apagado INTEGER NOT NULL DEFAULT 0, quando REAL, por TEXT, PRIMARY KEY(empresa, col, id));
        CREATE INDEX IF NOT EXISTS ix_rural_docs_seq ON rural_docs(empresa, seq);
        CREATE TABLE IF NOT EXISTS rural_pos(id INTEGER PRIMARY KEY AUTOINCREMENT, empresa TEXT NOT NULL, vendedor TEXT NOT NULL,
            t REAL NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, prec REAL, saida TEXT, ev TEXT, UNIQUE(empresa, vendedor, t));
        CREATE INDEX IF NOT EXISTS ix_rural_pos ON rural_pos(empresa, vendedor, t);
        CREATE TABLE IF NOT EXISTS rural_seq(empresa TEXT PRIMARY KEY, seq INTEGER NOT NULL);
        """)
        _estado["pronto"] = True
    return c


def empresas():
    """Códigos de horta liberados (ferramentas/aws/rural.txt, um por linha)."""
    if time.time() - _estado["empresas_lidas"] > 30:
        cods = set()
        try:
            with open(ARQ_EMPRESAS, encoding="utf-8") as f:
                for linha in f:
                    p = linha.split("#", 1)[0].split()
                    if p and re.fullmatch(r"[a-z0-9-]{3,40}", p[0]):
                        cods.add(p[0])
        except OSError:
            pass
        _estado.update(empresas=cods, empresas_lidas=time.time())
    return _estado["empresas"]


def _prox_seq(c, empresa):
    c.execute("INSERT INTO rural_seq(empresa, seq) VALUES(?, 1) ON CONFLICT(empresa) DO UPDATE SET seq = seq + 1", (empresa,))
    return c.execute("SELECT seq FROM rural_seq WHERE empresa=?", (empresa,)).fetchone()[0]


def _seq_atual(c, empresa):
    r = c.execute("SELECT seq FROM rural_seq WHERE empresa=?", (empresa,)).fetchone()
    return r[0] if r else 0


def _resumo(token):
    return hashlib.sha256(("rural:" + str(token)).encode()).hexdigest()


# ---------------------------------------------------------------- acesso
def _acessos(c, empresa):
    return {r["id"]: r for r in c.execute("SELECT * FROM rural_acessos WHERE empresa=?", (empresa,))}


def _docs(c, empresa, col):
    out = []
    for r in c.execute("SELECT id, json FROM rural_docs WHERE empresa=? AND col=? AND apagado=0", (empresa, col)):
        try:
            out.append(json.loads(r["json"]))
        except Exception:
            pass
    return out


def entrada(c, empresa):
    ac = _acessos(c, empresa)
    cfg = next(iter(_docs(c, empresa, "config")), {}) or {}
    vend = [{"id": v.get("id"), "nome": v.get("nome", ""), "temSenha": bool(ac.get(v.get("id")) and ac[v.get("id")]["pin"])}
            for v in _docs(c, empresa, "vendedores") if v.get("id")]
    vend.sort(key=lambda x: x["nome"].lower())
    return {"ok": True, "empresa": empresa, "nome": cfg.get("nomeHorta") or "", "gestorDefinido": bool(ac.get("gestor") and ac["gestor"]["pin"]),
            "vendedores": vend}


def _criar_sessao(c, empresa, quem, tipo):
    token = secrets.token_urlsafe(32)
    agora = time.time()
    c.execute("INSERT INTO rural_sessoes(token, empresa, quem, tipo, expira, criado) VALUES(?,?,?,?,?,?)",
              (_resumo(token), empresa, quem, tipo, agora + SESSAO_DIAS * 86400, agora))
    return token


def sessao(c, token):
    if not token:
        return None
    r = c.execute("SELECT * FROM rural_sessoes WHERE token=?", (_resumo(token),)).fetchone()
    if not r or r["expira"] < time.time():
        return None
    if r["empresa"] not in empresas():
        return None
    if r["tipo"] == "vendedor":
        a = c.execute("SELECT pin FROM rural_acessos WHERE empresa=? AND id=?", (r["empresa"], r["quem"])).fetchone()
        if not a or not a["pin"]:
            return None   # gestor removeu o acesso
    # renova devagar (uma vez por dia)
    if r["expira"] - time.time() < (SESSAO_DIAS - 1) * 86400:
        c.execute("UPDATE rural_sessoes SET expira=? WHERE token=?", (time.time() + SESSAO_DIAS * 86400, r["token"]))
    return {"empresa": r["empresa"], "quem": r["quem"], "tipo": r["tipo"]}


def _pin_ok(pin):
    return bool(re.fullmatch(r"\d{4,6}", str(pin or "")))


def primeiro(c, empresa, pin):
    if not _pin_ok(pin):
        return 400, {"ok": False, "erro": "Use de 4 a 6 números."}
    a = c.execute("SELECT pin FROM rural_acessos WHERE empresa=? AND id='gestor'", (empresa,)).fetchone()
    if a and a["pin"]:
        return 409, {"ok": False, "erro": "A senha do gestor já foi criada. Entre com ela."}
    c.execute("INSERT INTO rural_acessos(empresa, id, tipo, pin) VALUES(?, 'gestor', 'gestor', ?) "
              "ON CONFLICT(empresa, id) DO UPDATE SET pin=excluded.pin, falhas=0, bloqueio=0", (empresa, lgapi.hash_senha(pin)))
    token = _criar_sessao(c, empresa, "gestor", "gestor")
    return 200, {"ok": True, "token": token, "sessao": {"tipo": "gestor", "id": "gestor", "nome": "Gestor"}}


def entrar(c, empresa, quem, pin):
    quem = str(quem or "")
    a = c.execute("SELECT * FROM rural_acessos WHERE empresa=? AND id=?", (empresa, quem)).fetchone()
    agora = time.time()
    if not a or not a["pin"]:
        return 403, {"ok": False, "erro": "Este usuário ainda não tem senha. Peça ao gestor para criar."}
    if a["bloqueio"] > agora:
        minutos = int((a["bloqueio"] - agora) // 60) + 1
        return 429, {"ok": False, "erro": f"Muitas senhas erradas. Tente de novo em {minutos} minuto(s)."}
    if not lgapi.confere_senha(str(pin or ""), a["pin"]):
        falhas = (a["falhas"] if agora - a["janela"] < 900 else 0) + 1
        janela = a["janela"] if agora - a["janela"] < 900 else agora
        bloqueio = agora + 900 if falhas >= 6 else 0
        c.execute("UPDATE rural_acessos SET falhas=?, janela=?, bloqueio=? WHERE empresa=? AND id=?", (falhas, janela, bloqueio, empresa, quem))
        if bloqueio:
            return 429, {"ok": False, "erro": "Muitas senhas erradas. Espere 15 minutos e tente de novo."}
        return 401, {"ok": False, "erro": "Senha errada. Tente de novo."}
    c.execute("UPDATE rural_acessos SET falhas=0, bloqueio=0 WHERE empresa=? AND id=?", (empresa, quem))
    nome = "Gestor"
    if a["tipo"] == "vendedor":
        v = next((x for x in _docs(c, empresa, "vendedores") if x.get("id") == quem), None)
        if not v:
            return 403, {"ok": False, "erro": "Vendedor não encontrado."}
        nome = v.get("nome", "")
    token = _criar_sessao(c, empresa, quem, a["tipo"])
    return 200, {"ok": True, "token": token, "sessao": {"tipo": a["tipo"], "id": quem, "nome": nome}}


def definir_pin(c, s, para, pin):
    if s["tipo"] != "gestor":
        return 403, {"ok": False, "erro": "Só o gestor muda senhas."}
    if not _pin_ok(pin):
        return 400, {"ok": False, "erro": "Use de 4 a 6 números."}
    para = str(para or "")
    if para != "gestor" and not any(v.get("id") == para for v in _docs(c, s["empresa"], "vendedores")):
        return 404, {"ok": False, "erro": "Vendedor não encontrado. Salve o vendedor antes de criar a senha."}
    tipo = "gestor" if para == "gestor" else "vendedor"
    c.execute("INSERT INTO rural_acessos(empresa, id, tipo, pin) VALUES(?,?,?,?) "
              "ON CONFLICT(empresa, id) DO UPDATE SET pin=excluded.pin, falhas=0, bloqueio=0", (s["empresa"], para, tipo, lgapi.hash_senha(pin)))
    if tipo == "vendedor":   # senha nova do vendedor: ele entra de novo em todos os aparelhos
        c.execute("DELETE FROM rural_sessoes WHERE empresa=? AND quem=? AND tipo='vendedor'", (s["empresa"], para))
    seq = _prox_seq(c, s["empresa"])   # o selo "tem senha" muda para todos
    c.execute("UPDATE rural_docs SET seq=? WHERE empresa=? AND col='vendedores' AND id=?", (seq, s["empresa"], para))
    return 200, {"ok": True}


# ---------------------------------------------------------------- o que cada um vê
def _contexto(c, s):
    """Para vendedor: ids que ele pode ver."""
    me = s["quem"]
    rotas = [r for r in _docs(c, s["empresa"], "rotas") if r.get("vendedorId") == me]
    pontos = {p for r in rotas for p in (r.get("pontos") or [])}
    saidas = {x.get("id") for x in _docs(c, s["empresa"], "saidas") if x.get("vendedorId") == me}
    return {"rotas": {r.get("id") for r in rotas}, "pontos": pontos, "saidas": saidas}


def _ve(s, ctx, col, obj):
    if s["tipo"] == "gestor":
        return True
    if col not in COLS_VENDEDOR or not isinstance(obj, dict):
        return False
    me = s["quem"]
    if col == "vendedores":
        return obj.get("id") == me
    if col == "produtos":
        return True
    if col == "pontos":
        return obj.get("id") in ctx["pontos"]
    if col == "rotas":
        return obj.get("vendedorId") == me
    if col == "saidas":
        return obj.get("vendedorId") == me
    if col in ("fiados", "comprovantes"):
        return obj.get("saidaId") in ctx["saidas"]
    if col == "pedidos":
        return obj.get("pontoId") in ctx["pontos"]
    return False


def _para_cliente(c, s, col, obj, ac=None):
    """Tira o que não deve sair do servidor e marca quem tem senha."""
    if col == "vendedores":
        obj = dict(obj)
        obj.pop("pin", None)
        if ac is not None:
            a = ac.get(obj.get("id"))
            obj["pin"] = bool(a and a["pin"])
    return obj


def dados(c, s):
    ctx = _contexto(c, s) if s["tipo"] == "vendedor" else None
    ac = _acessos(c, s["empresa"])
    out = []
    for r in c.execute("SELECT col, id, json FROM rural_docs WHERE empresa=? AND apagado=0", (s["empresa"],)):
        try:
            obj = json.loads(r["json"])
        except Exception:
            continue
        if _ve(s, ctx, r["col"], obj):
            out.append({"col": r["col"], "id": r["id"], "json": json.dumps(_para_cliente(c, s, r["col"], obj, ac), ensure_ascii=False, separators=(",", ":"))})
    return {"ok": True, "seq": _seq_atual(c, s["empresa"]), "completo": True, "docs": out}


def mudancas(c, s, desde):
    seq = _seq_atual(c, s["empresa"])
    if seq <= desde:
        return None
    if s["tipo"] == "vendedor":
        return dados(c, s)   # vendedor: pouca coisa; manda tudo o que ele vê (assim some o que deixou de ser dele)
    ac = _acessos(c, s["empresa"])
    out = []
    for r in c.execute("SELECT col, id, json, apagado FROM rural_docs WHERE empresa=? AND seq>?", (s["empresa"], desde)):
        if r["apagado"]:
            out.append({"col": r["col"], "id": r["id"], "apagado": True})
            continue
        try:
            obj = json.loads(r["json"])
        except Exception:
            continue
        out.append({"col": r["col"], "id": r["id"], "json": json.dumps(_para_cliente(c, s, r["col"], obj, ac), ensure_ascii=False, separators=(",", ":"))})
    return {"ok": True, "seq": seq, "completo": False, "docs": out}


# ---------------------------------------------------------------- gravar
def _pode_gravar(c, s, ctx, col, atual, novo):
    """Regras do vendedor (o gestor pode tudo). atual/novo: dict ou None (apagar)."""
    if s["tipo"] == "gestor":
        return True
    me = s["quem"]
    if col == "saidas":
        if atual is not None and atual.get("vendedorId") != me:
            return False
        if novo is None:
            return False   # só o gestor exclui saída
        if novo.get("vendedorId") != me:
            return False
        st_ant = (atual or {}).get("status") or "aberta"
        st_novo = novo.get("status") or "aberta"
        if st_ant != "aberta":
            return False   # entregue/conferida: travada para o vendedor
        if st_novo not in ("aberta", "entregue"):
            return False
        return True
    if col in ("fiados", "comprovantes"):
        for o in (atual, novo):
            if o is not None and o.get("saidaId") not in ctx["saidas"]:
                return False
        if col == "fiados" and novo is not None and novo.get("pago") and not (atual or {}).get("pago"):
            return False
        return True
    if col == "pedidos":
        for o in (atual, novo):
            if o is not None and o.get("pontoId") not in ctx["pontos"]:
                return False
        return novo is not None or (atual or {}).get("criadoPor") == me
    return False


def _juntar(atual, base, novo):
    """Junta por campo: o que mudou do 'base' para o 'novo' vai por cima do que está no servidor."""
    if atual is None or base is None or novo is None:
        return novo
    out = dict(atual)
    for k in set(base) | set(novo):
        if base.get(k) != novo.get(k):
            if k in novo:
                out[k] = novo[k]
            else:
                out.pop(k, None)
    return out


def gravar(c, s, docs):
    empresa = s["empresa"]
    ctx = _contexto(c, s) if s["tipo"] == "vendedor" else None
    ac = _acessos(c, empresa)
    feitos, recusados, ajustados = [], [], []
    mudou = False
    for d in docs[:500]:
        col, did = str(d.get("col", "")), str(d.get("id", ""))[:80]
        if col not in COLS or not did:
            continue
        r = c.execute("SELECT json, apagado FROM rural_docs WHERE empresa=? AND col=? AND id=?", (empresa, col, did)).fetchone()
        atual = None
        if r and not r["apagado"]:
            try:
                atual = json.loads(r["json"])
            except Exception:
                atual = None
        apagar = bool(d.get("apagar"))
        try:
            novo = None if apagar else json.loads(d.get("json") or "null")
            base = json.loads(d["base"]) if d.get("base") else None
        except Exception:
            continue
        if not apagar and not isinstance(novo, dict):
            continue
        if novo is not None:
            novo["id"] = did
            if col == "vendedores":
                novo.pop("pin", None)
            if base is not None and col == "vendedores":
                base.pop("pin", None)
        final = None if apagar else (_juntar(atual, base, novo) if atual is not None and base is not None and _norm(atual) != _norm(base) else novo)
        if not _pode_gravar(c, s, ctx, col, atual, final):
            recusados.append({"col": col, "id": did, "json": json.dumps(_para_cliente(c, s, col, atual, ac), ensure_ascii=False, separators=(",", ":")) if atual is not None and _ve(s, ctx, col, atual) else None})
            continue
        seq = _prox_seq(c, empresa)
        if apagar:
            if atual is None:
                continue
            c.execute("UPDATE rural_docs SET apagado=1, json=NULL, seq=?, quando=?, por=? WHERE empresa=? AND col=? AND id=?",
                      (seq, time.time(), s["quem"], empresa, col, did))
            if col == "vendedores":
                c.execute("DELETE FROM rural_acessos WHERE empresa=? AND id=?", (empresa, did))
                c.execute("DELETE FROM rural_sessoes WHERE empresa=? AND quem=?", (empresa, did))
        else:
            txt = json.dumps(final, ensure_ascii=False, separators=(",", ":"))
            c.execute("INSERT INTO rural_docs(empresa, col, id, json, seq, apagado, quando, por) VALUES(?,?,?,?,?,0,?,?) "
                      "ON CONFLICT(empresa, col, id) DO UPDATE SET json=excluded.json, seq=excluded.seq, apagado=0, quando=excluded.quando, por=excluded.por",
                      (empresa, col, did, txt, seq, time.time(), s["quem"]))
            if final is not novo:
                ajustados.append({"col": col, "id": did, "json": json.dumps(_para_cliente(c, s, col, final, ac), ensure_ascii=False, separators=(",", ":"))})
            if s["tipo"] == "vendedor" and col == "saidas":
                ctx["saidas"].add(did)
        feitos.append({"col": col, "id": did})
        mudou = True
    return {"ok": True, "seq": _seq_atual(c, empresa), "feitos": feitos, "recusados": recusados, "ajustados": ajustados}, mudou


def _norm(o):
    return json.dumps(o, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------- posições (trajeto do vendedor)
def guardar_posicoes(c, s, pontos):
    if s["tipo"] != "vendedor":
        return 0
    n = 0
    agora = time.time() * 1000
    for p in pontos[:1000]:
        try:
            t, lat, lng = float(p["t"]), float(p["lat"]), float(p["lng"])
        except Exception:
            continue
        if not (-90 <= lat <= 90 and -180 <= lng <= 180) or t > agora + 600_000 or t < agora - POS_DIAS * 86400_000:
            continue
        prec = p.get("prec")
        try:
            prec = round(float(prec), 1) if prec is not None else None
        except Exception:
            prec = None
        c.execute("INSERT OR IGNORE INTO rural_pos(empresa, vendedor, t, lat, lng, prec, saida, ev) VALUES(?,?,?,?,?,?,?,?)",
                  (s["empresa"], s["quem"], t, round(lat, 6), round(lng, 6), prec, str(p.get("saida") or "")[:60] or None, str(p.get("ev") or "")[:160] or None))
        n += 1
    if time.time() - _estado["limpeza"] > 86400:
        _estado["limpeza"] = time.time()
        c.execute("DELETE FROM rural_pos WHERE t < ?", ((time.time() - POS_DIAS * 86400) * 1000,))
    return n


def trajeto(c, s, vendedor, de, ate):
    if s["tipo"] == "vendedor" and vendedor != s["quem"]:
        return None
    rows = c.execute("SELECT t, lat, lng, prec, saida, ev FROM rural_pos WHERE empresa=? AND vendedor=? AND t>=? AND t<? ORDER BY t LIMIT 5000",
                     (s["empresa"], vendedor, de, ate))
    return [dict(r) for r in rows]


def aovivo(c, s):
    if s["tipo"] != "gestor":
        return None
    out = {}
    for r in c.execute("SELECT vendedor, MAX(t) AS t FROM rural_pos WHERE empresa=? GROUP BY vendedor", (s["empresa"],)):
        p = c.execute("SELECT t, lat, lng, prec, ev FROM rural_pos WHERE empresa=? AND vendedor=? AND t=?", (s["empresa"], r["vendedor"], r["t"])).fetchone()
        if p:
            out[r["vendedor"]] = dict(p)
    return out


# ---------------------------------------------------------------- manifest (o app instalado abre já na horta certa)
def manifest(empresa, base="/"):
    """base: pasta onde o app está (/ no endereço próprio, /rural/ no endereço de testes)."""
    e = empresa if empresa in empresas() else ""
    base = base if re.fullmatch(r"/([a-z0-9-]+/)?", base or "") else "/"
    inicio = base + ("?e=" + e if e else "")
    return {
        "name": "LegislaGov Rural", "short_name": "LG Rural",
        "description": "Gestão da horta: saídas, rotas de entrega, pedidos, fiado e acompanhamento dos vendedores.",
        "lang": "pt-BR", "id": inicio, "start_url": inicio, "scope": base, "display": "standalone", "orientation": "portrait",
        "background_color": "#f4f6f1", "theme_color": "#2f6b3a",
        "icons": [{"src": base + "icone-192.png", "sizes": "192x192", "type": "image/png"},
                  {"src": base + "icone-512.png", "sizes": "512x512", "type": "image/png"},
                  {"src": base + "icone-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}],
    }


# ---------------------------------------------------------------- HTTP
def _avisar():
    with _aviso:
        _aviso.notify_all()


def _resp(h, cod, dados_):
    corpo = json.dumps(dados_, ensure_ascii=False).encode("utf-8")
    h.send_response(cod)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(corpo)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(corpo)
    return True


def _q(h):
    from urllib.parse import parse_qs
    q = parse_qs(h.path.split("?", 1)[1] if "?" in h.path else "")
    return {k: v[0] for k, v in q.items()}


def rota(h, metodo):
    """Chamado pelo server.py. Devolve True se a rota é do Rural (e já respondeu)."""
    caminho = h.path.split("?", 1)[0]
    if not caminho.startswith("/api/rural/"):
        return False
    if not lgapi.ativo():
        return _resp(h, 503, {"ok": False, "erro": "Banco de dados desligado neste servidor."})
    acao = caminho[len("/api/rural/"):].strip("/")
    q = _q(h)
    corpo = {}
    if metodo == "POST":
        tam = int(h.headers.get("Content-Length", "0") or 0)
        if tam > 8_000_000:
            return _resp(h, 413, {"ok": False, "erro": "Conteúdo grande demais."})
        try:
            corpo = json.loads(h.rfile.read(tam).decode("utf-8") or "{}") if tam > 0 else {}
        except Exception:
            return _resp(h, 400, {"ok": False, "erro": "Pedido inválido."})
    try:
        # ---------- sem login
        if acao == "manifest.json" and metodo == "GET":
            corpo_m = json.dumps(manifest(q.get("e", ""), q.get("b", "/")), ensure_ascii=False).encode("utf-8")
            h.send_response(200)
            h.send_header("Content-Type", "application/manifest+json; charset=utf-8")
            h.send_header("Content-Length", str(len(corpo_m)))
            h.send_header("Cache-Control", "no-cache")
            h.end_headers()
            h.wfile.write(corpo_m)
            return True
        if acao in ("entrada", "primeiro", "entrar"):
            empresa = str((q.get("e") if metodo == "GET" else corpo.get("e")) or "").strip().lower()
            if empresa not in empresas():
                return _resp(h, 404, {"ok": False, "erro": "Código da horta não encontrado. Confira o link que você recebeu."})
            with lgapi._trava:
                c = _db()
                if acao == "entrada" and metodo == "GET":
                    return _resp(h, 200, entrada(c, empresa))
                if acao == "primeiro" and metodo == "POST":
                    cod, r = primeiro(c, empresa, corpo.get("pin"))
                    if cod == 200:
                        lgapi.registrar("rural:" + empresa, "gestor", "Rural: senha do gestor criada", "", _ip(h))
                    return _resp(h, cod, r)
                if acao == "entrar" and metodo == "POST":
                    cod, r = entrar(c, empresa, corpo.get("quem"), corpo.get("pin"))
                    lgapi.registrar("rural:" + empresa, str(corpo.get("quem"))[:40], "Rural: entrou" if cod == 200 else "Rural: senha errada", "", _ip(h))
                    return _resp(h, cod, r)
            return _resp(h, 405, {"ok": False})

        # ---------- com login
        auth = h.headers.get("Authorization", "")
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
        with lgapi._trava:
            c = _db()
            s = sessao(c, token)
        if not s:
            return _resp(h, 401, {"ok": False, "erro": "Sua sessão terminou. Entre de novo."})

        if acao == "dados" and metodo == "GET":
            with lgapi._trava:
                return _resp(h, 200, dados(_db(), s))
        if acao == "mudancas" and metodo == "GET":
            try:
                desde = int(q.get("desde", "0"))
            except ValueError:
                desde = 0
            fim = time.time() + ESPERA
            while True:
                with lgapi._trava:
                    r = mudancas(_db(), s, desde)
                if r is not None:
                    return _resp(h, 200, r)
                resta = fim - time.time()
                if resta <= 0:
                    return _resp(h, 200, {"ok": True, "seq": desde, "completo": False, "docs": []})
                with _aviso:
                    _aviso.wait(min(resta, 10))
        if acao == "gravar" and metodo == "POST":
            with lgapi._trava:
                r, mudou = gravar(_db(), s, corpo.get("docs") or [])
            if mudou:
                _avisar()
            return _resp(h, 200, r)
        if acao == "senha" and metodo == "POST":
            with lgapi._trava:
                cod, r = definir_pin(_db(), s, corpo.get("para"), corpo.get("pin"))
                if cod == 200:
                    lgapi.registrar("rural:" + s["empresa"], s["quem"], "Rural: senha definida", str(corpo.get("para"))[:40], _ip(h))
            if cod == 200:
                _avisar()
            return _resp(h, cod, r)
        if acao == "sair" and metodo == "POST":
            with lgapi._trava:
                _db().execute("DELETE FROM rural_sessoes WHERE token=?", (_resumo(token),))
            return _resp(h, 200, {"ok": True})
        if acao == "posicoes" and metodo == "POST":
            with lgapi._trava:
                n = guardar_posicoes(_db(), s, corpo.get("pontos") or [])
            return _resp(h, 200, {"ok": True, "guardados": n})
        if acao == "trajeto" and metodo == "GET":
            try:
                de, ate = float(q.get("de", 0)), float(q.get("ate", 0))
            except ValueError:
                return _resp(h, 400, {"ok": False})
            with lgapi._trava:
                r = trajeto(_db(), s, q.get("vendedor", ""), de, ate)
            if r is None:
                return _resp(h, 403, {"ok": False, "erro": "Sem permissão."})
            return _resp(h, 200, {"ok": True, "pontos": r})
        if acao == "aovivo" and metodo == "GET":
            with lgapi._trava:
                r = aovivo(_db(), s)
            if r is None:
                return _resp(h, 403, {"ok": False, "erro": "Sem permissão."})
            return _resp(h, 200, {"ok": True, "ultimas": r, "agora": time.time() * 1000})
        return _resp(h, 404, {"ok": False, "erro": "Rota não encontrada."})
    except Exception as erro:
        print("rural:", caminho, repr(erro), flush=True)
        return _resp(h, 400, {"ok": False, "erro": "Não foi possível concluir: " + str(erro)[:160]})


def _ip(h):
    return (h.headers.get("X-Forwarded-For") or h.client_address[0]).split(",")[0].strip()
