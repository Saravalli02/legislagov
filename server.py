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

Resumo do que foi falado (opcional, desligado até ter a chave):
  ANTHROPIC_API_KEY  chave da API (colocar só nas variáveis do Render, nunca no código)
  IA_MODELO          modelo usado (padrão: claude-haiku-5-5)
  ANTHROPIC_BASE_URL endereço da API (padrão oficial; troca só para testes)
O servidor tenta ler as legendas automáticas do vídeo; se o YouTube bloquear, a Câmara envia
o arquivo de legenda (baixado no YouTube Studio) pelo painel. O resumo fica como rascunho até
alguém da Câmara aprovar no painel.
"""
import json
import shutil
import os
import re
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie

import lgapi

PASTA = os.path.dirname(os.path.abspath(__file__))
PORTA = int(os.environ.get("PORT", "8000"))
DEMONSTRACAO = os.environ.get("DEMONSTRACAO", "1") == "1"   # 1 = não aparecer no Google

BLOQUEADOS = {"server.py", "render.yaml", ".gitignore", "README.md", "LEIA_PRIMEIRO.txt"}

# ------------------------------------------------------------------ TV Câmara (YouTube)
CANAL = os.environ.get("YOUTUBE_CANAL", "https://www.youtube.com/@camaramunicipalnevespaulista").strip()
FEED_TESTE = os.environ.get("YOUTUBE_FEED_URL", "").strip()
PASTA_DADOS = os.environ.get("LG_DADOS") or os.path.join(PASTA, "dados_servidor")   # na Amazon: /var/lib/legislagov
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


_brasao_cache = {"bytes": b"", "quando": 0.0}
URL_BRASAO = "https://www.camaranevespaulista.sp.gov.br/Arquivos/Uploads/Bras%C3%A3o_Neves_Paulista,_SP.jpg"


def _brasao():
    """Brasão em JPG: cópia local (assets/img/brasao.jpg) ou baixado do site antigo e guardado em memória."""
    local = os.path.join(PASTA, "assets", "img", "brasao.jpg")
    if os.path.isfile(local):
        with open(local, "rb") as f:
            return f.read()
    if _brasao_cache["bytes"] or time.time() - _brasao_cache["quando"] < 600:
        return _brasao_cache["bytes"]
    _brasao_cache["quando"] = time.time()
    try:
        req = urllib.request.Request(URL_BRASAO, headers={"User-Agent": "Mozilla/5.0 (LegislaGov; Camara Neves Paulista)"})
        with urllib.request.urlopen(req, timeout=15) as r:
            dados = r.read(2_000_000)
        if dados[:2] == b"\xff\xd8":
            _brasao_cache["bytes"] = dados
    except Exception as erro:
        print("brasão: não consegui baixar:", erro, flush=True)
    return _brasao_cache["bytes"]


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


# ------------------------------------------------------------------ resumo da fala (IA)
IA_CHAVE = os.environ.get("ANTHROPIC_API_KEY", "").strip()
IA_MODELO = os.environ.get("IA_MODELO", "claude-haiku-5-5").strip()
IA_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://api.anthropic.com").rstrip("/")
_ia_pedidos = {}  # id -> [horários] (limite de envios manuais por dia)

PROMPT_RESUMO = """Você vai resumir a gravação de uma sessão da Câmara Municipal de Neves Paulista (SP).
O texto abaixo vem de legendas automáticas: pode ter erros de palavras e de nomes e não indica quem fala.
Título do vídeo: {titulo}

Escreva em português do Brasil, em linguagem simples, para o cidadão:
1. "Resumo": 2 a 3 parágrafos curtos sobre o que aconteceu na sessão.
2. "Principais assuntos": de 3 a 8 tópicos curtos.
3. "Votações mencionadas": só as que aparecem claramente no texto, com o resultado; se não houver, escreva "Nenhuma identificada com segurança".
Regras: não invente nomes, números ou resultados; quando não tiver certeza de quem falou, diga "um vereador" ou "a Presidência"; não dê opinião.
Use exatamente os títulos acima, cada um em uma linha começando com "## ".

Transcrição:
{texto}"""


def _texto_de_legenda(bruto):
    """Aceita SRT, VTT, SBV, JSON3 do YouTube ou texto simples e devolve só as falas."""
    bruto = bruto or ""
    if bruto.lstrip().startswith("{"):
        try:
            j = json.loads(bruto)
            return " ".join("".join(seg.get("utf8", "") for seg in ev.get("segs", []) or []) for ev in j.get("events", [])).replace("\n", " ")
        except Exception:
            pass
    linhas = []
    for l in bruto.splitlines():
        l = l.strip()
        if not l or l.isdigit() or l.upper().startswith(("WEBVTT", "KIND:", "LANGUAGE:", "NOTE")) or re.match(r"^[\d:.,]+\s*(-->|,)\s*[\d:.,]+", l):
            continue
        l = re.sub(r"<[^>]+>", "", l)
        if not linhas or linhas[-1] != l:
            linhas.append(l)
    return re.sub(r"\s+", " ", " ".join(linhas)).strip()


def _legenda_automatica(vid):
    html = _baixar(f"https://www.youtube.com/watch?v={vid}&hl=pt-BR")
    m = re.search(r'"captionTracks":(\[.*?\])', html)
    if not m:
        return ""
    trilhas = json.loads(m.group(1))
    trilhas.sort(key=lambda t: (not str(t.get("languageCode", "")).startswith("pt"), t.get("kind") != "asr"))
    url = trilhas[0].get("baseUrl", "") if trilhas else ""
    if not url:
        return ""
    return _texto_de_legenda(_baixar(url + "&fmt=json3", limite=8_000_000))


def _resumir(titulo, texto):
    texto = texto[:180_000]
    corpo = json.dumps({"model": IA_MODELO, "max_tokens": 1800,
                        "messages": [{"role": "user", "content": PROMPT_RESUMO.format(titulo=titulo, texto=texto)}]}).encode("utf-8")
    req = urllib.request.Request(IA_URL + "/v1/messages", data=corpo, method="POST", headers={
        "x-api-key": IA_CHAVE, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        j = json.loads(r.read().decode("utf-8"))
    return "".join(b.get("text", "") for b in j.get("content", []) if b.get("type") == "text").strip()


def _salvar_yt():
    os.makedirs(PASTA_DADOS, exist_ok=True)
    with open(ARQ_YT, "w", encoding="utf-8") as f:
        json.dump(_yt, f, ensure_ascii=False)


def _gravar_fala(vid, **dados):
    with _yt_trava:
        for v in _yt["videos"]:
            if v["id"] == vid:
                v["fala"] = {**(v.get("fala") or {}), **dados, "quando": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
        _salvar_yt()


def resumir_video(vid, texto=None, fonte="legenda automática do YouTube"):
    v = next((x for x in _yt["videos"] if x["id"] == vid), None)
    if not v:
        return
    if not IA_CHAVE:
        _gravar_fala(vid, status="sem_ia")
        return
    try:
        if texto is None:
            texto = _legenda_automatica(vid)
        if len(texto or "") < 200:
            _gravar_fala(vid, status="sem_legenda", erro="O YouTube não liberou a legenda automática deste vídeo.")
            return
        _gravar_fala(vid, status="processando", fonte=fonte)
        _gravar_fala(vid, status="pronto", resumo=_resumir(v.get("titulo", ""), texto), fonte=fonte, modelo=IA_MODELO, caracteres=len(texto), erro="")
        print(f"IA: resumo pronto para {vid}", flush=True)
    except Exception as erro:
        _gravar_fala(vid, status="erro", erro=str(erro)[:300])
        print("IA: falha ao resumir", vid, "—", erro, flush=True)


def resumir_novos():
    # só os 5 vídeos mais recentes; cada um é tentado de novo no máximo a cada 6 horas
    agora = time.time()
    for v in list(_yt["videos"])[:5]:
        f = v.get("fala") or {}
        if f.get("status") == "pronto":
            continue
        if f.get("tentativa") and agora - f["tentativa"] < 6 * 3600 and f.get("status") != "sem_ia":
            continue
        if f.get("status") == "sem_ia" and not IA_CHAVE:
            continue
        _gravar_fala(v["id"], tentativa=agora)
        resumir_video(v["id"])


def _laco_youtube():
    while True:
        atualizar_youtube()
        try:
            resumir_novos()
        except Exception as erro:
            print("IA:", erro, flush=True)
        time.sleep(INTERVALO)


def iniciar_youtube():
    try:
        with open(ARQ_YT, encoding="utf-8") as f:
            _yt.update(json.load(f))
    except Exception:
        pass
    threading.Thread(target=_laco_youtube, daemon=True).start()


# ------------------------------------------------------------------ câmaras (um servidor, várias câmaras)
ARQ_DOMINIOS = os.path.join(PASTA, "ferramentas", "aws", "dominios.txt")
CONTEUDO = os.environ.get("LG_CONTEUDO", "")   # na Amazon: /var/lib/legislagov/conteudo
_dominios = {"lido": 0.0, "mapa": {}}


def camara_do_host(host):
    """dominios.txt: 'dominio  camara  modo' (modo = site ou sistema). Endereço desconhecido -> LG_CAMARA_PADRAO."""
    if time.time() - _dominios["lido"] > 60:
        mapa = {}
        try:
            with open(ARQ_DOMINIOS, encoding="utf-8") as f:
                for linha in f:
                    p = linha.split("#", 1)[0].split()
                    if len(p) >= 2:
                        mapa[p[0].lower()] = (p[1], p[2] if len(p) > 2 else "site")
        except OSError:
            pass
        _dominios.update(lido=time.time(), mapa=mapa)
    h = (host or "").split(":")[0].lower()
    return _dominios["mapa"].get(h) or (os.environ.get("LG_CAMARA_PADRAO", "teste"), "site")


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webmanifest": "application/manifest+json", ".webp": "image/webp"}
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

    # ---------------------------------------------------------------- banco de dados (LG_BANCO=1)
    def _json(self, cod, dados, cookie=None):
        if getattr(self, "_fila", None) is not None:   # dentro da trava do banco: envia depois
            self._fila.append((self._json, (cod, dados), {"cookie": cookie}))
            return True
        corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
        self.send_response(cod)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        if cookie is not None:
            seguro = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
            if cookie:
                self.send_header("Set-Cookie", f"lg_sessao={cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age={lgapi.SESSAO_DIAS * 86400}{seguro}")
            else:
                self.send_header("Set-Cookie", f"lg_sessao=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0{seguro}")
        self.end_headers()
        self.wfile.write(corpo)
        return True

    def _arquivo(self, tipo, caminho, publico=False):
        if getattr(self, "_fila", None) is not None:
            self._fila.append((self._arquivo, (tipo, caminho), {"publico": publico}))
            return True
        tam = os.path.getsize(caminho)
        self.send_response(200)
        seguro = re.fullmatch(r"application/pdf|image/(png|jpe?g|gif|webp)|audio/[\w.+-]+|video/[\w.+-]+|text/plain", tipo or "")
        self.send_header("Content-Type", tipo if seguro else "application/octet-stream")
        if tipo != "application/pdf":   # o leitor de PDF do navegador não abre em página isolada
            self.send_header("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'")
        self.send_header("Content-Length", str(tam))
        self.send_header("Cache-Control", ("public" if publico else "private") + ", max-age=31536000, immutable")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Disposition", "inline" if seguro else "attachment")
        self.end_headers()
        with open(caminho, "rb") as fh:
            shutil.copyfileobj(fh, self.wfile)
        return True

    def _corpo(self, limite=8_000_000):
        if getattr(self, "_bruto", None) is not None:
            if not self._bruto:
                return {}
            if len(self._bruto) > limite:
                raise ValueError("Conteúdo grande demais.")
            return json.loads(self._bruto.decode("utf-8"))
        tam = int(self.headers.get("Content-Length", "0") or 0)
        if tam <= 0:
            return {}
        if tam > limite:
            raise ValueError("Conteúdo grande demais.")
        return json.loads(self.rfile.read(tam).decode("utf-8"))

    def _ip(self):
        return (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()

    def _api(self, metodo):
        """Rotas do banco. Devolve True se respondeu."""
        caminho = self.path.split("?", 1)[0]
        if not caminho.startswith("/api/") or caminho.startswith(("/api/youtube", "/api/brasao")):
            return False
        if not lgapi.ativo():
            return False
        camara, modo = camara_do_host(self.headers.get("Host"))
        # O banco (uma conexão SQLite) atende um pedido por vez: o corpo é lido antes e a resposta é
        # enviada depois, fora da trava, para um celular lento não segurar os outros usuários.
        self._bruto = None
        if metodo in ("POST", "PUT"):
            tam = int(self.headers.get("Content-Length", "0") or 0)
            if tam > 21_000_000:
                return self._json(413, {"ok": False, "erro": "Conteúdo grande demais."})
            self._bruto = self.rfile.read(tam) if tam > 0 else b""
        self._fila = []
        try:
            with lgapi._trava:
                r = self._api_rotas(metodo, caminho, camara, modo)
        finally:
            fila, self._fila = self._fila, None
        for fn, args, kw in fila:
            fn(*args, **kw)
        return r

    def _api_rotas(self, metodo, caminho, camara, modo):
        try:
            lgapi.semear(camara)
            ck = SimpleCookie(self.headers.get("Cookie", ""))
            token = ck["lg_sessao"].value if "lg_sessao" in ck else ""
            u = lgapi.sessao(token, camara)
            # gravações exigem o cabeçalho X-LG (bloqueia envio disfarçado vindo de outro site)
            if metodo != "GET" and self.headers.get("X-LG") != "1":
                return self._json(403, {"ok": False, "erro": "Requisição recusada."})
            ip = self._ip()
            if caminho == "/api/inicio" and metodo == "GET":
                if "publico=1" in self.path:
                    u = None
                dados, seq = lgapi.carregar(camara, u)
                eu = {k: v for k, v in u.items() if k != "senha"} if u else None
                return self._json(200, {"ok": True, "camara": camara, "modo": modo, "eu": eu, "dados": dados, "seq": seq,
                                        "ocupados": lgapi.cargos_ocupados(camara)})
            if caminho == "/api/cargos" and metodo == "GET":
                return self._json(200, {"ok": True, "ocupados": lgapi.cargos_ocupados(camara)})
            if caminho == "/api/login" and metodo == "POST":
                d = self._corpo(20_000)
                usr, erro = lgapi.login(camara, d.get("usuario", ""), d.get("senha", ""), ip)
                if not usr:
                    return self._json(401, {"ok": False, "erro": erro})
                return self._json(200, {"ok": True, "id": usr["id"], "provisoria": str(d.get("senha", "")) in ("123456", "admin123")},
                                  cookie=lgapi.criar_sessao(usr))
            if caminho == "/api/logout" and metodo == "POST":
                lgapi.encerrar(token)
                return self._json(200, {"ok": True}, cookie="")
            if caminho == "/api/cadastro" and metodo == "POST":
                erro = lgapi.cadastro(camara, self._corpo(20_000), ip)
                return self._json(400 if erro else 200, {"ok": not erro, "erro": erro})
            if caminho.startswith("/api/arquivo/") and metodo == "GET":
                achado = lgapi.ler_arquivo(camara, caminho[len("/api/arquivo/"):], u)
                if not achado:
                    return self._json(404 if u else 401, {"ok": False, "erro": "Arquivo não encontrado ou sem permissão."})
                return self._arquivo(*achado, publico=not u)
            if caminho == "/api/publico/enviar" and metodo == "POST":
                d = self._corpo(300_000)
                erro = lgapi.envio_publico(camara, str(d.get("chave", "")), d.get("itens"), ip)
                return self._json(400 if erro else 200, {"ok": not erro, "erro": erro})
            if not u:
                return self._json(401, {"ok": False, "erro": "Sua sessão terminou. Entre de novo."})
            if caminho == "/api/senha" and metodo == "POST":
                d = self._corpo(20_000)
                erro = lgapi.trocar_senha(u, d.get("atual", ""), d.get("nova", ""))
                return self._json(400 if erro else 200, {"ok": not erro, "erro": erro}, cookie=None if erro else "")
            if caminho == "/api/arquivo" and metodo == "POST":
                if not lgapi.Quem(camara, u).edita_algo:
                    return self._json(403, {"ok": False, "erro": "Sem permissão para enviar arquivos."})
                d = self._corpo(21_000_000)
                import base64
                try:
                    bruto = base64.b64decode(str(d.get("b64", "")), validate=False)
                except Exception:
                    return self._json(400, {"ok": False, "erro": "Arquivo inválido."})
                if not bruto:
                    return self._json(400, {"ok": False, "erro": "Arquivo vazio."})
                with lgapi._trava:
                    url = lgapi.salvar_arquivo(camara, str(d.get("tipo", ""))[:80], bruto, lgapi._eh_publico(str(d.get("chave", ""))), u["usuario"],
                                               d.get("acesso") if isinstance(d.get("acesso"), dict) else None)
                return self._json(200, {"ok": True, "url": url})
            if caminho == "/api/mudancas" and metodo == "GET":
                desde = int((re.search(r"desde=(\d+)", self.path) or [0, "0"])[1])
                dados, seq = lgapi.mudancas(camara, desde, u)
                return self._json(200, {"ok": True, "dados": dados, "seq": seq})
            if caminho.startswith("/api/dados/"):
                chave = urllib.parse.unquote(caminho[len("/api/dados/"):])
                if not re.fullmatch(r"[\w.\-]{1,120}", chave) or not lgapi.pode_gravar(chave, u):
                    return self._json(403, {"ok": False, "erro": "Sem permissão para esta informação."})
                if metodo == "DELETE":
                    ok, motivo = lgapi.pode_gravar_valor(camara, chave, u, None)
                    if not ok:
                        lgapi.registrar(camara, u["usuario"], "Gravação recusada", f"{chave}: {motivo}", self._ip())
                        return self._json(403, {"ok": False, "erro": "Sem permissão: " + motivo})
                    lgapi.remover(camara, chave, u["usuario"])
                    return self._json(200, {"ok": True})
                if metodo == "PUT":
                    d = self._corpo(21_000_000)
                    valor = d.get("valor")
                    if not isinstance(valor, str):
                        return self._json(400, {"ok": False, "erro": "Valor inválido."})
                    if chave == lgapi.CHAVE_USUARIOS:
                        with lgapi._trava:
                            lgapi.gravar_usuarios(camara, json.loads(valor), u)
                        return self._json(200, {"ok": True, "versao": 0, "valor": json.dumps(lgapi.usuarios(camara), ensure_ascii=False)})
                    if chave == lgapi.AUDITORIA:   # registro de ações: só acrescenta; quem não é administrador não recebe o conteúdo
                        pode, motivo = lgapi.pode_gravar_valor(camara, chave, u, valor)
                        if not pode:
                            return self._json(403, {"ok": False, "erro": "Sem permissão: " + motivo})
                        junto, mudou = lgapi.mesclar_auditoria(camara, valor, u)
                        versao = None
                        if mudou:
                            _ok, _a, versao = lgapi.gravar(camara, chave, junto, None, u["usuario"])
                        resp = {"ok": True}
                        if lgapi.Quem(camara, u).adm:
                            resp.update({"versao": versao, "valor": junto})
                        return self._json(200, resp)
                    with lgapi._trava:
                        # versão antiga: primeiro junta (409); só depois confere a permissão sobre o que mudou
                        r0 = lgapi._db().execute("SELECT valor, versao FROM dados WHERE camara=? AND chave=?", (camara, chave)).fetchone()
                        if r0 and d.get("versao") is not None and int(d.get("versao")) != r0["versao"]:
                            return self._json(409, {"ok": False, "valor": r0["valor"], "versao": r0["versao"]})
                        pode, motivo = lgapi.pode_gravar_valor(camara, chave, u, valor)
                        if not pode:
                            lgapi.registrar(camara, u["usuario"], "Gravação recusada", f"{chave}: {motivo}", self._ip())
                            return self._json(403, {"ok": False, "erro": "Sem permissão: " + motivo, "valor": r0["valor"] if r0 else None, "versao": r0["versao"] if r0 else None})
                        ok, atual, versao = lgapi.gravar(camara, chave, valor, d.get("versao"), u["usuario"])
                    if not ok:
                        return self._json(409, {"ok": False, "valor": atual, "versao": versao})
                    resp = {"ok": True, "versao": versao}
                    if atual != valor:
                        resp["valor"] = atual   # arquivos embutidos viraram endereços
                    return self._json(200, resp)
            return self._json(404, {"ok": False, "erro": "Rota não encontrada."})
        except Exception as erro:
            print("api:", caminho, repr(erro), flush=True)
            return self._json(400, {"ok": False, "erro": "Não foi possível concluir: " + str(erro)[:160]})

    def do_PUT(self):
        if not self._api("PUT"):
            self.send_error(404)

    def do_DELETE(self):
        if not self._api("DELETE"):
            self.send_error(404)

    def do_GET(self):
        if self._api("GET"):
            return
        caminho = self.path.split("?", 1)[0].split("#", 1)[0]
        if lgapi.ativo() and caminho in ("/", "/index.html") and camara_do_host(self.headers.get("Host"))[1] == "sistema":
            self.send_response(302)
            self.send_header("Location", "/painel/")
            self.end_headers()
            return
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
        if caminho == "/healthz/copia":   # situação da cópia fora do servidor (sem dados da Câmara)
            try:
                with open(os.path.join(PASTA_DADOS, "copias", "externa.json"), "rb") as fh:
                    corpo = fh.read()
            except OSError:
                corpo = '{"ok": false, "erro": {"mensagem": "ainda sem cópia externa"}}'.encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(corpo)
            return
        if caminho == "/api/youtube":
            with _yt_trava:
                corpo = json.dumps({**_yt, "ia": bool(IA_CHAVE)}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
            return
        if caminho == "/api/brasao.jpg":
            # o brasão oficial vem do site antigo; servido daqui (mesma origem) para o site recortar o fundo branco
            corpo = _brasao()
            if not corpo:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(corpo)))
            self.send_header("Cache-Control", "public, max-age=604800")
            self.end_headers()
            self.wfile.write(corpo)
            return
        # conteúdo importado do site antigo e do SISCAM (gerado no servidor) tem preferência
        if CONTEUDO and caminho.startswith("/assets/") and ".." not in caminho:
            alt = os.path.join(CONTEUDO, caminho.lstrip("/"))
            if os.path.isfile(alt):
                self.directory = CONTEUDO
        if caminho == "/painel":
            self.send_response(301)
            self.send_header("Location", "/painel/")
            self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        if self._api("POST"):
            return
        caminho = self.path.split("?", 1)[0]
        if caminho != "/api/youtube/transcricao":
            self.send_error(404)
            return
        def responder(cod, dados):
            corpo = json.dumps(dados, ensure_ascii=False).encode("utf-8")
            self.send_response(cod)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(corpo)))
            self.end_headers()
            self.wfile.write(corpo)
        try:
            tam = int(self.headers.get("Content-Length", "0"))
            if tam <= 0 or tam > 2_500_000:
                return responder(413, {"ok": False, "erro": "Arquivo vazio ou grande demais (máximo 2,5 MB)."})
            dados = json.loads(self.rfile.read(tam).decode("utf-8"))
            vid = str(dados.get("id", ""))
            if not any(v["id"] == vid for v in _yt["videos"]):
                return responder(404, {"ok": False, "erro": "Vídeo não encontrado no canal."})
            if not IA_CHAVE:
                return responder(503, {"ok": False, "erro": "A inteligência artificial ainda não foi ativada no servidor."})
            agora = time.time()
            hist = [t for t in _ia_pedidos.get(vid, []) if agora - t < 86400]
            if len(hist) >= 3:
                return responder(429, {"ok": False, "erro": "Limite de 3 envios por vídeo por dia."})
            texto = _texto_de_legenda(str(dados.get("texto", "")))
            if len(texto) < 200:
                return responder(400, {"ok": False, "erro": "Não encontrei falas no arquivo enviado."})
            _ia_pedidos[vid] = hist + [agora]
            _gravar_fala(vid, status="processando", fonte="legenda enviada pela Câmara", tentativa=agora)
            threading.Thread(target=resumir_video, args=(vid, texto, "legenda enviada pela Câmara"), daemon=True).start()
            return responder(202, {"ok": True})
        except Exception as erro:
            return responder(400, {"ok": False, "erro": str(erro)[:200]})

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args), flush=True)


if __name__ == "__main__":
    iniciar_youtube()
    ThreadingHTTPServer.request_queue_size = 128   # muitos abrindo ao mesmo tempo (o padrão é 5)
    ThreadingHTTPServer.daemon_threads = True
    servidor = ThreadingHTTPServer(("0.0.0.0", PORTA), partial(Handler, directory=PASTA))
    print(f"Câmara de Neves Paulista no ar na porta {PORTA}", flush=True)
    servidor.serve_forever()
