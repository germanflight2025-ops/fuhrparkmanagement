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

## PostgreSQL Vorbereitung

Diese Projektversion bleibt aktuell weiter auf `data/db.json` lauffaehig, ist aber jetzt fuer den naechsten Schritt Richtung Firmenbetrieb vorbereitet.

Neu im Projekt:

- `.env.example` mit `DATABASE_URL`
- `db/postgres-schema.sql` mit dem Tabellenmodell
- `scripts/import-json-to-postgres.js` fuer den Import aus der JSON-Demo-Datenbank
- neues npm-Skript: `npm run pg:import`

### Empfohlener Ablauf fuer die Umstellung

1. PostgreSQL lokal oder auf dem Server bereitstellen.
2. `.env.example` nach `.env` kopieren und `DATABASE_URL` anpassen.
3. Abhaengigkeit installieren:
   - `npm install`
4. Schema in PostgreSQL einspielen:
   - Inhalt aus `db/postgres-schema.sql` ausfuehren
5. Bestehende JSON-Daten importieren:
   - `npm run pg:import`

### Wichtiger Hinweis

Die App liest aktuell zur Laufzeit noch aus der JSON-Datei. Mit den neuen Dateien ist jetzt aber der technische Unterbau fuer die saubere Umstellung vorbereitet, ohne die laufende Demo-Version zu riskieren.
