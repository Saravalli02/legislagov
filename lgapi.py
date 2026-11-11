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
SENHA_PROVISORIA = os.environ.get("LG_SENHA_PROVISORIA", "123456")
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
        CREATE INDEX IF NOT EXISTS ix_dados_seq ON dados(camara, seq);
        CREATE INDEX IF NOT EXISTS ix_hist ON historico(camara, chave, id);
        """)
    return _con


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


def semear(camara):
    """Primeiro acesso de uma câmara: cria o administrador e os usuários de teste (senha provisória)."""
    if _db().execute("SELECT 1 FROM usuarios WHERE camara=? LIMIT 1", (camara,)).fetchone():
        return
    base = {"orgao": "cam", "municipio": "Neves Paulista — SP", "ativo": True}
    _criar_usuario(camara, {**base, "id": "usr-ricardo", "usuario": "Ricardo", "nome": "Ricardo Saravalli", "cargo": "Administrador do sistema",
                            "perfil": "admin", "orgao": "ambos"}, SENHA_PROVISORIA)
    for login, nome, cargoId, cargo, setor, perfil in [
        ("vinicius", "Vinicius", "procurador", "Procurador(a) Legislativo", "Procuradoria Legislativa", "procurador"),
        ("erika", "Erika", "diretora", "Diretor(a) de Secretaria", "Secretaria Legislativa", "secretaria"),
        ("ednilson", "Edenilson Roselli", "vereador", "Vereador(a)", "Gabinete", "vereador"),
        ("andre", "André", "tesoureira", "Tesoureiro(a)", "Tesouraria", "financeiro"),
    ]:
        _criar_usuario(camara, {**base, "id": "usr-" + login, "usuario": login, "nome": nome, "cargoId": cargoId, "cargo": cargo,
                                "setor": setor, "perfil": perfil, "teste": True}, SENHA_PROVISORIA)
    # flags dos módulos que criavam usuários de teste no navegador: já resolvido aqui
    for chave in ("lg_seed_perfis_v2",):
        gravar(camara, chave, "1", None, "sistema")
    registrar(camara, "sistema", "Câmara criada no banco", "usuários iniciais com senha provisória")


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
            senha = str(novo.get("senha") or SENHA_PROVISORIA)
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
    token = secrets.token_urlsafe(32)
    _db().execute("INSERT INTO sessoes(token, usuario_id, camara, expira) VALUES(?,?,?,?)",
                  (token, u["id"], u["camara"], time.time() + SESSAO_DIAS * 86400))
    return token


def sessao(token, camara):
    if not token:
        return None
    r = _db().execute("SELECT * FROM sessoes WHERE token=?", (token,)).fetchone()
    if not r or r["expira"] < time.time() or r["camara"] != camara:
        return None
    u = _usuario(r["usuario_id"])
    if not u or u.get("ativo") is False or u.get("pendente"):
        return None
    return u


def encerrar(token):
    _db().execute("DELETE FROM sessoes WHERE token=?", (token,))


_tentativas = {}


def login(camara, usuario, senha, ip):
    chave = (ip, camara, str(usuario).lower())
    hist = [t for t in _tentativas.get(chave, []) if time.time() - t < 900]
    if len(hist) >= 8:
        return None, "Muitas tentativas. Espere 15 minutos e tente de novo."
    r = _db().execute("SELECT id, senha FROM usuarios WHERE camara=? AND lower(usuario)=lower(?)", (camara, str(usuario).strip())).fetchone()
    if not r or not confere_senha(str(senha), r["senha"]):
        _tentativas[chave] = hist + [time.time()]
        registrar(camara, usuario, "Login recusado", "", ip)
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
             "vereadorPedido": str(d.get("vereadorId", ""))[:20]}
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


# ---------------------------------------------------------------- dados
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
    for r in c.execute("SELECT chave, valor, versao FROM dados WHERE camara=?", (camara,)):
        if u:
            out[r["chave"]] = [r["valor"], r["versao"]]
        elif PUBLICAS.match(r["chave"]):
            out[r["chave"]] = [_publico(r["chave"], r["valor"]), r["versao"]]
    if u:
        out[CHAVE_USUARIOS] = [json.dumps(usuarios(camara), ensure_ascii=False), 0]
    return out, seq


def mudancas(camara, desde, u):
    lin = _db().execute("SELECT chave, valor, versao, seq, por FROM dados WHERE camara=? AND seq>? ORDER BY seq", (camara, desde)).fetchall()
    out, ult = {}, desde
    for r in lin:
        ult = max(ult, r["seq"])
        out[r["chave"]] = [r["valor"], r["versao"], r["por"]]
    if u and out.pop(CHAVE_USUARIOS, None) is not None:
        out[CHAVE_USUARIOS] = [json.dumps(usuarios(camara), ensure_ascii=False), 0, ""]
    return out, ult


def gravar(camara, chave, valor, versao_base, autor_login):
    """Grava se a versão do navegador for a atual; senão devolve o valor atual para juntar (409)."""
    c = _db()
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
