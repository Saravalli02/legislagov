#!/usr/bin/env python3
"""Leva os ícones do LegislaGov Restaurante (ferramentas/restaurante/site) para o depósito
legislagov-backup-sp, na pasta restaurante-site/. De lá eles são copiados para o site do
Restaurante na Amazon (CloudFront). Roda quando ferramentas/aws/restaurante.versao muda."""
import json, os, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import copia_externa as ce

PASTA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "restaurante", "site")


def main():
    s3 = ce.cliente()
    enviados = []
    for nome in sorted(os.listdir(PASTA)):
        caminho = os.path.join(PASTA, nome)
        if not os.path.isfile(caminho):
            continue
        tipo = {".png": "image/png", ".json": "application/json", ".js": "text/javascript", ".html": "text/html; charset=utf-8"}.get(os.path.splitext(nome)[1], "text/html; charset=utf-8" if nome in ("garcom", "cardapio") else "application/octet-stream")
        with open(caminho, "rb") as f:
            dados = f.read()
        s3.put_object(Bucket=ce.BUCKET, Key="restaurante-site/" + nome, Body=dados, ContentType=tipo)
        if nome.endswith(".png"):   # cópia em texto (hex), para a cópia entre regiões feita pela ferramenta da Amazon
            s3.put_object(Bucket=ce.BUCKET, Key="restaurante-site/" + nome + ".hex", Body=dados.hex().encode(), ContentType="text/plain")
        enviados.append(nome)
    s3.put_object(Bucket=ce.BUCKET, Key="restaurante-site/_ok.json", ContentType="application/json",
                  Body=json.dumps({"quando": time.strftime("%Y-%m-%dT%H:%M:%S"), "arquivos": enviados}).encode())
    print("enviados:", enviados)


if __name__ == "__main__":
    main()
