#!/bin/bash
# Roda como root no servidor da Amazon depois de cada atualização vinda do GitHub.
# Mantém a configuração do servidor em dia com o repositório (domínios, banco ligado).
set -e
APP=/opt/legislagov/app
ENV=/etc/legislagov.env

# banco de dados ligado
grep -q '^LG_BANCO=' "$ENV" || echo 'LG_BANCO=1' >> "$ENV"

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
