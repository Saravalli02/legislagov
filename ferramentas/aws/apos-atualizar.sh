#!/bin/bash
# Roda como root no servidor da Amazon depois de cada atualização vinda do GitHub.
# Mantém a configuração do servidor em dia com o repositório (domínios, banco ligado).
set -e
APP=/opt/legislagov/app
ENV=/etc/legislagov.env

# banco de dados ligado
grep -q '^LG_BANCO=' "$ENV" || echo 'LG_BANCO=1' >> "$ENV"

# conteúdo importado (site antigo + SISCAM): pasta própria, refeito todo dia e quando importar.versao mudar
grep -q '^LG_CONTEUDO=' "$ENV" || echo 'LG_CONTEUDO=/var/lib/legislagov/conteudo' >> "$ENV"
mkdir -p /var/lib/legislagov/conteudo && chown legislagov:legislagov /var/lib/legislagov/conteudo
cat > /usr/local/bin/legislagov-importar <<'EOS'
#!/bin/bash
# Traz notícias/fotos do site antigo e proposituras/leis do SISCAM para /var/lib/legislagov/conteudo
cd /opt/legislagov/app
export LG_CONTEUDO=/var/lib/legislagov/conteudo
sudo -E -u legislagov python3 ferramentas/importar_siscam.py
sudo -E -u legislagov python3 ferramentas/importar_site_antigo.py
cp ferramentas/aws/importar.versao /var/lib/legislagov/conteudo/.versao
EOS
chmod 755 /usr/local/bin/legislagov-importar
echo '10 4 * * * root /usr/local/bin/legislagov-importar > /var/log/legislagov-importar.log 2>&1' > /etc/cron.d/legislagov-importar
if ! cmp -s "$APP/ferramentas/aws/importar.versao" /var/lib/legislagov/conteudo/.versao; then
  systemd-run --unit="legislagov-importacao-$(date +%s)" --no-block /bin/bash -c '/usr/local/bin/legislagov-importar > /var/log/legislagov-importar.log 2>&1' || true
fi

# cópia do banco fora do servidor (depósito Lightsail legislagov-backup-sp, São Paulo), 03:45 todo dia
python3 -c 'import boto3' 2>/dev/null || { apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-boto3; } || true
cat > /usr/local/bin/legislagov-copia-externa <<'EOS'
#!/bin/bash
# envia a cópia do dia ao depósito e testa a restauração (resultado: /var/lib/legislagov/copias/externa.json)
ls /var/lib/legislagov/copias/legislagov-*.db.gz >/dev/null 2>&1 || /usr/local/bin/legislagov-copia
set -a; . /etc/legislagov.env; set +a
exec python3 /opt/legislagov/app/ferramentas/aws/copia_externa.py "$@"
EOS
chmod 755 /usr/local/bin/legislagov-copia-externa
echo '45 3 * * * root /usr/local/bin/legislagov-copia-externa > /var/log/legislagov-copia-externa.log 2>&1' > /etc/cron.d/legislagov-copia-externa
if ! cmp -s "$APP/ferramentas/aws/copia.versao" /var/lib/legislagov/copias/.versao-externa; then
  cp "$APP/ferramentas/aws/copia.versao" /var/lib/legislagov/copias/.versao-externa
  systemd-run --unit="legislagov-copia-externa-$(date +%s)" --no-block /bin/bash -c '/usr/local/bin/legislagov-copia > /dev/null 2>&1; /usr/local/bin/legislagov-copia-externa > /var/log/legislagov-copia-externa.log 2>&1' || true
fi

# comando para definir senha de usuário direto no servidor
cat > /usr/local/bin/legislagov-senha <<'EOS'
#!/bin/bash
set -a; . /etc/legislagov.env; set +a
exec sudo -E -u legislagov python3 /opt/legislagov/app/ferramentas/aws/senha.py "$@"
EOS
chmod 755 /usr/local/bin/legislagov-senha

# HTTPS para cada endereço listado em dominios.txt
DOMS=$(grep -v '^\s*#' "$APP/ferramentas/aws/dominios.txt" | awk 'NF>=2{print $1}' | tr '\n' ' ')
NOVO=$(mktemp)
{
  for d in $DOMS; do
    cat <<EOF
$d {
	encode gzip
	reverse_proxy 127.0.0.1:8080
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}
}
EOF
  done
  cat <<'EOF'
# acesso pelo IP: só para conferir se está no ar
:80 {
	handle /healthz {
		respond "ok" 200
	}
	handle {
		redir https://teste.legislagov.com.br{uri} 302
	}
}
EOF
} > "$NOVO"
if ! cmp -s "$NOVO" /etc/caddy/Caddyfile; then
  cp "$NOVO" /etc/caddy/Caddyfile
  systemctl reload caddy || systemctl restart caddy
fi
rm -f "$NOVO"
