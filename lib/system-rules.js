const PACKAGE_DEFINITIONS = {
  kostenlos: {
    name: 'Kostenlos',
    preis: '0 EUR / Monat',
    abrechnung: 'monatlich',
    standorte: '1 Standort',
    status: 'aktiv',
    beschreibung: '30 Tage testen',
    leistungen: '3 Fahrzeuge, 1 Benutzer, 500 MB Speicher, Grundfunktionen, TUEV-Verwaltung',
    limits: { standorte: 1, fahrzeuge: 3, benutzer: 1, speicherMb: 500 },
    modules: ['grundfunktionen', 'tuev']
  },
  starter: {
    name: 'Starter',
    preis: '19 EUR / Monat | 190 EUR / Jahr',
    abrechnung: 'monatlich',
    standorte: '1 Standort',
    status: 'aktiv',
    beschreibung: 'Ideal fuer den Einstieg',
    leistungen: '10 Fahrzeuge, 3 Benutzer, 5 GB Speicher, Berichte, Export-Funktionen',
    limits: { standorte: 1, fahrzeuge: 10, benutzer: 3, speicherMb: 5 * 1024 },
    modules: ['grundfunktionen', 'berichte', 'export']
  },
  professional: {
    name: 'Professional',
    preis: '49 EUR / Monat | 490 EUR / Jahr',
    abrechnung: 'monatlich',
    standorte: '5 Standorte',
    status: 'aktiv',
    beschreibung: 'Fuer wachsende Flotten',
    leistungen: '50 Fahrzeuge, 10 Benutzer, 25 GB Speicher, Schaden- und Versicherungsmodul, E-Mail Support',
    limits: { standorte: 5, fahrzeuge: 50, benutzer: 10, speicherMb: 25 * 1024 },
    modules: ['grundfunktionen', 'berichte', 'export', 'schadenmodul', 'versicherung', 'email_support']
  },
  enterprise: {
    name: 'Enterprise',
    preis: '99 EUR / Monat | 990 EUR / Jahr',
    abrechnung: 'monatlich',
    standorte: 'Unbegrenzt',
    status: 'aktiv',
    beschreibung: 'Fuer grosse Organisationen',
    leistungen: 'Unbegrenzt Fahrzeuge und Standorte, alle Features, Priority Support',
    limits: { standorte: null, fahrzeuge: null, benutzer: null, speicherMb: null },
    modules: ['all']
  }
};

const DEFAULT_ADDON_MODULES = [
  'rechnung',
  'versicherung',
  'tankauswertungen',
  'lagerverwaltung',
  'standortzuweisung',
  'pruefdaten',
  'tournummer',
  'uhrzeit',
  'kennzeichen',
  'schadenmodul',
  'werkstattmodul',
  'export',
  'berichte'
];

const ROLE_LABELS = {
  superadmin: 'Verwaltung',
  hauptadmin: 'Verwaltung',
  admin: 'Fuhrparkmanager',
  abteilungsleiter: 'Abteilungsleiter',
  lagerleiter: 'Lagerleiter',
  benutzer: 'Fahrer',
  hr: 'HR / Personal',
  mitarbeiter: 'Mitarbeiter'
};

const ROLE_ALIASES = {
  verwaltung: 'hauptadmin',
  hauptadmin: 'hauptadmin',
  superadmin: 'superadmin',
  fuhrparkmanager: 'admin',
  admin: 'admin',
  abteilungsleiter: 'abteilungsleiter',
  lagerleiter: 'lagerleiter',
  fahrer: 'benutzer',
  benutzer: 'benutzer',
  hr: 'hr',
  mitarbeiter: 'mitarbeiter'
};

function packageDefinitionByName(name) {
  return PACKAGE_DEFINITIONS[String(name || '').trim().toLowerCase()] || null;
}

function normalizeAppRole(role) {
  const normalized = ROLE_ALIASES[String(role || '').trim().toLowerCase()];
  return normalized || 'benutzer';
}

function displayAppRole(role) {
  const normalized = normalizeAppRole(role);
  return ROLE_LABELS[normalized] || normalized;
}

function isManagementRole(role) {
  return ['superadmin', 'hauptadmin'].includes(normalizeAppRole(role));
}

function isFleetAdminRole(role) {
  return ['superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'].includes(normalizeAppRole(role));
}

function isDriverRole(role) {
  return normalizeAppRole(role) === 'benutzer';
}

function canUseDriverDamageForm(role) {
  return isDriverRole(role);
}

function canManageDamage(role) {
  return ['superadmin', 'hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter'].includes(normalizeAppRole(role));
}

function canViewDamageRecord(role, currentUserId, createdBy) {
  if (!isDriverRole(role)) return canManageDamage(role) || isManagementRole(role);
  return Number(currentUserId) === Number(createdBy);
}

function canEditDamageRecord(role, currentUserId, createdBy, status) {
  if (!isDriverRole(role)) return canManageDamage(role) || isManagementRole(role);
  return Number(currentUserId) === Number(createdBy) && String(status || '').trim() !== 'abgeschlossen';
}

function canGrantAppRole(actorRole, targetRole) {
  const actor = normalizeAppRole(actorRole);
  const next = normalizeAppRole(targetRole);
  if (['superadmin', 'hauptadmin'].includes(actor)) return ['hauptadmin', 'admin', 'abteilungsleiter', 'lagerleiter', 'benutzer'].includes(next);
  if (actor === 'admin') return ['abteilungsleiter', 'lagerleiter', 'benutzer'].includes(next);
  if (['abteilungsleiter', 'lagerleiter'].includes(actor)) return ['benutzer'].includes(next);
  return false;
}

function normalizeBackofficePortalRole(value) {
  const allowed = ['hr', 'mitarbeiter'];
  return allowed.includes(String(value || '').trim()) ? String(value).trim() : 'mitarbeiter';
}

function canSeePersonnel(role) {
  return ['superadmin', 'hauptadmin', 'hr'].includes(String(role || '').trim());
}

function canManageBackoffice(role) {
  return ['superadmin', 'hauptadmin', 'hr'].includes(String(role || '').trim());
}

function parseModuleList(input) {
  if (Array.isArray(input)) {
    return [...new Set(input.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
  }
  return [...new Set(String(input || '')
    .split(/\r?\n|,|;/)
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean))];
}

function effectiveModules(packageName, extraModules = []) {
  const pkg = packageDefinitionByName(packageName) || packageDefinitionByName('kostenlos');
  const merged = new Set([...(pkg?.modules || []), ...parseModuleList(extraModules)]);
  if (merged.has('all')) return ['all'];
  return [...merged];
}

function packageAllowsModule(packageName, extraModules, moduleName) {
  const modules = effectiveModules(packageName, extraModules);
  const target = String(moduleName || '').trim().toLowerCase();
  if (!target) return false;
  return modules.includes('all') || modules.includes(target);
}

function entityLimitKey(entityType) {
  if (entityType === 'standorte') return 'standorte';
  if (entityType === 'fahrzeuge') return 'fahrzeuge';
  if (entityType === 'benutzer') return 'benutzer';
  if (entityType === 'uploads') return 'speicherMb';
  return null;
}

function packageBlocksEntity(packageName, entityType, currentValue, additionalValue = 1) {
  const key = entityLimitKey(entityType);
  if (!key) return false;
  const pkg = packageDefinitionByName(packageName) || packageDefinitionByName('kostenlos');
  const limit = pkg?.limits?.[key];
  if (!Number.isFinite(Number(limit))) return false;
  return Number(currentValue || 0) + Number(additionalValue || 0) > Number(limit);
}

module.exports = {
  PACKAGE_DEFINITIONS,
  DEFAULT_ADDON_MODULES,
  ROLE_LABELS,
  ROLE_ALIASES,
  packageDefinitionByName,
  normalizeAppRole,
  displayAppRole,
  isManagementRole,
  isFleetAdminRole,
  isDriverRole,
  canUseDriverDamageForm,
  canManageDamage,
  canViewDamageRecord,
  canEditDamageRecord,
  canGrantAppRole,
  normalizeBackofficePortalRole,
  canSeePersonnel,
  canManageBackoffice,
  parseModuleList,
  effectiveModules,
  packageAllowsModule,
  entityLimitKey,
  packageBlocksEntity
};
