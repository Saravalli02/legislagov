"""
LegislaGov — Atendimento WhatsApp (Cloud API da Meta), só biblioteca padrão do Python.

Usa o mesmo banco SQLite do LegislaGov (LG_BANCO=1), em tabelas próprias (wa_*): nada das
tabelas da Câmara é lido ou alterado. Os logins são os da mesma tabela de usuários, separados
por endereço (cada domínio de ferramentas/aws/dominios.txt é um "cliente").

Rotas:
  GET  /api/whatsapp/webhook           verificação da Meta (hub.challenge)
  POST /api/whatsapp/webhook           mensagens recebidas (assinatura X-Hub-Signature-256)
  GET  /api/whatsapp/conversas         conversas abertas e encerradas (login)
  POST /api/whatsapp/enviar            atendente responde {conversa, texto}
  POST /api/whatsapp/acao              {conversa, acao: assumir|encerrar|fila|devolver}
  GET  /api/whatsapp/config            configuração (sem os segredos)      — administrador
  POST /api/whatsapp/config            grava configuração / mensagem de teste — administrador
  GET  /api/whatsapp/equipe            logins do atendimento                 — administrador
  POST /api/whatsapp/equipe            criar login, ativar/desativar, nova senha — administrador

Enquanto não há a API da Betha, o robô só conduz o menu e passa para a fila de atendentes.
"""
import hashlib
import hmac
import json
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookies import SimpleCookie

import lgapi

GRAPH = "https://graph.facebook.com/v21.0"
GUARDA_ANOS = 5
_limpeza = {"ultima": 0.0}

ASSUNTOS = {"1": "IPTU", "2": "ISS", "3": "Taxa de Licença", "4": "ITBI", "5": "Receitas Diversas", "6": "Água e Esgoto"}

PADRAO = {
    "municipio": "Prefeitura de Neves Paulista",
    "msg_boas_vindas": "Olá! Este é o atendimento digital da {municipio}.\nEscolha o setor (responda só com o número):\n1 – Tributação",
    "msg_tributacao": "Tributação. Sobre o que deseja falar?\n1 – IPTU\n2 – ISS\n3 – Taxa de Licença\n4 – ITBI\n5 – Receitas Diversas\n6 – Água e Esgoto\n9 – Falar com atendente\n0 – Voltar",
    "msg_encaminhado": "Certo: {assunto}. A segunda via e a consulta automática de débitos serão ligadas em breve ao sistema da Prefeitura. Já passei sua conversa para um atendente; aguarde, por favor.",
    "msg_atendente": "Já passei sua conversa para um atendente. Aguarde, por favor.",
    "msg_fora": "Este canal atende exclusivamente o setor de Tributação no momento.",
    "msg_encerrada": "Atendimento encerrado. Se precisar de algo mais, é só mandar uma mensagem.",
    "msg_itbi": "Para calcular o ITBI, envie aqui o contrato, a minuta ou a escritura (PDF ou foto). Um atendente confere e envia a guia.",
}


# ---------------------------------------------------------------- banco
def _db():
    c = lgapi._db()
    if not getattr(_db, "_pronto", False):
        c.executescript("""
        CREATE TABLE IF NOT EXISTS wa_conversas(id INTEGER PRIMARY KEY AUTOINCREMENT, camara TEXT NOT NULL, tel TEXT NOT NULL,
            nome TEXT, status TEXT NOT NULL DEFAULT 'bot', menu TEXT, assunto TEXT, atendente TEXT, atendente_nome TEXT,
            nao_lidas INTEGER NOT NULL DEFAULT 0, aberta REAL NOT NULL, atualizada REAL NOT NULL, encerrada REAL, ultima_entrada REAL);
        CREATE INDEX IF NOT EXISTS ix_wa_conv ON wa_conversas(camara, tel, status);
        CREATE INDEX IF NOT EXISTS ix_wa_conv_data ON wa_conversas(camara, atualizada);
        CREATE TABLE IF NOT EXISTS wa_mensagens(id INTEGER PRIMARY KEY AUTOINCREMENT, conversa INTEGER NOT NULL, camara TEXT NOT NULL,
            origem TEXT NOT NULL, texto TEXT, tipo TEXT, wa_id TEXT UNIQUE, autor TEXT, quando REAL NOT NULL, erro TEXT);
        CREATE INDEX IF NOT EXISTS ix_wa_msg ON wa_mensagens(conversa, id);
        CREATE TABLE IF NOT EXISTS wa_config(camara TEXT PRIMARY KEY, valor TEXT NOT NULL);
        """)
        _db._pronto = True
    return c


def config(camara):
    r = _db().execute("SELECT valor FROM wa_config WHERE camara=?", (camara,)).fetchone()
    cfg = {}
    if r:
        try:
            cfg = json.loads(r["valor"])
        except Exception:
            cfg = {}
    if not cfg.get("verify_token"):
        cfg["verify_token"] = "lg-" + secrets.token_hex(12)
        _gravar_config(camara, cfg)
    return cfg


def _gravar_config(camara, cfg):
    _db().execute("INSERT INTO wa_config(camara, valor) VALUES(?,?) ON CONFLICT(camara) DO UPDATE SET valor=excluded.valor",
                  (camara, json.dumps(cfg, ensure_ascii=False)))


def _texto(cfg, chave, **campos):
    t = (cfg.get(chave) or PADRAO[chave])
    campos.setdefault("municipio", cfg.get("municipio") or PADRAO["municipio"])
    for k, v in campos.items():
        t = t.replace("{" + k + "}", str(v))
    return t


def _limpar_antigas():
    """Guarda do histórico: apaga conversas encerradas há mais de 5 anos (uma vez por dia)."""
    if time.time() - _limpeza["ultima"] < 86400:
        return
    _limpeza["ultima"] = time.time()
    limite = time.time() - GUARDA_ANOS * 365.25 * 86400
    c = _db()
    ids = [r[0] for r in c.execute("SELECT id FROM wa_conversas WHERE status='encerrada' AND encerrada < ?", (limite,)).fetchall()]
    for i in ids:
        c.execute("DELETE FROM wa_mensagens WHERE conversa=?", (i,))
        c.execute("DELETE FROM wa_conversas WHERE id=?", (i,))
    if ids:
        lgapi.registrar("sistema", "sistema", "WhatsApp: limpeza do histórico", f"{len(ids)} conversa(s) com mais de {GUARDA_ANOS} anos")


def _conversa_ativa(camara, tel, nome=None):
    c = _db()
    r = c.execute("SELECT * FROM wa_conversas WHERE camara=? AND tel=? AND status!='encerrada' ORDER BY id DESC LIMIT 1",
                  (camara, tel)).fetchone()
    if r:
        if nome and nome != r["nome"]:
            c.execute("UPDATE wa_conversas SET nome=? WHERE id=?", (nome, r["id"]))
        return dict(r), False
    agora = time.time()
    cur = c.execute("INSERT INTO wa_conversas(camara, tel, nome, status, menu, aberta, atualizada) VALUES(?,?,?,?,?,?,?)",
                    (camara, tel, nome or "", "bot", "", agora, agora))
    return dict(c.execute("SELECT * FROM wa_conversas WHERE id=?", (cur.lastrowid,)).fetchone()), True


def _guardar(conv_id, camara, origem, texto, tipo="text", wa_id=None, autor=None, quando=None, erro=None):
    try:
        cur = _db().execute("INSERT INTO wa_mensagens(conversa, camara, origem, texto, tipo, wa_id, autor, quando, erro) VALUES(?,?,?,?,?,?,?,?,?)",
                            (conv_id, camara, origem, texto, tipo, wa_id, autor, quando or time.time(), erro))
        _db().execute("UPDATE wa_conversas SET atualizada=? WHERE id=?", (time.time(), conv_id))
        return cur.lastrowid
    except Exception:   # mensagem repetida (a Meta reenvia quando não recebe resposta rápida)
        return None


# ---------------------------------------------------------------- envio pela Meta
def _enviar_meta(cfg, tel, texto):
    """Envia um texto. Devolve (wa_id, erro)."""
    token, pnid = cfg.get("token"), cfg.get("phone_number_id")
    if not token or not pnid:
        return None, "WhatsApp ainda não conectado (falta o token ou o ID do número)."
    corpo = json.dumps({"messaging_product": "whatsapp", "recipient_type": "individual", "to": tel,
                        "type": "text", "text": {"preview_url": False, "body": texto[:4096]}}).encode("utf-8")
    req = urllib.request.Request(f"{GRAPH}/{urllib.parse.quote(str(pnid))}/messages", data=corpo, method="POST",
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            d = json.loads(resp.read().decode("utf-8"))
        return (d.get("messages") or [{}])[0].get("id"), None
    except urllib.error.HTTPError as e:
        try:
            info = json.loads(e.read().decode("utf-8")).get("error", {})
            msg = info.get("error_user_msg") or info.get("message") or str(e)
            if info.get("code") == 131047:
                msg = "Passaram 24 horas desde a última mensagem do contribuinte; a Meta só deixa responder com modelo aprovado."
        except Exception:
            msg = str(e)
        return None, msg[:300]
    except Exception as e:
        return None, ("Sem conexão com a Meta: " + str(e))[:300]


def _enviar_e_guardar(camara, conv_id, tel, texto, origem, autor):
    cfg = config(camara)
    wa_id, erro = _enviar_meta(cfg, tel, texto)
    with lgapi._trava:
        _guardar(conv_id, camara, origem, texto, wa_id=wa_id, autor=autor, erro=erro)
    return erro


# ---------------------------------------------------------------- robô (menu)
def _robo(cfg, conv, nova, texto):
    """Decide a resposta automática. Devolve (respostas, mudanças na conversa)."""
    t = (texto or "").strip()
    escolha = re.sub(r"[^0-9]", "", t)[:2] if len(t) <= 6 else ""
    menu = conv.get("menu") or ""
    if conv["status"] in ("fila", "atendimento"):
        return [], {}
    if nova or not menu:
        return [_texto(cfg, "msg_boas_vindas")], {"menu": "raiz"}
    if menu == "raiz":
        if escolha == "1":
            return [_texto(cfg, "msg_tributacao")], {"menu": "trib"}
        return [_texto(cfg, "msg_fora"), _texto(cfg, "msg_boas_vindas")], {}
    if menu == "trib":
        if escolha == "0":
            return [_texto(cfg, "msg_boas_vindas")], {"menu": "raiz"}
        if escolha == "9":
            return [_texto(cfg, "msg_atendente")], {"status": "fila", "assunto": conv.get("assunto") or "Atendente", "menu": "fila"}
        if escolha == "4":
            return [_texto(cfg, "msg_itbi"), _texto(cfg, "msg_atendente")], {"status": "fila", "assunto": "ITBI", "menu": "fila"}
        if escolha in ASSUNTOS:
            a = ASSUNTOS[escolha]
            return [_texto(cfg, "msg_encaminhado", assunto=a)], {"status": "fila", "assunto": a, "menu": "fila"}
        return [_texto(cfg, "msg_tributacao")], {}
    return [], {}


def _texto_recebido(m):
    tipo = m.get("type", "")
    if tipo == "text":
        return m.get("text", {}).get("body", ""), "text"
    if tipo == "button":
        return m.get("button", {}).get("text", ""), "text"
    if tipo == "interactive":
        i = m.get("interactive", {})
        return (i.get("button_reply") or i.get("list_reply") or {}).get("title", ""), "text"
    if tipo in ("document", "image", "audio", "video", "sticker"):
        d = m.get(tipo, {})
        nome = d.get("filename") or {"image": "Foto", "audio": "Áudio", "video": "Vídeo", "sticker": "Figurinha"}.get(tipo, "Arquivo")
        leg = d.get("caption") or ""
        return (f"[{nome}]" + (f" {leg}" if leg else "")), tipo
    if tipo == "location":
        return "[Localização enviada]", tipo
    return f"[{tipo or 'mensagem'}]", tipo or "outro"


def receber(camara, corpo):
    """Processa o aviso da Meta. Devolve a lista de envios a fazer depois (fora da trava)."""
    envios = []
    cfg = config(camara)
    for entrada in corpo.get("entry", []) or []:
        for mud in entrada.get("changes", []) or []:
            v = mud.get("value", {}) or {}
            nomes = {c.get("wa_id"): (c.get("profile") or {}).get("name", "") for c in v.get("contacts", []) or []}
            # mensagens que chegaram do contribuinte
            for m in v.get("messages", []) or []:
                tel = str(m.get("from", ""))
                if not tel:
                    continue
                texto, tipo = _texto_recebido(m)
                conv, nova = _conversa_ativa(camara, tel, nomes.get(tel))
                quando = float(m.get("timestamp") or time.time())
                if _guardar(conv["id"], camara, "in", texto, tipo, m.get("id"), None, quando) is None:
                    continue   # repetida
                _db().execute("UPDATE wa_conversas SET nao_lidas=nao_lidas+1, ultima_entrada=? WHERE id=?", (time.time(), conv["id"]))
                if cfg.get("robo_desligado"):
                    if conv["status"] == "bot":
                        _db().execute("UPDATE wa_conversas SET status='fila', menu='fila' WHERE id=?", (conv["id"],))
                    continue
                respostas, mudancas = _robo(cfg, conv, nova, texto)
                if mudancas:
                    sets = ", ".join(f"{k}=?" for k in mudancas)
                    _db().execute(f"UPDATE wa_conversas SET {sets} WHERE id=?", (*mudancas.values(), conv["id"]))
                for r in respostas:
                    envios.append((conv["id"], tel, r))
            # mensagens que a equipe mandou pelo celular (coexistência com o app WhatsApp Business)
            for m in (v.get("message_echoes") or []):
                tel = str(m.get("to", ""))
                if not tel:
                    continue
                texto, tipo = _texto_recebido(m)
                conv, _ = _conversa_ativa(camara, tel)
                _guardar(conv["id"], camara, "out", texto, tipo, m.get("id"), "Celular", float(m.get("timestamp") or time.time()))
    _limpar_antigas()
    return envios


# ---------------------------------------------------------------- leitura para o painel
def _para_painel(r, msgs):
    return {"id": r["id"], "tel": r["tel"], "nome": r["nome"] or "", "status": r["status"], "assunto": r["assunto"] or "",
            "atendente": r["atendente"] or "", "atendente_nome": r["atendente_nome"] or "", "nao_lidas": r["nao_lidas"],
            "aberta": r["aberta"], "atualizada": r["atualizada"], "encerrada": r["encerrada"],
            "janela_24h": bool(r["ultima_entrada"] and time.time() - r["ultima_entrada"] < 86400),
            "msgs": [{"id": m["id"], "origem": m["origem"], "texto": m["texto"] or "", "tipo": m["tipo"], "autor": m["autor"] or "",
                      "quando": m["quando"], "erro": m["erro"] or ""} for m in msgs]}


def conversas(camara, dias_hist=400):
    c = _db()
    limite = time.time() - dias_hist * 86400
    linhas = c.execute("SELECT * FROM wa_conversas WHERE camara=? AND (status!='encerrada' OR encerrada > ?) ORDER BY atualizada DESC LIMIT 400",
                       (camara, limite)).fetchall()
    out = []
    for r in linhas:
        msgs = c.execute("SELECT * FROM wa_mensagens WHERE conversa=? ORDER BY id", (r["id"],)).fetchall()
        out.append(_para_painel(r, msgs))
    ver = c.execute("SELECT COALESCE(MAX(id),0) FROM wa_mensagens WHERE camara=?", (camara,)).fetchone()[0]
    ver2 = c.execute("SELECT COALESCE(MAX(atualizada),0) FROM wa_conversas WHERE camara=?", (camara,)).fetchone()[0]
    return out, f"{ver}-{ver2}"


def _publico_cfg(camara, host):
    cfg = config(camara)
    return {"phone_number_id": cfg.get("phone_number_id", ""), "waba_id": cfg.get("waba_id", ""), "numero": cfg.get("numero", ""),
            "tem_token": bool(cfg.get("token")), "tem_segredo": bool(cfg.get("app_secret")), "verify_token": cfg["verify_token"],
            "webhook": f"https://{host}/api/whatsapp/webhook", "robo_desligado": bool(cfg.get("robo_desligado")),
            "ultimo_aviso": cfg.get("ultimo_aviso", 0),
            "textos": {k: cfg.get(k) or PADRAO[k] for k in PADRAO}}


def _eh_admin(u):
    return bool(u) and (u.get("perfil") == "admin" or u.get("orgao") == "ambos")


def equipe(camara):
    return [{"id": x["id"], "nome": x.get("nome", ""), "usuario": x.get("usuario", ""), "perfil": x.get("perfil", "atendente"),
             "ativo": x.get("ativo") is not False and not x.get("pendente")} for x in lgapi.usuarios(camara)]


# ---------------------------------------------------------------- rotas HTTP
def rota(h, metodo, camara_do_host):
    """Chamado pelo server.py. Devolve True se a rota é do WhatsApp (e já respondeu)."""
    caminho = h.path.split("?", 1)[0]
    if not caminho.startswith("/api/whatsapp/"):
        return False
    if not lgapi.ativo():
        return _resp(h, 503, {"ok": False, "erro": "Banco de dados desligado neste servidor."})
    camara, _modo = camara_do_host(h.headers.get("Host"))
    if _modo != "portfolio" and camara != "teste":   # sites e sistemas das Câmaras não usam o Atendimento
        return _resp(h, 404, {"ok": False, "erro": "Rota não encontrada."})
    host = (h.headers.get("Host") or "").split(":")[0]
    bruto = b""
    if metodo == "POST":
        tam = int(h.headers.get("Content-Length", "0") or 0)
        if tam > 2_000_000:
            return _resp(h, 413, {"ok": False, "erro": "Conteúdo grande demais."})
        bruto = h.rfile.read(tam) if tam > 0 else b""
    try:
        # ---------- Meta (sem login)
        if caminho == "/api/whatsapp/webhook":
            if metodo == "GET":
                q = urllib.parse.parse_qs(h.path.split("?", 1)[1] if "?" in h.path else "")
                with lgapi._trava:
                    lgapi.semear(camara)
                    cfg = config(camara)
                if q.get("hub.mode", [""])[0] == "subscribe" and hmac.compare_digest(q.get("hub.verify_token", [""])[0], cfg["verify_token"]):
                    return _texto_puro(h, 200, q.get("hub.challenge", [""])[0])
                return _texto_puro(h, 403, "token de verificação não confere")
            if metodo == "POST":
                with lgapi._trava:
                    cfg = config(camara)
                segredo = cfg.get("app_secret")
                if segredo:
                    assinado = h.headers.get("X-Hub-Signature-256", "")
                    certo = "sha256=" + hmac.new(segredo.encode(), bruto, hashlib.sha256).hexdigest()
                    if not hmac.compare_digest(assinado, certo):
                        lgapi.registrar(camara, "sistema", "WhatsApp: aviso com assinatura inválida", "", _ip(h))
                        return _texto_puro(h, 401, "assinatura inválida")
                corpo = json.loads(bruto.decode("utf-8") or "{}")
                with lgapi._trava:
                    envios = receber(camara, corpo)
                    cfg["ultimo_aviso"] = time.time()
                    _gravar_config(camara, cfg)
                _texto_puro(h, 200, "ok")   # responde logo; a Meta reenvia se demorar
                for conv_id, tel, texto in envios:
                    _enviar_e_guardar(camara, conv_id, tel, texto, "bot", "Robô")
                return True
            return _resp(h, 405, {"ok": False})

        # ---------- painel (com login)
        ck = SimpleCookie(h.headers.get("Cookie", ""))
        token = ck["lg_sessao"].value if "lg_sessao" in ck else ""
        with lgapi._trava:
            lgapi.semear(camara)
            u = lgapi.sessao(token, camara)
        if not u:
            return _resp(h, 401, {"ok": False, "erro": "Sua sessão terminou. Entre de novo."})
        if metodo == "POST" and h.headers.get("X-LG") != "1":
            return _resp(h, 403, {"ok": False, "erro": "Requisição recusada."})
        d = json.loads(bruto.decode("utf-8") or "{}") if metodo == "POST" else {}
        quem = (u.get("nome") or u.get("usuario") or "").split(" ")[0]

        if caminho == "/api/whatsapp/conversas" and metodo == "GET":
            with lgapi._trava:
                lista, ver = conversas(camara)
                cfg = _publico_cfg(camara, host)
            return _resp(h, 200, {"ok": True, "ver": ver, "conversas": lista, "eu": {"id": u["id"], "nome": u.get("nome", ""),
                                  "admin": _eh_admin(u)}, "conectado": cfg["tem_token"] and bool(cfg["phone_number_id"]),
                                  "ultimo_aviso": cfg["ultimo_aviso"]})

        if caminho == "/api/whatsapp/enviar" and metodo == "POST":
            texto = str(d.get("texto", "")).strip()
            if not texto:
                return _resp(h, 400, {"ok": False, "erro": "Escreva a mensagem."})
            with lgapi._trava:
                r = _db().execute("SELECT * FROM wa_conversas WHERE id=? AND camara=?", (int(d.get("conversa", 0)), camara)).fetchone()
                if not r:
                    return _resp(h, 404, {"ok": False, "erro": "Conversa não encontrada."})
                if r["status"] == "encerrada":
                    return _resp(h, 400, {"ok": False, "erro": "Esta conversa já foi encerrada."})
                if r["status"] != "atendimento" or r["atendente"] != u["id"]:
                    _db().execute("UPDATE wa_conversas SET status='atendimento', atendente=?, atendente_nome=?, menu='fila', nao_lidas=0 WHERE id=?",
                                  (u["id"], u.get("nome", ""), r["id"]))
            erro = _enviar_e_guardar(camara, r["id"], r["tel"], texto, "out", quem)
            return _resp(h, 200 if not erro else 502, {"ok": not erro, "erro": erro})

        if caminho == "/api/whatsapp/acao" and metodo == "POST":
            acao = d.get("acao")
            aviso = None
            with lgapi._trava:
                r = _db().execute("SELECT * FROM wa_conversas WHERE id=? AND camara=?", (int(d.get("conversa", 0)), camara)).fetchone()
                if not r:
                    return _resp(h, 404, {"ok": False, "erro": "Conversa não encontrada."})
                c = _db()
                if acao == "lida":
                    c.execute("UPDATE wa_conversas SET nao_lidas=0 WHERE id=?", (r["id"],))
                elif acao == "assumir":
                    c.execute("UPDATE wa_conversas SET status='atendimento', atendente=?, atendente_nome=?, menu='fila', nao_lidas=0 WHERE id=?",
                              (u["id"], u.get("nome", ""), r["id"]))
                    _guardar(r["id"], camara, "sys", f"{quem} assumiu o atendimento")
                elif acao == "fila":
                    nota = str(d.get("nota", "")).strip()[:300]
                    c.execute("UPDATE wa_conversas SET status='fila', atendente=NULL, atendente_nome=NULL WHERE id=?", (r["id"],))
                    _guardar(r["id"], camara, "sys", f"{quem} devolveu para a fila" + (f": {nota}" if nota else ""))
                elif acao == "encerrar":
                    c.execute("UPDATE wa_conversas SET status='encerrada', encerrada=?, nao_lidas=0 WHERE id=?", (time.time(), r["id"]))
                    _guardar(r["id"], camara, "sys", f"Encerrada por {quem}")
                    if r["ultima_entrada"] and time.time() - r["ultima_entrada"] < 86400:
                        aviso = _texto(config(camara), "msg_encerrada")
                else:
                    return _resp(h, 400, {"ok": False, "erro": "Ação desconhecida."})
            if aviso:
                _enviar_e_guardar(camara, r["id"], r["tel"], aviso, "bot", "Robô")
            return _resp(h, 200, {"ok": True})

        # ---------- administrador
        if not _eh_admin(u):
            return _resp(h, 403, {"ok": False, "erro": "Só o administrador pode mexer nesta parte."})

        if caminho == "/api/whatsapp/config":
            if metodo == "GET":
                with lgapi._trava:
                    return _resp(h, 200, {"ok": True, "config": _publico_cfg(camara, host)})
            if d.get("teste"):
                tel = re.sub(r"\D", "", str(d.get("teste")))
                if len(tel) < 12:
                    return _resp(h, 400, {"ok": False, "erro": "Digite o número com DDI e DDD, por exemplo 5517991234567."})
                with lgapi._trava:
                    cfg = config(camara)
                wa_id, erro = _enviar_meta(cfg, tel, "Teste do Atendimento WhatsApp LegislaGov: conexão funcionando.")
                return _resp(h, 200 if not erro else 502, {"ok": not erro, "erro": erro})
            with lgapi._trava:
                cfg = config(camara)
                for k in ("phone_number_id", "waba_id", "numero", "municipio"):
                    if k in d:
                        cfg[k] = re.sub(r"[^\w .–-]", "", str(d[k]).strip())[:80]
                for k in ("token", "app_secret"):
                    if d.get(k):   # segredo só é trocado quando preenchido
                        cfg[k] = str(d[k]).strip()[:600]
                if "robo_desligado" in d:
                    cfg["robo_desligado"] = bool(d["robo_desligado"])
                for k in PADRAO:
                    if k in d.get("textos", {}):
                        cfg[k] = str(d["textos"][k])[:1500]
                if d.get("novo_verify"):
                    cfg["verify_token"] = "lg-" + secrets.token_hex(12)
                _gravar_config(camara, cfg)
                lgapi.registrar(camara, u["usuario"], "WhatsApp: configuração alterada", ", ".join(sorted(k for k in d if k != "token" and k != "app_secret")), _ip(h))
                return _resp(h, 200, {"ok": True, "config": _publico_cfg(camara, host)})

        if caminho == "/api/whatsapp/equipe":
            if metodo == "GET":
                with lgapi._trava:
                    return _resp(h, 200, {"ok": True, "equipe": equipe(camara)})
            acao = d.get("acao")
            with lgapi._trava:
                if acao == "criar":
                    login_ = re.sub(r"[^\w.@-]", "", str(d.get("usuario", "")).strip())[:60]
                    nome = str(d.get("nome", "")).strip()[:120]
                    senha = str(d.get("senha", ""))
                    perfil = d.get("perfil") if d.get("perfil") in ("admin", "supervisor", "atendente") else "atendente"
                    if not login_ or not nome:
                        return _resp(h, 400, {"ok": False, "erro": "Preencha nome e login."})
                    if len(senha) < 8:
                        return _resp(h, 400, {"ok": False, "erro": "A senha inicial precisa ter pelo menos 8 caracteres."})
                    if _db().execute("SELECT 1 FROM usuarios WHERE camara=? AND lower(usuario)=lower(?)", (camara, login_)).fetchone():
                        return _resp(h, 400, {"ok": False, "erro": "Este login já existe. Escolha outro."})
                    lgapi._criar_usuario(camara, {"usuario": login_, "nome": nome, "perfil": perfil, "cargo": "Atendimento WhatsApp",
                                                  "orgao": "ambos" if perfil == "admin" else "exec", "ativo": True}, senha)
                    lgapi.registrar(camara, u["usuario"], "WhatsApp: login criado", login_, _ip(h))
                elif acao in ("ativar", "desativar"):
                    alvo = lgapi._usuario(str(d.get("id", "")))
                    if not alvo or alvo.get("camara") != camara:
                        return _resp(h, 404, {"ok": False, "erro": "Login não encontrado."})
                    if alvo["id"] == u["id"]:
                        return _resp(h, 400, {"ok": False, "erro": "Você não pode desativar o próprio login."})
                    alvo["ativo"] = acao == "ativar"
                    dados = {k: v for k, v in alvo.items() if k not in ("id", "usuario", "camara", "senha")}
                    _db().execute("UPDATE usuarios SET dados=? WHERE id=?", (json.dumps(dados, ensure_ascii=False), alvo["id"]))
                    if acao == "desativar":
                        _db().execute("DELETE FROM sessoes WHERE usuario_id=?", (alvo["id"],))
                    lgapi.registrar(camara, u["usuario"], f"WhatsApp: login {acao}do", alvo["usuario"], _ip(h))
                elif acao == "senha":
                    alvo = lgapi._usuario(str(d.get("id", "")))
                    senha = str(d.get("senha", ""))
                    if not alvo or alvo.get("camara") != camara:
                        return _resp(h, 404, {"ok": False, "erro": "Login não encontrado."})
                    if len(senha) < 8:
                        return _resp(h, 400, {"ok": False, "erro": "A senha precisa ter pelo menos 8 caracteres."})
                    _db().execute("UPDATE usuarios SET senha=? WHERE id=?", (lgapi.hash_senha(senha), alvo["id"]))
                    _db().execute("DELETE FROM sessoes WHERE usuario_id=?", (alvo["id"],))
                    lgapi.registrar(camara, u["usuario"], "WhatsApp: senha redefinida", alvo["usuario"], _ip(h))
                else:
                    return _resp(h, 400, {"ok": False, "erro": "Ação desconhecida."})
                return _resp(h, 200, {"ok": True, "equipe": equipe(camara)})

        return _resp(h, 404, {"ok": False, "erro": "Rota não encontrada."})
    except Exception as erro:
        print("whatsapp:", caminho, repr(erro), flush=True)
        return _resp(h, 400, {"ok": False, "erro": "Não foi possível concluir: " + str(erro)[:160]})


def _ip(h):
    return (h.headers.get("X-Forwarded-For") or h.client_address[0]).split(",")[0].strip()


def _resp(h, cod, dados):
    corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
    h.send_response(cod)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(corpo)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(corpo)
    return True


def _texto_puro(h, cod, txt):
    corpo = str(txt).encode("utf-8")
    h.send_response(cod)
    h.send_header("Content-Type", "text/plain; charset=utf-8")
    h.send_header("Content-Length", str(len(corpo)))
    h.end_headers()
    h.wfile.write(corpo)
    return True
