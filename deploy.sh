#!/bin/bash
# ================================================================
#  FleetControl24 – Deploy / Update Script
#  Aktualisiert die laufende App auf dem Server
#  Aufruf: bash deploy.sh
# ================================================================
set -e

APP_DIR="/var/www/fleetcontrol24"
BRANCH="main"

GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[DEPLOY]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }

info "Neuen Code holen..."
cd "$APP_DIR"
git fetch origin
git reset --hard "origin/$BRANCH"

info "Abhängigkeiten aktualisieren..."
npm install --omit=dev --silent

info "App neu starten..."
pm2 restart fleetcontrol24 --update-env
pm2 save

success "Deployment abgeschlossen — App läuft mit neuestem Code"
pm2 show fleetcontrol24 | grep -E "status|uptime|cpu|memory"
