const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const root = path.join(__dirname, '..');
const dataPath = path.join(root, 'data', 'db.json');
const schemaPath = path.join(root, 'db', 'postgres-schema.sql');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(name + ' fehlt. Bitte in .env oder als Umgebungsvariable setzen.');
  }
  return value;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeUsername(user) {
  const fromEmail = String(user.email || '').split('@')[0].trim().toLowerCase();
  const fromName = String(user.name || '').trim().toLowerCase().replace(/\s+/g, '');
  return String(user.benutzername || '').trim() || fromEmail || fromName || ('user' + user.id);
}

async function insertRows(client, table, columns, rows) {
  if (!rows.length) return;
  const placeholders = columns.map((_, index) => '$' + (index + 1)).join(', ');
  const sql = 'INSERT INTO ' + table + ' (' + columns.join(', ') + ') VALUES (' + placeholders + ')';
  for (const row of rows) {
    const values = columns.map((column) => { const value = row[column]; return value === '' || typeof value === 'undefined' ? null : value; });
    await client.query(sql, values);
  }
}

async function main() {
  const databaseUrl = requireEnv('DATABASE_URL');
  const data = readJson(dataPath);
  data.benutzer = (data.benutzer || []).map((user) => ({ ...user, benutzername: normalizeUsername(user) }));
  const schemaSql = fs.readFileSync(schemaPath, 'utf8').replace(/^\uFEFF/, '');

  const client = new Client({
    connectionString: databaseUrl,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(schemaSql);
    await client.query('TRUNCATE uvv_checkpunkte, uvv_pruefungen, schaeden, werkstatt, werkstatt_bereiche, fahrzeuge, benutzer, standorte RESTART IDENTITY CASCADE');

    await insertRows(client, 'standorte', ['id', 'name', 'created_at'], data.standorte || []);
    await insertRows(client, 'benutzer', ['id', 'benutzername', 'name', 'email', 'passwort_hash', 'rolle', 'standort_id', 'aktiv', 'created_at'], data.benutzer || []);
    await insertRows(client, 'fahrzeuge', ['id', 'kennzeichen', 'fahrzeug', 'standort_id', 'status', 'hu_datum', 'uvv_datum', 'fahrzeugschein_pdf', 'created_at'], data.fahrzeuge || []);
    await insertRows(client, 'werkstatt_bereiche', ['id', 'standort_id', 'slot', 'name', 'created_at'], data.workshop_bereiche || []);
    await insertRows(client, 'werkstatt', ['id', 'fahrzeug_id', 'workshop_slot', 'werkstatt_name', 'positionsnummer', 'problem', 'pruefzeichen', 'status_datum', 'datum_von', 'datum_bis', 'tage', 'beschreibung', 'status', 'created_at'], data.werkstatt || []);
    await insertRows(client, 'schaeden', ['id', 'fahrzeug_id', 'fahrer_name', 'fahrer_telefon', 'beschreibung', 'unfallgegner_name', 'unfallgegner_kennzeichen', 'versicherung', 'telefon', 'foto', 'datum', 'status', 'polizei_vor_ort', 'verletzte', 'vu_nummer', 'created_by', 'created_at'], data.schaeden || []);
    await insertRows(client, 'uvv_pruefungen', ['id', 'fahrzeug_id', 'pruefer', 'datum', 'naechste_pruefung_datum', 'kommentar', 'created_at'], data.uvv_pruefungen || []);
    await insertRows(client, 'uvv_checkpunkte', ['id', 'uvv_pruefung_id', 'punkt_nr', 'punkt_name', 'status', 'kommentar'], data.uvv_checkpunkte || []);

    await client.query('COMMIT');
    console.log('PostgreSQL Import erfolgreich abgeschlossen.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('PostgreSQL Import fehlgeschlagen:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
