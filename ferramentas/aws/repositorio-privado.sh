#!/bin/bash
# =====================================================================
# Prepara o servidor da Amazon para continuar se atualizando depois que o
# repositório do GitHub virar PRIVADO (ninguém de fora vê o código).
#
# Rodar UMA vez, como root, ANTES de deixar o repositório privado:
#   sudo bash /opt/legislagov/app/ferramentas/aws/repositorio-privado.sh
#
# O que faz:
#   1. cria uma chave só de leitura para este servidor (/opt/legislagov/.ssh)
#   2. mostra a chave pública para cadastrar no GitHub (Settings > Deploy keys)
#   3. troca o endereço do repositório para SSH (a atualização a cada 2 min continua)
# =====================================================================
set -euo pipefail
APP=/opt/legislagov/app
DIR=/opt/legislagov/.ssh
mkdir -p "$DIR"
if [ ! -f "$DIR/id_ed25519" ]; then
  ssh-keygen -t ed25519 -N "" -C "legislagov-servidor-$(hostname)" -f "$DIR/id_ed25519" >/dev/null
fi
ssh-keyscan -t ed25519 github.com > "$DIR/known_hosts" 2>/dev/null
cat > "$DIR/config" <<'EOF'
Host github.com
  IdentityFile /opt/legislagov/.ssh/id_ed25519
  UserKnownHostsFile /opt/legislagov/.ssh/known_hosts
  IdentitiesOnly yes
EOF
chown -R legislagov:legislagov "$DIR"; chmod 700 "$DIR"; chmod 600 "$DIR/id_ed25519" "$DIR/config"
sudo -u legislagov git -C "$APP" config core.sshCommand "ssh -F $DIR/config"
sudo -u legislagov git -C "$APP" remote set-url origin git@github.com:Saravalli02/legislagov.git
echo
echo "=============================================================="
echo " Copie a linha abaixo e cadastre no GitHub:"
echo " github.com/Saravalli02/legislagov > Settings > Deploy keys > Add deploy key"
echo " (título: Servidor Amazon · NÃO marque 'Allow write access')"
echo "=============================================================="
cat "$DIR/id_ed25519.pub"
echo "=============================================================="
echo " Depois de cadastrar, teste com:"
echo "   sudo -u legislagov git -C $APP fetch origin main && echo OK"
echo " Se aparecer OK, já pode deixar o repositório privado."
