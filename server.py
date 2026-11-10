"""
Servidor da Câmara Municipal de Neves Paulista (site + painel LegislaGov).

Hoje: entrega os arquivos do site e do painel (os dados ficam no navegador).
Próxima fase: este mesmo servidor recebe a API e o banco de dados
(usuários, matérias, assinaturas, financeiro) para todos compartilharem.

Render: Start Command  ->  python server.py
Local:  python server.py   (abre em http://localhost:8000)
Só usa a biblioteca padrão do Python (não precisa instalar nada).
"""
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PASTA = os.path.dirname(os.path.abspath(__file__))
PORTA = int(os.environ.get("PORT", "8000"))
DEMONSTRACAO = os.environ.get("DEMONSTRACAO", "1") == "1"   # 1 = não aparecer no Google

BLOQUEADOS = {"server.py", "render.yaml", ".gitignore", "README.md", "LEIA_PRIMEIRO.txt"}


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
        if self.path.endswith((".html", "/")) or "." not in self.path.rsplit("/", 1)[-1]:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        caminho = self.path.split("?", 1)[0].split("#", 1)[0]
        nome = caminho.rsplit("/", 1)[-1]
        partes = [p for p in caminho.split("/") if p]
        # não expõe arquivos internos nem as ferramentas locais (.bat / .py)
        if nome in BLOQUEADOS or nome.endswith((".bat", ".py")) or (partes and partes[0] in {"ferramentas", ".git", "portfolio"}):
            self.send_error(404)
            return
        if caminho == "/healthz":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"ok")
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
    servidor = ThreadingHTTPServer(("0.0.0.0", PORTA), partial(Handler, directory=PASTA))
    print(f"Câmara de Neves Paulista no ar na porta {PORTA}", flush=True)
    servidor.serve_forever()
