#!/usr/bin/env bash
# Pull the latest code, rebuild the frontend and restart. Usage: sudo bash deploy/update.sh
set -euo pipefail
sudo -u backlot git -C /opt/backlot pull --ff-only
sudo -u backlot bash -c 'cd /opt/backlot/backend && npm ci --no-audit --no-fund'
sudo -u backlot bash -c 'cd /opt/backlot/frontend && npm ci --no-audit --no-fund && npm run build'
systemctl restart backlot
sleep 2 && curl -fsS http://127.0.0.1:3001/api/health && echo
