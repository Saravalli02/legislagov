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
        tipo = "image/png" if nome.endswith(".png") else "application/octet-stream"
        with open(caminho, "rb") as f:
            s3.put_object(Bucket=ce.BUCKET, Key="restaurante-site/" + nome, Body=f.read(), ContentType=tipo)
        enviados.append(nome)
    s3.put_object(Bucket=ce.BUCKET, Key="restaurante-site/_ok.json", ContentType="application/json",
                  Body=json.dumps({"quando": time.strftime("%Y-%m-%dT%H:%M:%S"), "arquivos": enviados}).encode())
    print("enviados:", enviados)


if __name__ == "__main__":
    main()
