"""
LegislaGov — aviso de segurança fora do sistema (SMS).

Quando há muitas senhas erradas numa conta, o servidor avisa no sino do sistema (sempre) e,
se estiver configurado, manda SMS para o celular do dono da conta e dos administradores.

Configuração em /etc/legislagov.env (sem isso, só o aviso no sistema):
  LG_SMS_ATIVO=1
  LG_SMS_CHAVE=...        chave de acesso da Amazon com permissão só de enviar SMS (sns:Publish)
  LG_SMS_SEGREDO=...
  LG_SMS_REGIAO=sa-east-1
  LG_ALERTA_TELEFONES=5517999999999,5517988888888   (celulares dos administradores; opcional)
O celular do usuário vem do cadastro (campo "Celular").
"""
import os
import re


def _e164(tel):
    d = re.sub(r"\D", "", str(tel or ""))
    if not d:
        return ""
    if not d.startswith("55"):
        d = "55" + d
    return "+" + d if 12 <= len(d) <= 13 else ""


def _destinos(conta, admins):
    nums = []
    if conta and conta.get("telefone"):
        nums.append(_e164(conta["telefone"]))
    for a in admins or []:
        nums.append(_e164(a.get("telefone")))
    nums += [_e164(x) for x in os.environ.get("LG_ALERTA_TELEFONES", "").split(",")]
    vistos, out = set(), []
    for n in nums:
        if n and n not in vistos:
            vistos.add(n); out.append(n)
    return out[:6]


def mensagem(camara, item):
    acao = "A conta foi bloqueada por 15 minutos." if item.get("tipo") == "bloqueio" else ""
    return (f"LegislaGov: {item.get('tentativas')} senhas erradas em 15 min na conta '{item.get('login')}' "
            f"({camara}). {acao} Se nao foi voce, troque a senha e avise o administrador.").replace("  ", " ")[:300]


def enviar(camara, item, conta, admins):
    if os.environ.get("LG_SMS_ATIVO") != "1":
        return 0
    chave, segredo = os.environ.get("LG_SMS_CHAVE"), os.environ.get("LG_SMS_SEGREDO")
    if not (chave and segredo):
        return 0
    import boto3
    sns = boto3.client("sns", region_name=os.environ.get("LG_SMS_REGIAO", "sa-east-1"),
                       aws_access_key_id=chave, aws_secret_access_key=segredo)
    texto, n = mensagem(camara, item), 0
    for numero in _destinos(conta, admins):
        try:
            sns.publish(PhoneNumber=numero, Message=texto,
                        MessageAttributes={"AWS.SNS.SMS.SMSType": {"DataType": "String", "StringValue": "Transactional"}})
            n += 1
        except Exception as e:
            print("SMS não enviado para", numero[:6] + "…", repr(e)[:160], flush=True)
    return n
