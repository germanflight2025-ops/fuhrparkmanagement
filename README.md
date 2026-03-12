# Fuhrparkmanagement

Lauffaehige MVP-Webanwendung mit:

- Node.js + Express
- PostgreSQL-vorbereitete Laufzeit mit lokaler Runtime-Datei fuer Demo und Entwicklung
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

Diese Version trennt jetzt feste Seed-Daten in `data/seed.json` von der lokalen Runtime-Datei `data/runtime/db.json`. Das ist fuer eine Demo gut, aber auf kostenlosen Hostern nicht dauerhaft sicher. Nach einem neuen Deploy oder Server-Neustart koennen lokale Dateien verloren gehen. Fuer echten Dauerbetrieb sollte spaeter auf PostgreSQL umgestellt werden.

## Wichtige Dateien fuer Hosting

- `server.js`
- `package.json`
- `render.yaml`
- `data/seed.json`
- `data/runtime/db.json` (lokal erzeugt)

## PostgreSQL Vorbereitung

Diese Projektversion nutzt lokal jetzt `data/runtime/db.json` als Laufzeitdatei und ist fuer den naechsten Schritt Richtung Firmenbetrieb vorbereitet.

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

Die App nutzt lokal jetzt eine getrennte Runtime-Datei und kann mit gesetzter `DATABASE_URL` beim Start aus PostgreSQL bootstrappen. `data/seed.json` bleibt dabei die feste Projektbasis.
