const bcrypt = require('bcryptjs');

const locations = ['Frankfurt', 'Köln', 'München', 'Berlin', 'Mannheim'];
const vehicleSeeds = [
  ['F-FM-1001', 'VW Crafter', 'Frankfurt', 'verfuegbar', '2026-08-10', '2026-05-20'],
  ['K-FM-2002', 'Mercedes Sprinter', 'Köln', 'werkstatt', '2026-04-18', '2026-04-05'],
  ['M-FM-3003', 'Ford Transit', 'München', 'schaden', '2026-03-29', '2026-03-26'],
  ['B-FM-4004', 'Opel Vivaro', 'Berlin', 'verfuegbar', '2026-09-15', '2026-06-01'],
  ['MA-FM-5005', 'Renault Master', 'Mannheim', 'ausser_betrieb', '2026-03-21', '2026-03-18']
];

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS standorte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS benutzer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwort_hash TEXT NOT NULL,
      rolle TEXT NOT NULL CHECK(rolle IN ('hauptadmin','admin','benutzer')),
      standort_id INTEGER,
      aktiv INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (standort_id) REFERENCES standorte(id)
    );

    CREATE TABLE IF NOT EXISTS fahrzeuge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kennzeichen TEXT NOT NULL UNIQUE,
      fahrzeug TEXT NOT NULL,
      standort_id INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('verfuegbar','werkstatt','schaden','ausser_betrieb')),
      hu_datum TEXT,
      uvv_datum TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (standort_id) REFERENCES standorte(id)
    );

    CREATE TABLE IF NOT EXISTS werkstatt (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fahrzeug_id INTEGER NOT NULL,
      werkstatt_name TEXT NOT NULL,
      datum_von TEXT NOT NULL,
      datum_bis TEXT,
      tage INTEGER DEFAULT 0,
      beschreibung TEXT,
      status TEXT NOT NULL CHECK(status IN ('offen','in_bearbeitung','abgeschlossen')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fahrzeug_id) REFERENCES fahrzeuge(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS schaeden (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fahrzeug_id INTEGER NOT NULL,
      beschreibung TEXT NOT NULL,
      unfallgegner_name TEXT,
      unfallgegner_kennzeichen TEXT,
      versicherung TEXT,
      telefon TEXT,
      foto TEXT,
      datum TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'gemeldet',
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fahrzeug_id) REFERENCES fahrzeuge(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES benutzer(id)
    );

    CREATE TABLE IF NOT EXISTS uvv_pruefungen (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fahrzeug_id INTEGER NOT NULL,
      pruefer TEXT NOT NULL,
      datum TEXT NOT NULL,
      kommentar TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (fahrzeug_id) REFERENCES fahrzeuge(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS uvv_checkpunkte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uvv_pruefung_id INTEGER NOT NULL,
      punkt_nr INTEGER NOT NULL,
      punkt_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ok','nicht_ok')),
      kommentar TEXT,
      FOREIGN KEY (uvv_pruefung_id) REFERENCES uvv_pruefungen(id) ON DELETE CASCADE
    );
  `);
}

function seedDatabase(db) {
  createSchema(db);

  const locationCount = db.prepare('SELECT COUNT(*) AS count FROM standorte').get().count;
  if (!locationCount) {
    const insertLocation = db.prepare('INSERT INTO standorte (name) VALUES (?)');
    locations.forEach((name) => insertLocation.run(name));
  }

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM benutzer').get().count;
  if (!userCount) {
    const getLocationId = db.prepare('SELECT id FROM standorte WHERE name = ?');
    const insertUser = db.prepare(`
      INSERT INTO benutzer (name, email, passwort_hash, rolle, standort_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertUser.run('Michael Weber', 'admin@fuhrpark.local', bcrypt.hashSync('Admin123!', 10), 'hauptadmin', null);
    insertUser.run('Admin Frankfurt', 'frankfurt@fuhrpark.local', bcrypt.hashSync('Admin123!', 10), 'admin', getLocationId.get('Frankfurt').id);
    insertUser.run('Benutzer Frankfurt', 'user@fuhrpark.local', bcrypt.hashSync('User123!', 10), 'benutzer', getLocationId.get('Frankfurt').id);
  }

  const vehicleCount = db.prepare('SELECT COUNT(*) AS count FROM fahrzeuge').get().count;
  if (!vehicleCount) {
    const getLocationId = db.prepare('SELECT id FROM standorte WHERE name = ?');
    const insertVehicle = db.prepare(`
      INSERT INTO fahrzeuge (kennzeichen, fahrzeug, standort_id, status, hu_datum, uvv_datum)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    vehicleSeeds.forEach(([kennzeichen, fahrzeug, standort, status, hu, uvv]) => {
      insertVehicle.run(kennzeichen, fahrzeug, getLocationId.get(standort).id, status, hu, uvv);
    });
  }

  const workshopCount = db.prepare('SELECT COUNT(*) AS count FROM werkstatt').get().count;
  if (!workshopCount) {
    const vehicle = db.prepare('SELECT id FROM fahrzeuge WHERE kennzeichen = ?');
    db.prepare(`INSERT INTO werkstatt (fahrzeug_id, werkstatt_name, datum_von, datum_bis, tage, beschreibung, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(vehicle.get('K-FM-2002').id, 'Autohaus Köln', '2026-03-10', '2026-03-14', 4, 'Bremsenprüfung und Ölwechsel', 'in_bearbeitung');
  }

  const damageCount = db.prepare('SELECT COUNT(*) AS count FROM schaeden').get().count;
  if (!damageCount) {
    const vehicle = db.prepare('SELECT id FROM fahrzeuge WHERE kennzeichen = ?');
    const user = db.prepare('SELECT id FROM benutzer WHERE email = ?');
    db.prepare(`INSERT INTO schaeden (fahrzeug_id, beschreibung, unfallgegner_name, unfallgegner_kennzeichen, versicherung, telefon, datum, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(vehicle.get('M-FM-3003').id, 'Frontschaden nach Parkrempler', 'Max Mustermann', 'M-AB-1234', 'Allianz', '01701234567', '2026-03-09', 'in_pruefung', user.get('admin@fuhrpark.local').id);
  }

  const uvvCount = db.prepare('SELECT COUNT(*) AS count FROM uvv_pruefungen').get().count;
  if (!uvvCount) {
    const vehicle = db.prepare('SELECT id FROM fahrzeuge WHERE kennzeichen = ?');
    const uvvInsert = db.prepare('INSERT INTO uvv_pruefungen (fahrzeug_id, pruefer, datum, kommentar) VALUES (?, ?, ?, ?)');
    const result = uvvInsert.run(vehicle.get('F-FM-1001').id, 'Michael Weber', '2026-03-01', 'Fahrzeug in gutem Zustand');
    const checkpoints = [
      'Beleuchtung','Scheibenwischer','Spiegel','Hupe','Bremsen','Lenkung','Reifen','Reifendruck','Radmuttern','Sitze',
      'Sicherheitsgurte','Heizung','Aufbauten','Abgasanlage','Warnweste','Verbandskasten','Ladungssicherung','Schlösser','Einbauten','Betriebsanleitung'
    ];
    const insertPoint = db.prepare('INSERT INTO uvv_checkpunkte (uvv_pruefung_id, punkt_nr, punkt_name, status, kommentar) VALUES (?, ?, ?, ?, ?)');
    checkpoints.forEach((name, index) => {
      insertPoint.run(result.lastInsertRowid, index + 1, name, 'ok', '');
    });
  }
}

module.exports = { createSchema, seedDatabase };
