require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const { Pool } = require('pg');
const { parse } = require('csv-parse/sync');
const { authRequired, requireRoles, signUser } = require('./middleware/auth');
const {
  PACKAGE_DEFINITIONS,
  DEFAULT_ADDON_MODULES,
  packageDefinitionByName,
  isManagementRole,
  isFleetAdminRole,
  isDriverRole,
  canUseDriverDamageForm,
  canManageDamage,
  canViewDamageRecord,
  canEditDamageRecord,
  canGrantAppRole,
  normalizeAppRole,
  displayAppRole,
  normalizeBackofficePortalRole,
  parseModuleList,
  effectiveModules,
  packageAllowsModule
} = require('./lib/system-rules');

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
const RAMP_NUMBERS = Array.from({ length: 40 }, (_, index) => index + 1);
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

function nextId(items) {
  return items.length ? Math.max(...items.map((item) => item.id)) + 1 : 1;
}

function ensureMandantStarterData(data, { mandantId, companyName }) {
  return initializeMandantData(data, { mandantId, companyName });
}

function firstMandantLocationId(data, mandantId) {
  const match = (data.standorte || []).find((item) => Number(item.mandant_id || 1) === Number(mandantId));
  return match ? Number(match.id) : null;
}

function normalizeBackofficeEmployeeRole(value) {
  const normalized = normalizeAppRole(value);
  const allowed = ['hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter', 'benutzer'];
  return allowed.includes(normalized) ? normalized : 'admin';
}

function canAccessBackofficeRole(role) {
  return ['superadmin', 'hauptadmin', 'hr', 'mitarbeiter'].includes(String(role || '').trim());
}

function canManageBackofficeRole(role) {
  return ['superadmin', 'hauptadmin', 'hr'].includes(String(role || '').trim());
}

function employeeStatusToAktiv(value) {
  return String(value || 'aktiv').trim() === 'pausiert' ? 0 : 1;
}

function addDaysIso(startValue, days) {
  const base = startValue ? new Date(`${startValue}T00:00:00`) : new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + Number(days || 0));
  return next.toISOString().slice(0, 10);
}

function nowIso() {
  return new Date().toISOString();
}

function repairEncodingText(value) {
  const source = String(value || '');
  if (!source) return '';
  let repaired = source;
  const replacements = [
    ['Ã¼', 'ü'], ['Ã¶', 'ö'], ['Ã¤', 'ä'], ['ÃŸ', 'ß'],
    ['Ãœ', 'Ü'], ['Ã–', 'Ö'], ['Ã„', 'Ä'],
    ['â€“', '–'], ['â€”', '—'], ['â€ž', '„'], ['â€œ', '“'], ['â€š', '‚'], ['â€™', '’'],
    ['ï¿½', 'ü']
  ];
  for (const [search, replacement] of replacements) {
    repaired = repaired.split(search).join(replacement);
  }
  if (/[Ãâï]/.test(repaired)) {
    try {
      const decoded = Buffer.from(repaired, 'latin1').toString('utf8');
      const currentPenalty = (repaired.match(/[Ãâï]/g) || []).length;
      const decodedPenalty = (decoded.match(/[Ãâï]/g) || []).length;
      if (decodedPenalty < currentPenalty) repaired = decoded;
    } catch (error) {
      // Fallback to string replacements above
    }
  }
  return repaired;
}

function repairEncodingDeep(input) {
  if (typeof input === 'string') return repairEncodingText(input);
  if (Array.isArray(input)) return input.map((item) => repairEncodingDeep(item));
  if (input && typeof input === 'object') {
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, repairEncodingDeep(value)]));
  }
  return input;
}

function heldDurationText(dateString) {
  if (!dateString) return '-';
  const start = new Date(dateString);
  if (Number.isNaN(start.getTime())) return '-';
  const now = new Date();
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return '-';
  if (years === 0) return `${months} Monate`;
  if (months === 0) return `${years} Jahre`;
  return `${years} Jahre ${months} Monate`;
}

function sanitizeLocationName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function scannerLabel(number) {
  return `Scanner ${String(number).padStart(3, '0')}`;
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

function rampLabel(number) {
  return `Rampe ${number}`;
}

function defaultBackofficePackages() {
  return Object.values(PACKAGE_DEFINITIONS).map((item, index) => ({
    id: index + 1,
    name: item.name,
    preis: item.preis,
    abrechnung: item.abrechnung,
    standorte: item.standorte,
    status: item.status,
    beschreibung: item.beschreibung,
    leistungen: item.leistungen,
    created_at: nowIso()
  }));
}

function standardPackageMap(now = nowIso()) {
  return Object.entries(PACKAGE_DEFINITIONS).reduce((acc, [key, item], index) => {
    acc[key] = {
      id: index + 1,
      name: item.name,
      preis: item.preis,
      abrechnung: item.abrechnung,
      standorte: item.standorte,
      status: item.status,
      beschreibung: item.beschreibung,
      leistungen: item.leistungen,
      created_at: now
    };
    return acc;
  }, {});
}

function normalizePackageRow(row, now = nowIso()) {
  const name = String(row?.name || '').trim();
  const standard = packageDefinitionByName(name);
  const base = standard || {};
  return {
    id: Number(row?.id) || null,
    name: name || base.name || '',
    preis: String(row?.preis || base.preis || '').trim(),
    abrechnung: String(row?.abrechnung || base.abrechnung || 'monatlich').trim() || 'monatlich',
    standorte: String(row?.standorte || base.standorte || '').trim(),
    status: String(row?.status || base.status || 'aktiv').trim() || 'aktiv',
    beschreibung: String(row?.beschreibung || base.beschreibung || '').trim(),
    leistungen: String(row?.leistungen || base.leistungen || '').trim(),
    created_at: row?.created_at || base.created_at || now
  };
}

function activeCustomerPackageForMandant(data, mandantId) {
  return (data.backoffice_kunden || []).find((item) => Number(item.mandant_id || 1) === Number(mandantId) && String(item.status || 'aktiv') !== 'archiviert') || null;
}

function packagePolicyForMandant(data, mandantId) {
  const customer = activeCustomerPackageForMandant(data, mandantId);
  const configured = packageDefinitionByName(customer?.paket || data.backoffice_einstellungen?.standard_paket || 'Kostenlos');
  return configured || packageDefinitionByName('kostenlos');
}

function customerAddonModulesForMandant(data, mandantId) {
  const customer = activeCustomerPackageForMandant(data, mandantId);
  return parseModuleList(customer?.zusatzmodule || []);
}

function parseStorageBytesLimit(valueMb) {
  if (!Number.isFinite(Number(valueMb)) || Number(valueMb) <= 0) return null;
  return Number(valueMb) * 1024 * 1024;
}

function currentMandantStorageBytes(data, mandantId) {
  const relevantVehicles = new Set((data.fahrzeuge || []).filter((item) => Number(item.mandant_id || 1) === Number(mandantId)).map((item) => Number(item.id)));
  const filePaths = [];
  (data.fahrzeuge || []).forEach((item) => {
    if (Number(item.mandant_id || 1) === Number(mandantId) && item.fahrzeugschein_pdf) filePaths.push(item.fahrzeugschein_pdf);
  });
  (data.fahrzeug_dokumente || []).forEach((item) => {
    if (relevantVehicles.has(Number(item.fahrzeug_id)) && item.datei_pfad) filePaths.push(item.datei_pfad);
  });
  (data.schaeden || []).forEach((item) => {
    if (relevantVehicles.has(Number(item.fahrzeug_id)) && item.foto) filePaths.push(item.foto);
  });
  return filePaths.reduce((total, entry) => {
    const cleanPath = String(entry || '').trim();
    if (!cleanPath.startsWith('/uploads/')) return total;
    const absolutePath = path.join(uploadsDir, path.basename(cleanPath));
    if (!fs.existsSync(absolutePath)) return total;
    try {
      return total + fs.statSync(absolutePath).size;
    } catch (error) {
      return total;
    }
  }, 0);
}

function assertPackageLimit(data, user, entityType, options = {}) {
  const mandantId = Number(options.mandantId || user?.mandant_id || 1);
  const policy = packagePolicyForMandant(data, mandantId);
  const excludeId = Number(options.excludeId || 0) || null;
  if (!policy) return;
  if (entityType === 'standorte' && Number.isFinite(policy.limits?.standorte)) {
    const currentCount = (data.standorte || []).filter((item) => Number(item.mandant_id || 1) === mandantId && Number(item.id) !== excludeId).length;
    if (currentCount >= Number(policy.limits.standorte)) {
      const error = new Error(`Paketlimit erreicht: ${policy.name} erlaubt ${policy.limits.standorte} Standorte.`);
      error.statusCode = 409;
      throw error;
    }
  }
  if (entityType === 'fahrzeuge' && Number.isFinite(policy.limits?.fahrzeuge)) {
    const currentCount = (data.fahrzeuge || []).filter((item) => Number(item.mandant_id || 1) === mandantId && Number(item.id) !== excludeId).length;
    if (currentCount >= Number(policy.limits.fahrzeuge)) {
      const error = new Error(`Paketlimit erreicht: ${policy.name} erlaubt ${policy.limits.fahrzeuge} Fahrzeuge.`);
      error.statusCode = 409;
      throw error;
    }
  }
  if (entityType === 'benutzer' && Number.isFinite(policy.limits?.benutzer)) {
    const currentCount = (data.benutzer || []).filter((item) => Number(item.mandant_id || 1) === mandantId && Number(item.aktiv) === 1 && Number(item.id) !== excludeId).length;
    if (currentCount >= Number(policy.limits.benutzer)) {
      const error = new Error(`Paketlimit erreicht: ${policy.name} erlaubt ${policy.limits.benutzer} aktive Benutzer.`);
      error.statusCode = 409;
      throw error;
    }
  }
  if (entityType === 'uploads') {
    const storageLimit = parseStorageBytesLimit(policy.limits?.speicherMb);
    if (storageLimit) {
      const currentSize = currentMandantStorageBytes(data, mandantId);
      const nextSize = currentSize + Number(options.additionalBytes || 0);
      if (nextSize > storageLimit) {
        const error = new Error(`Speicherlimit erreicht: ${policy.name} erlaubt ${policy.limits.speicherMb} MB Uploadspeicher.`);
        error.statusCode = 409;
        throw error;
      }
    }
  }
}

function packageAllows(data, user, moduleName) {
  const policy = packagePolicyForMandant(data, user?.mandant_id || 1);
  const addonModules = customerAddonModulesForMandant(data, user?.mandant_id || 1);
  return packageAllowsModule(policy?.name, addonModules, moduleName);
}

function packageIncludesCoreModule(data, user) {
  return packageAllows(data, user, 'grundfunktionen') || packageAllows(data, user, 'all');
}

function visibleViewsForUser(data, user) {
  if (isDriverRole(user?.rolle)) return ['schaeden'];
  const views = new Set(['dashboard', 'benachrichtigungen', 'suche', 'impressum']);
  if (packageIncludesCoreModule(data, user)) {
    ['fahrzeuge', 'werkstatt', 'benutzer', 'kontakte', 'reinigung', 'standorte'].forEach((item) => views.add(item));
  }
  if (packageAllows(data, user, 'tuev') || packageAllows(data, user, 'all')) {
    views.add('uvv');
    views.add('licenseCheck');
  }
  if (packageAllows(data, user, 'schadenmodul') || packageAllows(data, user, 'all')) {
    views.add('schaeden');
  }
  if (packageAllows(data, user, 'berichte') || packageAllows(data, user, 'all')) {
    views.add('statistik');
  }
  if (packageAllows(data, user, 'export') || packageAllows(data, user, 'all')) {
    views.add('import');
  }
  if (packageAllows(data, user, 'lagerverwaltung') || packageAllows(data, user, 'all')) {
    views.add('lager');
  }
  return Array.from(views);
}

function assertModuleAllowed(data, user, moduleName, errorMessage = 'Dieses Modul ist fuer das gebuchte Paket nicht freigeschaltet.') {
  if (packageAllows(data, user, moduleName) || packageAllows(data, user, 'all')) return;
  const error = new Error(errorMessage);
  error.statusCode = 403;
  throw error;
}

function activeAddonModuleNames(data) {
  return new Set((data.backoffice_module_catalog || [])
    .filter((item) => String(item.status || 'aktiv') !== 'archiviert')
    .map((item) => String(item.name || '').trim().toLowerCase())
    .filter(Boolean));
}

function sanitizeCustomerAddonModules(data, packageName, rawModules) {
  const requestedModules = parseModuleList(rawModules);
  const allowedModules = activeAddonModuleNames(data);
  const packageModules = effectiveModules(packageName, []);
  if (packageModules.includes('all')) return [];
  return requestedModules.filter((item) => allowedModules.has(item) && !packageModules.includes(item));
}

function cleanupUploadedFile(file) {
  const absolutePath = file?.path;
  if (!absolutePath || !fs.existsSync(absolutePath)) return;
  try {
    fs.unlinkSync(absolutePath);
  } catch (error) {
    // Ignored on purpose: orphan cleanup should never block the request flow.
  }
}

function currentScannerAssignments(data) {
  const scannerById = new Map((data.scanner_geraete || []).map((item) => [Number(item.id), item]));
  const rampById = new Map((data.rampen || []).map((item) => [Number(item.id), item]));
  return (data.scanner_zuweisungen || [])
    .filter((item) => Number(item.aktiv) === 1)
    .map((item) => {
      const scanner = scannerById.get(Number(item.scanner_id));
      const rampe = rampById.get(Number(item.rampe_id));
      return {
        ...item,
        scanner_nummer: scanner?.nummer || '',
        scanner_label: scanner?.bezeichnung || scannerLabel(scanner?.nummer || item.scanner_id),
        sim_nummer: scanner?.sim_nummer || '',
        telefonnummer: scanner?.telefonnummer || '',
        rampe_nummer: rampe?.nummer || '',
        rampe_label: rampe ? rampLabel(rampe.nummer) : '',
        standort_id: item.standort_id || rampe?.standort_id || scanner?.standort_id || null
      };
    });
}

function activeScannerAssignmentForScanner(data, scannerId) {
  return currentScannerAssignments(data).find((item) => Number(item.scanner_id) === Number(scannerId)) || null;
}

function pushSystemNotification(data, user, payload) {
  data.system_notifications = data.system_notifications || [];
  data.system_notifications.unshift({
    id: nextId(data.system_notifications),
    mandant_id: user?.mandant_id || 1,
    typ: String(payload.typ || 'info').trim() || 'info',
    titel: String(payload.titel || '').trim(),
    text: String(payload.text || '').trim(),
    modul: String(payload.modul || 'system').trim() || 'system',
    standort_id: payload.standort_id ? Number(payload.standort_id) : null,
    created_at: nowIso()
  });
  data.system_notifications = data.system_notifications.slice(0, 250);
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
        mandant_id: Number(match?.mandant_id || standort.mandant_id || 1),
        standort_id: standort.id,
        slot,
        name: repairEncodingText(match?.name || `Werkstatt ${slot}`),
        created_at: match?.created_at || now
      });
    }
  }
  return rows;
}

function packageSupportsInventory(data, packageName, extraModules = []) {
  return packageAllowsModule(packageName, extraModules, 'lagerverwaltung');
}

function ensureInventoryData(data, { mandantId, companyName, packageName = 'Starter', extraModules = [] }) {
  data.lagerorte = Array.isArray(data.lagerorte) ? data.lagerorte : [];
  data.lagerartikel = Array.isArray(data.lagerartikel) ? data.lagerartikel : [];
  data.lagerbewegungen = Array.isArray(data.lagerbewegungen) ? data.lagerbewegungen : [];
  if (!packageSupportsInventory(data, packageName, extraModules)) return null;
  const standortId = firstMandantLocationId(data, mandantId);
  if (!standortId) return null;
  let lagerort = data.lagerorte.find((item) => Number(item.mandant_id || 1) === Number(mandantId) && Number(item.standort_id || 0) === Number(standortId));
  if (!lagerort) {
    lagerort = {
      id: nextId(data.lagerorte),
      mandant_id: Number(mandantId),
      standort_id: Number(standortId),
      name: repairEncodingText(`${companyName} Lager`),
      typ: 'hauptlager',
      aktiv: 1,
      created_at: nowIso()
    };
    data.lagerorte.push(lagerort);
  }
  return lagerort;
}

function initializeMandantData(data, { mandantId, companyName, packageName = 'Starter', extraModules = [] }) {
  data.standorte = Array.isArray(data.standorte) ? data.standorte : [];
  data.workshop_bereiche = Array.isArray(data.workshop_bereiche) ? data.workshop_bereiche : [];
  let location = data.standorte.find((item) => Number(item.mandant_id || 1) === Number(mandantId));
  if (!location) {
    location = {
      id: nextId(data.standorte),
      mandant_id: Number(mandantId),
      name: sanitizeLocationName(`${repairEncodingText(companyName || `Mandant ${mandantId}`)} Zentrale`),
      created_at: nowIso()
    };
    data.standorte.push(location);
  }
  data.workshop_bereiche = createWorkshopAreas(data.standorte, data.workshop_bereiche || []);
  const inventory = ensureInventoryData(data, { mandantId, companyName: repairEncodingText(companyName), packageName, extraModules });
  return { standort: location, lagerort: inventory };
}

function seedData() {
  const standorte = STANDORTE.map((name, index) => ({ id: index + 1, mandant_id: 1, name, created_at: nowIso() }));
  const carlswerkId = findLocationId(standorte, 'Carlswerk');
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
    reinigung: [],
    kontakte: [
      { id: 1, name: 'Iveco Service Koeln', firma: 'Iveco', kategorie: 'werkstatt', ansprechpartner: 'Herr Mueller', telefon: '0221 123456', mobil: '0171 1234567', email: 'service-koeln@iveco.local', adresse: 'Musterstrasse 12, Koeln', website: 'https://www.iveco.com', standort_id: findLocationId(standorte, 'Koeln'), notiz: 'Primaerer Partner fuer Transporter.', created_at: nowIso() },
      { id: 2, name: 'Allianz Schadenservice', firma: 'Allianz', kategorie: 'versicherung', ansprechpartner: 'Schaden-Hotline', telefon: '0800 112233', mobil: '', email: 'schaden@allianz.local', adresse: 'Koeniginstrasse 28, Muenchen', website: 'https://www.allianz.de', standort_id: findLocationId(standorte, 'Carlswerk'), notiz: '24/7 Erreichbarkeit fuer Schadenmeldungen.', created_at: nowIso() }
    ],
    uvv_pruefungen: [
      { id: 1, fahrzeug_id: 1, pruefer: 'Michael Weber', datum: '2026-03-01', naechste_pruefung_datum: '2027-03-01', kommentar: 'Fahrzeug in gutem Zustand', created_at: nowIso() }
    ],
    uvv_checkpunkte: CHECKPOINTS.map((punkt_name, index) => ({ id: index + 1, uvv_pruefung_id: 1, punkt_nr: index + 1, punkt_name, status: 'ok', kommentar: '' })),
    fahrzeug_dokumente: [],
    scanner_geraete: Array.from({ length: 120 }, (_, index) => ({
      id: index + 1,
      mandant_id: 1,
      nummer: index + 1,
      bezeichnung: scannerLabel(index + 1),
      sim_nummer: '',
      telefonnummer: '',
      provider: '',
      status: 'verfuegbar',
      standort_id: carlswerkId,
      notiz: '',
      created_at: nowIso()
    })),
    rampen: RAMP_NUMBERS.map((nummer) => ({
      id: nummer,
      mandant_id: 1,
      nummer,
      standort_id: carlswerkId,
      status: 'aktiv',
      created_at: nowIso()
    })),
    scanner_zuweisungen: [],
    system_notifications: []
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
  
  // 1. Mandanten Tabelle erstellen
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS mandanten (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      subdomain VARCHAR(50) UNIQUE,
      aktiv BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Sicherstellen dass Mandant 1 existiert
  await pgPool.query(`
    INSERT INTO mandanten (id, name, aktiv) 
    VALUES (1, 'Mein erster Kunde', true) 
    ON CONFLICT (id) DO NOTHING
  `);
  // Sequence für mandanten_id_seq korrigieren falls nötig
  await pgPool.query(`SELECT setval('mandanten_id_seq', (SELECT MAX(id) FROM mandanten))`);

  // 2. Bestehende Tabellen um mandant_id erweitern, falls sie fehlt
  const tables = ['standorte', 'benutzer', 'fahrzeuge', 'werkstatt', 'werkstatt_bereiche', 'schaeden', 'kontakte', 'uvv_pruefungen', 'aktivitaeten', 'reinigung', 'fahrzeug_dokumente', 'kalender_events', 'lagerorte', 'lagerartikel', 'lagerbewegungen'];
  for (const table of tables) {
    try {
      const res = await pgPool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND column_name = 'mandant_id'`);
      if (res.rows.length === 0) {
        await pgPool.query(`ALTER TABLE ${table} ADD COLUMN mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE`);
        await pgPool.query(`UPDATE ${table} SET mandant_id = 1 WHERE mandant_id IS NULL`);
      }
    } catch (e) {}
  }

  // NEU: Fahrzeug-Spalten (FIN, Radiocode etc.) sicherstellen
  try {
    const fahrzeugCols = await pgPool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'fahrzeuge'`);
    const existingCols = fahrzeugCols.rows.map(r => r.column_name);
    const newCols = [
      ['fin', 'VARCHAR(17)'],
      ['radiocode', 'VARCHAR(50)'],
      ['tankkarten_vorhanden', 'BOOLEAN DEFAULT FALSE'],
      ['tankkarte_aral_nummer', 'VARCHAR(50)'],
      ['tankkarte_aral_aktiv_seit', 'DATE'],
      ['tankkarte_aral_gueltig_bis', 'DATE'],
      ['tankkarte_shell_nummer', 'VARCHAR(50)'],
      ['tankkarte_shell_gueltig_von', 'DATE'],
      ['tankkarte_shell_gueltig_bis', 'DATE'],
      ['tankkarte_shell_name', 'VARCHAR(100)']
    ];
    for (const [col, type] of newCols) {
      if (!existingCols.includes(col)) {
        console.log(`Füge Spalte ${col} zu fahrzeuge hinzu...`);
        await pgPool.query(`ALTER TABLE fahrzeuge ADD COLUMN ${col} ${type}`);
      }
    }
  } catch (e) {}

  try {
    const licenseCols = await pgPool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'fuehrerscheinkontrollen'`);
    const existingCols = licenseCols.rows.map(r => r.column_name);
    const newCols = [
      ['ausstellungsdatum', 'DATE'],
      ['gueltig_bis', 'DATE'],
      ['besitz_seit', 'DATE']
    ];
    for (const [col, type] of newCols) {
      if (!existingCols.includes(col)) {
        await pgPool.query(`ALTER TABLE fuehrerscheinkontrollen ADD COLUMN ${col} ${type}`);
      }
    }
  } catch (e) {}

  try {
    const damageCols = await pgPool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'schaeden'`);
    const existingCols = damageCols.rows.map(r => r.column_name);
    if (!existingCols.includes('schaden_markierungen')) {
      await pgPool.query('ALTER TABLE schaeden ADD COLUMN schaden_markierungen TEXT');
    }
  } catch (e) {}

  // 3. Den Rest des Schemas sicherstellen
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
    ['mandanten', 'SELECT * FROM mandanten ORDER BY id'],
    ['standorte', 'SELECT * FROM standorte ORDER BY id'],
    ['benutzer', 'SELECT * FROM benutzer ORDER BY id'],
    ['fahrzeuge', 'SELECT * FROM fahrzeuge ORDER BY id'],
    ['workshop_bereiche', 'SELECT * FROM werkstatt_bereiche ORDER BY id'],
    ['werkstatt', 'SELECT * FROM werkstatt ORDER BY id'],
    ['lagerorte', 'SELECT * FROM lagerorte ORDER BY id'],
    ['lagerartikel', 'SELECT * FROM lagerartikel ORDER BY id'],
    ['lagerbewegungen', 'SELECT * FROM lagerbewegungen ORDER BY id'],
    ['schaeden', 'SELECT * FROM schaeden ORDER BY id'],
    ['kontakte', 'SELECT * FROM kontakte ORDER BY id'],
    ['uvv_pruefungen', 'SELECT * FROM uvv_pruefungen ORDER BY id'],
    ['uvv_checkpunkte', 'SELECT * FROM uvv_checkpunkte ORDER BY id'],
    ['aktivitaeten', 'SELECT * FROM aktivitaeten ORDER BY id'],
    ['reinigung', 'SELECT * FROM reinigung ORDER BY id'],
    ['fahrzeug_dokumente', 'SELECT * FROM fahrzeug_dokumente ORDER BY id'],
    ['fuehrerscheinkontrollen', 'SELECT * FROM fuehrerscheinkontrollen ORDER BY id'],
    ['kalender_events', 'SELECT * FROM kalender_events ORDER BY id']
  ];
  const data = {};
  for (const [key, sql] of queries) {
    const result = await pgPool.query(sql);
    data[key] = normalizePgRows(result.rows);
  }
  return data;
}

function hasPgData(data) {
  return ['standorte', 'benutzer', 'fahrzeuge', 'werkstatt', 'schaeden', 'uvv_pruefungen', 'lagerorte']
    .some((key) => Array.isArray(data[key]) && data[key].length);
}

async function saveToPostgres(data) {
  await ensurePgSchema();
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE fuehrerscheinkontrollen, fahrzeug_dokumente, reinigung, aktivitaeten, kontakte, uvv_checkpunkte, uvv_pruefungen, schaeden, werkstatt, werkstatt_bereiche, lagerbewegungen, lagerartikel, lagerorte, fahrzeuge, benutzer, standorte, mandanten RESTART IDENTITY CASCADE');
    await insertPgRows(client, 'mandanten', ['id', 'name', 'subdomain', 'aktiv', 'created_at'], data.mandanten || []);
    await insertPgRows(client, 'standorte', ['id', 'mandant_id', 'name', 'created_at'], data.standorte || []);
    await insertPgRows(client, 'benutzer', ['id', 'mandant_id', 'benutzername', 'name', 'email', 'passwort_hash', 'rolle', 'standort_id', 'aktiv', 'created_at'], data.benutzer || []);
    await insertPgRows(client, 'fahrzeuge', ['id', 'mandant_id', 'kennzeichen', 'fahrzeug', 'standort_id', 'status', 'hu_datum', 'uvv_datum', 'fahrzeugschein_pdf', 'fin', 'radiocode', 'tankkarten_vorhanden', 'tankkarte_aral_nummer', 'tankkarte_aral_aktiv_seit', 'tankkarte_aral_gueltig_bis', 'tankkarte_shell_nummer', 'tankkarte_shell_gueltig_von', 'tankkarte_shell_gueltig_bis', 'tankkarte_shell_name', 'created_at'], data.fahrzeuge || []);
    await insertPgRows(client, 'werkstatt_bereiche', ['id', 'mandant_id', 'standort_id', 'slot', 'name', 'created_at'], data.workshop_bereiche || []);
    await insertPgRows(client, 'werkstatt', ['id', 'mandant_id', 'fahrzeug_id', 'workshop_slot', 'werkstatt_name', 'positionsnummer', 'problem', 'pruefzeichen', 'status_datum', 'datum_von', 'datum_bis', 'tage', 'beschreibung', 'status', 'created_at'], data.werkstatt || []);
    await insertPgRows(client, 'lagerorte', ['id', 'mandant_id', 'standort_id', 'name', 'typ', 'aktiv', 'created_at'], data.lagerorte || []);
    await insertPgRows(client, 'lagerartikel', ['id', 'mandant_id', 'lagerort_id', 'name', 'artikelnummer', 'bestand', 'mindestbestand', 'einheit', 'created_at'], data.lagerartikel || []);
    await insertPgRows(client, 'lagerbewegungen', ['id', 'mandant_id', 'lagerartikel_id', 'typ', 'menge', 'referenz', 'created_at'], data.lagerbewegungen || []);
    await insertPgRows(client, 'schaeden', ['id', 'mandant_id', 'fahrzeug_id', 'fahrer_name', 'fahrer_telefon', 'beschreibung', 'unfallgegner_name', 'unfallgegner_kennzeichen', 'versicherung', 'telefon', 'foto', 'datum', 'status', 'polizei_vor_ort', 'verletzte', 'vu_nummer', 'schaden_markierungen', 'created_by', 'created_at'], data.schaeden || []);
    await insertPgRows(client, 'kontakte', ['id', 'mandant_id', 'name', 'firma', 'kategorie', 'ansprechpartner', 'telefon', 'mobil', 'email', 'adresse', 'website', 'standort_id', 'notiz', 'created_at'], data.kontakte || []);
    await insertPgRows(client, 'uvv_pruefungen', ['id', 'mandant_id', 'fahrzeug_id', 'pruefer', 'datum', 'naechste_pruefung_datum', 'kommentar', 'created_at'], data.uvv_pruefungen || []);
    await insertPgRows(client, 'uvv_checkpunkte', ['id', 'uvv_pruefung_id', 'punkt_nr', 'punkt_name', 'status', 'kommentar'], data.uvv_checkpunkte || []);
    await insertPgRows(client, 'aktivitaeten', ['id', 'mandant_id', 'modul', 'aktion', 'details', 'benutzer_id', 'benutzer_name', 'rolle', 'standort_id', 'created_at'], data.aktivitaeten || []);
    await insertPgRows(client, 'reinigung', ['id', 'mandant_id', 'fahrzeug_id', 'standort_id', 'datum', 'reinigungstag', 'gereinigt_am', 'bearbeitet_von', 'bemerkung', 'created_at'], data.reinigung || []);
    await insertPgRows(client, 'fahrzeug_dokumente', ['id', 'mandant_id', 'fahrzeug_id', 'name', 'datei_pfad', 'typ', 'created_at'], data.fahrzeug_dokumente || []);
    await insertPgRows(client, 'fuehrerscheinkontrollen', ['id', 'mandant_id', 'benutzer_id', 'pruef_datum', 'naechste_pruefung', 'ausstellungsdatum', 'gueltig_bis', 'besitz_seit', 'status', 'dokument_pfad', 'pruefer_id', 'bemerkung', 'created_at'], data.fuehrerscheinkontrollen || []);
    await insertPgRows(client, 'kalender_events', ['id', 'mandant_id', 'titel', 'beschreibung', 'start_datum', 'end_datum', 'typ', 'fahrzeug_id', 'created_at'], data.kalender_events || []);
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
  data = repairEncodingDeep(data);
  let changed = false;
  
  // Mandanten initialisieren
  if (!Array.isArray(data.mandanten)) {
    data.mandanten = [{ id: 1, name: 'Mein erster Kunde', aktiv: true, created_at: nowIso() }];
    changed = true;
  }

  if (!Array.isArray(data.standorte) || data.standorte.length < STANDORTE.length) {
    data.standorte = STANDORTE.map((name, index) => ({ id: index + 1, mandant_id: 1, name, created_at: nowIso() }));
    changed = true;
  }
  data.standorte = data.standorte.map((item, index) => ({ 
    id: item.id || index + 1, 
    mandant_id: item.mandant_id || 1, 
    name: sanitizeLocationName(item.name || STANDORTE[index]), 
    created_at: item.created_at || nowIso() 
  }));

  const workshopBereiche = createWorkshopAreas(data.standorte, data.workshop_bereiche || []);
  if (JSON.stringify(workshopBereiche) !== JSON.stringify(data.workshop_bereiche || [])) changed = true;
  data.workshop_bereiche = workshopBereiche;

  data.benutzer = (data.benutzer || []).map((item) => {
    const mandant_id = item.mandant_id || 1;
    const benutzername = item.benutzername || String(item.email || item.name || '').split('@')[0].trim().toLowerCase().replace(/\s+/g, '');
    const rolle = normalizeAppRole(item.rolle);
    const standort_id = item.standort_id || firstMandantLocationId(data, mandant_id) || findLocationId(data, 'Carlswerk') || null;
    const aktiv = Number(item.aktiv) ? 1 : 0;
    if (!item.mandant_id || benutzername !== item.benutzername || standort_id !== item.standort_id || rolle !== item.rolle || aktiv !== item.aktiv) changed = true;
    return { ...item, mandant_id, benutzername, standort_id, rolle, aktiv };
  });

  data.fahrzeuge = (data.fahrzeuge || []).map((item) => {
    if (!item.mandant_id) changed = true;
    return {
      ...item,
      mandant_id: item.mandant_id || 1,
      status: normalizeStatus({ verfuegbar: 'aktiv', ausser_betrieb: 'nicht_einsatzbereit' }[item.status] || item.status, FAHRZEUG_STATUS, 'aktiv'),
      fahrzeugschein_pdf: item.fahrzeugschein_pdf || '',
      fin: item.fin || '',
      radiocode: item.radiocode || '',
      tankkarten_vorhanden: !!item.tankkarten_vorhanden,
      tankkarte_aral_nummer: item.tankkarte_aral_nummer || '',
      tankkarte_aral_aktiv_seit: item.tankkarte_aral_aktiv_seit || null,
      tankkarte_aral_gueltig_bis: item.tankkarte_aral_gueltig_bis || null,
      tankkarte_shell_nummer: item.tankkarte_shell_nummer || '',
      tankkarte_shell_gueltig_von: item.tankkarte_shell_gueltig_von || null,
      tankkarte_shell_gueltig_bis: item.tankkarte_shell_gueltig_bis || null,
      tankkarte_shell_name: item.tankkarte_shell_name || '',
      created_at: item.created_at || nowIso()
    };
  });
  data.werkstatt = (data.werkstatt || []).map((item) => {
    const workshop_slot = Number(item.workshop_slot) || 1;
    const vehicle = (data.fahrzeuge || []).find((entry) => entry.id === item.fahrzeug_id);
    if (!item.mandant_id) changed = true;
    return {
      ...item,
      mandant_id: item.mandant_id || 1,
      workshop_slot,
      werkstatt_name: repairEncodingText(item.werkstatt_name || workshopAreaName(data, vehicle?.standort_id, workshop_slot)),
      positionsnummer: item.positionsnummer || '',
      problem: item.problem || item.beschreibung || '',
      pruefzeichen: normalizeStatus(({ x: 'nein', nein: 'nein', ok: 'ok' }[item.pruefzeichen] || item.pruefzeichen || 'nein'), PRUEFZEICHEN, 'nein'),
      status_datum: item.status_datum || item.datum_bis || item.datum_von || '',
      status: normalizeStatus(item.status, WERKSTATT_STATUS, 'offen')
    };
  });
  data.reinigung = (data.reinigung || []).map((item) => ({
    ...item,
    mandant_id: item.mandant_id || 1,
    datum: item.datum || todayText(),
    reinigungstag: sanitizeReinigungstag(item.reinigungstag),
    gereinigt_am: item.gereinigt_am || '',
    bearbeitet_von: item.bearbeitet_von || '',
    bemerkung: item.bemerkung || '',
    created_at: item.created_at || nowIso()
  }));
  data.schaeden = (data.schaeden || []).map((item) => ({
    ...item,
    mandant_id: item.mandant_id || 1,
    fahrer_name: item.fahrer_name || '',
    fahrer_telefon: item.fahrer_telefon || '',
    polizei_vor_ort: item.polizei_vor_ort || 'nein',
    verletzte: item.verletzte || 'nein',
    vu_nummer: item.vu_nummer || '',
    uhrzeit: item.uhrzeit || '',
    schaden_markierungen: item.schaden_markierungen || '',
    status: normalizeStatus(item.status, SCHADEN_STATUS, 'gemeldet')
  }));
  data.uvv_pruefungen = (data.uvv_pruefungen || []).map((item) => ({ 
    ...item, 
    mandant_id: item.mandant_id || 1,
    naechste_pruefung_datum: item.naechste_pruefung_datum || plusOneYear(item.datum) 
  }));
  data.uvv_checkpunkte = data.uvv_checkpunkte || [];
  data.kontakte = (data.kontakte || []).map((item) => ({
    ...item,
    mandant_id: item.mandant_id || 1,
    name: String(item.name || '').trim(),
    firma: String(item.firma || '').trim(),
    kategorie: String(item.kategorie || 'sonstiges').trim() || 'sonstiges',
    ansprechpartner: String(item.ansprechpartner || '').trim(),
    telefon: String(item.telefon || '').trim(),
    mobil: String(item.mobil || '').trim(),
    email: String(item.email || '').trim(),
    adresse: String(item.adresse || '').trim(),
    website: String(item.website || '').trim(),
    standort_id: item.standort_id ? Number(item.standort_id) : null,
    notiz: String(item.notiz || '').trim(),
    created_at: item.created_at || nowIso()
  }));
  data.fuehrerscheinkontrollen = (data.fuehrerscheinkontrollen || []).map(f => ({ 
    ...f, 
    mandant_id: f.mandant_id || 1,
    klassen: f.klassen || '',
    ausstellungsdatum: f.ausstellungsdatum || '',
    gueltig_bis: f.gueltig_bis || '',
    besitz_seit: f.besitz_seit || ''
  }));
  data.fahrzeug_dokumente = (data.fahrzeug_dokumente || []).map(d => ({ ...d, mandant_id: d.mandant_id || 1 }));
  data.kalender_events = (data.kalender_events || []).map(e => ({ ...e, mandant_id: e.mandant_id || 1 }));
  data.lagerorte = (data.lagerorte || []).map((item, index) => ({
    id: Number(item.id || index + 1),
    mandant_id: Number(item.mandant_id || 1),
    standort_id: item.standort_id ? Number(item.standort_id) : (firstMandantLocationId(data, item.mandant_id || 1) || null),
    name: repairEncodingText(String(item.name || 'Lager').trim() || 'Lager'),
    typ: String(item.typ || 'hauptlager').trim() || 'hauptlager',
    aktiv: Number(item.aktiv) === 0 ? 0 : 1,
    created_at: item.created_at || nowIso()
  }));
  data.lagerartikel = (data.lagerartikel || []).map((item, index) => ({
    id: Number(item.id || index + 1),
    mandant_id: Number(item.mandant_id || 1),
    lagerort_id: Number(item.lagerort_id || 0) || null,
    name: repairEncodingText(String(item.name || '').trim()),
    artikelnummer: String(item.artikelnummer || '').trim(),
    bestand: Number(item.bestand || 0),
    mindestbestand: Number(item.mindestbestand || 0),
    einheit: String(item.einheit || 'Stk').trim() || 'Stk',
    created_at: item.created_at || nowIso()
  }));
  data.lagerbewegungen = (data.lagerbewegungen || []).map((item, index) => ({
    id: Number(item.id || index + 1),
    mandant_id: Number(item.mandant_id || 1),
    lagerartikel_id: Number(item.lagerartikel_id || 0) || null,
    typ: String(item.typ || 'ein').trim() || 'ein',
    menge: Number(item.menge || 0),
    referenz: String(item.referenz || '').trim(),
    created_at: item.created_at || nowIso()
  }));
  if (!Array.isArray(data.scanner_geraete) || !data.scanner_geraete.length) {
    const defaultStandortId = findLocationId(data, 'Carlswerk') || (data.standorte[0]?.id || 1);
    data.scanner_geraete = Array.from({ length: 120 }, (_, index) => ({
      id: index + 1,
      mandant_id: 1,
      nummer: index + 1,
      bezeichnung: scannerLabel(index + 1),
      sim_nummer: '',
      telefonnummer: '',
      provider: '',
      status: 'verfuegbar',
      standort_id: defaultStandortId,
      notiz: '',
      created_at: nowIso()
    }));
    changed = true;
  }
  data.scanner_geraete = (data.scanner_geraete || []).map((item, index) => ({
    id: Number(item.id || index + 1),
    mandant_id: Number(item.mandant_id || 1),
    nummer: Number(item.nummer || index + 1),
    bezeichnung: String(item.bezeichnung || scannerLabel(item.nummer || index + 1)).trim() || scannerLabel(item.nummer || index + 1),
    sim_nummer: String(item.sim_nummer || '').trim(),
    telefonnummer: String(item.telefonnummer || '').trim(),
    provider: String(item.provider || '').trim(),
    status: String(item.status || 'verfuegbar').trim() || 'verfuegbar',
    standort_id: item.standort_id ? Number(item.standort_id) : (findLocationId(data, 'Carlswerk') || (data.standorte[0]?.id || 1)),
    notiz: String(item.notiz || '').trim(),
    created_at: item.created_at || nowIso()
  }));
  if (!Array.isArray(data.rampen) || !data.rampen.length) {
    const defaultStandortId = findLocationId(data, 'Carlswerk') || (data.standorte[0]?.id || 1);
    data.rampen = RAMP_NUMBERS.map((nummer) => ({
      id: nummer,
      mandant_id: 1,
      nummer,
      standort_id: defaultStandortId,
      status: 'aktiv',
      created_at: nowIso()
    }));
    changed = true;
  }
  data.rampen = (data.rampen || []).map((item, index) => ({
    id: Number(item.id || index + 1),
    mandant_id: Number(item.mandant_id || 1),
    nummer: Number(item.nummer || index + 1),
    standort_id: item.standort_id ? Number(item.standort_id) : (findLocationId(data, 'Carlswerk') || (data.standorte[0]?.id || 1)),
    status: String(item.status || 'aktiv').trim() || 'aktiv',
    created_at: item.created_at || nowIso()
  }));
  if (!Array.isArray(data.scanner_zuweisungen)) {
    data.scanner_zuweisungen = [];
    changed = true;
  }
  data.scanner_zuweisungen = (data.scanner_zuweisungen || []).map((item, index) => ({
    id: Number(item.id || index + 1),
    mandant_id: Number(item.mandant_id || 1),
    scanner_id: Number(item.scanner_id),
    rampe_id: Number(item.rampe_id),
    standort_id: item.standort_id ? Number(item.standort_id) : null,
    notiz: String(item.notiz || '').trim(),
    aktiv: Number(item.aktiv) === 0 ? 0 : 1,
    von: String(item.von || item.created_at || nowIso()).trim(),
    bis: item.bis ? String(item.bis).trim() : '',
    created_at: item.created_at || nowIso()
  }));
  if (!Array.isArray(data.system_notifications)) {
    data.system_notifications = [];
    changed = true;
  }
  data.system_notifications = (data.system_notifications || []).map((item, index) => ({
    id: Number(item.id || index + 1),
    mandant_id: Number(item.mandant_id || 1),
    typ: String(item.typ || 'info').trim() || 'info',
    titel: String(item.titel || '').trim(),
    text: String(item.text || '').trim(),
    modul: String(item.modul || 'system').trim() || 'system',
    standort_id: item.standort_id ? Number(item.standort_id) : null,
    created_at: item.created_at || nowIso()
  }));
  if (!Array.isArray(data.backoffice_kunden)) {
    data.backoffice_kunden = (data.mandanten || []).map((mandant) => ({
      id: mandant.id,
      mandant_id: mandant.id,
      firma: mandant.name || `Kunde ${mandant.id}`,
      ansprechpartner: '',
      email: '',
      telefon: '',
      paket: 'Starter',
      status: mandant.aktiv === false ? 'pausiert' : 'aktiv',
      standorte: (data.standorte || []).filter((item) => Number(item.mandant_id || 1) === Number(mandant.id)).length || 1,
      notiz: '',
      created_at: mandant.created_at || nowIso()
    }));
    changed = true;
  }
  data.backoffice_kunden = (data.backoffice_kunden || []).map((item) => ({
    id: Number(item.id),
    mandant_id: Number(item.mandant_id || item.id || 1),
    firma: String(item.firma || '').trim(),
    ansprechpartner: String(item.ansprechpartner || '').trim(),
    email: String(item.email || '').trim(),
    telefon: String(item.telefon || '').trim(),
    paket: String(item.paket || 'Starter').trim() || 'Starter',
    zusatzmodule: parseModuleList(item.zusatzmodule || item.module || item.modules || []),
    status: String(item.status || 'aktiv').trim() || 'aktiv',
    standorte: Number(item.standorte) > 0 ? Number(item.standorte) : 1,
    notiz: String(item.notiz || '').trim(),
    created_at: item.created_at || nowIso()
  }));
  for (const customer of (data.backoffice_kunden || [])) {
    const beforeLocation = firstMandantLocationId(data, customer.mandant_id);
    initializeMandantData(data, {
      mandantId: customer.mandant_id,
      companyName: customer.firma || `Kunde ${customer.mandant_id}`,
      packageName: customer.paket || 'Starter',
      extraModules: customer.zusatzmodule || []
    });
    if (!beforeLocation || !data.workshop_bereiche.some((item) => Number(item.mandant_id || 1) === Number(customer.mandant_id))) {
      changed = true;
    }
  }
  if (!Array.isArray(data.backoffice_module_catalog) || !data.backoffice_module_catalog.length) {
    data.backoffice_module_catalog = DEFAULT_ADDON_MODULES.map((name, index) => ({
      id: index + 1,
      name,
      label: name,
      status: 'aktiv',
      created_at: nowIso()
    }));
    changed = true;
  }
  data.backoffice_module_catalog = (data.backoffice_module_catalog || []).map((item, index) => ({
    id: Number(item.id || index + 1),
    name: String(item.name || item.label || '').trim().toLowerCase(),
    label: String(item.label || item.name || '').trim() || String(item.name || '').trim(),
    status: String(item.status || 'aktiv').trim() || 'aktiv',
    created_at: item.created_at || nowIso()
  })).filter((item) => item.name);
  if (!Array.isArray(data.backoffice_leads)) {
    data.backoffice_leads = [];
    changed = true;
  }
  data.backoffice_leads = (data.backoffice_leads || []).map((item) => ({
    id: Number(item.id),
    name: String(item.name || '').trim(),
    firma: String(item.firma || '').trim(),
    email: String(item.email || '').trim(),
    telefon: String(item.telefon || '').trim(),
    fahrzeuge: Number(item.fahrzeuge) > 0 ? Number(item.fahrzeuge) : 0,
    status: String(item.status || 'neu').trim() || 'neu',
    quelle: String(item.quelle || '').trim(),
    notiz: String(item.notiz || '').trim(),
    created_at: item.created_at || nowIso()
  }));
  if (!Array.isArray(data.backoffice_tickets)) {
    data.backoffice_tickets = [];
    changed = true;
  }
  data.backoffice_tickets = (data.backoffice_tickets || []).map((item) => ({
    id: Number(item.id),
    kunde: String(item.kunde || '').trim(),
    betreff: String(item.betreff || '').trim(),
    prioritaet: String(item.prioritaet || 'normal').trim() || 'normal',
    status: String(item.status || 'offen').trim() || 'offen',
    zustaendig: String(item.zustaendig || '').trim(),
    notiz: String(item.notiz || '').trim(),
    created_at: item.created_at || nowIso()
  }));
  if (!Array.isArray(data.backoffice_rechnungen)) {
    data.backoffice_rechnungen = [];
    changed = true;
  }
  data.backoffice_rechnungen = (data.backoffice_rechnungen || []).map((item) => ({
    id: Number(item.id),
    nummer: String(item.nummer || '').trim(),
    kunde: String(item.kunde || '').trim(),
    betrag: Number(item.betrag || 0),
    faellig_am: String(item.faellig_am || '').trim(),
    status: String(item.status || 'entwurf').trim() || 'entwurf',
    notiz: String(item.notiz || '').trim(),
    created_at: item.created_at || nowIso()
  }));
  if (!Array.isArray(data.backoffice_angebote)) {
    data.backoffice_angebote = [];
    changed = true;
  }
  data.backoffice_angebote = (data.backoffice_angebote || []).map((item) => ({
    id: Number(item.id),
    kunde: String(item.kunde || '').trim(),
    paket: String(item.paket || 'Starter').trim() || 'Starter',
    volumen: String(item.volumen || '').trim(),
    status: String(item.status || 'entwurf').trim() || 'entwurf',
    stand: String(item.stand || '').trim(),
    notiz: String(item.notiz || '').trim(),
    created_at: item.created_at || nowIso()
  }));
  if (!Array.isArray(data.backoffice_mitarbeiter)) {
    data.backoffice_mitarbeiter = (data.benutzer || []).map((item) => ({
      id: Number(item.id),
      name: String(item.name || item.benutzername || '').trim(),
      kunde: 'Interner Bestand',
      rolle: 'fuhrparkleitung',
      email: String(item.email || '').trim(),
      telefon: '',
      status: Number(item.aktiv) ? 'aktiv' : 'eingeladen',
      created_at: item.created_at || nowIso()
    }));
    changed = true;
  }
  data.backoffice_mitarbeiter = (data.backoffice_mitarbeiter || []).map((item) => ({
    customer_id: Number(item.customer_id) || Number((data.backoffice_kunden || []).find((entry) => String(entry.firma || '').trim().toLowerCase() === String(item.kunde || '').trim().toLowerCase())?.id) || null,
    id: Number(item.id),
    name: String(item.name || '').trim(),
    kunde: String(item.kunde || '').trim(),
    rolle: String(item.rolle || 'fuhrparkleitung').trim() || 'fuhrparkleitung',
    app_rolle: normalizeBackofficeEmployeeRole(item.app_rolle || item.login_rolle || 'admin'),
    linked_benutzer_id: Number(item.linked_benutzer_id) || null,
    benutzername: String(item.benutzername || '').trim(),
    email: String(item.email || '').trim(),
    telefon: String(item.telefon || '').trim(),
    status: String(item.status || 'aktiv').trim() || 'aktiv',
    created_at: item.created_at || nowIso()
  }));
  if (!Array.isArray(data.backoffice_personal)) {
    data.backoffice_personal = [];
    changed = true;
  }
  data.backoffice_personal = (data.backoffice_personal || []).map((item) => ({
    id: Number(item.id),
    name: String(item.name || '').trim(),
    email: String(item.email || '').trim(),
    telefon: String(item.telefon || '').trim(),
    abteilung: String(item.abteilung || '').trim(),
    rolle: String(item.rolle || '').trim(),
    backoffice_rolle: normalizeBackofficePortalRole(item.backoffice_rolle || item.zugang_rolle || 'mitarbeiter'),
    status: String(item.status || 'aktiv').trim() || 'aktiv',
    startdatum: String(item.startdatum || '').trim(),
    gehalt: String(item.gehalt || '').trim(),
    personalakte_nummer: String(item.personalakte_nummer || '').trim(),
    zugang_login: String(item.zugang_login || '').trim(),
    zugang_passwort: String(item.zugang_passwort || '').trim(),
    linked_benutzer_id: Number(item.linked_benutzer_id) || null,
    notiz: String(item.notiz || '').trim(),
    created_at: item.created_at || nowIso()
  }));
  const packageNames = (data.backoffice_pakete || []).map((item) => String(item.name || '').trim());
  const looksLikeLegacyPackages = packageNames.length > 0
    && packageNames.every((name) => ['Basic', 'Premium', 'Enterprise'].includes(name))
    && !packageNames.includes('Kostenlos')
    && !packageNames.includes('Starter')
    && !packageNames.includes('Professional');
  if (!Array.isArray(data.backoffice_pakete) || looksLikeLegacyPackages) {
    data.backoffice_pakete = defaultBackofficePackages();
    changed = true;
  }
  data.backoffice_pakete = (data.backoffice_pakete || []).map((item, index) => {
    const normalized = normalizePackageRow(item, nowIso());
    return {
      ...normalized,
      id: Number(normalized.id) || index + 1
    };
  });
  if (!Array.isArray(data.backoffice_aufgaben)) {
    data.backoffice_aufgaben = [];
    changed = true;
  }
  data.backoffice_aufgaben = (data.backoffice_aufgaben || []).map((item) => ({
    id: Number(item.id),
    titel: String(item.titel || '').trim(),
    bereich: String(item.bereich || 'allgemein').trim() || 'allgemein',
    status: String(item.status || 'offen').trim() || 'offen',
    faellig_am: String(item.faellig_am || '').trim(),
    notiz: String(item.notiz || '').trim(),
    created_at: item.created_at || nowIso()
  }));
  if (!Array.isArray(data.backoffice_dokumente)) {
    data.backoffice_dokumente = [];
    changed = true;
  }
  data.backoffice_dokumente = (data.backoffice_dokumente || []).map((item) => ({
    id: Number(item.id),
    titel: String(item.titel || '').trim(),
    typ: String(item.typ || 'sonstiges').trim() || 'sonstiges',
    bezug: String(item.bezug || '').trim(),
    status: String(item.status || 'aktiv').trim() || 'aktiv',
    notiz: String(item.notiz || '').trim(),
    created_at: item.created_at || nowIso()
  }));
  if (!data.backoffice_einstellungen || typeof data.backoffice_einstellungen !== 'object' || Array.isArray(data.backoffice_einstellungen)) {
    data.backoffice_einstellungen = {
      firmenname: 'FleetControl24',
      marken_claim: 'Digitale Fuhrparkplattform fuer Unternehmen',
      support_email: 'support@fleetcontrol24.de',
      vertrieb_email: 'vertrieb@fleetcontrol24.de',
      antwortadresse: 'kontakt@fleetcontrol24.de',
      standard_paket: 'Starter'
    };
    changed = true;
  }
  data.backoffice_einstellungen = {
    firmenname: String(data.backoffice_einstellungen.firmenname || 'FleetControl24').trim() || 'FleetControl24',
    marken_claim: String(data.backoffice_einstellungen.marken_claim || 'Digitale Fuhrparkplattform fuer Unternehmen').trim() || 'Digitale Fuhrparkplattform fuer Unternehmen',
    support_email: String(data.backoffice_einstellungen.support_email || 'support@fleetcontrol24.de').trim() || 'support@fleetcontrol24.de',
    vertrieb_email: String(data.backoffice_einstellungen.vertrieb_email || 'vertrieb@fleetcontrol24.de').trim() || 'vertrieb@fleetcontrol24.de',
    antwortadresse: String(data.backoffice_einstellungen.antwortadresse || 'kontakt@fleetcontrol24.de').trim() || 'kontakt@fleetcontrol24.de',
    standard_paket: String(data.backoffice_einstellungen.standard_paket || 'Starter').trim() || 'Starter'
  };
  const validStandortIds = new Set((data.standorte || []).map((item) => Number(item.id)));
  data.benutzer = (data.benutzer || []).map((item) => {
    if (validStandortIds.has(Number(item.standort_id))) return item;
    changed = true;
    return { ...item, standort_id: firstMandantLocationId(data, item.mandant_id || 1) || data.standorte[0]?.id || null };
  });
  data.workshop_bereiche = (data.workshop_bereiche || []).filter((item) => validStandortIds.has(Number(item.standort_id))).map((item) => ({
    ...item,
    mandant_id: Number(item.mandant_id || (data.standorte || []).find((standort) => Number(standort.id) === Number(item.standort_id))?.mandant_id || 1),
    name: repairEncodingText(String(item.name || `Werkstatt ${item.slot || 1}`).trim() || `Werkstatt ${item.slot || 1}`)
  }));
  data.__needs_write = changed;
  return data;
}

function readDb() {
  ensureDataFile();
  if (!currentData) {
    const raw = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const migrated = migrateData(raw);
    currentData = migrated;
    if (migrated.__needs_write) {
      delete migrated.__needs_write;
      fs.writeFileSync(dataFile, JSON.stringify(migrated, null, 2), 'utf8');
    }
  }
  return cloneData(currentData);
}

function locationName(data, id) {
  return data.standorte.find((item) => item.id === id)?.name || '';
}

function resolveActivityStandortId(data, user, explicitStandortId = null) {
  if (explicitStandortId) return Number(explicitStandortId) || null;
  if (user?.rolle === 'hauptadmin') return user.standort_id || findLocationId(data, 'Carlswerk') || null;
  return user?.standort_id || null;
}

function logActivity(data, user, modul, aktion, details, explicitStandortId = null) {
  if (!user || !data) return;
  const standort_id = resolveActivityStandortId(data, user, explicitStandortId);
  const row = {
    id: nextId(data.aktivitaeten || []),
    mandant_id: user.mandant_id || 1,
    modul,
    aktion,
    details: String(details || '').trim(),
    benutzer_id: user.id || null,
    benutzer_name: user.name || user.benutzername || '',
    rolle: user.rolle || '',
    standort_id,
    created_at: nowIso()
  };
  data.aktivitaeten = [row, ...(data.aktivitaeten || [])].slice(0, 500);
}

function scopedActivities(data, user, req) {
  const rows = filterByStandort(data, data.aktivitaeten || [], user, req, (item) => item.standort_id);
  return rows.map((item) => ({ ...item, standort: item.standort_id ? locationName(data, item.standort_id) : '-' }));
}

function selectedStandortId(req, user) {
  if (user.rolle !== 'hauptadmin') return user.standort_id;
  const id = Number(req.query.standort_id || req.body?.standort_id || '');
  return Number.isFinite(id) && id > 0 ? id : null;
}

function filterByStandort(data, items, user, req, mapper) {
  const mandantId = user.mandant_id || 1;
  const chosen = selectedStandortId(req, user);
  
  const filtered = items.filter((item) => {
    // 1. Mandant muss immer passen (außer Superadmin)
    const itemMandantId = item.mandant_id || 1; // Fallback auf 1 für Altdaten
    if (user.rolle !== 'superadmin' && itemMandantId !== mandantId) {
      return false;
    }
    
    // 2. Standort-Filter
    if (user.rolle === 'hauptadmin' || user.rolle === 'superadmin') {
      return chosen ? mapper(item) === chosen : true;
    }
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
  return !!vehicle && (['superadmin', 'hauptadmin'].includes(user.rolle) || Number(vehicle.standort_id) === Number(user.standort_id));
}

function scopedInventoryLocations(data, user, req) {
  return filterByStandort(data, data.lagerorte || [], user, req, (item) => Number(item.standort_id || 0));
}

function scopedInventoryArticles(data, user, req) {
  const allowedLocations = new Set(scopedInventoryLocations(data, user, req).map((item) => Number(item.id)));
  return (data.lagerartikel || [])
    .filter((item) => Number(item.mandant_id || 1) === Number(user.mandant_id || 1))
    .filter((item) => !item.lagerort_id || allowedLocations.has(Number(item.lagerort_id)))
    .map((item) => {
      const lagerort = (data.lagerorte || []).find((entry) => Number(entry.id) === Number(item.lagerort_id));
      return {
        ...item,
        lagerort_name: lagerort?.name || '-',
        standort_id: lagerort?.standort_id || null,
        standort: lagerort?.standort_id ? locationName(data, lagerort.standort_id) : '-'
      };
    });
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

function syncVehicleWorkshopStatus(data, vehicleId) {
  const vehicle = (data.fahrzeuge || []).find((item) => Number(item.id) === Number(vehicleId));
  if (!vehicle) return;
  const activeRows = (data.werkstatt || []).filter((item) => Number(item.fahrzeug_id) === Number(vehicleId) && item.status !== 'abgeschlossen');
  if (!activeRows.length) {
    vehicle.status = 'aktiv';
    return;
  }
  const latest = [...activeRows].sort((a, b) => new Date(b.created_at || b.status_datum || b.datum_von || 0).getTime() - new Date(a.created_at || a.status_datum || a.datum_von || 0).getTime())[0];
  vehicle.status = mapWorkshopStatusToVehicleStatus(latest?.status);
}


function todayText() {
  return new Date().toISOString().slice(0, 10);
}

function sanitizeReinigungstag(value) {
  const text = String(value || '1');
  return text === '2' ? '2' : '1';
}

function scopedReinigungData(data, user, req, datum, reinigungstag) {
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(datum || '')) ? String(datum) : todayText();
  const tag = sanitizeReinigungstag(reinigungstag);
  const vehicles = scopedVehicles(data, user, req);
  const vehicleIds = new Set(vehicles.map((item) => item.id));
  const workshopRows = (data.werkstatt || [])
    .filter((item) => vehicleIds.has(item.fahrzeug_id))
    .map((item) => ({ ...item, vehicle: vehicles.find((entry) => entry.id === item.fahrzeug_id) }))
    .filter((item) => item.vehicle);

  const workshopByVehicle = new Map();
  workshopRows.forEach((item) => {
    if (!workshopByVehicle.has(item.fahrzeug_id)) workshopByVehicle.set(item.fahrzeug_id, item);
  });

  const cleaningRows = (data.reinigung || [])
    .filter((item) => vehicleIds.has(item.fahrzeug_id))
    .filter((item) => String(item.datum) === selectedDate && sanitizeReinigungstag(item.reinigungstag) === tag);

  const cleaningMap = new Map();
  cleaningRows.forEach((item) => cleaningMap.set(Number(item.fahrzeug_id), item));

  const aktuelle = vehicles
    .filter((vehicle) => !workshopByVehicle.has(vehicle.id))
    .map((vehicle) => {
      const row = cleaningMap.get(Number(vehicle.id));
      return {
        id: vehicle.id,
        fahrzeug_id: vehicle.id,
        kennzeichen: vehicle.kennzeichen,
        fahrzeug: vehicle.fahrzeug,
        standort: vehicle.standort,
        gereinigt: !!row?.gereinigt_am,
        gereinigt_am: row?.gereinigt_am || '',
        bearbeitet_von: row?.bearbeitet_von || ''
      };
    });

  const werkstatt = workshopRows.map((item) => ({
    id: item.fahrzeug_id,
    fahrzeug_id: item.fahrzeug_id,
    kennzeichen: item.vehicle.kennzeichen,
    fahrzeug: item.vehicle.fahrzeug,
    standort: item.vehicle.standort,
    werkstatt_name: item.werkstatt_name || '',
    datum_von: item.datum_von || '',
    status: item.status || '',
    hinweis: 'Reinigung nach Rueckkehr'
  }));

  const gereinigt = aktuelle.filter((item) => item.gereinigt).map((item) => ({
    ...item,
    reinigungstag: tag
  }));

  return { datum: selectedDate, reinigungstag: tag, aktuelle, werkstatt, gereinigt };
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
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

app.get('/impressum', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'impressum.html'));
});

app.get('/datenschutz', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'datenschutz.html'));
});

app.post('/api/website-anfrage', (req, res) => {
  const data = readDb();
  const name = String(req.body.name || '').trim();
  const firma = String(req.body.firma || '').trim();
  const typ = String(req.body.typ || 'demo').trim().toLowerCase();
  const paketWunsch = String(req.body.paket_wunsch || '').trim();
  if (!name || !firma) return res.status(400).json({ error: 'Name und Firma sind Pflicht.' });

  const row = {
    id: nextId(data.backoffice_leads || []),
    name,
    firma,
    email: String(req.body.email || '').trim(),
    telefon: String(req.body.telefon || '').trim(),
    fahrzeuge: Number(req.body.fahrzeuge) > 0 ? Number(req.body.fahrzeuge) : 0,
    status: 'neu',
    quelle: 'Website',
    anfrage_typ: typ === 'angebot' ? 'angebot' : 'demo',
    paket_wunsch: paketWunsch,
    demo_start: '',
    demo_end: '',
    notiz: String(req.body.nachricht || req.body.notiz || '').trim(),
    created_at: nowIso()
  };

  data.backoffice_leads = data.backoffice_leads || [];
  data.backoffice_leads.unshift(row);
  writeDb(data);
  res.json({ success: true, id: row.id });
});

app.get('/api/website-pakete', (req, res) => {
  const data = readDb();
  const websitePackageOrder = { kostenlos: 1, starter: 2, professional: 3, enterprise: 4 };
  const rows = (data.backoffice_pakete || [])
    .filter((item) => String(item.status || '').trim() !== 'archiviert')
    .sort((a, b) => {
      const rankA = websitePackageOrder[String(a.name || '').trim().toLowerCase()] || 99;
      const rankB = websitePackageOrder[String(b.name || '').trim().toLowerCase()] || 99;
      if (rankA !== rankB) return rankA - rankB;
      return Number(a.id) - Number(b.id);
    })
    .map((item) => ({
      id: item.id,
      name: item.name,
      preis: item.preis || '',
      standorte: item.standorte || '',
      beschreibung: item.beschreibung || '',
      abrechnung: item.abrechnung || 'monatlich',
      leistungen: String(item.leistungen || '')
        .split(/\r?\n|,/)
        .map((part) => part.trim())
        .filter(Boolean),
      featured: String(item.name || '').trim().toLowerCase() === 'starter'
    }));
  res.json(rows);
});

app.get('/backoffice', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'backoffice.html'));
});

app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'fuhrparkmanagement', time: nowIso() });
});

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
  const mandantId = req.user.mandant_id || 1;
  const standorte = data.standorte.filter(s => req.user.rolle === 'superadmin' || (s.mandant_id || 1) === mandantId);
  const paket = packagePolicyForMandant(data, mandantId);
  const zusatzmodule = customerAddonModulesForMandant(data, mandantId);
  res.json({
    standorte,
    fahrzeugStatus: FAHRZEUG_STATUS,
    werkstattStatus: WERKSTATT_STATUS,
    workshopSlots: WORKSHOP_SLOTS,
    schadenStatus: SCHADEN_STATUS,
    pruefzeichen: PRUEFZEICHEN,
    uvvCheckpoints: CHECKPOINTS,
    visibleViews: visibleViewsForUser(data, req.user),
    selectedStandortId: selectedStandortId(req, req.user),
    paket: paket ? { name: paket.name, limits: { ...paket.limits, standorte: String(paket.standorte || '').toLowerCase().includes('unbegrenzt') ? null : Number(String(paket.standorte).match(/\d+/)?.[0] || 0) || null }, modules: effectiveModules(paket.name, zusatzmodule) } : null,
    roleLabel: displayAppRole(req.user.rolle)
  });
});

app.get('/api/scanner', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const baseRows = req.user.rolle === 'hauptadmin' || req.user.rolle === 'superadmin'
    ? (data.scanner_geraete || [])
    : filterByStandort(data, data.scanner_geraete || [], req.user, req, (item) => Number(item.standort_id || 0));
  const rows = baseRows
    .map((item) => {
      const current = activeScannerAssignmentForScanner(data, item.id);
      return {
        ...item,
        standort: locationName(data, item.standort_id),
        aktuelle_rampe: current?.rampe_label || '-',
        aktuelle_rampe_nummer: current?.rampe_nummer || null,
        zuletzt_zugewiesen_am: current?.von ? String(current.von).slice(0, 10) : '',
        assignment_id: current?.id || null
      };
    })
    .sort((a, b) => Number(a.nummer) - Number(b.nummer));
  res.json(rows);
});

app.post('/api/scanner', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const nummer = Number(req.body.nummer);
  if (!Number.isFinite(nummer) || nummer <= 0) return res.status(400).json({ error: 'Gueltige Scanner-Nummer erforderlich.' });
  if ((data.scanner_geraete || []).some((item) => Number(item.nummer) === nummer)) {
    return res.status(409).json({ error: 'Scanner-Nummer existiert bereits.' });
  }
  const standort_id = Number(req.body.standort_id || selectedStandortId(req, req.user) || req.user.standort_id || findLocationId(data, 'Carlswerk') || 1);
  const row = {
    id: nextId(data.scanner_geraete || []),
    mandant_id: req.user.mandant_id || 1,
    nummer,
    bezeichnung: String(req.body.bezeichnung || scannerLabel(nummer)).trim() || scannerLabel(nummer),
    sim_nummer: String(req.body.sim_nummer || '').trim(),
    telefonnummer: String(req.body.telefonnummer || '').trim(),
    provider: String(req.body.provider || '').trim(),
    status: String(req.body.status || 'verfuegbar').trim() || 'verfuegbar',
    standort_id,
    notiz: String(req.body.notiz || '').trim(),
    created_at: nowIso()
  };
  data.scanner_geraete = [...(data.scanner_geraete || []), row];
  logActivity(data, req.user, 'scanner', 'scanner_angelegt', row.bezeichnung, standort_id);
  writeDb(data);
  res.status(201).json(row);
});

app.put('/api/scanner/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const row = (data.scanner_geraete || []).find((item) => Number(item.id) === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Scanner nicht gefunden.' });
  row.sim_nummer = String(req.body.sim_nummer || '').trim();
  row.telefonnummer = String(req.body.telefonnummer || '').trim();
  row.provider = String(req.body.provider || '').trim();
  row.notiz = String(req.body.notiz || row.notiz || '').trim();
  if (req.body.status) row.status = String(req.body.status).trim();
  logActivity(data, req.user, 'scanner', 'scanner_aktualisiert', row.bezeichnung, row.standort_id);
  writeDb(data);
  res.json(row);
});

app.get('/api/rampen', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const baseRows = req.user.rolle === 'hauptadmin' || req.user.rolle === 'superadmin'
    ? (data.rampen || [])
    : filterByStandort(data, data.rampen || [], req.user, req, (item) => Number(item.standort_id || 0));
  const rows = baseRows
    .map((item) => {
      const current = currentScannerAssignments(data).find((assignment) => Number(assignment.rampe_id) === Number(item.id)) || null;
      return {
        ...item,
        standort: locationName(data, item.standort_id),
        scanner_id: current?.scanner_id || null,
        scanner_nummer: current?.scanner_nummer || null,
        scanner_label: current?.scanner_label || '-'
      };
    })
    .sort((a, b) => Number(a.nummer) - Number(b.nummer));
  res.json(rows);
});

app.get('/api/scanner-zuweisungen', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const baseRows = req.user.rolle === 'hauptadmin' || req.user.rolle === 'superadmin'
    ? currentScannerAssignments(data)
    : filterByStandort(data, currentScannerAssignments(data), req.user, req, (item) => Number(item.standort_id || 0));
  const rows = baseRows
    .sort((a, b) => Number(a.rampe_nummer) - Number(b.rampe_nummer));
  res.json(rows);
});

app.post('/api/scanner-zuweisungen', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const scanner_id = Number(req.body.scanner_id);
  const rampe_id = Number(req.body.rampe_id);
  const notiz = String(req.body.notiz || '').trim();
  const scanner = (data.scanner_geraete || []).find((item) => Number(item.id) === scanner_id);
  const rampe = (data.rampen || []).find((item) => Number(item.id) === rampe_id);
  if (!scanner || !rampe) return res.status(404).json({ error: 'Scanner oder Rampe nicht gefunden.' });

  const previousScannerAssignment = (data.scanner_zuweisungen || []).find((item) => Number(item.scanner_id) === scanner_id && Number(item.aktiv) === 1);
  const previousRampAssignment = (data.scanner_zuweisungen || []).find((item) => Number(item.rampe_id) === rampe_id && Number(item.aktiv) === 1);
  const now = nowIso();

  [previousScannerAssignment, previousRampAssignment]
    .filter(Boolean)
    .forEach((item) => {
      item.aktiv = 0;
      item.bis = now;
    });
  if (previousRampAssignment && Number(previousRampAssignment.scanner_id) !== scanner_id) {
    const displacedScanner = (data.scanner_geraete || []).find((item) => Number(item.id) === Number(previousRampAssignment.scanner_id));
    if (displacedScanner) displacedScanner.status = 'verfuegbar';
  }

  const row = {
    id: nextId(data.scanner_zuweisungen || []),
    mandant_id: req.user.mandant_id || 1,
    scanner_id,
    rampe_id,
    standort_id: Number(rampe.standort_id || scanner.standort_id || selectedStandortId(req, req.user) || 0) || null,
    notiz,
    aktiv: 1,
    von: now,
    bis: '',
    created_at: now
  };
  data.scanner_zuweisungen = [...(data.scanner_zuweisungen || []), row];
  scanner.status = 'zugewiesen';
  scanner.standort_id = row.standort_id || scanner.standort_id;

  const previousRampText = previousScannerAssignment ? ` zuvor ${rampLabel((data.rampen || []).find((entry) => Number(entry.id) === Number(previousScannerAssignment.rampe_id))?.nummer || previousScannerAssignment.rampe_id)}` : '';
  const detail = `${scanner.bezeichnung} wurde ${rampLabel(rampe.nummer)} zugeordnet.${previousRampText}`;
  pushSystemNotification(data, req.user, {
    typ: 'scanner',
    titel: 'Scanner-Zuordnung aktualisiert',
    text: detail,
    modul: 'scanner',
    standort_id: row.standort_id
  });
  logActivity(data, req.user, 'scanner', 'scanner_zugeordnet', detail, row.standort_id);
  writeDb(data);
  res.json({ ok: true, row });
});

app.delete('/api/scanner-zuweisungen/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const row = (data.scanner_zuweisungen || []).find((item) => Number(item.id) === Number(req.params.id) && Number(item.aktiv) === 1);
  if (!row) return res.status(404).json({ error: 'Zuweisung nicht gefunden.' });
  row.aktiv = 0;
  row.bis = nowIso();
  const scanner = (data.scanner_geraete || []).find((item) => Number(item.id) === Number(row.scanner_id));
  if (scanner) scanner.status = 'verfuegbar';
  const rampe = (data.rampen || []).find((item) => Number(item.id) === Number(row.rampe_id));
  const detail = `${scanner?.bezeichnung || scannerLabel(row.scanner_id)} wurde von ${rampe ? rampLabel(rampe.nummer) : 'der Rampe'} geloest.`;
  pushSystemNotification(data, req.user, {
    typ: 'scanner',
    titel: 'Scanner-Zuordnung geloest',
    text: detail,
    modul: 'scanner',
    standort_id: row.standort_id
  });
  logActivity(data, req.user, 'scanner', 'scanner_geloest', detail, row.standort_id);
  writeDb(data);
  res.json({ ok: true });
});

app.get('/api/system-notifications', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const rows = filterByStandort(data, data.system_notifications || [], req.user, req, (item) => Number(item.standort_id || 0))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 20);
  res.json(rows);
});

app.get('/api/backoffice/kunden', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const rows = (data.backoffice_kunden || [])
    .map((item) => ({
      ...item,
      zusatzmodule: parseModuleList(item.zusatzmodule || []),
      inklusive_module: effectiveModules(item.paket || 'Kostenlos', []),
      effektive_module: effectiveModules(item.paket || 'Kostenlos', item.zusatzmodule || []),
      mandant_name: (data.mandanten || []).find((mandant) => Number(mandant.id) === Number(item.mandant_id))?.name || item.firma
    }))
    .sort((a, b) => String(a.firma || '').localeCompare(String(b.firma || ''), 'de'));
  res.json(rows);
});

app.get('/api/backoffice/module-catalog', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const rows = (data.backoffice_module_catalog || []).slice().sort((a, b) => String(a.label || a.name || '').localeCompare(String(b.label || b.name || ''), 'de'));
  res.json(rows);
});

app.post('/api/backoffice/module-catalog', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const name = String(req.body.name || '').trim().toLowerCase();
  const label = String(req.body.label || req.body.name || '').trim();
  if (!name || !label) return res.status(400).json({ error: 'Modulname und Label sind Pflicht.' });
  if ((data.backoffice_module_catalog || []).some((item) => String(item.name || '').trim().toLowerCase() === name)) {
    return res.status(409).json({ error: 'Dieses Modul existiert bereits.' });
  }
  const row = {
    id: nextId(data.backoffice_module_catalog || []),
    name,
    label,
    status: String(req.body.status || 'aktiv').trim() || 'aktiv',
    created_at: nowIso()
  };
  data.backoffice_module_catalog = data.backoffice_module_catalog || [];
  data.backoffice_module_catalog.push(row);
  logActivity(data, req.user, 'backoffice', 'modul_angelegt', row.label);
  writeDb(data);
  res.status(201).json(row);
});

app.put('/api/backoffice/module-catalog/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const row = (data.backoffice_module_catalog || []).find((item) => Number(item.id) === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Modul nicht gefunden.' });
  const nextName = String(req.body.name || row.name || '').trim().toLowerCase();
  const nextLabel = String(req.body.label || row.label || '').trim();
  if (!nextName || !nextLabel) return res.status(400).json({ error: 'Modulname und Label sind Pflicht.' });
  if ((data.backoffice_module_catalog || []).some((item) => Number(item.id) !== Number(row.id) && String(item.name || '').trim().toLowerCase() === nextName)) {
    return res.status(409).json({ error: 'Dieses Modul existiert bereits.' });
  }
  row.name = nextName;
  row.label = nextLabel;
  row.status = String(req.body.status || row.status || 'aktiv').trim() || 'aktiv';
  logActivity(data, req.user, 'backoffice', 'modul_aktualisiert', row.label);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/module-catalog/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const row = (data.backoffice_module_catalog || []).find((item) => Number(item.id) === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Modul nicht gefunden.' });
  data.backoffice_module_catalog = (data.backoffice_module_catalog || []).filter((item) => Number(item.id) !== Number(row.id));
  data.backoffice_kunden = (data.backoffice_kunden || []).map((item) => ({
    ...item,
    zusatzmodule: parseModuleList(item.zusatzmodule || []).filter((entry) => entry !== row.name)
  }));
  logActivity(data, req.user, 'backoffice', 'modul_geloescht', row.label);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/backoffice/dashboard', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const customers = data.backoffice_kunden || [];
  const leads = data.backoffice_leads || [];
  const tickets = data.backoffice_tickets || [];
  const invoices = data.backoffice_rechnungen || [];
  const activities = (data.aktivitaeten || []).slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 6);
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const monthlyPaid = invoices
    .filter((item) => item.status === 'bezahlt' && String(item.created_at || '').startsWith(monthPrefix))
    .reduce((sum, item) => sum + Number(item.betrag || 0), 0);

  res.json({
    kpis: {
      activeCustomers: customers.filter((item) => item.status === 'aktiv').length,
      openTickets: tickets.filter((item) => item.status !== 'erledigt').length,
      monthlyRevenue: monthlyPaid,
      newLeads: leads.filter((item) => item.status === 'neu').length
    },
    customerStatus: {
      aktiv: customers.filter((item) => item.status === 'aktiv').length,
      test: customers.filter((item) => item.status === 'test').length,
      pausiert: customers.filter((item) => item.status === 'pausiert').length,
      gekuendigt: customers.filter((item) => item.status === 'gekuendigt').length
    },
    recentCustomers: customers.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 3),
    ticketStatus: {
      offen: tickets.filter((item) => item.status === 'offen').length,
      in_bearbeitung: tickets.filter((item) => item.status === 'in_bearbeitung').length,
      wartet_auf_kunde: tickets.filter((item) => item.status === 'wartet_auf_kunde').length,
      erledigt: tickets.filter((item) => item.status === 'erledigt').length
    },
    recentTickets: tickets.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 3),
    leadStatus: {
      neu: leads.filter((item) => item.status === 'neu').length,
      demo: leads.filter((item) => item.status === 'demo').length,
      angebot: leads.filter((item) => item.status === 'angebot').length,
      gewonnen: leads.filter((item) => item.status === 'gewonnen').length
    },
    recentLeads: leads.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 3),
    finance: {
      offen: invoices.filter((item) => item.status === 'offen').reduce((sum, item) => sum + Number(item.betrag || 0), 0),
      ueberfaellig: invoices.filter((item) => item.status === 'ueberfaellig').reduce((sum, item) => sum + Number(item.betrag || 0), 0),
      monthlyCount: invoices.filter((item) => String(item.created_at || '').startsWith(monthPrefix)).length
    },
    recentInvoices: invoices.slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 3),
    activities: activities.map((item) => ({
      modul: item.modul || '',
      aktion: item.aktion || '',
      details: item.details || '',
      created_at: item.created_at || ''
    })),
    system: {
      mandanten: (data.mandanten || []).length,
      users: (data.benutzer || []).length,
      lastBackup: 'heute 03:00'
    }
  });
});

app.get('/api/backoffice/mandanten', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const rows = (data.mandanten || []).map((item) => {
    const customer = (data.backoffice_kunden || []).find((entry) => Number(entry.mandant_id || entry.id) === Number(item.id));
    const users = (data.benutzer || []).filter((entry) => Number(entry.mandant_id || 1) === Number(item.id)).length;
    const sub = String(item.subdomain || '').trim();
    return {
      ...item,
      firma: customer?.firma || item.name || '',
      users,
      url: sub ? `app.${sub}.fleetcontrol24.de` : '-',
      status: item.aktiv === false ? 'pausiert' : 'aktiv'
    };
  }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
  res.json(rows);
});

app.post('/api/backoffice/mandanten', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Mandantenname ist Pflicht.' });
  const id = nextId(data.mandanten || []);
  const row = {
    id,
    name,
    subdomain: String(req.body.subdomain || '').trim().toLowerCase(),
    aktiv: String(req.body.aktiv) !== 'false',
    created_at: nowIso()
  };
  data.mandanten = data.mandanten || [];
  data.mandanten.push(row);
  if (!(data.backoffice_kunden || []).some((item) => Number(item.mandant_id || item.id) === id)) {
    data.backoffice_kunden = data.backoffice_kunden || [];
    data.backoffice_kunden.push({
      id: nextId(data.backoffice_kunden || []),
      mandant_id: id,
      firma: String(req.body.firma || name).trim() || name,
      ansprechpartner: '',
      email: '',
      telefon: '',
      paket: 'Starter',
      status: row.aktiv ? 'aktiv' : 'pausiert',
      standorte: 1,
      notiz: '',
      created_at: row.created_at
    });
  }
  initializeMandantData(data, {
    mandantId: id,
    companyName: String(req.body.firma || name).trim() || name,
    packageName: 'Starter',
    extraModules: []
  });
  logActivity(data, req.user, 'backoffice', 'mandant_angelegt', name);
  writeDb(data);
  res.json(row);
});

app.put('/api/backoffice/mandanten/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.mandanten || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Mandant nicht gefunden.' });
  row.name = String(req.body.name || row.name || '').trim();
  row.subdomain = String(req.body.subdomain || row.subdomain || '').trim().toLowerCase();
  row.aktiv = String(req.body.aktiv) !== 'false';
  const customer = (data.backoffice_kunden || []).find((item) => Number(item.mandant_id || item.id) === id);
  if (customer) {
    customer.firma = String(req.body.firma || customer.firma || row.name).trim();
    customer.status = row.aktiv ? 'aktiv' : 'pausiert';
    initializeMandantData(data, {
      mandantId: id,
      companyName: customer.firma,
      packageName: customer.paket || 'Starter',
      extraModules: customer.zusatzmodule || []
    });
  }
  logActivity(data, req.user, 'backoffice', 'mandant_aktualisiert', row.name);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/mandanten/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.mandanten || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Mandant nicht gefunden.' });

  const hasOperationalData =
    (data.fahrzeuge || []).some((item) => Number(item.mandant_id || 1) === id) ||
    (data.werkstatt || []).some((item) => Number(item.mandant_id || 1) === id) ||
    (data.schaeden || []).some((item) => Number(item.mandant_id || 1) === id) ||
    (data.uvv_pruefungen || []).some((item) => Number(item.mandant_id || 1) === id) ||
    (data.kontakte || []).some((item) => Number(item.mandant_id || 1) === id) ||
    (data.reinigung || []).some((item) => Number(item.mandant_id || 1) === id) ||
    (data.fahrzeug_dokumente || []).some((item) => Number(item.mandant_id || 1) === id) ||
    (data.fuehrerscheinkontrollen || []).some((item) => Number(item.mandant_id || 1) === id) ||
    (data.kalender_events || []).some((item) => Number(item.mandant_id || 1) === id);

  if (hasOperationalData) {
    return res.status(400).json({ error: 'Mandant kann nicht geloescht werden, weil bereits echter Fuhrpark-Bestand vorhanden ist.' });
  }

  const customerIds = (data.backoffice_kunden || [])
    .filter((item) => Number(item.mandant_id || item.id) === id)
    .map((item) => Number(item.id));
  const linkedUserIds = (data.benutzer || [])
    .filter((item) => Number(item.mandant_id || 1) === id)
    .map((item) => Number(item.id));

  data.backoffice_mitarbeiter = (data.backoffice_mitarbeiter || []).filter((item) => {
    const matchesCustomer = customerIds.includes(Number(item.customer_id));
    const matchesUser = linkedUserIds.includes(Number(item.linked_benutzer_id));
    return !(matchesCustomer || matchesUser);
  });
  data.backoffice_kunden = (data.backoffice_kunden || []).filter((item) => Number(item.mandant_id || item.id) !== id);
  data.benutzer = (data.benutzer || []).filter((item) => Number(item.mandant_id || 1) !== id);
  data.workshop_bereiche = (data.workshop_bereiche || []).filter((item) => {
    const standort = (data.standorte || []).find((entry) => Number(entry.id) === Number(item.standort_id));
    return Number(standort?.mandant_id || 1) !== id;
  });
  data.standorte = (data.standorte || []).filter((item) => Number(item.mandant_id || 1) !== id);
  data.mandanten = (data.mandanten || []).filter((item) => Number(item.id) !== id);

  logActivity(data, req.user, 'backoffice', 'mandant_geloescht', row.name);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/backoffice/pakete', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const rows = (data.backoffice_pakete || []).sort((a, b) => Number(a.id) - Number(b.id));
  res.json(rows);
});

app.post('/api/backoffice/pakete', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Paketname ist Pflicht.' });
  const row = normalizePackageRow({
    id: nextId(data.backoffice_pakete || []),
    name,
    preis: req.body.preis,
    standorte: req.body.standorte,
    beschreibung: req.body.beschreibung,
    abrechnung: req.body.abrechnung,
    status: req.body.status,
    leistungen: req.body.leistungen,
    created_at: nowIso()
  });
  data.backoffice_pakete = data.backoffice_pakete || [];
  data.backoffice_pakete.push(row);
  logActivity(data, req.user, 'backoffice', 'paket_angelegt', row.name);
  writeDb(data);
  res.json(row);
});

app.put('/api/backoffice/pakete/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_pakete || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Paket nicht gefunden.' });
  Object.assign(row, normalizePackageRow({
    ...row,
    name: req.body.name || row.name,
    preis: req.body.preis || row.preis,
    standorte: req.body.standorte || row.standorte,
    beschreibung: req.body.beschreibung || row.beschreibung,
    abrechnung: req.body.abrechnung || row.abrechnung,
    status: req.body.status || row.status,
    leistungen: req.body.leistungen || row.leistungen
  }));
  logActivity(data, req.user, 'backoffice', 'paket_aktualisiert', row.name);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/pakete/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_pakete || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Paket nicht gefunden.' });
  data.backoffice_pakete = (data.backoffice_pakete || []).filter((item) => Number(item.id) !== id);
  logActivity(data, req.user, 'backoffice', 'paket_geloescht', row.name);
  writeDb(data);
  res.json({ success: true });
});

app.post('/api/backoffice/kunden', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const firma = String(req.body.firma || '').trim();
  if (!firma) return res.status(400).json({ error: 'Firmenname ist Pflicht.' });
  const row = {
    id: nextId(data.backoffice_kunden || []),
    mandant_id: Number(req.body.mandant_id) || nextId(data.mandanten || []),
    firma,
    ansprechpartner: String(req.body.ansprechpartner || '').trim(),
    email: String(req.body.email || '').trim(),
    telefon: String(req.body.telefon || '').trim(),
    paket: String(req.body.paket || 'Starter').trim() || 'Starter',
    zusatzmodule: sanitizeCustomerAddonModules(data, req.body.paket || 'Starter', req.body.zusatzmodule || []),
    status: String(req.body.status || 'aktiv').trim() || 'aktiv',
    standorte: Number(req.body.standorte) > 0 ? Number(req.body.standorte) : 1,
    notiz: String(req.body.notiz || '').trim(),
    created_at: nowIso()
  };

  data.backoffice_kunden = data.backoffice_kunden || [];
  data.backoffice_kunden.push(row);

  if (!(data.mandanten || []).some((mandant) => Number(mandant.id) === Number(row.mandant_id))) {
    data.mandanten = data.mandanten || [];
    data.mandanten.push({
      id: row.mandant_id,
      name: row.firma,
      subdomain: '',
      aktiv: row.status !== 'pausiert' && row.status !== 'gekuendigt',
      created_at: row.created_at
    });
  }

  initializeMandantData(data, {
    mandantId: row.mandant_id,
    companyName: row.firma,
    packageName: row.paket,
    extraModules: row.zusatzmodule
  });
  row.standorte = (data.standorte || []).filter((item) => Number(item.mandant_id || 1) === Number(row.mandant_id)).length || row.standorte || 1;

  logActivity(data, req.user, 'backoffice', 'kunde_angelegt', row.firma);
  writeDb(data);
  res.json(row);
});

app.put('/api/backoffice/kunden/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_kunden || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Kunde nicht gefunden.' });
  const firma = String(req.body.firma || row.firma || '').trim();
  if (!firma) return res.status(400).json({ error: 'Firmenname ist Pflicht.' });

  row.firma = firma;
  row.ansprechpartner = String(req.body.ansprechpartner || '').trim();
  row.email = String(req.body.email || '').trim();
  row.telefon = String(req.body.telefon || '').trim();
  row.paket = String(req.body.paket || 'Starter').trim() || 'Starter';
  row.zusatzmodule = sanitizeCustomerAddonModules(data, row.paket, req.body.zusatzmodule || row.zusatzmodule || []);
  row.status = String(req.body.status || 'aktiv').trim() || 'aktiv';
  row.standorte = Number(req.body.standorte) > 0 ? Number(req.body.standorte) : 1;
  row.notiz = String(req.body.notiz || '').trim();

  const mandant = (data.mandanten || []).find((item) => Number(item.id) === Number(row.mandant_id));
  if (mandant) {
    mandant.name = row.firma;
    mandant.aktiv = row.status !== 'pausiert' && row.status !== 'gekuendigt';
  }
  initializeMandantData(data, {
    mandantId: row.mandant_id,
    companyName: row.firma,
    packageName: row.paket,
    extraModules: row.zusatzmodule
  });
  row.standorte = (data.standorte || []).filter((item) => Number(item.mandant_id || 1) === Number(row.mandant_id)).length || row.standorte || 1;

  logActivity(data, req.user, 'backoffice', 'kunde_aktualisiert', row.firma);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/kunden/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_kunden || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Kunde nicht gefunden.' });
  data.backoffice_kunden = (data.backoffice_kunden || []).filter((item) => Number(item.id) !== id);
  logActivity(data, req.user, 'backoffice', 'kunde_geloescht', row.firma);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/backoffice/leads', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const rows = (data.backoffice_leads || []).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) * -1);
  res.json(rows);
});

app.post('/api/backoffice/leads', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const name = String(req.body.name || '').trim();
  const firma = String(req.body.firma || '').trim();
  if (!name || !firma) return res.status(400).json({ error: 'Name und Firma sind Pflicht.' });
  const row = {
    id: nextId(data.backoffice_leads || []),
    name,
    firma,
    email: String(req.body.email || '').trim(),
    telefon: String(req.body.telefon || '').trim(),
    fahrzeuge: Number(req.body.fahrzeuge) > 0 ? Number(req.body.fahrzeuge) : 0,
    status: String(req.body.status || 'neu').trim() || 'neu',
    quelle: String(req.body.quelle || '').trim(),
    anfrage_typ: String(req.body.anfrage_typ || '').trim(),
    paket_wunsch: String(req.body.paket_wunsch || '').trim(),
    demo_start: String(req.body.demo_start || '').trim(),
    demo_end: String(req.body.demo_end || '').trim(),
    notiz: String(req.body.notiz || '').trim(),
    created_at: nowIso()
  };
  if (row.status === 'demo') {
    row.demo_start = row.demo_start || nowIso().slice(0, 10);
    row.demo_end = row.demo_end || addDaysIso(row.demo_start, 7);
  } else {
    row.demo_start = row.demo_start || '';
    row.demo_end = row.demo_end || '';
  }
  data.backoffice_leads = data.backoffice_leads || [];
  data.backoffice_leads.push(row);
  logActivity(data, req.user, 'backoffice', 'lead_angelegt', `${row.firma} - ${row.name}`);
  writeDb(data);
  res.json(row);
});

app.put('/api/backoffice/leads/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_leads || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Lead nicht gefunden.' });
  row.name = String(req.body.name || row.name || '').trim();
  row.firma = String(req.body.firma || row.firma || '').trim();
  row.email = String(req.body.email || '').trim();
  row.telefon = String(req.body.telefon || '').trim();
  row.fahrzeuge = Number(req.body.fahrzeuge) > 0 ? Number(req.body.fahrzeuge) : 0;
  row.status = String(req.body.status || row.status || 'neu').trim() || 'neu';
  row.quelle = String(req.body.quelle || '').trim();
  row.anfrage_typ = String(req.body.anfrage_typ || row.anfrage_typ || '').trim();
  row.paket_wunsch = String(req.body.paket_wunsch || row.paket_wunsch || '').trim();
  row.demo_start = String(req.body.demo_start || row.demo_start || '').trim();
  row.demo_end = String(req.body.demo_end || row.demo_end || '').trim();
  row.notiz = String(req.body.notiz || '').trim();
  if (row.status === 'demo') {
    row.demo_start = row.demo_start || nowIso().slice(0, 10);
    row.demo_end = row.demo_end || addDaysIso(row.demo_start, 7);
  } else {
    row.demo_start = '';
    row.demo_end = '';
  }
  if (!row.name || !row.firma) return res.status(400).json({ error: 'Name und Firma sind Pflicht.' });
  logActivity(data, req.user, 'backoffice', 'lead_aktualisiert', `${row.firma} - ${row.name}`);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/leads/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_leads || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Anfrage nicht gefunden.' });
  data.backoffice_leads = (data.backoffice_leads || []).filter((item) => Number(item.id) !== id);
  logActivity(data, req.user, 'backoffice', 'lead_geloescht', `${row.firma} - ${row.name}`);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/backoffice/tickets', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const rows = (data.backoffice_tickets || []).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) * -1);
  res.json(rows);
});

app.post('/api/backoffice/tickets', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const kunde = String(req.body.kunde || '').trim();
  const betreff = String(req.body.betreff || '').trim();
  if (!kunde || !betreff) return res.status(400).json({ error: 'Kunde und Betreff sind Pflicht.' });
  const row = {
    id: nextId(data.backoffice_tickets || []),
    kunde,
    betreff,
    prioritaet: String(req.body.prioritaet || 'normal').trim() || 'normal',
    status: String(req.body.status || 'offen').trim() || 'offen',
    zustaendig: String(req.body.zustaendig || '').trim(),
    notiz: String(req.body.notiz || '').trim(),
    created_at: nowIso()
  };
  data.backoffice_tickets = data.backoffice_tickets || [];
  data.backoffice_tickets.push(row);
  logActivity(data, req.user, 'backoffice', 'ticket_angelegt', `${row.kunde} - ${row.betreff}`);
  writeDb(data);
  res.json(row);
});

app.put('/api/backoffice/tickets/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_tickets || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Ticket nicht gefunden.' });
  row.kunde = String(req.body.kunde || row.kunde || '').trim();
  row.betreff = String(req.body.betreff || row.betreff || '').trim();
  row.prioritaet = String(req.body.prioritaet || row.prioritaet || 'normal').trim() || 'normal';
  row.status = String(req.body.status || row.status || 'offen').trim() || 'offen';
  row.zustaendig = String(req.body.zustaendig || '').trim();
  row.notiz = String(req.body.notiz || '').trim();
  if (!row.kunde || !row.betreff) return res.status(400).json({ error: 'Kunde und Betreff sind Pflicht.' });
  logActivity(data, req.user, 'backoffice', 'ticket_aktualisiert', `${row.kunde} - ${row.betreff}`);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/tickets/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_tickets || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Ticket nicht gefunden.' });
  data.backoffice_tickets = (data.backoffice_tickets || []).filter((item) => Number(item.id) !== id);
  logActivity(data, req.user, 'backoffice', 'ticket_geloescht', `${row.kunde} - ${row.betreff}`);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/backoffice/rechnungen', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const rows = (data.backoffice_rechnungen || []).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) * -1);
  res.json(rows);
});

app.post('/api/backoffice/rechnungen', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const kunde = String(req.body.kunde || '').trim();
  if (!kunde) return res.status(400).json({ error: 'Kunde ist Pflicht.' });
  const row = {
    id: nextId(data.backoffice_rechnungen || []),
    nummer: String(req.body.nummer || `R-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`).trim(),
    kunde,
    betrag: Number(req.body.betrag || 0),
    faellig_am: String(req.body.faellig_am || '').trim(),
    status: String(req.body.status || 'entwurf').trim() || 'entwurf',
    notiz: String(req.body.notiz || '').trim(),
    created_at: nowIso()
  };
  data.backoffice_rechnungen = data.backoffice_rechnungen || [];
  data.backoffice_rechnungen.push(row);
  logActivity(data, req.user, 'backoffice', 'rechnung_angelegt', `${row.kunde} - ${row.nummer}`);
  writeDb(data);
  res.json(row);
});

app.put('/api/backoffice/rechnungen/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_rechnungen || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Rechnung nicht gefunden.' });
  row.nummer = String(req.body.nummer || row.nummer || '').trim();
  row.kunde = String(req.body.kunde || row.kunde || '').trim();
  row.betrag = Number(req.body.betrag ?? row.betrag ?? 0);
  row.faellig_am = String(req.body.faellig_am || row.faellig_am || '').trim();
  row.status = String(req.body.status || row.status || 'entwurf').trim() || 'entwurf';
  row.notiz = String(req.body.notiz || '').trim();
  logActivity(data, req.user, 'backoffice', 'rechnung_aktualisiert', `${row.kunde} - ${row.nummer}`);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/rechnungen/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_rechnungen || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Rechnung nicht gefunden.' });
  data.backoffice_rechnungen = (data.backoffice_rechnungen || []).filter((item) => Number(item.id) !== id);
  logActivity(data, req.user, 'backoffice', 'rechnung_geloescht', `${row.kunde} - ${row.nummer}`);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/backoffice/angebote', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const rows = (data.backoffice_angebote || []).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) * -1);
  res.json(rows);
});

app.post('/api/backoffice/angebote', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const kunde = String(req.body.kunde || '').trim();
  if (!kunde) return res.status(400).json({ error: 'Kunde ist Pflicht.' });
  const row = {
    id: nextId(data.backoffice_angebote || []),
    kunde,
    paket: String(req.body.paket || 'Starter').trim() || 'Starter',
    volumen: String(req.body.volumen || '').trim(),
    status: String(req.body.status || 'entwurf').trim() || 'entwurf',
    stand: String(req.body.stand || '').trim(),
    notiz: String(req.body.notiz || '').trim(),
    created_at: nowIso()
  };
  data.backoffice_angebote = data.backoffice_angebote || [];
  data.backoffice_angebote.push(row);
  logActivity(data, req.user, 'backoffice', 'angebot_angelegt', `${row.kunde} - ${row.paket}`);
  writeDb(data);
  res.json(row);
});

app.put('/api/backoffice/angebote/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_angebote || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Angebot nicht gefunden.' });
  row.kunde = String(req.body.kunde || row.kunde || '').trim();
  row.paket = String(req.body.paket || row.paket || 'Starter').trim() || 'Starter';
  row.volumen = String(req.body.volumen || row.volumen || '').trim();
  row.status = String(req.body.status || row.status || 'entwurf').trim() || 'entwurf';
  row.stand = String(req.body.stand || row.stand || '').trim();
  row.notiz = String(req.body.notiz || '').trim();
  logActivity(data, req.user, 'backoffice', 'angebot_aktualisiert', `${row.kunde} - ${row.paket}`);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/angebote/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_angebote || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Angebot nicht gefunden.' });
  data.backoffice_angebote = (data.backoffice_angebote || []).filter((item) => Number(item.id) !== id);
  logActivity(data, req.user, 'backoffice', 'angebot_geloescht', `${row.kunde} - ${row.paket}`);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/backoffice/mitarbeiter', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const rows = (data.backoffice_mitarbeiter || [])
    .map((item) => {
      const inferredCustomer = (data.backoffice_kunden || []).find((entry) => Number(entry.id) === Number(item.customer_id))
        || (data.backoffice_kunden || []).find((entry) => String(entry.firma || '').trim().toLowerCase() === String(item.kunde || '').trim().toLowerCase());
      const linkedUser = (data.benutzer || []).find((entry) => Number(entry.id) === Number(item.linked_benutzer_id));
      return {
        ...item,
        customer_id: Number(item.customer_id) || Number(inferredCustomer?.id) || null,
        kunde: inferredCustomer?.firma || item.kunde || '',
        benutzername: linkedUser?.benutzername || item.benutzername || '',
        app_rolle: linkedUser?.rolle || item.app_rolle || 'admin',
        linked_benutzer_id: linkedUser?.id || item.linked_benutzer_id || null
      };
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
  res.json(rows.filter((item) => Number(item.customer_id) > 0));
});

app.post('/api/backoffice/mitarbeiter', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const name = String(req.body.name || '').trim();
  const customerId = Number(req.body.customer_id) || null;
  const benutzername = String(req.body.benutzername || '').trim();
  const email = String(req.body.email || '').trim();
  const passwort = String(req.body.passwort || '');
  const requestedRole = normalizeBackofficeEmployeeRole(req.body.app_rolle);
  if (!name) return res.status(400).json({ error: 'Name ist Pflicht.' });
  if (!customerId) return res.status(400).json({ error: 'Bitte einen Kunden auswaehlen.' });
  if (!benutzername || !email) return res.status(400).json({ error: 'Benutzername und E-Mail sind Pflicht.' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Bitte eine gueltige E-Mail angeben.' });
  if (!canGrantAppRole(req.user.rolle, requestedRole)) {
    return res.status(403).json({ error: 'Diese App-Rolle darf nicht vergeben werden.' });
  }
  const passwordError = validatePasswordStrength(passwort);
  if (passwordError) return res.status(400).json({ error: passwordError });
  const customer = (data.backoffice_kunden || []).find((item) => Number(item.id) === customerId);
  if (!customer) return res.status(404).json({ error: 'Kunde nicht gefunden.' });
  ensureMandantStarterData(data, { mandantId: customer.mandant_id, companyName: customer.firma });
  if (findUserConflict(data, benutzername, email)) {
    return res.status(400).json({ error: 'Benutzername oder E-Mail ist bereits vergeben.' });
  }
  const linkedUser = {
    id: nextId(data.benutzer || []),
    mandant_id: Number(customer.mandant_id) || 1,
    benutzername,
    name,
    email,
    passwort_hash: bcrypt.hashSync(passwort, 10),
    rolle: requestedRole,
    standort_id: firstMandantLocationId(data, customer.mandant_id),
    aktiv: employeeStatusToAktiv(req.body.status),
    created_at: nowIso()
  };
  data.benutzer = data.benutzer || [];
  data.benutzer.push(linkedUser);
  const row = {
    id: nextId(data.backoffice_mitarbeiter || []),
    name,
    customer_id: customerId,
    kunde: customer.firma,
    rolle: String(req.body.rolle || 'fuhrparkleitung').trim() || 'fuhrparkleitung',
    app_rolle: linkedUser.rolle,
    linked_benutzer_id: linkedUser.id,
    benutzername: linkedUser.benutzername,
    email,
    telefon: String(req.body.telefon || '').trim(),
    status: String(req.body.status || 'aktiv').trim() || 'aktiv',
    created_at: nowIso()
  };
  data.backoffice_mitarbeiter = data.backoffice_mitarbeiter || [];
  data.backoffice_mitarbeiter.push(row);
  logActivity(data, req.user, 'backoffice', 'mitarbeiter_angelegt', row.name);
  writeDb(data);
  res.json(row);
});

app.put('/api/backoffice/mitarbeiter/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_mitarbeiter || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden.' });
  const customerId = Number(req.body.customer_id || row.customer_id) || null;
  if (!customerId) return res.status(400).json({ error: 'Bitte einen Kunden auswaehlen.' });
  const customer = (data.backoffice_kunden || []).find((item) => Number(item.id) === customerId);
  if (!customer) return res.status(404).json({ error: 'Kunde nicht gefunden.' });
  const linkedUser = (data.benutzer || []).find((item) => Number(item.id) === Number(row.linked_benutzer_id));
  if (!linkedUser) return res.status(404).json({ error: 'Verknuepfter Fuhrpark-Benutzer nicht gefunden.' });
  const nextBenutzername = String(req.body.benutzername || linkedUser.benutzername || row.benutzername || '').trim();
  const nextName = String(req.body.name || row.name || '').trim();
  const nextEmail = String(req.body.email || linkedUser.email || row.email || '').trim();
  const requestedRole = normalizeBackofficeEmployeeRole(req.body.app_rolle || row.app_rolle);
  if (!nextName || !nextBenutzername || !nextEmail) {
    return res.status(400).json({ error: 'Name, Benutzername und E-Mail sind Pflicht.' });
  }
  if (!isValidEmail(nextEmail)) return res.status(400).json({ error: 'Bitte eine gueltige E-Mail angeben.' });
  if (!canGrantAppRole(req.user.rolle, requestedRole)) {
    return res.status(403).json({ error: 'Diese App-Rolle darf nicht vergeben werden.' });
  }
  if (findUserConflict(data, nextBenutzername, nextEmail, linkedUser.id)) {
    return res.status(400).json({ error: 'Benutzername oder E-Mail ist bereits vergeben.' });
  }
  if (req.body.passwort) {
    const passwordError = validatePasswordStrength(req.body.passwort);
    if (passwordError) return res.status(400).json({ error: passwordError });
    linkedUser.passwort_hash = bcrypt.hashSync(String(req.body.passwort), 10);
  }
  ensureMandantStarterData(data, { mandantId: customer.mandant_id, companyName: customer.firma });
  linkedUser.mandant_id = Number(customer.mandant_id) || 1;
  linkedUser.benutzername = nextBenutzername;
  linkedUser.name = nextName;
  linkedUser.email = nextEmail;
  linkedUser.rolle = requestedRole;
  linkedUser.standort_id = firstMandantLocationId(data, customer.mandant_id);
  linkedUser.aktiv = employeeStatusToAktiv(req.body.status || row.status);

  row.name = nextName;
  row.customer_id = customerId;
  row.kunde = customer.firma;
  row.rolle = String(req.body.rolle || row.rolle || 'fuhrparkleitung').trim() || 'fuhrparkleitung';
  row.app_rolle = linkedUser.rolle;
  row.benutzername = linkedUser.benutzername;
  row.email = linkedUser.email;
  row.telefon = String(req.body.telefon || row.telefon || '').trim();
  row.status = String(req.body.status || row.status || 'aktiv').trim() || 'aktiv';
  logActivity(data, req.user, 'backoffice', 'mitarbeiter_aktualisiert', row.name);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/mitarbeiter/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_mitarbeiter || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Teammitglied nicht gefunden.' });
  if (row.linked_benutzer_id) {
    data.benutzer = (data.benutzer || []).filter((item) => Number(item.id) !== Number(row.linked_benutzer_id));
  }
  data.backoffice_mitarbeiter = (data.backoffice_mitarbeiter || []).filter((item) => Number(item.id) !== id);
  logActivity(data, req.user, 'backoffice', 'mitarbeiter_geloescht', row.name);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/backoffice/personal', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const rows = (data.backoffice_personal || [])
    .map((item) => {
      const linkedUser = (data.benutzer || []).find((entry) => Number(entry.id) === Number(item.linked_benutzer_id));
      return {
        ...item,
        backoffice_rolle: normalizeBackofficePortalRole(linkedUser?.rolle || item.backoffice_rolle),
        zugang_login: linkedUser?.benutzername || item.zugang_login || '',
        email: linkedUser?.email || item.email || '',
        linked_benutzer_id: linkedUser?.id || item.linked_benutzer_id || null
      };
    })
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de'));
  res.json(rows);
});

app.post('/api/backoffice/personal', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name ist Pflicht.' });
  const backofficeRolle = normalizeBackofficePortalRole(req.body.backoffice_rolle || 'mitarbeiter');
  const zugangLogin = String(req.body.zugang_login || '').trim();
  const email = String(req.body.email || '').trim();
  const zugangPasswort = String(req.body.zugang_passwort || '').trim();
  let linkedUserId = null;

  if (zugangLogin || email || zugangPasswort) {
    if (!zugangLogin || !email || !zugangPasswort) {
      return res.status(400).json({ error: 'Fuer einen Backoffice-Zugang bitte Login, E-Mail und Passwort angeben.' });
    }
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Bitte eine gueltige E-Mail angeben.' });
    const passwordError = validatePasswordStrength(zugangPasswort);
    if (passwordError) return res.status(400).json({ error: passwordError });
    if (findUserConflict(data, zugangLogin, email)) {
      return res.status(400).json({ error: 'Login oder E-Mail ist bereits vergeben.' });
    }
    const internalUser = {
      id: nextId(data.benutzer || []),
      mandant_id: 1,
      benutzername: zugangLogin,
      name,
      email,
      passwort_hash: bcrypt.hashSync(zugangPasswort, 10),
      rolle: backofficeRolle,
      standort_id: findLocationId(data, 'Carlswerk') || findLocationId(data, 'Frankfurt') || 1,
      aktiv: String(req.body.status || 'aktiv').trim() === 'ausgeschieden' ? 0 : 1,
      created_at: nowIso()
    };
    data.benutzer = data.benutzer || [];
    data.benutzer.push(internalUser);
    linkedUserId = internalUser.id;
  }
  const row = {
    id: nextId(data.backoffice_personal || []),
    name,
    email,
    telefon: String(req.body.telefon || '').trim(),
    abteilung: String(req.body.abteilung || '').trim(),
    rolle: String(req.body.rolle || '').trim(),
    backoffice_rolle: backofficeRolle,
    status: String(req.body.status || 'aktiv').trim() || 'aktiv',
    startdatum: String(req.body.startdatum || '').trim(),
    gehalt: String(req.body.gehalt || '').trim(),
    personalakte_nummer: String(req.body.personalakte_nummer || '').trim(),
    personalakte_status: String(req.body.personalakte_status || '').trim(),
    mitarbeiterportal_status: String(req.body.mitarbeiterportal_status || '').trim(),
    recruiting_phase: String(req.body.recruiting_phase || '').trim(),
    performance_status: String(req.body.performance_status || '').trim(),
    zeiterfassung_modell: String(req.body.zeiterfassung_modell || '').trim(),
    kostenstelle: String(req.body.kostenstelle || '').trim(),
    zugang_login: zugangLogin,
    zugang_passwort: zugangPasswort,
    linked_benutzer_id: linkedUserId,
    notiz: String(req.body.notiz || '').trim(),
    created_at: nowIso()
  };
  data.backoffice_personal = data.backoffice_personal || [];
  data.backoffice_personal.push(row);
  logActivity(data, req.user, 'backoffice', 'personal_angelegt', row.name);
  writeDb(data);
  res.json(row);
});

app.put('/api/backoffice/personal/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_personal || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Personal-Eintrag nicht gefunden.' });
  const backofficeRolle = normalizeBackofficePortalRole(req.body.backoffice_rolle || row.backoffice_rolle || 'mitarbeiter');
  const zugangLogin = String(req.body.zugang_login || row.zugang_login || '').trim();
  const nextEmail = String(req.body.email || row.email || '').trim();
  const zugangPasswort = String(req.body.zugang_passwort || '').trim();
  let linkedUser = (data.benutzer || []).find((item) => Number(item.id) === Number(row.linked_benutzer_id));

  if (zugangLogin || nextEmail || zugangPasswort || linkedUser) {
    if (!zugangLogin || !nextEmail) {
      return res.status(400).json({ error: 'Login und E-Mail sind Pflicht, sobald ein Backoffice-Zugang genutzt wird.' });
    }
    if (!isValidEmail(nextEmail)) return res.status(400).json({ error: 'Bitte eine gueltige E-Mail angeben.' });
    if (linkedUser) {
      if (findUserConflict(data, zugangLogin, nextEmail, linkedUser.id)) {
        return res.status(400).json({ error: 'Login oder E-Mail ist bereits vergeben.' });
      }
      linkedUser.benutzername = zugangLogin;
      linkedUser.email = nextEmail;
      linkedUser.name = String(req.body.name || row.name || '').trim();
      linkedUser.rolle = backofficeRolle;
      linkedUser.aktiv = String(req.body.status || row.status || 'aktiv').trim() === 'ausgeschieden' ? 0 : 1;
      if (zugangPasswort) {
        const passwordError = validatePasswordStrength(zugangPasswort);
        if (passwordError) return res.status(400).json({ error: passwordError });
        linkedUser.passwort_hash = bcrypt.hashSync(zugangPasswort, 10);
      }
    } else {
      if (!zugangPasswort) {
        return res.status(400).json({ error: 'Bitte ein Startpasswort angeben, um einen neuen Backoffice-Zugang anzulegen.' });
      }
      const passwordError = validatePasswordStrength(zugangPasswort);
      if (passwordError) return res.status(400).json({ error: passwordError });
      if (findUserConflict(data, zugangLogin, nextEmail)) {
        return res.status(400).json({ error: 'Login oder E-Mail ist bereits vergeben.' });
      }
      linkedUser = {
        id: nextId(data.benutzer || []),
        mandant_id: 1,
        benutzername: zugangLogin,
        name: String(req.body.name || row.name || '').trim(),
        email: nextEmail,
        passwort_hash: bcrypt.hashSync(zugangPasswort, 10),
        rolle: backofficeRolle,
        standort_id: findLocationId(data, 'Carlswerk') || findLocationId(data, 'Frankfurt') || 1,
        aktiv: String(req.body.status || row.status || 'aktiv').trim() === 'ausgeschieden' ? 0 : 1,
        created_at: nowIso()
      };
      data.benutzer = data.benutzer || [];
      data.benutzer.push(linkedUser);
      row.linked_benutzer_id = linkedUser.id;
    }
  }
  row.name = String(req.body.name || row.name || '').trim();
  row.email = nextEmail;
  row.telefon = String(req.body.telefon || row.telefon || '').trim();
  row.abteilung = String(req.body.abteilung || row.abteilung || '').trim();
  row.rolle = String(req.body.rolle || row.rolle || '').trim();
  row.backoffice_rolle = backofficeRolle;
  row.status = String(req.body.status || row.status || 'aktiv').trim() || 'aktiv';
  row.startdatum = String(req.body.startdatum || row.startdatum || '').trim();
  row.gehalt = String(req.body.gehalt || row.gehalt || '').trim();
  row.personalakte_nummer = String(req.body.personalakte_nummer || row.personalakte_nummer || '').trim();
  row.personalakte_status = String(req.body.personalakte_status || row.personalakte_status || '').trim();
  row.mitarbeiterportal_status = String(req.body.mitarbeiterportal_status || row.mitarbeiterportal_status || '').trim();
  row.recruiting_phase = String(req.body.recruiting_phase || row.recruiting_phase || '').trim();
  row.performance_status = String(req.body.performance_status || row.performance_status || '').trim();
  row.zeiterfassung_modell = String(req.body.zeiterfassung_modell || row.zeiterfassung_modell || '').trim();
  row.kostenstelle = String(req.body.kostenstelle || row.kostenstelle || '').trim();
  row.zugang_login = zugangLogin;
  row.zugang_passwort = zugangPasswort || row.zugang_passwort || '';
  row.notiz = String(req.body.notiz || row.notiz || '').trim();
  if (!row.name) return res.status(400).json({ error: 'Name ist Pflicht.' });
  logActivity(data, req.user, 'backoffice', 'personal_aktualisiert', row.name);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/personal/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_personal || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Personal-Eintrag nicht gefunden.' });
  if (row.linked_benutzer_id) {
    data.benutzer = (data.benutzer || []).filter((item) => Number(item.id) !== Number(row.linked_benutzer_id));
  }
  data.backoffice_personal = (data.backoffice_personal || []).filter((item) => Number(item.id) !== id);
  logActivity(data, req.user, 'backoffice', 'personal_geloescht', row.name);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/backoffice/aufgaben', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const rows = (data.backoffice_aufgaben || []).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) * -1);
  res.json(rows);
});

app.post('/api/backoffice/aufgaben', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const titel = String(req.body.titel || '').trim();
  if (!titel) return res.status(400).json({ error: 'Titel ist Pflicht.' });
  const row = {
    id: nextId(data.backoffice_aufgaben || []),
    titel,
    bereich: String(req.body.bereich || 'allgemein').trim() || 'allgemein',
    status: String(req.body.status || 'offen').trim() || 'offen',
    faellig_am: String(req.body.faellig_am || '').trim(),
    notiz: String(req.body.notiz || '').trim(),
    created_at: nowIso()
  };
  data.backoffice_aufgaben = data.backoffice_aufgaben || [];
  data.backoffice_aufgaben.push(row);
  logActivity(data, req.user, 'backoffice', 'aufgabe_angelegt', row.titel);
  writeDb(data);
  res.json(row);
});

app.put('/api/backoffice/aufgaben/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_aufgaben || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Aufgabe nicht gefunden.' });
  row.titel = String(req.body.titel || row.titel || '').trim();
  row.bereich = String(req.body.bereich || row.bereich || 'allgemein').trim() || 'allgemein';
  row.status = String(req.body.status || row.status || 'offen').trim() || 'offen';
  row.faellig_am = String(req.body.faellig_am || row.faellig_am || '').trim();
  row.notiz = String(req.body.notiz || '').trim();
  logActivity(data, req.user, 'backoffice', 'aufgabe_aktualisiert', row.titel);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/aufgaben/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_aufgaben || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Aufgabe nicht gefunden.' });
  data.backoffice_aufgaben = (data.backoffice_aufgaben || []).filter((item) => Number(item.id) !== id);
  logActivity(data, req.user, 'backoffice', 'aufgabe_geloescht', row.titel);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/backoffice/dokumente', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  const rows = (data.backoffice_dokumente || []).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) * -1);
  res.json(rows);
});

app.post('/api/backoffice/dokumente', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const titel = String(req.body.titel || '').trim();
  if (!titel) return res.status(400).json({ error: 'Titel ist Pflicht.' });
  const row = {
    id: nextId(data.backoffice_dokumente || []),
    titel,
    typ: String(req.body.typ || 'sonstiges').trim() || 'sonstiges',
    bezug: String(req.body.bezug || '').trim(),
    status: String(req.body.status || 'aktiv').trim() || 'aktiv',
    notiz: String(req.body.notiz || '').trim(),
    created_at: nowIso()
  };
  data.backoffice_dokumente = data.backoffice_dokumente || [];
  data.backoffice_dokumente.push(row);
  logActivity(data, req.user, 'backoffice', 'dokument_angelegt', row.titel);
  writeDb(data);
  res.json(row);
});

app.put('/api/backoffice/dokumente/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_dokumente || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  row.titel = String(req.body.titel || row.titel || '').trim();
  row.typ = String(req.body.typ || row.typ || 'sonstiges').trim() || 'sonstiges';
  row.bezug = String(req.body.bezug || row.bezug || '').trim();
  row.status = String(req.body.status || row.status || 'aktiv').trim() || 'aktiv';
  row.notiz = String(req.body.notiz || '').trim();
  logActivity(data, req.user, 'backoffice', 'dokument_aktualisiert', row.titel);
  writeDb(data);
  res.json(row);
});

app.delete('/api/backoffice/dokumente/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.backoffice_dokumente || []).find((item) => Number(item.id) === id);
  if (!row) return res.status(404).json({ error: 'Dokument nicht gefunden.' });
  data.backoffice_dokumente = (data.backoffice_dokumente || []).filter((item) => Number(item.id) !== id);
  logActivity(data, req.user, 'backoffice', 'dokument_geloescht', row.titel);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/backoffice/einstellungen', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr', 'mitarbeiter'), (req, res) => {
  const data = readDb();
  res.json(data.backoffice_einstellungen || {});
});

app.put('/api/backoffice/einstellungen', authRequired, requireRoles('superadmin', 'hauptadmin', 'hr'), (req, res) => {
  const data = readDb();
  data.backoffice_einstellungen = {
    firmenname: String(req.body.firmenname || 'FleetControl24').trim() || 'FleetControl24',
    marken_claim: String(req.body.marken_claim || '').trim(),
    support_email: String(req.body.support_email || '').trim(),
    vertrieb_email: String(req.body.vertrieb_email || '').trim(),
    antwortadresse: String(req.body.antwortadresse || '').trim(),
    standard_paket: String(req.body.standard_paket || 'Starter').trim() || 'Starter'
  };
  logActivity(data, req.user, 'backoffice', 'einstellungen_aktualisiert', data.backoffice_einstellungen.firmenname);
  writeDb(data);
  res.json(data.backoffice_einstellungen);
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
  const payload = { 
    ...user, 
    standort: user.standort_id ? locationName(data, user.standort_id) : null,
    mandant_id: user.mandant_id || 1 // Mandant in Payload aufnehmen
  };
  delete payload.passwort_hash;
  res.json({ token: signUser(payload), user: payload });
});

app.get('/api/auth/me', authRequired, (req, res) => res.json(req.user));
app.get('/api/demo-credentials', (req, res) => res.json([
  { rolle: 'Hauptadmin', email: 'admin@fuhrpark.local', passwort: 'Admin123!' },
  { rolle: 'Admin Frankfurt', email: 'frankfurt@fuhrpark.local', passwort: 'Admin123!' },
  { rolle: 'Benutzer Frankfurt', email: 'user@fuhrpark.local', passwort: 'User123!' }
]));

app.get('/api/fuehrerscheinkontrolle', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'tuev');
  const mandantId = req.user.mandant_id || 1;
  const rows = (data.fuehrerscheinkontrollen || [])
    .filter(f => req.user.rolle === 'superadmin' || (f.mandant_id || 1) === mandantId)
    .map(f => {
      const u = data.benutzer.find(b => b.id === f.benutzer_id);
      return { ...f, benutzer_name: u ? u.name : 'Unbekannt' };
    });
  res.json(rows);
});

app.post('/api/fuehrerscheinkontrolle', authRequired, requireRoles('hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'tuev');
  const { id, benutzer_id, pruef_datum, naechste_pruefung, bemerkung, klassen, ausstellungsdatum, gueltig_bis, besitz_seit } = req.body;
  const userId = Number(benutzer_id);
  if (!userId || !pruef_datum || !naechste_pruefung) {
    return res.status(400).json({ error: 'Fahrer, Pruef-Datum und naechste Pruefung sind Pflicht.' });
  }
  const fahrer = (data.benutzer || []).find((item) => item.id === userId);
  if (!fahrer) {
    return res.status(404).json({ error: 'Fahrer nicht gefunden.' });
  }
  
  const rowId = id ? Number(id) : nextId(data.fuehrerscheinkontrollen || []);
  if (id && !(data.fuehrerscheinkontrollen || []).some((item) => item.id === rowId)) {
    return res.status(404).json({ error: 'Fuehrerscheinkontrolle nicht gefunden.' });
  }
  const row = {
    id: rowId,
    mandant_id: req.user.mandant_id || 1,
    benutzer_id: userId,
    pruef_datum,
    naechste_pruefung,
    ausstellungsdatum: ausstellungsdatum || '',
    gueltig_bis: gueltig_bis || '',
    besitz_seit: besitz_seit || '',
    status: new Date(naechste_pruefung) < new Date() ? 'ueberfaellig' : 'ok',
    klassen: klassen || '',
    pruefer_id: req.user.id,
    bemerkung,
    created_at: id ? ((data.fuehrerscheinkontrollen || []).find(f => f.id === rowId)?.created_at || nowIso()) : nowIso()
  };

  data.fuehrerscheinkontrollen = data.fuehrerscheinkontrollen || [];
  if (id) {
    data.fuehrerscheinkontrollen = data.fuehrerscheinkontrollen.map(f => f.id === rowId ? row : f);
  } else {
    data.fuehrerscheinkontrollen.push(row);
  }
  
  writeDb(data);
  res.json(row);
});

app.delete('/api/fuehrerscheinkontrolle/:id', authRequired, requireRoles('hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'tuev');
  const id = Number(req.params.id);
  data.fuehrerscheinkontrollen = (data.fuehrerscheinkontrollen || []).filter(f => f.id !== id);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/fuehrerscheinkontrolle/:id/pdf', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const id = Number(req.params.id);
  const row = (data.fuehrerscheinkontrollen || []).find((item) => item.id === id);
  if (!row) return res.status(404).json({ error: 'Fuehrerscheinkontrolle nicht gefunden.' });

  const fahrer = (data.benutzer || []).find((item) => item.id === row.benutzer_id);
  const pruefer = (data.benutzer || []).find((item) => item.id === row.pruefer_id);
  const standortText = fahrer?.standort_id ? locationName(data, fahrer.standort_id) : (req.user.standort || '-');

  const doc = new PDFDocument({ margin: 24, size: 'A4', layout: 'portrait' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="fuehrerscheinkontrolle_${row.id}.pdf"`);
  doc.pipe(res);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const startX = doc.page.margins.left;
  const rightX = startX + pageWidth;
  const colors = {
    ink: '#0F172A',
    muted: '#475569',
    line: '#CBD5E1',
    panel: '#F8FAFC',
    brand: '#1D4ED8',
    soft: '#DBEAFE'
  };

  const drawField = (x, y, width, label, value) => {
    doc.fillColor(colors.muted).font('Helvetica').fontSize(9).text(label, x, y);
    doc.roundedRect(x, y + 14, width, 34, 8).fillAndStroke(colors.panel, colors.line);
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(11).text(value || '-', x + 10, y + 26, { width: width - 20 });
  };

  doc.roundedRect(startX, 24, pageWidth, 78, 12).fillAndStroke(colors.soft, colors.line);
  doc.fillColor(colors.brand).font('Helvetica-Bold').fontSize(20).text('Fuehrerscheinkontrolle', startX + 18, 40);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(10).text(`Standort: ${standortText}`, startX + 18, 68);
  doc.text(`Erstellt: ${String(row.created_at || nowIso()).slice(0, 10)}`, rightX - 140, 68, { width: 140, align: 'right' });

  let y = 126;
  const colGap = 14;
  const colWidth = (pageWidth - colGap) / 2;
  drawField(startX, y, colWidth, 'Fahrer', fahrer?.name || 'Unbekannt');
  drawField(startX + colWidth + colGap, y, colWidth, 'Pruefer', pruefer?.name || req.user.name || req.user.benutzername || '-');
  y += 62;
  drawField(startX, y, colWidth, 'Pruefdatum', row.pruef_datum || '-');
  drawField(startX + colWidth + colGap, y, colWidth, 'Naechste Pruefung', row.naechste_pruefung || '-');
  y += 62;
  drawField(startX, y, colWidth, 'Ausstellungsdatum', row.ausstellungsdatum || '-');
  drawField(startX + colWidth + colGap, y, colWidth, 'Gueltig bis', row.gueltig_bis || '-');
  y += 62;
  drawField(startX, y, colWidth, 'Fuehrerschein seit', row.besitz_seit || '-');
  drawField(startX + colWidth + colGap, y, colWidth, 'Dauer', heldDurationText(row.besitz_seit));
  y += 62;
  drawField(startX, y, colWidth, 'Klassen', row.klassen || '-');
  drawField(startX + colWidth + colGap, y, colWidth, 'Status', row.status || '-');
  y += 72;

  doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(13).text('Bemerkung', startX, y);
  y += 18;
  doc.roundedRect(startX, y, pageWidth, 100, 10).fillAndStroke(colors.panel, colors.line);
  doc.fillColor(colors.ink).font('Helvetica').fontSize(10).text(row.bemerkung || 'Keine Bemerkung hinterlegt.', startX + 12, y + 12, { width: pageWidth - 24 });
  y += 126;

  doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(13).text('Bestaetigung und Unterschrift', startX, y);
  y += 24;
  doc.font('Helvetica').fontSize(10).fillColor(colors.muted).text('Hiermit wird bestaetigt, dass der Fuehrerschein am angegebenen Datum kontrolliert wurde.', startX, y, { width: pageWidth });
  y += 44;

  const signWidth = (pageWidth - 24) / 2;
  doc.moveTo(startX, y + 30).lineTo(startX + signWidth, y + 30).strokeColor(colors.line).stroke();
  doc.moveTo(startX + signWidth + 24, y + 30).lineTo(rightX, y + 30).strokeColor(colors.line).stroke();
  doc.fillColor(colors.muted).font('Helvetica').fontSize(9).text('Unterschrift Fahrer', startX, y + 36, { width: signWidth, align: 'center' });
  doc.text('Unterschrift Pruefer', startX + signWidth + 24, y + 36, { width: signWidth, align: 'center' });

  doc.end();
});

app.get('/api/kalender-events', authRequired, (req, res) => {
  const data = readDb();
  const mandantId = req.user.mandant_id || 1;
  const rows = (data.kalender_events || []).filter(e => req.user.rolle === 'superadmin' || (e.mandant_id || 1) === mandantId);
  res.json(rows);
});

app.post('/api/kalender-events', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const id = req.body.id ? Number(req.body.id) : null;
  
  const row = {
    id: id || nextId(data.kalender_events || []),
    mandant_id: req.user.mandant_id || 1,
    titel: req.body.titel,
    beschreibung: req.body.beschreibung || '',
    start_datum: req.body.start_datum,
    end_datum: req.body.end_datum || null,
    typ: req.body.typ || 'allgemein',
    fahrzeug_id: req.body.fahrzeug_id ? Number(req.body.fahrzeug_id) : null,
    created_at: id ? ((data.kalender_events || []).find(e => e.id === id)?.created_at || nowIso()) : nowIso()
  };

  data.kalender_events = data.kalender_events || [];
  if (id) {
    data.kalender_events = data.kalender_events.map(e => e.id === id ? row : e);
  } else {
    data.kalender_events.push(row);
  }
  
  writeDb(data);
  res.json(row);
});

app.delete('/api/kalender-events/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const mandantId = req.user.mandant_id || 1;
  const id = Number(req.params.id);
  const event = (data.kalender_events || []).find(e => e.id === id);
  if (!event || (req.user.rolle !== 'superadmin' && (event.mandant_id || 1) !== mandantId)) {
    return res.status(403).json({ error: 'Keine Berechtigung.' });
  }
  data.kalender_events = data.kalender_events.filter(e => e.id !== id);
  writeDb(data);
  res.json({ success: true });
});
app.post('/api/standorte', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'grundfunktionen');
  assertPackageLimit(data, req.user, 'standorte');
  const row = { 
    id: nextId(data.standorte), 
    mandant_id: req.user.mandant_id || 1,
    name: sanitizeLocationName(req.body.name), 
    created_at: nowIso() 
  };
  data.standorte.push(row);
  data.workshop_bereiche = createWorkshopAreas(data.standorte, data.workshop_bereiche || []);
  writeDb(data);
  res.json(row);
});
app.put('/api/standorte/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'grundfunktionen');
  const row = data.standorte.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Standort nicht gefunden.' });
  if (req.user.rolle !== 'superadmin' && Number(row.mandant_id || 1) !== Number(req.user.mandant_id || 1)) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Standort.' });
  }
  row.name = sanitizeLocationName(req.body.name || row.name);
  data.workshop_bereiche = createWorkshopAreas(data.standorte, data.workshop_bereiche || []);
  writeDb(data);
  res.json(row);
});
app.delete('/api/standorte/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'grundfunktionen');
  const id = Number(req.params.id);
  const standort = data.standorte.find((item) => Number(item.id) === id);
  if (!standort) return res.status(404).json({ error: 'Standort nicht gefunden.' });
  if (req.user.rolle !== 'superadmin' && Number(standort.mandant_id || 1) !== Number(req.user.mandant_id || 1)) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Standort.' });
  }
  if (data.benutzer.some((item) => item.standort_id === id) || data.fahrzeuge.some((item) => item.standort_id === id)) {
    return res.status(400).json({ error: 'Standort hat noch Benutzer oder Fahrzeuge und kann nicht geloescht werden.' });
  }
  data.standorte = data.standorte.filter((item) => item.id !== id);
  data.workshop_bereiche = (data.workshop_bereiche || []).filter((item) => Number(item.standort_id) !== id);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/lagerorte', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'lagerverwaltung', 'Die Lagerverwaltung ist fuer dieses Paket nicht freigeschaltet.');
  const rows = scopedInventoryLocations(data, req.user, req).map((item) => ({ ...item, standort: item.standort_id ? locationName(data, item.standort_id) : '-' }));
  res.json(rows);
});

app.post('/api/lagerorte', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'lagerverwaltung', 'Die Lagerverwaltung ist fuer dieses Paket nicht freigeschaltet.');
  const standort_id = Number(req.body.standort_id || req.user.standort_id || firstMandantLocationId(data, req.user.mandant_id || 1));
  const row = {
    id: nextId(data.lagerorte || []),
    mandant_id: Number(req.user.mandant_id || 1),
    standort_id: Number.isFinite(standort_id) ? standort_id : null,
    name: repairEncodingText(String(req.body.name || 'Lager').trim() || 'Lager'),
    typ: String(req.body.typ || 'hauptlager').trim() || 'hauptlager',
    aktiv: String(req.body.aktiv || '1') === '0' ? 0 : 1,
    created_at: nowIso()
  };
  data.lagerorte = data.lagerorte || [];
  data.lagerorte.push(row);
  writeDb(data);
  res.json(row);
});

app.put('/api/lagerorte/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'lagerverwaltung', 'Die Lagerverwaltung ist fuer dieses Paket nicht freigeschaltet.');
  const row = (data.lagerorte || []).find((item) => Number(item.id) === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Lagerort nicht gefunden.' });
  if (req.user.rolle !== 'superadmin' && Number(row.mandant_id || 1) !== Number(req.user.mandant_id || 1)) return res.status(403).json({ error: 'Kein Zugriff auf diesen Lagerort.' });
  row.name = repairEncodingText(String(req.body.name || row.name || '').trim() || row.name);
  row.typ = String(req.body.typ || row.typ || 'hauptlager').trim() || 'hauptlager';
  row.aktiv = String(req.body.aktiv || row.aktiv || '1') === '0' ? 0 : 1;
  writeDb(data);
  res.json(row);
});

app.delete('/api/lagerorte/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'lagerverwaltung', 'Die Lagerverwaltung ist fuer dieses Paket nicht freigeschaltet.');
  const id = Number(req.params.id);
  if ((data.lagerartikel || []).some((item) => Number(item.lagerort_id) === id)) {
    return res.status(400).json({ error: 'Lagerort enthaelt noch Artikel und kann nicht geloescht werden.' });
  }
  data.lagerorte = (data.lagerorte || []).filter((item) => Number(item.id) !== id);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/lagerartikel', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'lagerverwaltung', 'Die Lagerverwaltung ist fuer dieses Paket nicht freigeschaltet.');
  res.json(scopedInventoryArticles(data, req.user, req));
});

app.post('/api/lagerartikel', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'lagerverwaltung', 'Die Lagerverwaltung ist fuer dieses Paket nicht freigeschaltet.');
  const lagerort_id = Number(req.body.lagerort_id || 0) || null;
  const lagerort = (data.lagerorte || []).find((item) => Number(item.id) === lagerort_id);
  if (!lagerort) return res.status(400).json({ error: 'Bitte einen gueltigen Lagerort auswaehlen.' });
  const row = {
    id: nextId(data.lagerartikel || []),
    mandant_id: Number(req.user.mandant_id || 1),
    lagerort_id,
    name: repairEncodingText(String(req.body.name || '').trim()),
    artikelnummer: String(req.body.artikelnummer || '').trim(),
    bestand: Number(req.body.bestand || 0),
    mindestbestand: Number(req.body.mindestbestand || 0),
    einheit: String(req.body.einheit || 'Stk').trim() || 'Stk',
    created_at: nowIso()
  };
  if (!row.name) return res.status(400).json({ error: 'Artikelname ist Pflicht.' });
  data.lagerartikel = data.lagerartikel || [];
  data.lagerartikel.push(row);
  writeDb(data);
  res.json(row);
});

app.put('/api/lagerartikel/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'lagerverwaltung', 'Die Lagerverwaltung ist fuer dieses Paket nicht freigeschaltet.');
  const row = (data.lagerartikel || []).find((item) => Number(item.id) === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Lagerartikel nicht gefunden.' });
  row.name = repairEncodingText(String(req.body.name || row.name || '').trim() || row.name);
  row.artikelnummer = String(req.body.artikelnummer || row.artikelnummer || '').trim();
  row.bestand = Number(req.body.bestand ?? row.bestand ?? 0);
  row.mindestbestand = Number(req.body.mindestbestand ?? row.mindestbestand ?? 0);
  row.einheit = String(req.body.einheit || row.einheit || 'Stk').trim() || 'Stk';
  writeDb(data);
  res.json(row);
});

app.delete('/api/lagerartikel/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'lagerverwaltung', 'Die Lagerverwaltung ist fuer dieses Paket nicht freigeschaltet.');
  const id = Number(req.params.id);
  data.lagerbewegungen = (data.lagerbewegungen || []).filter((item) => Number(item.lagerartikel_id) !== id);
  data.lagerartikel = (data.lagerartikel || []).filter((item) => Number(item.id) !== id);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/lagerbewegungen', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'lagerverwaltung', 'Die Lagerverwaltung ist fuer dieses Paket nicht freigeschaltet.');
  const articles = new Set(scopedInventoryArticles(data, req.user, req).map((item) => Number(item.id)));
  const rows = (data.lagerbewegungen || [])
    .filter((item) => Number(item.mandant_id || 1) === Number(req.user.mandant_id || 1))
    .filter((item) => articles.has(Number(item.lagerartikel_id)))
    .map((item) => {
      const artikel = (data.lagerartikel || []).find((entry) => Number(entry.id) === Number(item.lagerartikel_id));
      return { ...item, artikel: artikel?.name || '-', artikelnummer: artikel?.artikelnummer || '' };
    });
  res.json(rows);
});

app.post('/api/lagerbewegungen', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'lagerverwaltung', 'Die Lagerverwaltung ist fuer dieses Paket nicht freigeschaltet.');
  const lagerartikel_id = Number(req.body.lagerartikel_id || 0);
  const artikel = (data.lagerartikel || []).find((item) => Number(item.id) === lagerartikel_id);
  if (!artikel) return res.status(404).json({ error: 'Lagerartikel nicht gefunden.' });
  const menge = Number(req.body.menge || 0);
  if (!Number.isFinite(menge) || menge <= 0) return res.status(400).json({ error: 'Menge muss groesser als 0 sein.' });
  const typ = String(req.body.typ || 'ein').trim() || 'ein';
  if (typ === 'aus' && Number(artikel.bestand || 0) < menge) return res.status(400).json({ error: 'Bestand reicht fuer diese Entnahme nicht aus.' });
  artikel.bestand = typ === 'aus' ? Number(artikel.bestand || 0) - menge : Number(artikel.bestand || 0) + menge;
  const row = {
    id: nextId(data.lagerbewegungen || []),
    mandant_id: Number(req.user.mandant_id || 1),
    lagerartikel_id,
    typ,
    menge,
    referenz: String(req.body.referenz || '').trim(),
    created_at: nowIso()
  };
  data.lagerbewegungen = data.lagerbewegungen || [];
  data.lagerbewegungen.push(row);
  writeDb(data);
  res.json(row);
});

app.get('/api/benutzer', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  const mandantId = req.user.mandant_id || 1;
  const rows = data.benutzer
    .filter((item) => (req.user.rolle === 'superadmin' || (item.mandant_id || 1) === mandantId))
    .filter((item) => req.user.rolle === 'hauptadmin' || req.user.rolle === 'superadmin' ? (selectedStandortId(req, req.user) ? item.standort_id === selectedStandortId(req, req.user) : true) : item.standort_id === req.user.standort_id)
    .map((item) => ({ ...item, rolle: normalizeAppRole(item.rolle), rolle_label: displayAppRole(item.rolle), standort: item.standort_id ? locationName(data, item.standort_id) : null, passwort_hash: undefined }));
  res.json(rows);
});
app.post('/api/benutzer', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  const requestedStandortId = Number(req.body.standort_id) || null;
  const requestedRole = normalizeAppRole(req.body.rolle || 'benutzer');
  if (!canGrantAppRole(req.user.rolle, requestedRole)) {
    return res.status(403).json({ error: 'Diese Rolle darfst du nicht anlegen.' });
  }
  const rolle = requestedRole;
  const standort_id = rolle === 'hauptadmin'
    ? (requestedStandortId || findLocationId(data, 'Carlswerk'))
    : (isManagementRole(req.user.rolle) ? requestedStandortId : req.user.standort_id);
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
  assertPackageLimit(data, req.user, 'benutzer');
  const row = { 
    id: nextId(data.benutzer), 
    mandant_id: req.user.mandant_id || 1,
    benutzername, 
    name, 
    email, 
    passwort_hash: bcrypt.hashSync(passwort, 10), 
    rolle, 
    standort_id, 
    aktiv: 1, 
    created_at: nowIso() 
  };
  data.benutzer.push(row);
  writeDb(data);
  res.json({ ...row, rolle_label: displayAppRole(row.rolle), passwort_hash: undefined, standort: standort_id ? locationName(data, standort_id) : null });
});
app.put('/api/benutzer/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  const row = data.benutzer.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  if (!isManagementRole(req.user.rolle) && row.standort_id !== req.user.standort_id) return res.status(403).json({ error: 'Kein Zugriff auf diesen Benutzer.' });
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
  const requestedRole = normalizeAppRole(req.body.rolle || row.rolle || '');
  const nextRole = canGrantAppRole(req.user.rolle, requestedRole) ? requestedRole : row.rolle;
  if (requestedRole !== row.rolle && !canGrantAppRole(req.user.rolle, requestedRole)) {
    return res.status(403).json({ error: 'Diese Rolle darfst du nicht vergeben.' });
  }
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
  row.standort_id = isManagementRole(req.user.rolle)
    ? (nextRole === 'hauptadmin' ? (Number(req.body.standort_id) || findLocationId(data, 'Carlswerk')) : Number(req.body.standort_id) || row.standort_id)
    : req.user.standort_id;
  if (typeof req.body.aktiv !== 'undefined') {
    const nextAktiv = Number(req.body.aktiv) ? 1 : 0;
    if (!Number(row.aktiv) && nextAktiv === 1) {
      assertPackageLimit(data, req.user, 'benutzer', { excludeId: row.id });
    }
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
  res.json({ ...row, rolle_label: displayAppRole(row.rolle), passwort_hash: undefined, standort: row.standort_id ? locationName(data, row.standort_id) : null });
});

app.delete('/api/benutzer/:id', authRequired, requireRoles('superadmin', 'hauptadmin'), (req, res) => {
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

app.get('/api/kontakte', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
  const data = readDb();
  const mandantId = req.user.mandant_id || 1;
  const selected = selectedStandortId(req, req.user);
  const rows = (data.kontakte || [])
    .filter((item) => (req.user.rolle === 'superadmin' || (item.mandant_id || 1) === mandantId))
    .filter((item) => {
      if (req.user.rolle === 'hauptadmin' || req.user.rolle === 'superadmin') return selected ? Number(item.standort_id || 0) === Number(selected) : true;
      return !item.standort_id || Number(item.standort_id) === Number(req.user.standort_id);
    })
    .map((item) => ({ ...item, standort: item.standort_id ? locationName(data, item.standort_id) : 'Global' }));
  res.json(rows);
});
app.post('/api/kontakte', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
  const data = readDb();
  const standort_id = req.user.rolle === 'hauptadmin'
    ? (req.body.standort_id ? Number(req.body.standort_id) : null)
    : req.user.standort_id;
  if (!String(req.body.name || '').trim()) {
    return res.status(400).json({ error: 'Name ist Pflicht.' });
  }
  if (req.body.email && !isValidEmail(req.body.email)) {
    return res.status(400).json({ error: 'Bitte eine gueltige E-Mail angeben.' });
  }
  const row = {
    id: nextId(data.kontakte || []),
    mandant_id: req.user.mandant_id || 1,
    name: String(req.body.name || '').trim(),
    firma: String(req.body.firma || '').trim(),
    kategorie: String(req.body.kategorie || 'sonstiges').trim() || 'sonstiges',
    ansprechpartner: String(req.body.ansprechpartner || '').trim(),
    telefon: String(req.body.telefon || '').trim(),
    mobil: String(req.body.mobil || '').trim(),
    email: String(req.body.email || '').trim(),
    adresse: String(req.body.adresse || '').trim(),
    website: String(req.body.website || '').trim(),
    standort_id,
    notiz: String(req.body.notiz || '').trim(),
    created_at: nowIso()
  };
  data.kontakte = data.kontakte || [];
  data.kontakte.push(row);
  logActivity(data, req.user, 'kontakte', 'kontakt_angelegt', row.name, standort_id);
  writeDb(data);
  res.json({ ...row, standort: standort_id ? locationName(data, standort_id) : 'Global' });
});

app.put('/api/kontakte/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
  const data = readDb();
  const row = (data.kontakte || []).find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Kontakt nicht gefunden.' });
  if (req.user.rolle !== 'hauptadmin' && row.standort_id && Number(row.standort_id) !== Number(req.user.standort_id)) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Kontakt.' });
  }
  const standort_id = req.user.rolle === 'hauptadmin'
    ? (typeof req.body.standort_id !== 'undefined' && req.body.standort_id !== '' ? Number(req.body.standort_id) : row.standort_id)
    : req.user.standort_id;
  const nextEmail = String(typeof req.body.email !== 'undefined' ? req.body.email : row.email || '').trim();
  if (!String(req.body.name || row.name || '').trim()) {
    return res.status(400).json({ error: 'Name ist Pflicht.' });
  }
  if (nextEmail && !isValidEmail(nextEmail)) {
    return res.status(400).json({ error: 'Bitte eine gueltige E-Mail angeben.' });
  }
  row.name = String(req.body.name || row.name || '').trim();
  row.firma = String(typeof req.body.firma !== 'undefined' ? req.body.firma : row.firma || '').trim();
  row.kategorie = String(typeof req.body.kategorie !== 'undefined' ? req.body.kategorie : row.kategorie || 'sonstiges').trim() || 'sonstiges';
  row.ansprechpartner = String(typeof req.body.ansprechpartner !== 'undefined' ? req.body.ansprechpartner : row.ansprechpartner || '').trim();
  row.telefon = String(typeof req.body.telefon !== 'undefined' ? req.body.telefon : row.telefon || '').trim();
  row.mobil = String(typeof req.body.mobil !== 'undefined' ? req.body.mobil : row.mobil || '').trim();
  row.email = nextEmail;
  row.adresse = String(typeof req.body.adresse !== 'undefined' ? req.body.adresse : row.adresse || '').trim();
  row.website = String(typeof req.body.website !== 'undefined' ? req.body.website : row.website || '').trim();
  row.standort_id = standort_id;
  row.notiz = String(typeof req.body.notiz !== 'undefined' ? req.body.notiz : row.notiz || '').trim();
  logActivity(data, req.user, 'kontakte', 'kontakt_aktualisiert', row.name, standort_id);
  writeDb(data);
  res.json({ ...row, standort: standort_id ? locationName(data, standort_id) : 'Global' });
});

app.delete('/api/kontakte/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
  const data = readDb();
  const row = (data.kontakte || []).find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Kontakt nicht gefunden.' });
  if (req.user.rolle !== 'hauptadmin' && row.standort_id && Number(row.standort_id) !== Number(req.user.standort_id)) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Kontakt.' });
  }
  data.kontakte = (data.kontakte || []).filter((item) => item.id !== row.id);
  logActivity(data, req.user, 'kontakte', 'kontakt_geloescht', row.name, row.standort_id);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/fahrzeuge', authRequired, (req, res) => res.json(scopedVehicles(readDb(), req.user, req)));
app.post('/api/fahrzeuge', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
  const data = readDb();
  assertPackageLimit(data, req.user, 'fahrzeuge');
  assertAllowedStatus(req.body.status, FAHRZEUG_STATUS);
  const row = { 
    id: nextId(data.fahrzeuge), 
    mandant_id: req.user.mandant_id || 1,
    kennzeichen: req.body.kennzeichen, 
    fahrzeug: req.body.fahrzeug, 
    standort_id: (req.user.rolle === 'hauptadmin' || req.user.rolle === 'superadmin') ? Number(req.body.standort_id) : req.user.standort_id, 
    status: req.body.status, 
    hu_datum: req.body.hu_datum, 
     uvv_datum: req.body.uvv_datum, 
     fahrzeugschein_pdf: req.body.fahrzeugschein_pdf || '', 
     fin: req.body.fin || '',
     radiocode: req.body.radiocode || '',
     tankkarten_vorhanden: req.body.tankkarten_vorhanden === 'true' || req.body.tankkarten_vorhanden === true,
     tankkarte_aral_nummer: req.body.tankkarte_aral_nummer || '',
     tankkarte_aral_aktiv_seit: req.body.tankkarte_aral_aktiv_seit || null,
     tankkarte_aral_gueltig_bis: req.body.tankkarte_aral_gueltig_bis || null,
     tankkarte_shell_nummer: req.body.tankkarte_shell_nummer || '',
     tankkarte_shell_gueltig_von: req.body.tankkarte_shell_gueltig_von || null,
     tankkarte_shell_gueltig_bis: req.body.tankkarte_shell_gueltig_bis || null,
     tankkarte_shell_name: req.body.tankkarte_shell_name || '',
     created_at: nowIso() 
   };
  data.fahrzeuge.push(row);
  writeDb(data);
  res.json(vehicleWithLocation(data, row));
});
app.put('/api/fahrzeuge/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
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
    fahrzeugschein_pdf: req.body.fahrzeugschein_pdf || row.fahrzeugschein_pdf || '',
    fin: req.body.fin ?? row.fin,
    radiocode: req.body.radiocode ?? row.radiocode,
    tankkarten_vorhanden: req.body.tankkarten_vorhanden !== undefined ? (req.body.tankkarten_vorhanden === 'true' || req.body.tankkarten_vorhanden === true) : row.tankkarten_vorhanden,
    tankkarte_aral_nummer: req.body.tankkarte_aral_nummer ?? row.tankkarte_aral_nummer,
    tankkarte_aral_aktiv_seit: req.body.tankkarte_aral_aktiv_seit ?? row.tankkarte_aral_aktiv_seit,
    tankkarte_aral_gueltig_bis: req.body.tankkarte_aral_gueltig_bis ?? row.tankkarte_aral_gueltig_bis,
    tankkarte_shell_nummer: req.body.tankkarte_shell_nummer ?? row.tankkarte_shell_nummer,
    tankkarte_shell_gueltig_von: req.body.tankkarte_shell_gueltig_von ?? row.tankkarte_shell_gueltig_von,
    tankkarte_shell_gueltig_bis: req.body.tankkarte_shell_gueltig_bis ?? row.tankkarte_shell_gueltig_bis,
    tankkarte_shell_name: req.body.tankkarte_shell_name ?? row.tankkarte_shell_name
  });
  writeDb(data);
  res.json(vehicleWithLocation(data, row));
});
app.post('/api/fahrzeuge/:id/upload-fahrzeugschein', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), uploadPdf.single('fahrzeugschein_pdf'), (req, res) => {
  try {
    const data = readDb();
    const row = data.fahrzeuge.find((item) => item.id === Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Fahrzeug nicht gefunden.' });
    if (!canAccessVehicle(req.user, row) && req.user.rolle !== 'hauptadmin') return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
    assertPackageLimit(data, req.user, 'uploads', { additionalBytes: req.file?.size || 0 });
    row.fahrzeugschein_pdf = `/uploads/${req.file.filename}`;
    writeDb(data);
    res.json({ success: true, fahrzeugschein_pdf: row.fahrzeugschein_pdf });
  } catch (error) {
    cleanupUploadedFile(req.file);
    throw error;
  }
});

app.get('/api/fahrzeuge/:id/dokumente', authRequired, (req, res) => {
  const data = readDb();
  const vehicleId = Number(req.params.id);
  const vehicle = data.fahrzeuge.find((f) => f.id === vehicleId);
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) {
    return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  }

  const docs = [];
  
  // 1. Fahrzeugschein
  if (vehicle.fahrzeugschein_pdf) {
    docs.push({ id: 'schein', name: 'Fahrzeugschein', datei_pfad: vehicle.fahrzeugschein_pdf, typ: 'Stammdaten', datum: vehicle.created_at });
  }

  // 2. Schadensfotos
  const schaeden = (data.schaeden || []).filter(s => s.fahrzeug_id === vehicleId && s.foto);
  schaeden.forEach(s => {
    docs.push({ id: `schaden_${s.id}`, name: `Schadenfoto (${s.datum})`, datei_pfad: s.foto, typ: 'Schaden', datum: s.created_at });
  });

  // 3. UVV Protokolle (virtuell, da on-the-fly generiert)
  const uvvs = (data.uvv_pruefungen || []).filter(u => u.fahrzeug_id === vehicleId);
  uvvs.forEach(u => {
    docs.push({ id: `uvv_${u.id}`, name: `UVV Protokoll (${u.datum})`, datei_pfad: `/api/uvv/${u.id}/pdf`, typ: 'UVV', datum: u.created_at });
  });

  // 4. Allgemeine Dokumente aus der neuen Tabelle
  const generalDocs = (data.fahrzeug_dokumente || []).filter(d => d.fahrzeug_id === vehicleId);
  generalDocs.forEach(d => {
    docs.push({ ...d, id: `gen_${d.id}`, datum: d.created_at });
  });

  res.json(docs);
});

app.get('/api/fahrzeuge/dokumente/:id/open', authRequired, (req, res) => {
  const data = readDb();
  const rawId = String(req.params.id || '');

  const sendStoredUpload = (storedPath) => {
    const cleanPath = String(storedPath || '').trim();
    if (!cleanPath.startsWith('/uploads/')) {
      return res.status(404).json({ error: 'Dokumentpfad ist ungueltig.' });
    }
    const absolutePath = path.join(uploadsDir, path.basename(cleanPath));
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Dokument wurde auf dem Server nicht gefunden.' });
    }
    return res.sendFile(absolutePath);
  };

  if (rawId.startsWith('gen_')) {
    const docId = Number(rawId.replace('gen_', ''));
    const doc = (data.fahrzeug_dokumente || []).find((item) => item.id === docId);
    if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' });
    const vehicle = data.fahrzeuge.find((item) => item.id === doc.fahrzeug_id);
    if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) {
      return res.status(403).json({ error: 'Kein Zugriff auf dieses Dokument.' });
    }
    return sendStoredUpload(doc.datei_pfad);
  }

  if (rawId === 'schein') {
    const vehicleId = Number(req.query.fahrzeug_id);
    const vehicle = data.fahrzeuge.find((item) => item.id === vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Fahrzeug nicht gefunden.' });
    if (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin') {
      return res.status(403).json({ error: 'Kein Zugriff auf dieses Dokument.' });
    }
    if (!vehicle.fahrzeugschein_pdf) return res.status(404).json({ error: 'Kein Fahrzeugschein hinterlegt.' });
    return sendStoredUpload(vehicle.fahrzeugschein_pdf);
  }

  if (rawId.startsWith('schaden_')) {
    const damageId = Number(rawId.replace('schaden_', ''));
    const damage = (data.schaeden || []).find((item) => item.id === damageId);
    if (!damage) return res.status(404).json({ error: 'Schadendokument nicht gefunden.' });
    const vehicle = data.fahrzeuge.find((item) => item.id === damage.fahrzeug_id);
    if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) {
      return res.status(403).json({ error: 'Kein Zugriff auf dieses Dokument.' });
    }
    if (!damage.foto) return res.status(404).json({ error: 'Kein Schadendokument hinterlegt.' });
    return sendStoredUpload(damage.foto);
  }

  return res.status(404).json({ error: 'Dokument nicht gefunden.' });
});

app.post('/api/fahrzeuge/:id/dokumente', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), upload.single('datei'), (req, res) => {
  try {
    const data = readDb();
    const vehicleId = Number(req.params.id);
    const vehicle = data.fahrzeuge.find((f) => f.id === vehicleId);
    if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) {
      return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
    }
    assertPackageLimit(data, req.user, 'uploads', { additionalBytes: req.file?.size || 0 });

    const row = {
      id: nextId(data.fahrzeug_dokumente || []),
      fahrzeug_id: vehicleId,
      name: req.body.name || req.file.originalname,
      datei_pfad: `/uploads/${req.file.filename}`,
      typ: req.body.typ || 'Sonstiges',
      created_at: nowIso()
    };

    data.fahrzeug_dokumente = data.fahrzeug_dokumente || [];
    data.fahrzeug_dokumente.push(row);
    writeDb(data);
    res.json(row);
  } catch (error) {
    cleanupUploadedFile(req.file);
    throw error;
  }
});

app.delete('/api/fahrzeuge/dokumente/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
  const data = readDb();
  const rawId = String(req.params.id || '');

  if (rawId.startsWith('gen_')) {
    const docId = Number(rawId.replace('gen_', ''));
    const doc = (data.fahrzeug_dokumente || []).find(d => d.id === docId);
    if (!doc) return res.status(404).json({ error: 'Dokument nicht gefunden.' });

    const vehicle = data.fahrzeuge.find(f => f.id === doc.fahrzeug_id);
    if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) {
      return res.status(403).json({ error: 'Kein Zugriff auf dieses Dokument.' });
    }

    data.fahrzeug_dokumente = data.fahrzeug_dokumente.filter(d => d.id !== docId);
    writeDb(data);
    return res.json({ success: true });
  }

  if (rawId === 'schein') {
    const vehicleId = Number(req.query.fahrzeug_id);
    const vehicle = data.fahrzeuge.find(f => f.id === vehicleId);
    if (!vehicle) return res.status(404).json({ error: 'Fahrzeug nicht gefunden.' });
    if (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin') {
      return res.status(403).json({ error: 'Kein Zugriff auf dieses Dokument.' });
    }

    vehicle.fahrzeugschein_pdf = '';
    writeDb(data);
    return res.json({ success: true });
  }

  if (rawId.startsWith('schaden_')) {
    const damageId = Number(rawId.replace('schaden_', ''));
    const damage = (data.schaeden || []).find(item => item.id === damageId);
    if (!damage) return res.status(404).json({ error: 'Dokument nicht gefunden.' });

    const vehicle = data.fahrzeuge.find(f => f.id === damage.fahrzeug_id);
    if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) {
      return res.status(403).json({ error: 'Kein Zugriff auf dieses Dokument.' });
    }

    damage.foto = '';
    writeDb(data);
    return res.json({ success: true });
  }

  if (rawId.startsWith('uvv_')) {
    return res.status(400).json({ error: 'UVV Protokolle koennen hier nicht geloescht werden.' });
  }

  return res.status(404).json({ error: 'Dokument nicht gefunden.' });
});

app.delete('/api/fahrzeuge/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
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
  assertModuleAllowed(data, req.user, 'grundfunktionen');
  const rows = data.werkstatt
    .map((item) => ({ ...item, vehicle: data.fahrzeuge.find((f) => f.id === item.fahrzeug_id) }))
    .filter((item) => item.vehicle && filterByStandort(data, [item.vehicle], req.user, req, (vehicle) => vehicle.standort_id).length)
    .map((item) => ({ ...item, kennzeichen: item.vehicle.kennzeichen, fahrzeug: item.vehicle.fahrzeug, standort: locationName(data, item.vehicle.standort_id) }));
  res.json(rows);
});
app.get('/api/werkstatt-bereiche', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'grundfunktionen');
  const rows = filterByStandort(data, data.workshop_bereiche || [], req.user, req, (item) => item.standort_id);
  res.json(rows);
});
app.put('/api/werkstatt-bereiche/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'grundfunktionen');
  const row = (data.workshop_bereiche || []).find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Werkstattbereich nicht gefunden.' });
  if (req.user.rolle !== 'hauptadmin' && row.standort_id !== req.user.standort_id) return res.status(403).json({ error: 'Kein Zugriff auf diesen Werkstattbereich.' });
  row.name = String(req.body.name || '').trim() || `Werkstatt ${row.slot}`;
  writeDb(data);
  res.json(row);
});
app.post('/api/werkstatt', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'grundfunktionen');
  const vehicle = data.fahrzeuge.find((item) => item.id === Number(req.body.fahrzeug_id));
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin' && req.user.rolle !== 'superadmin')) return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  assertAllowedStatus(req.body.status, WERKSTATT_STATUS);
  const workshopSlot = Math.min(Math.max(Number(req.body.workshop_slot) || 1, 1), 9);
  const row = {
    id: nextId(data.werkstatt),
    mandant_id: req.user.mandant_id || 1,
    fahrzeug_id: vehicle.id,
    workshop_slot: workshopSlot,
    werkstatt_name: String(req.body.werkstatt_name || '').trim() || workshopAreaName(data, vehicle.standort_id, workshopSlot),
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
  data.werkstatt.push(row);
  syncVehicleWorkshopStatus(data, vehicle.id);
  writeDb(data);
  res.json(row);
});
app.put('/api/werkstatt/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'grundfunktionen');
  const row = data.werkstatt.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Werkstattauftrag nicht gefunden.' });
  const previousVehicleId = row.fahrzeug_id;
  const nextVehicleId = Number(req.body.fahrzeug_id || row.fahrzeug_id);
  const targetVehicle = data.fahrzeuge.find((item) => item.id === nextVehicleId);
  if (!targetVehicle || (!canAccessVehicle(req.user, targetVehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf diesen Auftrag.' });
  if (req.body.status) assertAllowedStatus(req.body.status, WERKSTATT_STATUS);
  row.fahrzeug_id = nextVehicleId;
  row.workshop_slot = Math.min(Math.max(Number(req.body.workshop_slot) || row.workshop_slot || 1, 1), 9);
  row.werkstatt_name = String(req.body.werkstatt_name || '').trim() || workshopAreaName(data, targetVehicle.standort_id, row.workshop_slot);
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
    targetVehicle.status = req.body.fahrzeug_status;
  } else {
    syncVehicleWorkshopStatus(data, targetVehicle.id);
  }
  if (Number(previousVehicleId) !== Number(targetVehicle.id)) {
    syncVehicleWorkshopStatus(data, previousVehicleId);
  }
  writeDb(data);
  res.json(row);
});

app.delete('/api/werkstatt/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'grundfunktionen');
  const row = data.werkstatt.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Werkstattauftrag nicht gefunden.' });
  const vehicle = data.fahrzeuge.find((item) => item.id === row.fahrzeug_id);
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf diesen Auftrag.' });
  data.werkstatt = data.werkstatt.filter((item) => item.id !== row.id);
  syncVehicleWorkshopStatus(data, row.fahrzeug_id);
  writeDb(data);
  res.json({ success: true });
});

app.get('/api/schaeden', authRequired, (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'schadenmodul');
  const rows = data.schaeden
    .map((item) => ({ ...item, vehicle: data.fahrzeuge.find((f) => f.id === item.fahrzeug_id) }))
    .filter((item) => canViewDamageRecord(req.user.rolle, req.user.id, item.created_by))
    .filter((item) => item.vehicle && filterByStandort(data, [item.vehicle], req.user, req, (vehicle) => vehicle.standort_id).length)
    .map((item) => ({ ...item, kennzeichen: item.vehicle.kennzeichen, fahrzeug: item.vehicle.fahrzeug, standort: locationName(data, item.vehicle.standort_id) }));
  res.json(rows);
});
app.post('/api/schaeden', authRequired, (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'schadenmodul', 'Das Schadenmodul ist fuer dieses Paket nicht freigeschaltet.');
  if (!canUseDriverDamageForm(req.user.rolle)) {
    return res.status(403).json({ error: 'Neue Schadenmeldungen duerfen nur Fahrer erfassen.' });
  }
  const vehicle = data.fahrzeuge.find((item) => item.id === Number(req.body.fahrzeug_id));
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  const status = 'gemeldet';
  assertAllowedStatus(status, SCHADEN_STATUS);
  if (!String(req.body.beschreibung || '').trim()) {
    return res.status(400).json({ error: 'Unfallbeschreibung ist Pflicht.' });
  }
  const row = {
    id: nextId(data.schaeden),
    mandant_id: req.user.mandant_id || 1,
    fahrzeug_id: vehicle.id,
    fahrer_name: String(req.body.fahrer_name || req.user.name || '').trim(),
    fahrer_telefon: String(req.body.fahrer_telefon || '').trim(),
    polizei_vor_ort: req.body.polizei_vor_ort || 'nein',
    verletzte: req.body.verletzte || 'nein',
    vu_nummer: String(req.body.vu_nummer || '').trim(),
    beschreibung: String(req.body.beschreibung || '').trim(),
    unfallgegner_name: String(req.body.unfallgegner_name || '').trim(),
    unfallgegner_kennzeichen: String(req.body.unfallgegner_kennzeichen || '').trim(),
    versicherung: String(req.body.versicherung || req.body.unfallgegner_versicherung || '').trim(),
    telefon: String(req.body.telefon || '').trim(),
    foto: '',
    schaden_markierungen: String(req.body.schaden_markierungen || '').trim(),
    datum: req.body.datum,
    uhrzeit: String(req.body.uhrzeit || '').trim(),
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
  assertModuleAllowed(data, req.user, 'schadenmodul');
  const row = data.schaeden.find((item) => item.id === Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Schaden nicht gefunden.' });
  const vehicle = data.fahrzeuge.find((item) => item.id === row.fahrzeug_id);
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf diesen Schaden.' });
  const isDriver = canUseDriverDamageForm(req.user.rolle);
  if (!isDriver && !canManageDamage(req.user.rolle)) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Schaden.' });
  }
  if (!canEditDamageRecord(req.user.rolle, req.user.id, row.created_by, row.status)) {
    return res.status(403).json({ error: isDriver ? 'Du darfst nur eigene offene Schadenmeldungen bearbeiten.' : 'Kein Zugriff auf diesen Schaden.' });
  }
  if (!isDriver && req.body.status) assertAllowedStatus(req.body.status, SCHADEN_STATUS);
  Object.assign(row, {
    fahrer_name: String(req.body.fahrer_name || row.fahrer_name || '').trim(),
    fahrer_telefon: String(req.body.fahrer_telefon || row.fahrer_telefon || '').trim(),
    polizei_vor_ort: req.body.polizei_vor_ort || row.polizei_vor_ort,
    verletzte: req.body.verletzte || row.verletzte,
    vu_nummer: String(req.body.vu_nummer || row.vu_nummer || '').trim(),
    beschreibung: String(req.body.beschreibung || row.beschreibung || '').trim(),
    unfallgegner_name: String(req.body.unfallgegner_name || row.unfallgegner_name || '').trim(),
    unfallgegner_kennzeichen: String(req.body.unfallgegner_kennzeichen || row.unfallgegner_kennzeichen || '').trim(),
    versicherung: String(req.body.versicherung || req.body.unfallgegner_versicherung || row.versicherung || '').trim(),
    telefon: String(req.body.telefon || row.telefon || '').trim(),
    schaden_markierungen: typeof req.body.schaden_markierungen !== 'undefined' ? String(req.body.schaden_markierungen || '').trim() : row.schaden_markierungen,
    datum: req.body.datum || row.datum,
    uhrzeit: String(req.body.uhrzeit || row.uhrzeit || '').trim(),
    status: isDriver ? row.status : (req.body.status || row.status)
  });
  if (!isDriver && req.body.fahrzeug_status) {
    assertAllowedStatus(req.body.fahrzeug_status, FAHRZEUG_STATUS);
    vehicle.status = req.body.fahrzeug_status;
  }
  writeDb(data);
  res.json(row);
});
app.delete('/api/schaeden/:id', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'schadenmodul');
  const id = Number(req.params.id);
  const row = data.schaeden.find((item) => item.id === id);
  if (!row) return res.status(404).json({ error: 'Schaden nicht gefunden.' });
  const vehicle = data.fahrzeuge.find((item) => item.id === row.fahrzeug_id);
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf diesen Schaden.' });
  data.schaeden = data.schaeden.filter((item) => item.id !== id);
  writeDb(data);
  res.json({ success: true });
});

app.post('/api/schaeden/:id/upload', authRequired, upload.single('foto'), (req, res) => {
  try {
    const data = readDb();
    assertModuleAllowed(data, req.user, 'schadenmodul');
    const row = data.schaeden.find((item) => item.id === Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Schaden nicht gefunden.' });
    const vehicle = data.fahrzeuge.find((item) => item.id === row.fahrzeug_id);
    if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf diesen Schaden.' });
    if (!canEditDamageRecord(req.user.rolle, req.user.id, row.created_by, row.status)) {
      return res.status(403).json({ error: 'Du darfst nur eigene offene Schadenmeldungen bebildern.' });
    }
    assertPackageLimit(data, req.user, 'uploads', { additionalBytes: req.file?.size || 0 });
    row.foto = `/uploads/${req.file.filename}`;
    writeDb(data);
    res.json({ success: true, foto: row.foto });
  } catch (error) {
    cleanupUploadedFile(req.file);
    throw error;
  }
});

app.get('/api/uvv', authRequired, (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'tuev');
  const rows = data.uvv_pruefungen
    .map((item) => ({ ...item, vehicle: data.fahrzeuge.find((f) => f.id === item.fahrzeug_id) }))
    .filter((item) => item.vehicle && filterByStandort(data, [item.vehicle], req.user, req, (vehicle) => vehicle.standort_id).length)
    .map((item) => ({ ...item, kennzeichen: item.vehicle.kennzeichen, fahrzeug: item.vehicle.fahrzeug, standort: locationName(data, item.vehicle.standort_id), checkpunkte: data.uvv_checkpunkte.filter((point) => point.uvv_pruefung_id === item.id).sort((a, b) => a.punkt_nr - b.punkt_nr) }));
  res.json(rows);
});
app.post('/api/uvv', authRequired, requireRoles('hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'tuev');
  const vehicle = data.fahrzeuge.find((item) => item.id === Number(req.body.fahrzeug_id));
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  const checkpunkte = Array.isArray(req.body.checkpunkte) ? req.body.checkpunkte : [];
  if (checkpunkte.length !== 20) return res.status(400).json({ error: 'Es muessen genau 20 UVV-Pruefpunkte uebergeben werden.' });
  const uvvRow = { 
    id: nextId(data.uvv_pruefungen), 
    mandant_id: req.user.mandant_id || 1,
    fahrzeug_id: vehicle.id, 
    pruefer: req.body.pruefer, 
    datum: req.body.datum, 
    naechste_pruefung_datum: req.body.naechste_pruefung_datum || '', 
    kommentar: req.body.kommentar || '', 
    created_at: nowIso() 
  };
  const startId = nextId(data.uvv_checkpunkte);
  const points = checkpunkte.map((point, index) => ({ id: startId + index, uvv_pruefung_id: uvvRow.id, punkt_nr: index + 1, punkt_name: CHECKPOINTS[index], status: point.status === 'nicht_ok' ? 'nicht_ok' : 'ok', kommentar: point.kommentar || '' }));
  vehicle.uvv_datum = uvvRow.naechste_pruefung_datum || uvvRow.datum;
  data.uvv_pruefungen.push(uvvRow);
  data.uvv_checkpunkte.push(...points);
  writeDb(data);
  res.json(uvvRow);
});
app.put('/api/uvv/:id', authRequired, requireRoles('hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'tuev');
  const id = Number(req.params.id);
  const uvv = data.uvv_pruefungen.find((item) => item.id === id);
  if (!uvv) return res.status(404).json({ error: 'UVV-Pruefung nicht gefunden.' });
  const vehicle = data.fahrzeuge.find((item) => item.id === Number(req.body.fahrzeug_id || uvv.fahrzeug_id));
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  const checkpunkte = Array.isArray(req.body.checkpunkte) ? req.body.checkpunkte : [];
  if (checkpunkte.length !== 20) return res.status(400).json({ error: 'Es muessen genau 20 UVV-Pruefpunkte uebergeben werden.' });
  uvv.fahrzeug_id = vehicle.id;
  uvv.pruefer = req.body.pruefer || uvv.pruefer;
  uvv.datum = req.body.datum || uvv.datum;
  uvv.naechste_pruefung_datum = req.body.naechste_pruefung_datum || '';
  uvv.kommentar = req.body.kommentar || '';
  data.uvv_checkpunkte = data.uvv_checkpunkte.filter((p) => p.uvv_pruefung_id !== id);
  const startId = nextId(data.uvv_checkpunkte);
  const points = checkpunkte.map((point, index) => ({ id: startId + index, uvv_pruefung_id: uvv.id, punkt_nr: index + 1, punkt_name: CHECKPOINTS[index], status: point.status === 'nicht_ok' ? 'nicht_ok' : 'ok', kommentar: point.kommentar || '' }));
  data.uvv_checkpunkte.push(...points);
  vehicle.uvv_datum = uvv.naechste_pruefung_datum || uvv.datum;
  writeDb(data);
  res.json(uvv);
});

app.delete('/api/uvv/:id', authRequired, requireRoles('hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'tuev');
  const id = Number(req.params.id);
  const uvv = data.uvv_pruefungen.find((item) => item.id === id);
  if (!uvv) return res.status(404).json({ error: 'UVV-Pruefung nicht gefunden.' });
  const vehicle = data.fahrzeuge.find((item) => item.id === uvv.fahrzeug_id);
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) return res.status(403).json({ error: 'Kein Zugriff auf diese UVV.' });
  data.uvv_pruefungen = data.uvv_pruefungen.filter((item) => item.id !== id);
  data.uvv_checkpunkte = data.uvv_checkpunkte.filter((item) => item.uvv_pruefung_id !== id);
  writeDb(data);
  res.json({ success: true });
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
  const doc = new PDFDocument({ margin: 24, size: "A4", layout: "portrait" });
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


app.get('/api/reinigung', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  res.json(scopedReinigungData(data, req.user, req, req.query.datum, req.query.reinigungstag));
});

app.put('/api/reinigung/toggle', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const vehicle = data.fahrzeuge.find((item) => item.id === Number(req.body.fahrzeug_id));
  if (!vehicle || (!canAccessVehicle(req.user, vehicle) && req.user.rolle !== 'hauptadmin')) {
    return res.status(403).json({ error: 'Kein Zugriff auf dieses Fahrzeug.' });
  }
  const datum = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.datum || '')) ? String(req.body.datum) : todayText();
  const tag = sanitizeReinigungstag(req.body.reinigungstag);
  const erledigt = !!req.body.erledigt;
  data.reinigung = data.reinigung || [];
  const existing = data.reinigung.find((item) => Number(item.fahrzeug_id) === Number(vehicle.id) && String(item.datum) === datum && sanitizeReinigungstag(item.reinigungstag) === tag);
  if (erledigt) {
    if (existing) {
      existing.gereinigt_am = todayText();
      existing.bearbeitet_von = req.user.name || req.user.benutzername || '';
      existing.standort_id = vehicle.standort_id;
      existing.bemerkung = existing.bemerkung || '';
    } else {
      data.reinigung.push({
        id: nextId(data.reinigung),
        fahrzeug_id: vehicle.id,
        standort_id: vehicle.standort_id,
        datum,
        reinigungstag: tag,
        gereinigt_am: todayText(),
        bearbeitet_von: req.user.name || req.user.benutzername || '',
        bemerkung: '',
        created_at: nowIso()
      });
    }
  } else {
    data.reinigung = data.reinigung.filter((item) => !(Number(item.fahrzeug_id) === Number(vehicle.id) && String(item.datum) === datum && sanitizeReinigungstag(item.reinigungstag) === tag));
  }
  writeDb(data);
  res.json(scopedReinigungData(data, req.user, req, datum, tag));
});

app.get('/api/reinigung/pdf', authRequired, requireRoles('hauptadmin', 'admin'), (req, res) => {
  const data = readDb();
  const payload = scopedReinigungData(data, req.user, req, req.query.datum, req.query.reinigungstag);
  const doc = new PDFDocument({ margin: 24, size: 'A4', layout: 'portrait' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="reinigung_${payload.datum}_tag${payload.reinigungstag}.pdf"`);
  doc.pipe(res);

  const standortText = req.user.rolle === 'hauptadmin'
    ? (selectedStandortId(req, req.user) ? locationName(data, selectedStandortId(req, req.user)) : 'Gesamtuebersicht alle Standorte')
    : (req.user.standort || locationName(data, req.user.standort_id));

  const page = {
    left: doc.page.margins.left,
    right: doc.page.width - doc.page.margins.right,
    width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    bottom: doc.page.height - doc.page.margins.bottom
  };
  const colors = {
    ink: '#0F172A',
    muted: '#475569',
    line: '#CBD5E1',
    soft: '#E2E8F0',
    panel: '#F8FAFC',
    header: '#E0ECFF',
    brand: '#1D4ED8',
    success: '#DCFCE7',
    warn: '#FEF3C7',
    neutral: '#F1F5F9'
  };
  const offeneFahrzeuge = payload.aktuelle.filter((item) => !item.gereinigt);

  const ensureSpace = (neededHeight) => {
    if (doc.y + neededHeight <= page.bottom) return;
    doc.addPage();
  };

  const drawHeader = () => {
    const top = doc.y;
    doc.roundedRect(page.left, top, page.width, 78, 12).fillAndStroke(colors.header, colors.soft);
    doc.fillColor(colors.brand).font('Helvetica-Bold').fontSize(21).text('Reinigungsliste', page.left + 18, top + 16);
    doc.fillColor(colors.muted).font('Helvetica').fontSize(10).text(`Standort: ${standortText}`, page.left + 18, top + 42);
    doc.text(`Datum: ${payload.datum}`, page.left + 18, top + 56);
    doc.font('Helvetica-Bold').fillColor(colors.ink).fontSize(11).text(`Tag ${payload.reinigungstag}`, page.right - 88, top + 28, { width: 64, align: 'center' });
    doc.roundedRect(page.right - 98, top + 18, 74, 34, 10).stroke(colors.brand);
    doc.y = top + 94;
  };

  const drawSummaryCard = (x, y, width, label, value, fill) => {
    doc.roundedRect(x, y, width, 54, 10).fillAndStroke(fill, colors.soft);
    doc.fillColor(colors.muted).font('Helvetica').fontSize(9).text(label, x + 12, y + 11, { width: width - 24 });
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(20).text(String(value), x + 12, y + 25, { width: width - 24 });
  };

  const drawSectionTitle = (title, subtitle, minRemainingHeight = 54) => {
    ensureSpace(minRemainingHeight);
    doc.fillColor(colors.ink).font('Helvetica-Bold').fontSize(14).text(title, page.left, doc.y);
    if (subtitle) {
      doc.moveDown(0.15);
      doc.fillColor(colors.muted).font('Helvetica').fontSize(9).text(subtitle, page.left, doc.y);
    }
    doc.moveDown(0.45);
  };

  const drawTable = (title, subtitle, columns, rows) => {
    const estimatedIntroHeight = rows.length ? 112 : 96;
    drawSectionTitle(title, subtitle, estimatedIntroHeight);
    const startX = page.left;
    const widths = columns.map((column) => column.width);
    const renderHeader = () => {
      let x = startX;
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.ink);
      columns.forEach((column, index) => {
        doc.roundedRect(x, y, widths[index], 22, 4).fillAndStroke(colors.neutral, colors.line);
        doc.fillColor(colors.ink).text(column.label, x + 6, y + 7, { width: widths[index] - 12, ellipsis: true });
        x += widths[index];
      });
      doc.y = y + 28;
    };
    renderHeader();

    const safeRows = rows.length ? rows : [{ __empty: true }];
    safeRows.forEach((row, rowIndex) => {
      const values = row.__empty ? ['Keine Daten vorhanden.'] : columns.map((column) => String(row[column.key] ?? ''));
      const estimated = row.__empty
        ? 34
        : Math.max(...columns.map((column, index) => doc.heightOfString(values[index], { width: widths[index] - 12, align: column.align || 'left' })), 14);
      const rowHeight = row.__empty ? 34 : Math.max(24, estimated + 10);
      if (doc.y + rowHeight > page.bottom - 10) {
        doc.addPage();
        renderHeader();
      }

      let x = startX;
      const y = doc.y;
      if (!row.__empty && rowIndex % 2 === 0) {
        doc.roundedRect(startX, y, page.width, rowHeight, 4).fill(colors.panel);
      }

      for (let index = 0; index < widths.length; index += 1) {
        doc.rect(x, y, widths[index], rowHeight).stroke(colors.line);
        const text = row.__empty ? (index === 0 ? values[0] : '') : values[index];
        doc.fillColor(colors.ink).font('Helvetica').fontSize(9).text(text, x + 6, y + 6, {
          width: widths[index] - 12,
          align: columns[index].align || 'left'
        });
        x += widths[index];
      }
      doc.y = y + rowHeight;
    });
    doc.moveDown(0.8);
  };

  drawHeader();

  const gap = 12;
  const cardWidth = (page.width - gap * 2) / 3;
  const cardsY = doc.y;
  drawSummaryCard(page.left, cardsY, cardWidth, 'Offen fuer Reinigung', offeneFahrzeuge.length, colors.warn);
  drawSummaryCard(page.left + cardWidth + gap, cardsY, cardWidth, 'Bereits gereinigt', payload.gereinigt.length, colors.success);
  drawSummaryCard(page.left + (cardWidth + gap) * 2, cardsY, cardWidth, 'Aktuell in Werkstatt', payload.werkstatt.length, colors.neutral);
  doc.y = cardsY + 70;

  drawTable('Aktuelle Fahrzeuge', 'Fahrzeuge, die fuer diesen Reinigungstag noch offen sind.', [
    { key: 'kennzeichen', label: 'Kennzeichen', width: 92 },
    { key: 'fahrzeug', label: 'Fahrzeug', width: 170 },
    { key: 'standort', label: 'Standort', width: 126 },
    { key: 'hinweis', label: 'Hinweis', width: 104 }
  ], offeneFahrzeuge);

  drawTable('Wurde gereinigt', 'Bereits erledigte Fahrzeuge mit Bearbeiter und Datum.', [
    { key: 'kennzeichen', label: 'Kennzeichen', width: 92 },
    { key: 'fahrzeug', label: 'Fahrzeug', width: 162 },
    { key: 'gereinigt_am', label: 'Gereinigt am', width: 90 },
    { key: 'bearbeitet_von', label: 'Bearbeitet von', width: 148 }
  ], payload.gereinigt);

  drawTable('In Werkstatt', 'Fahrzeuge, die aktuell nicht zur Reinigung anstehen.', [
    { key: 'kennzeichen', label: 'Kennzeichen', width: 92 },
    { key: 'fahrzeug', label: 'Fahrzeug', width: 140 },
    { key: 'werkstatt_name', label: 'Werkstatt', width: 106 },
    { key: 'datum_von', label: 'Seit', width: 74, align: 'center' },
    { key: 'status', label: 'Status', width: 80 }
  ], payload.werkstatt);

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

app.post('/api/import/csv', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'), (req, res) => {
  const data = readDb();
  assertModuleAllowed(data, req.user, 'export', 'CSV-Import ist fuer dieses Paket nicht verfuegbar.');
  const records = parse(req.body.csv || '', { delimiter: ';', columns: ['kennzeichen', 'fahrzeug', 'uvv', 'hu', 'standort'], trim: true, skip_empty_lines: true });
  const created = [];
  const errors = [];
  const importedStandorte = new Set();
  const policy = packagePolicyForMandant(data, req.user.mandant_id || 1);
  const vehicleLimit = Number.isFinite(policy?.limits?.fahrzeuge) ? Number(policy.limits.fahrzeuge) : null;
  let currentVehicleCount = (data.fahrzeuge || []).filter((item) => Number(item.mandant_id || 1) === Number(req.user.mandant_id || 1)).length;
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
    if (vehicleLimit !== null && currentVehicleCount >= vehicleLimit) {
      errors.push({ line: index + 1, error: `Paketlimit erreicht: ${policy.name} erlaubt ${vehicleLimit} Fahrzeuge.` });
      continue;
    }
    data.fahrzeuge.push({ id: nextId(data.fahrzeuge), kennzeichen: row.kennzeichen, fahrzeug: row.fahrzeug, standort_id: standort.id, status: 'aktiv', hu_datum: row.hu, uvv_datum: row.uvv, created_at: nowIso() });
    created.push(row.kennzeichen);
    currentVehicleCount += 1;
  }
  writeDb(data);
  res.json({ imported: created.length, created, errors });
});
app.get('/api/aktivitaeten', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
  const data = readDb();
  res.json(scopedActivities(data, req.user, req).slice(0, 100));
});

app.get('/api/export/csv', authRequired, requireRoles('superadmin', 'hauptadmin', 'admin', 'abteilungsleiter'), (req, res) => {
  const data = readDb();
  if (!packageAllows(data, req.user, 'export') && !packageAllows(data, req.user, 'all')) {
    return res.status(403).json({ error: 'Das Export-Modul ist fuer dieses Paket nicht freigeschaltet.' });
  }
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

app.get('/app/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('*', (req, res) => res.redirect('/'));
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
