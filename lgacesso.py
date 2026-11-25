"""LegislaGov — liga e desliga o acesso de clientes e usuários de todos os sistemas (Central > Administração > Sistemas e clientes).

Uma linha em ct_acesso com bloqueado preenchido corta o acesso:
  usuario = ""   → o cliente inteiro (a Câmara, a horta, o órgão do e-mail, o restaurante)
  usuario = id   → só aquela pessoa
Cada sistema consulta bloqueado() ao entrar e a cada pedido com sessão, então o corte vale na hora.
"""
import os, re, secrets, time, uuid

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
        c.execute("CREATE TABLE IF NOT EXISTS ct_migr(id TEXT PRIMARY KEY, quando REAL)")
        if not c.execute("SELECT 1 FROM ct_migr WHERE id='pedro-garcom'").fetchone():
            c.execute("UPDATE ct_rest_usuarios SET perfil='garcom' WHERE cliente='restaurante-1' AND (lower(nome) LIKE 'pedro%' OR lower(usuario) LIKE 'pedro%')")
            c.execute("INSERT INTO ct_migr VALUES('pedro-garcom', ?)", (time.time(),))
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
        if lgapi.eh_camara(chave[1]):
            cc = lgapi._cam(chave[1])
            if chave[2]:
                cc.execute("DELETE FROM sessoes WHERE camara=? AND usuario_id=?", (chave[1], chave[2]))
            else:
                cc.execute("DELETE FROM sessoes WHERE camara=?", (chave[1],))
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


ENTRADA_PAINEL = "https://painel.legislagov.com.br/painel/"   # entrada única: a pessoa escolhe a Câmara na lista


def painel_url(camara):
    """Endereço do painel de cada câmara, tirado do dominios.txt (prefere o endereço legislagov.com.br)."""
    try:
        arq = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ferramentas", "aws", "dominios.txt")
        doms = []
        for ln in open(arq, encoding="utf-8"):
            p = ln.split("#")[0].split()
            if len(p) >= 3 and p[1] == camara and p[2] in ("site", "sistema"):
                doms.append(p[0])
        doms.sort(key=lambda d: (not d.endswith(".legislagov.com.br"), d.startswith("www."), len(d)))
        return f"https://{doms[0]}/painel/" if doms else ENTRADA_PAINEL
    except OSError:
        return ""


def painel(c):
    """Tudo o que a aba "Sistemas e clientes" mostra."""
    _db()
    out = {"ok": True}
    # Câmara (painel legislativo)
    camaras = []
    for cam in lgapi.camaras_ids():
        us = []
        for u in lgapi.usuarios(cam):
            if u.get("pendente"):
                continue
            us.append({"id": u["id"], "nome": u.get("nome") or u["usuario"], "usuario": u["usuario"],
                       "cargo": " · ".join(x for x in (("Administrador" if u.get("perfil") == "admin" or u.get("orgao") == "ambos" else ""),
                                                        ("" if u.get("cargo") == "Administrador do sistema" else u.get("cargo") or ("" if u.get("perfil") == "admin" else u.get("perfil")) or "")) if x),
                       "cargoId": u.get("cargoId") or "", "admin": u.get("perfil") == "admin" or u.get("orgao") == "ambos", "ativo": u.get("ativo") is not False, **_info(c, "camara", cam, u["id"]),
                       **email_info(c, "camara", "camara:" + u["id"])})
        us.sort(key=lambda x: x["nome"].lower())
        ci = lgapi.camara_info(cam) or {}
        camaras.append({"id": cam, "nome": ci.get("nome") or NOMES_CAMARA.get(cam, cam), "cidade": ci.get("cidade") or "", "uf": ci.get("uf") or "",
                        "cnpj": ci.get("cnpj") or "", "ativa": bool(ci.get("ativo", 1)), "painel": painel_url(cam), "usuarios": us, **_info(c, "camara", cam)})
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
                                         "perfil": u["perfil"], "vendedorId": u["vendedorId"],
                                         "ativo": True, **_info(c, "rural", h["codigo"], u["id"]), **email_info(c, "rural", "rural:" + u["id"])} for u in us]})
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
                                         "cargo": PERFIS_REST.get(u["perfil"], "Administrador"), "perfil": u["perfil"] if u["perfil"] in PERFIS_REST else "adm",
                                         "ativo": True, "ultimo": u["ultimo"],
                                         **_info(c, "restaurante", r["id"], u["id"]), **email_info(c, "restaurante", "restaurante:" + u["id"])}
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


def rest_entrar(c, login, senha, tipo=None, dev=None, ip='', ua='', codigo=None):
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
    em = email_porta(c, "restaurante", "restaurante:" + u["id"], u["nome"], codigo)
    if em:
        return em
    cl = c.execute("SELECT nome FROM ct_clientes WHERE sistema='restaurante' AND id=?", (u["cliente"],)).fetchone()
    barra = porta(c, "restaurante", "restaurante:" + u["id"], f"{u['nome']} ({u['usuario']}) · {cl['nome'] if cl else u['cliente']}", dev, ip, ua)
    if barra:
        return barra
    t = secrets.token_urlsafe(32)
    c.execute("INSERT INTO ct_rest_sess VALUES(?,?,?,?,?)", (_resumo(t), u["id"], u["cliente"], agora + REST_DIAS * 86400, agora))
    c.execute("UPDATE ct_rest_usuarios SET falhas=0, bloqueio=0, ultimo=? WHERE id=?", (agora, u["id"]))
    c.execute("DELETE FROM ct_rest_sess WHERE expira < ?", (agora,))
    return 200, {"ok": True, "token": t, "nome": u["nome"], "cliente": u["cliente"], "tipo": tipo_cliente(c, u["cliente"]), "perfil": u["perfil"]}


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
                 "tipo": tipo_cliente(c, r["cliente"]), "perfil": u["perfil"]}


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
    perfil = d.get("perfil") if d.get("perfil") in PERFIS_REST else "adm"
    if str(d.get("email") or "").strip() and not email_ok(d.get("email")):
        return 400, {"ok": False, "erro": "E-mail inválido."}
    uid = "r" + uuid.uuid4().hex[:10]
    c.execute("INSERT INTO ct_rest_usuarios(id, cliente, usuario, nome, perfil, senha, criado) VALUES(?,?,?,?,?,?,?)",
              (uid, cli, login, nome, perfil, lgapi.hash_senha(senha), time.time()))
    if str(d.get("email") or "").strip():
        email_definir(c, "restaurante", "restaurante:" + uid, d.get("email"))
    return 200, {"ok": True, "id": uid}


PERFIS_REST = {"adm": "Administrador", "caixa": "Caixa", "garcom": "Garçom"}


def rest_perfil(c, uid, perfil):
    if perfil not in PERFIS_REST:
        return 400, {"ok": False, "erro": "Função inválida."}
    u = c.execute("SELECT * FROM ct_rest_usuarios WHERE id=?", (str(uid),)).fetchone()
    if not u:
        return 404, {"ok": False, "erro": "Usuário não encontrado."}
    c.execute("UPDATE ct_rest_usuarios SET perfil=? WHERE id=?", (perfil, u["id"]))
    c.execute("DELETE FROM ct_rest_sess WHERE uid=?", (u["id"],))   # entra de novo já com a função nova
    return 200, {"ok": True, "nome": u["nome"], "perfil": PERFIS_REST[perfil]}


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
        r = lgapi._cam(CAMARA_MASTER).execute("SELECT senha FROM usuarios WHERE camara=? AND lower(usuario)=?", (CAMARA_MASTER, login)).fetchone()
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
    r = lgapi._cam(CAMARA_MASTER).execute("SELECT senha FROM usuarios WHERE camara=? AND lower(usuario)=?", (CAMARA_MASTER, str(login).lower())).fetchone()
    return r["senha"] if r else None


# ------------------------------------------------------------------ aparelhos autorizados (pedido de 20/11/2026)
# Cada computador/celular recebe uma marca (cookie lg_dev ou id do app) na primeira vez. Cada usuário pode ter
# até LIMITE_APARELHOS liberados; os primeiros entram sozinhos, o seguinte fica "pendente" esperando a GR liberar
# na Central (Segurança › Aparelhos). Todo acesso fica registrado com IP, aparelho e horário.
# O usuário master (Ricardo) não tem limite.
LIMITE_APARELHOS = 3
_ap = {"ok": False}


def _apdb(c):
    if not _ap["ok"]:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS ct_aparelhos(sistema TEXT NOT NULL, conta TEXT NOT NULL, dev TEXT NOT NULL, rotulo TEXT, nome TEXT, ip TEXT, ua TEXT,
            primeiro REAL, ultimo REAL, status TEXT NOT NULL DEFAULT 'ok', PRIMARY KEY(sistema, conta, dev));
        CREATE TABLE IF NOT EXISTS ct_acessos(id INTEGER PRIMARY KEY AUTOINCREMENT, sistema TEXT, conta TEXT, rotulo TEXT, dev TEXT, nome TEXT,
            ip TEXT, quando REAL, resultado TEXT);
        """)
        _ap["ok"] = True
    return c


def nome_aparelho(ua):
    ua = str(ua or "")
    so = ("iPhone" if "iPhone" in ua else "iPad" if "iPad" in ua else "Celular Android" if "Android" in ua and "Mobile" in ua
          else "Tablet Android" if "Android" in ua else "Computador Windows" if "Windows" in ua else "Mac" if "Macintosh" in ua
          else "Linux" if "Linux" in ua else "Aparelho")
    nav = ("Edge" if "Edg/" in ua else "Opera" if "OPR/" in ua else "Samsung Internet" if "SamsungBrowser" in ua else "Chrome" if "Chrome/" in ua
           else "Firefox" if "Firefox/" in ua else "Safari" if "Safari/" in ua else "")
    return so + (" · " + nav if nav else "")


def dev_valido(dev):
    dev = str(dev or "")
    return dev if re.fullmatch(r"[A-Za-z0-9_-]{16,64}", dev) else ""


def porta(c, sistema, conta, rotulo, dev, ip, ua):
    """Confere o aparelho no login. Devolve None se pode entrar, ou (código, resposta) se não pode."""
    _apdb(c)
    agora, dev = time.time(), dev_valido(dev)
    nome = nome_aparelho(ua)
    if not dev:   # app antigo sem marca: registra o acesso, não barra (o app novo sempre manda)
        c.execute("INSERT INTO ct_acessos(sistema, conta, rotulo, dev, nome, ip, quando, resultado) VALUES(?,?,?,?,?,?,?,?)",
                  (sistema, conta, rotulo, "", nome, ip, agora, "entrou (app antigo, sem marca)"))
        return None
    r = c.execute("SELECT * FROM ct_aparelhos WHERE sistema=? AND conta=? AND dev=?", (sistema, conta, dev)).fetchone()
    res, bloq = "entrou", None
    if r and r["status"] == "ok":
        c.execute("UPDATE ct_aparelhos SET ultimo=?, ip=?, ua=?, nome=?, rotulo=? WHERE sistema=? AND conta=? AND dev=?",
                  (agora, ip, str(ua)[:300], nome, rotulo, sistema, conta, dev))
    elif r and r["status"] == "recusado":
        res, bloq = "recusado", "Este aparelho foi recusado para este usuário. Fale com a GR Software."
        c.execute("UPDATE ct_aparelhos SET ultimo=?, ip=? WHERE sistema=? AND conta=? AND dev=?", (agora, ip, sistema, conta, dev))
    else:
        n = c.execute("SELECT COUNT(*) FROM ct_aparelhos WHERE sistema=? AND conta=? AND status='ok'", (sistema, conta)).fetchone()[0]
        if n < LIMITE_APARELHOS and not r:
            c.execute("INSERT INTO ct_aparelhos VALUES(?,?,?,?,?,?,?,?,?,'ok')", (sistema, conta, dev, rotulo, nome, ip, str(ua)[:300], agora, agora))
            res = f"entrou (aparelho novo liberado, {n + 1} de {LIMITE_APARELHOS})"
        else:
            if r:
                c.execute("UPDATE ct_aparelhos SET ultimo=?, ip=?, ua=?, nome=?, rotulo=? WHERE sistema=? AND conta=? AND dev=?",
                          (agora, ip, str(ua)[:300], nome, rotulo, sistema, conta, dev))
            else:
                c.execute("INSERT INTO ct_aparelhos VALUES(?,?,?,?,?,?,?,?,?,'pendente')", (sistema, conta, dev, rotulo, nome, ip, str(ua)[:300], agora, agora))
            res = "barrado (aparelho novo esperando liberação)"
            bloq = (f"Este aparelho ainda não está liberado. Seu usuário já tem {LIMITE_APARELHOS} aparelhos liberados. "
                    "Peça para a GR Software liberar este aparelho e tente de novo.")
    c.execute("INSERT INTO ct_acessos(sistema, conta, rotulo, dev, nome, ip, quando, resultado) VALUES(?,?,?,?,?,?,?,?)",
              (sistema, conta, rotulo, dev, nome, ip, agora, res))
    c.execute("DELETE FROM ct_acessos WHERE quando < ?", (agora - 120 * 86400,))
    if bloq:
        return 403, {"ok": False, "aparelho": True, "erro": bloq}
    return None


def aparelho_ok(c, sistema, conta, dev):
    """Para conferir sessões já abertas: o aparelho continua liberado?"""
    _apdb(c)
    dev = dev_valido(dev)
    if not dev:
        return True
    r = c.execute("SELECT status FROM ct_aparelhos WHERE sistema=? AND conta=? AND dev=?", (sistema, conta, dev)).fetchone()
    return not r or r["status"] == "ok"


def aparelhos_lista(c):
    _apdb(c)
    ap = [dict(r) for r in c.execute("SELECT sistema, conta, dev, rotulo, nome, ip, primeiro, ultimo, status FROM ct_aparelhos ORDER BY ultimo DESC")]
    ac = [dict(r) for r in c.execute("SELECT sistema, conta, rotulo, dev, nome, ip, quando, resultado FROM ct_acessos ORDER BY id DESC LIMIT 300")]
    return {"ok": True, "limite": LIMITE_APARELHOS, "aparelhos": ap, "acessos": ac,
            "pendentes": sum(1 for a in ap if a["status"] == "pendente")}


def aparelhos_pendentes(c):
    try:
        _apdb(c)
        return c.execute("SELECT COUNT(*) FROM ct_aparelhos WHERE status='pendente'").fetchone()[0]
    except Exception:
        return 0


def _matar_sessoes(c, sistema, conta):
    uid = conta.split(":", 1)[1] if ":" in conta else conta
    try:
        if sistema == "restaurante":
            c.execute("DELETE FROM ct_rest_sess WHERE uid=?", (uid,))
        elif sistema == "rural":
            c.execute("DELETE FROM rural_sess WHERE usuario_id=?", (uid,))
        elif sistema == "email":
            c.execute("DELETE FROM em_sess WHERE usuario_id=?", (uid,))
    except Exception as e:
        print("aparelhos: encerrar sessões", sistema, repr(e), flush=True)


def aparelho_acao(c, d):
    _apdb(c)
    sis, conta, dev, acao = str(d.get("sistema") or ""), str(d.get("conta") or ""), str(d.get("dev") or ""), d.get("acao")
    r = c.execute("SELECT * FROM ct_aparelhos WHERE sistema=? AND conta=? AND dev=?", (sis, conta, dev)).fetchone()
    if not r:
        return 404, {"ok": False, "erro": "Aparelho não encontrado."}
    if acao == "liberar":
        c.execute("UPDATE ct_aparelhos SET status='ok' WHERE sistema=? AND conta=? AND dev=?", (sis, conta, dev))
    elif acao == "recusar":
        c.execute("UPDATE ct_aparelhos SET status='recusado' WHERE sistema=? AND conta=? AND dev=?", (sis, conta, dev))
        _matar_sessoes(c, sis, conta)
    elif acao == "remover":   # tira da lista: se voltar, conta como aparelho novo
        c.execute("DELETE FROM ct_aparelhos WHERE sistema=? AND conta=? AND dev=?", (sis, conta, dev))
        _matar_sessoes(c, sis, conta)
    else:
        return 400, {"ok": False, "erro": "Ação inválida."}
    return 200, {"ok": True, "rotulo": r["rotulo"], "nome": r["nome"]}


def dev_do_pedido(h):
    """Marca do aparelho pelo cookie lg_dev (sistemas no nosso servidor). Cria uma nova se não houver."""
    ck = h.headers.get("Cookie", "") or ""
    m = re.search(r"(?:^|;\s*)lg_dev=([A-Za-z0-9_-]{16,64})", ck)
    if m:
        return m.group(1)
    d = secrets.token_urlsafe(24)
    h._lg_cookie = f"lg_dev={d}; Path=/; Max-Age=157680000; HttpOnly; Secure; SameSite=Lax"
    return d


def porta_login(c, h, sistema, cod, r, ip, rotulo_fn, resumo_fn, codigo=None):
    """Chamado depois de um login 200: confere o aparelho; se não puder, desfaz a sessão e devolve o recusa."""
    if cod != 200 or not r.get("token"):
        return cod, r
    s = r.get("sessao") or {}
    uid = s.get("uid") or s.get("id")
    if not uid or str(uid).startswith("master:") or str(s.get("usuario", "")) in MASTERS:
        return cod, r
    barra = email_porta(c, sistema, f"{sistema}:{uid}", s.get("nome") or s.get("usuario") or "", codigo) or \
        porta(c, sistema, f"{sistema}:{uid}", rotulo_fn(s), dev_do_pedido(h), ip, h.headers.get("User-Agent", ""))
    if barra:
        tabela, col = {"rural": ("rural_sess", "token"), "email": ("em_sess", "token")}[sistema]
        c.execute(f"DELETE FROM {tabela} WHERE {col}=?", (resumo_fn(r["token"]),))
        return barra
    return cod, r


# ------------------------------------------------------------------ usuários da Câmara criados pela Central (20/11/2026)
CARGOS_CAMARA = [  # mesmos cargos do painel (painel/lgcg-cargos.js)
    {"id": "vereador", "nome": "Vereador(a)", "perfil": "usuario", "setor": "Gabinete", "unico": False},
    {"id": "procurador", "nome": "Procurador(a) Legislativo", "perfil": "procurador", "setor": "Procuradoria Legislativa", "unico": True},
    {"id": "diretora", "nome": "Diretor(a) de Secretaria", "perfil": "secretaria", "setor": "Secretaria Legislativa", "unico": True},
    {"id": "contabil", "nome": "Técnico(a) Contábil", "perfil": "financeiro", "setor": "Contabilidade", "unico": True},
    {"id": "tesoureira", "nome": "Tesoureiro(a)", "perfil": "financeiro", "setor": "Tesouraria", "unico": True},
    {"id": "servidor", "nome": "Servidor(a)", "perfil": "servidor", "setor": "", "unico": False},
]


def _cargo(cid):
    return next((x for x in CARGOS_CAMARA if x["id"] == cid), None)


def _cargo_ocupado(camara, cid, menos=None):
    if not (_cargo(cid) or {}).get("unico"):
        return False
    return any(u.get("cargoId") == cid and u["id"] != menos and (u.get("ativo") is not False or u.get("pendente")) for u in lgapi.usuarios(camara))


def camara_criar(c, d, por):
    cam, nome, login = str(d.get("camara") or ""), str(d.get("nome") or "").strip()[:120], str(d.get("usuario") or "").strip()
    senha, cg, adm = str(d.get("senha") or ""), _cargo(str(d.get("cargoId") or "")), bool(d.get("admin"))
    if not lgapi.eh_camara(cam):
        return 404, {"ok": False, "erro": "Câmara não encontrada."}
    lgapi.semear(cam)
    cc = lgapi._cam(cam)
    if not nome or not re.fullmatch(r"[\w.\-]{3,30}", login):
        return 400, {"ok": False, "erro": "Preencha o nome e um usuário de 3 a 30 letras ou números, sem espaços."}
    if len(senha) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    if not cg and not adm:
        return 400, {"ok": False, "erro": "Escolha o cargo (ou marque que é administrador)."}
    if cc.execute("SELECT 1 FROM usuarios WHERE camara=? AND lower(usuario)=lower(?)", (cam, login)).fetchone():
        return 409, {"ok": False, "erro": "Este usuário já existe nesta Câmara."}
    if cg and _cargo_ocupado(cam, cg["id"]):
        return 409, {"ok": False, "erro": f"Já existe um usuário ativo no cargo {cg['nome']} (é um cargo único)."}
    cg = cg or {"id": "", "nome": "Administrador do sistema", "setor": "", "perfil": "admin"}
    dados = {"usuario": login, "nome": nome, "cargoId": cg["id"], "cargo": cg["nome"], "setor": cg["setor"],
             "perfil": "admin" if adm else cg["perfil"], "orgao": "cam", "municipio": lgapi.municipio_da_camara(cam),
             "ativo": True, "pendente": False, "criadoEm": lgapi.agora(), "trocarSenha": True}
    if str(d.get("email") or "").strip() and not email_ok(d.get("email")):
        return 400, {"ok": False, "erro": "E-mail inválido."}
    novo_id = lgapi._criar_usuario(cam, dados, senha)
    if str(d.get("email") or "").strip():
        email_definir(c, "camara", "camara:" + novo_id, d.get("email"))
        lgapi._gravar_dados_usuario(novo_id, lambda x: x.update({"email": email_ok(d.get("email"))}))
    lgapi.registrar(cam, por, "Usuário criado pela GR Central", f"{login} · {cg['nome']}{' · administrador' if adm and cg['id'] else ''}")
    return 200, {"ok": True}


def camara_editar(c, d, por):
    uid, cam = str(d.get("id") or ""), str(d.get("camara") or "")
    u = next((x for x in lgapi.usuarios(cam) if x["id"] == uid), None)
    if not u:
        return 404, {"ok": False, "erro": "Usuário não encontrado."}
    cg = _cargo(str(d.get("cargoId") or u.get("cargoId") or ""))
    adm = bool(d.get("admin"))
    if cg and cg["id"] != u.get("cargoId") and _cargo_ocupado(cam, cg["id"], uid):
        return 409, {"ok": False, "erro": f"Já existe um usuário ativo no cargo {cg['nome']} (é um cargo único)."}

    def muda(x):
        if cg:
            x.update({"cargoId": cg["id"], "cargo": cg["nome"], "setor": x.get("setor") or cg["setor"]})
        x["perfil"] = "admin" if adm else ((cg or {}).get("perfil") or ("usuario" if x.get("perfil") == "admin" else x.get("perfil") or "usuario"))
    lgapi._gravar_dados_usuario(uid, muda)
    lgapi._marcar_usuarios(cam)
    lgapi._cam(cam).execute("DELETE FROM sessoes WHERE usuario_id=?", (uid,))   # entra de novo já com o cargo novo
    lgapi.registrar(cam, por, "Cargo alterado pela GR Central", f"{u['usuario']} · {(cg or {}).get('nome', '')}{' · administrador' if adm else ''}")
    return 200, {"ok": True}


def camara_senha(c, d, por):
    uid, cam, senha = str(d.get("id") or ""), str(d.get("camara") or ""), str(d.get("senha") or "")
    if len(senha) < SENHA_MIN:
        return 400, {"ok": False, "erro": f"A senha precisa ter pelo menos {SENHA_MIN} caracteres."}
    u = next((x for x in lgapi.usuarios(cam) if x["id"] == uid), None)
    if not u:
        return 404, {"ok": False, "erro": "Usuário não encontrado."}
    cc = lgapi._cam(cam)
    cc.execute("UPDATE usuarios SET senha=? WHERE id=?", (lgapi.hash_senha(senha), uid))

    def muda(x):
        x["trocarSenha"] = True
        x.pop("bloqueada", None)
        x.pop("falhasSenha", None)
    lgapi._gravar_dados_usuario(uid, muda)
    cc.execute("DELETE FROM sessoes WHERE usuario_id=?", (uid,))
    lgapi.registrar(cam, por, "Senha nova dada pela GR Central", u["usuario"])
    return 200, {"ok": True, "usuario": u["usuario"]}


# ------------------------------------------------------------------ confirmação de e-mail (21/11/2026)
# Usuário criado pela Central com e-mail: no primeiro acesso (e sempre que o e-mail mudar) recebe um código de 6 números
# e só entra depois de digitar o código. Quem não tem e-mail cadastrado entra como antes.
REMETENTE_EMAIL = {"camara": None}   # None = remetente padrão do LegislaGov; os outros saem como GR Software
NOME_SIS = {"restaurante": "GR Restaurante / Açougue", "rural": "GR Rural", "email": "Painel de e-mails", "camara": "LegislaGov"}


def _emdb(c):
    c.execute("""CREATE TABLE IF NOT EXISTS ct_email(sistema TEXT NOT NULL, conta TEXT NOT NULL, email TEXT NOT NULL, confirmado REAL,
                 cod TEXT, expira REAL, tentativas INTEGER DEFAULT 0, enviado REAL, PRIMARY KEY(sistema, conta))""")
    return c


def email_ok(e):
    e = str(e or "").strip().lower()
    return e if re.fullmatch(r"[^@\s]{1,64}@[^@\s]+\.[a-z]{2,}", e) and len(e) <= 120 else ""


def mascara_email(e):
    u, _, d = e.partition("@")
    return (u[:2] + "•" * max(1, len(u) - 2)) + "@" + d


def email_definir(c, sistema, conta, email):
    """Guarda (ou troca) o e-mail do usuário. Vazio = tira. E-mail novo precisa ser confirmado no próximo acesso."""
    _emdb(c)
    e = email_ok(email)
    if not str(email or "").strip():
        c.execute("DELETE FROM ct_email WHERE sistema=? AND conta=?", (sistema, conta))
        return 200, {"ok": True}
    if not e:
        return 400, {"ok": False, "erro": "E-mail inválido."}
    r = c.execute("SELECT email FROM ct_email WHERE sistema=? AND conta=?", (sistema, conta)).fetchone()
    if r and r["email"] == e:
        return 200, {"ok": True}
    c.execute("INSERT OR REPLACE INTO ct_email(sistema, conta, email, confirmado, tentativas) VALUES(?,?,?,NULL,0)", (sistema, conta, e))
    return 200, {"ok": True}


def email_info(c, sistema, conta):
    _emdb(c)
    r = c.execute("SELECT email, confirmado FROM ct_email WHERE sistema=? AND conta=?", (sistema, conta)).fetchone()
    return {"email": r["email"], "emailOk": bool(r["confirmado"])} if r else {"email": "", "emailOk": False}


def _hash_cod(conta, cod):
    import hashlib
    return hashlib.sha256(f"{conta}|{cod}".encode()).hexdigest()


def email_porta(c, sistema, conta, nome, codigo):
    """No login, depois da senha certa. None = pode entrar; senão (403, resposta pedindo o código)."""
    _emdb(c)
    r = c.execute("SELECT * FROM ct_email WHERE sistema=? AND conta=?", (sistema, conta)).fetchone()
    if not r or r["confirmado"]:
        return None
    agora, codigo = time.time(), re.sub(r"\D", "", str(codigo or ""))
    base = {"ok": False, "precisaCodigo": True, "email": mascara_email(r["email"])}
    if codigo:
        if r["cod"] and (r["expira"] or 0) > agora and (r["tentativas"] or 0) < 5 and secrets.compare_digest(_hash_cod(conta, codigo), r["cod"]):
            c.execute("UPDATE ct_email SET confirmado=?, cod=NULL, expira=NULL, tentativas=0 WHERE sistema=? AND conta=?", (agora, sistema, conta))
            return None
        c.execute("UPDATE ct_email SET tentativas=COALESCE(tentativas,0)+1 WHERE sistema=? AND conta=?", (sistema, conta))
        if (r["tentativas"] or 0) + 1 >= 5 or (r["expira"] or 0) <= agora:
            c.execute("UPDATE ct_email SET cod=NULL, expira=NULL WHERE sistema=? AND conta=?", (sistema, conta))
            return 403, {**base, "erro": "Código vencido ou com muitas tentativas. Toque em Entrar de novo para receber um código novo."}
        return 403, {**base, "erro": "Código errado. Confira no e-mail e digite de novo."}
    if r["cod"] and (r["expira"] or 0) > agora and agora - (r["enviado"] or 0) < 60:
        return 403, {**base, "erro": f"Enviamos um código de 6 números para {base['email']}. Digite o código para entrar."}
    cod = f"{secrets.randbelow(10 ** 6):06d}"
    c.execute("UPDATE ct_email SET cod=?, expira=?, enviado=?, tentativas=0 WHERE sistema=? AND conta=?",
              (_hash_cod(conta, cod), agora + 15 * 60, agora, sistema, conta))
    import lgenvio
    sis = NOME_SIS.get(sistema, "GR Software")
    texto = (f"Olá, {nome}!\n\nSeu código para confirmar o e-mail e entrar no {sis} é:\n\n    {cod}\n\n"
             "Ele vale por 15 minutos. Copie e cole na tela de entrada.\n\n"
             "Se não foi você que tentou entrar, ignore este e-mail e avise o administrador.\n\n— "
             + ("LegislaGov" if sistema == "camara" else "GR Software · grsoftware.com.br"))
    ok = lgenvio.enviar(r["email"], f"{cod} é o seu código de confirmação — {sis}", texto,
                        None if sistema == "camara" else lgenvio.REMETENTE_GR)
    if not ok:
        return 503, {**base, "erro": "Não conseguimos enviar o código agora. Tente de novo em alguns minutos."}
    return 403, {**base, "erro": f"Enviamos um código de 6 números para {base['email']}. Digite o código para entrar."}


def email_admin(c, d):
    sis, uid = str(d.get("sistema") or ""), str(d.get("id") or "")
    if sis not in ("restaurante", "rural", "camara") or not re.fullmatch(r"[A-Za-z0-9_:.-]{1,80}", uid):
        return 400, {"ok": False, "erro": "Pedido inválido."}
    cod, r = email_definir(c, sis, f"{sis}:{uid}", d.get("email"))
    if cod == 200 and sis == "camara" and email_ok(d.get("email")):
        try:
            lgapi._gravar_dados_usuario(uid, lambda x: x.update({"email": email_ok(d.get("email"))}))
        except Exception:
            pass
    return cod, r
