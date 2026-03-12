CREATE TABLE IF NOT EXISTS standorte (
  id INTEGER PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS benutzer (
  id INTEGER PRIMARY KEY,
  benutzername VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  passwort_hash TEXT NOT NULL,
  rolle VARCHAR(20) NOT NULL CHECK (rolle IN ('hauptadmin', 'admin', 'benutzer')),
  standort_id INTEGER REFERENCES standorte(id) ON DELETE SET NULL,
  aktiv INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fahrzeuge (
  id INTEGER PRIMARY KEY,
  kennzeichen VARCHAR(80) NOT NULL,
  fahrzeug VARCHAR(160) NOT NULL,
  standort_id INTEGER NOT NULL REFERENCES standorte(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL,
  hu_datum DATE,
  uvv_datum DATE,
  fahrzeugschein_pdf TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS werkstatt_bereiche (
  id INTEGER PRIMARY KEY,
  standort_id INTEGER NOT NULL REFERENCES standorte(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  name VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (standort_id, slot)
);

CREATE TABLE IF NOT EXISTS werkstatt (
  id INTEGER PRIMARY KEY,
  fahrzeug_id INTEGER NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  workshop_slot INTEGER,
  werkstatt_name VARCHAR(160),
  positionsnummer VARCHAR(80),
  problem VARCHAR(200),
  pruefzeichen VARCHAR(20),
  status_datum DATE,
  datum_von DATE,
  datum_bis DATE,
  tage INTEGER NOT NULL DEFAULT 0,
  beschreibung TEXT,
  status VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schaeden (
  id INTEGER PRIMARY KEY,
  fahrzeug_id INTEGER NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  fahrer_name VARCHAR(160),
  fahrer_telefon VARCHAR(80),
  beschreibung TEXT,
  unfallgegner_name VARCHAR(160),
  unfallgegner_kennzeichen VARCHAR(80),
  versicherung VARCHAR(160),
  telefon VARCHAR(80),
  foto TEXT,
  datum DATE,
  status VARCHAR(40) NOT NULL,
  polizei_vor_ort VARCHAR(20),
  verletzte VARCHAR(20),
  vu_nummer VARCHAR(120),
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uvv_pruefungen (
  id INTEGER PRIMARY KEY,
  fahrzeug_id INTEGER NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  pruefer VARCHAR(160) NOT NULL,
  datum DATE NOT NULL,
  naechste_pruefung_datum DATE,
  kommentar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uvv_checkpunkte (
  id INTEGER PRIMARY KEY,
  uvv_pruefung_id INTEGER NOT NULL REFERENCES uvv_pruefungen(id) ON DELETE CASCADE,
  punkt_nr INTEGER NOT NULL,
  punkt_name VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL,
  kommentar TEXT
);
