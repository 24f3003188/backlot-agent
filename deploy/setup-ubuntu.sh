#!/usr/bin/env bash
# One-time setup for Ubuntu 24.04 LTS (arm64 or x86_64) on EC2.
# Usage: sudo BACKLOT_DOMAIN=<host> REPO_URL=<git url> bash deploy/setup-ubuntu.sh
set -euo pipefail

: "${BACKLOT_DOMAIN:?Set BACKLOT_DOMAIN, e.g. 13-54-1-2.sslip.io}"
: "${REPO_URL:?Set REPO_URL, e.g. https://github.com/<you>/backlot.git}"

echo "==> System packages"
apt-get update -y
apt-get install -y curl git debian-keyring debian-archive-keyring apt-transport-https gnupg

echo "==> 1 GB swap (keeps builds safe on 2 GB instances)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Node.js 22"
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> Caddy"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "==> App user and code"
id backlot >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin backlot
if [ ! -d /opt/backlot/.git ]; then
  git clone "$REPO_URL" /opt/backlot
else
  git -C /opt/backlot pull --ff-only
fi
mkdir -p /opt/backlot/backend/preset-cache

if [ ! -f /opt/backlot/backend/.env ]; then
  cp /opt/backlot/backend/.env.example /opt/backlot/backend/.env
  echo "!! Created /opt/backlot/backend/.env from the example. Fill in QLOO_API_KEY (leave AWS keys empty when using an instance role), then re-run this script."
fi
chown -R backlot:backlot /opt/backlot
chmod 600 /opt/backlot/backend/.env

echo "==> Install and build"
sudo -u backlot bash -c 'cd /opt/backlot/backend && npm ci --no-audit --no-fund'
sudo -u backlot bash -c 'cd /opt/backlot/frontend && npm ci --no-audit --no-fund && npm run build'

echo "==> Services"
cp /opt/backlot/deploy/backlot.service /etc/systemd/system/backlot.service
mkdir -p /etc/systemd/system/caddy.service.d
printf '[Service]\nEnvironment=BACKLOT_DOMAIN=%s\n' "$BACKLOT_DOMAIN" > /etc/systemd/system/caddy.service.d/domain.conf
cp /opt/backlot/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now backlot
systemctl restart caddy

echo "==> Health check"
sleep 3
curl -fsS http://127.0.0.1:3001/api/health && echo
echo "Done. Open https://$BACKLOT_DOMAIN"
