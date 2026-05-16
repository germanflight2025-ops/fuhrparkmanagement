#!/bin/bash
# ================================================================
#  FleetControl24 - Server Setup Script
#  Ubuntu 22.04 | STRATO VPS 212.227.45.117
#  Einmaliges Ausführen als root genügt.
# ================================================================
set -e

# ── Farben ────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()     { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# ── Konfiguration ─────────────────────────────────────────────
APP_DIR="/var/www/fleetcontrol24"
APP_REPO="https://github.com/germanflight2025-ops/fuhrparkmanagement.git"
APP_BRANCH="main"
APP_PORT="3000"
SERVER_IP="212.227.45.117"

DB_NAME="fleetcontrol24"
DB_USER="fleetcontrol24"
DB_PASS="$(openssl rand -hex 20)"

JWT_SECRET="$(openssl rand -hex 32)"

# ── Banner ────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   FleetControl24 – Server Setup              ║${NC}"
echo -e "${BLUE}║   Ubuntu 22.04  |  212.227.45.117            ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. System Update ─────────────────────────────────────────
info "System wird aktualisiert..."
apt-get update -qq && apt-get upgrade -y -qq
apt-get install -y -qq curl wget git ufw nginx postgresql postgresql-contrib
success "System aktualisiert"

# ── 2. Node.js 20 (LTS) ──────────────────────────────────────
if ! command -v node &>/dev/null; then
  info "Node.js 20 LTS wird installiert..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
  success "Node.js $(node -v) installiert"
else
  success "Node.js bereits vorhanden: $(node -v)"
fi

# ── 3. PM2 ───────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "PM2 wird installiert..."
  npm install -g pm2 --silent
  success "PM2 $(pm2 -v) installiert"
else
  success "PM2 bereits vorhanden"
fi

# ── 4. PostgreSQL Datenbank einrichten ───────────────────────
info "PostgreSQL-Datenbank wird eingerichtet..."
systemctl start postgresql
systemctl enable postgresql

# Benutzer und Datenbank anlegen (falls noch nicht vorhanden)
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
success "Datenbank '${DB_NAME}' bereit"

# ── 5. App-Verzeichnis & Code ─────────────────────────────────
info "Repository wird geklont..."
mkdir -p "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
  warn "Repo existiert bereits — wird aktualisiert (git pull)"
  cd "$APP_DIR"
  git fetch origin
  git reset --hard "origin/$APP_BRANCH"
else
  git clone --branch "$APP_BRANCH" "$APP_REPO" "$APP_DIR"
fi
success "Code in $APP_DIR"

# ── 6. .env erstellen ─────────────────────────────────────────
info ".env wird geschrieben..."
cat > "$APP_DIR/.env" <<EOF
PORT=${APP_PORT}
JWT_SECRET=${JWT_SECRET}
DATABASE_URL=postgres://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
PGSSLMODE=disable
NODE_ENV=production
EOF
chmod 600 "$APP_DIR/.env"
success ".env erstellt"

# ── 7. npm install ────────────────────────────────────────────
info "npm-Abhängigkeiten werden installiert..."
cd "$APP_DIR"
npm install --omit=dev --silent
success "npm install abgeschlossen"

# ── 8. PM2 Ecosystem Config ───────────────────────────────────
info "PM2-Konfiguration wird geschrieben..."
cat > "$APP_DIR/ecosystem.config.js" <<'EOF'
module.exports = {
  apps: [{
    name:        'fleetcontrol24',
    script:      'server.js',
    cwd:         '/var/www/fleetcontrol24',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '512M',
    env: {
      NODE_ENV: 'production'
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file:  '/var/log/fleetcontrol24/error.log',
    out_file:    '/var/log/fleetcontrol24/out.log',
    merge_logs:  true
  }]
};
EOF

mkdir -p /var/log/fleetcontrol24
success "PM2-Konfiguration erstellt"

# ── 9. App starten / neustarten ───────────────────────────────
info "App wird gestartet..."
cd "$APP_DIR"
pm2 delete fleetcontrol24 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
success "App läuft unter Port $APP_PORT"

# ── 10. PM2 Autostart beim Booten ─────────────────────────────
info "PM2-Autostart wird eingerichtet..."
pm2 startup systemd -u root --hp /root | tail -1 | bash || true
pm2 save
success "PM2 startet automatisch beim Reboot"

# ── 11. Nginx als Reverse Proxy ───────────────────────────────
info "Nginx wird konfiguriert..."
cat > /etc/nginx/sites-available/fleetcontrol24 <<EOF
server {
    listen 80;
    server_name ${SERVER_IP};

    # Gzip
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;
    gzip_min_length 1024;

    # Upload-Limit (Dokumenten-Upload)
    client_max_body_size 25M;

    # Statische Dateien direkt über Nginx (schneller)
    location /uploads/ {
        alias /var/www/fleetcontrol24/public/uploads/;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location /css/ {
        alias /var/www/fleetcontrol24/public/css/;
        expires 1d;
    }

    location /js/ {
        alias /var/www/fleetcontrol24/public/js/;
        expires 1d;
    }

    # Alles andere an Node.js
    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
    }
}
EOF

# Default-Site deaktivieren, unsere aktivieren
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/fleetcontrol24 /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
success "Nginx konfiguriert und geladen"

# ── 12. Firewall (UFW) ────────────────────────────────────────
info "Firewall wird konfiguriert..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
success "Firewall aktiv (SSH + HTTP + HTTPS freigegeben)"

# ── 13. Credentials sichern ───────────────────────────────────
CRED_FILE="/root/fleetcontrol24-credentials.txt"
cat > "$CRED_FILE" <<EOF
═══════════════════════════════════════════════
  FleetControl24 – Server-Zugangsdaten
  Erstellt: $(date)
═══════════════════════════════════════════════

  App-URL:       http://${SERVER_IP}
  App-Port:      ${APP_PORT}

  DB Name:       ${DB_NAME}
  DB Benutzer:   ${DB_USER}
  DB Passwort:   ${DB_PASS}

  JWT Secret:    ${JWT_SECRET}

  App-Verzeichnis: ${APP_DIR}
  Logs:            /var/log/fleetcontrol24/

═══════════════════════════════════════════════
  Nützliche Befehle:
  pm2 status                  – App-Status
  pm2 logs fleetcontrol24     – Live-Logs
  pm2 restart fleetcontrol24  – App neu starten
  systemctl status nginx      – Nginx-Status
═══════════════════════════════════════════════
EOF
chmod 600 "$CRED_FILE"

# ── Zusammenfassung ───────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   Setup abgeschlossen!                       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}App erreichbar unter:${NC}  http://${SERVER_IP}"
echo -e "  ${CYAN}App-Status:${NC}             $(pm2 show fleetcontrol24 | grep status | head -1)"
echo -e "  ${CYAN}Zugangsdaten gespeichert:${NC} $CRED_FILE"
echo ""
echo -e "  ${YELLOW}Tipp:${NC} Zugangsdaten sichern und danach löschen:"
echo -e "  ${YELLOW}cat $CRED_FILE && rm $CRED_FILE${NC}"
echo ""
