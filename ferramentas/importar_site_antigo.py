#!/usr/bin/env python3
"""
Importa o conteúdo do site antigo da Câmara Municipal de Neves Paulista
para o portal novo: TODAS as notícias (título, data, categoria, fotos) e as
imagens institucionais (brasão, bandeira, vereadores, plenário).

Uso (na pasta do portal):
    python ferramentas/importar_site_antigo.py            # notícias + imagens
    python ferramentas/importar_site_antigo.py --so-imagens

Gera:
    assets/noticias.js           (lista completa de notícias)
    assets/img/noticias/<id>.*   (foto de capa de cada notícia que tiver foto)
    assets/img/...               (brasão, bandeira, vereadores, plenário)

Só usa a biblioteca padrão do Python 3. Pode ser executado quantas vezes quiser:
arquivos já baixados não são baixados de novo.
"""
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ORIGEM = "https://www.camaranevespaulista.sp.gov.br"
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAIDA = os.environ.get("LG_CONTEUDO") or RAIZ   # no servidor: /var/lib/legislagov/conteudo
UA = {"User-Agent": "Mozilla/5.0 (PortalCamaraNevesPaulista/1.0; migracao de conteudo)"}
MESES = {"janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4, "maio": 5, "junho": 6,
         "julho": 7, "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12}

# ---------------------------------------------------------------- texto
SIGLAS = {"FME", "SUAS", "SAMU", "LDO", "LOA", "PPA", "IPTU", "ITBI", "RGA", "REFIS", "CPFL", "APAE", "APAN",
          "COVID", "OMS", "SP", "PL", "PEC", "MDB", "PSD", "PL", "TCE", "SIC", "LGPD", "UBS", "CRAS", "CREAS",
          "ESF", "ETEC", "EMEF", "EMEI", "ONG", "R$", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII"}
NOMES = ["Neves Paulista", "Câmara Municipal", "Prefeitura Municipal", "Poder Executivo", "Poder Legislativo",
         "Santa Casa de Misericórdia", "Santa Casa", "Lions Clube", "Conselho Tutelar", "Conselho Municipal de Cultura",
         "Fundo Municipal de Educação", "Fundo Municipal de Seguridade", "Fundo de Assistência Social",
         "Departamento Municipal de Saúde", "Escola Estadual", "Professor Guines Affonso Morales", "Miraluz",
         "Parque das Palmeiras", "Irmãos Toledo", "São Cristóvão", "Lar São Vicente", "Mesa Diretora",
         "Edenilson Roselli", "Roselli", "Everton Fermiano", "Everton", "Evertinho", "Maikon", "Emerson",
         "Lucas", "Lucão", "Luis Pelacani", "Pelacani", "Sirlei", "Tonho", "Pastelão", "Márcio José Baia",
         "Miguel Lombardi", "Carlão Pignatari", "Galuber Romano", "Mestre Chico", "Dona Loló", "Markito",
         "Galera do Rolê", "Francisco Simão Rodrigues Filho", "Hermelinda Maria Pereira da Luz",
         "Carlos Francisco Furlaneto", "Marcus Vinicius de Azevedo Jóia", "Luis Carlos de Souza",
         "Leonidio Moretti", "José Luiz Serafim", "Luiz Fernandes Ruiz", "Luis Antonio Pelacani"]


def frase(titulo: str) -> str:
    """Converte um título TODO EM MAIÚSCULAS para a forma de frase, preservando siglas e nomes."""
    t = html.unescape(re.sub(r"\s+", " ", titulo)).strip()
    letras = [c for c in t if c.isalpha()]
    if letras and sum(c.isupper() for c in letras) / len(letras) < 0.7:
        return t  # já está em caixa normal
    s = t.lower()
    s = re.sub(r"\bc[aâ]mara\b", "Câmara", s)
    for nome in sorted(NOMES, key=len, reverse=True):
        s = re.sub(r"(?i)\b" + re.escape(nome.lower()) + r"\b", nome, s)

    def sigla(m):
        w = m.group(0)
        return w.upper() if w.upper() in SIGLAS else w
    s = re.sub(r"[a-zçãõáéíóúâêôà$]+", sigla, s)
    s = re.sub(r"\bmunicipio\b", "município", s)
    # maiúscula no início e depois de ponto final / dois-pontos seguidos de frase
    s = re.sub(r"(^|[.!?]\s+)([a-zçãõáéíóúâêô])", lambda m: m.group(1) + m.group(2).upper(), s)
    return s[:1].upper() + s[1:]


def categoria(titulo: str) -> str:
    t = titulo.lower()
    if "audiência pública" in t or "audiencia publica" in t:
        return "Audiências públicas"
    if "veto" in t:
        return "Vetos"
    if "moção" in t or "mocao" in t:
        return "Moções e homenagens"
    if "crédito" in t or "credito" in t or "orçament" in t or "contas" in t or "ldo" in t or "repasse" in t:
        return "Orçamento e finanças"
    if "presidente" in t or "mesa diretora" in t or "eleitos" in t or "posse" in t or "recesso" in t or "resumo" in t:
        return "Institucional"
    if "projeto" in t or "lei" in t:
        return "Projetos aprovados"
    return "Notícias da Câmara"


def data_iso(texto: str) -> str:
    m = re.search(r"(\d{1,2}) de (\w+) de (\d{4})", html.unescape(texto), re.I)
    if not m:
        return ""
    mes = MESES.get(m.group(2).lower(), 0)
    return f"{m.group(3)}-{mes:02d}-{int(m.group(1)):02d}" if mes else ""


# ---------------------------------------------------------------- leitura das páginas
def baixar(url: str, tentativas: int = 3) -> bytes:
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                return r.read()
        except Exception:
            if i == tentativas - 1:
                raise
            time.sleep(1.5 * (i + 1))
    return b""


def ler_lista(pagina_html: str):
    """Extrai (id, data, título) dos blocos <div class="noticia"> da listagem."""
    itens = []
    for bloco in re.findall(r'<div class="noticia">(.*?)</div>', pagina_html, re.S):
        mid = re.search(r"/Noticia/Visualizar/(\d+)", bloco)
        mdt = re.search(r'class="data">(.*?)</p>', bloco, re.S)
        mti = re.search(r"<h1>(.*?)</h1>", bloco, re.S)
        if mid and mti:
            itens.append((int(mid.group(1)), data_iso(mdt.group(1) if mdt else ""), html.unescape(mti.group(1)).strip()))
    return itens


def ler_detalhe(det_html: str):
    """Extrai o título, a data e as imagens de uma notícia."""
    tit = re.search(r'<h1 class="bg-titulo">(.*?)</h1>', det_html, re.S)
    pub = re.search(r"Publicado em:\s*([^<]+)", det_html)
    corpo = det_html.split('id="noticias-relacionada"')[0]
    imgs = []
    for m in re.finditer(r'href="(/Arquivos/Noticias/[^"?]+\.(?:jpe?g|png|webp|gif))"', corpo, re.I):
        if m.group(1) not in imgs:
            imgs.append(m.group(1))
    for m in re.finditer(r'src="(/Arquivos/Noticias/[^"?]+\.(?:jpe?g|png|webp|gif))', corpo, re.I):
        if m.group(1) not in imgs:
            imgs.append(m.group(1))
    resumo = re.search(r'<p class="resumo">(.*?)</p>', det_html, re.S)
    texto = re.sub(r"<[^>]+>", " ", html.unescape(resumo.group(1))).strip() if resumo else ""
    return {
        "titulo": html.unescape(tit.group(1)).strip() if tit else "",
        "data": data_iso(pub.group(1)) if pub else "",
        "imagens": imgs,
        "resumo": re.sub(r"\s+", " ", texto),
    }


def salvar_arquivo(url: str, destino: str) -> bool:
    if os.path.exists(destino) and os.path.getsize(destino) > 0:
        return True
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    try:
        dados = baixar(url)
        with open(destino, "wb") as f:
            f.write(dados)
        return True
    except Exception as e:
        print("   falhou:", url, "-", e)
        return False


# ---------------------------------------------------------------- imagens institucionais
def imagens_institucionais():
    """Lê as imagens declaradas em assets/dados.js (IMG e VEREADORES) e baixa cada uma."""
    dados = open(os.path.join(RAIZ, "assets", "dados.js"), encoding="utf-8").read()
    pares = re.findall(r"local: '([^']+)',\s*remoto: ORIGEM \+ '([^']+)'", dados)
    for foto, arq in re.findall(r"foto: '([^']+)',[^}]*?arq: '([^']+)'", dados):
        pares.append((f"assets/img/vereadores/{arq}.jpg", "/Arquivos/Vereadores/" + urllib.parse.quote(foto) + "?quality=85&w=600"))
    ok = 0
    for local, remoto in pares:
        if salvar_arquivo(ORIGEM + remoto, os.path.join(SAIDA, *local.split("/"))):
            ok += 1
    print(f"Imagens institucionais: {ok} de {len(pares)}")


# ---------------------------------------------------------------- notícias
def importar_noticias():
    print("Lendo a lista de notícias...")
    lista, vistos, pagina = [], set(), 1
    while pagina < 200:
        try:
            itens = ler_lista(baixar(f"{ORIGEM}/Noticia/Pagina/{pagina}").decode("utf-8", "replace"))
        except Exception as e:
            print("  página", pagina, "falhou:", e)
            break
        novos = [i for i in itens if i[0] not in vistos]
        if not novos:
            break
        for i in novos:
            vistos.add(i[0])
        lista += novos
        print(f"  página {pagina}: {len(novos)} notícias")
        pagina += 1
    print(f"Total: {len(lista)} notícias. Lendo cada notícia (fotos)...")

    def detalhe(item):
        nid, data, titulo = item
        try:
            d = ler_detalhe(baixar(f"{ORIGEM}/Noticia/Visualizar/{nid}").decode("utf-8", "replace"))
        except Exception:
            d = {"titulo": titulo, "data": data, "imagens": [], "resumo": ""}
        capa = ""
        fotos = []
        for n, caminho in enumerate(d["imagens"][:8]):
            ext = os.path.splitext(caminho)[1].lower() or ".jpg"
            nome = f"{nid}{'' if n == 0 else '-' + str(n)}{ext}"
            if salvar_arquivo(ORIGEM + urllib.parse.quote(caminho) + "?quality=82&w=1400", os.path.join(SAIDA, "assets", "img", "noticias", nome)):
                fotos.append("assets/img/noticias/" + nome)
        if fotos:
            capa = fotos[0]
        t = d["titulo"] or titulo
        return {"id": nid, "data": d["data"] or data, "titulo": frase(t), "tituloOriginal": t,
                "categoria": categoria(t), "resumo": d["resumo"], "capa": capa, "fotos": fotos,
                "original": f"{ORIGEM}/Noticia/Visualizar/{nid}"}

    with ThreadPoolExecutor(max_workers=6) as ex:
        noticias = list(ex.map(detalhe, lista))
    noticias.sort(key=lambda n: (n["data"], n["id"]), reverse=True)
    destino = os.path.join(SAIDA, "assets", "noticias.js")
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    with open(destino, "w", encoding="utf-8") as f:
        f.write("/* Gerado por ferramentas/importar_site_antigo.py em " + time.strftime("%d/%m/%Y %H:%M") + " */\n")
        f.write("window.NOTICIAS_ARQUIVO = " + json.dumps(noticias, ensure_ascii=False, indent=0) + ";\n")
    com_foto = sum(1 for n in noticias if n["capa"])
    print(f"Pronto: {len(noticias)} notícias ({com_foto} com foto) gravadas em assets/noticias.js")


if __name__ == "__main__":
    os.chdir(RAIZ)
    imagens_institucionais()
    if "--so-imagens" not in sys.argv:
        importar_noticias()
    print("\nConcluído. Abra o portal pelo INICIAR_CAMARA.bat para ver o resultado.")
