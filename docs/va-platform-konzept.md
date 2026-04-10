# Virtual-Airline-System für MSFS (Lufthansa + Condor, Airbus-only)

## 1) Vollständiges Plattformkonzept

### Vision
Eine professionelle, moderne Virtual-Airline-Plattform mit **realistischem Airline-Charakter** für den Microsoft Flight Simulator (MSFS), fokussiert auf:
- **Airbus-only Operations**
- **nur reale Flugnummern**
- Airlines: **Lufthansa (LH)** und **Condor (DE)**
- Starker Mitgliederbereich mit Pilotendashboard, Buchungssystem, PIREP-Workflow und SimBrief-Verknüpfung.

### Produktprinzipien
1. **Realismus zuerst**: Nur freigegebene reale Flugnummern und Airbus-Flotte.
2. **Saubere Rollenlogik**: Gast, Pilot, Staff, Admin mit klaren Rechten.
3. **Aviation-UX**: Dark, clean, hochwertige Datendarstellung (Karten/KPIs/Status).
4. **Skalierbar**: API-ready, modulare Domänen, nachvollziehbare Audit-Logs.
5. **Sicher**: Verifizierung, RBAC, Rate Limits, Session-Schutz, DSGVO-konform.

### Kernmodule
- Öffentliche Website & Content (News, FAQ, Impressum/Datenschutz)
- Auth & Identity (Registrierung, Verifizierung, Passwort-Reset)
- Pilotenportal (Dashboard, Logbuch, Karriere, Dienstplan)
- Flugdisposition (Suche, Buchung, Reservierungsschutz)
- Flottenmanagement (Airbus-Daten, Airline-Validierung)
- PIREP-Engine (Einreichen, Review, Freigabe/Ablehnung)
- SimBrief Integration (Profil-Verknüpfung, OFP-Import)
- Admin/Staff Console (Nutzer, Flüge, Flotte, PIREPs, News)

---

## 2) Seitenstruktur / Sitemap

## Public
- `/` Startseite (Hero, KPIs, aktuelle News)
- `/airline/lufthansa`
- `/airline/condor`
- `/fleet` (Airbus-Flotte, Filter)
- `/features`
- `/news`
- `/faq`
- `/register`
- `/login`
- `/contact`
- `/imprint` (Impressum)
- `/privacy` (Datenschutz)

## Authenticated (Pilot)
- `/portal/dashboard`
- `/portal/flights/search`
- `/portal/flights/bookings`
- `/portal/roster` (Kalender + Liste)
- `/portal/pireps/new`
- `/portal/pireps/history`
- `/portal/logbook`
- `/portal/stats`
- `/portal/career`
- `/portal/simbrief`
- `/portal/profile`
- `/portal/settings`

## Staff/Admin
- `/admin/dashboard`
- `/admin/pilots`
- `/admin/roles`
- `/admin/flights` (reale Flugnummernverwaltung)
- `/admin/fleet` (Airbus-only Datenpflege)
- `/admin/pireps/review`
- `/admin/news`
- `/admin/reports`
- `/admin/audit`

---

## 3) Datenbankstruktur (relational, PostgreSQL)

### Core Identity
- `users`
  - `id`, `email` (unique), `password_hash`, `email_verified_at`
  - `role` ENUM(`pilot`,`staff`,`admin`)
  - `status` ENUM(`active`,`inactive`,`suspended`)
  - `created_at`, `updated_at`, `last_login_at`
- `pilot_profiles`
  - `user_id` (FK)
  - `pilot_number` (unique, auto, z. B. VA-10023)
  - `avatar_url`, `callsign`, `country`, `timezone`
  - `preferred_airline` ENUM(`LH`,`DE`)
  - `simbrief_username`, `simbrief_pilot_id`

### Airline/Fleet/Flight Data
- `airlines`
  - `id`, `code_iata` (`LH`,`DE`), `name`, `is_active`
- `aircraft_types`
  - `id`, `icao_type` (z. B. `A320`), `manufacturer` (= `Airbus`), `range_nm`, `cruise_kts`
- `aircraft`
  - `id`, `registration`, `airline_id`, `aircraft_type_id`
  - `seat_config_json`, `is_active`
- `real_flight_numbers`
  - `id`, `airline_id`, `flight_number` (z. B. LH1234)
  - `dep_icao`, `arr_icao`, `block_time_min`, `aircraft_type_id`
  - `gate_info`, `valid_from`, `valid_to`, `is_active`

### Booking/Roster
- `flight_bookings`
  - `id`, `user_id`, `real_flight_number_id`
  - `booking_status` ENUM(`available`,`booked`,`flown`,`cancelled`,`missed`)
  - `scheduled_offblock`, `scheduled_onblock`
  - `reserved_until`, `created_at`, `updated_at`
  - Unique constraint gegen Doppelbuchung: (`real_flight_number_id`,`scheduled_offblock`) wenn status aktiv.
- `roster_entries`
  - `id`, `user_id`, `booking_id` (nullable)
  - `roster_status` ENUM(`planned`,`completed`,`missed`,`cancelled`)
  - `start_at`, `end_at`, `title`, `notes`

### PIREP/Logbook
- `pireps`
  - `id`, `user_id`, `booking_id` (nullable)
  - `flight_number`, `airline_code`, `dep_icao`, `arr_icao`
  - `off_block_at`, `on_block_at`, `flight_time_min`, `block_time_min`
  - `landing_rate_fpm`, `fuel_used_kg`, `aircraft_type`, `simulator`, `callsign`, `route`
  - `remarks`, `status` ENUM(`pending`,`accepted`,`rejected`)
  - `reviewed_by`, `reviewed_at`, `review_comment`
- `logbook_entries` (optional materialized view / denormalisiert)

### Stats/Progress
- `pilot_stats_daily` (aggregiert)
- `awards`, `pilot_awards`
- `ranks`, `pilot_rank_progress`

### Content & System
- `news_posts`, `faq_items`, `support_tickets`
- `notifications`
- `audit_logs`

### Wichtige Validierungsregeln
1. `aircraft_types.manufacturer` muss `Airbus` sein.
2. `airlines.code_iata` nur `LH` oder `DE`.
3. Buchung nur, wenn `real_flight_numbers` aktiv und Route/Typ gültig.
4. PIREP kann Staff/Admin-Review erfordern.

---

## 4) Benutzerrollen und Rechte

### Gast
- Öffentliches Portal sehen
- Registrieren/Bewerben
- Keine Flugbuchung

### Pilot
- Eigene Buchungen, Dienstplan, PIREPs, Logbuch verwalten
- SimBrief verknüpfen
- Profil bearbeiten
- Keine globalen Stammdaten ändern

### Staff
- PIREPs prüfen (accept/reject)
- News verwalten
- Pilotenstatus moderieren (kein Full-Systemzugriff)

### Admin
- Vollzugriff: Rollen, Flüge, Flotte, reale Flugnummern, Sperren/Freigaben
- Systemkonfiguration und Reports

---

## 5) Kernfunktionen im Detail

### A) Flugbuchung (real + Airbus-only)
1. Suche nach Flugnummer/ICAO/Airline/Typ.
2. Ergebnis nur aus `real_flight_numbers` mit LH/DE + Airbus.
3. Verfügbarkeit prüfen (keine Doppelbuchung).
4. Buchung erstellen (`booked`) + optional in Dienstplan übernehmen.

### B) PIREP Workflow
1. Pilot reicht PIREP ein (manuell oder vorbefüllt aus SimBrief/Buchung).
2. Status `pending`.
3. Staff/Admin reviewt: `accepted`/`rejected`.
4. Bei `accepted`: Logbuch & Statistik fortschreiben.

### C) Karriere/Rang
- Stunden- und Aktivitätsgrenzen für Ränge.
- Awards (z. B. 50 Flüge LH, 100 Landungen, 100h Airbus A320 Familie).

### D) Dienstplan
- Kalender + Listenansicht.
- Automatische Übernahme aus Buchungen.
- Statuslogik: geplant, abgeschlossen, verpasst.

### E) SimBrief
- Benutzer hinterlegt SimBrief Username/ID.
- OFP-Daten importieren und Felder prefillen (Route, Callsign, Fuel, Aircraft).

---

## 6) Modernes UI/UX-Konzept

### Designrichtung
- **Dark Premium Aviation Theme** (Anthrazit/Navy + Akzentfarben)
- Große Cards, klare Datenhierarchie, hohe Lesbarkeit.

### UI-Bausteine
- KPI-Kacheln (Stunden, Flüge, PIREPs pending)
- Responsive Tabellen mit Schnellfiltern
- Status-Badges (booked/flown/pending etc.)
- Timeline-Module für letzte Flüge
- Diagramme: Flugstunden/Monat, Airline-Share, Landing-Rate-Trend

### UX-Standards
- Mobile First + Desktop Optimierung
- Schnelle Aktionen (Buchen, PIREP einreichen, SimBrief import)
- Konsistente Formvalidierung mit klaren Fehlermeldungen
- Accessibility: Kontrast, Keyboard, semantische Labels

---

## 7) Technologie-Vorschläge

### Frontend
- **Next.js (React + TypeScript)**
- Tailwind CSS + komponentenbasiertes UI (z. B. shadcn/ui)
- Charts: Recharts / ECharts
- State/Server Cache: TanStack Query
- i18n: next-intl (DE/EN)

### Backend
- **Node.js (NestJS oder Express + TS)**
- PostgreSQL + Prisma ORM
- Redis (Caching, Rate Limits, Queue)
- Auth: JWT + Refresh + Email Verification
- File Storage: S3-kompatibel für Avatare/Anhänge

### DevOps
- Docker, CI/CD, Migration Pipelines
- Monitoring: Sentry + Prometheus/Grafana
- Audit Logging + structured logs

---

## 8) API-Struktur (inkl. SimBrief)

## Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`

## Flights/Bookings
- `GET /api/v1/flights?airline=LH&aircraft=A320&dep=EDDF&arr=LEPA`
- `POST /api/v1/bookings`
- `PATCH /api/v1/bookings/:id/cancel`
- `POST /api/v1/bookings/:id/roster`

## PIREP
- `POST /api/v1/pireps`
- `GET /api/v1/pireps/me`
- `GET /api/v1/admin/pireps?status=pending`
- `PATCH /api/v1/admin/pireps/:id/review`

## SimBrief
- `POST /api/v1/simbrief/link` (speichert Username/ID)
- `GET /api/v1/simbrief/ofp/:bookingId` (holt OFP-Daten)
- `POST /api/v1/simbrief/prefill/:bookingId` (übernimmt Route/Fuel/Callsign)

### SimBrief-Mapping (Beispiel)
- OFP Route -> `pireps.route`
- Callsign -> `pireps.callsign`
- Aircraft ICAO -> Validierung gegen Airbus + freigegebene Flotte
- Fuel Planned -> PIREP Prefill

---

## 9) Beispiel für Dashboard-Inhalte

### Pilot Dashboard Widgets
1. **Meine nächsten 3 Flüge** (Datum, Route, Airline, Aircraft)
2. **Letzte 5 PIREPs** (Status-Chips)
3. **Monatsstatistik** (Stunden, Flüge, Ø Landungsrate)
4. **Rangfortschritt** (Progressbar)
5. **Airline-Verteilung** (LH vs DE)
6. **SimBrief Quick Action** („Mit SimBrief planen“)

### Staff/Admin Dashboard Widgets
1. Pending PIREPs
2. Aktive Piloten (7/30 Tage)
3. Top-Routen
4. Flottenauslastung
5. Systemmeldungen / Audit Alerts

---

## 10) Zukunftserweiterungen

1. ACARS-Connector (automatische PIREP-Erstellung)
2. Discord Bot (Flight Announcements, PIREP Status)
3. Route Network Map (interaktive Karte)
4. Event-/Tour-System (Sondermissionen)
5. Multi-VA Support als optionaler Mandantenmodus
6. In-App Messaging & Team Briefings
7. Erweiterte Fraud-/Realism Checks (z. B. unrealistische Blockzeiten)

---

## Umsetzungsphasen (Roadmap)

### Phase 1 (MVP)
- Auth + Rollen
- Airbus-Flotte + reale Flugnummern LH/DE
- Buchungssystem + Dienstplan-Basis
- PIREP Einreichen + Staff Review

### Phase 2
- SimBrief Vollintegration
- erweitertes Statistiksystem + Karriere/Awards
- News, Support, Notifications

### Phase 3
- ACARS/Discord, Heatmap/Netzwerk, fortgeschrittene Reports

---

## Qualitäts- und Abnahmekriterien
- Keine nicht-Airbus-Typen in Suchergebnissen/Buchung möglich
- Keine anderen Airlines als LH/DE in produktiven Flugdaten
- Nur reale Flugnummern sind buchbar
- Doppelbuchungsschutz aktiv
- PIREP-Reviewflow vollständig nachvollziehbar (Audit)
- Responsive Darstellung auf Mobile und Desktop
- DE/EN Sprachumschaltung in Kernbereichen
