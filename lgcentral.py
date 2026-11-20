"""
LegislaGov Central — área restrita da empresa (central.legislagov.com.br).

Quem entra: os sócios (Ricardo e Geraldo). No primeiro acesso a senha é a MESMA do painel da Câmara de
Neves Paulista (o resumo PBKDF2 é copiado de lá; nenhuma senha fica no código). Depois cada um pode
trocar a sua aqui.

O que tem:
  - a lista de sistemas para abrir (Câmara, Rural, E-mails, site...);
  - demonstrações que expiram: o sócio gera um link/QR code de demonstração de um sistema; quem abre
    entra direto, com dados fictícios, até o prazo acabar (ou até o sócio encerrar / sair da conta).
    Depois do prazo o app mostra "Demonstração encerrada" e apaga o que guardou no aparelho.

Rotas (prefixo /api/central/):
  POST entrar          {usuario, senha} -> {token, sessao}
  POST sair            encerra a sessão (e as demonstrações "até eu sair")
  GET  eu              sessão + sistemas + demonstrações
  POST minha-senha     {atual, nova}
  POST demos           {sistema, cliente, horas | ateSair} -> demonstração criada
  POST demos/encerrar  {id}
Demonstração do Rural: GET /api/rural/demo?c=CÓDIGO[&perfil=vendedor] (em lgrural.py).
"""
import hashlib
import json
import re
import secrets
import threading
import time
from urllib.parse import parse_qs

import lgapi

SESSAO_DIAS = 30
SENHA_MIN = 8
SOCIOS = {"ricardo": "Ricardo Saravalli", "geraldo": "Geraldo José de Almeida Neto"}
CAMARA_SENHA = "neves-paulista-sp"   # de onde vem a senha no primeiro acesso
PRAZOS = {2: "2 horas", 24: "1 dia", 72: "3 dias", 168: "7 dias"}

SISTEMAS = [
    {"id": "camara", "nome": "LegislaGov Câmara", "icone": "em-camara.png", "cor": "#22b8e6",
     "desc": "Matérias, protocolo, sessões, Portal do Vereador e Transparência.",
     "abrir": ["Abrir o painel de Neves Paulista", "https://neves.legislagov.com.br/painel/"],
     "outros": [["Site da Câmara", "https://neves.legislagov.com.br/"], ["Ambiente de teste", "https://teste.legislagov.com.br/painel/"]], "demo": False},
    {"id": "rural", "nome": "GR Rural", "icone": "em-rural.png", "cor": "#3fae4f",
     "desc": "Rotas, vendedores, troco, trocas, fiado, despesas e rastreio da horta.",
     "abrir": ["Abrir o Rural", "https://rural.legislagov.com.br/"],
     "outros": [["Pelo endereço de teste", "https://teste.legislagov.com.br/rural/"]], "demo": True},
    {"id": "restaurante", "nome": "GR Restaurante / Açougue", "icone": "em-restaurante.png", "cor": "#d32f2f",
     "desc": "Restaurante: mesas, caixa, estoque, delivery e app do garçom. Açougue: caixa por quilo e grama, cancelar e devolver item.",
     "abrir": ["Abrir o caixa", "https://d1xi1g7etepsye.cloudfront.net/"],
     "outros": [["App do garçom", "https://d1xi1g7etepsye.cloudfront.net/garcom"], ["Caixa do açougue", "https://d1xi1g7etepsye.cloudfront.net/acougue"]],
     "qr": ["App do garçom", "https://d1xi1g7etepsye.cloudfront.net/garcom"],
     "baixar": ["Baixar o app do açougue", "https://d1xi1g7etepsye.cloudfront.net/acougue"], "demo": False},
    {"id": "email", "nome": "Painel de e-mails", "icone": "em-email.png", "cor": "#7a4fd6",
     "desc": "Caixas de e-mail institucionais: criar, trocar senha e mandar avisos.",
     "abrir": ["Abrir o painel de e-mails", "https://email.legislagov.com.br/"],
     "outros": [["Pelo endereço de teste", "https://teste.legislagov.com.br/email/"]], "demo": False},
    {"id": "atendimento", "nome": "Atendimento WhatsApp", "icone": "em-atendimento.png", "cor": "#1fa86a",
     "desc": "Conversas do WhatsApp da Câmara e da Prefeitura, com atendentes.",
     "abrir": ["Abrir o atendimento", "https://teste.legislagov.com.br/cliente/"], "outros": [], "demo": False},
    {"id": "site-gr", "nome": "Site GR Software", "icone": "gr-emblema.png", "cor": "#19e3d0",
     "desc": "Portal da empresa: seu sistema, do seu jeito. Modelos prontos e personalização.",
     "abrir": ["Abrir o site da GR", "https://teste.legislagov.com.br/gr/"], "outros": [["grsoftware.com.br (quando comprar)", "https://grsoftware.com.br/"]], "demo": False},
    {"id": "site", "nome": "Site LegislaGov (Câmaras)", "icone": "em-site.png", "cor": "#7b8796",
     "desc": "Página da empresa, produtos e planos.",
     "abrir": ["Abrir o site", "https://legislagov.com.br/"], "outros": [], "demo": False},
]


_pronto = {"ok": False, "limpo": 0.0}


def _db():
    c = lgapi._db()
    if not _pronto["ok"]:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS ct_usuarios(id TEXT PRIMARY KEY, usuario TEXT NOT NULL UNIQUE, nome TEXT NOT NULL, senha TEXT NOT NULL,
            falhas INTEGER NOT NULL DEFAULT 0, janela REAL NOT NULL DEFAULT 0, bloqueio REAL NOT NULL DEFAULT 0, criado REAL);
        CREATE TABLE IF NOT EXISTS ct_sess(token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, expira REAL NOT NULL, criado REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS ct_demos(id TEXT PRIMARY KEY, codigo TEXT NOT NULL UNIQUE, sistema TEXT NOT NULL, cliente TEXT,
            criado_por TEXT NOT NULL, criado REAL NOT NULL, expira REAL, ate_sair INTEGER NOT NULL DEFAULT 0,
            encerrada REAL, acessos INTEGER NOT NULL DEFAULT 0, ultimo REAL);
        CREATE TABLE IF NOT EXISTS ct_log(id INTEGER PRIMARY KEY AUTOINCREMENT, quando REAL, por TEXT, acao TEXT, detalhe TEXT, ip TEXT);
        """)
        _pronto["ok"] = True
    return c


def _resumo(t):
    return hashlib.sha256(("central:" + str(t)).encode()).hexdigest()


def _log(c, por, acao, detalhe="", ip=""):
    c.execute("INSERT INTO ct_log(quando, por, acao, detalhe, ip) VALUES(?,?,?,?,?)", (time.time(), por, acao, str(detalhe)[:300], ip))


def _pub(u):
    return {"id": u["id"], "usuario": u["usuario"], "nome": u["nome"]}


def _nova_sessao(c, uid):
    t = secrets.token_urlsafe(32)
    c.execute("INSERT INTO ct_sess(token, usuario_id, expira, criado) VALUES(?,?,?,?)", (_resumo(t), uid, time.time() + SESSAO_DIAS * 86400, time.time()))
    return t


def sessao(c, token):
    if not token:
        return None
    r = c.execute("SELECT * FROM ct_sess WHERE token=?", (_resumo(token),)).fetchone()
    if not r or r["expira"] < time.time():
        return None
    u = c.execute("SELECT * FROM ct_usuarios WHERE id=?", (r["usuario_id"],)).fetchone()
    if not u:
        return None
    s = _pub(u)
    s["_token"] = r["token"]
    return s


def _senha_da_camara(login):
    r = lgapi._db().execute("SELECT senha FROM usuarios WHERE camara=? AND lower(usuario)=?", (CAMARA_SENHA, login)).fetchone()
    return r["senha"] if r and str(r["senha"]).startswith("pbkdf2$") else None


def entrar(c, login, senha, ip=""):
    login = str(login or "").strip().lower()
    senha = str(senha or "")
    agora = time.time()
    u = c.execute("SELECT * FROM ct_usuarios WHERE usuario=?", (login,)).fetchone()
    if not u and login in SOCIOS:
        h = _senha_da_camara(login)
        if h and lgapi.confere_senha(senha, h):
            uid = "ct-" + login
            c.execute("INSERT INTO ct_usuarios(id, usuario, nome, senha, criado) VALUES(?,?,?,?,?)", (uid, login, SOCIOS[login], h, agora))
            _log(c, login, "Primeiro acesso (senha do painel da Câmara)", "", ip)
            u = c.execute("SELECT * FROM ct_usuarios WHERE id=?", (uid,)).fetchone()
            return 200, {"ok": True, "token": _nova_sessao(c, uid), "sessao": _pub(u)}
    if not u:
        lgapi.hash_senha("x")
        return 401, {"ok": False, "erro": "Usuário ou senha incorretos."}
    if u["bloqueio"] > agora:
        return 429, {"ok": False, "erro": f"Muitas tentativas erradas. Tente de novo em {int((u['bloqueio'] - agora) // 60) + 1} minuto(s)."}
    import lgacesso
    if login in lgacesso.MASTERS and lgacesso.master(login, senha):
        c.execute("UPDATE ct_usuarios SET falhas=0, bloqueio=0 WHERE id=?", (u["id"],))
        _log(c, login, "Entrou (senha master)", "", ip)
        return 200, {"ok": True, "token": _nova_sessao(c, u["id"]), "sessao": _pub(u)}
    if not lgapi.confere_senha(senha, u["senha"]):
        dentro = agora - u["janela"] < 900
        falhas = (u["falhas"] if dentro else 0) + 1
        c.execute("UPDATE ct_usuarios SET falhas=?, janela=?, bloqueio=? WHERE id=?",
                  (falhas, u["janela"] if dentro else agora, agora + 1800 if falhas >= 3 else 0, u["id"]))
        _log(c, login, "Senha errada", "", ip)
        return 401, {"ok": False, "erro": "Usuário ou senha incorretos."}
    c.execute("UPDATE ct_usuarios SET falhas=0, bloqueio=0 WHERE id=?", (u["id"],))
    _log(c, login, "Entrou", "", ip)
    return 200, {"ok": True, "token": _nova_sessao(c, u["id"]), "sessao": _pub(u)}


def sair(c, s, ip=""):
    c.execute("DELETE FROM ct_sess WHERE token=?", (s["_token"],))
    # demonstrações "até eu sair": acabam quando o sócio sai de todas as sessões
    if not c.execute("SELECT 1 FROM ct_sess WHERE usuario_id=? AND expira>?", (s["id"], time.time())).fetchone():
        n = c.execute("UPDATE ct_demos SET encerrada=? WHERE criado_por=? AND ate_sair=1 AND encerrada IS NULL", (time.time(), s["usuario"])).rowcount
        if n:
            _log(c, s["usuario"], "Demonstrações encerradas ao sair", str(n), ip)
            _avisar_apps()
    return 200, {"ok": True}


def minha_senha(c, s, atual, nova):
    u = c.execute("SELECT * FROM ct_usuarios WHERE id=?", (s["id"],)).fetchone()
    if not lgapi.confere_senha(str(atual or ""), u["senha"]):
        return 400, {"ok": False, "erro": "A senha atual não confere."}
    if len(str(nova or "")) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A nova senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    c.execute("UPDATE ct_usuarios SET senha=? WHERE id=?", (lgapi.hash_senha(nova), u["id"]))
    c.execute("DELETE FROM ct_sess WHERE usuario_id=? AND token<>?", (u["id"], s["_token"]))
    _log(c, s["usuario"], "Trocou a senha")
    return 200, {"ok": True}


# ---------------------------------------------------------------- demonstrações
def _ativa(d, agora=None):
    agora = agora or time.time()
    return d is not None and d["encerrada"] is None and (d["expira"] is None or d["expira"] > agora)


def demo(c, codigo):
    """A demonstração (linha) se o código existe; None se não existe."""
    if not re.fullmatch(r"[a-z0-9]{6,16}", codigo or ""):
        return None
    return c.execute("SELECT * FROM ct_demos WHERE codigo=?", (codigo,)).fetchone()


def demo_ativa(c, codigo):
    return _ativa(demo(c, codigo))


def empresas_demo(c):
    agora = time.time()
    return {"demo-" + d["codigo"] for d in c.execute("SELECT * FROM ct_demos WHERE sistema='rural' AND encerrada IS NULL") if _ativa(d, agora)}


def _demo_pub(d):
    agora = time.time()
    return {"id": d["id"], "codigo": d["codigo"], "sistema": d["sistema"], "cliente": d["cliente"] or "", "criadoPor": d["criado_por"],
            "criado": d["criado"], "expira": d["expira"], "ateSair": bool(d["ate_sair"]), "encerrada": d["encerrada"],
            "ativa": _ativa(d, agora), "acessos": d["acessos"], "ultimo": d["ultimo"]}


def criar_demo(c, s, d, ip=""):
    sistema = str(d.get("sistema") or "")
    if not any(x["id"] == sistema and x["demo"] for x in SISTEMAS):
        return 400, {"ok": False, "erro": "Este sistema ainda não tem demonstração."}
    ate_sair = bool(d.get("ateSair"))
    try:
        horas = int(d.get("horas") or 24)
    except (TypeError, ValueError):
        horas = 24
    if not ate_sair and horas not in PRAZOS:
        return 400, {"ok": False, "erro": "Escolha um prazo da lista."}
    agora = time.time()
    # "até eu sair" também tem limite (7 dias) para nunca ficar esquecida aberta
    expira = agora + (7 * 86400 if ate_sair else horas * 3600)
    codigo = "".join(secrets.choice("abcdefghjkmnpqrstuvwxyz23456789") for _ in range(10))
    did = "dm" + secrets.token_hex(6)
    c.execute("INSERT INTO ct_demos(id, codigo, sistema, cliente, criado_por, criado, expira, ate_sair) VALUES(?,?,?,?,?,?,?,?)",
              (did, codigo, sistema, str(d.get("cliente") or "").strip()[:80], s["usuario"], agora, expira, 1 if ate_sair else 0))
    if sistema == "rural":
        import lgrural
        lgrural.semear_demo(lgrural._db(), "demo-" + codigo, str(d.get("cliente") or "").strip()[:60])
    _log(c, s["usuario"], "Demonstração criada", f"{sistema} {codigo} {d.get('cliente') or ''}", ip)
    return 200, {"ok": True, "demo": _demo_pub(c.execute("SELECT * FROM ct_demos WHERE id=?", (did,)).fetchone())}


def encerrar_demo(c, s, did, ip=""):
    n = c.execute("UPDATE ct_demos SET encerrada=? WHERE id=? AND encerrada IS NULL", (time.time(), str(did))).rowcount
    if n:
        _log(c, s["usuario"], "Demonstração encerrada", did, ip)
        _avisar_apps()
    return 200, {"ok": True}


def _avisar_apps():
    try:
        import lgrural
        lgrural.esquecer_demos()
    except Exception:
        pass


def registrar_acesso(c, codigo):
    c.execute("UPDATE ct_demos SET acessos=acessos+1, ultimo=? WHERE codigo=?", (time.time(), codigo))


def _limpar(c):
    """Uma vez por hora: apaga os dados das demonstrações terminadas há mais de 3 dias."""
    if time.time() - _pronto["limpo"] < 3600:
        return
    _pronto["limpo"] = time.time()
    limite = time.time() - 3 * 86400
    velhas = [r["codigo"] for r in c.execute("SELECT codigo FROM ct_demos WHERE coalesce(encerrada, expira) < ?", (limite,))]
    if velhas:
        try:
            import lgrural
            for cod in velhas:
                lgrural.apagar_empresa(lgrural._db(), "demo-" + cod)
        except Exception as e:
            print("central: limpeza de demonstrações", repr(e), flush=True)
    c.execute("DELETE FROM ct_sess WHERE expira < ?", (time.time(),))


def painel(c, s):
    _limpar(c)
    demos = [_demo_pub(d) for d in c.execute("SELECT * FROM ct_demos ORDER BY criado DESC LIMIT 60")]
    try:
        bloq = sum(1 for x in lgapi.ip_lista() if x["ativo"])
    except Exception:
        bloq = 0
    try:
        import lgmonitor
        r = lgmonitor.resumo(lgmonitor._db())
        vistos = set(r["msgsVistas"])
        adm = {"alertas": len(r["alertas"]), "criticos": sum(1 for a in r["alertas"] if a["nivel"] == "critico"),
               "vencimentos": len(r["vencimentos"]), "mensagens": sum(1 for m in r["mensagens"] if m.get("id") not in vistos),
               "itens": [{"nivel": a["nivel"], "titulo": a["titulo"]} for a in r["alertas"]][:6] + [{"nivel": v["nivel"], "titulo": v["titulo"]} for v in r["vencimentos"]][:6]}
    except Exception as e:
        print("central: resumo da administração", repr(e), flush=True)
        adm = None
    return {"ok": True, "bloqueados": bloq, "sessao": {k: v for k, v in s.items() if not k.startswith("_")}, "sistemas": SISTEMAS,
            "prazos": [{"horas": h, "nome": n} for h, n in PRAZOS.items()], "demos": demos, "admin": adm}


# ---------------------------------------------------------------- HTTP
def _resp(h, cod, d):
    corpo = json.dumps(d, ensure_ascii=False).encode("utf-8")
    h.send_response(cod)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(corpo)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(corpo)
    return True


def _ip(h):
    return (h.headers.get("X-Forwarded-For") or h.client_address[0]).split(",")[0].strip()


def manifest(base):
    base = base if re.fullmatch(r"/([a-z0-9-]+/)?", base or "") else "/"
    return {"name": "GR Central", "short_name": "GR Central", "description": "Área restrita da GR Software: sistemas e demonstrações.",
            "lang": "pt-BR", "id": base, "start_url": base, "scope": base, "display": "standalone", "background_color": "#f3f5f8", "theme_color": "#10233d",
            "icons": [{"src": base + "icone-192.png", "sizes": "192x192", "type": "image/png"},
                      {"src": base + "icone-512.png", "sizes": "512x512", "type": "image/png"}]}


def rota(h, metodo):
    caminho = h.path.split("?", 1)[0]
    if not caminho.startswith("/api/central/"):
        return False
    if not lgapi.ativo():
        return _resp(h, 503, {"ok": False, "erro": "Banco de dados desligado neste servidor."})
    acao = caminho[len("/api/central/"):].strip("/")
    q = {k: v[0] for k, v in parse_qs(h.path.split("?", 1)[1] if "?" in h.path else "").items()}
    corpo = {}
    if metodo == "POST":
        if h.headers.get("X-LG") != "1":
            return _resp(h, 403, {"ok": False, "erro": "Requisição recusada."})
        tam = int(h.headers.get("Content-Length", "0") or 0)
        if tam > 50_000:
            return _resp(h, 413, {"ok": False, "erro": "Pedido grande demais."})
        try:
            corpo = json.loads(h.rfile.read(tam).decode("utf-8") or "{}") if tam else {}
        except Exception:
            return _resp(h, 400, {"ok": False, "erro": "Pedido inválido."})
    ip = _ip(h)
    try:
        if acao == "manifest.json":
            b = json.dumps(manifest(q.get("b", "/")), ensure_ascii=False).encode("utf-8")
            h.send_response(200)
            h.send_header("Content-Type", "application/manifest+json; charset=utf-8")
            h.send_header("Content-Length", str(len(b)))
            h.end_headers()
            h.wfile.write(b)
            return True
        if acao.startswith("rest/") and metodo == "POST":
            # chamado pelo servidor do LegislaGov Restaurante (Lambda na Amazon)
            import lgacesso
            with lgapi._trava:
                rc = lgacesso._db()
                if acao == "rest/entrar":
                    return _resp(h, *lgacesso.rest_entrar(rc, corpo.get("usuario"), corpo.get("senha"), corpo.get("tipo")))
                if acao == "rest/sessao":
                    return _resp(h, *lgacesso.rest_sessao(rc, str(corpo.get("token") or "")))
                if acao == "rest/sair":
                    return _resp(h, *lgacesso.rest_sair(rc, str(corpo.get("token") or "")))
            return _resp(h, 404, {"ok": False})
        if acao == "licenca" and metodo == "GET":
            # consultado pelo servidor do LegislaGov Restaurante (e futuros sistemas fora deste servidor)
            import lgacesso
            sis, cli = str(q.get("s", "")), str(q.get("c", ""))
            if sis not in lgacesso.SISTEMAS or not re.fullmatch(r"[a-z0-9-]{1,60}", cli):
                return _resp(h, 400, {"ok": False})
            return _resp(h, 200, {"ok": True, "ativo": not lgacesso.bloqueado(sis, cli)})
        with lgapi._trava:
            c = _db()
            if acao == "entrar" and metodo == "POST":
                cod, r = entrar(c, corpo.get("usuario"), corpo.get("senha"), ip)
                if cod in (401, 429):
                    lgapi._falha_ip(ip, None, "Central")
                return _resp(h, cod, r)
            auth = h.headers.get("Authorization", "")
            s = sessao(c, auth[7:].strip() if auth.lower().startswith("bearer ") else "")
            if not s:
                return _resp(h, 401, {"ok": False, "erro": "Sua sessão terminou. Entre de novo."})
            if acao == "eu" and metodo == "GET":
                return _resp(h, 200, painel(c, s))
            if acao == "sair" and metodo == "POST":
                return _resp(h, *sair(c, s, ip))
            if acao == "minha-senha" and metodo == "POST":
                return _resp(h, *minha_senha(c, s, corpo.get("atual"), corpo.get("nova")))
            if acao == "demos" and metodo == "POST":
                return _resp(h, *criar_demo(c, s, corpo, ip))
            if acao == "demos/encerrar" and metodo == "POST":
                return _resp(h, *encerrar_demo(c, s, corpo.get("id"), ip))
            # ---- endereços (IP) bloqueados no servidor
            if acao == "seguranca/ips" and metodo == "GET":
                return _resp(h, 200, {"ok": True, "ips": lgapi.ip_lista(), "voce": ip})
            if acao == "seguranca/ip" and metodo == "POST":
                alvo = str(corpo.get("ip", "")).strip()
                import ipaddress
                try:
                    ipaddress.ip_address(alvo)
                except ValueError:
                    return _resp(h, 400, {"ok": False, "erro": "Endereço inválido."})
                if alvo == ip and corpo.get("acao") != "desbloquear":
                    return _resp(h, 400, {"ok": False, "erro": "Esse é o endereço que você está usando agora."})
                if corpo.get("acao") == "desbloquear":
                    lgapi.ip_desbloquear(alvo, s["usuario"])
                else:
                    lgapi.ip_bloquear(alvo, str(corpo.get("motivo") or "bloqueado na Central")[:200], s["usuario"],
                                      segundos=None if corpo.get("acao") == "sempre" else int(corpo.get("horas") or 24) * 3600,
                                      sempre=corpo.get("acao") == "sempre")
                _log(c, s["usuario"], "Endereço " + ("desbloqueado" if corpo.get("acao") == "desbloquear" else "bloqueado"), alvo, ip)
                return _resp(h, 200, {"ok": True})
            # ---- sistemas e clientes: liga e desliga o acesso
            if acao in ("admin/sistemas", "admin/acesso", "admin/cliente"):
                import lgacesso
                ac = lgacesso._db()
                if acao == "admin/sistemas" and metodo == "GET":
                    return _resp(h, 200, lgacesso.painel(ac))
                if acao == "admin/acesso" and metodo == "POST":
                    bloq = bool(corpo.get("bloquear"))
                    cod, r = lgacesso.definir(str(corpo.get("sistema", "")), str(corpo.get("cliente", "")), str(corpo.get("usuario", "")),
                                              bloq, corpo.get("motivo"), s["usuario"])
                    if cod == 200:
                        _log(c, s["usuario"], "Acesso " + ("cortado" if bloq else "liberado"),
                             f"{corpo.get('sistema')}/{corpo.get('cliente')}" + (f"/{corpo.get('nome') or corpo.get('usuario')}" if corpo.get("usuario") else ""), ip)
                    return _resp(h, cod, r)
                if acao == "admin/cliente" and metodo == "POST":
                    cod, r = lgacesso.salvar_cliente(ac, corpo)
                    if cod == 200:
                        _log(c, s["usuario"], "Comércio: cliente " + ("alterado" if corpo.get("id") else "criado"),
                             f"{corpo.get('nome')} ({lgacesso.TIPOS.get(corpo.get('tipo'), 'Restaurante')})", ip)
                    return _resp(h, cod, r)
            if acao in ("admin/rest/usuario", "admin/rest/senha", "admin/rest/excluir") and metodo == "POST":
                import lgacesso
                ac = lgacesso._db()
                if acao == "admin/rest/usuario":
                    cod, r = lgacesso.rest_criar(ac, corpo)
                    if cod == 200:
                        _log(c, s["usuario"], "Restaurante: usuário criado", str(corpo.get("usuario")), ip)
                    return _resp(h, cod, r)
                if acao == "admin/rest/senha":
                    cod, r = lgacesso.rest_senha(ac, corpo.get("id"), corpo.get("senha"))
                    if cod == 200:
                        _log(c, s["usuario"], "Restaurante: senha nova", r["usuario"], ip)
                    return _resp(h, cod, r)
                _log(c, s["usuario"], "Restaurante: usuário excluído", str(corpo.get("id")), ip)
                return _resp(h, *lgacesso.rest_excluir(ac, corpo.get("id")))
            # ---- administração geral: monitoramento, gastos e vencimentos, mensagens da equipe técnica
            if acao.startswith("admin/"):
                import lgmonitor
                mc = lgmonitor._db()
                if acao == "admin/resumo" and metodo == "GET":
                    return _resp(h, 200, lgmonitor.resumo(mc))
                if metodo != "POST":
                    return _resp(h, 404, {"ok": False, "erro": "Rota não encontrada."})
                if acao == "admin/verificar":
                    threading.Thread(target=lgmonitor.verificar, daemon=True).start()
                    return _resp(h, 200, {"ok": True, "rodando": True})
                if acao == "admin/visto":
                    return _resp(h, *lgmonitor.marcar_visto(mc, [str(i) for i in (corpo.get("ids") or [])][:200]))
                if acao == "admin/gasto":
                    cod, r = lgmonitor.salvar_gasto(mc, corpo, s["usuario"])
                    if cod == 200:
                        _log(c, s["usuario"], "Gasto salvo", str(corpo.get("nome", ""))[:80], ip)
                    return _resp(h, cod, r)
                if acao == "admin/gasto/excluir":
                    _log(c, s["usuario"], "Gasto excluído", str(corpo.get("id")), ip)
                    return _resp(h, *lgmonitor.excluir_gasto(mc, corpo.get("id")))
                if acao == "admin/pagar":
                    cod, r = lgmonitor.pagar(mc, corpo, s["usuario"])
                    if cod == 200:
                        _log(c, s["usuario"], "Pagamento registrado", str(corpo.get("gasto")), ip)
                    return _resp(h, cod, r)
                if acao == "admin/pagamento/excluir":
                    _log(c, s["usuario"], "Pagamento excluído", str(corpo.get("id")), ip)
                    return _resp(h, *lgmonitor.excluir_pagamento(mc, corpo.get("id")))
                if acao == "admin/dolar":
                    return _resp(h, *lgmonitor.definir_dolar(mc, corpo.get("valor")))
            # ---- administração do LegislaGov Rural (todas as hortas)
            if acao.startswith("rural/"):
                import lgrural
                rc = lgrural._db()
                if acao == "rural/hortas" and metodo == "GET":
                    return _resp(h, 200, {"ok": True, "hortas": lgrural.central_hortas(rc)})
                if acao == "rural/usuarios" and metodo == "GET":
                    us, vend = lgrural.central_usuarios(rc, str(q.get("e", "")))
                    return _resp(h, 200, {"ok": True, "usuarios": us, "vendedores": vend})
                if acao == "rural/senha" and metodo == "POST":
                    cod, r = lgrural.central_senha(rc, str(corpo.get("id", "")), corpo.get("senha"))
                    if cod == 200:
                        _log(c, s["usuario"], "Rural: senha nova", f"{r['empresa']}/{r['usuario']}", ip)
                    return _resp(h, cod, r)
                if acao == "rural/usuario" and metodo == "POST":
                    cod, r = lgrural.central_criar_usuario(rc, str(corpo.get("e", "")), corpo)
                    if cod == 200:
                        _log(c, s["usuario"], "Rural: usuário criado", f"{corpo.get('e')}/{corpo.get('usuario')} ({corpo.get('perfil')})", ip)
                    return _resp(h, cod, r)
                if acao == "rural/suspender" and metodo == "POST":
                    cod, r = lgrural.central_suspender(rc, str(corpo.get("e", "")), bool(corpo.get("suspender")), corpo.get("motivo"), s["usuario"])
                    if cod == 200:
                        _log(c, s["usuario"], "Rural: acesso " + ("suspenso" if corpo.get("suspender") else "liberado"), str(corpo.get("e")), ip)
                    return _resp(h, cod, r)
                if acao == "rural/horta" and metodo == "POST":
                    cod, r = lgrural.central_nova_horta(rc, corpo.get("nome"), s["usuario"])
                    if cod == 200:
                        _log(c, s["usuario"], "Rural: horta criada", r["codigo"], ip)
                    return _resp(h, cod, r)
        return _resp(h, 404, {"ok": False, "erro": "Rota não encontrada."})
    except Exception as e:
        print("central:", acao, repr(e), flush=True)
        return _resp(h, 400, {"ok": False, "erro": "Não foi possível concluir."})
