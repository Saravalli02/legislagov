#!/usr/bin/env python3
"""Cópia do banco fora do servidor (depósito Lightsail 'legislagov-backup-sp', São Paulo).

Roda todo dia depois da cópia local (03:30):
  - envia a cópia do dia para  diarias/AAAA-MM-DD.db.gz   (guarda 30 dias)
  - no dia 1º, também para       mensais/AAAA-MM.db.gz     (guarda 12 meses)
  - testa a restauração: baixa a cópia mais recente do depósito, abre o banco e confere
  - grava o resultado em /var/lib/legislagov/copias/externa.json (aparece em /healthz/copia)

O servidor está ligado ao depósito pelo próprio Lightsail ("Resource access"): não há chave guardada aqui.
Uso:  copia_externa.py            (envio + teste)
      copia_externa.py --teste    (só o teste de restauração)
"""
import datetime as dt, glob, gzip, json, os, shutil, sqlite3, sys, tempfile, traceback

BUCKET = os.environ.get("LG_COPIA_BUCKET", "legislagov-backup-sp")
REGIAO = os.environ.get("LG_COPIA_REGIAO", "sa-east-1")
DADOS = os.environ.get("LG_DADOS", "/var/lib/legislagov")
COPIAS = os.path.join(DADOS, "copias")
STATUS = os.path.join(COPIAS, "externa.json")
DIAS, MESES = 30, 12


def cliente():
    import boto3
    chave, segredo = os.environ.get("LG_COPIA_CHAVE"), os.environ.get("LG_COPIA_SEGREDO")
    if chave and segredo:   # chave de acesso do depósito (em /etc/legislagov.env), se o vínculo do Lightsail não bastar
        return boto3.client("s3", region_name=REGIAO, aws_access_key_id=chave, aws_secret_access_key=segredo)
    return boto3.client("s3", region_name=REGIAO)


def diagnostico():
    """Mostra de onde viriam as credenciais (sem expor nenhum segredo)."""
    import urllib.request
    out = {}
    try:
        tk = urllib.request.urlopen(urllib.request.Request("http://169.254.169.254/latest/api/token", method="PUT", headers={"X-aws-ec2-metadata-token-ttl-seconds": "60"}), timeout=3).read().decode()
        r = urllib.request.urlopen(urllib.request.Request("http://169.254.169.254/latest/meta-data/iam/security-credentials/", headers={"X-aws-ec2-metadata-token": tk}), timeout=3).read().decode()
        out["papel_da_instancia"] = r.strip() or "(nenhum)"
    except Exception as e:
        out["metadados"] = str(e)[:120]
    out["chave_no_env"] = bool(os.environ.get("LG_COPIA_CHAVE"))
    return out


def ultima_local():
    l = sorted(glob.glob(os.path.join(COPIAS, "legislagov-*.db.gz")))
    if not l:
        raise RuntimeError("nenhuma cópia local em " + COPIAS)
    return l[-1]


def enviar(s3, arq):
    dia = os.path.basename(arq)[len("legislagov-"):-len(".db.gz")]   # AAAA-MM-DD
    enviados = []
    chave = f"diarias/{dia}.db.gz"
    s3.upload_file(arq, BUCKET, chave, ExtraArgs={"ServerSideEncryption": "AES256"}); enviados.append(chave)
    if dia.endswith("-01"):
        chave = f"mensais/{dia[:7]}.db.gz"
        s3.upload_file(arq, BUCKET, chave, ExtraArgs={"ServerSideEncryption": "AES256"}); enviados.append(chave)
    return enviados


def limpar(s3):
    """Apaga (todas as versões) o que passou do prazo: 30 diárias e 12 mensais."""
    hoje = dt.date.today(); apagados = 0
    pag = s3.get_paginator("list_object_versions")
    for pagina in pag.paginate(Bucket=BUCKET):
        for v in pagina.get("Versions", []) + pagina.get("DeleteMarkers", []):
            k = v["Key"]; velho = False
            if k.startswith("arquivos/"):
                continue   # anexos nunca vencem (as informações apontam para eles)
            try:
                if k.startswith("diarias/"):
                    velho = (hoje - dt.date.fromisoformat(k[8:18])).days > DIAS
                elif k.startswith("mensais/"):
                    a, m = int(k[8:12]), int(k[13:15])
                    velho = (hoje.year - a) * 12 + (hoje.month - m) > MESES
            except ValueError:
                continue
            if velho:
                s3.delete_object(Bucket=BUCKET, Key=k, VersionId=v["VersionId"]); apagados += 1
    return apagados


def testar(s3):
    """Baixa a cópia diária mais recente do depósito e confere se o banco abre inteiro."""
    objs = s3.list_objects_v2(Bucket=BUCKET, Prefix="diarias/").get("Contents", [])
    if not objs:
        raise RuntimeError("depósito sem cópias")
    ult = max(objs, key=lambda o: o["Key"])
    tmp = tempfile.mkdtemp(prefix="lg-teste-")
    try:
        gz = os.path.join(tmp, "c.db.gz"); db = os.path.join(tmp, "c.db")
        s3.download_file(BUCKET, ult["Key"], gz)
        with gzip.open(gz, "rb") as i, open(db, "wb") as o:
            shutil.copyfileobj(i, o)
        con = sqlite3.connect(db)
        integ = con.execute("PRAGMA integrity_check").fetchone()[0]
        n = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("usuarios", "dados", "historico") if con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)).fetchone()}
        con.close()
        if integ != "ok":
            raise RuntimeError("banco restaurado com defeito: " + integ)
        return {"copia": ult["Key"], "tamanho_mb": round(ult["Size"] / 1048576, 2), "integridade": integ, "registros": n}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def copiar_arquivos(s3):
    """PDFs, fotos e anexos (DADOS/arquivos/<câmara>/<id>): o nome é o resumo do conteúdo, então só sobe o que é novo."""
    pasta = os.path.join(DADOS, "arquivos")
    if not os.path.isdir(pasta):
        return {"enviados": 0, "total": 0}
    ja = set()
    for pagina in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix="arquivos/"):
        ja.update(o["Key"] for o in pagina.get("Contents", []))
    enviados = total = 0
    for cam in sorted(os.listdir(pasta)):
        dcam = os.path.join(pasta, cam)
        if not os.path.isdir(dcam):
            continue
        for nome in os.listdir(dcam):
            if ".tmp" in nome:
                continue
            total += 1
            chave = f"arquivos/{cam}/{nome}"
            if chave not in ja:
                s3.upload_file(os.path.join(dcam, nome), BUCKET, chave, ExtraArgs={"ServerSideEncryption": "AES256"}); enviados += 1
    return {"enviados": enviados, "total": total}


def uso(s3):
    total = 0; qtd = 0
    for pagina in s3.get_paginator("list_object_versions").paginate(Bucket=BUCKET):
        for v in pagina.get("Versions", []):
            total += v["Size"]; qtd += 1
    return {"arquivos": qtd, "ocupado_mb": round(total / 1048576, 1), "limite_mb": 5120}


def main():
    st = {}
    try:
        st = json.load(open(STATUS))
    except Exception:
        pass
    agora = dt.datetime.now().isoformat(timespec="seconds")
    try:
        s3 = cliente()
        if "--teste" not in sys.argv:
            st["envio"] = {"quando": agora, "ok": True, "arquivos": enviar(s3, ultima_local()), "apagados_antigos": limpar(s3),
                           "anexos": copiar_arquivos(s3)}
        st["teste_restauracao"] = {"quando": agora, "ok": True, **testar(s3)}
        st["deposito"] = {"nome": BUCKET, "regiao": REGIAO, **uso(s3)}
        st["ok"] = True; st.pop("erro", None)
    except Exception as e:
        traceback.print_exc()
        st["ok"] = False; st["erro"] = {"quando": agora, "mensagem": str(e)[:300], "diagnostico": diagnostico()}
    os.makedirs(COPIAS, exist_ok=True)
    json.dump(st, open(STATUS, "w"), ensure_ascii=False, indent=1)
    print(json.dumps(st, ensure_ascii=False, indent=1))
    sys.exit(0 if st.get("ok") else 1)


if __name__ == "__main__":
    main()
