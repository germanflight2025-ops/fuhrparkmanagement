# Fuhrparkmanagement

Lauffaehige MVP-Webanwendung mit:

- Node.js + Express
- JSON-Datenhaltung fuer schnelle lokale Nutzung und Demo-Betrieb
- Rollenlogik fuer Hauptadmin, Admin und Benutzer
- Standortfilter im Backend
- Fahrzeuge, Werkstatt, Schaeden, UVV
- Dashboard, Suche, CSV-Import und CSV-Export, Bildupload, PDF-Export

## Lokal starten

```bash
npm install
npm start
```

Dann im Browser oeffnen:

- http://localhost:3000

## Demo-Zugaenge

- Hauptadmin: `admin@fuhrpark.local` / `Admin123!`
- Admin Frankfurt: `frankfurt@fuhrpark.local` / `Admin123!`
- Benutzer Frankfurt: `user@fuhrpark.local` / `User123!`

## Kostenlos auf Render hochladen

1. Projekt in ein Git-Repository legen und zu GitHub hochladen.
2. Bei Render einen neuen `Web Service` anlegen.
3. Das GitHub-Repository verbinden.
4. Falls Render die Werte nicht automatisch erkennt:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Deploy starten.

Alternativ kann Render die Datei `render.yaml` direkt verwenden.

## Wichtiger Hinweis zu Render

Diese Version speichert Daten aktuell in `data/db.json`. Das ist fuer eine Demo gut, aber auf kostenlosen Hostern nicht dauerhaft sicher. Nach einem neuen Deploy oder Server-Neustart koennen lokale Dateien verloren gehen. Fuer echten Dauerbetrieb sollte spaeter auf PostgreSQL umgestellt werden.

## Wichtige Dateien fuer Hosting

- `server.js`
- `package.json`
- `render.yaml`
- `data/db.json`
