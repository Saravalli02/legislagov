"""
Envio de e-mails automáticos (nao-responda@legislagov.com.br) pela Amazon SES, região São Paulo.

Credenciais: LG_SES_CHAVE e LG_SES_SEGREDO em /etc/legislagov.env (usuário IAM "legislagov-envio-email",
que só pode enviar como @legislagov.com.br). Sem elas, enviar() devolve False e quem chamou mostra outro caminho
(ex.: "peça ao administrador").
"""
import os

REMETENTE = os.environ.get("LG_SES_REMETENTE", "LegislaGov <nao-responda@legislagov.com.br>")
REGIAO = os.environ.get("LG_SES_REGIAO", "sa-east-1")


def configurado():
    return bool(os.environ.get("LG_SES_CHAVE") and os.environ.get("LG_SES_SEGREDO"))


def enviar(para, assunto, texto):
    if not configurado():
        print("envio de e-mail: SES não configurado (LG_SES_CHAVE)", flush=True)
        return False
    try:
        import boto3
        ses = boto3.client("sesv2", region_name=REGIAO, aws_access_key_id=os.environ["LG_SES_CHAVE"],
                           aws_secret_access_key=os.environ["LG_SES_SEGREDO"])
        ses.send_email(FromEmailAddress=REMETENTE, Destination={"ToAddresses": [para]},
                       Content={"Simple": {"Subject": {"Data": assunto, "Charset": "UTF-8"},
                                           "Body": {"Text": {"Data": texto, "Charset": "UTF-8"}}}})
        return True
    except Exception as e:
        print("envio de e-mail falhou:", repr(e)[:300], flush=True)
        return False
