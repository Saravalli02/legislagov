"""
Envio de e-mails automáticos (nao-responda@legislagov.com.br) pela Amazon SES, região São Paulo.

Credenciais: LG_SES_CHAVE e LG_SES_SEGREDO em /etc/legislagov.env (usuário IAM "legislagov-envio-email",
que só pode enviar como @legislagov.com.br). Sem elas, enviar() devolve False e quem chamou mostra outro caminho
(ex.: "peça ao administrador").
"""
import json
import os
import secrets
import threading
import time
import urllib.request

REMETENTE = os.environ.get("LG_SES_REMETENTE", "LegislaGov <nao-responda@legislagov.com.br>")
REGIAO = os.environ.get("LG_SES_REGIAO", "sa-east-1")


def _ses_direto():
    return bool(os.environ.get("LG_SES_CHAVE") and os.environ.get("LG_SES_SEGREDO"))


def configurado():
    return _ses_direto() or bool(os.environ.get("LG_EMAIL_LAMBDA", "https://restaurante.grsoftware.com.br/api/_email"))


# Sem chave da SES no servidor, o e-mail sai pelo servidor do GR Restaurante na Amazon (Lambda, que tem permissão
# própria de enviar). O e-mail fica guardado aqui só na memória; o Lambda recebe apenas o número, busca o conteúdo de
# volta em /api/central/rest/saida (uma vez só, até 5 minutos) e envia. Ninguém de fora consegue mandar e-mail por ele.
SAIDA = {}
LAMBDA_EMAIL = os.environ.get("LG_EMAIL_LAMBDA", "https://restaurante.grsoftware.com.br/api/_email")
REMETENTE_GR = os.environ.get("LG_SES_REMETENTE_GR", "GR Software <nao-responda@grsoftware.com.br>")


def retirar(eid):
    """Chamado pelo Lambda: devolve o e-mail guardado (uma vez só)."""
    agora = time.time()
    for k in [k for k, v in SAIDA.items() if agora - v["criado"] > 300]:
        SAIDA.pop(k, None)
    return SAIDA.pop(str(eid or ""), None)


def _pelo_lambda(para, assunto, texto, remetente):
    eid = secrets.token_urlsafe(18)
    SAIDA[eid] = {"para": para, "assunto": assunto, "texto": texto, "de": remetente, "criado": time.time()}

    def vai():
        try:
            req = urllib.request.Request(LAMBDA_EMAIL, data=json.dumps({"id": eid}).encode(), method="POST",
                                         headers={"Content-Type": "application/json", "x-lg": "1"})
            with urllib.request.urlopen(req, timeout=15) as r:
                r.read()
        except Exception as e:
            print("envio de e-mail (Lambda) falhou:", repr(e)[:300], flush=True)
    threading.Thread(target=vai, daemon=True).start()
    return True


def enviar(para, assunto, texto, remetente=None):
    if not _ses_direto():
        return _pelo_lambda(para, assunto, texto, remetente or REMETENTE)
    try:
        import boto3
        ses = boto3.client("sesv2", region_name=REGIAO, aws_access_key_id=os.environ["LG_SES_CHAVE"],
                           aws_secret_access_key=os.environ["LG_SES_SEGREDO"])
        ses.send_email(FromEmailAddress=remetente or REMETENTE, Destination={"ToAddresses": [para]},
                       Content={"Simple": {"Subject": {"Data": assunto, "Charset": "UTF-8"},
                                           "Body": {"Text": {"Data": texto, "Charset": "UTF-8"}}}})
        return True
    except Exception as e:
        print("envio de e-mail falhou:", repr(e)[:300], flush=True)
        return False
