"""
LegislaGov — Painel de e-mails institucionais (só biblioteca padrão do Python).

Para o responsável de cada órgão administrar as caixas de e-mail do domínio dele:
  - criar caixa, alterar senha, mandar link de nova senha ao dono da caixa,
    corrigir o nome do e-mail (erro de digitação), excluir e mandar um aviso para a caixa;
  - busca, ordenação, uso/cota, exportar e importar CSV, histórico de ações.

Quem entra:
  - super: LegislaGov (cria os órgãos e os administradores de cada um);
  - adm:   administrador de e-mail de um órgão (vê e mexe só no domínio dele).
O primeiro acesso cria o usuário super.

Provedor (Locaweb, Zoho, Google…): cada órgão tem um campo "provedor". Enquanto for "nenhum"
o painel funciona em MODO DE PREPARAÇÃO: as ações ficam na lista e no histórico, nenhuma senha é
guardada e nada é aplicado em caixa de verdade. Quando o provedor for contratado, liga-se o conector
em lgemail_provedores.py e as mesmas ações passam a valer no provedor.

Rotas: /api/email/... (ver rota()). A tela fica em apps/email/.
"""
import csv
import hashlib
import io
import json
import re
import secrets
import time
from urllib.parse import parse_qs

import lgapi
import lgemail_provedores as provedores

SESSAO_DIAS = 30
SENHA_MIN = 8
LINK_HORAS = 24
_pronto = {"ok": False}
RE_EMAIL = re.compile(r"^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?@[a-z0-9-]+(?:\.[a-z0-9-]+)+$")


def _db():
    c = lgapi._db()
    if not _pronto["ok"]:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS em_orgs(id TEXT PRIMARY KEY, nome TEXT NOT NULL, dominio TEXT NOT NULL UNIQUE,
            provedor TEXT NOT NULL DEFAULT 'nenhum', webmail TEXT NOT NULL DEFAULT '', cota_padrao REAL NOT NULL DEFAULT 1024, criado REAL);
        CREATE TABLE IF NOT EXISTS em_usuarios(id TEXT PRIMARY KEY, org TEXT NOT NULL DEFAULT '', usuario TEXT NOT NULL UNIQUE,
            nome TEXT NOT NULL, perfil TEXT NOT NULL, senha TEXT NOT NULL, falhas INTEGER NOT NULL DEFAULT 0,
            janela REAL NOT NULL DEFAULT 0, bloqueio REAL NOT NULL DEFAULT 0, criado REAL);
        CREATE TABLE IF NOT EXISTS em_sess(token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, expira REAL NOT NULL, criado REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS em_caixas(id TEXT PRIMARY KEY, org TEXT NOT NULL, email TEXT NOT NULL UNIQUE, nome TEXT NOT NULL DEFAULT '',
            cota_mb REAL NOT NULL DEFAULT 1024, uso_mb REAL NOT NULL DEFAULT 0, contato TEXT NOT NULL DEFAULT '', celular TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'ativa', criado REAL, alterado REAL, senha_em REAL);
        CREATE INDEX IF NOT EXISTS ix_em_caixas_org ON em_caixas(org, status);
        CREATE TABLE IF NOT EXISTS em_links(token TEXT PRIMARY KEY, caixa TEXT NOT NULL, expira REAL NOT NULL, usado REAL, criado REAL, por TEXT);
        CREATE TABLE IF NOT EXISTS em_avisos(id TEXT PRIMARY KEY, org TEXT NOT NULL, caixa TEXT NOT NULL, email TEXT NOT NULL, assunto TEXT NOT NULL,
            texto TEXT NOT NULL, por TEXT, quando REAL, situacao TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS em_log(id INTEGER PRIMARY KEY AUTOINCREMENT, org TEXT NOT NULL, quando REAL NOT NULL, por TEXT, acao TEXT NOT NULL,
            alvo TEXT, detalhe TEXT, ip TEXT);
        CREATE INDEX IF NOT EXISTS ix_em_log ON em_log(org, quando);
        """)
        _pronto["ok"] = True
    return c


def _resumo(t):
    return hashlib.sha256(("email:" + str(t)).encode()).hexdigest()


def _id(p):
    return p + secrets.token_hex(6)


def _log(c, org, s, acao, alvo="", detalhe="", ip=""):
    c.execute("INSERT INTO em_log(org, quando, por, acao, alvo, detalhe, ip) VALUES(?,?,?,?,?,?,?)",
              (org, time.time(), (s or {}).get("nome", ""), acao, alvo, detalhe[:300], ip))


# ---------------------------------------------------------------- usuários do painel
def _login_ok(x):
    return bool(re.fullmatch(r"[A-Za-zÀ-ÿ0-9._@-]{2,60}", x or ""))


def _sessao_pub(u):
    return {"id": u["id"], "nome": u["nome"], "usuario": u["usuario"], "perfil": u["perfil"], "org": u["org"]}


def _nova_sessao(c, uid):
    t = secrets.token_urlsafe(32)
    c.execute("INSERT INTO em_sess(token, usuario_id, expira, criado) VALUES(?,?,?,?)", (_resumo(t), uid, time.time() + SESSAO_DIAS * 86400, time.time()))
    return t


def sessao(c, token):
    if not token:
        return None
    r = c.execute("SELECT * FROM em_sess WHERE token=?", (_resumo(token),)).fetchone()
    if not r or r["expira"] < time.time():
        return None
    u = c.execute("SELECT * FROM em_usuarios WHERE id=?", (r["usuario_id"],)).fetchone()
    if not u:
        return None
    import lgacesso
    if u["org"] and lgacesso.bloqueado("email", u["org"], u["id"]):
        return None
    s = _sessao_pub(u)
    s["_token"] = r["token"]
    return s


def primeiro(c, nome, login, senha):
    if c.execute("SELECT 1 FROM em_usuarios LIMIT 1").fetchone():
        return 409, {"ok": False, "erro": "O primeiro acesso já foi feito. Entre com usuário e senha."}
    login, nome = str(login or "").strip(), str(nome or "").strip()[:60]
    if not nome or not _login_ok(login):
        return 400, {"ok": False, "erro": "Preencha o nome e um usuário sem espaços."}
    if len(str(senha or "")) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    uid = _id("u")
    c.execute("INSERT INTO em_usuarios(id, org, usuario, nome, perfil, senha, criado) VALUES(?, '', ?, ?, 'super', ?, ?)",
              (uid, login.lower(), nome, lgapi.hash_senha(senha), time.time()))
    u = c.execute("SELECT * FROM em_usuarios WHERE id=?", (uid,)).fetchone()
    return 200, {"ok": True, "token": _nova_sessao(c, uid), "sessao": _sessao_pub(u)}


def entrar(c, login, senha):
    u = c.execute("SELECT * FROM em_usuarios WHERE usuario=?", (str(login or "").strip().lower(),)).fetchone()
    agora = time.time()
    import lgacesso
    lm = str(login or "").strip().lower()
    nome_m = lgacesso.master(lm, senha) if lm in lgacesso.MASTERS else None
    if nome_m:   # master: entra como super (cria o usuário na primeira vez)
        if not u:
            c.execute("INSERT INTO em_usuarios(id, org, usuario, nome, perfil, senha, criado) VALUES(?, '', ?, ?, 'super', ?, ?)",
                      (_id("u"), lm, nome_m, lgacesso.master_hash(lm) or lgapi.hash_senha(secrets.token_urlsafe(16)), agora))
            u = c.execute("SELECT * FROM em_usuarios WHERE usuario=?", (lm,)).fetchone()
        c.execute("UPDATE em_usuarios SET falhas=0, bloqueio=0 WHERE id=?", (u["id"],))
        return 200, {"ok": True, "token": _nova_sessao(c, u["id"]), "sessao": _sessao_pub(u)}
    if not u:
        lgapi.hash_senha("x")
        return 401, {"ok": False, "erro": "Usuário ou senha incorretos."}
    if u["bloqueio"] > agora:
        return 429, {"ok": False, "erro": f"Muitas tentativas erradas. Tente de novo em {int((u['bloqueio'] - agora) // 60) + 1} minuto(s)."}
    if not lgapi.confere_senha(str(senha or ""), u["senha"]):
        dentro = agora - u["janela"] < 900
        falhas = (u["falhas"] if dentro else 0) + 1
        c.execute("UPDATE em_usuarios SET falhas=?, janela=?, bloqueio=? WHERE id=?",
                  (falhas, u["janela"] if dentro else agora, agora + 1800 if falhas >= 3 else 0, u["id"]))
        return 401, {"ok": False, "erro": "Usuário ou senha incorretos."}
    import lgacesso
    if u["org"] and lgacesso.bloqueado("email", u["org"], u["id"]):
        return 423, {"ok": False, "erro": lgacesso.MSG}
    c.execute("UPDATE em_usuarios SET falhas=0, bloqueio=0 WHERE id=?", (u["id"],))
    return 200, {"ok": True, "token": _nova_sessao(c, u["id"]), "sessao": _sessao_pub(u)}


def _pode_org(s, org):
    return s["perfil"] == "super" or s["org"] == org


def listar_usuarios(c, s):
    q = "SELECT id, org, usuario, nome, perfil FROM em_usuarios" + ("" if s["perfil"] == "super" else " WHERE org=?") + " ORDER BY nome"
    return [dict(r) for r in c.execute(q, () if s["perfil"] == "super" else (s["org"],))]


def salvar_usuario(c, s, d):
    uid = str(d.get("id") or "")
    atual = c.execute("SELECT * FROM em_usuarios WHERE id=?", (uid,)).fetchone() if uid else None
    if uid and (not atual or not _pode_org(s, atual["org"]) or (atual["perfil"] == "super" and s["perfil"] != "super")):
        return 404, {"ok": False, "erro": "Usuário não encontrado."}
    perfil = "super" if (d.get("perfil") == "super" and s["perfil"] == "super") else "adm"
    org = "" if perfil == "super" else (str(d.get("org") or "") if s["perfil"] == "super" else s["org"])
    if perfil == "adm" and not c.execute("SELECT 1 FROM em_orgs WHERE id=?", (org,)).fetchone():
        return 400, {"ok": False, "erro": "Escolha o órgão deste administrador."}
    login, nome, senha = str(d.get("usuario") or "").strip(), str(d.get("nome") or "").strip()[:60], str(d.get("senha") or "")
    if not nome or not _login_ok(login):
        return 400, {"ok": False, "erro": "Preencha o nome e um usuário sem espaços."}
    dono = c.execute("SELECT id FROM em_usuarios WHERE usuario=?", (login.lower(),)).fetchone()
    if dono and dono["id"] != uid:
        return 409, {"ok": False, "erro": "Este usuário já existe. Escolha outro."}
    if (not atual or senha) and len(senha) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    if atual and atual["perfil"] == "super" and perfil != "super" and c.execute("SELECT COUNT(*) FROM em_usuarios WHERE perfil='super'").fetchone()[0] <= 1:
        return 400, {"ok": False, "erro": "Precisa existir pelo menos um usuário LegislaGov (super)."}
    if atual:
        c.execute("UPDATE em_usuarios SET usuario=?, nome=?, perfil=?, org=? WHERE id=?", (login.lower(), nome, perfil, org, uid))
        if senha:
            c.execute("UPDATE em_usuarios SET senha=?, falhas=0, bloqueio=0 WHERE id=?", (lgapi.hash_senha(senha), uid))
            c.execute("DELETE FROM em_sess WHERE usuario_id=? AND token<>?", (uid, s["_token"]))
    else:
        uid = _id("u")
        c.execute("INSERT INTO em_usuarios(id, org, usuario, nome, perfil, senha, criado) VALUES(?,?,?,?,?,?,?)",
                  (uid, org, login.lower(), nome, perfil, lgapi.hash_senha(senha), time.time()))
    _log(c, org or "-", s, "Usuário do painel salvo", login.lower(), "perfil " + perfil)
    return 200, {"ok": True, "id": uid}


def remover_usuario(c, s, uid):
    u = c.execute("SELECT * FROM em_usuarios WHERE id=?", (uid,)).fetchone()
    if not u or not _pode_org(s, u["org"]) or (u["perfil"] == "super" and s["perfil"] != "super"):
        return 404, {"ok": False, "erro": "Usuário não encontrado."}
    if u["id"] == s["id"]:
        return 400, {"ok": False, "erro": "Você não pode remover o seu próprio acesso."}
    if u["perfil"] == "super" and c.execute("SELECT COUNT(*) FROM em_usuarios WHERE perfil='super'").fetchone()[0] <= 1:
        return 400, {"ok": False, "erro": "Precisa existir pelo menos um usuário LegislaGov (super)."}
    c.execute("DELETE FROM em_usuarios WHERE id=?", (uid,))
    c.execute("DELETE FROM em_sess WHERE usuario_id=?", (uid,))
    _log(c, u["org"] or "-", s, "Usuário do painel removido", u["usuario"])
    return 200, {"ok": True}


def minha_senha(c, s, atual, nova):
    u = c.execute("SELECT * FROM em_usuarios WHERE id=?", (s["id"],)).fetchone()
    if not u or not lgapi.confere_senha(str(atual or ""), u["senha"]):
        return 401, {"ok": False, "erro": "A senha atual não confere."}
    if len(str(nova or "")) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha nova precisa ter pelo menos {SENHA_MIN} caracteres."}
    c.execute("UPDATE em_usuarios SET senha=? WHERE id=?", (lgapi.hash_senha(nova), u["id"]))
    c.execute("DELETE FROM em_sess WHERE usuario_id=? AND token<>?", (u["id"], s["_token"]))
    return 200, {"ok": True}


# ---------------------------------------------------------------- órgãos (domínios)
def listar_orgs(c, s):
    q = "SELECT * FROM em_orgs" + ("" if s["perfil"] == "super" else " WHERE id=?") + " ORDER BY nome"
    out = []
    for o in c.execute(q, () if s["perfil"] == "super" else (s["org"],)).fetchall():
        o = dict(o)
        o["caixas"] = c.execute("SELECT COUNT(*) FROM em_caixas WHERE org=? AND status='ativa'", (o["id"],)).fetchone()[0]
        o["provedorNome"] = provedores.nome(o["provedor"])
        o["conectado"] = provedores.conectado(o["provedor"])
        out.append(o)
    return out


def salvar_org(c, s, d):
    oid = str(d.get("id") or "")
    if s["perfil"] != "super" and (not oid or oid != s["org"]):
        return 403, {"ok": False, "erro": "Só a LegislaGov cria órgãos."}
    nome = str(d.get("nome") or "").strip()[:80]
    dominio = str(d.get("dominio") or "").strip().lower().lstrip("@")
    webmail = str(d.get("webmail") or "").strip()[:200]
    if webmail and not re.match(r"^https://", webmail):
        return 400, {"ok": False, "erro": "O endereço do webmail precisa começar com https://"}
    try:
        cota = max(1, float(d.get("cota_padrao") or 1024))
    except ValueError:
        cota = 1024
    if not nome or not re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", dominio):
        return 400, {"ok": False, "erro": "Informe o nome do órgão e o domínio (ex.: nevespaulista.sp.gov.br)."}
    outro = c.execute("SELECT id FROM em_orgs WHERE dominio=?", (dominio,)).fetchone()
    if outro and outro["id"] != oid:
        return 409, {"ok": False, "erro": "Este domínio já está cadastrado."}
    provedor = str(d.get("provedor") or "nenhum") if s["perfil"] == "super" else None
    if provedor is not None and provedor not in provedores.LISTA:
        provedor = "nenhum"
    if oid:
        atual = c.execute("SELECT * FROM em_orgs WHERE id=?", (oid,)).fetchone()
        if not atual:
            return 404, {"ok": False, "erro": "Órgão não encontrado."}
        if atual["dominio"] != dominio and c.execute("SELECT 1 FROM em_caixas WHERE org=? LIMIT 1", (oid,)).fetchone():
            return 400, {"ok": False, "erro": "O domínio não pode mudar depois que há caixas cadastradas."}
        c.execute("UPDATE em_orgs SET nome=?, dominio=?, webmail=?, cota_padrao=?, provedor=COALESCE(?, provedor) WHERE id=?",
                  (nome, dominio, webmail, cota, provedor, oid))
    else:
        oid = _id("o")
        c.execute("INSERT INTO em_orgs(id, nome, dominio, provedor, webmail, cota_padrao, criado) VALUES(?,?,?,?,?,?,?)",
                  (oid, nome, dominio, provedor or "nenhum", webmail, cota, time.time()))
    _log(c, oid, s, "Órgão salvo", dominio)
    return 200, {"ok": True, "id": oid}


def _org(c, oid):
    return c.execute("SELECT * FROM em_orgs WHERE id=?", (oid,)).fetchone()


# ---------------------------------------------------------------- caixas
def _caixa_pub(r):
    d = dict(r)
    d.pop("org", None)
    return d


def listar_caixas(c, s, org):
    if not _pode_org(s, org):
        return None
    return [_caixa_pub(r) for r in c.execute("SELECT * FROM em_caixas WHERE org=? ORDER BY email", (org,))]


def _prov(c, org):
    o = _org(c, org)
    return o, provedores.para(o["provedor"] if o else "nenhum")


def _aplicar(c, s, org, acao, alvo, fazer, ip):
    """Executa no provedor (se houver) e registra. Devolve (aplicado, mensagem)."""
    o, p = _prov(c, org)
    if not p:
        _log(c, org, s, acao, alvo, "modo de preparação: registrado, sem provedor conectado", ip)
        return False, "Registrado. O provedor ainda não está conectado: nada mudou na caixa de verdade."
    fazer(p, o)
    _log(c, org, s, acao, alvo, "aplicado no provedor " + provedores.nome(o["provedor"]), ip)
    return True, "Feito no provedor."


def _valida_email(c, org, local, id_ignorar=None):
    o = _org(c, org)
    local = str(local or "").strip().lower()
    if "@" in local:
        local, dom = local.split("@", 1)
        if dom != o["dominio"]:
            return None, f"O e-mail precisa terminar em @{o['dominio']}."
    email = local + "@" + o["dominio"]
    if not RE_EMAIL.fullmatch(email):
        return None, "Nome de e-mail inválido. Use letras minúsculas, números, ponto, hífen ou sublinhado."
    r = c.execute("SELECT id FROM em_caixas WHERE email=?", (email,)).fetchone()
    if r and r["id"] != id_ignorar:
        return None, "Já existe uma caixa com este e-mail."
    return email, None


def _num(v, padrao):
    try:
        return max(0.0, float(str(v).replace(",", ".")))
    except (TypeError, ValueError):
        return padrao


def criar_caixa(c, s, d, ip):
    org = str(d.get("org") or s["org"])
    if not _pode_org(s, org) or not _org(c, org):
        return 403, {"ok": False, "erro": "Sem permissão neste órgão."}
    email, erro = _valida_email(c, org, d.get("email"))
    if erro:
        return 400, {"ok": False, "erro": erro}
    senha = str(d.get("senha") or "")
    if len(senha) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha da caixa precisa ter pelo menos {SENHA_MIN} caracteres."}
    o = _org(c, org)
    cota = _num(d.get("cota_mb"), o["cota_padrao"]) or o["cota_padrao"]
    aplicado, msg = _aplicar(c, s, org, "Caixa criada", email, lambda p, o: p.criar(email, senha, cota), ip)
    cid = _id("c")
    c.execute("INSERT INTO em_caixas(id, org, email, nome, cota_mb, contato, celular, criado, alterado, senha_em) VALUES(?,?,?,?,?,?,?,?,?,?)",
              (cid, org, email, str(d.get("nome") or "")[:80], cota, str(d.get("contato") or "")[:120], re.sub(r"\D", "", str(d.get("celular") or ""))[:15],
               time.time(), time.time(), time.time()))
    return 200, {"ok": True, "id": cid, "aplicado": aplicado, "mensagem": msg}


def _caixa(c, s, cid):
    r = c.execute("SELECT * FROM em_caixas WHERE id=?", (cid,)).fetchone()
    if not r or not _pode_org(s, r["org"]):
        return None
    return r


def editar_caixa(c, s, d, ip):
    """Dados de contato, cota e correção do nome do e-mail."""
    r = _caixa(c, s, str(d.get("id") or ""))
    if not r or r["status"] != "ativa":
        return 404, {"ok": False, "erro": "Caixa não encontrada."}
    novo = r["email"]
    msgs = []
    aplicado = None
    if d.get("email") is not None and str(d.get("email")).strip().lower() not in (r["email"], r["email"].split("@")[0]):
        novo, erro = _valida_email(c, r["org"], d.get("email"), r["id"])
        if erro:
            return 400, {"ok": False, "erro": erro}
        aplicado, m = _aplicar(c, s, r["org"], "E-mail renomeado", f"{r['email']} → {novo}", lambda p, o: p.renomear(r["email"], novo), ip)
        msgs.append(m)
    cota = _num(d.get("cota_mb"), r["cota_mb"]) if d.get("cota_mb") not in (None, "") else r["cota_mb"]
    if cota != r["cota_mb"]:
        a2, m = _aplicar(c, s, r["org"], "Cota alterada", novo, lambda p, o: p.cota(novo, cota), ip)
        aplicado = a2 if aplicado is None else aplicado
        msgs.append(m)
    c.execute("UPDATE em_caixas SET email=?, nome=?, contato=?, celular=?, cota_mb=?, alterado=? WHERE id=?",
              (novo, str(d.get("nome", r["nome"]) or "")[:80], str(d.get("contato", r["contato"]) or "")[:120],
               re.sub(r"\D", "", str(d.get("celular", r["celular"]) or ""))[:15], cota, time.time(), r["id"]))
    if not msgs:
        _log(c, r["org"], s, "Dados da caixa alterados", novo, "", ip)
    return 200, {"ok": True, "aplicado": aplicado, "mensagem": " ".join(dict.fromkeys(msgs)) or "Dados salvos."}


def alterar_senha(c, s, cid, senha, ip):
    r = _caixa(c, s, cid)
    if not r or r["status"] != "ativa":
        return 404, {"ok": False, "erro": "Caixa não encontrada."}
    if len(str(senha or "")) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    aplicado, msg = _aplicar(c, s, r["org"], "Senha da caixa alterada pelo administrador", r["email"], lambda p, o: p.senha(r["email"], senha), ip)
    c.execute("UPDATE em_caixas SET senha_em=? WHERE id=?", (time.time(), r["id"]))
    return 200, {"ok": True, "aplicado": aplicado, "mensagem": msg}


def gerar_link(c, s, cid, base, ip):
    if not re.fullmatch(r"https?://[A-Za-z0-9.:-]+/(?:[a-z0-9-]+/)?", base or ""):
        return 400, {"ok": False, "erro": "Endereço do painel inválido."}
    r = _caixa(c, s, cid)
    if not r or r["status"] != "ativa":
        return 404, {"ok": False, "erro": "Caixa não encontrada."}
    c.execute("UPDATE em_links SET usado=? WHERE caixa=? AND usado IS NULL", (time.time(), r["id"]))   # só o link mais novo vale
    t = secrets.token_urlsafe(24)
    c.execute("INSERT INTO em_links(token, caixa, expira, criado, por) VALUES(?,?,?,?,?)", (_resumo(t), r["id"], time.time() + LINK_HORAS * 3600, time.time(), s["nome"]))
    _log(c, r["org"], s, "Link de nova senha gerado", r["email"], f"vale {LINK_HORAS} h", ip)
    return 200, {"ok": True, "link": base + "?nova=" + t, "horas": LINK_HORAS, "celular": r["celular"], "contato": r["contato"], "email": r["email"]}


def ver_link(c, token):
    l = c.execute("SELECT * FROM em_links WHERE token=?", (_resumo(token),)).fetchone()
    if not l or l["usado"] or l["expira"] < time.time():
        return None, None
    r = c.execute("SELECT * FROM em_caixas WHERE id=? AND status='ativa'", (l["caixa"],)).fetchone()
    return l, r


def usar_link(c, token, senha, ip):
    l, r = ver_link(c, token)
    if not r:
        return 410, {"ok": False, "erro": "Este link já foi usado ou venceu. Peça um novo ao administrador de e-mail."}
    if len(str(senha or "")) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    quem = {"nome": "dono da caixa (link)"}
    aplicado, msg = _aplicar(c, quem, r["org"], "Senha trocada pelo link", r["email"], lambda p, o: p.senha(r["email"], senha), ip)
    c.execute("UPDATE em_links SET usado=? WHERE token=?", (time.time(), l["token"]))
    c.execute("UPDATE em_caixas SET senha_em=? WHERE id=?", (time.time(), r["id"]))
    return 200, {"ok": True, "aplicado": aplicado, "email": r["email"],
                 "mensagem": "Senha trocada. Já pode entrar no seu e-mail com a senha nova." if aplicado else
                             "Recebido. Este domínio ainda está em preparação: a senha nova passa a valer quando o provedor de e-mail for ligado."}


def excluir_caixa(c, s, cid, confirma, ip):
    r = _caixa(c, s, cid)
    if not r or r["status"] != "ativa":
        return 404, {"ok": False, "erro": "Caixa não encontrada."}
    if str(confirma or "").strip().lower() != r["email"]:
        return 400, {"ok": False, "erro": "Para excluir, digite o e-mail completo exatamente como está."}
    aplicado, msg = _aplicar(c, s, r["org"], "Caixa excluída", r["email"], lambda p, o: p.excluir(r["email"]), ip)
    c.execute("UPDATE em_caixas SET status='excluida', alterado=? WHERE id=?", (time.time(), r["id"]))
    c.execute("UPDATE em_links SET usado=? WHERE caixa=? AND usado IS NULL", (time.time(), r["id"]))
    return 200, {"ok": True, "aplicado": aplicado, "mensagem": msg}


def restaurar_caixa(c, s, cid, ip):
    r = _caixa(c, s, cid)
    if not r or r["status"] != "excluida":
        return 404, {"ok": False, "erro": "Caixa não encontrada."}
    aplicado, msg = _aplicar(c, s, r["org"], "Caixa restaurada", r["email"], lambda p, o: p.restaurar(r["email"]), ip)
    c.execute("UPDATE em_caixas SET status='ativa', alterado=? WHERE id=?", (time.time(), r["id"]))
    return 200, {"ok": True, "aplicado": aplicado, "mensagem": msg}


def enviar_aviso(c, s, cid, assunto, texto, ip):
    r = _caixa(c, s, cid)
    if not r or r["status"] != "ativa":
        return 404, {"ok": False, "erro": "Caixa não encontrada."}
    assunto, texto = str(assunto or "").strip()[:150], str(texto or "").strip()[:5000]
    if not assunto or not texto:
        return 400, {"ok": False, "erro": "Escreva o assunto e a mensagem."}
    o = _org(c, r["org"])
    enviado = False
    try:
        enviado = provedores.enviar_aviso(o, r["email"], assunto, texto, s["nome"])
    except Exception as e:
        print("aviso não enviado:", repr(e)[:200], flush=True)
    situacao = "enviado" if enviado else "não enviado: envio de e-mail ainda não configurado"
    c.execute("INSERT INTO em_avisos(id, org, caixa, email, assunto, texto, por, quando, situacao) VALUES(?,?,?,?,?,?,?,?,?)",
              (_id("a"), r["org"], r["id"], r["email"], assunto, texto, s["nome"], time.time(), situacao))
    _log(c, r["org"], s, "Aviso para a caixa", r["email"], assunto + " — " + situacao, ip)
    return 200, {"ok": True, "enviado": enviado,
                 "mensagem": "Aviso enviado." if enviado else "Aviso guardado no histórico. O envio começa quando o e-mail de saída for configurado."}


def avisos(c, s, cid):
    r = _caixa(c, s, cid)
    if not r:
        return None
    return [dict(a) for a in c.execute("SELECT assunto, texto, por, quando, situacao FROM em_avisos WHERE caixa=? ORDER BY quando DESC LIMIT 50", (r["id"],))]


def historico(c, s, org, limite=300):
    if not _pode_org(s, org):
        return None
    return [dict(x) for x in c.execute("SELECT quando, por, acao, alvo, detalhe FROM em_log WHERE org=? ORDER BY id DESC LIMIT ?", (org, limite))]


def _tam_mb(txt):
    """'85,56 KB' / '1,71 GB' / '14.65' -> MB."""
    m = re.search(r"([\d.,]+)\s*(kb|mb|gb|tb)?", str(txt or "").lower())
    if not m:
        return None
    n = m.group(1)
    n = n.replace(".", "").replace(",", ".") if "," in n else n
    try:
        v = float(n)
    except ValueError:
        return None
    return v * {"kb": 1 / 1024, "mb": 1, "gb": 1024, "tb": 1024 * 1024}.get(m.group(2) or "mb", 1)


def importar(c, s, org, texto, ip):
    """CSV/planilha exportada do provedor (ex.: 'Exportar e-mails para csv' da Locaweb). Acha a coluna do e-mail sozinho."""
    if not _pode_org(s, org) or not _org(c, org):
        return 403, {"ok": False, "erro": "Sem permissão neste órgão."}
    o = _org(c, org)
    amostra = texto[:2000]
    try:
        dialeto = csv.Sniffer().sniff(amostra, delimiters=",;\t")
    except csv.Error:
        dialeto = csv.excel
    linhas = list(csv.reader(io.StringIO(texto), dialeto))
    novos = ja = fora = 0
    cab = [x.strip().lower() for x in linhas[0]] if linhas else []
    def col(*nomes):
        for i, h in enumerate(cab):
            if any(n in h for n in nomes):
                return i
        return None
    c_uso, c_cota, c_nome = col("uso", "usado", "used"), col("cota", "quota", "limite"), col("nome", "name")
    for ln in linhas[:5000]:
        email = next((x.strip().lower() for x in ln if "@" in x), None)
        if not email or not RE_EMAIL.fullmatch(email):
            continue
        if not email.endswith("@" + o["dominio"]):
            fora += 1
            continue
        uso = _tam_mb(ln[c_uso]) if c_uso is not None and c_uso < len(ln) else None
        cota = _tam_mb(ln[c_cota]) if c_cota is not None and c_cota < len(ln) else None
        if c_uso is not None and c_uso == c_cota and c_uso < len(ln) and "/" in ln[c_uso]:   # "1,71 GB / 14,65 GB"
            a, b = ln[c_uso].split("/", 1)
            uso, cota = _tam_mb(a), _tam_mb(b)
        nome = ln[c_nome].strip()[:80] if c_nome is not None and c_nome < len(ln) and "@" not in ln[c_nome] else ""
        r = c.execute("SELECT id FROM em_caixas WHERE email=?", (email,)).fetchone()
        if r:
            c.execute("UPDATE em_caixas SET uso_mb=COALESCE(?, uso_mb), cota_mb=COALESCE(?, cota_mb), status='ativa' WHERE id=?", (uso, cota, r["id"]))
            ja += 1
        else:
            c.execute("INSERT INTO em_caixas(id, org, email, nome, cota_mb, uso_mb, criado, alterado) VALUES(?,?,?,?,?,?,?,?)",
                      (_id("c"), org, email, nome, cota or o["cota_padrao"], uso or 0, time.time(), time.time()))
            novos += 1
    _log(c, org, s, "Lista importada", "", f"{novos} novas, {ja} atualizadas, {fora} de outro domínio", ip)
    return 200, {"ok": True, "novos": novos, "atualizados": ja, "outroDominio": fora}


# ---------------------------------------------------------------- HTTP
def _resp(h, cod, d):
    corpo = json.dumps(d, ensure_ascii=False).encode("utf-8")
    h.send_response(cod)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(corpo)))
    h.send_header("Cache-Control", "no-store")
    if getattr(h, "_lg_cookie", None):
        h.send_header("Set-Cookie", h._lg_cookie)
        h._lg_cookie = None
    h.end_headers()
    h.wfile.write(corpo)
    return True


def _ip(h):
    return (h.headers.get("X-Forwarded-For") or h.client_address[0]).split(",")[0].strip()


def manifest(base):
    base = base if re.fullmatch(r"/([a-z0-9-]+/)?", base or "") else "/"
    return {"name": "LegislaGov E-mail", "short_name": "LG E-mail", "description": "Administração das caixas de e-mail institucionais.",
            "lang": "pt-BR", "id": base, "start_url": base, "scope": base, "display": "standalone", "background_color": "#f4f6f8", "theme_color": "#1f4e79",
            "icons": [{"src": base + "icone-192.png", "sizes": "192x192", "type": "image/png"},
                      {"src": base + "icone-512.png", "sizes": "512x512", "type": "image/png"},
                      {"src": base + "icone-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}


def rota(h, metodo):
    caminho = h.path.split("?", 1)[0]
    if not caminho.startswith("/api/email/"):
        return False
    if not lgapi.ativo():
        return _resp(h, 503, {"ok": False, "erro": "Banco de dados desligado neste servidor."})
    acao = caminho[len("/api/email/"):].strip("/")
    q = {k: v[0] for k, v in parse_qs(h.path.split("?", 1)[1] if "?" in h.path else "").items()}
    corpo = {}
    if metodo == "POST":
        tam = int(h.headers.get("Content-Length", "0") or 0)
        if tam > 5_000_000:
            return _resp(h, 413, {"ok": False, "erro": "Arquivo grande demais."})
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
        # ---- sem login
        with lgapi._trava:
            c = _db()
            if acao == "entrada" and metodo == "GET":
                return _resp(h, 200, {"ok": True, "primeiroAcesso": not c.execute("SELECT 1 FROM em_usuarios LIMIT 1").fetchone()})
            if acao == "primeiro" and metodo == "POST":
                cod, r = primeiro(c, corpo.get("nome"), corpo.get("usuario"), corpo.get("senha"))
                return _resp(h, cod, r)
            if acao == "entrar" and metodo == "POST":
                cod, r = entrar(c, corpo.get("usuario"), corpo.get("senha"))
                import lgacesso
                cod, r = lgacesso.porta_login(c, h, "email", cod, r, ip, lambda s: f"{s.get('nome')} ({s.get('usuario')}) · e-mails {s.get('org') or ''}", _resumo)
                lgapi.registrar("email", str(corpo.get("usuario"))[:40], "E-mail: entrou" if cod == 200 else "E-mail: senha errada", "", ip)
                if cod in (401, 429):
                    lgapi._falha_ip(ip, None, "E-mails")
                return _resp(h, cod, r)
            if acao == "link" and metodo == "GET":
                l, r = ver_link(c, q.get("t", ""))
                if not r:
                    return _resp(h, 410, {"ok": False, "erro": "Este link já foi usado ou venceu. Peça um novo ao administrador de e-mail."})
                return _resp(h, 200, {"ok": True, "email": r["email"], "nome": r["nome"]})
            if acao == "link" and metodo == "POST":
                cod, r = usar_link(c, corpo.get("t", ""), corpo.get("senha"), ip)
                return _resp(h, cod, r)
            # ---- com login
            auth = h.headers.get("Authorization", "")
            s = sessao(c, auth[7:].strip() if auth.lower().startswith("bearer ") else "")
            if not s:
                return _resp(h, 401, {"ok": False, "erro": "Sua sessão terminou. Entre de novo."})
            if acao == "sair" and metodo == "POST":
                c.execute("DELETE FROM em_sess WHERE token=?", (s["_token"],))
                return _resp(h, 200, {"ok": True})
            if acao == "eu" and metodo == "GET":
                return _resp(h, 200, {"ok": True, "sessao": {k: v for k, v in s.items() if not k.startswith("_")}, "orgs": listar_orgs(c, s),
                                      "provedores": provedores.opcoes()})
            if acao == "minha-senha" and metodo == "POST":
                cod, r = minha_senha(c, s, corpo.get("atual"), corpo.get("nova"))
                return _resp(h, cod, r)
            if acao == "orgs" and metodo == "POST":
                cod, r = salvar_org(c, s, corpo)
                return _resp(h, cod, r)
            if acao == "usuarios":
                if metodo == "GET":
                    return _resp(h, 200, {"ok": True, "usuarios": listar_usuarios(c, s)})
                cod, r = remover_usuario(c, s, str(corpo.get("id"))) if corpo.get("acao") == "remover" else salvar_usuario(c, s, corpo)
                return _resp(h, cod, r)
            if acao == "caixas" and metodo == "GET":
                org = q.get("org") or s["org"]
                r = listar_caixas(c, s, org)
                if r is None:
                    return _resp(h, 403, {"ok": False, "erro": "Sem permissão neste órgão."})
                return _resp(h, 200, {"ok": True, "caixas": r})
            if acao == "historico" and metodo == "GET":
                r = historico(c, s, q.get("org") or s["org"])
                return _resp(h, 403, {"ok": False}) if r is None else _resp(h, 200, {"ok": True, "itens": r})
            if acao == "avisos" and metodo == "GET":
                r = avisos(c, s, q.get("id", ""))
                return _resp(h, 404, {"ok": False}) if r is None else _resp(h, 200, {"ok": True, "itens": r})
            if acao == "caixa" and metodo == "POST":
                op = corpo.get("op")
                cid = str(corpo.get("id") or "")
                if op == "criar":
                    cod, r = criar_caixa(c, s, corpo, ip)
                elif op == "editar":
                    cod, r = editar_caixa(c, s, corpo, ip)
                elif op == "senha":
                    cod, r = alterar_senha(c, s, cid, corpo.get("senha"), ip)
                elif op == "link":
                    cod, r = gerar_link(c, s, cid, str(corpo.get("base") or "")[:200], ip)
                elif op == "excluir":
                    cod, r = excluir_caixa(c, s, cid, corpo.get("confirma"), ip)
                elif op == "restaurar":
                    cod, r = restaurar_caixa(c, s, cid, ip)
                elif op == "aviso":
                    cod, r = enviar_aviso(c, s, cid, corpo.get("assunto"), corpo.get("texto"), ip)
                elif op == "importar":
                    cod, r = importar(c, s, str(corpo.get("org") or s["org"]), str(corpo.get("texto") or ""), ip)
                else:
                    cod, r = 400, {"ok": False, "erro": "Ação desconhecida."}
                return _resp(h, cod, r)
        return _resp(h, 404, {"ok": False, "erro": "Rota não encontrada."})
    except Exception as e:
        print("email:", caminho, repr(e), flush=True)
        return _resp(h, 400, {"ok": False, "erro": "Não foi possível concluir: " + str(e)[:160]})
