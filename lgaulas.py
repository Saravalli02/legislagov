"""Videoaulas da GR Software (pedido do Ricardo, 27/11/2026).

Quem compra um sistema recebe um CÓDIGO DE ACESSO (ex.: GR-7K2M-Q9TX). Na página grsoftware.com.br/aulas/
a pessoa digita o código e assiste às aulas daquele sistema. A Aula 1 de cada sistema é aberta (vitrine).

- Os sócios geram e revogam códigos na Central (Videoaulas). O código aparece uma vez; no banco fica só o resumo.
- As aulas (título, descrição, endereço do vídeo) também são cadastradas na Central.
- Um código vale para um sistema. Sessão de quem assiste: 30 dias, só o resumo do token fica no banco.
- Proteção: 8 códigos errados em 15 minutos do mesmo endereço bloqueiam por 30 minutos.
"""
import hashlib
import secrets
import time

SISTEMAS = {"restaurante": "GR Restaurante", "acougue": "GR Açougue", "mercado": "GR Mercado", "legislagov": "LegislaGov Câmara"}
SESSAO_DIAS = 30
_ALF = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # sem 0/O/1/I para não confundir

# aula aberta inicial (vitrine). As demais entram pela Central.
SEMENTE = [
    ("restaurante", 1, "Aula 1 · Conhecendo o sistema", "Uma volta rápida por todas as telas do GR Restaurante.",
     "https://cdn.creativeclaw.co/u/73c2a5e0/videos/057362fd-c37f-4d12-bb33-c0847a183600.mp4", 1),
]

_pronto = {"ok": False}
_falhas = {}


def _db(c):
    if not _pronto["ok"]:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS au_codigos(id TEXT PRIMARY KEY, resumo TEXT NOT NULL UNIQUE, final TEXT NOT NULL, sistema TEXT NOT NULL,
            cliente TEXT, email TEXT, criado_por TEXT, criado REAL NOT NULL, revogado REAL, usos INTEGER NOT NULL DEFAULT 0, ultimo REAL);
        CREATE TABLE IF NOT EXISTS au_sess(token TEXT PRIMARY KEY, codigo_id TEXT NOT NULL, expira REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS au_aulas(id TEXT PRIMARY KEY, sistema TEXT NOT NULL, ordem INTEGER NOT NULL DEFAULT 0, titulo TEXT NOT NULL,
            descr TEXT, url TEXT NOT NULL, aberta INTEGER NOT NULL DEFAULT 0, criado REAL);
        """)
        if not c.execute("SELECT 1 FROM au_aulas LIMIT 1").fetchone():
            for sis, ordem, tit, ds, url, ab in SEMENTE:
                c.execute("INSERT INTO au_aulas(id, sistema, ordem, titulo, descr, url, aberta, criado) VALUES(?,?,?,?,?,?,?,?)",
                          ("au-" + secrets.token_hex(6), sis, ordem, tit, ds, url, ab, time.time()))
        # aula 1 do restaurante ganhou música de fundo (27/11): troca o endereço antigo
        for antigo in ("https://cdn.creativeclaw.co/u/73c2a5e0/videos/98567e1e-3b2c-4bea-b414-828ecef2b043.mp4", "https://cdn.creativeclaw.co/u/73c2a5e0/videos/ff19ae48-3763-462c-901a-e1fb8d75748e.mp4"):
            c.execute("UPDATE au_aulas SET url=? WHERE url=?", ("https://cdn.creativeclaw.co/u/73c2a5e0/videos/057362fd-c37f-4d12-bb33-c0847a183600.mp4", antigo))
        _pronto["ok"] = True
    return c


def _resumo(t):
    return hashlib.sha256(("aulas:" + str(t).strip().upper().replace(" ", "")).encode()).hexdigest()


def _norm(cod):
    x = "".join(ch for ch in str(cod or "").upper() if ch.isalnum())
    if x.startswith("GR"):
        x = x[2:]
    return "GR-" + x[:4] + "-" + x[4:8] if len(x) == 8 else ""


def _aulas(c, sistema, so_abertas=False):
    q = "SELECT id, ordem, titulo, descr, url, aberta FROM au_aulas WHERE sistema=?" + (" AND aberta=1" if so_abertas else "") + " ORDER BY ordem, criado"
    return [dict(r) for r in c.execute(q, (sistema,))]


# ---------- público (página /aulas/) ----------
def vitrine(c):
    _db(c)
    out = {}
    for sis, nome in SISTEMAS.items():
        tot = c.execute("SELECT COUNT(*) FROM au_aulas WHERE sistema=?", (sis,)).fetchone()[0]
        # tudo travado: a vitrine mostra só os títulos (sem o endereço do vídeo); assistir exige o código
        out[sis] = {"nome": nome, "total": tot, "titulos": [a["titulo"] for a in _aulas(c, sis)]}
    return 200, {"ok": True, "sistemas": out}


def entrar(c, codigo, ip):
    _db(c)
    agora = time.time()
    f = [t for t in _falhas.get(ip, []) if agora - t < 900]
    if len(f) >= 8:
        return 429, {"ok": False, "erro": "Muitas tentativas. Espere 30 minutos e tente de novo."}
    cod = _norm(codigo)
    r = c.execute("SELECT * FROM au_codigos WHERE resumo=?", (_resumo(cod),)).fetchone() if cod else None
    if not r or r["revogado"]:
        f.append(agora)
        _falhas[ip] = f
        return 401, {"ok": False, "erro": "Código não encontrado. Confira as letras e os números."}
    t = secrets.token_urlsafe(32)
    c.execute("INSERT INTO au_sess(token, codigo_id, expira) VALUES(?,?,?)", (_resumo("s:" + t), r["id"], agora + SESSAO_DIAS * 86400))
    c.execute("UPDATE au_codigos SET usos=usos+1, ultimo=? WHERE id=?", (agora, r["id"]))
    c.execute("DELETE FROM au_sess WHERE expira<?", (agora,))
    return 200, {"ok": True, "token": t, "sistema": r["sistema"], "nome": SISTEMAS.get(r["sistema"], r["sistema"])}


def lista(c, token):
    _db(c)
    r = c.execute("SELECT s.expira, k.sistema, k.revogado, k.cliente FROM au_sess s JOIN au_codigos k ON k.id=s.codigo_id WHERE s.token=?",
                  (_resumo("s:" + str(token or "")),)).fetchone()
    if not r or r["expira"] < time.time() or r["revogado"]:
        return 401, {"ok": False, "erro": "Acesso expirado. Digite o código de novo."}
    return 200, {"ok": True, "sistema": r["sistema"], "nome": SISTEMAS.get(r["sistema"]), "cliente": r["cliente"] or "",
                 "aulas": _aulas(c, r["sistema"])}


# ---------- Central (sócios) ----------
def admin(c):
    _db(c)
    cods = [dict(r) for r in c.execute("SELECT id, final, sistema, cliente, email, criado_por, criado, revogado, usos, ultimo FROM au_codigos ORDER BY criado DESC LIMIT 300")]
    aulas = [dict(r, sistema=r["sistema"]) for r in c.execute("SELECT * FROM au_aulas ORDER BY sistema, ordem, criado")]
    return 200, {"ok": True, "sistemas": SISTEMAS, "codigos": cods, "aulas": aulas}


def novo_codigo(c, por, d):
    _db(c)
    sis = str(d.get("sistema") or "")
    if sis not in SISTEMAS:
        return 400, {"ok": False, "erro": "Escolha o sistema."}
    while True:
        x = "".join(secrets.choice(_ALF) for _ in range(8))
        cod = "GR-" + x[:4] + "-" + x[4:]
        if not c.execute("SELECT 1 FROM au_codigos WHERE resumo=?", (_resumo(cod),)).fetchone():
            break
    c.execute("INSERT INTO au_codigos(id, resumo, final, sistema, cliente, email, criado_por, criado) VALUES(?,?,?,?,?,?,?,?)",
              ("cd-" + secrets.token_hex(6), _resumo(cod), cod[-4:], sis, str(d.get("cliente") or "").strip()[:120],
               str(d.get("email") or "").strip()[:160], por, time.time()))
    return 200, {"ok": True, "codigo": cod, "sistema": sis, "nome": SISTEMAS[sis]}


def revogar(c, cid):
    _db(c)
    c.execute("UPDATE au_codigos SET revogado=? WHERE id=? AND revogado IS NULL", (time.time(), str(cid or "")))
    c.execute("DELETE FROM au_sess WHERE codigo_id=?", (str(cid or ""),))
    return 200, {"ok": True}


def salvar_aula(c, d):
    _db(c)
    sis, tit, url = str(d.get("sistema") or ""), str(d.get("titulo") or "").strip()[:140], str(d.get("url") or "").strip()[:600]
    if sis not in SISTEMAS or not tit or not url.startswith("https://"):
        return 400, {"ok": False, "erro": "Preencha o sistema, o título e o endereço do vídeo (começando com https://)."}
    campos = (sis, int(d.get("ordem") or 0), tit, str(d.get("descr") or "").strip()[:400], url, 1 if d.get("aberta") else 0)
    if d.get("id"):
        c.execute("UPDATE au_aulas SET sistema=?, ordem=?, titulo=?, descr=?, url=?, aberta=? WHERE id=?", campos + (str(d["id"]),))
    else:
        c.execute("INSERT INTO au_aulas(sistema, ordem, titulo, descr, url, aberta, id, criado) VALUES(?,?,?,?,?,?,?,?)",
                  campos + ("au-" + secrets.token_hex(6), time.time()))
    return 200, {"ok": True}


def excluir_aula(c, aid):
    _db(c)
    c.execute("DELETE FROM au_aulas WHERE id=?", (str(aid or ""),))
    return 200, {"ok": True}
