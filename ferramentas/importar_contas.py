#!/usr/bin/env python3
"""
Traz do site antigo da Câmara de Neves Paulista os documentos de transparência que só existem lá:
  - Contas Públicas: balancetes, Relatório de Gestão Fiscal, subsídios dos vereadores, salário dos
    servidores, relatório do patrimônio e despesas de viagem (todos os anos);
  - páginas com arquivos: Plano de Contratações Anual, Carta de Serviços ao Usuário, LGPD.
Baixa uma cópia de cada arquivo (o site antigo vai sair do ar) e gera assets/contas.js, que o Portal
da Transparência mostra junto com o que a Câmara publica pelo painel.

Uso: python3 ferramentas/importar_contas.py   (no servidor roda junto com legislagov-importar)
Só biblioteca padrão. Pode rodar quantas vezes quiser: só baixa o que é novo.
"""
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ORIGEM = "https://www.camaranevespaulista.sp.gov.br"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.environ.get("LG_CONTEUDO") or RAIZ
UA = {"User-Agent": "Mozilla/5.0 (PortalCamaraNevesPaulista/1.0; migracao de conteudo)"}
MESES = {"janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
         "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}

# tipo do site antigo -> (categoria, subcategoria) do Portal da Transparência novo
TIPOS = {
    260: ("contas", "Balanços e demonstrativos", "Balancetes"),
    261: ("contas", "Relatório de Gestão Fiscal (RGF)", "Relatório de Gestão Fiscal"),
    263: ("vereadores", "Subsídios", "Subsídios dos Vereadores"),
    264: ("pessoal", "Folha de pagamento / remuneração", "Salário dos Servidores"),
    265: ("patrimonio", "Bens móveis", "Relatório do Patrimônio"),
    268: ("diarias", "Diárias concedidas", "Despesas de Viagem"),
}
PAGINAS = {
    351: ("licitacoes", "Plano de Contratações Anual"),
    340: ("institucional", "Carta de serviços"),
    344: ("sic", None),
}
EXT = r"(?:pdf|PDF|xlsx?|XLSX?|docx?|DOCX?|odt|ods|csv|zip)"


def seguro(url):
    """Endereços do site antigo têm espaço e acento no nome do arquivo: codifica só o caminho."""
    p = urllib.parse.urlsplit(url)
    return urllib.parse.urlunsplit((p.scheme, p.netloc, urllib.parse.quote(urllib.parse.unquote(p.path), safe="/"), p.query, p.fragment))


def baixar(url, tentativas=3):
    url = seguro(url)
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return r.read()
        except Exception:
            if i == tentativas - 1:
                raise
            time.sleep(2 * (i + 1))
    return b""


def texto(b):
    return b.decode("utf-8", "replace")


def limpa(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def absoluto(u):
    u = html.unescape(u)
    return u if u.startswith("http") else ORIGEM + ("" if u.startswith("/") else "/") + u


def data_br(s):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", s or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else ""


def competencia(titulo, ano):
    t = titulo.lower()
    for nome, n in MESES.items():
        if re.search(r"\b" + nome + r"\b", t):
            m = re.search(r"\b(20\d\d)\b", t)
            return f"{m.group(1) if m else ano}-{n:02d}"
    m = re.search(r"\b(20\d\d)\b", t)
    return m.group(1) if m else str(ano)


def guardar(url):
    """Baixa o arquivo para assets/contas/ (nome = resumo do endereço + extensão). Devolve o caminho público."""
    pasta = os.path.join(SAIDA, "assets", "contas")
    os.makedirs(pasta, exist_ok=True)
    ext = os.path.splitext(url.split("?")[0])[1].lower()[:5] or ".pdf"
    nome = hashlib.sha1(url.encode()).hexdigest()[:20] + ext
    destino = os.path.join(pasta, nome)
    if not os.path.exists(destino):
        dados = baixar(url)
        if len(dados) > 40_000_000:
            return None
        with open(destino + ".tmp", "wb") as f:
            f.write(dados)
        os.replace(destino + ".tmp", destino)
    return "assets/contas/" + nome


def arquivos_da_pagina(h):
    """(href, título, data) de cada link para arquivo; a data é a primeira dd/mm/aaaa depois do link."""
    out = []
    for m in re.finditer(r'<a[^>]+href="([^"]+\.' + EXT + r')"[^>]*>(.*?)</a>', h, re.S):
        tit = limpa(m.group(2)) or os.path.basename(m.group(1))
        depois = h[m.end():m.end() + 600]
        out.append((absoluto(m.group(1)), tit, data_br(limpa(depois))))
    return out


def main():
    itens, vistos, erros = [], set(), 0
    for tipo, (cat, sub, rotulo) in TIPOS.items():
        try:
            lista = texto(baixar(f"{ORIGEM}/ContaPublica/Listar/{tipo}"))
        except Exception as e:
            print("falhou lista", tipo, e)
            erros += 1
            continue
        anos = sorted({int(a) for a in re.findall(r"Visualizar\?idtipo=" + str(tipo) + r"&(?:amp;)?ano=(\d{4})", lista)}, reverse=True)
        for ano in anos:
            try:
                pg = texto(baixar(f"{ORIGEM}/ContaPublica/Visualizar?idtipo={tipo}&ano={ano}"))
            except Exception as e:
                print("falhou", tipo, ano, e)
                erros += 1
                continue
            for url, tit, data in arquivos_da_pagina(pg):
                if url in vistos or "/Arquivos/Uploads/LeiOrg" in url or "/Arquivos/Uploads/RegInt" in url:
                    continue
                vistos.add(url)
                try:
                    local = guardar(url)
                except Exception as e:
                    print("arquivo não baixado:", url, e)
                    local, erros = None, erros + 1
                itens.append({"id": "ant-" + hashlib.sha1(url.encode()).hexdigest()[:12], "cat": cat, "sub": sub, "titulo": tit,
                              "descricao": f"{rotulo} · trazido do site anterior da Câmara", "data": data or f"{ano}-12-31",
                              "competencia": competencia(tit, ano), "link": local or url, "origem": url, "publicado": True, "importado": True})
            print(f"{rotulo} {ano}: ok")
    for pid, (cat, sub) in PAGINAS.items():
        try:
            pg = texto(baixar(f"{ORIGEM}/Pagina/Listar/{pid}"))
        except Exception as e:
            print("falhou página", pid, e)
            continue
        for url, tit, data in arquivos_da_pagina(pg):
            if url in vistos or "/Arquivos/Uploads/LeiOrg" in url or "/Arquivos/Uploads/RegInt" in url:
                continue
            vistos.add(url)
            try:
                local = guardar(url)
            except Exception:
                local = None
            itens.append({"id": "ant-" + hashlib.sha1(url.encode()).hexdigest()[:12], "cat": cat, "sub": sub or "Relatório estatístico",
                          "titulo": tit, "descricao": "Trazido do site anterior da Câmara", "data": data or "",
                          "competencia": (data or "")[:4], "link": local or url, "origem": url, "publicado": True, "importado": True})
    if not itens:
        print("nada encontrado; assets/contas.js não foi alterado")
        sys.exit(1)
    itens.sort(key=lambda i: (i["cat"], i["data"]), reverse=True)
    os.makedirs(os.path.join(SAIDA, "assets"), exist_ok=True)
    with open(os.path.join(SAIDA, "assets", "contas.js.tmp"), "w", encoding="utf-8") as f:
        f.write("/* Documentos de transparência trazidos do site anterior (gerado por ferramentas/importar_contas.py) */\n")
        f.write("window.TRANSP_IMPORTADOS = " + json.dumps(itens, ensure_ascii=False, separators=(",", ":")) + ";\n")
    os.replace(os.path.join(SAIDA, "assets", "contas.js.tmp"), os.path.join(SAIDA, "assets", "contas.js"))
    print(f"{len(itens)} documentos; {erros} erro(s)")


if __name__ == "__main__":
    main()
