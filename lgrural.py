"""
LegislaGov Rural — servidor do app da horta (só biblioteca padrão do Python).

Usa o mesmo banco SQLite do LegislaGov (LG_BANCO=1), em tabelas próprias (rural_*):
nada das tabelas da Câmara é lido ou alterado.

Cada horta é uma "empresa" (código listado em ferramentas/aws/rural.txt). Dentro dela:
  - gestor (dono): vê e altera tudo;
  - vendedor: recebe do servidor só o que é dele (rotas, saídas, fiados e comprovantes das
    saídas dele, pedidos e fornecedores das rotas dele, produtos) e só grava isso.
Entrada por usuário e senha (PBKDF2 no servidor, bloqueio após 8 erros em 15 min). Perfis: adm (acesso
total) e padrão (vendedor: só o que é dele). O primeiro administrador é criado na primeira abertura.

Rotas (prefixo /api/rural/):
  GET  entrada[?e=CÓD]      nome da horta e se ainda falta criar o administrador (sem dados)
  POST primeiro             {e?, nome, usuario, senha} cria o 1º administrador (só enquanto não existe)
  POST entrar               {usuario, senha, e?} -> {token, sessao, empresa}
  GET/POST usuarios         listar / {id?, nome, usuario, perfil, vendedor, senha?} / {acao:'remover', id}  — adm
  POST minha-senha          {atual, nova}
  POST sair
  GET  dados                tudo o que a pessoa pode ver + seq
  GET  mudancas?desde=N     espera até 25 s por alterações (tempo real)
  POST gravar               {docs:[{col,id,json,base}|{col,id,apagar:true,base}]}
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
        CREATE TABLE IF NOT EXISTS rural_docs(empresa TEXT NOT NULL, col TEXT NOT NULL, id TEXT NOT NULL, json TEXT,
            seq INTEGER NOT NULL, apagado INTEGER NOT NULL DEFAULT 0, quando REAL, por TEXT, PRIMARY KEY(empresa, col, id));
        CREATE INDEX IF NOT EXISTS ix_rural_docs_seq ON rural_docs(empresa, seq);
        CREATE TABLE IF NOT EXISTS rural_pos(id INTEGER PRIMARY KEY AUTOINCREMENT, empresa TEXT NOT NULL, vendedor TEXT NOT NULL,
            t REAL NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, prec REAL, saida TEXT, ev TEXT, UNIQUE(empresa, vendedor, t));
        CREATE INDEX IF NOT EXISTS ix_rural_pos ON rural_pos(empresa, vendedor, t);
        CREATE TABLE IF NOT EXISTS rural_seq(empresa TEXT PRIMARY KEY, seq INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS rural_usuarios(empresa TEXT NOT NULL, id TEXT PRIMARY KEY, usuario TEXT NOT NULL UNIQUE, nome TEXT NOT NULL,
            perfil TEXT NOT NULL, vendedor TEXT NOT NULL DEFAULT '', senha TEXT NOT NULL, falhas INTEGER NOT NULL DEFAULT 0,
            janela REAL NOT NULL DEFAULT 0, bloqueio REAL NOT NULL DEFAULT 0, criado REAL);
        CREATE TABLE IF NOT EXISTS rural_sess(token TEXT PRIMARY KEY, empresa TEXT NOT NULL, usuario_id TEXT NOT NULL, expira REAL NOT NULL, criado REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS rural_empresas(codigo TEXT PRIMARY KEY, nome TEXT, bloqueada REAL, motivo TEXT, criado REAL, por TEXT);
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
        try:
            cods |= {r[0] for r in _db().execute("SELECT codigo FROM rural_empresas")}
        except Exception:
            pass
        _estado.update(empresas=cods, empresas_lidas=time.time())
    return _estado["empresas"] | _demos_ativas()


def bloqueadas():
    """Hortas com acesso suspenso pela LegislaGov (falta de pagamento etc.)."""
    if time.time() - _estado.get("bloq_lidas", 0) > 10:
        try:
            _estado["bloq"] = {r[0] for r in _db().execute("SELECT codigo FROM rural_empresas WHERE bloqueada IS NOT NULL")}
        except Exception:
            _estado["bloq"] = set()
        _estado["bloq_lidas"] = time.time()
    return _estado.get("bloq", set())


def esquecer_cadastros():
    _estado["empresas_lidas"] = 0
    _estado["bloq_lidas"] = 0


SUSPENSA = "O acesso a este sistema está suspenso. Fale com a LegislaGov."


def _demos_ativas():
    """Hortas de demonstração (criadas na Central) que ainda estão no prazo."""
    if time.time() - _estado.get("demos_lidas", 0) > 15:
        try:
            import lgcentral
            _estado["demos"] = lgcentral.empresas_demo(lgcentral._db())
        except Exception:
            _estado["demos"] = set()
        _estado["demos_lidas"] = time.time()
    return _estado.get("demos", set())


def esquecer_demos():
    _estado["demos_lidas"] = 0


# ---------------------------------------------------------------- demonstração (dados fictícios)
def _doc(c, empresa, col, obj):
    c.execute("INSERT OR REPLACE INTO rural_docs(empresa, col, id, json, seq, apagado, quando, por) VALUES(?,?,?,?,?,0,?,?)",
              (empresa, col, obj["id"], json.dumps(obj, ensure_ascii=False), _prox_seq(c, empresa), time.time(), "demonstração"))


def semear_demo(c, empresa, cliente=""):
    """Cria a horta de demonstração com dados fictícios: produtos, 2 vendedores, fornecedores, rotas,
    saídas dos últimos dias (com vendas, trocas e despesas), fiado, custos e um funcionário."""
    import datetime as dt
    if c.execute("SELECT 1 FROM rural_docs WHERE empresa=? LIMIT 1", (empresa,)).fetchone():
        return
    hoje = dt.date.today()
    dia = lambda n: (hoje - dt.timedelta(days=n)).isoformat()
    hora = lambda n, h: (dt.datetime.combine(hoje - dt.timedelta(days=n), dt.time(h, 15))).isoformat()
    _doc(c, empresa, "config", {"id": "geral", "nomeHorta": (cliente + " — demonstração") if cliente else "Horta Exemplo (demonstração)"})
    prods = [("alface", "Alface crespa", "pé", 3.5), ("rucula", "Rúcula", "maço", 3.0), ("cheiro", "Cheiro-verde", "maço", 2.5),
             ("couve", "Couve", "maço", 3.0), ("almeirao", "Almeirão", "maço", 3.0), ("espinafre", "Espinafre", "maço", 4.0)]
    for pid, nome, un, preco in prods:
        _doc(c, empresa, "produtos", {"id": "p-" + pid, "nome": nome, "unidade": un, "preco": preco})
    _doc(c, empresa, "vendedores", {"id": "v-ana", "nome": "Ana (exemplo)", "telefone": "", "veiculo": "Saveiro"})
    _doc(c, empresa, "vendedores", {"id": "v-joao", "nome": "João (exemplo)", "telefone": "", "veiculo": "Strada"})
    pontos = [("mercado-central", "Mercado Central", "Mirassol", True), ("sacolao-bom-preco", "Sacolão Bom Preço", "Mirassol", False),
              ("restaurante-sabor", "Restaurante Sabor da Terra", "Mirassol", True), ("padaria-sol", "Padaria do Sol", "Neves Paulista", False),
              ("mercadinho-ze", "Mercadinho do Zé", "Neves Paulista", True), ("feira-sabado", "Banca da Feira", "Neves Paulista", False)]
    for oid, nome, cidade, fiado in pontos:
        _doc(c, empresa, "pontos", {"id": "o-" + oid, "nome": nome, "cidade": cidade, "cep": "", "endereco": "Endereço de exemplo", "bairro": "Centro",
                                    "contato": "", "telefone": "", "doc": "", "fiado": fiado, "troca": True, "precos": {}, "prazo": 15, "ativo": True})
    _doc(c, empresa, "rotas", {"id": "r-mirassol", "nome": "Rota Mirassol", "cidade": "Mirassol", "vendedorId": "v-ana", "dias": [1, 3, 5],
                               "pontos": ["o-mercado-central", "o-sacolao-bom-preco", "o-restaurante-sabor"]})
    _doc(c, empresa, "rotas", {"id": "r-neves", "nome": "Rota Neves Paulista", "cidade": "Neves Paulista", "vendedorId": "v-joao", "dias": [2, 4, 6],
                               "pontos": ["o-padaria-sol", "o-mercadinho-ze", "o-feira-sabado"]})
    precos = {p[0]: p[3] for p in prods}
    n = 0
    for d_ in (6, 5, 4, 3, 2, 1):
        for vid, rid, pts in (("v-ana", "r-mirassol", ["mercado-central", "sacolao-bom-preco", "restaurante-sabor"]),
                              ("v-joao", "r-neves", ["padaria-sol", "mercadinho-ze", "feira-sabado"])):
            n += 1
            carga = {"alface": 60, "rucula": 30, "cheiro": 40, "couve": 25, "almeirao": 20, "espinafre": 15}
            itens = [{"produtoId": "p-" + k, "nome": next(p[1] for p in prods if p[0] == k), "unidade": next(p[2] for p in prods if p[0] == k),
                      "preco": precos[k], "qtd": q, "perda": 1 if k == "alface" else 0, "sobra": 2 if k == "rucula" else 0} for k, q in carga.items()]
            vendas = []
            for i, pt in enumerate(pts):
                frac = [0.4, 0.3, 0.25][i]
                vit = [{"produtoId": "p-" + k, "qtd": int(q * frac), "troca": 1 if (k == "alface" and i == 0) else 0, "preco": precos[k]} for k, q in carga.items()]
                vendas.append({"id": f"vd{n}-{i}", "pontoId": "o-" + pt, "itens": vit, "hora": hora(d_, 8 + i), "por": vid})
            total = sum(it["qtd"] * it["preco"] for v in vendas for it in v["itens"])
            _doc(c, empresa, "saidas", {"id": f"s{n}", "criado": time.time() - d_ * 86400, "vendedorId": vid, "data": dia(d_), "itens": itens, "rotaId": rid,
                                        "troco": 50, "vendas": vendas, "criadoPor": "gestor", "status": "fechada",
                                        "despesas": [{"tipo": "Combustível", "valor": 60, "obs": "", "litros": 10, "km": "", "hora": hora(d_, 11)}],
                                        "contado": round(total + 50 - 60, 2), "declarado": round(total + 50 - 60, 2), "entregueEm": hora(d_, 13), "conferidoEm": hora(d_, 14)})
    _doc(c, empresa, "fiados", {"id": "f1", "pontoId": "o-mercado-central", "saidaId": "s1", "valor": 85.0, "data": dia(6), "vencimento": dia(-9), "pago": False, "obs": ""})
    for i, (cat, val, desc) in enumerate((("Sementes e mudas", 180, "Mudas de alface"), ("Adubo", 240, "Adubo orgânico"), ("Água e energia", 150, "Conta do mês"))):
        _doc(c, empresa, "custos", {"id": f"c{i}", "categoria": cat, "data": dia(3 + i), "valor": val, "descricao": desc})
    _doc(c, empresa, "funcionarios", {"id": "func1", "nome": "Carlos (exemplo)", "funcao": "Plantio e colheita", "salario": 1600, "ativo": True})
    # acessos: gestor (adm) e vendedora Ana (padrão) — senhas aleatórias que ninguém usa (entra pelo link)
    for perfil, vend, nome in (("adm", "", "Gestor da demonstração"), ("padrao", "v-ana", "Ana (exemplo)")):
        login = ("demo." if perfil == "adm" else "vend.") + empresa[5:]
        c.execute("INSERT OR IGNORE INTO rural_usuarios(empresa, id, usuario, nome, perfil, vendedor, senha, criado) VALUES(?,?,?,?,?,?,?,?)",
                  (empresa, "u" + secrets.token_hex(6), login, nome, perfil, vend, "!" + secrets.token_hex(24), time.time()))
    esquecer_demos()


# ---------------------------------------------------------------- administração pela Central (Ricardo e Geraldo)
def _nome_horta(c, emp):
    cfg = next(iter(_docs(c, emp, "config")), {}) or {}
    r = c.execute("SELECT nome FROM rural_empresas WHERE codigo=?", (emp,)).fetchone()
    return cfg.get("nomeHorta") or (r["nome"] if r and r["nome"] else "") or emp


def central_hortas(c):
    out = []
    for emp in sorted(e for e in empresas() if not e.startswith("demo-") or e == "demo-rural"):
        r = c.execute("SELECT * FROM rural_empresas WHERE codigo=?", (emp,)).fetchone()
        n = c.execute("SELECT COUNT(*) FROM rural_usuarios WHERE empresa=?", (emp,)).fetchone()[0]
        ult = c.execute("SELECT MAX(criado) FROM rural_sess WHERE empresa=?", (emp,)).fetchone()[0]
        out.append({"codigo": emp, "nome": _nome_horta(c, emp), "usuarios": n, "ultimoAcesso": ult,
                    "suspensa": bool(r and r["bloqueada"]), "suspensaEm": r["bloqueada"] if r else None, "motivo": (r["motivo"] if r else "") or ""})
    return out


def central_usuarios(c, emp):
    vend = {v.get("id"): v.get("nome") for v in _docs(c, emp, "vendedores")}
    agora = time.time()
    return [{"id": u["id"], "nome": u["nome"], "usuario": u["usuario"], "perfil": u["perfil"], "vendedor": vend.get(u["vendedor"], ""),
             "bloqueado": u["bloqueio"] > agora, "criado": u["criado"]} for u in _usuarios(c, emp)], \
           [{"id": k, "nome": v} for k, v in vend.items()]


def central_senha(c, uid, senha):
    if len(str(senha or "")) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    u = c.execute("SELECT * FROM rural_usuarios WHERE id=?", (uid,)).fetchone()
    if not u:
        return 404, {"ok": False, "erro": "Usuário não encontrado."}
    c.execute("UPDATE rural_usuarios SET senha=?, falhas=0, bloqueio=0 WHERE id=?", (lgapi.hash_senha(senha), uid))
    c.execute("DELETE FROM rural_sess WHERE usuario_id=?", (uid,))
    _avisar()
    return 200, {"ok": True, "usuario": u["usuario"], "empresa": u["empresa"]}


def central_criar_usuario(c, emp, d):
    if emp not in empresas():
        return 404, {"ok": False, "erro": "Horta não encontrada."}
    return salvar_usuario(c, {"empresa": emp, "_token": ""}, {k: d.get(k) for k in ("nome", "usuario", "perfil", "vendedor", "senha")})


def central_suspender(c, emp, suspender, motivo, por):
    if emp not in empresas() or emp.startswith("demo-") and emp != "demo-rural":
        return 404, {"ok": False, "erro": "Horta não encontrada."}
    if not c.execute("SELECT 1 FROM rural_empresas WHERE codigo=?", (emp,)).fetchone():
        c.execute("INSERT INTO rural_empresas(codigo, nome, criado, por) VALUES(?,?,?,?)", (emp, "", time.time(), por))
    c.execute("UPDATE rural_empresas SET bloqueada=?, motivo=? WHERE codigo=?", (time.time() if suspender else None, str(motivo or "")[:200] if suspender else "", emp))
    esquecer_cadastros()
    _avisar()   # quem está com o app aberto recebe a resposta na hora
    return 200, {"ok": True}


def central_nova_horta(c, nome, por):
    nome = str(nome or "").strip()[:60]
    if not nome:
        return 400, {"ok": False, "erro": "Escreva o nome da horta."}
    base = re.sub(r"[^a-z0-9]+", "-", nome.lower().encode("ascii", "ignore").decode()).strip("-")[:20] or "horta"
    cod = f"{base}-{secrets.token_hex(3)}"
    c.execute("INSERT INTO rural_empresas(codigo, nome, criado, por) VALUES(?,?,?,?)", (cod, nome, time.time(), por))
    _doc(c, cod, "config", {"id": "geral", "nomeHorta": nome})
    esquecer_cadastros()
    return 200, {"ok": True, "codigo": cod}


def apagar_empresa(c, empresa):
    """Apaga todos os dados de uma horta de demonstração vencida."""
    if not empresa.startswith("demo-") or empresa == "demo-rural":
        return
    for t in ("rural_docs", "rural_pos", "rural_seq", "rural_usuarios", "rural_sess"):
        c.execute(f"DELETE FROM {t} WHERE empresa=?", (empresa,))


def entrar_demo(c, codigo, perfil):
    import lgcentral
    cc = lgcentral._db()
    d = lgcentral.demo(cc, codigo)
    if not d or d["sistema"] != "rural":
        return 404, {"ok": False, "erro": "Demonstração não encontrada."}
    if not lgcentral.demo_ativa(cc, codigo):
        return 410, {"ok": False, "encerrada": True, "erro": "Esta demonstração terminou."}
    empresa = "demo-" + codigo
    semear_demo(c, empresa, d["cliente"] or "")
    u = c.execute("SELECT * FROM rural_usuarios WHERE empresa=? AND perfil=?", (empresa, "padrao" if perfil == "vendedor" else "adm")).fetchone()
    lgcentral.registrar_acesso(cc, codigo)
    esquecer_demos()
    return 200, {"ok": True, "empresa": empresa, "token": _criar_sessao(c, empresa, u["id"]), "sessao": _sessao_de(u),
                 "demo": {"codigo": codigo, "expira": d["expira"], "ateSair": bool(d["ate_sair"])}}


def _prox_seq(c, empresa):
    c.execute("INSERT INTO rural_seq(empresa, seq) VALUES(?, 1) ON CONFLICT(empresa) DO UPDATE SET seq = seq + 1", (empresa,))
    return c.execute("SELECT seq FROM rural_seq WHERE empresa=?", (empresa,)).fetchone()[0]


def _seq_atual(c, empresa):
    r = c.execute("SELECT seq FROM rural_seq WHERE empresa=?", (empresa,)).fetchone()
    return r[0] if r else 0


def _resumo(token):
    return hashlib.sha256(("rural:" + str(token)).encode()).hexdigest()


# ---------------------------------------------------------------- acesso (usuário e senha)
# perfil 'adm'    = acesso total (tipo "gestor" no app)
# perfil 'padrao' = vendedor: só as rotas, saídas, pedidos e fornecedores dele (tipo "vendedor")
SENHA_MIN = 8


def _docs(c, empresa, col):
    out = []
    for r in c.execute("SELECT id, json FROM rural_docs WHERE empresa=? AND col=? AND apagado=0", (empresa, col)):
        try:
            out.append(json.loads(r["json"]))
        except Exception:
            pass
    return out


def _usuarios(c, empresa):
    return [dict(r) for r in c.execute("SELECT * FROM rural_usuarios WHERE empresa=? ORDER BY nome", (empresa,))]


def _empresa_padrao():
    try:
        with open(ARQ_EMPRESAS, encoding="utf-8") as f:
            for linha in f:
                p = linha.split("#", 1)[0].split()
                if p and p[0] in empresas():
                    return p[0]
    except OSError:
        pass
    return ""


def entrada(c, empresa):
    cfg = next(iter(_docs(c, empresa, "config")), {}) or {}
    tem_adm = c.execute("SELECT 1 FROM rural_usuarios WHERE empresa=? AND perfil='adm' LIMIT 1", (empresa,)).fetchone()
    return {"ok": True, "empresa": empresa, "nome": cfg.get("nomeHorta") or "", "primeiroAcesso": not tem_adm, "suspensa": empresa in bloqueadas()}


def _criar_sessao(c, empresa, uid):
    token = secrets.token_urlsafe(32)
    agora = time.time()
    c.execute("INSERT INTO rural_sess(token, empresa, usuario_id, expira, criado) VALUES(?,?,?,?,?)",
              (_resumo(token), empresa, uid, agora + SESSAO_DIAS * 86400, agora))
    return token


def _sessao_de(u):
    adm = u["perfil"] == "adm"
    return {"tipo": "gestor" if adm else "vendedor", "id": "gestor" if adm else u["vendedor"], "nome": u["nome"],
            "usuario": u["usuario"], "perfil": u["perfil"], "uid": u["id"]}


def sessao(c, token):
    if not token:
        return None
    r = c.execute("SELECT * FROM rural_sess WHERE token=?", (_resumo(token),)).fetchone()
    if not r or r["expira"] < time.time() or r["empresa"] not in empresas() or r["empresa"] in bloqueadas():
        return None
    u = c.execute("SELECT * FROM rural_usuarios WHERE empresa=? AND id=?", (r["empresa"], r["usuario_id"])).fetchone()
    if not u or (u["perfil"] != "adm" and not u["vendedor"]):
        return None   # usuário removido ou sem vendedor
    if r["expira"] - time.time() < (SESSAO_DIAS - 1) * 86400:
        c.execute("UPDATE rural_sess SET expira=? WHERE token=?", (time.time() + SESSAO_DIAS * 86400, r["token"]))
    sd = _sessao_de(u)
    return {"empresa": r["empresa"], "quem": sd["id"], "tipo": sd["tipo"], "uid": u["id"], "nome": u["nome"]}


def _login_ok(login):
    return bool(re.fullmatch(r"[A-Za-zÀ-ÿ0-9._@-]{2,40}", login or ""))


def _login_livre(c, login, menos_id=None):
    r = c.execute("SELECT id FROM rural_usuarios WHERE usuario=?", (login.lower(),)).fetchone()
    return not r or r["id"] == menos_id


def primeiro(c, empresa, nome, login, senha):
    if c.execute("SELECT 1 FROM rural_usuarios WHERE empresa=? AND perfil='adm' LIMIT 1", (empresa,)).fetchone():
        return 409, {"ok": False, "erro": "O administrador já foi criado. Entre com o usuário e a senha."}
    login = str(login or "").strip()
    nome = str(nome or "").strip()[:60] or login
    if not _login_ok(login):
        return 400, {"ok": False, "erro": "Usuário: use de 2 a 40 letras ou números, sem espaço."}
    if len(str(senha or "")) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    if not _login_livre(c, login):
        return 409, {"ok": False, "erro": "Este nome de usuário já existe. Escolha outro."}
    uid = "u" + secrets.token_hex(6)
    c.execute("INSERT INTO rural_usuarios(empresa, id, usuario, nome, perfil, vendedor, senha, criado) VALUES(?,?,?,?, 'adm', '', ?, ?)",
              (empresa, uid, login.lower(), nome, lgapi.hash_senha(senha), time.time()))
    u = c.execute("SELECT * FROM rural_usuarios WHERE id=?", (uid,)).fetchone()
    return 200, {"ok": True, "empresa": empresa, "token": _criar_sessao(c, empresa, uid), "sessao": _sessao_de(u)}


def entrar(c, empresa, login, senha):
    login = str(login or "").strip().lower()
    u = c.execute("SELECT * FROM rural_usuarios WHERE usuario=?" + (" AND empresa=?" if empresa else ""),
                  (login, empresa) if empresa else (login,)).fetchone()
    agora = time.time()
    if not u or u["empresa"] not in empresas():
        lgapi.hash_senha("x")   # mesmo tempo de resposta de um usuário que existe
        return 401, {"ok": False, "erro": "Usuário ou senha incorretos."}
    if u["empresa"] in bloqueadas():
        return 423, {"ok": False, "suspensa": True, "erro": SUSPENSA}
    if u["bloqueio"] > agora:
        minutos = int((u["bloqueio"] - agora) // 60) + 1
        return 429, {"ok": False, "erro": f"Muitas tentativas erradas. Tente de novo em {minutos} minuto(s)."}
    if not lgapi.confere_senha(str(senha or ""), u["senha"]):
        dentro = agora - u["janela"] < 900
        falhas = (u["falhas"] if dentro else 0) + 1
        bloqueio = agora + 1800 if falhas >= 3 else 0
        c.execute("UPDATE rural_usuarios SET falhas=?, janela=?, bloqueio=? WHERE id=?", (falhas, u["janela"] if dentro else agora, bloqueio, u["id"]))
        if bloqueio:
            return 429, {"ok": False, "erro": "Muitas tentativas erradas. Espere 15 minutos e tente de novo."}
        return 401, {"ok": False, "erro": "Usuário ou senha incorretos."}
    if u["perfil"] != "adm" and not u["vendedor"]:
        return 403, {"ok": False, "erro": "Este usuário ainda não está ligado a um vendedor. Fale com o administrador."}
    c.execute("UPDATE rural_usuarios SET falhas=0, bloqueio=0 WHERE id=?", (u["id"],))
    return 200, {"ok": True, "empresa": u["empresa"], "token": _criar_sessao(c, u["empresa"], u["id"]), "sessao": _sessao_de(u)}


def listar_usuarios(c, s):
    return [{"id": u["id"], "usuario": u["usuario"], "nome": u["nome"], "perfil": u["perfil"], "vendedor": u["vendedor"]}
            for u in _usuarios(c, s["empresa"])]


def salvar_usuario(c, s, d):
    """Administrador cria ou altera um usuário. Senha vazia na alteração = mantém."""
    emp = s["empresa"]
    uid = str(d.get("id") or "")
    atual = c.execute("SELECT * FROM rural_usuarios WHERE empresa=? AND id=?", (emp, uid)).fetchone() if uid else None
    if uid and not atual:
        return 404, {"ok": False, "erro": "Usuário não encontrado."}
    login = str(d.get("usuario") or "").strip()
    nome = str(d.get("nome") or "").strip()[:60]
    perfil = "adm" if d.get("perfil") == "adm" else "padrao"
    vendedor = str(d.get("vendedor") or "") if perfil == "padrao" else ""
    senha = str(d.get("senha") or "")
    if not nome:
        return 400, {"ok": False, "erro": "Informe o nome."}
    if not _login_ok(login):
        return 400, {"ok": False, "erro": "Usuário: use de 2 a 40 letras ou números, sem espaço."}
    if not _login_livre(c, login, uid or None):
        return 409, {"ok": False, "erro": "Este nome de usuário já existe. Escolha outro."}
    if atual and senha:
        return 403, {"ok": False, "erro": "Para trocar a senha de alguém, fale com a LegislaGov."}
    if (not atual or senha) and len(senha) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    if perfil == "padrao":
        if not any(v.get("id") == vendedor for v in _docs(c, emp, "vendedores")):
            return 400, {"ok": False, "erro": "Escolha o vendedor deste usuário (ele vai ver só as rotas desse vendedor)."}
        outro = c.execute("SELECT nome FROM rural_usuarios WHERE empresa=? AND vendedor=? AND id<>?", (emp, vendedor, uid)).fetchone()
        if outro:
            return 409, {"ok": False, "erro": f"Esse vendedor já tem o usuário de {outro['nome']}."}
    if atual and atual["perfil"] == "adm" and perfil != "adm":
        n = c.execute("SELECT COUNT(*) FROM rural_usuarios WHERE empresa=? AND perfil='adm'", (emp,)).fetchone()[0]
        if n <= 1:
            return 400, {"ok": False, "erro": "Precisa existir pelo menos um administrador."}
    if atual:
        c.execute("UPDATE rural_usuarios SET usuario=?, nome=?, perfil=?, vendedor=? WHERE id=?", (login.lower(), nome, perfil, vendedor, uid))
        if senha:
            c.execute("UPDATE rural_usuarios SET senha=?, falhas=0, bloqueio=0 WHERE id=?", (lgapi.hash_senha(senha), uid))
            c.execute("DELETE FROM rural_sess WHERE usuario_id=? AND token<>?", (uid, s.get("_token", "")))
    else:
        uid = "u" + secrets.token_hex(6)
        c.execute("INSERT INTO rural_usuarios(empresa, id, usuario, nome, perfil, vendedor, senha, criado) VALUES(?,?,?,?,?,?,?,?)",
                  (emp, uid, login.lower(), nome, perfil, vendedor, lgapi.hash_senha(senha), time.time()))
    _marcar_vendedores(c, emp)
    return 200, {"ok": True, "id": uid}


def remover_usuario(c, s, uid):
    emp = s["empresa"]
    u = c.execute("SELECT * FROM rural_usuarios WHERE empresa=? AND id=?", (emp, uid)).fetchone()
    if not u:
        return 404, {"ok": False, "erro": "Usuário não encontrado."}
    if u["perfil"] == "adm" and c.execute("SELECT COUNT(*) FROM rural_usuarios WHERE empresa=? AND perfil='adm'", (emp,)).fetchone()[0] <= 1:
        return 400, {"ok": False, "erro": "Precisa existir pelo menos um administrador."}
    c.execute("DELETE FROM rural_usuarios WHERE id=?", (uid,))
    c.execute("DELETE FROM rural_sess WHERE usuario_id=?", (uid,))
    _marcar_vendedores(c, emp)
    return 200, {"ok": True}


def minha_senha(c, s, atual, nova):
    return 403, {"ok": False, "erro": "Para trocar a sua senha, fale com a LegislaGov."}
    u = c.execute("SELECT * FROM rural_usuarios WHERE id=?", (s["uid"],)).fetchone()
    if not u or not lgapi.confere_senha(str(atual or ""), u["senha"]):
        return 401, {"ok": False, "erro": "A senha atual não confere."}
    if len(str(nova or "")) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha nova precisa ter pelo menos {SENHA_MIN} caracteres."}
    c.execute("UPDATE rural_usuarios SET senha=? WHERE id=?", (lgapi.hash_senha(nova), u["id"]))
    c.execute("DELETE FROM rural_sess WHERE usuario_id=? AND token<>?", (u["id"], s.get("_token", "")))
    return 200, {"ok": True}


def _marcar_vendedores(c, emp):
    """O selo "tem acesso ao app" dos vendedores muda para todos."""
    seq = _prox_seq(c, emp)
    c.execute("UPDATE rural_docs SET seq=? WHERE empresa=? AND col='vendedores' AND apagado=0", (seq, emp))


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
    """Tira o que não deve sair do servidor e marca quem tem usuário no app."""
    if col == "vendedores":
        obj = dict(obj)
        obj.pop("pin", None)
        obj.pop("usuarioApp", None)
        if ac is not None:
            login = ac.get(obj.get("id"))
            obj["pin"] = bool(login)
            if login and s["tipo"] == "gestor":
                obj["usuarioApp"] = login
    return obj


def _ac(c, empresa):
    return {u["vendedor"]: u["usuario"] for u in _usuarios(c, empresa) if u["vendedor"]}


def dados(c, s):
    ctx = _contexto(c, s) if s["tipo"] == "vendedor" else None
    ac = _ac(c, s["empresa"])
    out = []
    for r in c.execute("SELECT col, id, json, seq FROM rural_docs WHERE empresa=? AND apagado=0", (s["empresa"],)):
        try:
            obj = json.loads(r["json"])
        except Exception:
            continue
        if _ve(s, ctx, r["col"], obj):
            out.append({"col": r["col"], "id": r["id"], "seq": r["seq"], "json": json.dumps(_para_cliente(c, s, r["col"], obj, ac), ensure_ascii=False, separators=(",", ":"))})
    return {"ok": True, "seq": _seq_atual(c, s["empresa"]), "completo": True, "docs": out}


def mudancas(c, s, desde):
    seq = _seq_atual(c, s["empresa"])
    if seq <= desde:
        return None
    if s["tipo"] == "vendedor":
        return dados(c, s)   # vendedor: pouca coisa; manda tudo o que ele vê (assim some o que deixou de ser dele)
    ac = _ac(c, s["empresa"])
    out = []
    for r in c.execute("SELECT col, id, json, apagado, seq FROM rural_docs WHERE empresa=? AND seq>?", (s["empresa"], desde)):
        if r["apagado"]:
            out.append({"col": r["col"], "id": r["id"], "seq": r["seq"], "apagado": True})
            continue
        try:
            obj = json.loads(r["json"])
        except Exception:
            continue
        out.append({"col": r["col"], "id": r["id"], "seq": r["seq"], "json": json.dumps(_para_cliente(c, s, r["col"], obj, ac), ensure_ascii=False, separators=(",", ":"))})
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
    ac = _ac(c, empresa)
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
                novo.pop("pin", None); novo.pop("usuarioApp", None)
            if base is not None and col == "vendedores":
                base.pop("pin", None); base.pop("usuarioApp", None)
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
            if col == "vendedores":   # vendedor excluído: o usuário dele deixa de entrar
                for u in c.execute("SELECT id FROM rural_usuarios WHERE empresa=? AND vendedor=?", (empresa, did)).fetchall():
                    c.execute("DELETE FROM rural_sess WHERE usuario_id=?", (u["id"],))
                c.execute("DELETE FROM rural_usuarios WHERE empresa=? AND vendedor=?", (empresa, did))
        else:
            txt = json.dumps(final, ensure_ascii=False, separators=(",", ":"))
            c.execute("INSERT INTO rural_docs(empresa, col, id, json, seq, apagado, quando, por) VALUES(?,?,?,?,?,0,?,?) "
                      "ON CONFLICT(empresa, col, id) DO UPDATE SET json=excluded.json, seq=excluded.seq, apagado=0, quando=excluded.quando, por=excluded.por",
                      (empresa, col, did, txt, seq, time.time(), s["quem"]))
            if s["tipo"] == "vendedor" and col == "saidas":
                ctx["saidas"].add(did)
        # devolve a versão gravada (com a junção, se houve) e o número dela: o app não confunde com versões mais novas
        feitos.append({"col": col, "id": did, "seq": seq, "apagado": True} if apagar else
                      {"col": col, "id": did, "seq": seq, "json": json.dumps(_para_cliente(c, s, col, final, ac), ensure_ascii=False, separators=(",", ":"))})
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
    try:
        h.end_headers()
        h.wfile.write(corpo)
    except (BrokenPipeError, ConnectionResetError):
        h.close_connection = True   # o celular fechou o app ou perdeu a internet durante a espera
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
        if acao == "demo" and metodo == "GET":
            with lgapi._trava:
                cod, r = entrar_demo(_db(), str(q.get("c", "")).strip().lower(), q.get("perfil", ""))
            return _resp(h, cod, r)
        if acao in ("entrada", "primeiro", "entrar"):
            empresa = str((q.get("e") if metodo == "GET" else corpo.get("e")) or "").strip().lower()
            if empresa and empresa not in empresas():
                return _resp(h, 404, {"ok": False, "erro": "Este link não é de uma horta cadastrada. Confira o link que você recebeu."})
            with lgapi._trava:
                c = _db()
                if acao == "entrar" and metodo == "POST":   # o usuário já diz de qual horta é
                    cod, r = entrar(c, empresa, corpo.get("usuario"), corpo.get("senha"))
                    lgapi.registrar("rural:" + (r.get("empresa") or empresa or "?"), str(corpo.get("usuario"))[:40], "Rural: entrou" if cod == 200 else "Rural: senha errada", "", _ip(h))
                    if cod in (401, 429):
                        lgapi._falha_ip(_ip(h), None, "Rural")
                    return _resp(h, cod, r)
                empresa = empresa or _empresa_padrao()
                if not empresa:
                    return _resp(h, 404, {"ok": False, "erro": "Nenhuma horta cadastrada neste servidor."})
                if acao == "entrada" and metodo == "GET":
                    return _resp(h, 200, entrada(c, empresa))
                if acao == "primeiro" and metodo == "POST":
                    cod, r = primeiro(c, empresa, corpo.get("nome"), corpo.get("usuario"), corpo.get("senha"))
                    if cod == 200:
                        lgapi.registrar("rural:" + empresa, str(corpo.get("usuario"))[:40], "Rural: administrador criado", "", _ip(h))
                    return _resp(h, cod, r)
            return _resp(h, 405, {"ok": False})

        # ---------- com login
        auth = h.headers.get("Authorization", "")
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
        with lgapi._trava:
            c = _db()
            s = sessao(c, token)
        if not s:
            if token:
                with lgapi._trava:
                    r0 = _db().execute("SELECT empresa FROM rural_sess WHERE token=?", (_resumo(token),)).fetchone()
                if r0 and r0["empresa"].startswith("demo-") and r0["empresa"] != "demo-rural":
                    return _resp(h, 410, {"ok": False, "encerrada": True, "erro": "Esta demonstração terminou."})
                if r0 and r0["empresa"] in bloqueadas():
                    return _resp(h, 423, {"ok": False, "suspensa": True, "erro": SUSPENSA})
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
                if s["empresa"] in bloqueadas():
                    return _resp(h, 423, {"ok": False, "suspensa": True, "erro": SUSPENSA})
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
        s["_token"] = _resumo(token)
        if acao == "usuarios":
            if s["tipo"] != "gestor":
                return _resp(h, 403, {"ok": False, "erro": "Só o administrador mexe nos usuários."})
            with lgapi._trava:
                c = _db()
                if metodo == "GET":
                    return _resp(h, 200, {"ok": True, "usuarios": listar_usuarios(c, s)})
                if corpo.get("acao") == "remover":
                    cod, r = remover_usuario(c, s, str(corpo.get("id") or ""))
                else:
                    cod, r = salvar_usuario(c, s, corpo)
                if cod == 200:
                    lgapi.registrar("rural:" + s["empresa"], s["uid"], "Rural: usuário " + ("removido" if corpo.get("acao") == "remover" else "salvo"),
                                    str(corpo.get("usuario") or corpo.get("id") or "")[:40], _ip(h))
            if cod == 200:
                _avisar()
            return _resp(h, cod, r)
        if acao == "minha-senha" and metodo == "POST":
            with lgapi._trava:
                cod, r = minha_senha(_db(), s, corpo.get("atual"), corpo.get("nova"))
            return _resp(h, cod, r)
        if acao == "sair" and metodo == "POST":
            with lgapi._trava:
                _db().execute("DELETE FROM rural_sess WHERE token=?", (_resumo(token),))
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
