-- 0. Mandanten (Kunden / Unternehmen)
CREATE TABLE IF NOT EXISTS mandanten (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subdomain VARCHAR(50) UNIQUE, -- optional fuer saas.dein-server.de/kunde1
  aktiv BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Neu: Freie Kalender-Events (Google Calendar Style)
CREATE TABLE IF NOT EXISTS kalender_events (
  id SERIAL PRIMARY KEY,
  mandant_id INTEGER NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  titel VARCHAR(255) NOT NULL,
  beschreibung TEXT,
  start_datum DATE NOT NULL,
  end_datum DATE, -- optional
  typ VARCHAR(50) DEFAULT 'allgemein', -- werkstatt, hu, uvv, schaden, allgemein
  fahrzeug_id INTEGER REFERENCES fahrzeuge(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1. Standorte (Referenz auf Mandanten)
CREATE TABLE IF NOT EXISTS standorte (
  id SERIAL PRIMARY KEY,
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Benutzer (Referenz auf Mandanten)
CREATE TABLE IF NOT EXISTS benutzer (
  id SERIAL PRIMARY KEY,
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
  benutzername VARCHAR(100) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  passwort_hash VARCHAR(255) NOT NULL,
  rolle VARCHAR(20) NOT NULL DEFAULT 'benutzer', -- superadmin, hauptadmin, admin, benutzer
  standort_id INTEGER REFERENCES standorte(id) ON DELETE SET NULL,
  aktiv BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mandant_id, benutzername),
  UNIQUE(mandant_id, email)
);

-- 3. Fahrzeuge (Referenz auf Mandanten)
CREATE TABLE IF NOT EXISTS fahrzeuge (
  id SERIAL PRIMARY KEY,
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
  kennzeichen VARCHAR(20) NOT NULL,
  fahrzeug VARCHAR(100) NOT NULL,
  standort_id INTEGER REFERENCES standorte(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'aktiv',
  hu_datum DATE,
  uvv_datum DATE,
  fahrzeugschein_pdf TEXT,
  fin VARCHAR(17),
  radiocode VARCHAR(50),
  tankkarten_vorhanden BOOLEAN DEFAULT FALSE,
  tankkarte_aral_nummer VARCHAR(50),
  tankkarte_aral_aktiv_seit DATE,
  tankkarte_aral_gueltig_bis DATE,
  tankkarte_shell_nummer VARCHAR(50),
  tankkarte_shell_gueltig_von DATE,
  tankkarte_shell_gueltig_bis DATE,
  tankkarte_shell_name VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(mandant_id, kennzeichen)
);

-- 4. Fahrzeug-Dokumente
CREATE TABLE IF NOT EXISTS fahrzeug_dokumente (
  id SERIAL PRIMARY KEY,
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
  fahrzeug_id INTEGER NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  datei_pfad TEXT NOT NULL,
  typ VARCHAR(40), -- z.B. 'Versicherung', 'Leasing', 'Sonstiges'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Neu: Fuehrerscheinkontrolle
CREATE TABLE IF NOT EXISTS fuehrerscheinkontrollen (
  id SERIAL PRIMARY KEY,
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
  benutzer_id INTEGER NOT NULL REFERENCES benutzer(id) ON DELETE CASCADE,
  pruef_datum DATE NOT NULL,
  naechste_pruefung DATE NOT NULL,
  ausstellungsdatum DATE,
  gueltig_bis DATE,
  besitz_seit DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'ok', -- ok, faellig, ueberfaellig
  klassen VARCHAR(100), -- z.B. B, C, CE
  dokument_pfad TEXT, -- Foto vom Fuehrerschein
  pruefer_id INTEGER REFERENCES benutzer(id),
  bemerkung TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS werkstatt_bereiche (
  id INTEGER PRIMARY KEY,
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
  standort_id INTEGER NOT NULL REFERENCES standorte(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  name VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (standort_id, slot)
);

CREATE TABLE IF NOT EXISTS lagerorte (
  id INTEGER PRIMARY KEY,
  mandant_id INTEGER NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  standort_id INTEGER REFERENCES standorte(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  typ VARCHAR(40) DEFAULT 'hauptlager',
  aktiv BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lagerartikel (
  id INTEGER PRIMARY KEY,
  mandant_id INTEGER NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  lagerort_id INTEGER REFERENCES lagerorte(id) ON DELETE SET NULL,
  name VARCHAR(160) NOT NULL,
  artikelnummer VARCHAR(100),
  bestand NUMERIC DEFAULT 0,
  mindestbestand NUMERIC DEFAULT 0,
  einheit VARCHAR(40) DEFAULT 'Stk',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lagerbewegungen (
  id INTEGER PRIMARY KEY,
  mandant_id INTEGER NOT NULL REFERENCES mandanten(id) ON DELETE CASCADE,
  lagerartikel_id INTEGER REFERENCES lagerartikel(id) ON DELETE SET NULL,
  typ VARCHAR(40) NOT NULL,
  menge NUMERIC NOT NULL DEFAULT 0,
  referenz VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS werkstatt (
  id INTEGER PRIMARY KEY,
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
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
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
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
  schaden_markierungen TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS uvv_pruefungen (
  id INTEGER PRIMARY KEY,
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS kontakte (
  id INTEGER PRIMARY KEY,
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  firma VARCHAR(160),
  kategorie VARCHAR(80),
  ansprechpartner VARCHAR(160),
  telefon VARCHAR(80),
  mobil VARCHAR(80),
  email VARCHAR(160),
  adresse TEXT,
  website TEXT,
  standort_id INTEGER REFERENCES standorte(id) ON DELETE SET NULL,
  notiz TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aktivitaeten (
  id INTEGER PRIMARY KEY,
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
  modul VARCHAR(80),
  aktion VARCHAR(120),
  details TEXT,
  benutzer_id INTEGER,
  benutzer_name VARCHAR(160),
  rolle VARCHAR(40),
  standort_id INTEGER REFERENCES standorte(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reinigung (
  id INTEGER PRIMARY KEY,
  mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE,
  fahrzeug_id INTEGER NOT NULL REFERENCES fahrzeuge(id) ON DELETE CASCADE,
  standort_id INTEGER REFERENCES standorte(id) ON DELETE SET NULL,
  datum DATE,
  reinigungstag VARCHAR(10),
  gereinigt_am DATE,
  bearbeitet_von VARCHAR(160),
  bemerkung TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS fahrzeug_dokumente ADD COLUMN IF NOT EXISTS mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS fuehrerscheinkontrollen ADD COLUMN IF NOT EXISTS ausstellungsdatum DATE;
ALTER TABLE IF EXISTS fuehrerscheinkontrollen ADD COLUMN IF NOT EXISTS gueltig_bis DATE;
ALTER TABLE IF EXISTS fuehrerscheinkontrollen ADD COLUMN IF NOT EXISTS besitz_seit DATE;
ALTER TABLE IF EXISTS werkstatt ADD COLUMN IF NOT EXISTS mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS werkstatt_bereiche ADD COLUMN IF NOT EXISTS mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS schaeden ADD COLUMN IF NOT EXISTS mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS schaeden ADD COLUMN IF NOT EXISTS schaden_markierungen TEXT;
ALTER TABLE IF EXISTS uvv_pruefungen ADD COLUMN IF NOT EXISTS mandant_id INTEGER REFERENCES mandanten(id) ON DELETE CASCADE;
