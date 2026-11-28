"""
Assinaturas do GR Restaurante / Açougue: venda rápida (cria tudo de uma vez) e controle de vencimento.

- provisionar(): cria o comércio, o usuário administrador (login = e-mail), o código das videoaulas e o plano,
  e manda o e-mail de boas-vindas. É a mesma função que o pagamento automático vai chamar no futuro.
- verificar(): roda sozinho de hora em hora. Avisa por e-mail 5 dias e 1 dia antes de vencer; no vencimento
  (depois de CARENCIA dias) corta o acesso com o motivo "Assinatura vencida". Os dados nunca são apagados.
- renovar(): estende o vencimento e, se o corte foi por vencimento, libera na hora.
"""
import re
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

import lgapi

BR = timezone(timedelta(hours=-3))
PLANOS = {"teste": "Teste grátis", "mensal": "Mensal", "anual": "Anual", "cortesia": "Cortesia (sem vencimento)"}
DIAS_PLANO = {"teste": 7, "mensal": 30, "anual": 365}
CARENCIA = 3                       # dias depois do vencimento até cortar o acesso
MOTIVO = "Assinatura vencida"
POR = "automático (vencimento)"
SUPORTE = "(17) 98187-4267"
URL = {"restaurante": "https://restaurante.grsoftware.com.br/", "acougue": "https://acougue.grsoftware.com.br/"}
_ok = {"db": False}


def _db(c):
    if not _ok["db"]:
        c.execute("""CREATE TABLE IF NOT EXISTS ct_planos(sistema TEXT NOT NULL, cliente TEXT NOT NULL, plano TEXT NOT NULL,
            vence REAL, email TEXT, fone TEXT, criado REAL, avisos TEXT NOT NULL DEFAULT '', obs TEXT,
            PRIMARY KEY(sistema, cliente))""")
        _ok["db"] = True
    return c


def _fim_do_dia(ts):
    d = datetime.fromtimestamp(ts, BR)
    return d.replace(hour=23, minute=59, second=59, microsecond=0).timestamp()


def _data(ts):
    return datetime.fromtimestamp(ts, BR).strftime("%d/%m/%Y") if ts else "—"


def _senha():
    alf = "abcdefghjkmnpqrstuvwxyz23456789"
    return "".join(secrets.choice(alf) for _ in range(4)) + "-" + "".join(secrets.choice(alf) for _ in range(4))


def info(c, cliente):
    """Plano de um cliente (para a Central e para o aviso dentro do sistema)."""
    _db(c)
    r = c.execute("SELECT * FROM ct_planos WHERE sistema='restaurante' AND cliente=?", (str(cliente),)).fetchone()
    if not r:
        return {"plano": "", "planoNome": "Sem plano cadastrado", "vence": None, "dias": None}
    dias = None if r["plano"] == "cortesia" or not r["vence"] else int((r["vence"] - time.time()) // 86400)
    return {"plano": r["plano"], "planoNome": PLANOS.get(r["plano"], r["plano"]), "vence": r["vence"], "venceTxt": _data(r["vence"]),
            "dias": dias, "email": r["email"] or "", "fone": r["fone"] or ""}


def _texto_boas_vindas(nome_resp, comercio, tipo, login, senha, codigo):
    sis = "GR Açougue" if tipo == "acougue" else "GR Restaurante"
    url = URL.get(tipo, URL["restaurante"])
    linhas = [f"Olá, {nome_resp or comercio}!", "",
              f"Seja bem-vindo(a) ao {sis}. O sistema do {comercio} já está pronto para usar.", "",
              "COMO ENTRAR", f"Endereço: {url}", f"Usuário: {login}", f"Senha provisória: {senha}",
              "No primeiro acesso vamos mandar um código de 6 números para este e-mail, para confirmar que é você.", ""]
    if tipo != "acougue":
        linhas += ["APP DO GARÇOM", f"{url}garcom — os garçons entram com nome e PIN, que você cria em Ajustes › Garçons.", ""]
    linhas += ["IMPRESSORA DE CUPOM", "Baixe o Kit de impressão GR no computador do caixa e rode o instalador:",
               "https://central.grsoftware.com.br/api/central/kit-impressao", ""]
    if codigo:
        linhas += ["VIDEOAULAS", "Acesse https://grsoftware.com.br/aulas › Primeiro acesso, e use este e-mail e o código:",
                   f"{codigo}", ""]
    linhas += ["SUPORTE", f"WhatsApp {SUPORTE} · grsoftware.com.br", "",
               "Guarde este e-mail. Troque a senha provisória pedindo ao suporte se alguém tiver visto.", "", "— GR Software"]
    return "\n".join(linhas)


def provisionar(c, d, por):
    """Cria comércio + administrador + código das videoaulas + plano e envia o e-mail de boas-vindas."""
    import lgacesso
    import lgaulas
    _db(c)
    nome = str(d.get("nome") or "").strip()[:80]
    tipo = d.get("tipo") if d.get("tipo") in lgacesso.TIPOS else "restaurante"
    resp = str(d.get("responsavel") or "").strip()[:80]
    email = str(d.get("email") or "").strip().lower()[:160]
    fone = re.sub(r"\D", "", str(d.get("fone") or ""))[:13]
    plano = d.get("plano") if d.get("plano") in PLANOS else "teste"
    if not nome:
        return 400, {"ok": False, "erro": "Escreva o nome do comércio."}
    if not resp:
        return 400, {"ok": False, "erro": "Escreva o nome do responsável."}
    if not lgacesso.email_ok(email):
        return 400, {"ok": False, "erro": "Escreva um e-mail válido. É o usuário de entrada e para onde vão os avisos."}
    if c.execute("SELECT 1 FROM ct_rest_usuarios WHERE usuario=?", (email,)).fetchone():
        return 409, {"ok": False, "erro": "Já existe um usuário com este e-mail. Use outro ou renove o plano do cliente que já existe."}
    cod, r = lgacesso.salvar_cliente(c, {"sistema": "restaurante", "nome": nome, "tipo": tipo, "responsavel": resp,
                                         "obs": str(d.get("obs") or "")[:200]})
    if cod != 200:
        return cod, r
    cli = r["id"]
    senha = _senha()
    cod, ru = lgacesso.rest_criar(c, {"cliente": cli, "nome": resp, "usuario": email, "senha": senha, "perfil": "adm", "email": email})
    if cod != 200:
        c.execute("DELETE FROM ct_clientes WHERE sistema='restaurante' AND id=?", (cli,))
        return cod, ru
    codigo = ""
    if d.get("aulas", True):
        ca, ra = lgaulas.novo_codigo(c, por, {"sistema": tipo, "cliente": nome, "email": email})
        codigo = ra.get("codigo", "") if ca == 200 else ""
    dias = int(d.get("dias") or DIAS_PLANO.get(plano, 30))
    vence = None if plano == "cortesia" else _fim_do_dia(time.time() + dias * 86400)
    c.execute("INSERT OR REPLACE INTO ct_planos(sistema, cliente, plano, vence, email, fone, criado, avisos, obs) VALUES('restaurante',?,?,?,?,?,?,'',?)",
              (cli, plano, vence, email, fone, time.time(), f"criado por {por}"))
    texto = _texto_boas_vindas(resp, nome, tipo, email, senha, codigo)
    enviado = False
    if d.get("enviarEmail", True):
        import lgenvio
        enviado = lgenvio.enviar(email, f"Bem-vindo(a) ao {'GR Açougue' if tipo == 'acougue' else 'GR Restaurante'} — seus dados de acesso",
                                 texto, lgenvio.REMETENTE_GR)
    url = URL.get(tipo, URL["restaurante"])
    whats = (f"Olá, {resp}! Seu {'GR Açougue' if tipo == 'acougue' else 'GR Restaurante'} está pronto. ✅\n\n"
             f"🔗 {url}\n👤 Usuário: {email}\n🔑 Senha provisória: {senha}\n"
             + (f"\n🎬 Videoaulas: grsoftware.com.br/aulas › Primeiro acesso · código {codigo}\n" if codigo else "")
             + f"\nNo primeiro acesso chega um código no seu e-mail para confirmar. Qualquer dúvida, é só chamar aqui.")
    return 200, {"ok": True, "cliente": cli, "usuario": email, "senha": senha, "codigo": codigo, "url": url,
                 "vence": vence, "venceTxt": _data(vence), "plano": PLANOS[plano], "emailEnviado": enviado,
                 "whatsapp": whats, "fone": fone}


def renovar(c, cliente, plano, dias=None, ate=None):
    """Estende o vencimento (a partir de hoje ou do vencimento atual, o que for maior) e libera se estava vencido."""
    import lgacesso
    _db(c)
    cli = str(cliente or "")
    if not c.execute("SELECT 1 FROM ct_clientes WHERE sistema='restaurante' AND id=?", (cli,)).fetchone():
        return 404, {"ok": False, "erro": "Cliente não encontrado."}
    plano = plano if plano in PLANOS else "mensal"
    r = c.execute("SELECT * FROM ct_planos WHERE sistema='restaurante' AND cliente=?", (cli,)).fetchone()
    if plano == "cortesia":
        vence = None
    elif ate:
        try:
            vence = _fim_do_dia(datetime.strptime(str(ate)[:10], "%Y-%m-%d").replace(tzinfo=BR, hour=12).timestamp())
        except ValueError:
            return 400, {"ok": False, "erro": "Data inválida."}
    else:
        base = max(time.time(), (r["vence"] or 0) if r else 0)
        vence = _fim_do_dia(base + int(dias or DIAS_PLANO.get(plano, 30)) * 86400)
    if r:
        c.execute("UPDATE ct_planos SET plano=?, vence=?, avisos='' WHERE sistema='restaurante' AND cliente=?", (plano, vence, cli))
    else:
        c.execute("INSERT INTO ct_planos(sistema, cliente, plano, vence, criado, avisos) VALUES('restaurante',?,?,?,?,'')", (cli, plano, vence, time.time()))
    a = c.execute("SELECT motivo FROM ct_acesso WHERE sistema='restaurante' AND cliente=? AND usuario=''", (cli,)).fetchone()
    liberado = False
    if a and (a["motivo"] or "") == MOTIVO and (vence is None or vence > time.time()):
        lgacesso.definir("restaurante", cli, "", False, "", "renovação")
        liberado = True
    return 200, {"ok": True, "vence": vence, "venceTxt": _data(vence), "liberado": liberado}


def _email_aviso(r, nome, quando):
    import lgenvio
    if not r["email"]:
        return
    if quando == "venceu":
        assunto = f"Sua assinatura do {nome} venceu"
        corpo = (f"Olá!\n\nA assinatura do sistema do {nome} venceu em {_data(r['vence'])}.\n"
                 f"O acesso continua liberado por mais {CARENCIA} dias. Depois disso o sistema fica travado até a renovação.\n"
                 "Seus dados continuam guardados e voltam assim que renovar.\n\n"
                 f"Para renovar, fale com a gente no WhatsApp {SUPORTE}.\n\n— GR Software")
    elif quando == "cortado":
        assunto = f"Acesso ao sistema do {nome} suspenso"
        corpo = (f"Olá!\n\nComo a assinatura venceu em {_data(r['vence'])}, o acesso ao sistema do {nome} foi suspenso.\n"
                 "Nenhum dado foi apagado: assim que renovar, tudo volta como estava, na hora.\n\n"
                 f"WhatsApp {SUPORTE} · grsoftware.com.br\n\n— GR Software")
    else:
        assunto = f"Sua assinatura do {nome} vence em {quando} dia(s)"
        corpo = (f"Olá!\n\nA assinatura do sistema do {nome} vence em {_data(r['vence'])}.\n"
                 f"Para não ter o sistema travado, renove antes. É só chamar no WhatsApp {SUPORTE}.\n\n— GR Software")
    lgenvio.enviar(r["email"], assunto, corpo, lgenvio.REMETENTE_GR)


def verificar(c):
    """Avisos e cortes automáticos. Cada aviso vai uma vez só (campo avisos)."""
    import lgacesso
    _db(c)
    agora, feitos = time.time(), []
    for r in c.execute("SELECT p.*, k.nome FROM ct_planos p JOIN ct_clientes k ON k.sistema=p.sistema AND k.id=p.cliente "
                       "WHERE p.sistema='restaurante' AND p.plano!='cortesia' AND p.vence IS NOT NULL").fetchall():
        av = set(filter(None, (r["avisos"] or "").split(",")))
        falta = (r["vence"] - agora) / 86400
        etapa = None
        if falta < -CARENCIA:
            etapa = "cortado"
        elif falta < 0:
            etapa = "venceu"
        elif falta <= 1:
            etapa = "1"
        elif falta <= 5:
            etapa = "5"
        if not etapa or etapa in av:
            continue
        if etapa == "cortado":
            a = c.execute("SELECT 1 FROM ct_acesso WHERE sistema='restaurante' AND cliente=? AND usuario=''", (r["cliente"],)).fetchone()
            if not a:
                lgacesso.definir("restaurante", r["cliente"], "", True, MOTIVO, POR)
        try:
            _email_aviso(r, r["nome"], etapa)
        except Exception as e:
            print("assinaturas: e-mail", repr(e)[:200], flush=True)
        av.add(etapa)
        c.execute("UPDATE ct_planos SET avisos=? WHERE sistema='restaurante' AND cliente=?", (",".join(sorted(av)), r["cliente"]))
        feitos.append((r["cliente"], etapa))
    return feitos


def _laco():
    time.sleep(60)
    while True:
        try:
            import lgacesso
            with lgapi._trava:
                f = verificar(lgacesso._db())
            if f:
                print("assinaturas:", f, flush=True)
        except Exception as e:
            print("assinaturas: erro", repr(e)[:300], flush=True)
        time.sleep(3600)


def iniciar():
    threading.Thread(target=_laco, daemon=True).start()
