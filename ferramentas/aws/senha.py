#!/usr/bin/env python3
"""Define a senha de um usuário do LegislaGov direto no servidor (a senha é digitada aqui, não fica no GitHub).

Uso no servidor (Lightsail > Conectar usando SSH):
    sudo legislagov-senha Ricardo
    sudo legislagov-senha Geraldo
Vale para todas as câmaras do servidor (teste, Neves...). Com --camara NOME, só para uma.
"""
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import lgapi  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith("--")]
camara = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--camara=")), None)
if not args:
    print(__doc__)
    sys.exit(1)
login = args[0]
lgapi._geral()
for cam in lgapi.camaras_ids():
    if not camara or cam == camara:
        lgapi.semear(cam)   # garante que o banco da Câmara e os administradores existem
s1 = getpass.getpass(f"Nova senha para {login}: ")
s2 = getpass.getpass("Repita a senha: ")
if s1 != s2:
    print("As senhas não são iguais. Nada foi alterado.")
    sys.exit(1)
if len(s1) < 8:
    print("A senha precisa ter pelo menos 8 caracteres. Nada foi alterado.")
    sys.exit(1)
n = lgapi.definir_senha(login, s1, camara)
print(f"Pronto: senha de {login} definida em {n} câmara(s)." if n else f"Usuário {login} não encontrado.")
