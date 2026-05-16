const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canGrantAppRole,
  canUseDriverDamageForm,
  canManageDamage,
  canViewDamageRecord,
  canEditDamageRecord,
  packageBlocksEntity,
  packageAllowsModule,
  effectiveModules,
  normalizeAppRole,
  displayAppRole
} = require('../lib/system-rules');

test('nur verwaltung darf hauptadmin anlegen', () => {
  assert.equal(canGrantAppRole('hauptadmin', 'hauptadmin'), true);
  assert.equal(canGrantAppRole('superadmin', 'hauptadmin'), true);
  assert.equal(canGrantAppRole('admin', 'hauptadmin'), false);
  assert.equal(canGrantAppRole('abteilungsleiter', 'hauptadmin'), false);
  assert.equal(canGrantAppRole('benutzer', 'hauptadmin'), false);
});

test('admin und abteilungsleiter duerfen keine verwaltung anlegen', () => {
  assert.equal(canGrantAppRole('admin', 'admin'), false);
  assert.equal(canGrantAppRole('admin', 'abteilungsleiter'), true);
  assert.equal(canGrantAppRole('admin', 'lagerleiter'), true);
  assert.equal(canGrantAppRole('admin', 'benutzer'), true);
  assert.equal(canGrantAppRole('abteilungsleiter', 'admin'), false);
  assert.equal(canGrantAppRole('abteilungsleiter', 'abteilungsleiter'), false);
  assert.equal(canGrantAppRole('abteilungsleiter', 'benutzer'), true);
  assert.equal(canGrantAppRole('lagerleiter', 'benutzer'), true);
});

test('fahrer darf nur fahrer-schadenformular nutzen', () => {
  assert.equal(canUseDriverDamageForm('benutzer'), true);
  assert.equal(canUseDriverDamageForm('fahrer'), true);
  assert.equal(canUseDriverDamageForm('admin'), false);
  assert.equal(canUseDriverDamageForm('hauptadmin'), false);
  assert.equal(canManageDamage('admin'), true);
  assert.equal(canManageDamage('abteilungsleiter'), true);
  assert.equal(canManageDamage('lagerleiter'), true);
  assert.equal(canManageDamage('hauptadmin'), true);
  assert.equal(canManageDamage('benutzer'), false);
});

test('fahrer darf nur eigene offene schaeden sehen und bearbeiten', () => {
  assert.equal(canViewDamageRecord('benutzer', 7, 7), true);
  assert.equal(canViewDamageRecord('benutzer', 7, 8), false);
  assert.equal(canEditDamageRecord('benutzer', 7, 7, 'gemeldet'), true);
  assert.equal(canEditDamageRecord('benutzer', 7, 7, 'abgeschlossen'), false);
  assert.equal(canEditDamageRecord('benutzer', 7, 8, 'gemeldet'), false);
  assert.equal(canEditDamageRecord('admin', 7, 8, 'abgeschlossen'), true);
});

test('paketlimits blockieren nur passende entitaeten', () => {
  assert.equal(packageBlocksEntity('Starter', 'standorte', 1, 1), true);
  assert.equal(packageBlocksEntity('Starter', 'fahrzeuge', 10, 1), true);
  assert.equal(packageBlocksEntity('Starter', 'benutzer', 3, 1), true);
  assert.equal(packageBlocksEntity('Starter', 'uploads', 5 * 1024, 1), true);
  assert.equal(packageBlocksEntity('Starter', 'werkstatt', 999, 1), false);
  assert.equal(packageBlocksEntity('Starter', 'schaeden', 999, 1), false);
});

test('zusatzmodule erweitern paketrechte', () => {
  assert.equal(packageAllowsModule('Starter', [], 'schadenmodul'), false);
  assert.equal(packageAllowsModule('Starter', ['schadenmodul'], 'schadenmodul'), true);
  assert.equal(packageAllowsModule('Professional', [], 'versicherung'), true);
  assert.deepEqual(effectiveModules('Enterprise', ['anything']), ['all']);
});

test('rollenalias und labels werden korrekt normalisiert', () => {
  assert.equal(normalizeAppRole('Verwaltung'), 'hauptadmin');
  assert.equal(normalizeAppRole('Fuhrparkmanager'), 'admin');
  assert.equal(normalizeAppRole('Fahrer'), 'benutzer');
  assert.equal(displayAppRole('hauptadmin'), 'Verwaltung');
  assert.equal(displayAppRole('admin'), 'Fuhrparkmanager');
  assert.equal(displayAppRole('benutzer'), 'Fahrer');
});
