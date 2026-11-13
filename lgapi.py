"""
LegislaGov — banco de dados e API (SQLite, só biblioteca padrão do Python).

Liga com LG_BANCO=1 (só no servidor da Amazon). Sem isso, o sistema continua no modo
demonstração (dados no navegador), como no Render.

Modelo: cada câmara tem seus dados separados (coluna `camara`). O navegador continua
usando as mesmas chaves de antes (protocolos, agenda, composição...); o arquivo
assets/sincronia.js copia essas chaves do servidor ao abrir e envia cada alteração.

Rotas:
  GET  /api/inicio                 dados para abrir a página (usuário logado + dados; ou só os públicos)
  POST /api/login | /api/logout    entrar / sair (cookie HttpOnly)
  POST /api/cadastro               pedido de cadastro (fica aguardando liberação)
  POST /api/senha                  trocar a própria senha
  GET  /api/cargos                 cargos únicos já ocupados (tela de cadastro)
  PUT  /api/dados/<chave>          grava uma chave (com controle de versão)
  GET  /api/mudancas?desde=N       o que mudou desde a última conferida
  POST /api/publico/enviar         envios do site (ouvidoria, e-SIC, fale conosco, inscrições)
"""
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time

PASTA = os.path.dirname(os.path.abspath(__file__))
ATIVO = os.environ.get("LG_BANCO", "0") == "1"
PASTA_DADOS = os.environ.get("LG_DADOS") or os.path.join(PASTA, "dados_servidor")
ARQ = os.path.join(PASTA_DADOS, "legislagov.db")
SENHA_PROVISORIA = os.environ.get("LG_SENHA_PROVISORIA", "")   # sem senha padrão: quem cria o usuário define
SESSAO_DIAS = 7

_trava = threading.RLock()
_con = None

# ---------------------------------------------------------------- chaves
CHAVE_USUARIOS = "lg_camara_local_users_v3"
# só deste aparelho (aparência, rascunhos, caches): nunca vão para o servidor
LOCAIS = re.compile(r"^(site_(tema|fonte|cookies|contraste)|lg_contraste|lgv31_.*|lgv27_theme_v1|lgtr_.*|lg_brasao_v1|lgtv_cache_v1|"
                    r"lg_previa_.*|legislagov_v7_rascunho_.*|lgc_seguindo_v1|lg_area|lgp_escolher|lgvr_como|legislagov_session_v1|"
                    r"lg_camara_session_v3|lgsync_.*)$")
# o site (sem login) pode ler
PUBLICAS = re.compile(r"^(lg_seed_perfis_v2|lgv_camara_v1|lgv11_agenda_v1|lgt_site_noticias_v1|lgt_transp_v1|lgt_publicadores_v1|lgt_site_cfg_v1|"
                      r"lgs_site_[a-z]+_v1|lgpl_v1|lgll_v1|legislagov_protocolos_v2_.*|lgo_v1)$")
# o site pode acrescentar itens (não pode ler o conteúdo completo)
ENVIO_PUBLICO = {"lgo_v1", "site_mensagens", "site_inscricoes", "lgc_inscricoes_v1"}
# só administrador / Procuradoria gravam
SO_GESTOR = {"lgt_areas_v1"}
CAMPOS_PESSOAIS = {"nome", "email", "telefone", "cpf", "endereco", "anexo", "anexos", "arquivo", "contato", "ip", "origemIp"}

CARGOS_UNICOS = {"diretora", "contabil", "tesoureira", "procurador"}


def ativo():
    return ATIVO


def _db():
    global _con
    if _con is None:
        os.makedirs(PASTA_DADOS, exist_ok=True)
        _con = sqlite3.connect(ARQ, check_same_thread=False, isolation_level=None, timeout=15)
        _con.row_factory = sqlite3.Row
        _con.execute("PRAGMA journal_mode=WAL")
        _con.execute("PRAGMA synchronous=NORMAL")
        _con.executescript("""
        CREATE TABLE IF NOT EXISTS usuarios(id TEXT PRIMARY KEY, camara TEXT NOT NULL, usuario TEXT NOT NULL, senha TEXT NOT NULL,
            dados TEXT NOT NULL, criado TEXT, UNIQUE(camara, usuario));
        CREATE TABLE IF NOT EXISTS sessoes(token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL, camara TEXT NOT NULL, expira REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS dados(camara TEXT NOT NULL, chave TEXT NOT NULL, valor TEXT NOT NULL, versao INTEGER NOT NULL,
            seq INTEGER NOT NULL, quando TEXT, por TEXT, PRIMARY KEY(camara, chave));
        CREATE TABLE IF NOT EXISTS historico(id INTEGER PRIMARY KEY AUTOINCREMENT, camara TEXT, chave TEXT, versao INTEGER, valor TEXT, quando TEXT, por TEXT);
        CREATE TABLE IF NOT EXISTS registro(id INTEGER PRIMARY KEY AUTOINCREMENT, camara TEXT, quando TEXT, usuario TEXT, acao TEXT, detalhe TEXT, ip TEXT);
        CREATE TABLE IF NOT EXISTS contador(nome TEXT PRIMARY KEY, valor INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS arquivos(camara TEXT NOT NULL, id TEXT NOT NULL, tipo TEXT, tamanho INTEGER, publico INTEGER DEFAULT 0,
            criado TEXT, por TEXT, PRIMARY KEY(camara, id));
        CREATE INDEX IF NOT EXISTS ix_dados_seq ON dados(camara, seq);
        CREATE INDEX IF NOT EXISTS ix_hist ON historico(camara, chave, id);
        """)
        if "acesso" not in [r[1] for r in _con.execute("PRAGMA table_info(arquivos)")]:
            _con.execute("ALTER TABLE arquivos ADD COLUMN acesso TEXT")   # quem pode abrir (expedientes e mensagens)
        # 12/11/2026: a chave de sessão passa a ser guardada só como resumo (sha256), como as senhas.
        # As sessões abertas continuam valendo: o valor antigo vira o resumo dele mesmo.
        if not _con.execute("SELECT 1 FROM contador WHERE nome='sessoes_resumo_v1'").fetchone():
            for r in _con.execute("SELECT token FROM sessoes").fetchall():
                _con.execute("UPDATE sessoes SET token=? WHERE token=?", (_resumo(r[0]), r[0]))
            _con.execute("INSERT INTO contador(nome, valor) VALUES('sessoes_resumo_v1', 1)")
    return _con


def _resumo(token):
    return "h:" + hashlib.sha256(str(token).encode()).hexdigest()


def agora():
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")


def _seq():
    c = _db()
    c.execute("INSERT INTO contador(nome, valor) VALUES('seq', 1) ON CONFLICT(nome) DO UPDATE SET valor = valor + 1")
    return c.execute("SELECT valor FROM contador WHERE nome='seq'").fetchone()[0]


def registrar(camara, usuario, acao, detalhe="", ip=""):
    try:
        _db().execute("INSERT INTO registro(camara, quando, usuario, acao, detalhe, ip) VALUES(?,?,?,?,?,?)",
                      (camara, agora(), usuario, acao, str(detalhe)[:500], ip))
    except Exception:
        pass


# ---------------------------------------------------------------- senhas
def hash_senha(senha):
    sal = secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac("sha256", senha.encode(), sal, 240_000)
    return "pbkdf2$240000$" + sal.hex() + "$" + h.hex()


def confere_senha(senha, guardado):
    try:
        _, it, sal, h = guardado.split("$")
        novo = hashlib.pbkdf2_hmac("sha256", senha.encode(), bytes.fromhex(sal), int(it))
        return hmac.compare_digest(novo.hex(), h)
    except Exception:
        return False


# ---------------------------------------------------------------- usuários
def _sem_senha(d):
    return {k: v for k, v in d.items() if k not in ("senha", "senhaHash")}


def usuarios(camara):
    lin = _db().execute("SELECT id, usuario, dados FROM usuarios WHERE camara=?", (camara,)).fetchall()
    out = []
    for r in lin:
        d = json.loads(r["dados"])
        d["id"], d["usuario"] = r["id"], r["usuario"]
        out.append(_sem_senha(d))
    return out


def _usuario(uid):
    r = _db().execute("SELECT * FROM usuarios WHERE id=?", (uid,)).fetchone()
    if not r:
        return None
    d = json.loads(r["dados"])
    d["id"], d["usuario"], d["camara"] = r["id"], r["usuario"], r["camara"]
    return d


def eh_gestor(u):
    if not u:
        return False
    return u.get("perfil") in ("admin", "procurador") or u.get("orgao") == "ambos" or u.get("cargoId") == "procurador"


def _marcar_usuarios(camara):
    """Avisa as telas abertas que a lista de usuários mudou (a lista vem da tabela de usuários)."""
    _db().execute("INSERT INTO dados(camara, chave, valor, versao, seq, quando, por) VALUES(?,?,?,?,?,?,?) "
                  "ON CONFLICT(camara, chave) DO UPDATE SET valor=excluded.valor, versao=dados.versao+1, seq=excluded.seq, quando=excluded.quando",
                  (camara, CHAVE_USUARIOS, str(time.time()), 1, _seq(), agora(), "sistema"))


def _criar_usuario(camara, dados, senha):
    uid = dados.get("id") or ("usr-" + secrets.token_hex(6))
    login = str(dados["usuario"]).strip()
    d = _sem_senha({k: v for k, v in dados.items() if k not in ("id", "usuario", "camara")})
    _db().execute("INSERT INTO usuarios(id, camara, usuario, senha, dados, criado) VALUES(?,?,?,?,?,?)",
                  (uid, camara, login, hash_senha(senha), json.dumps(d, ensure_ascii=False), agora()))
    _marcar_usuarios(camara)
    return uid


ADMINS = [("usr-ricardo", "Ricardo", "Ricardo Saravalli"), ("usr-geraldo", "Geraldo", "Geraldo José de Almeida Neto")]


def _id_admin(uid, camara):
    """O id do usuário é único no servidor inteiro; cada câmara tem os seus."""
    return f"{uid}-{camara}"


def _sem_senha_valida():
    """Senha impossível de acertar: a pessoa define a dela no servidor (legislagov-senha)."""
    return "!" + secrets.token_hex(24)


def semear(camara):
    """Primeiro acesso de uma câmara: só os administradores (Ricardo e Geraldo), sem cargo.
    Os demais se cadastram pela tela e o administrador libera."""
    c = _db()
    if not c.execute("SELECT 1 FROM usuarios WHERE camara=? LIMIT 1", (camara,)).fetchone():
        for uid, login_, nome in ADMINS:
            uid = _id_admin(uid, camara)
            _criar_usuario(camara, {"id": uid, "usuario": login_, "nome": nome, "cargo": "Administrador do sistema", "perfil": "admin",
                                    "orgao": "ambos", "municipio": "Neves Paulista — SP", "ativo": True}, "")
            c.execute("UPDATE usuarios SET senha=? WHERE id=?", (_sem_senha_valida(), uid))
        gravar(camara, "lg_seed_perfis_v2", "1", None, "sistema")
        registrar(camara, "sistema", "Câmara criada no banco", "administradores Ricardo e Geraldo")
    _limpeza_v2(camara)
    migrar_arquivos(camara)
    _herdar_senha_admins(camara)


# Endereços do Atendimento WhatsApp: os administradores (Ricardo e Geraldo) entram com a MESMA senha
# do painel da Câmara. Só copia o resumo (pbkdf2) da senha enquanto a pessoa ainda não definiu uma
# própria naquele endereço; nenhuma senha fica no código.
HERDA_SENHA = {"teste": "neves-paulista-sp", "prefeitura-neves-sp": "neves-paulista-sp"}


def _herdar_senha_admins(camara):
    origem = HERDA_SENHA.get(camara)
    if not origem:
        return
    c = _db()
    for _uid, login_, _nome in ADMINS:
        alvo = c.execute("SELECT id, senha FROM usuarios WHERE camara=? AND lower(usuario)=lower(?)", (camara, login_)).fetchone()
        fonte = c.execute("SELECT senha FROM usuarios WHERE camara=? AND lower(usuario)=lower(?)", (origem, login_)).fetchone()
        if alvo and fonte and str(alvo["senha"]).startswith("!") and str(fonte["senha"]).startswith("pbkdf2$"):
            c.execute("UPDATE usuarios SET senha=? WHERE id=?", (fonte["senha"], alvo["id"]))
            registrar(camara, "sistema", "Senha do administrador igual à do painel da Câmara", login_)


def _limpeza_v2(camara):
    """11/11/2026: tira os usuários de teste e a senha provisória; ficam só Ricardo e Geraldo."""
    c = _db()
    marca = "limpeza_v2:" + camara
    if c.execute("SELECT 1 FROM contador WHERE nome=?", (marca,)).fetchone():
        return
    manter = {_id_admin(a[0], camara) for a in ADMINS} | {a[0] for a in ADMINS}
    c.execute("DELETE FROM usuarios WHERE camara=? AND id NOT IN (%s)" % ",".join("?" * len(manter)), (camara, *manter))
    for uid, login_, nome in ADMINS:
        r0 = c.execute("SELECT id FROM usuarios WHERE camara=? AND lower(usuario)=lower(?)", (camara, login_)).fetchone()
        uid = r0["id"] if r0 else _id_admin(uid, camara)
        if not r0:
            _criar_usuario(camara, {"id": uid, "usuario": login_, "nome": nome, "cargo": "Administrador do sistema", "perfil": "admin",
                                    "orgao": "ambos", "municipio": "Neves Paulista — SP", "ativo": True}, "")
        c.execute("UPDATE usuarios SET senha=? WHERE id=? AND senha NOT LIKE 'pbkdf2$%'", (_sem_senha_valida(), uid))
        r = c.execute("SELECT senha FROM usuarios WHERE id=?", (uid,)).fetchone()
        if r and confere_senha("123456", r["senha"]):
            c.execute("UPDATE usuarios SET senha=? WHERE id=?", (_sem_senha_valida(), uid))
    c.execute("DELETE FROM sessoes WHERE camara=?", (camara,))
    # vereadores sem vínculo com os logins de teste
    r = c.execute("SELECT valor FROM dados WHERE camara=? AND chave='lgv_camara_v1'", (camara,)).fetchone()
    if r:
        try:
            comp = json.loads(r["valor"])
            for v in comp.get("vereadores", []):
                v.pop("usuario", None)
            gravar(camara, "lgv_camara_v1", json.dumps(comp, ensure_ascii=False), None, "sistema")
        except Exception:
            pass
    c.execute("INSERT INTO contador(nome, valor) VALUES(?, 1)", (marca,))
    _marcar_usuarios(camara)
    registrar(camara, "sistema", "Limpeza de usuários", "ficaram só os administradores")


def definir_senha(login_, senha, camara=None):
    """Usado pelo comando legislagov-senha no servidor (a pessoa digita a senha lá)."""
    q = "UPDATE usuarios SET senha=? WHERE lower(usuario)=lower(?)" + (" AND camara=?" if camara else "")
    args = (hash_senha(senha), login_) + ((camara,) if camara else ())
    n = _db().execute(q, args).rowcount
    _db().execute("DELETE FROM sessoes WHERE usuario_id IN (SELECT id FROM usuarios WHERE lower(usuario)=lower(?))", (login_,))
    return n


def gravar_usuarios(camara, lista, autor):
    """O painel grava a lista inteira de usuários; aqui só entra o que o autor pode mudar."""
    gestor = eh_gestor(autor)
    atuais = {u["id"]: u for u in usuarios(camara)}
    por_login = {u["usuario"].lower(): u for u in atuais.values()}
    c = _db()
    for novo in lista if isinstance(lista, list) else []:
        if not isinstance(novo, dict) or not novo.get("usuario"):
            continue
        antigo = atuais.get(novo.get("id")) or por_login.get(str(novo["usuario"]).lower())
        if antigo is None:
            # pela sincronia não nasce administrador nem usuário de teste (os módulos antigos criavam no navegador)
            if not gestor or novo.get("perfil") == "admin" or novo.get("orgao") == "ambos" or novo.get("teste"):
                continue
            senha = str(novo.get("senha") or "") or _sem_senha_valida()
            try:
                _criar_usuario(camara, novo, senha)
                registrar(camara, autor.get("usuario"), "Usuário criado", novo["usuario"])
            except sqlite3.IntegrityError:
                pass
            continue
        if not gestor and antigo["id"] != autor.get("id"):
            continue
        d = _sem_senha({k: v for k, v in novo.items() if k not in ("id", "usuario", "camara")})
        if not gestor:   # a própria pessoa não muda o próprio cargo, perfil ou situação
            for k in ("perfil", "cargoId", "cargo", "orgao", "ativo", "pendente"):
                if k in antigo:
                    d[k] = antigo[k]
                else:
                    d.pop(k, None)
        if antigo.get("perfil") == "admin" and autor.get("perfil") != "admin":
            continue
        if json.dumps(d, sort_keys=True) != json.dumps(_sem_senha({k: v for k, v in antigo.items() if k not in ("id", "usuario", "camara")}), sort_keys=True):
            c.execute("UPDATE usuarios SET dados=? WHERE id=?", (json.dumps(d, ensure_ascii=False), antigo["id"]))
            _marcar_usuarios(camara)
        if novo.get("senha") and gestor and novo.get("senhaNova"):
            c.execute("UPDATE usuarios SET senha=? WHERE id=?", (hash_senha(str(novo["senha"])), antigo["id"]))


# ---------------------------------------------------------------- sessões
def criar_sessao(u):
    token = secrets.token_urlsafe(32)   # vai só para o navegador (cookie); no banco fica o resumo
    _db().execute("INSERT INTO sessoes(token, usuario_id, camara, expira) VALUES(?,?,?,?)",
                  (_resumo(token), u["id"], u["camara"], time.time() + SESSAO_DIAS * 86400))
    _db().execute("DELETE FROM sessoes WHERE expira < ?", (time.time(),))
    return token


def sessao(token, camara):
    if not token:
        return None
    r = _db().execute("SELECT * FROM sessoes WHERE token=?", (_resumo(token),)).fetchone()
    if not r or r["expira"] < time.time() or r["camara"] != camara:
        return None
    u = _usuario(r["usuario_id"])
    if not u or u.get("ativo") is False or u.get("pendente"):
        return None
    return u


def encerrar(token):
    _db().execute("DELETE FROM sessoes WHERE token=?", (_resumo(token),))


_tentativas = {}
_falhas_conta = {}     # (câmara, login) -> horários das senhas erradas (de qualquer endereço)
_alertado = {}         # (câmara, login, tipo) -> último aviso
ALERTAS = "lg_alertas_seg_v1"
AUDITORIA = "legislagov_audit_v1"      # registro de ações feito pelas telas: só acrescenta, só o administrador lê
REGISTRO_SRV = "lg_registro_srv_v1"    # registro do servidor (entradas, bloqueios, recusas), só leitura, para o administrador
ALERTA_APOS = 5        # senhas erradas em 15 minutos para avisar


def _alertar(camara, login_, ip, n, tipo):
    """Avisa o administrador e o dono da conta: no sino do sistema e, se configurado, por SMS."""
    k = (camara, login_.lower(), tipo)
    if time.time() - _alertado.get(k, 0) < 1800:   # no máximo um aviso de cada tipo a cada 30 min
        return
    _alertado[k] = time.time()
    r = _db().execute("SELECT id FROM usuarios WHERE camara=? AND lower(usuario)=lower(?)", (camara, login_)).fetchone()
    u = _usuario(r["id"]) if r else None
    item = {"id": "al" + secrets.token_hex(5), "quando": agora(), "login": login_[:60], "nome": (u or {}).get("nome", ""),
            "existe": bool(u), "ip": ip, "tentativas": n, "tipo": tipo}
    with _trava:
        atual = _db().execute("SELECT valor FROM dados WHERE camara=? AND chave=?", (camara, ALERTAS)).fetchone()
        try:
            lista = json.loads(atual["valor"]) if atual else []
        except Exception:
            lista = []
        lista = ([item] + (lista if isinstance(lista, list) else []))[:100]
        gravar(camara, ALERTAS, json.dumps(lista, ensure_ascii=False), None, "sistema")
    registrar(camara, "sistema", "Alerta de segurança", f"{login_}: {n} senhas erradas em 15 min ({tipo}) — {ip}", ip)
    try:
        import alerta_externo
        threading.Thread(target=alerta_externo.enviar, args=(camara, item, u, [x for x in usuarios(camara) if x.get("perfil") == "admin"]), daemon=True).start()
    except Exception as e:
        print("alerta externo:", repr(e), flush=True)


def login(camara, usuario, senha, ip):
    chave = (ip, camara, str(usuario).lower())
    hist = [t for t in _tentativas.get(chave, []) if time.time() - t < 900]
    if len(hist) >= 8:
        _alertar(camara, str(usuario).strip(), ip, len(hist), "bloqueio")
        return None, "Muitas tentativas. Espere 15 minutos e tente de novo."
    r = _db().execute("SELECT id, senha FROM usuarios WHERE camara=? AND lower(usuario)=lower(?)", (camara, str(usuario).strip())).fetchone()
    if not r or not confere_senha(str(senha), r["senha"]):
        _tentativas[chave] = hist + [time.time()]
        kc = (camara, str(usuario).strip().lower())
        fc = [t for t in _falhas_conta.get(kc, []) if time.time() - t < 900] + [time.time()]
        _falhas_conta[kc] = fc
        registrar(camara, usuario, "Login recusado", "", ip)
        if len(fc) >= ALERTA_APOS:
            _alertar(camara, str(usuario).strip(), ip, len(fc), "tentativas")
        return None, "Usuário ou senha incorretos."
    u = _usuario(r["id"])
    if u.get("pendente"):
        return None, "Seu cadastro ainda está aguardando liberação do administrador."
    if u.get("ativo") is False:
        return None, "Este usuário está desativado. Fale com o administrador."
    _tentativas.pop(chave, None)
    registrar(camara, u["usuario"], "Login", "", ip)
    return u, ""


def trocar_senha(u, atual, nova):
    r = _db().execute("SELECT senha FROM usuarios WHERE id=?", (u["id"],)).fetchone()
    if not r or not confere_senha(str(atual), r["senha"]):
        return "A senha atual não confere."
    if len(str(nova)) < 8:
        return "A nova senha precisa ter pelo menos 8 caracteres."
    _db().execute("UPDATE usuarios SET senha=? WHERE id=?", (hash_senha(str(nova)), u["id"]))
    _db().execute("DELETE FROM sessoes WHERE usuario_id=?", (u["id"],))
    registrar(u["camara"], u["usuario"], "Senha trocada")
    return ""


def cadastro(camara, d, ip):
    nome, login_, senha = str(d.get("nome", "")).strip(), str(d.get("usuario", "")).strip(), str(d.get("senha", ""))
    cargo_id = str(d.get("cargoId", ""))
    if not nome or not re.fullmatch(r"[\w.\-]{3,30}", login_) or len(senha) < 8:
        return "Informe nome, usuário (3 a 30 letras ou números) e senha com pelo menos 8 caracteres."
    if _db().execute("SELECT 1 FROM usuarios WHERE camara=? AND lower(usuario)=lower(?)", (camara, login_)).fetchone():
        return "Este usuário já existe."
    if cargo_id in CARGOS_UNICOS and cargo_id in cargos_ocupados(camara):
        return "Esse cargo já tem um usuário cadastrado. Fale com o administrador."
    dados = {"usuario": login_, "nome": nome[:120], "cargoId": cargo_id, "cargo": str(d.get("cargo", ""))[:80],
             "setor": str(d.get("setor", ""))[:80], "perfil": str(d.get("perfil", "usuario"))[:20], "orgao": "cam",
             "municipio": "Neves Paulista — SP", "ativo": False, "pendente": True, "criadoEm": agora(),
             "vereadorPedido": str(d.get("vereadorId", ""))[:20], "telefone": re.sub(r"[^\d]", "", str(d.get("telefone", "")))[:13]}
    if dados["perfil"] in ("admin",):
        dados["perfil"] = "usuario"
    with _trava:
        _criar_usuario(camara, dados, senha)
    registrar(camara, login_, "Pedido de cadastro", dados["cargo"], ip)
    return ""


def cargos_ocupados(camara):
    out = set()
    for u in usuarios(camara):
        if (u.get("ativo") is not False or u.get("pendente")) and u.get("cargoId") in CARGOS_UNICOS:
            out.add(u["cargoId"])
    return sorted(out)


# ---------------------------------------------------------------- arquivos
# PDFs, digitalizações, fotos e anexos ficam em disco (PASTA_DADOS/arquivos/<câmara>/<id>), não dentro das
# informações. No lugar do conteúdo fica o endereço /api/arquivo/<id>. Assim o navegador não enche
# (cada um baixa só o que abrir) e o banco continua pequeno. O id é o resumo (sha256) do conteúdo.
PASTA_ARQ = os.path.join(PASTA_DADOS, "arquivos")
DATA_RE = re.compile(r"data:([\w.+\-]+/[\w.+\-]+)(?:;[\w.+\-]+=[\w.+\-]+)*;base64,([A-Za-z0-9+/=]+)")
MIN_B64 = 3000            # menos que isso (ícones pequenos) continua dentro da informação
MAX_ARQ = 15 * 1024 * 1024
PREFIXO_REF = "lgarq:"    # chaves lgs_pdf_* guardavam só o base64; agora guardam lgarq:/api/arquivo/<id>


def _eh_publico(chave):
    return bool(PUBLICAS.match(chave)) and chave != "lgo_v1"   # anexos da ouvidoria têm dados pessoais


def salvar_arquivo(camara, tipo, conteudo, publico, por, acesso=None):
    """Guarda o arquivo em disco. acesso = {"para": [setores/usuários], "donos": [logins]} restringe quem abre."""
    if len(conteudo) > MAX_ARQ:
        raise ValueError("Arquivo grande demais (máximo 15 MB).")
    aid = hashlib.sha256(conteudo).hexdigest()[:40]
    pasta = os.path.join(PASTA_ARQ, re.sub(r"[^\w\-]", "_", camara))
    os.makedirs(pasta, exist_ok=True)
    caminho = os.path.join(pasta, aid)
    if not os.path.exists(caminho):
        tmp = caminho + ".tmp" + secrets.token_hex(3)
        with open(tmp, "wb") as fh:
            fh.write(conteudo)
        os.replace(tmp, caminho)
    tipo = (tipo or "application/octet-stream")[:80]
    c = _db()
    antes = c.execute("SELECT acesso FROM arquivos WHERE camara=? AND id=?", (camara, aid)).fetchone()
    novo = None
    if isinstance(acesso, dict):
        novo = {"para": sorted({str(x)[:120] for x in (acesso.get("para") or [])[:20]}),
                "donos": sorted({str(x).lower()[:60] for x in (acesso.get("donos") or [])[:20]} | {str(por).lower()})}
        if antes is not None:
            if not antes["acesso"]:
                novo = None   # o mesmo conteúdo já circula sem restrição
            else:
                try:
                    v = json.loads(antes["acesso"])
                    novo = {"para": sorted(set(v.get("para", [])) | set(novo["para"])), "donos": sorted(set(v.get("donos", [])) | set(novo["donos"]))}
                except Exception:
                    pass
    if antes is None:
        c.execute("INSERT INTO arquivos(camara, id, tipo, tamanho, publico, criado, por, acesso) VALUES(?,?,?,?,?,?,?,?)",
                  (camara, aid, tipo, len(conteudo), 1 if publico else 0, agora(), por, json.dumps(novo, ensure_ascii=False) if novo else None))
    else:
        c.execute("UPDATE arquivos SET acesso=?, publico=MAX(publico, ?) WHERE camara=? AND id=?",
                  (json.dumps(novo, ensure_ascii=False) if novo else None, 1 if publico else 0, camara, aid))
    return "/api/arquivo/" + aid


def extrair_arquivos(camara, chave, valor, por):
    """Troca o conteúdo embutido (data:...;base64,...) pelo endereço do arquivo guardado em disco."""
    import base64
    if not isinstance(valor, str):
        return valor
    pub = _eh_publico(chave)
    if chave.startswith("lgs_pdf_"):
        if valor.startswith(PREFIXO_REF) or len(valor) < MIN_B64:
            return valor
        m = DATA_RE.fullmatch(valor)
        tipo, b64 = (m.group(1), m.group(2)) if m else ("application/pdf", valor)
        try:
            bruto = base64.b64decode(b64)
        except Exception:
            return valor
        if bruto[:4] == b"%PDF":
            tipo = "application/pdf"
        elif bruto[:3] == b"\xff\xd8\xff":
            tipo = "image/jpeg"
        elif bruto[:8] == b"\x89PNG\r\n\x1a\n":
            tipo = "image/png"
        return PREFIXO_REF + salvar_arquivo(camara, tipo, bruto, pub, por)
    if "base64," not in valor:
        return valor

    def troca(m):
        if len(m.group(2)) < MIN_B64:
            return m.group(0)
        try:
            return salvar_arquivo(camara, m.group(1), base64.b64decode(m.group(2)), pub, por)
        except Exception:
            return m.group(0)
    return DATA_RE.sub(troca, valor)


def ler_arquivo(camara, aid, u):
    """Devolve (tipo, caminho) se a pessoa pode ver o arquivo; senão None."""
    if not re.fullmatch(r"[0-9a-f]{40}", aid or ""):
        return None
    r = _db().execute("SELECT tipo, publico, acesso FROM arquivos WHERE camara=? AND id=?", (camara, aid)).fetchone()
    if not r or not (r["publico"] or u):
        return None
    if r["acesso"] and not r["publico"]:
        try:
            ac = json.loads(r["acesso"])
        except Exception:
            ac = {}
        q = Quem(camara, u)
        meus = {_norm(x) for x in q.setores}
        ok = q.adm or q.login in ac.get("donos", []) or any(
            (_norm(p)[6:] in meus) if _norm(p).startswith("setor:") else (_norm(p) == q.login or _norm(p) in meus) for p in ac.get("para", []))
        if not ok:
            return None
    caminho = os.path.join(PASTA_ARQ, re.sub(r"[^\w\-]", "_", camara), aid)
    return (r["tipo"], caminho) if os.path.exists(caminho) else None


def migrar_arquivos(camara):
    """Uma vez por câmara: tira os arquivos que já estavam dentro das informações (e do histórico)."""
    c = _db()
    marca = "arquivos_v1:" + camara
    if c.execute("SELECT 1 FROM contador WHERE nome=?", (marca,)).fetchone():
        return
    n = 0
    for r in c.execute("SELECT chave, valor FROM dados WHERE camara=?", (camara,)).fetchall():
        novo = extrair_arquivos(camara, r["chave"], r["valor"], "sistema")
        if novo != r["valor"]:
            gravar(camara, r["chave"], novo, None, "sistema"); n += 1
    for r in c.execute("SELECT id, chave, valor FROM historico WHERE camara=? AND (valor LIKE '%base64,%' OR chave LIKE 'lgs_pdf_%')", (camara,)).fetchall():
        novo = extrair_arquivos(camara, r["chave"], r["valor"], "sistema")
        if novo != r["valor"]:
            c.execute("UPDATE historico SET valor=? WHERE id=?", (novo, r["id"]))
    c.execute("INSERT INTO contador(nome, valor) VALUES(?, 1)", (marca,))
    registrar(camara, "sistema", "Arquivos movidos para o disco", f"{n} informações")


# ---------------------------------------------------------------- permissões (conferidas aqui, não só na tela)
# Mesmo modelo do painel (lgt-publicacoes.js): perfil → painéis; exceções em "Áreas e acessos" (lgt_areas_v1).
PERFIS_AREAS = {
    "adm": {"legislativo": "edicao", "vereador": "edicao", "transparencia": "edicao", "financeiro": "edicao", "site": "edicao"},
    "procurador": {"legislativo": "edicao"},
    "secretaria": {"legislativo": "edicao"},
    "financeiro": {"financeiro": "edicao", "transparencia": "edicao"},
    "vereador": {"vereador": "edicao"},
    "servidor": {"legislativo": "consulta"},
}


SETORES_DO_CARGO = {"diretora": ["Secretaria", "Secretaria Legislativa", "Protocolo"], "contabil": ["Contabilidade"], "tesoureira": ["Tesouraria"],
                    "procurador": ["Procuradoria Legislativa"], "vereador": ["Vereadores", "Gabinete"]}


def _norm(x):
    return str(x or "").strip().lower()


class Quem:
    """Quem está gravando: perfil, vereador vinculado, Presidente e níveis por painel (calculado uma vez)."""

    def __init__(self, camara, u):
        self.camara, self.u = camara, u or {}
        self.login = str(self.u.get("usuario") or "").lower()
        self._comp = None

    def _ler(self, chave):
        r = _db().execute("SELECT valor FROM dados WHERE camara=? AND chave=?", (self.camara, chave)).fetchone()
        try:
            return json.loads(r["valor"]) if r else None
        except Exception:
            return None

    @property
    def comp(self):
        if self._comp is None:
            c = self._ler("lgv_camara_v1")
            self._comp = c if isinstance(c, dict) else {}
        return self._comp

    @property
    def vereador(self):
        for v in self.comp.get("vereadores", []) or []:
            if isinstance(v, dict) and str(v.get("usuario") or "").lower() == self.login and self.login:
                return v
        return None

    @property
    def presidente(self):
        v = self.vereador
        return bool(v) and v.get("id") == self.comp.get("presidente")

    @property
    def perfil(self):
        u = self.u
        if u.get("orgao") == "ambos" or u.get("perfil") == "admin":
            return "adm"
        if self.vereador:
            return "vereador"
        if u.get("perfil") in PERFIS_AREAS and u.get("perfil") not in ("adm", "vereador"):
            return u["perfil"]
        t = f"{u.get('cargo', '')} {u.get('setor', '')}"
        if re.search(r"procurad", t, re.I):
            return "procurador"
        if re.search(r"tesour|contab|financ", t, re.I):
            return "financeiro"
        if re.search(r"secret", t, re.I):
            return "secretaria"
        return "servidor"

    @property
    def setores(self):
        """Mesmo cálculo do painel (lgcg-cargos.js, lgSetoresDe): para quem vão os documentos 'do setor'."""
        u = self.u
        out = {x for x in (u.get("setor"), u.get("cargo")) if x}
        out.update(SETORES_DO_CARGO.get(u.get("cargoId") or "", []))
        p = self.perfil
        if p == "secretaria":
            out.update(SETORES_DO_CARGO["diretora"])
        if p == "procurador":
            out.add("Procuradoria Legislativa")
        if p == "vereador":
            out.update(SETORES_DO_CARGO["vereador"])
        if self.presidente:
            out.add("Presidente da Câmara")
        return out

    def nivel(self, area):
        p = self.perfil
        if p == "adm":
            return "edicao"
        if area == "financeiro":
            return "nenhum"   # painel travado (PAINEIS_OCULTOS)
        m = self._ler("lgt_areas_v1") or {}
        r = (m.get(self.login) or {}).get(area) if isinstance(m, dict) else None
        return r or PERFIS_AREAS.get(p, PERFIS_AREAS["servidor"]).get(area, "nenhum")

    def edita(self, *areas):
        return any(self.nivel(a) == "edicao" for a in areas)

    @property
    def adm(self):
        return self.perfil == "adm"

    @property
    def gestor(self):
        return self.perfil in ("adm", "procurador")

    @property
    def edita_algo(self):
        return self.edita("legislativo", "vereador", "transparencia", "site", "financeiro")


def _regra(chave, q):
    """True/False: pode gravar a informação inteira. 'votos' / 'manuais': confere o que mudou."""
    if chave in (ALERTAS, REGISTRO_SRV):
        return False   # só o servidor escreve
    if chave == AUDITORIA:
        return "auditoria" if q.edita_algo else False   # todos acrescentam; ninguém apaga nem muda
    if q.adm:
        return True
    if chave in ("lg_seed_perfis_v2", "legislagov_users_v1"):
        return False
    if chave in ("lgt_areas_v1", "lgt_publicadores_v1", "lgav_prazos_v1") or chave.startswith("legislagov_whatsapp_config_v1"):
        return q.gestor
    if chave == "lgf_v1":
        return q.edita("financeiro")
    if chave in ("lgt_site_noticias_v1", "lgt_site_cfg_v1") or re.fullmatch(r"lgs_site_[a-z]+_v1", chave):
        return q.edita("site")
    if chave == "lgt_transp_v1":
        # quem não publica na Transparência só atualiza a lista automática de matérias (origem "legislativo")
        return True if (q.edita("transparencia", "legislativo") or q.presidente) else ("transp_leg" if q.edita_algo else False)
    if chave in ("lgtc_v1", "lgpn_v1"):
        return q.edita("transparencia", "legislativo") or q.presidente
    if chave == "lgv_camara_v1":
        return q.gestor or q.edita("site", "legislativo") or q.presidente
    if chave == "lgo_v1":
        return q.edita("legislativo")
    if chave in ("lgll_v1", "lgv11_agenda_v1"):
        return q.edita("legislativo") or q.presidente
    if chave == "lgpl_v1":
        return True if (q.edita("legislativo") or q.presidente) else ("votos" if q.vereador and q.edita("vereador") else False)
    if chave == "lgs_manuais_v1":
        return "manuais" if q.edita_algo else False
    return q.edita_algo


_FALTA = object()


def _difs(a, b, caminho=()):
    if a == b:
        return
    if isinstance(a, dict) and isinstance(b, dict):
        for k in set(a) | set(b):
            yield from _difs(a.get(k, _FALTA), b.get(k, _FALTA), caminho + (k,))
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)):
            yield from _difs(x, y, caminho + (i,))
    else:
        yield caminho


def _so_proprio_voto(antigo, novo, vid):
    """Vereador (sem ser Presidente nem da Mesa) só mexe na própria presença e no próprio voto."""
    for c in _difs(antigo, novo):
        ok = any(c[i] in ("votos", "presenca", "porMesa") and len(c) > i + 1 and c[i + 1] == vid for i in range(len(c)))
        if not ok:
            return False
    return True


def _so_automaticos(antigo, novo):
    """Lista da Transparência: só mudam itens gerados das matérias (origem 'legislativo')."""
    if not isinstance(novo, list):
        return False
    a = {x.get("id"): x for x in (antigo if isinstance(antigo, list) else []) if isinstance(x, dict)}
    b = {x.get("id"): x for x in novo if isinstance(x, dict)}
    for k in set(a) | set(b):
        x, y = a.get(k), b.get(k)
        if x == y:
            continue
        if any(i is not None and i.get("origem") != "legislativo" for i in (x, y)):
            return False
    return True


def _manuais_ok(antigo, novo, q):
    """Assinaturas à mão: só Presidente, Procuradoria ou administrador decidem; ninguém decide a própria."""
    if not isinstance(novo, list):
        return False
    velhos = {x.get("id"): x for x in (antigo if isinstance(antigo, list) else []) if isinstance(x, dict)}
    decide = q.gestor or q.presidente
    meu_vid = (q.vereador or {}).get("id")
    for x in novo:
        if not isinstance(x, dict):
            return False
        v = velhos.get(x.get("id"))
        st_antes = v.get("status") if v else None
        if x.get("status") in ("autorizada", "recusada") and st_antes != x.get("status"):
            if not decide:
                return False
            if not q.adm and ((meu_vid and x.get("vid") == meu_vid) or (x.get("porLogin") and str(x.get("porLogin")).lower() == q.login)):
                return False
        if v is None and x.get("status") in ("autorizada", "recusada"):
            return False
        if v is not None and st_antes in ("autorizada", "recusada") and x.get("status") != st_antes:
            return False   # decisão tomada não volta atrás
    return True


def pode_gravar_valor(camara, chave, u, valor_txt):
    """Confere no servidor se esta pessoa pode gravar este valor. Devolve (ok, motivo)."""
    if LOCAIS.match(chave):
        return False, "informação local"
    q = Quem(camara, u)
    r = _regra(chave, q)
    if r is True:
        return True, ""
    if r is False:
        return False, "sem permissão"
    try:
        novo = json.loads(valor_txt) if valor_txt is not None else None
    except Exception:
        return False, "valor inválido"
    antigo = q._ler(chave)
    if r == "votos":
        return (_so_proprio_voto(antigo, novo, q.vereador["id"]), "o vereador só registra a própria presença e o próprio voto")
    if r == "auditoria":
        return (isinstance(novo, list), "valor inválido")
    if r == "transp_leg":
        return (_so_automaticos(antigo, novo), "só quem publica na Transparência altera os documentos")
    if r == "manuais":
        return (_manuais_ok(antigo, novo, q), "só o Presidente ou a Procuradoria autorizam assinaturas à mão")
    return False, "sem permissão"


def pode_ler(camara, chave, u, q=None):
    """None = não manda; 'publico' = manda a versão sem dados pessoais; True = manda inteira."""
    q = q or Quem(camara, u)
    if q.adm:
        return True
    if chave == ALERTAS:
        return "proprio"
    if chave == AUDITORIA:
        return None   # registro de ações: só o administrador
    if chave == "legislagov_users_v1":
        return None
    if chave == "lgf_v1":
        return True if q.edita("financeiro", "transparencia") else None
    if chave == "lgo_v1":
        return True if q.edita("legislativo") else "publico"
    return True


# ---------------------------------------------------------------- dados
def mesclar_auditoria(camara, valor_txt, u):
    """Junta as ações novas ao registro existente. Nada é apagado; quem fez é carimbado pelo servidor."""
    try:
        novo = json.loads(valor_txt)
    except Exception:
        novo = []
    r = _db().execute("SELECT valor FROM dados WHERE camara=? AND chave=?", (camara, AUDITORIA)).fetchone()
    try:
        velho = json.loads(r["valor"]) if r else []
    except Exception:
        velho = []
    ids = {str(x.get("id")) for x in velho if isinstance(x, dict)}
    acrescentar = []
    for x in novo if isinstance(novo, list) else []:
        if isinstance(x, dict) and str(x.get("id")) not in ids:
            x = dict(x)
            x["usuario"], x["email"], x["registradoEm"] = u.get("nome", ""), u.get("usuario", ""), agora()   # não dá para assinar por outro
            acrescentar.append(x); ids.add(str(x.get("id")))
    return json.dumps((acrescentar + [x for x in velho if isinstance(x, dict)])[:5000], ensure_ascii=False), bool(acrescentar)


def registro_servidor(camara, n=500):
    lin = _db().execute("SELECT id, quando, usuario, acao, detalhe, ip FROM registro WHERE camara=? ORDER BY id DESC LIMIT ?", (camara, n)).fetchall()
    return json.dumps([dict(x) for x in lin], ensure_ascii=False)


def _so_meus(valor_txt, login_):
    try:
        v = json.loads(valor_txt)
        return json.dumps([x for x in v if isinstance(x, dict) and str(x.get("login", "")).lower() == login_], ensure_ascii=False)
    except Exception:
        return "[]"


def _publico(chave, valor_txt):
    """Versão para o site: tira dados pessoais."""
    try:
        v = json.loads(valor_txt)
    except Exception:
        return valor_txt
    if chave == "lgo_v1" and isinstance(v, dict):
        v = {"itens": [{k: x for k, x in i.items() if k not in CAMPOS_PESSOAIS} for i in v.get("itens", []) if isinstance(i, dict)]}
    elif chave == "lgv_camara_v1" and isinstance(v, dict):
        v = dict(v)
        v["vereadores"] = [{**{k: x for k, x in i.items() if k != "usuario"}, "temUsuario": bool(i.get("usuario"))}
                           for i in v.get("vereadores", []) if isinstance(i, dict)]
        v["historico"] = []
    return json.dumps(v, ensure_ascii=False)


def carregar(camara, u):
    c = _db()
    seq = c.execute("SELECT COALESCE(MAX(seq),0) FROM dados WHERE camara=?", (camara,)).fetchone()[0]
    out = {}
    q = Quem(camara, u) if u else None
    for r in c.execute("SELECT chave, valor, versao FROM dados WHERE camara=?", (camara,)):
        if u:
            p = pode_ler(camara, r["chave"], u, q)
            if p is True:
                out[r["chave"]] = [r["valor"], r["versao"]]
            elif p == "publico":
                out[r["chave"]] = [_publico(r["chave"], r["valor"]), r["versao"]]
            elif p == "proprio":
                out[r["chave"]] = [_so_meus(r["valor"], q.login), r["versao"]]
        elif PUBLICAS.match(r["chave"]):
            out[r["chave"]] = [_publico(r["chave"], r["valor"]), r["versao"]]
    if u:
        out[CHAVE_USUARIOS] = [json.dumps(usuarios(camara), ensure_ascii=False), 0]
    if u and q.adm:
        out[REGISTRO_SRV] = [registro_servidor(camara), 0]
    return out, seq


def mudancas(camara, desde, u):
    lin = _db().execute("SELECT chave, valor, versao, seq, por FROM dados WHERE camara=? AND seq>? ORDER BY seq", (camara, desde)).fetchall()
    out, ult = {}, desde
    q = Quem(camara, u) if u else None
    for r in lin:
        ult = max(ult, r["seq"])
        p = pode_ler(camara, r["chave"], u, q) if u else None
        if p is True:
            out[r["chave"]] = [r["valor"], r["versao"], r["por"]]
        elif p == "publico":
            out[r["chave"]] = [_publico(r["chave"], r["valor"]), r["versao"], r["por"]]
        elif p == "proprio":
            out[r["chave"]] = [_so_meus(r["valor"], q.login), r["versao"], r["por"]]
    if u and out.pop(CHAVE_USUARIOS, None) is not None:
        out[CHAVE_USUARIOS] = [json.dumps(usuarios(camara), ensure_ascii=False), 0, ""]
    return out, ult


def gravar(camara, chave, valor, versao_base, autor_login):
    """Grava se a versão do navegador for a atual; senão devolve o valor atual para juntar (409)."""
    c = _db()
    valor = extrair_arquivos(camara, chave, valor, autor_login)
    with _trava:
        r = c.execute("SELECT valor, versao FROM dados WHERE camara=? AND chave=?", (camara, chave)).fetchone()
        if r and versao_base is not None and int(versao_base) != r["versao"]:
            return False, r["valor"], r["versao"]
        if r and r["valor"] == valor:
            return True, valor, r["versao"]
        nova = (r["versao"] + 1) if r else 1
        if r:
            c.execute("INSERT INTO historico(camara, chave, versao, valor, quando, por) VALUES(?,?,?,?,?,?)",
                      (camara, chave, r["versao"], r["valor"], agora(), autor_login))
            c.execute("DELETE FROM historico WHERE camara=? AND chave=? AND id NOT IN (SELECT id FROM historico WHERE camara=? AND chave=? ORDER BY id DESC LIMIT 30)",
                      (camara, chave, camara, chave))
        c.execute("INSERT INTO dados(camara, chave, valor, versao, seq, quando, por) VALUES(?,?,?,?,?,?,?) "
                  "ON CONFLICT(camara, chave) DO UPDATE SET valor=excluded.valor, versao=excluded.versao, seq=excluded.seq, quando=excluded.quando, por=excluded.por",
                  (camara, chave, valor, nova, _seq(), agora(), autor_login))
        return True, valor, nova


def remover(camara, chave, autor_login):
    with _trava:
        r = _db().execute("SELECT valor, versao FROM dados WHERE camara=? AND chave=?", (camara, chave)).fetchone()
        if r:
            _db().execute("INSERT INTO historico(camara, chave, versao, valor, quando, por) VALUES(?,?,?,?,?,?)",
                          (camara, chave, r["versao"], r["valor"], agora(), autor_login))
            # marca como vazio (as outras telas recebem a mudança pela sequência)
            _db().execute("UPDATE dados SET valor='null', versao=versao+1, seq=?, quando=?, por=? WHERE camara=? AND chave=?",
                          (_seq(), agora(), autor_login, camara, chave))


_envios = {}


def envio_publico(camara, chave, itens, ip):
    """Site sem login: acrescenta pedidos (ouvidoria, e-SIC, contato, inscrições). Nunca apaga nem lê."""
    if chave not in ENVIO_PUBLICO or not isinstance(itens, list) or not itens or len(itens) > 5:
        return "Envio inválido."
    hist = [t for t in _envios.get(ip, []) if time.time() - t < 3600]
    if len(hist) >= 20:
        return "Muitos envios seguidos. Tente de novo mais tarde."
    _envios[ip] = hist + [time.time()]
    with _trava:
        r = _db().execute("SELECT valor FROM dados WHERE camara=? AND chave=?", (camara, chave)).fetchone()
        try:
            atual = json.loads(r["valor"]) if r else None
        except Exception:
            atual = None
    if chave == "lgo_v1":
        atual = atual if isinstance(atual, dict) else {"itens": []}
        lista = atual.setdefault("itens", [])
        usados = {i.get("protocolo") for i in lista if isinstance(i, dict)}
        for it in itens:
            if not isinstance(it, dict):
                continue
            it["origemIp"] = ip
            p = str(it.get("protocolo", ""))
            if p in usados:   # dois pedidos ao mesmo tempo: não sobrescreve
                it["protocolo"] = p + "-" + secrets.token_hex(2).upper()
            usados.add(it["protocolo"])
            lista.append(it)
    else:
        atual = atual if isinstance(atual, list) else []
        for it in itens:
            if it not in atual:
                atual.append(it)
    gravar(camara, chave, json.dumps(atual, ensure_ascii=False), None, "site")
    return ""


def pode_gravar(chave, u):
    if LOCAIS.match(chave):
        return False
    if chave in SO_GESTOR and not eh_gestor(u):
        return False
    return True
