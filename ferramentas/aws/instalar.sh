#!/bin/bash
# =====================================================================
# LegislaGov — instalação do servidor na Amazon Lightsail (Ubuntu 24.04)
# Roda uma vez, como root, pelo "script de inicialização" do Lightsail:
#   curl -fsSL https://raw.githubusercontent.com/Saravalli02/legislagov/main/ferramentas/aws/instalar.sh | DOMINIO=neves.legislagov.com.br bash
# Pode rodar de novo sem estragar nada (só completa o que faltar).
#
# O que fica no servidor:
#   /opt/legislagov/app        código (cópia do GitHub, atualizada sozinha a cada 2 minutos)
#   /var/lib/legislagov        banco de dados (SQLite) e arquivos do servidor — NÃO fica no GitHub
#   /var/lib/legislagov/copias cópia diária do banco (guarda 14 dias)
#   /etc/legislagov.env        configurações e chaves (só o root lê)
#   Caddy                      HTTPS automático (Let's Encrypt) na frente do sistema
# =====================================================================
set -euo pipefail
DOMINIO="${DOMINIO:-neves.legislagov.com.br}"
REPO="${REPO:-https://github.com/Saravalli02/legislagov.git}"
APP=/opt/legislagov/app
DADOS=/var/lib/legislagov
export DEBIAN_FRONTEND=noninteractive

echo ">> pacotes"
apt-get update -y
apt-get install -y git python3 sqlite3 caddy unattended-upgrades
timedatectl set-timezone America/Sao_Paulo || true

echo ">> usuário e pastas"
id legislagov >/dev/null 2>&1 || useradd --system --home /opt/legislagov --shell /usr/sbin/nologin legislagov
mkdir -p /opt/legislagov "$DADOS/copias"
if [ ! -d "$APP/.git" ]; then git clone --depth 50 "$REPO" "$APP"; fi
chown -R legislagov:legislagov /opt/legislagov "$DADOS"
chmod 750 "$DADOS"

echo ">> configurações"
if [ ! -f /etc/legislagov.env ]; then
  cat > /etc/legislagov.env <<EOF
# Configurações do LegislaGov (não vão para o GitHub). Depois de mudar: systemctl restart legislagov
PORT=8080
LG_DADOS=$DADOS
LG_DOMINIO=$DOMINIO
DEMONSTRACAO=1
# ANTHROPIC_API_KEY=
EOF
fi
chown root:legislagov /etc/legislagov.env; chmod 640 /etc/legislagov.env

echo ">> serviço do sistema"
cat > /etc/systemd/system/legislagov.service <<'EOF'
[Unit]
Description=LegislaGov (site e painel)
After=network-online.target
Wants=network-online.target

[Service]
User=legislagov
Group=legislagov
WorkingDirectory=/opt/legislagov/app
EnvironmentFile=/etc/legislagov.env
ExecStart=/usr/bin/python3 /opt/legislagov/app/server.py
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/legislagov
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

echo ">> atualização automática pelo GitHub (a cada 2 minutos)"
cat > /usr/local/bin/legislagov-atualizar <<'EOF'
#!/bin/bash
set -e
cd /opt/legislagov/app
antes=$(git rev-parse HEAD)
sudo -u legislagov git fetch -q origin main
depois=$(git rev-parse origin/main)
if [ "$antes" != "$depois" ]; then
  sudo -u legislagov git reset -q --hard origin/main
  if [ -x ferramentas/aws/apos-atualizar.sh ]; then bash ferramentas/aws/apos-atualizar.sh || true; fi
  systemctl restart legislagov
  logger -t legislagov "atualizado para $depois"
fi
EOF
chmod 755 /usr/local/bin/legislagov-atualizar
git config --system --add safe.directory "$APP"
cat > /etc/systemd/system/legislagov-atualizar.service <<'EOF'
[Unit]
Description=LegislaGov: baixa a versão nova do GitHub
[Service]
Type=oneshot
ExecStart=/usr/local/bin/legislagov-atualizar
EOF
cat > /etc/systemd/system/legislagov-atualizar.timer <<'EOF'
[Unit]
Description=LegislaGov: confere atualização a cada 2 minutos
[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
EOF

echo ">> cópia diária do banco (03:30, guarda 14 dias)"
cat > /usr/local/bin/legislagov-copia <<'EOF'
#!/bin/bash
set -e
D=/var/lib/legislagov
[ -f "$D/legislagov.db" ] || exit 0
sqlite3 "$D/legislagov.db" ".backup '$D/copias/legislagov-$(date +%F).db'"
gzip -f "$D/copias/legislagov-$(date +%F).db"
find "$D/copias" -name 'legislagov-*.db.gz' -mtime +14 -delete
chown -R legislagov:legislagov "$D/copias"
EOF
chmod 755 /usr/local/bin/legislagov-copia
cat > /etc/cron.d/legislagov-copia <<'EOF'
30 3 * * * root /usr/local/bin/legislagov-copia
EOF

echo ">> HTTPS (Caddy)"
cat > /etc/caddy/Caddyfile <<EOF
$DOMINIO {
	encode gzip
	reverse_proxy 127.0.0.1:8080
	header {
		Strict-Transport-Security "max-age=31536000"
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}
}
# acesso pelo IP (antes do domínio apontar): só HTTP, para conferir se está no ar
:80 {
	reverse_proxy 127.0.0.1:8080
}
EOF

systemctl daemon-reload
systemctl enable --now legislagov legislagov-atualizar.timer
systemctl restart caddy
echo ">> pronto: https://$DOMINIO (depois que o domínio apontar para este servidor)"
