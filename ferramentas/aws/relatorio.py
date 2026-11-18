#!/usr/bin/env python3
"""Relatório de conferência do servidor (roda no servidor quando ferramentas/aws/relatorio.versao muda).

Junta, sem senhas e sem conteúdo de documentos:
  - saúde do servidor: disco, memória, serviços, últimos erros do log;
  - banco: integridade, tamanho, usuários por câmara (só login, perfil e se está ativo);
  - inventário das informações de cada câmara: chave, tamanho e, nas listas, id + título/número de cada item
    (para separar o que é exemplo do que é dado real antes de limpar).
Grava em /var/lib/legislagov/relatorios/ e envia ao depósito legislagov-backup-sp em relatorios/.
"""
import datetime as dt, json, os, shutil, sqlite3, subprocess, sys

DADOS = os.environ.get("LG_DADOS", "/var/lib/legislagov")
BANCO = os.path.join(DADOS, "legislagov.db")
SAIDA = os.path.join(DADOS, "relatorios")


def sh(cmd):
    try:
        return subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30).stdout.strip()[-6000:]
    except Exception as e:
        return "erro: " + str(e)


def resumo_item(x):
    if not isinstance(x, dict):
        return str(x)[:60]
    campos = ["id", "numero", "num", "titulo", "title", "assunto", "nome", "ementa", "data", "status", "autor", "tipo"]
    return {k: str(x[k])[:90] for k in campos if k in x and x[k] not in (None, "")}


def inventario(con):
    out = {}
    for cam, chave, valor in con.execute("SELECT camara, chave, valor FROM dados ORDER BY camara, chave"):
        info = {"bytes": len(valor or "")}
        try:
            v = json.loads(valor) if valor else None
        except Exception:
            v = None
            info["tipo"] = "texto"
        if isinstance(v, list):
            info["tipo"] = "lista"
            info["itens"] = len(v)
            info["amostra"] = [resumo_item(x) for x in v[:80]]
        elif isinstance(v, dict):
            info["tipo"] = "objeto"
            info["campos"] = {k: (len(x) if isinstance(x, (list, dict)) else type(x).__name__) for k, x in list(v.items())[:60]}
            for k, x in v.items():
                if isinstance(x, list) and x and isinstance(x[0], dict):
                    info.setdefault("listas", {})[k] = [resumo_item(i) for i in x[:60]]
        elif v is not None:
            info["tipo"] = type(v).__name__
            info["valor"] = str(v)[:80]
        out.setdefault(cam, {})[chave] = info
    return out


def main():
    rel = {"quando": dt.datetime.now().isoformat(timespec="seconds")}
    rel["servidor"] = {
        "disco": sh("df -h / /var/lib/legislagov | tail -n +2"),
        "memoria": sh("free -m"),
        "uptime": sh("uptime"),
        "servicos": {s: sh(f"systemctl is-active {s}") for s in ("legislagov", "caddy", "cron", "unattended-upgrades")},
        "versao_app": sh("cd /opt/legislagov/app && git log -1 --format='%h %ci %s'"),
        "erros_app": sh("journalctl -u legislagov --since '-3 days' --no-pager 2>/dev/null | grep -iE 'traceback|error|erro|exception' | tail -40"),
        "erros_caddy": sh("journalctl -u caddy --since '-2 days' --no-pager 2>/dev/null | grep -iE 'error|fail' | tail -25"),
        "certificados": sh("ls /var/lib/caddy/.local/share/caddy/certificates/*/ 2>/dev/null"),
        "copias_locais": sh(f"ls -la {DADOS}/copias | tail -6"),
        "copia_externa": sh(f"cat {DADOS}/copias/externa.json 2>/dev/null | head -c 1500"),
        "arquivos": sh(f"du -sh {DADOS}/arquivos {DADOS}/conteudo 2>/dev/null"),
        "importacao": sh("tail -15 /var/log/legislagov-importar.log 2>/dev/null"),
    }
    con = sqlite3.connect(f"file:{BANCO}?mode=ro", uri=True)
    con.row_factory = None
    rel["banco"] = {
        "integridade": con.execute("PRAGMA integrity_check").fetchone()[0],
        "tamanho_mb": round(os.path.getsize(BANCO) / 1048576, 2),
        "tabelas": {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                    for (t,) in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()},
    }
    try:
        cols = [r[1] for r in con.execute("PRAGMA table_info(usuarios)")]
        sel = ", ".join(c for c in ("camara", "usuario", "nome", "perfil", "cargo", "ativo") if c in cols)
        rel["usuarios"] = [dict(zip(sel.split(", "), r)) for r in con.execute(f"SELECT {sel} FROM usuarios ORDER BY camara")]
    except Exception as e:
        rel["usuarios"] = "erro: " + str(e)
    try:   # acessos do Rural (sem senha)
        import time as _t
        rel["rural_usuarios"] = [{"empresa": e, "usuario": u, "nome": n, "perfil": pf, "temVendedor": bool(v),
                                  "falhas": f, "bloqueadoAte": (_t.strftime("%d/%m %H:%M", _t.localtime(b)) if b and b > _t.time() else "")}
                                 for e, u, n, pf, v, f, b in con.execute("SELECT empresa, usuario, nome, perfil, vendedor, falhas, bloqueio FROM rural_usuarios ORDER BY empresa")]
        rel["rural_tentativas"] = [list(r) for r in con.execute(
            "SELECT * FROM registro WHERE camara LIKE 'rural:%' ORDER BY rowid DESC LIMIT 15")]
    except Exception as e:
        rel["rural_usuarios"] = "erro: " + str(e)
    rel["inventario"] = inventario(con)
    # diagnóstico do Portal do Vereador: perfis dos usuários (sem senha) e vínculos com a composição
    try:
        diag = {}
        for cam, in con.execute("SELECT DISTINCT camara FROM usuarios").fetchall():
            us = []
            for login_, dados in con.execute("SELECT usuario, dados FROM usuarios WHERE camara=?", (cam,)):
                d = json.loads(dados or "{}")
                us.append({k: d.get(k) for k in ("nome", "perfil", "cargo", "cargoId", "setor", "orgao", "ativo", "pendente")} | {"usuario": login_})
            r0 = con.execute("SELECT valor FROM dados WHERE camara=? AND chave='lgv_camara_v1'", (cam,)).fetchone()
            comp = json.loads(r0[0]) if r0 else {}
            r1 = con.execute("SELECT valor FROM dados WHERE camara=? AND chave='lgt_areas_v1'", (cam,)).fetchone()
            r2 = con.execute("SELECT valor FROM dados WHERE camara=? AND chave='lgv10_notifications_v1'", (cam,)).fetchone()
            notifs = [{k: n.get(k) for k in ("to", "title", "kind")} for n in (json.loads(r2[0]) if r2 else [])[:30]]
            diag[cam] = {"usuarios": us, "presidente": comp.get("presidente"),
                         "vereadores": [{k: v.get(k) for k in ("id", "nome", "usuario")} for v in comp.get("vereadores", [])],
                         "comissoes": [{k: c.get(k) for k in ("nome", "presidente", "vice", "relator")} for c in comp.get("comissoes", [])],
                         "areas": json.loads(r1[0]) if r1 else None, "avisos": notifs}
        rel["diagnostico_vereador"] = diag
    except Exception as e:
        rel["diagnostico_vereador"] = "erro: " + str(e)
    con.close()
    os.makedirs(SAIDA, exist_ok=True)
    nome = "relatorio-" + dt.datetime.now().strftime("%Y%m%d-%H%M") + ".json"
    arq = os.path.join(SAIDA, nome)
    json.dump(rel, open(arq, "w"), ensure_ascii=False, indent=1)
    try:
        import boto3
        ch, se = os.environ.get("LG_COPIA_CHAVE"), os.environ.get("LG_COPIA_SEGREDO")
        s3 = boto3.client("s3", region_name="sa-east-1", **({"aws_access_key_id": ch, "aws_secret_access_key": se} if ch and se else {}))
        s3.upload_file(arq, "legislagov-backup-sp", "relatorios/" + nome,
                                                                ExtraArgs={"ServerSideEncryption": "AES256"})
        print("enviado relatorios/" + nome)
    except Exception as e:
        print("não enviado:", e)


if __name__ == "__main__":
    main()
