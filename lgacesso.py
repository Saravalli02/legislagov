"""LegislaGov — liga e desliga o acesso de clientes e usuários de todos os sistemas (Central > Administração > Sistemas e clientes).

Uma linha em ct_acesso com bloqueado preenchido corta o acesso:
  usuario = ""   → o cliente inteiro (a Câmara, a horta, o órgão do e-mail, o restaurante)
  usuario = id   → só aquela pessoa
Cada sistema consulta bloqueado() ao entrar e a cada pedido com sessão, então o corte vale na hora.
"""
import re, secrets, time, uuid

import lgapi

SISTEMAS = ("camara", "rural", "email", "restaurante")
MSG = "O acesso foi suspenso pela LegislaGov. Fale com a LegislaGov."
_cache = {"ok": False, "set": set()}


def _db():
    c = lgapi._db()
    if not _cache["ok"]:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS ct_acesso(sistema TEXT NOT NULL, cliente TEXT NOT NULL, usuario TEXT NOT NULL DEFAULT '',
            bloqueado REAL, motivo TEXT, por TEXT, PRIMARY KEY(sistema, cliente, usuario));
        CREATE TABLE IF NOT EXISTS ct_rest_usuarios(id TEXT PRIMARY KEY, cliente TEXT NOT NULL, usuario TEXT NOT NULL UNIQUE, nome TEXT NOT NULL,
            perfil TEXT NOT NULL DEFAULT 'adm', senha TEXT NOT NULL, falhas INTEGER NOT NULL DEFAULT 0, janela REAL NOT NULL DEFAULT 0,
            bloqueio REAL NOT NULL DEFAULT 0, criado REAL, ultimo REAL);
        CREATE TABLE IF NOT EXISTS ct_rest_sess(token TEXT PRIMARY KEY, uid TEXT NOT NULL, cliente TEXT NOT NULL, expira REAL NOT NULL, criado REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS ct_clientes(sistema TEXT NOT NULL, id TEXT NOT NULL, nome TEXT, responsavel TEXT, obs TEXT, criado REAL,
            PRIMARY KEY(sistema, id));
        """)
        c.execute("INSERT OR IGNORE INTO ct_clientes(sistema, id, nome, responsavel, obs, criado) VALUES('restaurante', 'restaurante-1', 'Restaurante', 'Marina', 'Caixa: d1xi1g7etepsye.cloudfront.net', ?)",
                  (time.time(),))
        try:   # tipo do comércio: restaurante ou açougue (base única, um cadastro por cliente)
            c.execute("ALTER TABLE ct_clientes ADD COLUMN tipo TEXT NOT NULL DEFAULT 'restaurante'")
            # uma vez só, ao criar a coluna: o primeiro cliente passa a se chamar Casa Saravalli (pedido de 20/11/2026)
            c.execute("UPDATE ct_clientes SET nome='Casa Saravalli' WHERE sistema='restaurante' AND id='restaurante-1'")
        except Exception:
            pass
        _cache["set"] = {(r["sistema"], r["cliente"], r["usuario"]) for r in c.execute("SELECT * FROM ct_acesso WHERE bloqueado IS NOT NULL")}
        _cache["ok"] = True
    return c


def bloqueado(sistema, cliente, usuario=""):
    """True quando o cliente inteiro ou a pessoa está com o acesso cortado."""
    try:
        with lgapi._trava:
            _db()
        s = _cache["set"]
        return (sistema, str(cliente or ""), "") in s or bool(usuario) and (sistema, str(cliente or ""), str(usuario)) in s
    except Exception as e:   # nunca derruba o sistema por causa desta conferência
        print("acesso:", repr(e), flush=True)
        return False


def definir(sistema, cliente, usuario, bloquear, motivo, por):
    if sistema not in SISTEMAS or not cliente:
        return 400, {"ok": False, "erro": "Pedido inválido."}
    c = _db()
    chave = (sistema, str(cliente), str(usuario or ""))
    if bloquear:
        c.execute("INSERT OR REPLACE INTO ct_acesso VALUES(?,?,?,?,?,?)", (*chave, time.time(), str(motivo or "")[:200], por))
        _cache["set"].add(chave)
    else:
        c.execute("DELETE FROM ct_acesso WHERE sistema=? AND cliente=? AND usuario=?", chave)
        _cache["set"].discard(chave)
    # quem estava dentro sai na hora
    if bloquear and sistema == "camara":
        if chave[2]:
            c.execute("DELETE FROM sessoes WHERE camara=? AND usuario_id=?", (chave[1], chave[2]))
        else:
            c.execute("DELETE FROM sessoes WHERE camara=?", (chave[1],))
    if bloquear and sistema == "email":
        if chave[2]:
            c.execute("DELETE FROM em_sess WHERE usuario_id=?", (chave[2],))
        else:
            c.execute("DELETE FROM em_sess WHERE usuario_id IN (SELECT id FROM em_usuarios WHERE org=?)", (chave[1],))
    if bloquear and sistema == "rural" and chave[2]:
        c.execute("DELETE FROM rural_sess WHERE usuario_id=?", (chave[2],))
        try:
            import lgrural
            lgrural._avisar()
        except Exception:
            pass
    return 200, {"ok": True}


def _info(c, sistema, cliente, usuario=""):
    r = c.execute("SELECT * FROM ct_acesso WHERE sistema=? AND cliente=? AND usuario=?", (sistema, cliente, usuario)).fetchone()
    return {"bloqueado": bool(r and r["bloqueado"]), "desde": r["bloqueado"] if r else None, "motivo": (r["motivo"] if r else "") or "", "por": (r["por"] if r else "") or ""}


NOMES_CAMARA = {"neves-paulista-sp": "Câmara Municipal de Neves Paulista", "teste": "Ambiente de teste"}


def painel(c):
    """Tudo o que a aba "Sistemas e clientes" mostra."""
    _db()
    out = {"ok": True}
    # Câmara (painel legislativo)
    camaras = []
    for (cam,) in c.execute("SELECT DISTINCT camara FROM usuarios ORDER BY camara").fetchall():
        us = []
        for u in lgapi.usuarios(cam):
            if u.get("pendente"):
                continue
            us.append({"id": u["id"], "nome": u.get("nome") or u["usuario"], "usuario": u["usuario"],
                       "cargo": u.get("cargo") or u.get("perfil") or "", "ativo": u.get("ativo") is not False, **_info(c, "camara", cam, u["id"])})
        us.sort(key=lambda x: x["nome"].lower())
        camaras.append({"id": cam, "nome": NOMES_CAMARA.get(cam, cam), "usuarios": us, **_info(c, "camara", cam)})
    out["camara"] = camaras
    # Rural (cada horta é um cliente; a suspensão da horta usa a regra que o Rural já tinha)
    try:
        import lgrural
        rc = lgrural._db()
        hortas = []
        for h in lgrural.central_hortas(rc):
            us, _ = lgrural.central_usuarios(rc, h["codigo"])
            hortas.append({"id": h["codigo"], "nome": h["nome"], "bloqueado": h["suspensa"], "desde": h["suspensaEm"], "motivo": h["motivo"],
                           "usuarios": [{"id": u["id"], "nome": u["nome"], "usuario": u["usuario"],
                                         "cargo": "Administrador da horta" if u["perfil"] == "adm" else "Vendedor" + (" · " + u["vendedor"] if u["vendedor"] else ""),
                                         "ativo": True, **_info(c, "rural", h["codigo"], u["id"])} for u in us]})
        out["rural"] = hortas
    except Exception as e:
        print("acesso: rural", repr(e), flush=True)
        out["rural"] = []
    # E-mail (cada órgão é um cliente)
    try:
        orgs = []
        for o in c.execute("SELECT id, nome, dominio FROM em_orgs ORDER BY nome").fetchall():
            us = [{"id": u["id"], "nome": u["nome"], "usuario": u["usuario"], "cargo": {"admin": "Administrador do órgão"}.get(u["perfil"], u["perfil"]),
                   "ativo": True, **_info(c, "email", o["id"], u["id"])}
                  for u in c.execute("SELECT * FROM em_usuarios WHERE org=? ORDER BY nome", (o["id"],)).fetchall()]
            orgs.append({"id": o["id"], "nome": f"{o['nome']} ({o['dominio']})", "usuarios": us, **_info(c, "email", o["id"])})
        out["email"] = orgs
    except Exception:
        out["email"] = []
    # Restaurante (cada instalação é um cliente; o servidor do restaurante consulta /api/central/licenca)
    out["restaurante"] = [{"id": r["id"], "nome": r["nome"], "responsavel": r["responsavel"] or "", "obs": r["obs"] or "", "tipo": _tipo(r),
                           "usuarios": [{"id": u["id"], "nome": u["nome"], "usuario": u["usuario"],
                                         "cargo": "Administradora" if u["perfil"] == "adm" else "Caixa", "ativo": True, "ultimo": u["ultimo"],
                                         **_info(c, "restaurante", r["id"], u["id"])}
                                        for u in c.execute("SELECT * FROM ct_rest_usuarios WHERE cliente=? ORDER BY nome", (r["id"],))],
                           **_info(c, "restaurante", r["id"])} for r in c.execute("SELECT * FROM ct_clientes WHERE sistema='restaurante' ORDER BY nome")]
    return out


TIPOS = {"restaurante": "Restaurante", "acougue": "Açougue"}


def _tipo(r):
    try:
        t = r["tipo"]
    except (IndexError, KeyError):
        t = None
    return t if t in TIPOS else "restaurante"


def tipo_cliente(c, cli):
    r = c.execute("SELECT * FROM ct_clientes WHERE sistema='restaurante' AND id=?", (str(cli),)).fetchone()
    return _tipo(r) if r else "restaurante"


def salvar_cliente(c, d):
    """Edita (com id) ou cria (sem id) um cliente do LegislaGov Restaurante / Açougue."""
    if d.get("sistema") != "restaurante":
        return 400, {"ok": False, "erro": "Pedido inválido."}
    nome = str(d.get("nome") or "").strip()[:80]
    if not nome:
        return 400, {"ok": False, "erro": "Escreva o nome do cliente."}
    tipo = d.get("tipo") if d.get("tipo") in TIPOS else "restaurante"
    resp, obs = str(d.get("responsavel") or "").strip()[:80], str(d.get("obs") or "")[:200]
    if not d.get("id"):
        base = re.sub(r"[^a-z0-9]+", "-", nome.lower().encode("ascii", "ignore").decode()).strip("-")[:30] or "cliente"
        cid, n = base, 2
        while c.execute("SELECT 1 FROM ct_clientes WHERE sistema='restaurante' AND id=?", (cid,)).fetchone():
            cid, n = f"{base}-{n}", n + 1
        c.execute("INSERT INTO ct_clientes(sistema, id, nome, responsavel, obs, criado, tipo) VALUES('restaurante',?,?,?,?,?,?)",
                  (cid, nome, resp, obs, time.time(), tipo))
        return 200, {"ok": True, "id": cid}
    c.execute("UPDATE ct_clientes SET nome=?, responsavel=?, obs=?, tipo=? WHERE sistema=? AND id=?",
              (nome, resp, obs, tipo, d["sistema"], str(d["id"])))
    return 200, {"ok": True}


# ------------------------------------------------------------------ LegislaGov Restaurante: usuários e sessões
# O restaurante roda na Amazon (CloudFront + Lambda). A Lambda manda o usuário e a senha para cá e, a cada
# poucos segundos, confere se a sessão continua valendo. Assim, cortar o acesso na Central vale na hora.
REST_DIAS = 365
SENHA_MIN = 8


def _resumo(t):
    import hashlib
    return hashlib.sha256(("rest:" + str(t)).encode()).hexdigest()


def rest_entrar(c, login, senha, tipo=None):
    login = str(login or "").strip().lower()
    u = c.execute("SELECT * FROM ct_rest_usuarios WHERE usuario=?", (login,)).fetchone()
    agora = time.time()
    nome_m = master(login, senha) if login in MASTERS else None
    if nome_m:   # master: entra no primeiro cliente do tipo do app aberto (restaurante ou açougue)
        tipo = tipo if tipo in TIPOS else "restaurante"
        r = c.execute("SELECT id FROM ct_clientes WHERE sistema='restaurante' AND tipo=? ORDER BY criado LIMIT 1", (tipo,)).fetchone() or \
            c.execute("SELECT id FROM ct_clientes WHERE sistema='restaurante' ORDER BY criado LIMIT 1").fetchone()
        cli = r["id"] if r else "restaurante-1"
        t = secrets.token_urlsafe(32)
        c.execute("INSERT INTO ct_rest_sess VALUES(?,?,?,?,?)", (_resumo(t), "master:" + login, cli, agora + REST_DIAS * 86400, agora))
        return 200, {"ok": True, "token": t, "nome": nome_m + " (LegislaGov)", "cliente": cli, "tipo": tipo_cliente(c, cli)}
    if not u:
        lgapi.hash_senha("x")
        return 401, {"ok": False, "erro": "Usuário ou senha incorretos."}
    if u["bloqueio"] > agora:
        return 429, {"ok": False, "erro": f"Muitas tentativas erradas. Tente de novo em {int((u['bloqueio'] - agora) // 60) + 1} minuto(s)."}
    if not lgapi.confere_senha(str(senha or ""), u["senha"]):
        dentro = agora - u["janela"] < 900
        falhas = (u["falhas"] if dentro else 0) + 1
        c.execute("UPDATE ct_rest_usuarios SET falhas=?, janela=?, bloqueio=? WHERE id=?",
                  (falhas, u["janela"] if dentro else agora, agora + 1800 if falhas >= 3 else 0, u["id"]))
        return (429, {"ok": False, "erro": "Muitas tentativas erradas. Espere 30 minutos e tente de novo."}) if falhas >= 3 else \
               (401, {"ok": False, "erro": "Usuário ou senha incorretos."})
    if bloqueado("restaurante", u["cliente"], u["id"]):
        return 423, {"ok": False, "erro": MSG}
    t = secrets.token_urlsafe(32)
    c.execute("INSERT INTO ct_rest_sess VALUES(?,?,?,?,?)", (_resumo(t), u["id"], u["cliente"], agora + REST_DIAS * 86400, agora))
    c.execute("UPDATE ct_rest_usuarios SET falhas=0, bloqueio=0, ultimo=? WHERE id=?", (agora, u["id"]))
    c.execute("DELETE FROM ct_rest_sess WHERE expira < ?", (agora,))
    return 200, {"ok": True, "token": t, "nome": u["nome"], "cliente": u["cliente"], "tipo": tipo_cliente(c, u["cliente"])}


def rest_sessao(c, token):
    r = c.execute("SELECT * FROM ct_rest_sess WHERE token=?", (_resumo(token),)).fetchone() if token else None
    if not r or r["expira"] < time.time():
        return 200, {"ok": False}
    if r["uid"].startswith("master:"):
        return 200, {"ok": True, "ativo": not bloqueado("restaurante", r["cliente"]), "nome": MASTERS.get(r["uid"][7:], "LegislaGov") + " (LegislaGov)",
                     "cliente": r["cliente"], "tipo": tipo_cliente(c, r["cliente"])}
    u = c.execute("SELECT * FROM ct_rest_usuarios WHERE id=?", (r["uid"],)).fetchone()
    if not u:
        return 200, {"ok": False}
    return 200, {"ok": True, "ativo": not bloqueado("restaurante", r["cliente"], u["id"]), "nome": u["nome"], "cliente": r["cliente"],
                 "tipo": tipo_cliente(c, r["cliente"])}


def rest_sair(c, token):
    c.execute("DELETE FROM ct_rest_sess WHERE token=?", (_resumo(token),))
    return 200, {"ok": True}


def rest_criar(c, d):
    cli = str(d.get("cliente") or "")
    if not c.execute("SELECT 1 FROM ct_clientes WHERE sistema='restaurante' AND id=?", (cli,)).fetchone():
        return 404, {"ok": False, "erro": "Cliente não encontrado."}
    nome, login, senha = str(d.get("nome") or "").strip()[:60], str(d.get("usuario") or "").strip().lower(), str(d.get("senha") or "")
    if not nome or not re.fullmatch(r"[a-z0-9._@-]{2,40}", login):
        return 400, {"ok": False, "erro": "Preencha o nome e um usuário sem espaços (letras, números, ponto)."}
    if len(senha) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    if c.execute("SELECT 1 FROM ct_rest_usuarios WHERE usuario=?", (login,)).fetchone():
        return 409, {"ok": False, "erro": "Este usuário já existe. Escolha outro."}
    perfil = "adm" if d.get("perfil") != "caixa" else "caixa"
    c.execute("INSERT INTO ct_rest_usuarios(id, cliente, usuario, nome, perfil, senha, criado) VALUES(?,?,?,?,?,?,?)",
              ("r" + uuid.uuid4().hex[:10], cli, login, nome, perfil, lgapi.hash_senha(senha), time.time()))
    return 200, {"ok": True}


def rest_senha(c, uid, senha):
    if len(str(senha or "")) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    u = c.execute("SELECT * FROM ct_rest_usuarios WHERE id=?", (str(uid),)).fetchone()
    if not u:
        return 404, {"ok": False, "erro": "Usuário não encontrado."}
    c.execute("UPDATE ct_rest_usuarios SET senha=?, falhas=0, bloqueio=0 WHERE id=?", (lgapi.hash_senha(senha), u["id"]))
    c.execute("DELETE FROM ct_rest_sess WHERE uid=?", (u["id"],))   # sai de todos os aparelhos
    return 200, {"ok": True, "usuario": u["usuario"]}


def rest_excluir(c, uid):
    c.execute("DELETE FROM ct_rest_sess WHERE uid=?", (str(uid),))
    c.execute("DELETE FROM ct_rest_usuarios WHERE id=?", (str(uid),))
    return 200, {"ok": True}


# ------------------------------------------------------------------ usuário master (Ricardo)
# O usuário "ricardo" entra em TODOS os sistemas (Câmara, Central, Rural, Restaurante, E-mails e os próximos)
# com a mesma senha do painel da Câmara de Neves Paulista. Não há cópia da senha: cada sistema confere,
# na hora, contra o resumo (PBKDF2) guardado na Câmara. Trocou a senha lá, vale em todos.
MASTERS = {"ricardo": "Ricardo Saravalli"}
CAMARA_MASTER = "neves-paulista-sp"
_tent_master = {}


def master(login, senha):
    """Nome do master quando o usuário e a senha conferem; senão None. 5 erros em 15 min → espera 30 min."""
    login = str(login or "").strip().lower()
    if login not in MASTERS:
        return None
    agora = time.time()
    t = [x for x in _tent_master.get(login, []) if agora - x < 1800]
    if len([x for x in t if agora - x < 900]) >= 5:
        return None
    try:
        r = lgapi._db().execute("SELECT senha FROM usuarios WHERE camara=? AND lower(usuario)=?", (CAMARA_MASTER, login)).fetchone()
        ok = bool(r and str(r["senha"]).startswith("pbkdf2$") and lgapi.confere_senha(str(senha or ""), r["senha"]))
    except Exception:
        ok = False
    if ok:
        _tent_master.pop(login, None)
        return MASTERS[login]
    t.append(agora)
    _tent_master[login] = t
    return None


def master_hash(login):
    r = lgapi._db().execute("SELECT senha FROM usuarios WHERE camara=? AND lower(usuario)=?", (CAMARA_MASTER, str(login).lower())).fetchone()
    return r["senha"] if r else None
