"""
Conectores do Painel de e-mails com os provedores de caixas (Locaweb, Zoho, Google…).

Hoje nenhum provedor está ligado: o painel funciona em modo de preparação (as ações ficam
registradas e nada muda nas caixas de verdade). Para ligar um provedor quando ele for contratado:
  1. escrever a classe dele aqui (métodos criar, senha, renomear, cota, excluir, restaurar),
     chamando a API do provedor;
  2. pôr as chaves de acesso em /etc/legislagov.env (nunca no GitHub);
  3. marcar `pronto = True` na classe e escolher o provedor no cadastro do órgão.

Avisos para as caixas saem por SMTP (qualquer provedor), se configurado em /etc/legislagov.env:
  LG_EMAIL_SMTP_HOST, LG_EMAIL_SMTP_PORTA (587), LG_EMAIL_SMTP_USUARIO, LG_EMAIL_SMTP_SENHA,
  LG_EMAIL_REMETENTE (ex.: avisos@dominio).
"""
import os
import smtplib
from email.message import EmailMessage
from email.utils import formataddr


class Provedor:
    nome = "?"
    pronto = False   # True quando a integração com a API estiver escrita e configurada

    def criar(self, email, senha, cota_mb): raise NotImplementedError
    def senha(self, email, senha): raise NotImplementedError
    def renomear(self, antigo, novo): raise NotImplementedError
    def cota(self, email, cota_mb): raise NotImplementedError
    def excluir(self, email): raise NotImplementedError
    def restaurar(self, email): raise NotImplementedError


class Locaweb(Provedor):
    """Locaweb (Revenda / E-mail Locaweb). Pendente: confirmar com a Locaweb se há acesso por API."""
    nome = "Locaweb"


class Zoho(Provedor):
    """Zoho Mail — API de administração (https://www.zoho.com/mail/help/api/): reset de senha, excluir, criar.
    Chaves: LG_ZOHO_CLIENT_ID, LG_ZOHO_CLIENT_SECRET, LG_ZOHO_REFRESH_TOKEN, LG_ZOHO_ORG_ID."""
    nome = "Zoho Mail"


class Google(Provedor):
    """Google Workspace — Admin SDK Directory API. Chave de conta de serviço com delegação."""
    nome = "Google Workspace"


LISTA = {"nenhum": None, "locaweb": Locaweb, "zoho": Zoho, "google": Google}


def nome(chave):
    cls = LISTA.get(chave)
    return cls.nome if cls else "Nenhum (modo de preparação)"


def conectado(chave):
    cls = LISTA.get(chave)
    return bool(cls and cls.pronto)


def para(chave):
    """Instância do provedor pronto, ou None (modo de preparação)."""
    cls = LISTA.get(chave)
    return cls() if cls and cls.pronto else None


def opcoes():
    return [{"id": k, "nome": nome(k), "pronto": conectado(k) or k == "nenhum"} for k in LISTA]


def smtp_configurado():
    return bool(os.environ.get("LG_EMAIL_SMTP_HOST") and os.environ.get("LG_EMAIL_REMETENTE"))


def enviar_aviso(org, para_email, assunto, texto, quem):
    """Manda o aviso por SMTP. Devolve False se o envio ainda não foi configurado."""
    if not smtp_configurado():
        return False
    msg = EmailMessage()
    msg["From"] = formataddr((f"Administração de e-mail · {org['nome']}", os.environ["LG_EMAIL_REMETENTE"]))
    msg["To"] = para_email
    msg["Subject"] = assunto
    msg.set_content(f"{texto}\n\n— {quem}, administração de e-mail · {org['nome']}\n(Mensagem enviada pelo painel de e-mails LegislaGov.)")
    porta = int(os.environ.get("LG_EMAIL_SMTP_PORTA", "587"))
    with smtplib.SMTP(os.environ["LG_EMAIL_SMTP_HOST"], porta, timeout=20) as srv:
        srv.starttls()
        if os.environ.get("LG_EMAIL_SMTP_USUARIO"):
            srv.login(os.environ["LG_EMAIL_SMTP_USUARIO"], os.environ.get("LG_EMAIL_SMTP_SENHA", ""))
        srv.send_message(msg)
    return True
