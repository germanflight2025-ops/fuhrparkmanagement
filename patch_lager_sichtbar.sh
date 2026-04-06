#!/usr/bin/env bash
set -euo pipefail

BASE="/var/www/fuhrparkmanagement"
SERVER="$BASE/server.js"
INDEX="$BASE/public/index.html"
APPJS="$BASE/public/js/app.js"

echo "[1/5] Backups anlegen"
cp "$SERVER" "$SERVER.bak.$(date +%s)"
cp "$INDEX" "$INDEX.bak.$(date +%s)"
cp "$APPJS" "$APPJS.bak.$(date +%s)"

echo "[2/5] server.js patchen"
python3 - <<'PY'
from pathlib import Path
server = Path("/var/www/fuhrparkmanagement/server.js")
text = server.read_text(encoding="utf-8", errors="ignore")

# kaputte literal-\n Reparatur
text = text.replace(
    "app_rolle: linkedUser?.rolle || item.app_rolle || 'admin',\\n        rolle_label: displayAppRole(linkedUser?.rolle || item.app_rolle || 'admin'),",
    "app_rolle: linkedUser?.rolle || item.app_rolle || 'admin',\n        rolle_label: displayAppRole(linkedUser?.rolle || item.app_rolle || 'admin'),"
)

routes = """
app.get('/api/lagerorte', authRequired, (req, res) => {
  try {
    const data = readDb();
    const mandantId = Number(req.user.mandant_id || 1);
    const rows = (data.lagerorte || []).filter((item) => Number(item.mandant_id || 0) === mandantId);
    res.json(rows);
  } catch (err) {
    console.error('Fehler Lagerorte:', err);
    res.status(500).json({ error: 'Lagerorte Fehler' });
  }
});

app.get('/api/lagerkategorien', authRequired, (req, res) => {
  try {
    const data = readDb();
    const mandantId = Number(req.user.mandant_id || 1);
    const rows = (data.lagerkategorien || []).filter((item) => Number(item.mandant_id || 0) === mandantId);
    res.json(rows);
  } catch (err) {
    console.error('Fehler Kategorien:', err);
    res.status(500).json({ error: 'Kategorien Fehler' });
  }
});

""".strip() + "\n\n"

if "/api/lagerorte" not in text:
    marker = "app.get('/api/dashboard', authRequired, (req, res) => {"
    if marker in text:
        text = text.replace(marker, routes + marker, 1)
    else:
        raise SystemExit("Marker für API-Routen nicht gefunden.")

server.write_text(text, encoding="utf-8")
print("server.js aktualisiert")
PY

echo "[3/5] index.html patchen"
python3 - <<'PY'
from pathlib import Path
p = Path("/var/www/fuhrparkmanagement/public/index.html")
text = p.read_text(encoding="utf-8", errors="ignore")

if 'data-view="lager"' not in text:
    if '<button class="nav-link" data-view="werkstatt">Werkstatt</button>' in text:
        text = text.replace(
            '<button class="nav-link" data-view="werkstatt">Werkstatt</button>',
            '<button class="nav-link" data-view="werkstatt">Werkstatt</button>\n<button class="nav-link" data-view="lager">Lager</button>',
            1
        )
    elif '<a class="nav-link" data-view="werkstatt">Werkstatt</a>' in text:
        text = text.replace(
            '<a class="nav-link" data-view="werkstatt">Werkstatt</a>',
            '<a class="nav-link" data-view="werkstatt">Werkstatt</a>\n<a class="nav-link" data-view="lager">Lager</a>',
            1
        )

# sichtbare Textfehler
for old, new in {
    'UVV-Prï¿½fungen': 'UVV-Prüfungen',
    'UVV-Pr�fungen': 'UVV-Prüfungen',
    'Fuehrerscheinkontrolle': 'Führerscheinkontrolle',
    'Schaeden': 'Schäden',
    'Loeschen': 'Löschen',
}.items():
    text = text.replace(old, new)

if '<meta charset="UTF-8">' not in text and '<meta charset="utf-8">' not in text.lower():
    if '<head>' in text:
        text = text.replace('<head>', '<head>\n  <meta charset="UTF-8">', 1)

p.write_text(text, encoding="utf-8")
print("index.html aktualisiert")
PY

echo "[4/5] app.js patchen"
python3 - <<'PY'
from pathlib import Path
p = Path("/var/www/fuhrparkmanagement/public/js/app.js")
text = p.read_text(encoding="utf-8", errors="ignore")

for old, new in {
    'UVV-Prï¿½fungen': 'UVV-Prüfungen',
    'UVV-Pr�fungen': 'UVV-Prüfungen',
    'Fuehrerscheinkontrolle': 'Führerscheinkontrolle',
    'Schaeden': 'Schäden',
    'Loeschen': 'Löschen',
}.items():
    text = text.replace(old, new)

if "async function renderLagerView(content)" not in text:
    block = r"""
async function renderLagerView(content) {
  content.innerHTML = `
    <section class="card">
      <div class="card-header">
        <div>
          <p class="eyebrow">Lagerverwaltung</p>
          <h2>Hauptlager</h2>
        </div>
      </div>
      <div class="grid cols-2">
        <div class="card">
          <h3>Lagerorte</h3>
          <div id="lagerorte-list">Lade Lagerorte ...</div>
        </div>
        <div class="card">
          <h3>Kategorien</h3>
          <div id="lagerkategorien-list">Lade Kategorien ...</div>
        </div>
      </div>
    </section>
  `;

  try {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    const [lagerorteRes, lagerkategorienRes] = await Promise.all([
      fetch('/api/lagerorte', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/lagerkategorien', { headers: { Authorization: `Bearer ${token}` } })
    ]);

    const lagerorte = lagerorteRes.ok ? await lagerorteRes.json() : [];
    const lagerkategorien = lagerkategorienRes.ok ? await lagerkategorienRes.json() : [];

    const lagerorteList = document.getElementById('lagerorte-list');
    const kategorienList = document.getElementById('lagerkategorien-list');

    if (lagerorteList) {
      lagerorteList.innerHTML = lagerorte.length
        ? `<ul>${lagerorte.map((x) => `<li>${x.name || '-'}</li>`).join('')}</ul>`
        : '<p>Keine Lagerorte vorhanden.</p>';
    }

    if (kategorienList) {
      kategorienList.innerHTML = lagerkategorien.length
        ? `<ul>${lagerkategorien.map((x) => `<li>${x.name || '-'}</li>`).join('')}</ul>`
        : '<p>Keine Kategorien vorhanden.</p>';
    }
  } catch (error) {
    const lagerorteList = document.getElementById('lagerorte-list');
    const kategorienList = document.getElementById('lagerkategorien-list');
    if (lagerorteList) lagerorteList.innerHTML = `<p>Fehler beim Laden der Lagerorte: ${error.message}</p>`;
    if (kategorienList) kategorienList.innerHTML = `<p>Fehler beim Laden der Kategorien: ${error.message}</p>`;
  }
}
""".strip() + "\n\n"
    text = block + text

if "view === 'lager'" not in text:
    if "if (view === 'werkstatt') {" in text:
        text = text.replace(
            "if (view === 'werkstatt') {",
            "if (view === 'lager') {\n    return renderLagerView(content);\n  }\n\n  if (view === 'werkstatt') {",
            1
        )
    elif "switch (view)" in text and "case 'werkstatt':" in text:
        text = text.replace(
            "case 'werkstatt':",
            "case 'lager':\n      return renderLagerView(content);\n    case 'werkstatt':",
            1
        )
    else:
        text += r"""

document.addEventListener('click', async (event) => {
  const nav = event.target.closest('[data-view="lager"]');
  if (!nav) return;
  const content = document.querySelector('#content, main, .content');
  if (content) {
    event.preventDefault();
    await renderLagerView(content);
  }
});
"""

p.write_text(text, encoding="utf-8")
print("app.js aktualisiert")
PY

echo "[5/5] Syntax prüfen und Neustart"
node --check "$SERVER"
pm2 restart fuhrpark
pm2 logs fuhrpark --lines 20 --nostream || true

echo "Fertig. Bitte Browser komplett schließen und mit Strg+F5 neu laden."
