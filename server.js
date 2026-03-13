const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const { Pool } = require('pg');
const { parse } = require('csv-parse/sync');
const { authRequired, requireRoles, signUser } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const dataDir = path.join(__dirname, 'data');
const runtimeDataDir = path.join(dataDir, 'runtime');
const seedFile = path.join(dataDir, 'seed.json');
const dataFile = path.join(runtimeDataDir, 'db.json');
const pgSchemaFile = path.join(__dirname, 'db', 'postgres-schema.sql');
const usePostgres = Boolean(process.env.DATABASE_URL);
const pgPool = usePostgres ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false
}) : null;
let pgSchemaReady = false;
let currentData = null;

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(runtimeDataDir)) fs.mkdirSync(runtimeDataDir, { recursive: true });

const STANDORTE = [
  'Frankfurt', 'Koeln', 'Muenchen', 'Berlin', 'Mannheim', 'Hamburg', 'Stuttgart', 'Duesseldorf', 'Dortmund', 'Essen',
  'Leipzig', 'Bremen', 'Dresden', 'Hannover', 'Nuernberg', 'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld', 'Bonn',
  'Carlswerk'
];
const FAHRZEUG_STATUS = ['aktiv', 'nicht_aktiv', 'pruefung', 'werkstatt', 'schaden'];
const WERKSTATT_STATUS = ['offen', 'in_bearbeitung', 'abgeschlossen', 'werkstatt', 'nicht_einsatzbereit', 'aktiv', 'zur_pruefung'];
const SCHADEN_STATUS = ['gemeldet', 'in_pruefung', 'freigabe', 'in_reparatur', 'abgeschlossen'];
const CHECKPOINTS = [
  'Beleuchtung', 'Scheibenwischer', 'Spiegel', 'Hupe', 'Bremsen', 'Lenkung', 'Reifen', 'Reifendruck', 'Radmuttern', 'Sitze',
  'Sicherheitsgurte', 'Heizung', 'Aufbauten', 'Abgasanlage', 'Warnweste', 'Verbandskasten', 'Ladungssicherung', 'Schloesser', 'Einbauten', 'Betriebsanleitung'
];
const PRUEFZEICHEN = ['nein', 'ok'];
const WORKSHOP_SLOTS = Array.from({ length: 9 }, (_, index) => index + 1);
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

function nextId(items) {
  return items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeLocationName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function findLocationId(source, name) {
  const standorte = Array.isArray(source)
    ? source
    : Array.isArray(source?.standorte)
      ? source.standorte
      : [];
  return standorte.find((item) => item.name === name)?.id || null;
}

function normalizeStatus(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}
function normalizeLoginValue(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < 8) return 'Passwort muss mindestens 8 Zeichen haben.';
  if (!/[A-Z]/.test(value)) return 'Passwort braucht mindestens einen Grossbuchstaben.';
  if (!/[a-z]/.test(value)) return 'Passwort braucht mindestens einen Kleinbuchstaben.';
  if (!/[0-9]/.test(value)) return 'Passwort braucht mindestens eine Zahl.';
  return null;
}

function findUserConflict(data, benutzername, email, excludeId = null) {
  const normalizedUsername = normalizeLoginValue(benutzername);
  const normalizedEmail = normalizeLoginValue(email);
  return (data.benutzer || []).find((item) => {
    if (excludeId && Number(item.id) === Number(excludeId)) return false;
    return normalizeLoginValue(item.benutzername) === normalizedUsername || normalizeLoginValue(item.email) === normalizedEmail;
  }) || null;
}

function getLoginAttemptState(req, loginValue) {
  const key = [req.ip || 'unknown', normalizeLoginValue(loginValue)].join('|');
  const now = Date.now();
  const existing = loginAttempts.get(key);
  if (!existing || now - existing.firstAttemptAt > LOGIN_WINDOW_MS) {
    const fresh = { key, count: 0, firstAttemptAt: now };
    loginAttempts.set(key, fresh);
    return fresh;
  }
  return existing;
}

function clearLoginAttempts(req, loginValue) {
  const key = [req.ip || 'unknown', normalizeLoginValue(loginValue)].join('|');
  loginAttempts.delete(key);
}

function registerFailedLogin(req, loginValue) {
  const state = getLoginAttemptState(req, loginValue);
  state.count += 1;
  loginAttempts.set(state.key, state);
  return state;
}

function countActiveHauptadmins(data, excludeId = null) {
  return (data.benutzer || []).filter((item) => item.rolle === 'hauptadmin' && Number(item.aktiv) === 1 && (!excludeId || Number(item.id) !== Number(excludeId))).length;
}
function createWorkshopAreas(standorte, existing = []) {
  const now = nowIso();
  const rows = [];
  for (const standort of standorte) {
    for (const slot of WORKSHOP_SLOTS) {
      const match = existing.find((item) => Number(item.standort_id) === Number(standort.id) && Number(item.slot) === slot);
      rows.push({
        id: match?.id || rows.length + 1,
        standort_id: standort.id,
        slot,
        name: match?.name || `Werkstatt ${slot}`,
        created_at: match?.created_at || now
      });
    }
  }
  return rows;
}

function seedData() {
  const standorte = STANDORTE.map((name, index) => ({ id: index + 1, name, created_at: nowIso() }));
  return {
    standorte,
    benutzer: [
      { id: 1, benutzername: 'mweber', name: 'Michael Weber', email: 'admin@fuhrpark.local', passwort_hash: bcrypt.hashSync('Admin123!', 10), rolle: 'hauptadmin', standort_id: findLocationId(standorte, 'Carlswerk'), aktiv: 1, created_at: nowIso() },
      { id: 2, benutzername: 'frankfurtadmin', name: 'Admin Frankfurt', email: 'frankfurt@fuhrpark.local', passwort_hash: bcrypt.hashSync('Admin123!', 10), rolle: 'admin', standort_id: findLocationId(standorte, 'Frankfurt'), aktiv: 1, created_at: nowIso() },
      { id: 3, benutzername: 'frankfurtuser', name: 'Benutzer Frankfurt', email: 'user@fuhrpark.local', passwort_hash: bcrypt.hashSync('User123!', 10), rolle: 'benutzer', standort_id: findLocationId(standorte, 'Frankfurt'), aktiv: 1, created_at: nowIso() }
    ],
    fahrzeuge: [
      { id: 1, kennzeichen: 'F-FM-1001', fahrzeug: 'VW Crafter', standort_id: findLocationId(standorte, 'Frankfurt'), status: 'aktiv', hu_datum: '2026-08-10', uvv_datum: '2026-05-20', created_at: nowIso() },
      { id: 2, kennzeichen: 'K-FM-2002', fahrzeug: 'Mercedes Sprinter', standort_id: findLocationId(standorte, 'Koeln'), status: 'werkstatt', hu_datum: '2026-04-18', uvv_datum: '2026-04-05', created_at: nowIso() },
      { id: 3, kennzeichen: 'M-FM-3003', fahrzeug: 'Ford Transit', standort_id: findLocationId(standorte, 'Muenchen'), status: 'schaden', hu_datum: '2026-03-29', uvv_datum: '2026-03-26', created_at: nowIso() },
      { id: 4, kennzeichen: 'B-FM-4004', fahrzeug: 'Opel Vivaro', standort_id: findLocationId(standorte, 'Berlin'), status: 'aktiv', hu_datum: '2026-09-15', uvv_datum: '2026-06-01', created_at: nowIso() },
      { id: 5, kennzeichen: 'MA-FM-5005', fahrzeug: 'Renault Master', standort_id: findLocationId(standorte, 'Mannheim'), status: 'nicht_einsatzbereit', hu_datum: '2026-03-21', uvv_datum: '2026-03-18', created_at: nowIso() }
    ],
    werkstatt_bereiche: createWorkshopAreas(standorte),
    werkstatt: [
      { id: 1, fahrzeug_id: 2, workshop_slot: 1, werkstatt_name: 'Werkstatt 1', positionsnummer: '675', problem: 'Airbag', pruefzeichen: 'nein', status_datum: '2026-03-03', datum_von: '2026-03-10', datum_bis: '2026-03-14', tage: 4, beschreibung: 'Bremsenpruefung und Oelwechsel', status: 'in_bearbeitung', created_at: nowIso() },
      { id: 2, fahrzeug_id: 3, workshop_slot: 2, werkstatt_name: 'Werkstatt 2', positionsnummer: '1548', problem: 'Unfall', pruefzeichen: 'x', status_datum: '2025-12-29', datum_von: '2026-03-09', datum_bis: '', tage: 0, beschreibung: 'Schadenaufnahme', status: 'werkstatt', created_at: nowIso() }
    ],
    schaeden: [
      { id: 1, fahrzeug_id: 3, fahrer_name: 'Michael Weber', fahrer_telefon: '01701234567', beschreibung: 'Frontschaden nach Parkrempler', unfallgegner_name: 'Max Mustermann', unfallgegner_kennzeichen: 'M-AB-1234', versicherung: 'Allianz', telefon: '01701234567', foto: '', datum: '2026-03-09', status: 'in_pruefung', created_by: 1, created_at: nowIso() }
    ],
    uvv_pruefungen: [
      { id: 1, fahrzeug_id: 1, pruefer: 'Michael Weber', datum: '2026-03-01', naechste_pruefung_datum: '2027-03-01', kommentar: 'Fahrzeug in gutem Zustand', created_at: nowIso() }
    ],
    uvv_checkpunkte: CHECKPOINTS.map((punkt_name, index) => ({ id: index + 1, uvv_pruefung_id: 1, punkt_nr: index + 1, punkt_name, status: 'ok', kommentar: '' }))
  };
}

function ensureSeedFile() {
  if (!fs.existsSync(seedFile)) {
    fs.writeFileSync(seedFile, JSON.stringify(seedData(), null, 2), 'utf8');
  }
}

function ensureDataFile() {
  ensureSeedFile();
  if (!fs.existsSync(dataFile)) {
    const seeded = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    currentData = cloneData(seeded);
    fs.writeFileSync(dataFile, JSON.stringify(seeded, null, 2), 'utf8');
  }
}

function normalizePersistValue(value) {
  return value === '' || typeof value === 'undefined' ? null : value;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizePgValue(key, value) {
  if (value === null || typeof value === 'undefined') return value;
  if (value instanceof Date) {
    return key.endsWith('_at') ? value.toISOString() : value.toISOString().slice(0, 10);
  }
  return value;
}

function normalizePgRows(rows) {
  return rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizePgValue(key, value)])));
}

async function ensurePgSchema() {
  if (!usePostgres || pgSchemaReady) return;
  const schemaSql = fs.readFileSync(pgSchemaFile, 'utf8').replace(/^\uFEFF/, '');
  await pgPool.query(schemaSql);
  pgSchemaReady = true;
}

async function insertPgRows(client, table, columns, rows) {
  if (!rows.length) return;
  const placeholders = columns.map((_, index) => '$' + (index + 1)).join(', ');
  const sql = 'INSERT INTO ' + table + ' (' + columns.join(', ') + ') VALUES (' + placeholders + ')';
  for (const row of rows) {
    const values = columns.map((column) => normalizePersistValue(row[column]));
    await client.query(sql, values);
  }
}

async function loadFromPostgres() {
  await ensurePgSchema();
  const queries = [
    ['standorte', 'SELECT * FROM standorte ORDER BY id'],
    ['benutzer', 'SELECT * FROM benutzer ORDER BY id'],
    ['fahrzeuge', 'SELECT * FROM fahrzeuge ORDER BY id'],
    ['workshop_bereiche', 'SELECT * FROM werkstatt_bereiche ORDER BY id'],
    ['werkstatt', 'SELECT * FROM werkstatt ORDER BY id'],
    ['schaeden', 'SELECT * FROM schaeden ORDER BY id'],
    ['uvv_pruefungen', 'SELECT * FROM uvv_pruefungen ORDER BY id'],
    ['uvv_checkpunkte', 'SELECT * FROM uvv_checkpunkte ORDER BY id']
  ];
  const data = {};
  for (const [key, sql] of queries) {
    const result = await pgPool.query(sql);
    data[key] = normalizePgRows(result.rows);
  }
  return data;
}

function hasPgData(data) {
  return ['standorte', 'benutzer', 'fahrzeuge', 'werkstatt', 'schaeden', 'uvv_pruefungen']
    .some((key) => Array.isArray(data[key]) && data[key].length);
}

async function saveToPostgres(data) {
  await ensurePgSchema();
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE uvv_checkpunkte, uvv_pruefungen, schaeden, werkstatt, werkstatt_bereiche, fahrzeuge, benutzer, standorte RESTART IDENTITY CASCADE');
    await insertPgRows(client, 'standorte', ['id', 'name', 'created_at'], data.standorte || []);
    await insertPgRows(client, 'benutzer', ['id', 'benutzername', 'name', 'email', 'passwort_hash', 'rolle', 'standort_id', 'aktiv', 'created_at'], data.benutzer || []);
    await insertPgRows(client, 'fahrzeuge', ['id', 'kennzeichen', 'fahrzeug', 'standort_id', 'status', 'hu_datum', 'uvv_datum', 'fahrzeugschein_pdf', 'created_at'], data.fahrzeuge || []);
    await insertPgRows(client, 'werkstatt_bereiche', ['id', 'standort_id', 'slot', 'name', 'created_at'], data.workshop_bereiche || []);
    await insertPgRows(client, 'werkstatt', ['id', 'fahrzeug_id', 'workshop_slot', 'werkstatt_name', 'positionsnummer', 'problem', 'pruefzeichen', 'status_datum', 'datum_von', 'datum_bis', 'tage', 'beschreibung', 'status', 'created_at'], data.werkstatt || []);
    await insertPgRows(client, 'schaeden', ['id', 'fahrzeug_id', 'fahrer_name', 'fahrer_telefon', 'beschreibung', 'unfallgegner_name', 'unfallgegner_kennzeichen', 'versicherung', 'telefon', 'foto', 'datum', 'status', 'polizei_vor_ort', 'verletzte', 'vu_nummer', 'created_by', 'created_at'], data.schaeden || []);
    await insertPgRows(client, 'uvv_pruefungen', ['id', 'fahrzeug_id', 'pruefer', 'datum', 'naechste_pruefung_datum', 'kommentar', 'created_at'], data.uvv_pruefungen || []);
    await insertPgRows(client, 'uvv_checkpunkte', ['id', 'uvv_pruefung_id', 'punkt_nr', 'punkt_name', 'status', 'kommentar'], data.uvv_checkpunkte || []);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function syncToPostgres(data) {
  if (!usePostgres) return;
  const payload = JSON.parse(JSON.stringify(data));
  delete payload.__needs_write;
  saveToPostgres(payload).catch((error) => console.error('PostgreSQL Sync fehlgeschlagen:', error.message));
}

async function bootstrapFromPostgres() {
  if (!usePostgres) return;
  const pgData = await loadFromPostgres();
  if (!hasPgData(pgData)) {
    const fallback = readDb();
    writeDb(fallback);
    return;
  }
  const loaded = migrateData(pgData);
  const payload = { ...loaded };
  delete payload.__needs_write;
  currentData = payload;
  fs.writeFileSync(dataFile, JSON.stringify(payload, null, 2), 'utf8');
  if (loaded.__needs_write) await saveToPostgres(payload);
}

function writeDb(data) {
  const payload = cloneData(data);
  delete payload.__needs_write;
  currentData = payload;
  fs.writeFileSync(dataFile, JSON.stringify(payload, null, 2), 'utf8');
  syncToPostgres(payload);
}

function migrateData(data) {
  let changed = false;
  if (!Array.isArray(data.standorte) || data.standorte.length < STANDORTE.length) {
    data.standorte = STANDORTE.map((name, index) => ({ id: index + 1, name, created_at: nowIso() }));
    changed = true;
  }
  data.standorte = data.standorte.map((item, index) => ({ id: index + 1, name: sanitizeLocationName(item.name || STANDORTE[index]), created_at: item.created_at || nowIso() }));
  const workshopBereiche = createWorkshopAreas(data.standorte, data.workshop_bereiche || []);
  if (JSON.stringify(workshopBereiche) !== JSON.stringify(data.workshop_bereiche || [])) changed = true;
  data.workshop_bereiche = workshopBereiche;
  data.benutzer = (data.benutzer || []).map((item) => {
    const benutzername = item.benutzername || String(item.email || item.name || '').split('@')[0].trim().toLowerCase().replace(/\s+/g, '');
    const standort_id = item.rolle === 'hauptadmin' ? (item.standort_id || findLocationId(data, 'Carlswerk')) : item.standort_id;
    const rolle = ['hauptadmin', 'admin', 'benutzer'].includes(item.rolle) ? item.rolle : 'benutzer';
    const aktiv = Number(item.aktiv) ? 1 : 0;
    if (benutzername !== item.benutzername || standort_id !== item.standort_id || rolle !== item.rolle || aktiv !== item.aktiv) changed = true;
    return { ...item, benutzername, standort_id, rolle, aktiv };
  });
  data.fahrzeuge = (data.fahrzeuge || []).map((item) => ({
    ...item,
    status: normalizeStatus({ verfuegbar: 'aktiv', ausser_betrieb: 'nicht_einsatzbereit' }[item.status] || item.status, FAHRZEUG_STATUS, 'aktiv'),
    fahrzeugschein_pdf: item.fahrzeugschein_pdf || '',
    created_at: item.created_at || nowIso()
  }));
  data.werkstatt = (data.werkstatt || []).map((item) => {
    const workshop_slot = Number(item.workshop_slot) || 1;
    const vehicle = (data.fahrzeuge || []).find((entry) => entry.id === item.fahrzeug_id);
    return {
      ...item,
      workshop_slot,
      werkstatt_name: workshopAreaName(data, vehicle?.standort_id, workshop_slot),
      positionsnummer: item.positionsnummer || '',
      problem: item.problem || item.beschreibung || '',
      pruefzeichen: normalizeStatus(({ x: 'nein', nein: 'nein', ok: 'ok' }[item.pruefzeichen] || item.pruefzeichen || 'nein'), PRUEFZEICHEN, 'nein'),
      status_datum: item.status_datum || item.datum_bis || item.datum_von || '',
      status: normalizeStatus(item.status, WERKSTATT_STATUS, 'offen')
    };
  });
  data.schaeden = (data.schaeden || []).map((item) => ({
    ...item,
    fahrer_name: item.fahrer_name || '',
    fahrer_telefon: item.fahrer_telefon || '',
    polizei_vor_ort: item.polizei_vor_ort || 'nein',
    verletzte: item.verletzte || 'nein',
    vu_nummer: item.vu_nummer || '',
    status: normalizeStatus(item.status, SCHADEN_STATUS, 'gemeldet')
  }));
  data.uvv_pruefungen = (data.uvv_pruefungen || []).map((item) => ({ ...item, naechste_pruefung_datum: item.naechste_pruefung_datum || plusOneYear(item.datum) }));
  data.uvv_checkpunkte = data.uvv_checkpunkte || [];
  data.__needs_write = changed;
  return data;
}

function readDb() {
  ensureDataFile();
  if (!currentData) {
    currentData = migrateData(JSON.parse(fs.readFileSync(dataFile, 'utf8')));
  }
  return cloneData(currentData);
}

function locationName(data, id) {
  return data.standorte.find((item) => item.id === id)?.name || '';
}

function selectedStandortId(req, user) {
  if (user.rolle !== 'hauptadmin') return user.standort_id;
  const id = Number(req.query.standort_id || req.body?.standort_id || '');
  return Number.isFinite(id) && id > 0 ? id : null;
}

function filterByStandort(data, items, user, req, mapper) {
  const chosen = selectedStandortId(req, user);
  const filtered = items.filter((item) => {
    if (user.rolle === 'hauptadmin') return chosen ? mapper(item) === chosen : true;
    return mapper(item) === user.standort_id;
  });
  return filtered;
}

function plusOneYear(dateText) {
  if (!dateText) return '';
  const date = new Date(dateText);
  if (Number.isNaN(date.getTime())) return '';
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function daysUntil(dateText) {
  if (!dateText) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(dateText);
  return Math.ceil((date - today) / 86400000);
}

function workshopDays(datumVon, datumBis) {
  if (!datumVon || !datumBis) return 0;
  const start = new Date(`${datumVon}T00:00:00`);
  const end = new Date(`${datumBis}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}


function workshopAreaName(data, standortId, slot) {
  return (data.workshop_bereiche || []).find((item) => Number(item.standort_id) === Number(standortId) && Number(item.slot) === Number(slot))?.name || `Werkstatt ${slot}`;
}

function nextWorkshopNumber(items) {
  const numbers = items
    .map((item) => String(item.positionsnummer || '').trim())
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  return String(numbers.length ? Math.max(...numbers) + 1 : 1);
}
function vehicleWithLocation(data, vehicle) {
  return {
    ...vehicle,
    standort: locationName(data, vehicle.standort_id),
    fahrzeugschein_pdf: vehicle.fahrzeugschein_pdf || '',
    hu_in_tagen: daysUntil(vehicle.hu_datum),
    uvv_in_tagen: daysUntil(vehicle.uvv_datum)
  };
}

function scopedVehicles(data, user, req) {
  return filterByStandort(data, data.fahrzeuge, user, req, (vehicle) => vehicle.standort_id).map((vehicle) => vehicleWithLocation(data, vehicle));
}

function canAccessVehicle(user, vehicle) {
  return !!vehicle && (user.rolle === 'hauptadmin' || vehicle.standort_id === user.standort_id);
}

function mapWorkshopStatusToVehicleStatus(status) {
  const mapping = {
    aktiv: 'aktiv',
    werkstatt: 'werkstatt',
    nicht_einsatzbereit: 'nicht_aktiv',
    zur_pruefung: 'pruefung',
    in_bearbeitung: 'werkstatt',
    offen: 'werkstatt',
    abgeschlossen: 'aktiv'
  };
  return mapping[status] || 'werkstatt';
}

function visibleViewsForRole(role) {
  if (role === 'benutzer') return ['schaeden'];
  return ['dashboard', 'fahrzeuge', 'werkstatt', 'schaeden', 'uvv', 'benutzer', 'standorte', 'statistik', 'suche', 'import', 'impressum'];
}

function assertAllowedStatus(value, allowed) {
  if (!allowed.includes(value)) {
    const error = new Error('Ungueltiger Status.');
    error.statusCode = 400;
    throw error;
  }
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Nur Bilddateien erlaubt.'));
    cb(null, true);
  }
});
const uploadPdf = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') return cb(new Error('Nur PDF-Dateien erlaubt.'));
    cb(null, true);
  }
});

app.get('/api/meta', authRequired, (req, res) => {
  const data = readDb();
  res.json({
    standorte: data.standorte,
    fahrzeugStatus: FAHRZEUG_STATUS,
    werkstattStatus: WERKSTATT_STATUS,
    workshopSlots: WORKSHOP_SLOTS,
    schadenStatus: SCHADEN_STATUS,
    pruefzeichen: PRUEFZEICHEN,
    uvvCheckpoints: CHECKPOINTS,
    visibleViews: visibleViewsForRole(req.user.rolle),
    selectedStandortId: selectedStandortId(req, req.user)
  });
});

app.post('/api/auth/login', (req, res) => {
  const data = readDb();
  const loginValue = normalizeLoginValue(req.body.login || req.body.email || '');
  if (!loginValue || !String(req.body.passwort || '')) {
    return res.status(400).json({ error: 'Benutzername und Passwort sind Pflicht.' });
  }
  const state = getLoginAttemptState(req, loginValue);
  if (state.count >= MAX_LOGIN_ATTEMPTS) {
    return res.status(429).json({ error: 'Zu viele Fehlversuche. Bitte spaeter erneut versuchen.' });
  }
  const user = data.benutzer.find((entry) => entry.aktiv && (normalizeLoginValue(entry.benutzername) === loginValue || normalizeLoginValue(entry.email) === loginValue));
  if (!user || !bcrypt.compareSync(req.body.passwort || '', user.passwort_hash)) {
    registerFailedLogin(req, loginValue);
    return res.status(401).json({ error: 'Benutzername oder Passwort ist falsch.' });
  }
  clearLoginAttempts(req, loginValue);
  const payload = { ...user, standort: user.standort_id ? locationName(data, user.standort_id) : null };
  delete payload.passwort_hash;
  res.json({ token: signUser(payload), user: payload });
});

app.get('/api/auth/me', authRequired, (req, res) => res.json(req.user));
app.get('/api/demo-credentials', (req, res) => res.json([
  { rolle: 'Hauptadmin', email: 'admin@fuhrpark.local', passwort: 'Admin123!' },
  { rolle: 'Admin Frankfurt', email: 'frankfurt@fuhrpark.local', passwort: 'Admin123!' },
  { rolle: 'Benutzer Frankfurt', email: 'user@fuhrpark.local', passwort: 'User123!' }
]));

app.get('/api/standorte', authRequired, (req, res) => res.json(readDb().standorte));
app.post('/api/standorte', authRequired, requireRoles('hauptadmin'), (req, res) => {
  const data = readDb();
  const row = { id: nextId(data.standorte), name: sanitizeLocationName(req.body.name), created_at: nowIso() };
  data.standorte.push(row);
  writeDb(data);
  res.json(row);
});
app.put('/api/standorte/:id', authRequired, requireRoles('hauptadmin'), (req, res) => {
  const data = readDb();
  const row = data.standorte.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Standort nicht gefunden.' });
  row.name = sanitizeLocationName(req.body.name || row.name);
  writeDb(data);
  res.json(row);
});
app.delete('/api/standorte/:id', authRequired, requireRoles('hauptadmin'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  if (data.benutzer.some((item) => item.standort_id === id) || data.fahrzeuge.some((item) => item.standort_id === id)) {
    return res.status(400).json({ error: 'Standort hat noch Benutzer oder Fahrzeuge und kann nicht geloescht werden.' });
  }
  data.standorte = data.standorte.filter((item) => item.id !== id);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/benutzer', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const rows = data.benutzer
    .filter((item) => req.user.rolle === 'hauptadmin' ? (selectedStandortId(req, req.user) ? item.standort_id === selectedStandortId(req, req.user) : true) : item.standort_id === req.user.standort_id)
    .map((item) => ({ ...item, standort: item.standort_id ? locationName(data, item.standort_id) : null, passwort_hash: undefined }));
  res.json(rows);
});
app.post('/api/benutzer', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const requestedStandortId = Number(req.body.standort_id) || null;
  const rolle = req.user.rolle === 'hauptadmin' ? req.body.rolle : (req.body.rolle === 'hauptadmin' ? 'admin' : req.body.rolle);
  const standort_id = rolle === 'hauptadmin' ? (requestedStandortId || findLocationId(data, 'Carlswerk')) : (req.user.rolle === 'hauptadmin' ? requestedStandortId : req.user.standort_id);
  const benutzername = String(req.body.benutzername || '').trim();
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim();
  const passwort = String(req.body.passwort || '');
  if (!benutzername || !name || !email) {
    return res.status(400).json({ error: 'Benutzername, Name und E-Mail sind Pflicht.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Bitte eine gueltige E-Mail angeben.' });
  }
  const passwordError = validatePasswordStrength(passwort);
  if (passwordError) {
    return res.status(400).json({ error: passwordError });
  }
  if (findUserConflict(data, benutzername, email)) {
    return res.status(400).json({ error: 'Benutzername oder E-Mail ist bereits vergeben.' });
  }
  const row = { id: nextId(data.benutzer), benutzername, name, email, passwort_hash: bcrypt.hashSync(passwort, 10), rolle, standort_id, aktiv: 1, created_at: nowIso() };
  data.benutzer.push(row);
  writeDb(data);
  res.json({ ...row, passwort_hash: undefined, standort: standort_id ? locationName(data, standort_id) : null });
});
app.put('/api/benutzer/:id', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const row = data.benutzer.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  if (req.user.rolle !== 'hauptadmin' && row.standort_id !== req.user.standort_id) return res.status(403).json({ error: 'Kein Zugriff auf diesen Benutzer.' });
  const nextBenutzername = String(req.body.benutzername || row.benutzername || '').trim();
  const nextName = String(req.body.name || row.name || '').trim();
  const nextEmail = String(req.body.email || row.email || '').trim();
  if (!nextBenutzername || !nextName || !nextEmail) {
    return res.status(400).json({ error: 'Benutzername, Name und E-Mail sind Pflicht.' });
  }
  if (!isValidEmail(nextEmail)) {
    return res.status(400).json({ error: 'Bitte eine gueltige E-Mail angeben.' });
  }
  if (findUserConflict(data, nextBenutzername, nextEmail, row.id)) {
    return res.status(400).json({ error: 'Benutzername oder E-Mail ist bereits vergeben.' });
  }
  const nextRole = req.user.rolle === 'hauptadmin' ? (req.body.rolle || row.rolle) : row.rolle;
  if (Number(row.id) === Number(req.user.id) && row.rolle === 'hauptadmin' && nextRole !== 'hauptadmin') {
    return res.status(400).json({ error: 'Du kannst deine eigene Hauptadmin-Rolle nicht entfernen.' });
  }
  if (row.rolle === 'hauptadmin' && nextRole !== 'hauptadmin' && countActiveHauptadmins(data, row.id) < 1) {
    return res.status(400).json({ error: 'Der letzte aktive Hauptadmin kann nicht herabgestuft werden.' });
  }
  row.benutzername = nextBenutzername;
  row.name = nextName;
  row.email = nextEmail;
  row.rolle = nextRole;
  row.standort_id = req.user.rolle === 'hauptadmin' ? (nextRole === 'hauptadmin' ? (Number(req.body.standort_id) || findLocationId(data, 'Carlswerk')) : Number(req.body.standort_id) || row.standort_id) : req.user.standort_id;
  if (typeof req.body.aktiv !== 'undefined') {
    const nextAktiv = Number(req.body.aktiv) ? 1 : 0;
    if (Number(row.id) === Number(req.user.id) && nextAktiv === 0) {
      return res.status(400).json({ error: 'Du kannst deinen eigenen Benutzer nicht deaktivieren.' });
    }
    if (row.rolle === 'hauptadmin' && nextAktiv === 0 && countActiveHauptadmins(data, row.id) < 1) {
      return res.status(400).json({ error: 'Der letzte aktive Hauptadmin kann nicht deaktiviert werden.' });
    }
    row.aktiv = nextAktiv;
  }
  if (req.body.passwort) {
    const passwordError = validatePasswordStrength(req.body.passwort);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }
    row.passwort_hash = bcrypt.hashSync(req.body.passwort, 10);
  }
  writeDb(data);
  res.json({ ...row, passwort_hash: undefined, standort: row.standort_id ? locationName(data, row.standort_id) : null });
});

app.delete('/api/benutzer/:id', authRequired, requireRoles('hauptadmin'), (req, res) => {
  const data = readDb();
  const row = data.benutzer.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  if (Number(row.id) === Number(req.user.id)) {
    return res.status(400).json({ error: 'Du kannst deinen eigenen Benutzer nicht loeschen.' });
  }
  if (row.rolle === 'hauptadmin' && countActiveHauptadmins(data, row.id) < 1) {
    return res.status(400).json({ error: 'Der letzte aktive Hauptadmin kann nicht geloescht werden.' });
  }
  data.benutzer = data.benutzer.filter((item) => item.id !== row.id);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/fahrzeuge', authRequired, (req, res) => res.json(scopedVehicles(readDb(), req.user, req)));
app.post('/api/fahrzeuge', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  assertAllowedStatus(req.body.status, FAHRZEUG_STATUS);
  const data = readDb();
  const row = { id: nextId(data.fahrzeuge), kennzeichen: req.body.kennzeichen, fahrzeug: req.body.fahrzeug, standort_id: req.user.rolle === 'hauptadmin' ? Number(req.body.standort_id) : req.user.standort_id, status: req.body.status, hu_datum: req.body.hu_datum, uvv_datum: req.body.uvv_datum, fahrzeugschein_pdf: req.body.fahrzeugschein_pdf || '', created_at: nowIso() };
  data.fahrzeuge.push(row);
  writeDb(data);
  res.json(vehicleWithLocation(data, row));
});
app.put('/api/fahrzeuge/:id', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const row = data.fahrzeuge.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Fahrzeug nicht gefunden.' });
  if (!canAccessVehicle(req.user, row) && req.user.rolle !== 'hauptadmin') return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  if (req.body.status) assertAllowedStatus(req.body.status, FAHRZEUG_STATUS);
  Object.assign(row, {
    kennzeichen: req.body.kennzeichen || row.kennzeichen,
    fahrzeug: req.body.fahrzeug || row.fahrzeug,
    standort_id: req.user.rolle === 'hauptadmin' ? Number(req.body.standort_id) || row.standort_id : req.user.standort_id,
    status: req.body.status || row.status,
    hu_datum: req.body.hu_datum || row.hu_datum,
    uvv_datum: req.body.uvv_datum || row.uvv_datum,
    fahrzeugschein_pdf: req.body.fahrzeugschein_pdf || row.fahrzeugschein_pdf || ''
  });
  writeDb(data);
  res.json(vehicleWithLocation(data, row));
});
app.post('/api/fahrzeuge/:id/upload-fahrzeugschein', authRequired, requireRoles('hauptadmin', 'admin'), uploadPdf.single('fahrzeugschein_pdf'), (req, res) => {
  const data = readDb();
  const row = data.fahrzeuge.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Fahrzeug nicht gefunden.' });
  if (!canAccessVehicle(req.user, row) && req.user.rolle !== 'hauptadmin') return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  row.fahrzeugschein_pdf = `/uploads/${req.file.filename}`;
  writeDb(data);
  res.json({ success: true, fahrzeugschein_pdf: row.fahrzeugschein_pdf });
});

app.delete('/api/fahrzeuge/:id', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const row = data.fahrzeuge.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Fahrzeug nicht gefunden.' });
  if (!canAccessVehicle(req.user, row) && req.user.rolle !== 'hauptadmin') return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  data.fahrzeuge = data.fahrzeuge.filter((item) => item.id !== row.id);
  data.werkstatt = data.werkstatt.filter((item) => item.fahrzeug_id !== row.id);
  data.schaeden = data.schaeden.filter((item) => item.fahrzeug_id !== row.id);
  const uvvIds = data.uvv_pruefungen.filter((item) => item.fahrzeug_id === row.id).map((item) => item.id);
  data.uvv_pruefungen = data.uvv_pruefungen.filter((item) => item.fahrzeug_id !== row.id);
  data.uvv_checkpunkte = data.uvv_checkpunkte.filter((item) => !uvvIds.includes(item.uvv_pruefung_id));
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/werkstatt', authRequired, (req, res) => {
  const data = readDb();
  const rows = data.werkstatt
    .map((item) => ({ ...item, vehicle: data.fahrzeuge.find((f) => f.id === item.fahrzeug_id) }))
    .filter((item) => item.vehicle && filterByStandort(data, [item.vehicle], req.user, req, (vehicle) => vehicle.standort_id).length)
    .map((item) => ({ ...item, kennzeichen: item.vehicle.kennzeichen, fahrzeug: item.vehicle.fahrzeug, standort: locationName(data, item.vehicle.standort_id) }));
  res.json(rows);
});
app.get('/api/werkstatt-bereiche', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const rows = filterByStandort(data, data.workshop_bereiche || [], req.user, req, (item) => item.standort_id);
  res.json(rows);
});
app.put('/api/werkstatt-bereiche/:id', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const row = (data.workshop_bereiche || []).find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Werkstattbereich nicht gefunden.' });
  if (req.user.rolle !== 'hauptadmin' && row.standort_id !== req.user.standort_id) return res.status(403).json({ error: 'Kein Zugriff auf diesen Werkstattbereich.' });
  row.name = String(req.body.name || '').trim() || `Werkstatt ${row.slot}`;
  writeDb(data);
  res.json(row);
});
app.post('/api/werkstatt', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const vehicle = data.fahrzeuge.find((item) => item.id === Number(req.body.fahrzeug_id));
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  assertAllowedStatus(req.body.status, WERKSTATT_STATUS);
  const row = {
    id: nextId(data.werkstatt),
    fahrzeug_id: vehicle.id,
    workshop_slot: Math.min(Math.max(Number(req.body.workshop_slot) || 1, 1), 9),
    werkstatt_name: workshopAreaName(data, vehicle.standort_id, Math.min(Math.max(Number(req.body.workshop_slot) || 1, 1), 9)),
    positionsnummer: String(req.body.positionsnummer || '').trim() || nextWorkshopNumber(data.werkstatt),
    problem: req.body.problem || '',
    pruefzeichen: normalizeStatus(({ x: 'nein', nein: 'nein', ok: 'ok' }[req.body.pruefzeichen] || req.body.pruefzeichen || 'nein'), PRUEFZEICHEN, 'nein'),
    status_datum: req.body.status_datum || '',
    datum_von: req.body.datum_von,
    datum_bis: req.body.datum_bis || '',
    tage: workshopDays(req.body.datum_von, req.body.datum_bis),
    beschreibung: req.body.beschreibung || '',
    status: req.body.status,
    created_at: nowIso()
  };
  vehicle.status = mapWorkshopStatusToVehicleStatus(row.status);
  data.werkstatt.push(row);
  writeDb(data);
  res.json(row);
});
app.put('/api/werkstatt/:id', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const row = data.werkstatt.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Werkstattauftrag nicht gefunden.' });
  const vehicle = data.fahrzeuge.find((item) => item.id === row.fahrzeug_id);
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf diesen Auftrag.' });
  if (req.body.status) assertAllowedStatus(req.body.status, WERKSTATT_STATUS);
  row.workshop_slot = Math.min(Math.max(Number(req.body.workshop_slot) || row.workshop_slot || 1, 1), 9);
  row.werkstatt_name = req.body.werkstatt_name || row.werkstatt_name;
  row.positionsnummer = req.body.positionsnummer ?? row.positionsnummer;
  row.problem = req.body.problem ?? row.problem;
  row.pruefzeichen = normalizeStatus(({ x: 'nein', nein: 'nein', ok: 'ok' }[req.body.pruefzeichen] || req.body.pruefzeichen || row.pruefzeichen), PRUEFZEICHEN, row.pruefzeichen);
  row.status_datum = req.body.status_datum ?? row.status_datum;
  row.datum_von = req.body.datum_von || row.datum_von;
  row.datum_bis = typeof req.body.datum_bis !== 'undefined' ? req.body.datum_bis : row.datum_bis;
  row.beschreibung = req.body.beschreibung ?? row.beschreibung;
  row.status = req.body.status || row.status;
  row.tage = workshopDays(row.datum_von, row.datum_bis);
  if (req.body.fahrzeug_status) {
    assertAllowedStatus(req.body.fahrzeug_status, FAHRZEUG_STATUS);
    vehicle.status = req.body.fahrzeug_status;
  } else {
    vehicle.status = mapWorkshopStatusToVehicleStatus(row.status);
  }
  writeDb(data);
  res.json(row);
});

app.delete('/api/werkstatt/:id', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const row = data.werkstatt.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Werkstattauftrag nicht gefunden.' });
  const vehicle = data.fahrzeuge.find((item) => item.id === row.fahrzeug_id);
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf diesen Auftrag.' });
  data.werkstatt = data.werkstatt.filter((item) => item.id !== row.id);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/schaeden', authRequired, (req, res) => {
  const data = readDb();
  const rows = data.schaeden
    .map((item) => ({ ...item, vehicle: data.fahrzeuge.find((f) => f.id === item.fahrzeug_id) }))
    .filter((item) => item.vehicle && filterByStandort(data, [item.vehicle], req.user, req, (vehicle) => vehicle.standort_id).length)
    .map((item) => ({ ...item, kennzeichen: item.vehicle.kennzeichen, fahrzeug: item.vehicle.fahrzeug, standort: locationName(data, item.vehicle.standort_id) }));
  res.json(rows);
});
app.post('/api/schaeden', authRequired, (req, res) => {
  const data = readDb();
  const vehicle = data.fahrzeuge.find((item) => item.id === Number(req.body.fahrzeug_id));
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  const status = req.user.rolle === 'benutzer' ? 'gemeldet' : (req.body.status || 'gemeldet');
  assertAllowedStatus(status, SCHADEN_STATUS);
  const row = {
    id: nextId(data.schaeden),
    fahrzeug_id: vehicle.id,
    fahrer_name: req.body.fahrer_name || '',
    fahrer_telefon: req.body.fahrer_telefon || '',
    polizei_vor_ort: req.body.polizei_vor_ort || 'nein',
    verletzte: req.body.verletzte || 'nein',
    vu_nummer: req.body.vu_nummer || '',
    beschreibung: req.body.beschreibung,
    unfallgegner_name: req.body.unfallgegner_name,
    unfallgegner_kennzeichen: req.body.unfallgegner_kennzeichen,
    versicherung: req.body.versicherung,
    telefon: req.body.telefon,
    foto: '',
    datum: req.body.datum,
    status,
    created_by: req.user.id,
    created_at: nowIso()
  };
  vehicle.status = 'schaden';
  data.schaeden.push(row);
  writeDb(data);
  res.json(row);
});
app.put('/api/schaeden/:id', authRequired, (req, res) => {
  const data = readDb();
  const row = data.schaeden.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Schaden nicht gefunden.' });
  const vehicle = data.fahrzeuge.find((item) => item.id === row.fahrzeug_id);
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf diesen Schaden.' });
  if (req.user.rolle === 'benutzer') return res.status(403).json({ error: 'Benutzer duerfen nur Schaden melden.' });
  if (req.body.status) assertAllowedStatus(req.body.status, SCHADEN_STATUS);
  Object.assign(row, {
    fahrer_name: req.body.fahrer_name || row.fahrer_name,
    fahrer_telefon: req.body.fahrer_telefon || row.fahrer_telefon,
    polizei_vor_ort: req.body.polizei_vor_ort || row.polizei_vor_ort,
    verletzte: req.body.verletzte || row.verletzte,
    vu_nummer: req.body.vu_nummer || row.vu_nummer,
    beschreibung: req.body.beschreibung || row.beschreibung,
    unfallgegner_name: req.body.unfallgegner_name || row.unfallgegner_name,
    unfallgegner_kennzeichen: req.body.unfallgegner_kennzeichen || row.unfallgegner_kennzeichen,
    versicherung: req.body.versicherung || row.versicherung,
    telefon: req.body.telefon || row.telefon,
    datum: req.body.datum || row.datum,
    status: req.body.status || row.status
  });
  if (req.body.fahrzeug_status) {
    assertAllowedStatus(req.body.fahrzeug_status, FAHRZEUG_STATUS);
    vehicle.status = req.body.fahrzeug_status;
  }
  writeDb(data);
  res.json(row);
});
app.post('/api/schaeden/:id/upload', authRequired, upload.single('foto'), (req, res) => {
  const data = readDb();
  const row = data.schaeden.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Schaden nicht gefunden.' });
  const vehicle = data.fahrzeuge.find((item) => item.id === row.fahrzeug_id);
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf diesen Schaden.' });
  row.foto = `/uploads/${req.file.filename}`;
  writeDb(data);
  res.json({ success: true, foto: row.foto });
});

app.get('/api/uvv', authRequired, (req, res) => {
  const data = readDb();
  const rows = data.uvv_pruefungen
    .map((item) => ({ ...item, vehicle: data.fahrzeuge.find((f) => f.id === item.fahrzeug_id) }))
    .filter((item) => item.vehicle && filterByStandort(data, [item.vehicle], req.user, req, (vehicle) => vehicle.standort_id).length)
    .map((item) => ({ ...item, kennzeichen: item.vehicle.kennzeichen, fahrzeug: item.vehicle.fahrzeug, standort: locationName(data, item.vehicle.standort_id), checkpunkte: data.uvv_checkpunkte.filter((point) => point.uvv_pruefung_id === item.id).sort((a, b) => a.punkt_nr - b.punkt_nr) }));
  res.json(rows);
});
app.post('/api/uvv', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const vehicle = data.fahrzeuge.find((item) => item.id === Number(req.body.fahrzeug_id));
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  const checkpunkte = Array.isArray(req.body.checkpunkte) ? req.body.checkpunkte : [];
  if (checkpunkte.length !== 20) return res.status(400).json({ error: 'Es muessen genau 20 UVV-Pruefpunkte uebergeben werden.' });
  const uvvRow = { id: nextId(data.uvv_pruefungen), fahrzeug_id: vehicle.id, pruefer: req.body.pruefer, datum: req.body.datum, naechste_pruefung_datum: req.body.naechste_pruefung_datum || '', kommentar: req.body.kommentar || '', created_at: nowIso() };
  const startId = nextId(data.uvv_checkpunkte);
  const points = checkpunkte.map((point, index) => ({ id: startId + index, uvv_pruefung_id: uvvRow.id, punkt_nr: index + 1, punkt_name: CHECKPOINTS[index], status: point.status === 'nicht_ok' ? 'nicht_ok' : 'ok', kommentar: point.kommentar || '' }));
  vehicle.uvv_datum = uvvRow.naechste_pruefung_datum || uvvRow.datum;
  data.uvv_pruefungen.push(uvvRow);
  data.uvv_checkpunkte.push(...points);
  writeDb(data);
  res.json(uvvRow);
});
app.get('/api/uvv/:id/pdf', authRequired, (req, res) => {
  const data = readDb();
  const uvv = data.uvv_pruefungen.find((item) => item.id === Number(req.params.id));
  if (!uvv) return res.status(404).json({ error: 'UVV-Pruefung nicht gefunden.' });
  const vehicle = data.fahrzeuge.find((item) => item.id === uvv.fahrzeug_id);
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf diese UVV.' });
  const points = data.uvv_checkpunkte.filter((point) => point.uvv_pruefung_id === uvv.id).sort((a, b) => a.punkt_nr - b.punkt_nr);
  const okCount = points.filter((point) => point.status === 'ok').length;
  const notOkCount = points.length - okCount;
  const standortName = locationName(data, vehicle.standort_id) || '-';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename=uvv_${uvv.id}.pdf`);
  const doc = new PDFDocument({ margin: 24, size: "A4", layout: "landscape" });
  doc.pipe(res);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startX = doc.page.margins.left;
  const rightX = doc.page.width - doc.page.margins.right;

  function drawLabelValue(x, y, width, label, value) {
    doc.roundedRect(x, y, width, 34, 6).fillAndStroke("#F8FAFC", "#CBD5E1");
    doc.fillColor("#475569").fontSize(7).font("Helvetica-Bold").text(label.toUpperCase(), x + 8, y + 5, { width: width - 16 });
    doc.fillColor("#0F172A").fontSize(9).font("Helvetica").text(value || "-", x + 8, y + 16, { width: width - 16 });
  }

  function drawTableHeader(y) {
    const cols = [
      { label: "Nr.", x: startX, width: 28 },
      { label: "Pruefpunkt", x: startX + 28, width: 220 },
      { label: "Status", x: startX + 248, width: 62 },
      { label: "Kommentar", x: startX + 310, width: pageWidth - 310 }
    ];
    doc.rect(startX, y, pageWidth, 18).fill("#0F172A");
    cols.forEach((col) => {
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8).text(col.label, col.x + 5, y + 5, { width: col.width - 10 });
    });
    return cols;
  }

  function drawTableRow(y, cols, point, isAlt) {
    const comment = point.kommentar || "-";
    const rowHeight = Math.max(18, doc.heightOfString(comment, { width: cols[3].width - 10, align: "left" }) + 6);
    doc.rect(startX, y, pageWidth, rowHeight).fillAndStroke(isAlt ? "#F8FAFC" : "#EEF2FF", "#CBD5E1");
    doc.fillColor("#0F172A").font("Helvetica").fontSize(8).text(String(point.punkt_nr).padStart(2, "0"), cols[0].x + 4, y + 5, { width: cols[0].width - 8 });
    doc.text(point.punkt_name, cols[1].x + 4, y + 5, { width: cols[1].width - 8 });
    doc.roundedRect(cols[2].x + 5, y + 3, cols[2].width - 10, rowHeight - 6, 6).fill(point.status === "ok" ? "#DCFCE7" : "#FEE2E2");
    doc.fillColor(point.status === "ok" ? "#166534" : "#991B1B").font("Helvetica-Bold").fontSize(8).text(point.status === "ok" ? "OK" : "N.OK", cols[2].x + 8, y + 5, { width: cols[2].width - 16, align: "center" });
    doc.fillColor("#0F172A").font("Helvetica").fontSize(8).text(comment, cols[3].x + 4, y + 5, { width: cols[3].width - 8 });
    return rowHeight;
  }

  doc.rect(0, 0, doc.page.width, 96).fill("#0F172A");
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(22).text("UVV-Pruefprotokoll", startX, 28);
  doc.fontSize(10).font("Helvetica").fillColor("#CBD5E1").text("DGUV V70 Fahrzeugpruefung", startX, 58);
  doc.fontSize(10).text(`Protokoll-Nr.: UVV-${uvv.id}`, rightX - 130, 32, { width: 130, align: "right" });
  doc.text(`Erstellt: ${String(uvv.created_at || nowIso()).slice(0, 10)}`, rightX - 130, 50, { width: 130, align: "right" });

  let y = 116;
  const infoWidth = (pageWidth - 12) / 2;
  drawLabelValue(startX, y, infoWidth, "Fahrzeug", vehicle.fahrzeug);
  drawLabelValue(startX + infoWidth + 12, y, infoWidth, "Kennzeichen", vehicle.kennzeichen);
  y += 42;
  drawLabelValue(startX, y, infoWidth, "Standort", standortName);
  drawLabelValue(startX + infoWidth + 12, y, infoWidth, "Pruefer", uvv.pruefer);
  y += 42;
  drawLabelValue(startX, y, infoWidth, "Pruefdatum", uvv.datum);
  drawLabelValue(startX + infoWidth + 12, y, infoWidth, "Naechste Pruefung", uvv.naechste_pruefung_datum || "-");
  y += 48;

  const summaryWidth = (pageWidth - 24) / 3;
  drawLabelValue(startX, y, summaryWidth, "OK Punkte", String(okCount));
  drawLabelValue(startX + summaryWidth + 12, y, summaryWidth, "Nicht OK Punkte", String(notOkCount));
  drawLabelValue(startX + (summaryWidth + 12) * 2, y, summaryWidth, "Gesamtpunkte", String(points.length));
  y += 42;

  let cols = drawTableHeader(y);
  y += 22;
  points.forEach((point, index) => {
    const estimatedHeight = Math.max(24, doc.heightOfString(point.kommentar || "-", { width: cols[3].width - 12 }) + 10);
    if (y + estimatedHeight > doc.page.height - 110) {
      doc.addPage();
      y = 24;
      cols = drawTableHeader(y);
      y += 18;
    }
    y += drawTableRow(y, cols, point, index % 2 === 0);
  });

  if (y + 54 > doc.page.height - 24) {
    y = doc.page.height - 78;
  }

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#0F172A").text("Gesamtkommentar", startX, y + 6);
  doc.roundedRect(startX + 96, y, pageWidth - 96, 30, 6).fillAndStroke("#F8FAFC", "#CBD5E1");
  doc.font("Helvetica").fontSize(8).fillColor("#0F172A").text(uvv.kommentar || "-", startX + 104, y + 9, { width: pageWidth - 112 });
  y += 42;

  doc.moveTo(startX, y).lineTo(startX + 150, y).strokeColor("#94A3B8").stroke();
  doc.moveTo(rightX - 150, y).lineTo(rightX, y).strokeColor("#94A3B8").stroke();
  doc.fontSize(8).fillColor("#475569").text("Pruefer", startX, y + 4, { width: 150, align: "center" });
  doc.text("Verantwortlicher", rightX - 150, y + 4, { width: 150, align: "center" });
  doc.end();
});

app.get('/api/dashboard', authRequired, (req, res) => {
  const data = readDb();
  const vehicles = scopedVehicles(data, req.user, req);
  const vehicleIds = new Set(vehicles.map((item) => item.id));
  const workshopRows = data.werkstatt
    .filter((item) => vehicleIds.has(item.fahrzeug_id))
    .map((item) => ({ ...item, kennzeichen: data.fahrzeuge.find((vehicle) => vehicle.id === item.fahrzeug_id)?.kennzeichen || '-' }));
  const damageRows = data.schaeden
    .filter((item) => vehicleIds.has(item.fahrzeug_id))
    .map((item) => ({ ...item, kennzeichen: data.fahrzeuge.find((vehicle) => vehicle.id === item.fahrzeug_id)?.kennzeichen || '-' }));
  const counts = {
    fahrzeuge: vehicles.length,
    werkstatt: workshopRows.length,
    schaeden: damageRows.length,
    uvvFaellig: vehicles.filter((item) => item.uvv_in_tagen !== null && item.uvv_in_tagen < 30).length,
    huFaellig: vehicles.filter((item) => item.hu_in_tagen !== null && item.hu_in_tagen < 30).length
  };
  const locationMap = {};
  vehicles.forEach((item) => { locationMap[item.standort] = (locationMap[item.standort] || 0) + 1; });
  const reminders = vehicles.filter((item) => (item.hu_in_tagen !== null && item.hu_in_tagen < 30) || (item.uvv_in_tagen !== null && item.uvv_in_tagen < 30));
  const statusSummary = FAHRZEUG_STATUS.map((status) => ({ status, count: vehicles.filter((item) => item.status === status).length }));
  const fahrzeugKpis = {
    aktiv: vehicles.filter((item) => item.status === 'aktiv').length,
    nichtAktiv: vehicles.filter((item) => item.status === 'nicht_aktiv').length,
    pruefung: vehicles.filter((item) => item.status === 'pruefung').length,
    werkstatt: vehicles.filter((item) => item.status === 'werkstatt').length,
    schaden: vehicles.filter((item) => item.status === 'schaden').length
  };
  const werkstattKpis = {
    gesamt: workshopRows.length,
    offen: workshopRows.filter((item) => item.status === 'offen').length,
    bearbeitung: workshopRows.filter((item) => item.status === 'in_bearbeitung').length,
    abgeschlossen: workshopRows.filter((item) => item.status === 'abgeschlossen').length
  };
  const schadenKpis = {
    gesamt: damageRows.length,
    gemeldet: damageRows.filter((item) => item.status === 'gemeldet').length,
    reparatur: damageRows.filter((item) => item.status === 'in_reparatur').length,
    abgeschlossen: damageRows.filter((item) => item.status === 'abgeschlossen').length
  };
  const latestVehicles = [...vehicles]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 5)
    .map((item) => ({ kennzeichen: item.kennzeichen, fahrzeug: item.fahrzeug, status: item.status, standort: item.standort }));
  const latestWorkshop = [...workshopRows]
    .sort((a, b) => String(b.status_datum || b.created_at || '').localeCompare(String(a.status_datum || a.created_at || '')))
    .slice(0, 5)
    .map((item) => ({ kennzeichen: item.kennzeichen, werkstatt_name: item.werkstatt_name, problem: item.problem || item.beschreibung || '-', status: item.status, datum: item.status_datum || item.datum_von || '-' }));
  const latestSchaeden = [...damageRows]
    .sort((a, b) => String(b.datum || b.created_at || '').localeCompare(String(a.datum || a.created_at || '')))
    .slice(0, 5)
    .map((item) => ({ kennzeichen: item.kennzeichen, beschreibung: item.beschreibung || '-', status: item.status, datum: item.datum || '-' }));
  res.json({
    counts,
    vehiclesByLocation: Object.entries(locationMap).map(([name, value]) => ({ name, value })),
    reminders,
    statusSummary,
    fahrzeugKpis,
    werkstattKpis,
    schadenKpis,
    latestVehicles,
    latestWorkshop,
    latestSchaeden,
    updatedAt: nowIso()
  });
});

app.get('/api/suche', authRequired, (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const rows = scopedVehicles(readDb(), req.user, req).filter((item) => [item.kennzeichen, item.fahrzeug, item.standort, item.status, item.hu_datum, item.uvv_datum].some((value) => String(value).toLowerCase().includes(q)));
  res.json(rows);
});

app.post('/api/import/csv', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const records = parse(req.body.csv || '', { delimiter: ';', columns: ['kennzeichen', 'fahrzeug', 'uvv', 'hu', 'standort'], trim: true, skip_empty_lines: true });
  const created = [];
  const errors = [];
  for (const [index, row] of records.entries()) {
    const standort = data.standorte.find((item) => item.name.toLowerCase() === sanitizeLocationName(row.standort).toLowerCase());
    if (!row.kennzeichen || !row.fahrzeug || !standort) {
      errors.push({ line: index + 1, error: 'Ungueltiger Datensatz oder unbekannter Standort.' });
      continue;
    }
    if (req.user.rolle !== 'hauptadmin' && standort.id !== req.user.standort_id) {
      errors.push({ line: index + 1, error: 'Standort nicht erlaubt.' });
      continue;
    }
    if (data.fahrzeuge.some((item) => item.kennzeichen === row.kennzeichen)) {
      errors.push({ line: index + 1, error: 'Kennzeichen bereits vorhanden.' });
      continue;
    }
    data.fahrzeuge.push({ id: nextId(data.fahrzeuge), kennzeichen: row.kennzeichen, fahrzeug: row.fahrzeug, standort_id: standort.id, status: 'aktiv', hu_datum: row.hu, uvv_datum: row.uvv, created_at: nowIso() });
    created.push(row.kennzeichen);
  }
  writeDb(data);
  res.json({ imported: created.length, created, errors });
});
app.get('/api/export/csv', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const rows = scopedVehicles(data, req.user, req);
  const lines = [
    'Kennzeichen;Fahrzeug;Status;UVV;HU;Standort;Angelegt',
    ...rows.map((item) => [
      item.kennzeichen || '',
      item.fahrzeug || '',
      item.status || '',
      item.uvv_datum || '',
      item.hu_datum || '',
      item.standort || '',
      String(item.created_at || '').slice(0, 10)
    ].map((value) => String(value).replace(/;/g, ',')).join(';'))
  ];
  const standortName = sanitizeLocationName(locationName(data, selectedStandortId(req, req.user) || req.user.standort_id) || 'export').toLowerCase().replace(/\s+/g, '_');
  const fileName = req.user.rolle === 'hauptadmin' && !selectedStandortId(req, req.user) ? 'fahrzeuge_gesamt.csv' : 'fahrzeuge_' + standortName + '.csv';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + fileName + '"');
  res.send('\uFEFF' + lines.join('\n'));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({ error: error.message || 'Serverfehler.' });
});

async function start() {
  ensureDataFile();
  if (usePostgres) await bootstrapFromPostgres();
  const migrated = readDb();
  writeDb(migrated);
  app.listen(PORT, () => console.log(`Fuhrparkmanagement laeuft auf http://localhost:${PORT}`));
}

start().catch((error) => {
  console.error('Serverstart fehlgeschlagen:', error);
  process.exit(1);
});








