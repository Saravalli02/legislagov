"""LegislaGov — Administração geral (Central): monitoramento dos sistemas, gastos e vencimentos, avisos.

Monitoramento: a cada 10 minutos o servidor confere disco, memória, banco, backups, certificados e se cada
sistema responde. Quando algo sai do normal abre um aviso; quando volta ao normal, o aviso é fechado sozinho.
Gastos: lista do que a LegislaGov paga (mensal, anual, uso), próximos vencimentos e pagamentos feitos.
Mensagens da equipe técnica: ferramentas/central/mensagens.json (publicado pelo Claude), mostradas na Central.
"""
import json, os, shutil, socket, ssl, threading, time, urllib.request, uuid, datetime as dt

import lgapi

PASTA = os.path.dirname(os.path.abspath(__file__))
COPIAS = os.environ.get("LG_COPIAS", "/var/lib/legislagov/copias")
INTERVALO = 600
DOMINIOS = ["neves.legislagov.com.br", "teste.legislagov.com.br", "rural.legislagov.com.br", "email.legislagov.com.br", "central.legislagov.com.br"]
SITES = [("Câmara de Neves Paulista", "https://neves.legislagov.com.br/"), ("Ambiente de teste", "https://teste.legislagov.com.br/"),
         ("GR Rural", "https://rural.legislagov.com.br/"), ("Painel de e-mails", "https://email.legislagov.com.br/"),
         ("GR Restaurante / Açougue", "https://d1xi1g7etepsye.cloudfront.net/api/ping"), ("Site da empresa", "https://legislagov.com.br/")]

_pronto = {"ok": False}


def _db():
    c = lgapi._db()
    if not _pronto["ok"]:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS ct_monitor(item TEXT PRIMARY KEY, nome TEXT, grupo TEXT, estado TEXT, valor TEXT, detalhe TEXT, quando REAL);
        CREATE TABLE IF NOT EXISTS ct_alertas(id TEXT PRIMARY KEY, item TEXT, nivel TEXT, titulo TEXT, texto TEXT, aberto REAL, fechado REAL, visto REAL);
        CREATE TABLE IF NOT EXISTS ct_gastos(id TEXT PRIMARY KEY, dados TEXT NOT NULL, criado REAL);
        CREATE TABLE IF NOT EXISTS ct_pagamentos(id TEXT PRIMARY KEY, gasto TEXT, dados TEXT NOT NULL, criado REAL);
        CREATE TABLE IF NOT EXISTS ct_config(chave TEXT PRIMARY KEY, valor TEXT);
        """)
        if not c.execute("SELECT 1 FROM ct_config WHERE chave='gastos_iniciais'").fetchone():
            for g in GASTOS_INICIAIS:
                c.execute("INSERT OR IGNORE INTO ct_gastos(id, dados, criado) VALUES(?,?,?)", (g["id"], json.dumps(g, ensure_ascii=False), time.time()))
            c.execute("INSERT OR REPLACE INTO ct_config VALUES('gastos_iniciais', '1')")
            c.execute("INSERT OR IGNORE INTO ct_config VALUES('dolar', '5.55')")
        _pronto["ok"] = True
    return c


# ------------------------------------------------------------------ gastos
# valores conferidos em 18/11/2026 (Console da Amazon e preços de tabela); vencimentos aproximados
GASTOS_INICIAIS = [
    {"id": "g-fatura-aws", "nome": "Fatura da Amazon (AWS) no cartão", "categoria": "Fatura", "fornecedor": "Amazon (AWS)", "valor": 0.0, "moeda": "USD",
     "period": "mensal", "venc": "2026-12-03", "pagamento": "Cartão de crédito",
     "obs": "Uma cobrança por mês com tudo da Amazon (itens abaixo). Hoje sai US$ 0 porque os créditos pagam. Quando os créditos acabarem, atualize o valor aqui.", "resumo": True},
    {"id": "g-lightsail", "nome": "Servidor na Amazon (Lightsail, 2 GB)", "categoria": "Hospedagem", "fornecedor": "Amazon (AWS)", "valor": 12.0, "moeda": "USD",
     "period": "mensal", "venc": "", "pagamento": "na fatura da AWS", "obs": "Servidor legislagov-sp-1, São Paulo. Hoje coberto pelos créditos da AWS."},
    {"id": "g-deposito", "nome": "Depósito de cópias (backup externo, 5 GB)", "categoria": "Backup", "fornecedor": "Amazon (AWS)", "valor": 1.0, "moeda": "USD",
     "period": "mensal", "venc": "", "pagamento": "na fatura da AWS", "obs": "legislagov-backup-sp."},
    {"id": "g-snapshots", "nome": "Fotos diárias do servidor (snapshots)", "categoria": "Backup", "fornecedor": "Amazon (AWS)", "valor": 0.15, "moeda": "USD",
     "period": "uso", "venc": "", "pagamento": "na fatura da AWS", "obs": "Cobra pelo espaço ocupado: cerca de US$ 0,05 por GB."},
    {"id": "g-route53", "nome": "DNS da Câmara (Route 53)", "categoria": "Domínio e DNS", "fornecedor": "Amazon (AWS)", "valor": 0.5, "moeda": "USD",
     "period": "mensal", "venc": "", "pagamento": "na fatura da AWS", "obs": "Zona camaranevespaulista.sp.gov.br, pronta para quando o DNS for trocado."},
    {"id": "g-ses", "nome": "E-mails automáticos (SES)", "categoria": "E-mail", "fornecedor": "Amazon (AWS)", "valor": 0.1, "moeda": "USD",
     "period": "uso", "venc": "", "pagamento": "na fatura da AWS", "obs": "US$ 0,10 a cada 1.000 e-mails."},
    {"id": "g-restaurante", "nome": "Restaurante na Amazon (CloudFront, Lambda, DynamoDB)", "categoria": "Hospedagem", "fornecedor": "Amazon (AWS)", "valor": 0.0, "moeda": "USD",
     "period": "uso", "venc": "", "pagamento": "na fatura da AWS", "obs": "Hoje dentro da faixa gratuita. Cresce com o uso."},
    {"id": "g-suporte", "nome": "Plano de suporte da AWS (Business Support+)", "categoria": "Suporte", "fornecedor": "Amazon (AWS)", "valor": 29.0, "moeda": "USD",
     "period": "mensal", "venc": "", "pagamento": "na fatura da AWS",
     "obs": "ATENÇÃO: plano pago (a partir de US$ 29/mês) ativo na conta. Hoje os créditos pagam. Se não for usar, volte para o Basic (grátis) no Console da AWS > Support."},
    {"id": "g-dominio", "nome": "Domínio legislagov.com.br", "categoria": "Domínio e DNS", "fornecedor": "Registro.br", "valor": 40.0, "moeda": "BRL",
     "period": "anual", "venc": "", "pagamento": "Boleto / Pix", "obs": "Informe a data de vencimento (aparece no painel do Registro.br)."},
    {"id": "g-render", "nome": "Site legislagov.com.br (Render)", "categoria": "Hospedagem", "fornecedor": "Render", "valor": 0.0, "moeda": "USD",
     "period": "mensal", "venc": "", "pagamento": "", "obs": "Confirme o plano no Render. Pode ser trazido para o nosso servidor."},
    {"id": "g-github", "nome": "GitHub (código)", "categoria": "Ferramentas", "fornecedor": "GitHub", "valor": 0.0, "moeda": "USD",
     "period": "mensal", "venc": "", "pagamento": "", "obs": "Plano gratuito."},
]
PERIODOS = {"mensal": 1, "anual": 12, "trimestral": 3, "semestral": 6, "uso": 1, "unico": 0}
CAMPOS = ("nome", "categoria", "fornecedor", "valor", "moeda", "period", "venc", "pagamento", "obs", "ativo")


def dolar(c):
    r = c.execute("SELECT valor FROM ct_config WHERE chave='dolar'").fetchone()
    try:
        return float(r["valor"]) if r else 5.55
    except Exception:
        return 5.55


def _em_reais(g, cot):
    v = float(g.get("valor") or 0)
    return v * cot if g.get("moeda") == "USD" else v


def _somar_meses(data, n):
    d = dt.date.fromisoformat(data)
    m = d.month - 1 + n
    a, m = d.year + m // 12, m % 12 + 1
    dias = [31, 29 if a % 4 == 0 and (a % 100 or a % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
    return dt.date(a, m, min(d.day, dias)).isoformat()


def gastos(c):
    lista = [json.loads(r["dados"]) for r in c.execute("SELECT dados FROM ct_gastos")]
    pags = [dict(json.loads(r["dados"]), id=r["id"], gasto=r["gasto"]) for r in c.execute("SELECT id, gasto, dados FROM ct_pagamentos ORDER BY criado DESC")]
    cot = dolar(c)
    ativos = [g for g in lista if g.get("ativo", True) is not False and not g.get("resumo")]
    mensal = sum(_em_reais(g, cot) / PERIODOS.get(g.get("period"), 1) for g in ativos if PERIODOS.get(g.get("period"), 1))
    ano = sum(_em_reais(g, cot) * (12 / PERIODOS[g.get("period")]) for g in ativos if PERIODOS.get(g.get("period"), 0))
    pago = sum((float(p.get("valor") or 0) * (cot if p.get("moeda") == "USD" else 1)) for p in pags)
    hoje = dt.date.today()
    for g in lista:
        g["dias"] = (dt.date.fromisoformat(g["venc"]) - hoje).days if g.get("venc") else None
    lista.sort(key=lambda g: (g.get("ativo", True) is False, g["dias"] if g["dias"] is not None else 9999, g.get("nome", "")))
    return {"gastos": lista, "pagamentos": pags[:200], "dolar": cot, "mensal": round(mensal, 2), "ano": round(ano, 2), "pago": round(pago, 2)}


def salvar_gasto(c, d, por):
    d = d if isinstance(d, dict) else {}
    gid = str(d.get("id") or "") or "g-" + uuid.uuid4().hex[:10]
    atual = c.execute("SELECT dados FROM ct_gastos WHERE id=?", (gid,)).fetchone()
    g = json.loads(atual["dados"]) if atual else {"id": gid}
    for k in CAMPOS:
        if k in d:
            g[k] = d[k]
    g["nome"] = str(g.get("nome") or "").strip()[:120]
    if not g["nome"]:
        return 400, {"ok": False, "erro": "Dê um nome ao gasto."}
    try:
        g["valor"] = round(float(str(g.get("valor") or 0).replace(",", ".")), 2)
    except ValueError:
        return 400, {"ok": False, "erro": "Valor inválido."}
    if g.get("moeda") not in ("BRL", "USD"):
        g["moeda"] = "BRL"
    if g.get("period") not in PERIODOS:
        g["period"] = "mensal"
    if g.get("venc"):
        try:
            dt.date.fromisoformat(str(g["venc"]))
        except ValueError:
            return 400, {"ok": False, "erro": "Data de vencimento inválida."}
    for k in ("categoria", "fornecedor", "pagamento", "obs"):
        g[k] = str(g.get(k) or "")[:400]
    c.execute("INSERT OR REPLACE INTO ct_gastos(id, dados, criado) VALUES(?,?,coalesce((SELECT criado FROM ct_gastos WHERE id=?),?))",
              (gid, json.dumps(g, ensure_ascii=False), gid, time.time()))
    return 200, {"ok": True, "id": gid}


def excluir_gasto(c, gid):
    c.execute("DELETE FROM ct_gastos WHERE id=?", (str(gid),))
    return 200, {"ok": True}


def pagar(c, d, por):
    gid = str(d.get("gasto") or "")
    r = c.execute("SELECT dados FROM ct_gastos WHERE id=?", (gid,)).fetchone()
    if not r:
        return 404, {"ok": False, "erro": "Gasto não encontrado."}
    g = json.loads(r["dados"])
    try:
        valor = round(float(str(d.get("valor", g.get("valor") or 0)).replace(",", ".")), 2)
    except ValueError:
        return 400, {"ok": False, "erro": "Valor inválido."}
    data = str(d.get("data") or dt.date.today().isoformat())
    p = {"nome": g.get("nome"), "valor": valor, "moeda": d.get("moeda") if d.get("moeda") in ("BRL", "USD") else g.get("moeda", "BRL"),
         "data": data, "obs": str(d.get("obs") or "")[:300], "por": por, "venc": g.get("venc", "")}
    c.execute("INSERT INTO ct_pagamentos(id, gasto, dados, criado) VALUES(?,?,?,?)", ("p-" + uuid.uuid4().hex[:10], gid, json.dumps(p, ensure_ascii=False), time.time()))
    n = PERIODOS.get(g.get("period"), 1)
    if g.get("venc") and n:   # próximo vencimento
        g["venc"] = _somar_meses(g["venc"], n)
        c.execute("UPDATE ct_gastos SET dados=? WHERE id=?", (json.dumps(g, ensure_ascii=False), gid))
    return 200, {"ok": True, "proximo": g.get("venc")}


def excluir_pagamento(c, pid):
    c.execute("DELETE FROM ct_pagamentos WHERE id=?", (str(pid),))
    return 200, {"ok": True}


def definir_dolar(c, v):
    try:
        v = round(float(str(v).replace(",", ".")), 4)
        assert 1 < v < 20
    except Exception:
        return 400, {"ok": False, "erro": "Cotação inválida."}
    c.execute("INSERT OR REPLACE INTO ct_config VALUES('dolar', ?)", (str(v),))
    return 200, {"ok": True}


# ------------------------------------------------------------------ monitoramento
def _estado(c, item, nome, grupo, estado, valor, detalhe, titulo=None, texto=None):
    """Grava a última leitura e abre ou fecha o aviso correspondente."""
    agora = time.time()
    c.execute("INSERT OR REPLACE INTO ct_monitor VALUES(?,?,?,?,?,?,?)", (item, nome, grupo, estado, str(valor), str(detalhe)[:400], agora))
    aberto = c.execute("SELECT id, nivel FROM ct_alertas WHERE item=? AND fechado IS NULL", (item,)).fetchone()
    if estado in ("aviso", "critico"):
        if not aberto:
            c.execute("INSERT INTO ct_alertas(id, item, nivel, titulo, texto, aberto) VALUES(?,?,?,?,?,?)",
                      ("a-" + uuid.uuid4().hex[:10], item, estado, titulo or nome, texto or detalhe, agora))
        elif aberto["nivel"] != estado or texto:
            c.execute("UPDATE ct_alertas SET nivel=?, titulo=?, texto=? WHERE id=?", (estado, titulo or nome, texto or detalhe, aberto["id"]))
    elif aberto:
        c.execute("UPDATE ct_alertas SET fechado=? WHERE id=?", (agora, aberto["id"]))


def _dias_certificado(host):
    ctx = ssl.create_default_context()
    with socket.create_connection((host, 443), timeout=8) as s:
        with ctx.wrap_socket(s, server_hostname=host) as t:
            fim = ssl.cert_time_to_seconds(t.getpeercert()["notAfter"])
    return int((fim - time.time()) // 86400)


def _url_ok(url):
    req = urllib.request.Request(url, headers={"User-Agent": "LegislaGov-Monitor/1"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=12) as r:
        return r.status, int((time.time() - t0) * 1000)


def verificar(externos=None):
    """Faz todas as conferências. As que dependem da internet (sites e certificados) rodam fora da trava do banco."""
    if externos is None:
        externos = os.environ.get("LG_MONITOR_EXTERNO", "1") == "1"
    leituras = []
    # disco
    try:
        u = shutil.disk_usage("/")
        pct = round(u.used * 100 / u.total, 1)
        livre = round(u.free / 1024 ** 3, 1)
        est = "critico" if pct >= 90 else "aviso" if pct >= 80 else "ok"
        leituras.append(("disco", "Disco do servidor", "Servidor", est, f"{pct}% usado", f"{livre} GB livres de {round(u.total / 1024 ** 3)} GB",
                         "Disco do servidor quase cheio" if est != "ok" else None,
                         f"O disco está {pct}% cheio ({livre} GB livres). Apague arquivos velhos ou aumente o plano do servidor." if est != "ok" else None))
    except Exception as e:
        leituras.append(("disco", "Disco do servidor", "Servidor", "aviso", "?", repr(e), None, None))
    # memória
    try:
        info = dict(l.split(":", 1) for l in open("/proc/meminfo").read().splitlines() if ":" in l)
        tot = int(info["MemTotal"].split()[0]) / 1024
        disp = int(info["MemAvailable"].split()[0]) / 1024
        pct = round(100 - disp * 100 / tot, 1)
        est = "critico" if disp < 100 else "aviso" if pct >= 90 else "ok"
        leituras.append(("memoria", "Memória", "Servidor", est, f"{pct}% em uso", f"{int(disp)} MB livres de {int(tot)} MB",
                         "Pouca memória livre no servidor" if est != "ok" else None,
                         "A memória está quase toda em uso. Se continuar, aumente o plano do servidor." if est != "ok" else None))
    except Exception:
        pass
    # carga
    try:
        carga = float(open("/proc/loadavg").read().split()[1])
        nucleos = os.cpu_count() or 1
        est = "aviso" if carga > nucleos * 1.5 else "ok"
        leituras.append(("carga", "Processador", "Servidor", est, f"carga {carga:.2f}", f"{nucleos} núcleo(s)",
                         "Processador sobrecarregado" if est != "ok" else None, "O servidor está trabalhando acima da capacidade nos últimos 5 minutos." if est != "ok" else None))
    except Exception:
        pass
    # banco de dados
    try:
        arq = lgapi.ARQ
        mb = round(os.path.getsize(arq) / 1024 ** 2, 2) if os.path.exists(arq) else 0
        u = shutil.disk_usage(os.path.dirname(arq) or "/")
        est = "aviso" if mb > 2048 or (mb and u.free < mb * 1024 ** 2 * 3) else "ok"
        leituras.append(("banco", "Banco de dados", "Dados", est, f"{mb} MB", "legislagov.db (SQLite)",
                         "Banco de dados grande para o espaço livre" if est != "ok" else None,
                         "O banco cresceu e o espaço livre ficou apertado para as cópias. Aumente o disco do servidor." if est != "ok" else None))
    except Exception:
        pass
    # backups
    try:
        st = json.load(open(os.path.join(COPIAS, "externa.json")))
        q = st.get("envio", {}).get("quando") or ""
        idade = (time.time() - time.mktime(time.strptime(q[:19], "%Y-%m-%dT%H:%M:%S"))) / 3600 if q else 999
        teste = (st.get("teste_restauracao") or {}).get("ok")
        est = "critico" if idade > 50 or st.get("ok") is False else "aviso" if idade > 30 or teste is False else "ok"
        leituras.append(("backup", "Cópia externa e teste de restauração", "Dados", est, f"há {int(idade)} h" if idade < 999 else "sem registro",
                         "teste de restauração ok" if teste else "teste de restauração com problema",
                         "Backup atrasado ou com erro" if est != "ok" else None,
                         "A cópia diária fora do servidor não rodou ou falhou. Confira o relatório e o depósito legislagov-backup-sp." if est != "ok" else None))
        dep = st.get("deposito") or {}
        if dep.get("limite_mb"):
            pct = round(float(dep.get("ocupado_mb") or 0) * 100 / dep["limite_mb"], 1)
            est = "critico" if pct >= 95 else "aviso" if pct >= 80 else "ok"
            leituras.append(("deposito", "Depósito de cópias (AWS)", "Dados", est, f"{pct}% do plano", f"{dep.get('ocupado_mb')} MB de {dep['limite_mb']} MB",
                             "Depósito de cópias quase cheio" if est != "ok" else None,
                             "O depósito legislagov-backup-sp está chegando ao limite de 5 GB do plano. Passando disso a AWS cobra o excedente." if est != "ok" else None))
    except FileNotFoundError:
        leituras.append(("backup", "Cópia externa e teste de restauração", "Dados", "aviso", "sem registro", "ainda não rodou neste servidor",
                         "Backup externo sem registro", "Não encontrei o resultado da cópia externa neste servidor."))
    except Exception:
        pass
    # envio de e-mails
    ses = bool(os.environ.get("LG_SES_CHAVE") and os.environ.get("LG_SES_SEGREDO"))
    leituras.append(("ses", "Envio de e-mails (SES)", "Serviços", "ok" if ses else "aviso", "ativo" if ses else "sem chave",
                     "nao-responda@legislagov.com.br" if ses else "“Esqueci a senha” não manda e-mail",
                     "Envio de e-mails desligado" if not ses else None,
                     "Falta colocar a chave do SES em /etc/legislagov.env. Sem ela o “Esqueci a senha” e os avisos por e-mail não funcionam." if not ses else None))
    # atualização automática (GitHub → servidor)
    try:
        fh = os.path.join(PASTA, ".git", "FETCH_HEAD")
        if os.path.exists(fh):
            minutos = (time.time() - os.path.getmtime(fh)) / 60
            est = "aviso" if minutos > 30 else "ok"
            leituras.append(("atualizacao", "Atualização automática", "Servidor", est, f"há {int(minutos)} min", "busca a versão nova a cada 2 minutos",
                             "Atualização automática parada" if est != "ok" else None,
                             "O servidor não busca versão nova no GitHub há mais de 30 minutos." if est != "ok" else None))
    except Exception:
        pass
    if externos:
        for host in DOMINIOS:
            try:
                d = _dias_certificado(host)
                est = "critico" if d < 7 else "aviso" if d < 15 else "ok"
                leituras.append(("cert:" + host, "Cadeado (HTTPS) " + host, "Certificados", est, f"{d} dias", "vence em " + (dt.date.today() + dt.timedelta(days=d)).strftime("%d/%m/%Y"),
                                 f"Certificado de {host} vence em {d} dias" if est != "ok" else None,
                                 "O Caddy renova sozinho. Se chegou aqui, a renovação está falhando: confira o DNS e o Caddy." if est != "ok" else None))
            except Exception as e:
                leituras.append(("cert:" + host, "Cadeado (HTTPS) " + host, "Certificados", "aviso", "erro", repr(e)[:120], f"Não consegui conferir o cadeado de {host}", None))
        for nome, url in SITES:
            try:
                cod, ms = _url_ok(url)
                est = "ok" if cod < 400 else "critico"
                leituras.append(("site:" + url, nome, "Sistemas", est, f"{cod} · {ms} ms", url, None if est == "ok" else f"{nome} fora do ar", None))
            except Exception as e:
                leituras.append(("site:" + url, nome, "Sistemas", "critico", "não respondeu", repr(e)[:160], f"{nome} fora do ar",
                                 f"{url} não respondeu. Veja se o servidor e o serviço estão ligados."))
    with lgapi._trava:
        c = _db()
        for l in leituras:
            _estado(c, *l)
        c.execute("INSERT OR REPLACE INTO ct_config VALUES('ultima_verificacao', ?)", (str(time.time()),))
    return len(leituras)


def _vencimentos(c):
    """Avisos de pagamento: vence em até 10 dias, ou já venceu."""
    out = []
    for g in gastos(c)["gastos"]:
        if g.get("ativo", True) is False or g["dias"] is None or g["dias"] > 10:
            continue
        if not float(g.get("valor") or 0) and g.get("period") != "anual" and not g.get("resumo"):
            continue
        v = f"{'US$' if g.get('moeda') == 'USD' else 'R$'} {float(g.get('valor') or 0):.2f}".replace(".", ",")
        quando = "vence hoje" if g["dias"] == 0 else f"venceu há {-g['dias']} dia(s)" if g["dias"] < 0 else f"vence em {g['dias']} dia(s)"
        out.append({"id": "v-" + g["id"] + "-" + g.get("venc", ""), "tipo": "vencimento", "nivel": "critico" if g["dias"] <= 2 else "aviso",
                    "titulo": f"{g['nome']}: {quando}", "texto": f"{v} · {g.get('pagamento') or ''} · {dt.date.fromisoformat(g['venc']).strftime('%d/%m/%Y')}", "gasto": g["id"]})
    for g in gastos(c)["gastos"]:
        if g.get("ativo", True) is not False and g.get("period") == "anual" and not g.get("venc"):
            out.append({"id": "sv-" + g["id"], "tipo": "vencimento", "nivel": "aviso", "titulo": f"{g['nome']}: informe o vencimento",
                        "texto": "Sem a data, o sistema não consegue avisar antes de vencer.", "gasto": g["id"]})
    return out


def mensagens():
    try:
        return json.load(open(os.path.join(PASTA, "ferramentas", "central", "mensagens.json"), encoding="utf-8"))
    except Exception:
        return {"mensagens": [], "aws": None}


def resumo(c):
    mon = [dict(r) for r in c.execute("SELECT * FROM ct_monitor ORDER BY grupo, nome")]
    alertas = [dict(r) for r in c.execute("SELECT * FROM ct_alertas WHERE fechado IS NULL ORDER BY CASE nivel WHEN 'critico' THEN 0 ELSE 1 END, aberto DESC")]
    historico = [dict(r) for r in c.execute("SELECT * FROM ct_alertas WHERE fechado IS NOT NULL ORDER BY fechado DESC LIMIT 40")]
    ult = c.execute("SELECT valor FROM ct_config WHERE chave='ultima_verificacao'").fetchone()
    vistos = json.loads((c.execute("SELECT valor FROM ct_config WHERE chave='msgs_vistas'").fetchone() or {"valor": "[]"})["valor"])
    m = mensagens()
    return {"ok": True, "monitor": mon, "alertas": alertas, "historico": historico, "vencimentos": _vencimentos(c),
            "ultima": float(ult["valor"]) if ult else None, "mensagens": m.get("mensagens", []), "aws": m.get("aws"), "msgsVistas": vistos, **gastos(c)}


def marcar_visto(c, ids):
    atual = set(json.loads((c.execute("SELECT valor FROM ct_config WHERE chave='msgs_vistas'").fetchone() or {"valor": "[]"})["valor"]))
    atual.update(str(i) for i in (ids or []))
    c.execute("INSERT OR REPLACE INTO ct_config VALUES('msgs_vistas', ?)", (json.dumps(sorted(atual)),))
    c.execute(f"UPDATE ct_alertas SET visto=? WHERE id IN ({','.join('?' * len(ids or []))})", (time.time(), *[str(i) for i in (ids or [])])) if ids else None
    return 200, {"ok": True}


_enviado = {"t": 0.0}


def enviar_estado(forcar=False):
    """Uma vez por hora, guarda a situação no depósito (monitor/estado.json) para a equipe técnica (Claude) acompanhar
    de fora do servidor. Vai só a situação dos sistemas, avisos e gastos: nenhum dado da Câmara nem de pessoas."""
    if not forcar and time.time() - _enviado["t"] < 3600:
        return
    _enviado["t"] = time.time()
    try:
        with lgapi._trava:
            r = resumo(_db())
        corpo = {k: r[k] for k in ("monitor", "alertas", "historico", "vencimentos", "ultima", "mensal", "ano", "dolar", "gastos", "msgsVistas")}
        corpo["pagamentos"] = [{k: p.get(k) for k in ("nome", "valor", "moeda", "data")} for p in r["pagamentos"][:50]]
        corpo["enviado"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        import sys
        sys.path.insert(0, os.path.join(PASTA, "ferramentas", "aws"))
        import copia_externa
        copia_externa.cliente().put_object(Bucket=copia_externa.BUCKET, Key="monitor/estado.json", ContentType="application/json; charset=utf-8",
                                           Body=json.dumps(corpo, ensure_ascii=False, indent=1).encode("utf-8"), ServerSideEncryption="AES256")
    except Exception as e:
        print("monitor: envio do estado", repr(e)[:200], flush=True)


def _laco():
    time.sleep(45)
    while True:
        try:
            verificar()
            if os.environ.get("LG_MONITOR_EXTERNO", "1") == "1":
                enviar_estado()
        except Exception as e:
            print("monitor:", repr(e), flush=True)
        time.sleep(INTERVALO)


def iniciar():
    if os.environ.get("LG_MONITOR", "1") == "1" and lgapi.ativo():
        threading.Thread(target=_laco, name="lg-monitor", daemon=True).start()
