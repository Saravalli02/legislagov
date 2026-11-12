#!/usr/bin/env python3
"""
Traz do SISCAM (sistema anterior da Câmara) as proposituras de todos os anos, a legislação
e os documentos administrativos, pela exportação em CSV que o próprio SISCAM oferece.

Gera  <saída>/assets/siscam.js  com  window.SISCAM = {atualizado, proposituras, leis, administrativos}
<saída> = variável LG_CONTEUDO (no servidor: /var/lib/legislagov/conteudo) ou a pasta do portal.
Só biblioteca padrão do Python. Pode rodar quantas vezes quiser.
"""
import csv
import http.cookiejar
import io
import json
import os
import re
import sys
import time
import urllib.request

BASE = "https://nevespaulista.siscam.com.br"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.environ.get("LG_CONTEUDO") or RAIZ
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
MODULOS = {"proposituras": 80, "leis": 81, "administrativos": 79}

SIGLA = {"Projeto de Lei": "PL", "Projeto de Lei Complementar": "PLC", "Projeto de Resolução": "PR", "Projeto de Decreto Legislativo": "PDL",
         "Projeto de Emenda à Lei Orgânica": "PELO", "Requerimento": "REQ", "Indicação": "IND", "Moção": "MOC"}


def abrir():
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", UA), ("Accept-Language", "pt-BR,pt;q=0.9")]
    return op


def baixar(op, caminho, tentativas=3):
    for i in range(tentativas):
        try:
            with op.open(BASE + caminho, timeout=90) as r:
                return r.read()
        except Exception as erro:
            if i == tentativas - 1:
                raise
            print("  tentando de novo:", caminho, erro, flush=True)
            time.sleep(4)


def limpa(t, limite=None):
    t = re.sub(r"\s+", " ", (t or "").replace("\r", " ")).strip()
    if limite and len(t) > limite:
        corte = t.rfind(" ", 0, limite)
        t = t[: corte if corte > limite * 0.6 else limite].rstrip(" ,;:") + "…"
    return t


def ementa_curta(t):
    """O SISCAM guarda o texto inteiro (com erros de leitura do PDF); o site mostra o começo."""
    t = limpa(t)
    m = re.search(r"\b(REQUER|INDICA|PROP[ÕO]E|SOLICITA|MANIFESTA|APRESENTA)\b", t)
    if m and m.start() < 400:   # pula o cabeçalho "FULANO, Vereador da Câmara..., abaixo assinado, nos termos regimentais,"
        t = t[m.start():]
        t = t[0].upper() + t[1:].lower() if t.isupper() else t
    t = re.split(r"\bJUSTIFICATIVA\b", t, maxsplit=1, flags=re.I)[0]
    return limpa(t, 420)


def exportar(op, ident):
    q = f"Pesquisa=Simples&id={ident}&pagina=1&Modulo=8&Documento=0&Numeracao=Documento&NumeroInicial=&AnoInicial="
    baixar(op, f"/index/{ident}/8")
    baixar(op, "/Documentos/Pesquisa?" + q)          # o SISCAM guarda a pesquisa na sessão antes de exportar
    bruto = baixar(op, "/Documentos/Exportar?tipo=2&" + q)
    texto = bruto.decode("utf-8-sig", "replace")
    if not texto.startswith("Documento;"):
        raise RuntimeError(f"exportação do módulo {ident} não veio em CSV")
    return list(csv.DictReader(io.StringIO(texto), delimiter=";"))


def data_iso(br):
    m = re.match(r"(\d{2})/(\d{2})/(\d{4})", br or "")
    return f"{m[3]}-{m[2]}-{m[1]}" if m else ""


def main():
    op = abrir()
    saida = {"atualizado": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "fonte": BASE}
    for nome, ident in MODULOS.items():
        print(f">> {nome} (módulo {ident})", flush=True)
        try:
            linhas = exportar(op, ident)
        except Exception as erro:
            print("   falhou:", erro, flush=True)
            continue
        itens = []
        for r in linhas:
            tipo = limpa(r.get("Documento"))
            num, ano = limpa(r.get("Numero")), limpa(r.get("Ano"))
            if not tipo or not num:
                continue
            item = {"tipo": tipo, "numero": num, "ano": int(ano) if ano.isdigit() else None, "data": data_iso(r.get("Data")),
                    "autoria": limpa(r.get("Autoria"), 300), "situacao": limpa(r.get("Situação") or r.get("Situacao")),
                    "classificacao": limpa(r.get("Classificacao"))}
            if nome == "proposituras":
                item["sigla"] = SIGLA.get(tipo, tipo[:4].upper())
                item["ementa"] = ementa_curta(r.get("Ementa"))
            else:
                item["ementa"] = limpa(r.get("Ementa"), 600)
            itens.append(item)
        itens.sort(key=lambda x: (x["data"], x["numero"]), reverse=True)
        saida[nome] = itens
        print(f"   {len(itens)} registros", flush=True)
    if not any(k in saida for k in MODULOS):
        print("Nada foi importado.")
        sys.exit(1)
    destino = os.path.join(SAIDA, "assets", "siscam.js")
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    tmp = destino + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("/* Gerado por ferramentas/importar_siscam.py — dados do SISCAM (sistema anterior da Câmara). */\n")
        f.write("window.SISCAM = " + json.dumps(saida, ensure_ascii=False, separators=(",", ":")) + ";\n")
    os.replace(tmp, destino)
    print(">> gravado em", destino, flush=True)


if __name__ == "__main__":
    main()
