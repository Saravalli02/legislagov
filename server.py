"""
Servidor da Câmara Municipal de Neves Paulista (site + painel LegislaGov).

Hoje: entrega os arquivos do site e do painel (os dados ficam no navegador).
Próxima fase: este mesmo servidor recebe a API e o banco de dados
(usuários, matérias, assinaturas, financeiro) para todos compartilharem.

Render: Start Command  ->  python server.py
Local:  python server.py   (abre em http://localhost:8000)
Só usa a biblioteca padrão do Python (não precisa instalar nada).

TV Câmara (YouTube): a cada 20 minutos o servidor lê o feed público do canal da Câmara
(sem senha e sem chave) e entrega a lista de vídeos em /api/youtube. O site mostra o vídeo
novo sozinho, com o resumo da sessão montado a partir da pauta e das votações.
  YOUTUBE_CANAL     endereço do canal (@nome) ou o ID que começa com UC (opcional)
  YOUTUBE_FEED_URL  feed alternativo, para testes (opcional)
"""
import json
import os
import re
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PASTA = os.path.dirname(os.path.abspath(__file__))
PORTA = int(os.environ.get("PORT", "8000"))
DEMONSTRACAO = os.environ.get("DEMONSTRACAO", "1") == "1"   # 1 = não aparecer no Google

BLOQUEADOS = {"server.py", "render.yaml", ".gitignore", "README.md", "LEIA_PRIMEIRO.txt"}

# ------------------------------------------------------------------ TV Câmara (YouTube)
CANAL = os.environ.get("YOUTUBE_CANAL", "https://www.youtube.com/@camaramunicipalnevespaulista").strip()
FEED_TESTE = os.environ.get("YOUTUBE_FEED_URL", "").strip()
PASTA_DADOS = os.path.join(PASTA, "dados_servidor")
ARQ_YT = os.path.join(PASTA_DADOS, "youtube.json")
INTERVALO = 20 * 60
_yt = {"canal": {"id": "", "url": CANAL}, "atualizado": "", "videos": [], "erro": ""}
_yt_trava = threading.Lock()
NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015", "m": "http://search.yahoo.com/mrss/"}


def _baixar(url, limite=3_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (LegislaGov; Camara Neves Paulista)",
                                               "Accept-Language": "pt-BR,pt;q=0.9", "Cookie": "CONSENT=YES+1; SOCS=CAI"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read(limite).decode("utf-8", "replace")


def _id_do_canal():
    if re.fullmatch(r"UC[\w-]{22}", CANAL):
        return CANAL
    if _yt["canal"].get("id"):
        return _yt["canal"]["id"]
    html = _baixar(CANAL)
    for padrao in (r'<link rel="canonical" href="https://www\.youtube\.com/channel/(UC[\w-]{22})"',
                   r'"externalId":"(UC[\w-]{22})"', r'"channelId":"(UC[\w-]{22})"', r'itemprop="identifier" content="(UC[\w-]{22})"'):
        m = re.search(padrao, html)
        if m:
            return m.group(1)
    raise RuntimeError("não encontrei o ID do canal na página " + CANAL)


def _ler_feed(xml):
    raiz = ET.fromstring(xml)
    out = []
    for e in raiz.findall("a:entry", NS):
        vid = (e.findtext("yt:videoId", "", NS) or "").strip()
        if not vid:
            continue
        g = e.find("m:group", NS)
        desc = g.findtext("m:description", "", NS) if g is not None else ""
        th = g.find("m:thumbnail", NS) if g is not None else None
        est = g.find("m:community/m:statistics", NS) if g is not None else None
        out.append({"id": vid, "titulo": (e.findtext("a:title", "", NS) or "").strip(),
                    "publicado": e.findtext("a:published", "", NS), "atualizado": e.findtext("a:updated", "", NS),
                    "descricao": (desc or "").strip()[:5000],
                    "thumb": th.get("url") if th is not None else f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                    "views": int(est.get("views", "0")) if est is not None and est.get("views", "").isdigit() else None,
                    "url": f"https://www.youtube.com/watch?v={vid}"})
    return out


def atualizar_youtube():
    try:
        if FEED_TESTE:
            xml = _baixar(FEED_TESTE)
        else:
            cid = _id_do_canal()
            _yt["canal"]["id"] = cid
            xml = _baixar(f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}")
        novos = _ler_feed(xml)
        with _yt_trava:
            antigos = {v["id"]: v for v in _yt["videos"]}
            for v in novos:
                antigos[v["id"]] = {**antigos.get(v["id"], {}), **v}
            _yt["videos"] = sorted(antigos.values(), key=lambda v: v.get("publicado", ""), reverse=True)[:300]
            _yt["atualizado"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
            _yt["erro"] = ""
            os.makedirs(PASTA_DADOS, exist_ok=True)
            with open(ARQ_YT, "w", encoding="utf-8") as f:
                json.dump(_yt, f, ensure_ascii=False)
        print(f"YouTube: {len(novos)} vídeo(s) no feed", flush=True)
    except Exception as erro:  # sem internet, canal fora do ar etc.: mantém o que já tinha
        _yt["erro"] = str(erro)[:300]
        print("YouTube: falha ao atualizar —", erro, flush=True)


def _laco_youtube():
    while True:
        atualizar_youtube()
        time.sleep(INTERVALO)


def iniciar_youtube():
    try:
        with open(ARQ_YT, encoding="utf-8") as f:
            _yt.update(json.load(f))
    except Exception:
        pass
    threading.Thread(target=_laco_youtube, daemon=True).start()


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
                      ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8",
                      ".svg": "image/svg+xml", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8"}

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        if DEMONSTRACAO:
            self.send_header("X-Robots-Tag", "noindex, nofollow")
        caminho = self.path.split("?", 1)[0]
        # páginas, scripts e estilos: o navegador sempre confere se há versão nova (evita sistema "pela metade" após atualização)
        if caminho.endswith((".html", "/", ".js", ".css", ".json")) or "." not in caminho.rsplit("/", 1)[-1]:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        caminho = self.path.split("?", 1)[0].split("#", 1)[0]
        nome = caminho.rsplit("/", 1)[-1]
        partes = [p for p in caminho.split("/") if p]
        # não expõe arquivos internos nem as ferramentas locais (.bat / .py)
        if nome in BLOQUEADOS or nome.endswith((".bat", ".py")) or (partes and partes[0] in {"ferramentas", ".git", "portfolio", "dados_servidor"}):
            self.send_error(404)
            return
        if caminho == "/healthz":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok")
            return
        if caminho == "/api/youtube":
            with _yt_trava:
                corpo = json.dumps(_yt, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
            return
        if caminho == "/painel":
            self.send_response(301)
            self.send_header("Location", "/painel/")
            self.end_headers()
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


if __name__ == "__main__":
    iniciar_youtube()
    servidor = ThreadingHTTPServer(("0.0.0.0", PORTA), partial(Handler, directory=PASTA))
    print(f"Câmara de Neves Paulista no ar na porta {PORTA}", flush=True)
    servidor.serve_forever()
