const state = {
  token: sessionStorage.getItem('fuhrpark_token') || localStorage.getItem('fuhrpark_token') || '',
  user: JSON.parse(sessionStorage.getItem('fuhrpark_user') || localStorage.getItem('fuhrpark_user') || 'null'),
  selectedStandortId: sessionStorage.getItem('fuhrpark_selected_standort') || localStorage.getItem('fuhrpark_selected_standort') || '',
  meta: { standorte: [], fahrzeugStatus: [], werkstattStatus: [], schadenStatus: [], pruefzeichen: [], uvvCheckpoints: [], visibleViews: [] },
  dashboard: null,
  fahrzeuge: [],
  werkstatt: [],
  schaeden: [],
  uvv: [],
  benutzer: [],
  editUserId: null,
  editVehicleId: null,
  editWorkshopId: null,
  editingWorkshopAreaId: null
};

const el = (id) => document.getElementById(id);
const SYMBOLS = { ok: '&#10004;', nein: '&#10006;', nicht_ok: '&#10006;' };
const viewMeta = {
  dashboard: ['Dashboard', 'Zentrale Uebersicht des Fuhrparks.'],
  fahrzeuge: ['Fahrzeuge', 'Verwalten Sie Ihren Fuhrparkbestand.'],
  werkstatt: ['Werkstatt', 'Werkstatt-Uebersicht mit aktiven Auftraegen und Bereichen.'],
  schaeden: ['Schaeden', 'Unfall- und Schadenmeldungen strukturiert erfassen.'],
  uvv: ['UVV', 'Pruefungen mit 20 Punkten dokumentieren.'],
  benutzer: ['Benutzer', 'Benutzer anlegen, aktivieren und verwalten.'],
  standorte: ['Standorte', 'Standorte anlegen und bearbeiten.'],
  statistik: ['Statistik', 'Verdichtete Auswertung aller Kernbereiche.'],
  suche: ['Suche', 'Globale Suche ueber Fahrzeuge und Statusdaten.'],
  import: ['CSV Import', 'Fahrzeuge per CSV-Datei in das System laden.'],
  impressum: ['Impressum', 'Projekt- und Autoreninformationen.']
};

function querySuffix() {
  return state.user?.rolle === 'hauptadmin' && state.selectedStandortId ? `?standort_id=${encodeURIComponent(state.selectedStandortId)}` : '';
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Fehlerhafte Antwort.' }));
    throw new Error(error.error || 'Fehler');
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/pdf')) return response.blob();
  return response.json();
}

function setAuth(token, user) {
  state.token = token;
  state.user = user;
  if (user.rolle !== 'hauptadmin') state.selectedStandortId = user.standort_id || '';
  sessionStorage.setItem('fuhrpark_token', token);
  sessionStorage.setItem('fuhrpark_user', JSON.stringify(user));
  sessionStorage.setItem('fuhrpark_selected_standort', state.selectedStandortId || '');
  localStorage.removeItem('fuhrpark_token');
  localStorage.removeItem('fuhrpark_user');
  localStorage.removeItem('fuhrpark_selected_standort');
  updateUserBadge();
}

function clearAuth() {
  state.token = '';
  state.user = null;
  state.selectedStandortId = '';
  sessionStorage.removeItem('fuhrpark_token');
  sessionStorage.removeItem('fuhrpark_user');
  sessionStorage.removeItem('fuhrpark_selected_standort');
  localStorage.removeItem('fuhrpark_token');
  localStorage.removeItem('fuhrpark_user');
  localStorage.removeItem('fuhrpark_selected_standort');
  updateUserBadge();
  toggleApp(false);
}

function updateUserBadge() {
  el('userBadge').textContent = state.user ? `${state.user.name} | ${state.user.rolle}${state.user.standort ? ` | ${state.user.standort}` : ''}` : 'Nicht angemeldet';
}

function toggleApp(isLoggedIn) {
  const appShell = el('appShell');
  const sidebar = el('sidebar');
  const topbar = el('topbar');
  const content = el('content');

  el('loginView').className = isLoggedIn ? 'hidden' : 'panel visible';
  el('appView').className = isLoggedIn ? '' : 'hidden';

  if (isLoggedIn) {
    appShell?.classList.remove('app-shell-logged-out');
    sidebar?.classList.remove('hidden');
    topbar?.classList.remove('hidden');
    content?.classList.remove('content-logged-out');
  } else {
    appShell?.classList.add('app-shell-logged-out');
    sidebar?.classList.add('hidden');
    topbar?.classList.add('hidden');
    content?.classList.add('content-logged-out');
  }
}

function badgeClass(text) {
  const value = String(text || '').toLowerCase();
  if (value.includes('schaden') || value.includes('nicht_ok') || value.includes('nicht_aktiv') || value === 'nein') return 'badge danger';
  if (value.includes('werkstatt') || value.includes('pruefung') || value.includes('bearbeitung')) return 'badge warn';
  if (value === 'aktiv' || value.includes('ok') || value.includes('abgeschlossen')) return 'badge ok';
  return 'badge';
}

function symbolFor(value) {
  return SYMBOLS[value] || value || '-';
}

function optionsHtml(values, selected, placeholder = '') {
  const options = values.map((value) => `<option value="${value}" ${String(value) === String(selected) ? 'selected' : ''}>${value}</option>`).join('');
  return placeholder ? `<option value="">${placeholder}</option>${options}` : options;
}

function renderTable(rows, columns) {
  if (!rows.length) return '<p class="muted">Keine Daten vorhanden.</p>';
  const head = columns.map((c) => `<th>${c.label}</th>`).join('');
  const body = rows.map((row) => `<tr>${columns.map((c) => `<td>${c.render ? c.render(row[c.key], row) : (row[c.key] ?? '')}</td>`).join('')}</tr>`).join('');
  return `<table class="table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function shouldWaitForStandort() {
  return false;
}

function renderTopbarControls() {
  if (!state.user) return;
  if (state.user.rolle === 'hauptadmin') {
    const options = state.meta.standorte.map((s) => `<option value="${s.id}" ${String(s.id) === String(state.selectedStandortId) ? 'selected' : ''}>${s.name}</option>`).join('');
    el('topbarControls').innerHTML = `<div class="topbar-stack"><div class="topbar-pill">Hauptverwaltung: Carlswerk</div><label class="topbar-label">Standort<select id="standortFilter"><option value="">Gesamtuebersicht alle Standorte</option>${options}</select></label></div>`;
    el('standortFilter').onchange = async (event) => {
      state.selectedStandortId = event.target.value;
      sessionStorage.setItem('fuhrpark_selected_standort', state.selectedStandortId || '');
      await refreshApp();
    };
  } else {
    el('topbarControls').innerHTML = `<div class="topbar-pill">Standort: ${state.user.standort || '-'}</div>`;
  }
}

function renderSelectionNotice() {
  if (shouldWaitForStandort()) {
    el('selectionNotice').className = 'panel card visible';
    el('selectionNotice').innerHTML = '<h3>Hauptverwaltung Carlswerk</h3><p>Ohne Standortauswahl sieht die Hauptverwaltung in Carlswerk alle Standorte zusammen. Mit Auswahl wird auf einen einzelnen Standort gefiltert.</p>';
    return;
  } else {
    el('selectionNotice').className = 'hidden';
    el('selectionNotice').innerHTML = '';
  }
}

function locationOptionsMarkup() {
  return state.meta.standorte.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
}

function vehicleOptionsMarkup() {
  return state.fahrzeuge.map((f) => `<option value="${f.id}">${f.kennzeichen} - ${f.fahrzeug}</option>`).join('');
}

function activeLocationId() {
  if (state.user?.rolle === 'hauptadmin') return state.selectedStandortId || state.meta.standorte[0]?.id || '';
  return state.user?.standort_id || '';
}


function workshopAreaDisplayName(standortId, slot) {
  return (state.workshopBereiche || []).find((item) => Number(item.standort_id) === Number(standortId) && Number(item.slot) === Number(slot))?.name || `Werkstatt ${slot}`;
}

function currentVehicleDraft() {
  if (!state.editVehicleId) {
    return {
      id: '',
      kennzeichen: '',
      fahrzeug: '',
      standort_id: activeLocationId(),
      status: 'aktiv',
      hu_datum: '',
      uvv_datum: '',
      fahrzeugschein_pdf: ''
    };
  }
  const vehicle = state.fahrzeuge.find((entry) => String(entry.id) === String(state.editVehicleId));
  return {
    id: vehicle?.id || '',
    kennzeichen: vehicle?.kennzeichen || '',
    fahrzeug: vehicle?.fahrzeug || '',
    standort_id: vehicle?.standort_id || activeLocationId(),
    status: vehicle?.status || 'aktiv',
    hu_datum: vehicle?.hu_datum || '',
    uvv_datum: vehicle?.uvv_datum || '',
    fahrzeugschein_pdf: vehicle?.fahrzeugschein_pdf || ''
  };
}

function setVehicleEdit(id) {
  state.editVehicleId = id;
  renderForms();
  bindDynamicForms();
  const form = el('vehicleForm');
  form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetVehicleForm() {
  state.editVehicleId = null;
  renderForms();
  bindDynamicForms();
}

function setVehicleFormMessage(message, type = "info") {
  const node = el('vehicleFormMessage');
  if (!node) return;
  node.className = type === 'error' ? 'error visible' : 'success visible';
  node.textContent = message;
}
function currentWorkshopDraft() {
  if (!state.editWorkshopId) {
    return {
      id: '',
      fahrzeug_id: state.fahrzeuge[0]?.id || '',
      werkstatt_name: workshopAreaDisplayName(activeLocationId(), 1),
      positionsnummer: '',
      problem: '',
      pruefzeichen: 'nein',
      status: 'offen',
      status_datum: '',
      datum_von: '',
      datum_bis: '',
      beschreibung: ''
    };
  }
  const row = state.werkstatt.find((entry) => String(entry.id) === String(state.editWorkshopId));
  return {
    id: row?.id || '',
    fahrzeug_id: row?.fahrzeug_id || state.fahrzeuge[0]?.id || '',
    werkstatt_name: row?.werkstatt_name || workshopAreaDisplayName(row?.standort_id, row?.workshop_slot || 1),
    positionsnummer: row?.positionsnummer || '',
    problem: row?.problem || '',
    pruefzeichen: row?.pruefzeichen || 'nein',
    status: row?.status || 'offen',
    status_datum: row?.status_datum || '',
    datum_von: row?.datum_von || '',
    datum_bis: row?.datum_bis || '',
    beschreibung: row?.beschreibung || ''
  };
}

function setWorkshopEdit(id) {
  state.editWorkshopId = id;
  renderForms();
  bindDynamicForms();
  const form = el('workshopForm');
  form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetWorkshopForm() {
  state.editWorkshopId = null;
  renderForms();
  bindDynamicForms();
}

function setWorkshopFormMessage(message, type = "info") {
  const node = el('workshopFormMessage');
  if (!node) return;
  node.className = type === 'error' ? 'error visible' : 'success visible';
  node.textContent = message;
}

function currentUserDraft() {
  if (!state.editUserId) {
    return {
      id: '',
      benutzername: '',
      name: '',
      email: '',
      rolle: 'benutzer',
      standort_id: activeLocationId(),
      aktiv: 1,
      passwort: ''
    };
  }
  const user = state.benutzer.find((entry) => String(entry.id) === String(state.editUserId));
  return {
    id: user?.id || '',
    benutzername: user?.benutzername || '',
    name: user?.name || '',
    email: user?.email || '',
    rolle: user?.rolle || 'benutzer',
    standort_id: user?.standort_id || activeLocationId(),
    aktiv: user?.aktiv ? 1 : 0,
    passwort: ''
  };
}

function setUserEdit(id) {
  state.editUserId = id;
  renderForms();
  bindDynamicForms();
  const form = el('userForm');
  form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetUserForm() {
  state.editUserId = null;
  renderForms();
  bindDynamicForms();
}

function setUserFormMessage(message, type = 'info') {
  const node = el('userFormMessage');
  if (!node) return;
  node.className = type === 'error' ? 'error visible' : 'success visible';
  node.textContent = message;
}

function renderForms() {
  const locationOptions = locationOptionsMarkup();
  const vehicleOptions = vehicleOptionsMarkup();

  const draftVehicle = currentVehicleDraft();
  const isEditingVehicle = Boolean(state.editVehicleId);
  el('vehicleForm').innerHTML = `
    <div class="form-header-row">
      <div>
        <h3>${isEditingVehicle ? 'Fahrzeug bearbeiten' : 'Neues Fahrzeug'}</h3>
        <p class="muted">${isEditingVehicle ? 'Stammdaten, Status und Termine anpassen.' : 'Neues Fahrzeug fuer den ausgewaehlten Standort anlegen.'}</p>
      </div>
      ${isEditingVehicle ? '<button type="button" class="secondary" data-action="vehicle-cancel">Abbrechen</button>' : ''}
    </div>
    <label>Kennzeichen<input name="kennzeichen" required placeholder="F-AB 1234" value="${draftVehicle.kennzeichen}"></label>
    <label>Fahrzeugmodell<input name="fahrzeug" required placeholder="VW Golf" value="${draftVehicle.fahrzeug}"></label>
    <label>Standort<select name="standort_id" ${state.user?.rolle !== 'hauptadmin' ? 'disabled' : ''}>${state.meta.standorte.map((s) => `<option value="${s.id}" ${String(draftVehicle.standort_id) === String(s.id) ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label>
    <label>Status<select name="status">${optionsHtml(state.meta.fahrzeugStatus, draftVehicle.status)}</select></label>
    <div class="two-col">
      <label>HU Datum<input name="hu_datum" type="date" value="${draftVehicle.hu_datum}"></label>
      <label>UVV Datum<input name="uvv_datum" type="date" value="${draftVehicle.uvv_datum}"></label>
    </div>
    <label>Fahrzeugschein PDF<input name="fahrzeugschein_pdf" type="file" accept="application/pdf"></label>
    ${draftVehicle.fahrzeugschein_pdf ? `<p class="muted">Aktuelle Datei: <a class="secondary-link" href="${draftVehicle.fahrzeugschein_pdf}" target="_blank" rel="noopener">PDF oeffnen</a></p>` : '<p class="muted">Aktuell ist kein Fahrzeugschein hinterlegt.</p>'}
    <p id="vehicleFormMessage" class="muted">${isEditingVehicle ? 'Hier kannst du das Fahrzeug direkt bearbeiten.' : 'Hier kannst du ein neues Fahrzeug anlegen.'}</p>
    <button type="submit">${isEditingVehicle ? 'Aenderungen speichern' : 'Speichern'}</button>`;

  const draftWorkshop = currentWorkshopDraft();
  const isEditingWorkshop = Boolean(state.editWorkshopId);
  el('workshopForm').innerHTML = `
    <div class="form-header-row">
      <div>
        <h3>${isEditingWorkshop ? 'Werkstattauftrag bearbeiten' : 'Neuer Auftrag'}</h3>
        <p class="muted">${isEditingWorkshop ? 'Werkstattdaten, Zeiten und Status aendern.' : 'Neuen Werkstattauftrag erfassen.'}</p>
      </div>
      ${isEditingWorkshop ? '<button type="button" class="secondary" data-action="workshop-cancel">Abbrechen</button>' : ''}
    </div>
    <label>Fahrzeug<select name="fahrzeug_id">${state.fahrzeuge.map((f) => `<option value="${f.id}" ${String(draftWorkshop.fahrzeug_id) === String(f.id) ? 'selected' : ''}>${f.kennzeichen} - ${f.fahrzeug}</option>`).join('')}</select></label>

    <div class="three-col">
        <label>Werkstattname<input name="werkstatt_name" placeholder="z. B. Iveco SW" value="${draftWorkshop.werkstatt_name}"></label>
      <label>Symbol<select name="pruefzeichen"><option value="nein" ${draftWorkshop.pruefzeichen === 'nein' ? 'selected' : ''}>Nein</option><option value="ok" ${draftWorkshop.pruefzeichen === 'ok' ? 'selected' : ''}>OK</option></select></label>
    </div>
    <div class="three-col">
      <label>Nummer / Feld<input name="positionsnummer" placeholder="leer = automatische Nummer" value="${draftWorkshop.positionsnummer}"></label>
      <label>Fehler / Thema<input name="problem" placeholder="z. B. AdBlue Fehler" value="${draftWorkshop.problem}"></label>
      <label>Status<select name="status">${optionsHtml(state.meta.werkstattStatus, draftWorkshop.status)}</select></label>
    </div>
    <div class="three-col">
      <label>Status Datum<input name="status_datum" type="date" value="${draftWorkshop.status_datum}"></label>
      <label>Von Datum<input name="datum_von" type="date" required value="${draftWorkshop.datum_von}"></label>
      <label>Bis Datum<input name="datum_bis" type="date" value="${draftWorkshop.datum_bis}"></label>
    </div>
    <label>Beschreibung<textarea name="beschreibung" rows="4" placeholder="Was wird gemacht?">${draftWorkshop.beschreibung}</textarea></label>
    <p id="workshopFormMessage" class="muted">${isEditingWorkshop ? 'Hier kannst du den Werkstattauftrag bearbeiten.' : 'Hier kannst du einen Werkstattauftrag anlegen.'}</p>
    <button type="submit">${isEditingWorkshop ? 'Aenderungen speichern' : 'Speichern'}</button>`;

  const damageStatusSelect = state.user?.rolle === 'benutzer' ? '' : `<label>Status<select name="status">${optionsHtml(state.meta.schadenStatus, 'gemeldet')}</select></label>`;
  const damageTitle = state.user?.rolle === 'benutzer' ? 'Unfall melden' : 'Schaden erfassen';
  el('damageForm').innerHTML = `
    <h3>${damageTitle}</h3>
    <label>Fahrzeug<select name="fahrzeug_id">${vehicleOptions}</select></label>
    <div class="two-col">
      <label>Fahrername<input name="fahrer_name" placeholder="Name des Fahrers"></label>
      <label>Fahrer Telefon<input name="fahrer_telefon" placeholder="Telefon des Fahrers"></label>
    </div>
    <div class="two-col">
      <label>Datum<input name="datum" type="date" required></label>
      <label>Telefon Unfallgegner<input name="telefon" placeholder="Telefonnummer"></label>
    </div>
    <div class="three-col">
      <label>Polizei vor Ort<select name="polizei_vor_ort"><option value="nein">Nein</option><option value="ja">Ja</option></select></label>
      <label>Verletzte<select name="verletzte"><option value="nein">Nein</option><option value="ja">Ja</option></select></label>
      <label>VU Nummer<input name="vu_nummer" placeholder="z. B. VU-2026-001"></label>
    </div>
    <label>Unfallbeschreibung<textarea name="beschreibung" rows="5" placeholder="Bitte Unfallhergang so genau wie moeglich beschreiben"></textarea></label>
    <div class="two-col">
      <label>Unfallgegner Name<input name="unfallgegner_name"></label>
      <label>Unfallgegner Kennzeichen<input name="unfallgegner_kennzeichen"></label>
    </div>
    <label>Versicherung<input name="versicherung"></label>
    ${damageStatusSelect}
    <label>Schadenfoto<input name="foto" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <button type="submit">Unfallmeldung speichern</button>`;

  const checklist = state.meta.uvvCheckpoints.map((name, index) => `
    <div class="uvv-row">
      <div class="uvv-row-head"><strong>${String(index + 1).padStart(2, '0')}</strong> ${name}</div>
      <div class="uvv-row-controls">
        <select name="checkpoint_status_${index}">
          <option value="ok">&#10004;</option>
          <option value="nicht_ok">&#10006;</option>
        </select>
        <input name="checkpoint_comment_${index}" placeholder="Kommentar...">
      </div>
    </div>`).join('');

  el('uvvForm').innerHTML = `
    <h3>Neue UVV-Pruefung</h3>
    <div class="two-col">
      <label>Fahrzeug<select name="fahrzeug_id">${vehicleOptions}</select></label>
      <label>Pruefer<input name="pruefer" required value="${state.user?.name || ''}"></label>
    </div>
    <div class="two-col">
      <label>Pruefdatum<input name="datum" type="date" required></label>
      <label>Naechste Pruefung<input name="naechste_pruefung_datum" type="date"></label>
    </div>
    <div class="uvv-card">
      <h4>Pruefpunkte (20)</h4>
      ${checklist}
    </div>
    <label>Gesamtkommentar<textarea name="kommentar" rows="3"></textarea></label>
    <button type="submit">UVV speichern</button>`;

  const draftUser = currentUserDraft();
  const isEditingUser = Boolean(state.editUserId);
  el('userForm').innerHTML = `
    <div class="form-header-row">
      <div>
        <h3>${isEditingUser ? 'Benutzer bearbeiten' : 'Benutzer anlegen'}</h3>
        <p class="muted">${isEditingUser ? 'Aenderungen speichern oder neues Passwort vergeben.' : 'Neuen Benutzer fuer den ausgewaehlten Standort anlegen.'}</p>
      </div>
      ${isEditingUser ? '<button type="button" class="secondary" data-action="user-cancel">Abbrechen</button>' : ''}
    </div>
    <label>Benutzername<input name="benutzername" required placeholder="z. B. mweber" value="${draftUser.benutzername}"></label>
    <label>Name<input name="name" required placeholder="Vor- und Nachname" value="${draftUser.name}"></label>
    <label>E-Mail<input name="email" type="email" required placeholder="name@firma.de" value="${draftUser.email}"></label>
    <label>${isEditingUser ? 'Neues Passwort' : 'Passwort'}<input name="passwort" type="text" ${isEditingUser ? '' : 'required'} value="${draftUser.passwort}" placeholder="${isEditingUser ? 'leer = unveraendert' : 'Mindestens 8 Zeichen, Gross- und Kleinbuchstabe, Zahl'}"></label>
    <div class="two-col">
      <label>Rolle<select name="rolle"><option value="admin" ${draftUser.rolle === 'admin' ? 'selected' : ''}>admin</option><option value="benutzer" ${draftUser.rolle === 'benutzer' ? 'selected' : ''}>benutzer</option>${state.user?.rolle === 'hauptadmin' ? `<option value="hauptadmin" ${draftUser.rolle === 'hauptadmin' ? 'selected' : ''}>hauptadmin</option>` : ''}</select></label>
      <label>Standort<select name="standort_id" ${state.user?.rolle !== 'hauptadmin' ? 'disabled' : ''}>${state.meta.standorte.map((s) => `<option value="${s.id}" ${String(draftUser.standort_id) === String(s.id) ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label>
    </div>
    <label>Aktiv<select name="aktiv"><option value="1" ${draftUser.aktiv ? 'selected' : ''}>Ja</option><option value="0" ${!draftUser.aktiv ? 'selected' : ''}>Nein</option></select></label>
    <p id="userFormMessage" class="muted">${isEditingUser ? 'Hier kannst du Name, Rolle, Standort, Aktiv-Status und manuell ein neues Passwort setzen.' : 'Hier kannst du neue Benutzer fuer den Standort anlegen. Passwort: mindestens 8 Zeichen, Gross- und Kleinbuchstabe, Zahl.'}</p>
    <button type="submit">${isEditingUser ? 'Aenderungen speichern' : 'Benutzer speichern'}</button>`;
}

function dashboardSignature(data) {
  return JSON.stringify({
    counts: data.counts || {},
    fahrzeugKpis: data.fahrzeugKpis || {},
    werkstattKpis: data.werkstattKpis || {},
    schadenKpis: data.schadenKpis || {}
  });
}

function flashKpiPanels() {
  if (state.kpiFlashTimer) clearTimeout(state.kpiFlashTimer);
  ['stats', 'fahrzeugKpis', 'werkstattKpis', 'schadenKpis'].forEach((id) => {
    const node = el(id);
    if (!node) return;
    node.classList.remove('kpi-live-update');
    void node.offsetWidth;
    node.classList.add('kpi-live-update');
  });
  state.kpiFlashTimer = setTimeout(() => {
    ['stats', 'fahrzeugKpis', 'werkstattKpis', 'schadenKpis'].forEach((id) => {
      const node = el(id);
      if (node) node.classList.remove('kpi-live-update');
    });
  }, 1800);
}

function renderDashboard() {
  const data = state.dashboard || {
    counts: { fahrzeuge: 0, werkstatt: 0, schaeden: 0, uvvFaellig: 0, huFaellig: 0 },
    vehiclesByLocation: [],
    reminders: [],
    statusSummary: [],
    fahrzeugKpis: {},
    werkstattKpis: {},
    schadenKpis: {},
    latestVehicles: [],
    latestWorkshop: [],
    latestSchaeden: [],
    updatedAt: ""
  };
  const stats = [['Fahrzeuge', data.counts.fahrzeuge], ['Werkstatt', data.counts.werkstatt], ['Schaeden', data.counts.schaeden], ['UVV faellig', data.counts.uvvFaellig], ['HU faellig', data.counts.huFaellig]];
  const miniCards = (items, tone = "default") => items.map(([label, value]) => `<div class="mini-kpi mini-kpi-${tone}"><span>${label}</span><strong>${value}</strong></div>`).join('');
  const compactList = (rows, renderer, emptyText) => rows.length ? rows.map(renderer).join('') : `<p class="muted">${emptyText}</p>`;

  el('stats').innerHTML = stats.map(([label, value], index) => `<div class="stat-card stat-card-${index + 1}"><span>${label}</span><strong>${value}</strong><small>Echtzeitstatus fuer den ausgewaehlten Standort</small></div>`).join('');
  el('dashboardUpdatedAt').textContent = data.updatedAt ? `Stand ${String(data.updatedAt).slice(11, 16)} Uhr` : "";
  el('fahrzeugKpis').innerHTML = miniCards([['Aktiv', data.fahrzeugKpis.aktiv || 0], ['Nicht aktiv', data.fahrzeugKpis.nichtAktiv || 0], ['Pruefung', data.fahrzeugKpis.pruefung || 0], ['Werkstatt', data.fahrzeugKpis.werkstatt || 0], ['Schaden', data.fahrzeugKpis.schaden || 0]], "vehicle");
  el('werkstattKpis').innerHTML = miniCards([['Gesamt', data.werkstattKpis.gesamt || 0], ['Offen', data.werkstattKpis.offen || 0], ['Bearbeitung', data.werkstattKpis.bearbeitung || 0], ['Abgeschlossen', data.werkstattKpis.abgeschlossen || 0]], "workshop");
  el('schadenKpis').innerHTML = miniCards([['Gesamt', data.schadenKpis.gesamt || 0], ['Gemeldet', data.schadenKpis.gemeldet || 0], ['Reparatur', data.schadenKpis.reparatur || 0], ['Abgeschlossen', data.schadenKpis.abgeschlossen || 0]], "damage");
  el('latestVehicles').innerHTML = compactList(data.latestVehicles || [], (item) => `<div class="compact-item"><strong>${item.kennzeichen}</strong><span>${item.fahrzeug} | ${item.standort}</span><span class="${badgeClass(item.status)}">${item.status}</span></div>`, "Keine Fahrzeugdaten vorhanden.");
  el('latestWorkshop').innerHTML = compactList(data.latestWorkshop || [], (item) => `<div class="compact-item"><strong>${item.kennzeichen}</strong><span>${item.werkstatt_name} | ${item.problem}</span><span>${item.datum}</span><span class="${badgeClass(item.status)}">${item.status}</span></div>`, "Keine Werkstattauftraege vorhanden.");
  el('latestSchaeden').innerHTML = compactList(data.latestSchaeden || [], (item) => `<div class="compact-item"><strong>${item.kennzeichen}</strong><span>${item.beschreibung}</span><span>${item.datum}</span><span class="${badgeClass(item.status)}">${item.status}</span></div>`, "Keine Schadenmeldungen vorhanden.");
  const locationRows = [...(data.vehiclesByLocation || [])].sort((a, b) => b.value - a.value);
  const locationMax = locationRows.length ? Math.max(...locationRows.map((item) => Number(item.value || 0)), 1) : 1;
  const locationTotal = locationRows.reduce((sum, item) => sum + Number(item.value || 0), 0);
  el('locationChart').innerHTML = locationRows.length ? locationRows.map((item, index) => {
    const value = Number(item.value || 0);
    const percent = locationTotal ? Math.round((value / locationTotal) * 100) : 0;
    const width = Math.max(Math.round((value / locationMax) * 100), value > 0 ? 8 : 0);
    return       `<div class="location-row-card">
        <div class="location-row-head">
          <div class="location-row-title"><span class="location-row-rank">#${index + 1}</span><strong>${item.name}</strong></div>
          <div class="location-row-meta"><span>${percent}%</span><strong>${value}</strong></div>
        </div>
        <div class="location-row-track"><div class="location-row-fill" style="width:${width}%"></div></div>
      </div>`;
  }).join('') : "<p class=\"muted\">Keine Standorte vorhanden.</p>";
  el('reminders').innerHTML = data.reminders.length ? data.reminders.map((item) => `<div><strong>${item.kennzeichen}</strong> - ${item.fahrzeug}<br><span class="badge warn">HU ${item.hu_in_tagen} Tage</span> <span class="badge warn">UVV ${item.uvv_in_tagen} Tage</span></div>`).join('') : "<p class=\"muted\">Keine kurzfristigen Faelligkeiten.</p>";
}

function isWorkshopOverallView() {
  return state.user?.rolle === 'hauptadmin' && !state.selectedStandortId;
}

function workshopStandortName(standortId) {
  return state.meta.standorte.find((item) => Number(item.id) === Number(standortId))?.name || '-';
}

function workshopAreaGroups() {
  const slots = state.meta.workshopSlots || [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const source = state.workshopBereiche || [];
  if (isWorkshopOverallView()) {
    return state.meta.standorte.map((standort) => ({
      standort,
      areas: slots.map((slot) => source.find((item) => Number(item.standort_id) === Number(standort.id) && Number(item.slot) === Number(slot)) || { id: '', slot, name: `Werkstatt ${slot}`, standort_id: standort.id })
    }));
  }
  const activeId = Number(activeLocationId() || 0);
  const standort = state.meta.standorte.find((item) => Number(item.id) === activeId) || { id: activeId, name: workshopStandortName(activeId) };
  return [{
    standort,
    areas: slots.map((slot) => source.find((item) => Number(item.standort_id) === activeId && Number(item.slot) === Number(slot)) || { id: '', slot, name: `Werkstatt ${slot}`, standort_id: activeId })
  }];
}

function renderWorkshopTile(area, entries) { return ""; }
function renderWorkshopBoard() {}
function renderWorkshopListPage() {}

function renderLists() {
  const canManage = state.user && state.user.rolle !== 'benutzer';

  el('vehiclesTable').innerHTML = renderTable(state.fahrzeuge, [
    { key: 'kennzeichen', label: 'Kennzeichen', render: (v, row) => `${v || '-'}${String(state.editVehicleId) === String(row.id) ? '<br><span class="muted">Wird gerade bearbeitet</span>' : ''}` },
    { key: 'fahrzeug', label: 'Modell' },
    { key: 'standort', label: 'Standort' },
    { key: 'status', label: 'Status', render: (v) => `<span class="${badgeClass(v)}">${v}</span>` },
    { key: 'hu_datum', label: 'HU' },
    { key: 'uvv_datum', label: 'UVV' },
    { key: 'fahrzeugschein_pdf', label: 'Fahrzeugschein', render: (v) => v ? `<a class="secondary-link" href="${v}" target="_blank" rel="noopener">PDF oeffnen</a>` : '<span class="muted">Kein PDF</span>' },
    { key: 'created_at', label: 'Angelegt', render: (v) => String(v || '').slice(0, 10) },
    { key: 'id', label: 'Aktion', render: (v, row) => canManage ? `<div class="action-row">${row.fahrzeugschein_pdf ? `<a class="icon-btn secondary-link" href="${row.fahrzeugschein_pdf}" target="_blank" rel="noopener" title="Fahrzeugschein oeffnen">PDF</a>` : ''}<button class="icon-btn" data-action="vehicle-edit" data-id="${v}" title="Fahrzeug bearbeiten">&#9998;</button><button class="secondary" data-action="vehicle-delete" data-id="${v}">Loeschen</button></div>` : '-' }
  ]);
  el('workshopTable').innerHTML = renderTable(state.werkstatt, [
    { key: 'werkstatt_name', label: 'Werkstattname', render: (v, row) => `${v || '-'}${String(state.editWorkshopId) === String(row.id) ? '<br><span class="muted">Wird gerade bearbeitet</span>' : ''}` },
    { key: 'kennzeichen', label: 'Fahrzeug' },
    { key: 'positionsnummer', label: 'Nr.' },
    { key: 'problem', label: 'Problem' },
    { key: 'pruefzeichen', label: 'Symbol', render: (v) => `<span class="${badgeClass(v)} symbol-badge">${symbolFor(v)}</span>` },
    { key: 'datum_von', label: 'Von Datum', render: (v) => v || '-' },
    { key: 'datum_bis', label: 'Bis Datum', render: (v) => v || '-' },
    { key: 'tage', label: 'Tage' },
    { key: 'status', label: 'Status', render: (v) => `<span class="${badgeClass(v)}">${v}</span>` },
    { key: 'id', label: 'Aktion', render: (v) => canManage ? `<div class="action-row"><button class="icon-btn" data-action="workshop-edit" data-id="${v}" title="Werkstattauftrag bearbeiten">&#9998;</button><button class="secondary" data-action="workshop-delete" data-id="${v}">Loeschen</button></div>` : '-' }
  ]);

  el('damageTable').innerHTML = renderTable(state.schaeden, [
    { key: 'kennzeichen', label: 'Kennzeichen' },
    { key: 'fahrer_name', label: 'Fahrer', render: (v, row) => [v || '-', row.fahrer_telefon || ''].filter(Boolean).join('<br>') },
    { key: 'datum', label: 'Datum' },
    { key: 'vu_nummer', label: 'VU Nummer' },
    { key: 'polizei_vor_ort', label: 'Polizei', render: (v) => v === 'ja' ? '<span class="badge ok">Ja</span>' : '<span class="badge danger">Nein</span>' },
    { key: 'verletzte', label: 'Verletzte', render: (v) => v === 'ja' ? '<span class="badge ok">Ja</span>' : '<span class="badge danger">Nein</span>' },
    { key: 'beschreibung', label: 'Beschreibung' },
    { key: 'unfallgegner_name', label: 'Gegner' },
    { key: 'status', label: 'Status', render: (v, row) => canManage ? `<select data-action="damage-status" data-id="${row.id}">${optionsHtml(state.meta.schadenStatus, v)}</select>` : `<span class="${badgeClass(v)}">${v}</span>` },
    { key: 'foto', label: 'Foto', render: (v) => v ? `<img class="damage-preview" src="${v}" alt="Schaden">` : '-' }
  ]);

  el('uvvTable').innerHTML = renderTable(state.uvv, [
    { key: 'kennzeichen', label: 'Kennzeichen' },
    { key: 'pruefer', label: 'Pruefer' },
    { key: 'datum', label: 'Pruefdatum' },
    { key: 'naechste_pruefung_datum', label: 'Naechste Pruefung' },
    { key: 'checkpunkte', label: 'Pruefung', render: (v) => `<div class="uvv-symbols">${v.map((item) => `<span class="${badgeClass(item.status)} symbol-badge">${symbolFor(item.status)}</span>`).join('')}</div>` },
    { key: 'id', label: 'PDF', render: (v) => `<button onclick="downloadPdf(${v})">PDF</button>` }
  ]);

  el('usersTable').innerHTML = renderTable(state.benutzer, [
    { key: 'benutzername', label: 'Benutzername' },
    { key: 'name', label: 'Name', render: (v, row) => `${v || '-'}${String(state.editUserId) === String(row.id) ? '<br><span class="muted">Wird gerade bearbeitet</span>' : ''}` },
    { key: 'email', label: 'E-Mail' },
    { key: 'rolle', label: 'Rolle', render: (v) => `<span class="${badgeClass(v)}">${v}</span>` },
    { key: 'standort', label: 'Standort' },
    { key: 'aktiv', label: 'Aktiv', render: (v) => v ? '<span class="badge ok">Ja</span>' : '<span class="badge danger">Nein</span>' },
    { key: 'id', label: 'Aktion', render: (v) => canManage ? `<button class="icon-btn" data-action="user-edit" data-id="${v}" title="Benutzer bearbeiten">&#9998;</button>` : '-' }
  ]);

  el('locationsTable').innerHTML = renderTable(state.meta.standorte, [
    { key: 'id', label: 'ID' },
    { key: 'name', label: 'Standort', render: (v, row) => state.user?.rolle === 'hauptadmin' ? `<input data-action="location-name" data-id="${row.id}" value="${v}">` : v },
    { key: 'id', label: 'Aktion', render: (v) => state.user?.rolle === 'hauptadmin' ? `<div class="action-row"><button data-action="location-save" data-id="${v}">Speichern</button><button class="secondary" data-action="location-delete" data-id="${v}">Loeschen</button></div>` : '-' }
  ]);

  const dashboardData = state.dashboard || {};
  const statusRows = (dashboardData.statusSummary || []).map((item) => ({ label: item.status, value: item.count }));
  const maxStatusValue = statusRows.length ? Math.max(...statusRows.map((item) => Number(item.value || 0)), 1) : 1;
  const heroStats = [
    ['Fahrzeuge gesamt', dashboardData.counts?.fahrzeuge || 0, 'vehicle'],
    ['Werkstatt gesamt', dashboardData.counts?.werkstatt || 0, 'workshop'],
    ['Schaeden gesamt', dashboardData.counts?.schaeden || 0, 'damage'],
    ['HU faellig', dashboardData.counts?.huFaellig || 0, 'warn'],
    ['UVV faellig', dashboardData.counts?.uvvFaellig || 0, 'warn']
  ];
  el('statisticsHero').innerHTML = heroStats.map(([label, value, tone]) => `<div class="statistics-hero-card statistics-hero-${tone}"><span>${label}</span><strong>${value}</strong></div>`).join('');
  el('statisticsTable').innerHTML = renderTable(statusRows, [{ key: 'label', label: 'Kategorie' }, { key: 'value', label: 'Anzahl' }]);
  el('statisticsSummary').innerHTML = statusRows.length ? statusRows.map((item) => {
    const width = Math.max(Math.round((Number(item.value || 0) / maxStatusValue) * 100), item.value ? 8 : 0);
    return `<div class="statistics-status-row"><div class="statistics-status-head"><strong>${item.label}</strong><span>${item.value}</span></div><div class="statistics-status-track"><div class="statistics-status-fill" style="width:${width}%"></div></div></div>`;
  }).join('') : '<p class="muted">Keine Statistik vorhanden.</p>';
  el('statisticsInsights').innerHTML = [
    ['Aktive Fahrzeuge', dashboardData.fahrzeugKpis?.aktiv || 0, 'Direkt einsatzbereit'],
    ['In Werkstatt', dashboardData.fahrzeugKpis?.werkstatt || 0, 'Mit Werkstattbezug'],
    ['Schaden offen', dashboardData.schadenKpis?.gemeldet || 0, 'Neu gemeldete Schaeden'],
    ['Werkstatt offen', dashboardData.werkstattKpis?.offen || 0, 'Noch nicht abgeschlossen'],
    ['Pruefung', dashboardData.fahrzeugKpis?.pruefung || 0, 'Zur technischen Pruefung'],
    ['Abgeschlossen', dashboardData.werkstattKpis?.abgeschlossen || 0, 'Fertige Werkstattauftraege']
  ].map(([label, value, hint]) => `<div class="statistics-insight-card"><span>${label}</span><strong>${value}</strong><small>${hint}</small></div>`).join('');
}

async function loadData() {
  if (!state.token) return;
  state.meta = await api(`/api/meta${querySuffix()}`);
  renderTopbarControls();
  renderSelectionNotice();
  if (shouldWaitForStandort()) {
    state.dashboard = null;
    state.fahrzeuge = [];
    state.werkstatt = [];
    state.workshopBereiche = [];
    state.schaeden = [];
    state.uvv = [];
    state.benutzer = [];
    renderForms();
    renderLists();
    renderDashboard();
    applyRoleVisibility();
    bindDynamicForms();
    bindInlineActions();
    return;
  }

  const suffix = querySuffix();
  const [fahrzeuge, werkstatt, workshopBereiche, schaeden, uvv, dashboard] = await Promise.all([
    api(`/api/fahrzeuge${suffix}`),
    api(`/api/werkstatt${suffix}`),
    api(`/api/werkstatt-bereiche${suffix}`),
    api(`/api/schaeden${suffix}`),
    api(`/api/uvv${suffix}`),
    api(`/api/dashboard${suffix}`)
  ]);
  state.fahrzeuge = fahrzeuge;
  state.werkstatt = werkstatt;
  state.workshopBereiche = workshopBereiche;
  state.schaeden = schaeden;
  state.uvv = uvv;
  state.dashboard = dashboard;
  state.benutzer = state.user.rolle === 'benutzer' ? [] : await api(`/api/benutzer${suffix}`);
  renderForms();
  renderLists();
  renderDashboard();
  applyRoleVisibility();
  bindDynamicForms();
  bindInlineActions();
}

async function refreshApp() {
  await loadData();
}

function applyRoleVisibility() {
  const visible = new Set(state.meta.visibleViews || []);
  document.querySelectorAll('.nav-btn').forEach((btn) => { btn.style.display = visible.has(btn.dataset.view) ? 'block' : 'none'; });
  if (state.user?.rolle === 'benutzer') {
    showView('schaeden');
    el('vehicleForm').style.display = 'none';
    el('workshopForm').style.display = 'none';
    el('uvvForm').style.display = 'none';
    el('userForm').style.display = 'none';
    if (el('damageTablePanel')) el('damageTablePanel').style.display = 'none';
    if (el('damageLayout')) el('damageLayout').classList.add('damage-layout-user');
  } else {
    if (el('damageTablePanel')) el('damageTablePanel').style.display = '';
    if (el('damageLayout')) el('damageLayout').classList.remove('damage-layout-user');
  }
}

function showView(name) {
  document.querySelectorAll('.view').forEach((view) => view.className = 'view hidden');
  const target = el(`${name}View`);
  if (target) target.className = 'view visible';
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === name));
  const [title, subtitle] = viewMeta[name] || [name, ''];
  el('viewTitle').textContent = title;
  el('viewSubtitle').textContent = subtitle;
}

async function handleLogin(event) {
  event.preventDefault();
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    setAuth(result.token, result.user);
    toggleApp(true);
    el('loginError').textContent = '';
    await refreshApp();
    showView(state.user.rolle === 'benutzer' ? 'schaeden' : 'dashboard');
  } catch (error) {
    el('loginError').textContent = error.message;
  }
}

async function handleVehicleSubmit(event) {
  event.preventDefault();
  try {
    const isEditing = Boolean(state.editVehicleId);
    const formData = new FormData(event.target);
    const pdfFile = formData.get('fahrzeugschein_pdf');
    const payload = Object.fromEntries([...formData.entries()].filter(([key]) => key !== 'fahrzeugschein_pdf'));
    if (state.user?.rolle !== 'hauptadmin') payload.standort_id = state.user?.standort_id || '';
    if (!payload.kennzeichen || !payload.fahrzeug) throw new Error('Kennzeichen und Fahrzeugmodell sind Pflichtfelder.');
    let savedVehicle;
    if (isEditing) {
      savedVehicle = await api(`/api/fahrzeuge/${state.editVehicleId}`, { method: 'PUT', body: JSON.stringify(payload) });
      state.editVehicleId = null;
    } else {
      savedVehicle = await api('/api/fahrzeuge', { method: 'POST', body: JSON.stringify(payload) });
    }
    if (pdfFile && pdfFile.size > 0) {
      const pdfData = new FormData();
      pdfData.append('fahrzeugschein_pdf', pdfFile);
      await api(`/api/fahrzeuge/${savedVehicle.id}/upload-fahrzeugschein`, { method: 'POST', body: pdfData });
    }
    event.target.reset();
    await refreshApp();
    setVehicleFormMessage(isEditing ? 'Fahrzeug wurde aktualisiert.' : 'Fahrzeug wurde angelegt.', 'success');
  } catch (error) {
    setVehicleFormMessage(error.message || 'Fahrzeug konnte nicht gespeichert werden.', 'error');
  }
}

async function handleWorkshopSubmit(event) {
  event.preventDefault();
  try {
    const isEditing = Boolean(state.editWorkshopId);
      const draftWorkshop = currentWorkshopDraft();
      const payload = Object.fromEntries(new FormData(event.target));
    payload.workshop_slot = Number(draftWorkshop.workshop_slot || 1) || 1;
    payload.werkstatt_name = String(payload.werkstatt_name || '').trim() || draftWorkshop.werkstatt_name || 'Werkstatt';
    if (!payload.fahrzeug_id || !payload.datum_von) throw new Error('Fahrzeug und Von Datum sind Pflichtfelder.');
    if (isEditing) {
      await api(`/api/werkstatt/${state.editWorkshopId}`, { method: 'PUT', body: JSON.stringify(payload) });
      state.editWorkshopId = null;
    } else {
      await api('/api/werkstatt', { method: 'POST', body: JSON.stringify(payload) });
    }
    event.target.reset();
    await refreshApp();
    setWorkshopFormMessage(isEditing ? 'Werkstattauftrag wurde aktualisiert.' : 'Werkstattauftrag wurde angelegt.', 'success');
  } catch (error) {
    setWorkshopFormMessage(error.message || 'Werkstattauftrag konnte nicht gespeichert werden.', 'error');
  }
}

async function handleDamageSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const payload = Object.fromEntries([...formData.entries()].filter(([key]) => key !== 'foto'));
  const created = await api('/api/schaeden', { method: 'POST', body: JSON.stringify(payload) });
  const file = formData.get('foto');
  if (file && file.size > 0) {
    const uploadData = new FormData();
    uploadData.append('foto', file);
    await api(`/api/schaeden/${created.id}/upload`, { method: 'POST', body: uploadData, headers: {} });
  }
  event.target.reset();
  await refreshApp();
}

async function handleUvvSubmit(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const checkpunkte = state.meta.uvvCheckpoints.map((punkt, index) => ({ status: data[`checkpoint_status_${index}`], kommentar: data[`checkpoint_comment_${index}`] || '' }));
  await api('/api/uvv', { method: 'POST', body: JSON.stringify({ fahrzeug_id: data.fahrzeug_id, pruefer: data.pruefer, datum: data.datum, naechste_pruefung_datum: data.naechste_pruefung_datum, kommentar: data.kommentar, checkpunkte }) });
  event.target.reset();
  await refreshApp();
}

async function handleUserSubmit(event) {
  event.preventDefault();
  try {
    const isEditing = Boolean(state.editUserId);
    const payload = Object.fromEntries(new FormData(event.target));
    payload.aktiv = Number(payload.aktiv ?? 1);
    if (state.user?.rolle !== 'hauptadmin') payload.standort_id = state.user?.standort_id || '';
    if (!payload.benutzername || !payload.name || !payload.email) throw new Error('Benutzername, Name und E-Mail sind Pflichtfelder.');
    if (!isEditing && !payload.passwort) throw new Error('Beim neuen Benutzer muss ein Passwort vergeben werden.');

    if (isEditing) {
      if (!payload.passwort) delete payload.passwort;
      await api(`/api/benutzer/${state.editUserId}`, { method: 'PUT', body: JSON.stringify(payload) });
      state.editUserId = null;
    } else {
      await api('/api/benutzer', { method: 'POST', body: JSON.stringify(payload) });
    }

    event.target.reset();
    await refreshApp();
    setUserFormMessage(isEditing ? 'Benutzer wurde aktualisiert.' : 'Benutzer wurde angelegt.', 'success');
  } catch (error) {
    setUserFormMessage(error.message || 'Benutzer konnte nicht gespeichert werden.', 'error');
  }
}

async function handleSearch() {
  const q = encodeURIComponent(el('searchInput').value.trim());
  const path = querySuffix() ? `/api/suche${querySuffix()}&q=${q}` : `/api/suche?q=${q}`;
  const rows = await api(path);
  el('searchTable').innerHTML = renderTable(rows, [
    { key: 'kennzeichen', label: 'Kennzeichen' },
    { key: 'fahrzeug', label: 'Fahrzeug' },
    { key: 'standort', label: 'Standort' },
    { key: 'status', label: 'Status', render: (v) => `<span class="${badgeClass(v)}">${v}</span>` },
    { key: 'hu_datum', label: 'HU' },
    { key: 'uvv_datum', label: 'UVV' }
  ]);
}

async function handleImport(event) {
  event.preventDefault();
  const result = await api('/api/import/csv', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
  el('importResult').textContent = JSON.stringify(result, null, 2);
  await refreshApp();
}

async function handleExportCsv() {
  const response = await fetch('/api/export/csv' + querySuffix(), {
    headers: state.token ? { Authorization: 'Bearer ' + state.token } : {}
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'CSV Export fehlgeschlagen.' }));
    throw new Error(error.error || 'CSV Export fehlgeschlagen.');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const fileName = match && match[1] ? match[1] : 'fahrzeuge_export.csv';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  el('importResult').textContent = 'CSV Export erstellt: ' + fileName;
}

async function bindInlineActions() {
  document.querySelectorAll('[data-action="vehicle-edit"]').forEach((node) => {
    node.onclick = async () => {
      setVehicleEdit(node.dataset.id);
    };
  });
  document.querySelectorAll('[data-action="vehicle-delete"]').forEach((node) => {
    node.onclick = async () => {
      await api(`/api/fahrzeuge/${node.dataset.id}`, { method: 'DELETE' });
      await refreshApp();
    };
  });
  document.querySelectorAll('[data-action="workshop-edit"]').forEach((node) => {
    node.onclick = async () => {
      setWorkshopEdit(node.dataset.id);
    };
  });
  document.querySelectorAll('[data-action="workshop-save"]').forEach((node) => {
    node.onclick = async () => {
      const sign = document.querySelector(`[data-action="workshop-sign"][data-id="${node.dataset.id}"]`)?.value;
      const status_datum = document.querySelector(`[data-action="workshop-status-date"][data-id="${node.dataset.id}"]`)?.value;
      const datum_von = document.querySelector(`[data-action="workshop-date-from"][data-id="${node.dataset.id}"]`)?.value;
      const datum_bis = document.querySelector(`[data-action="workshop-date-to"][data-id="${node.dataset.id}"]`)?.value;
      await api(`/api/werkstatt/${node.dataset.id}`, { method: 'PUT', body: JSON.stringify({ pruefzeichen: sign, status_datum, datum_von, datum_bis }) });
      await refreshApp();
    };
  });
  document.querySelectorAll('[data-action="workshop-list-save"]').forEach((node) => {
    node.onclick = async () => {
      const sign = document.querySelector(`[data-action="workshop-list-sign"][data-id="${node.dataset.id}"]`)?.value;
      const status_datum = document.querySelector(`[data-action="workshop-list-date"][data-id="${node.dataset.id}"]`)?.value;
      const datum_bis = document.querySelector(`[data-action="workshop-list-bis"][data-id="${node.dataset.id}"]`)?.value;
      const status = document.querySelector(`[data-action="workshop-status"][data-id="${node.dataset.id}"]`)?.value;
      await api(`/api/werkstatt/${node.dataset.id}`, { method: 'PUT', body: JSON.stringify({ pruefzeichen: sign, status_datum, datum_bis, status }) });
      await refreshApp();
    };
  });
  document.querySelectorAll('[data-action="workshop-delete"]').forEach((node) => {
    node.onclick = async () => {
      await api(`/api/werkstatt/${node.dataset.id}`, { method: 'DELETE' });
      await refreshApp();
    };
  });
  document.querySelectorAll('[data-action="workshop-area-edit"]').forEach((node) => {
    node.onclick = async () => {
      state.editingWorkshopAreaId = node.dataset.id;
      renderLists();
      bindInlineActions();
    };
  });
  document.querySelectorAll('[data-action="workshop-area-cancel"]').forEach((node) => {
    node.onclick = async () => {
      state.editingWorkshopAreaId = null;
      renderLists();
      bindInlineActions();
    };
  });
  document.querySelectorAll('[data-action="workshop-area-save"]').forEach((node) => {
    node.onclick = async () => {
      const input = document.querySelector(`[data-action="workshop-area-name"][data-id="${node.dataset.id}"]`);
      if (!input || !node.dataset.id) return;
      await api(`/api/werkstatt-bereiche/${node.dataset.id}`, { method: 'PUT', body: JSON.stringify({ name: input.value }) });
      state.editingWorkshopAreaId = null;
      await refreshApp();
      renderForms();
      bindDynamicForms();
    };
  });
  document.querySelectorAll('[data-action="damage-status"]').forEach((node) => {
    node.onchange = async () => {
      await api(`/api/schaeden/${node.dataset.id}`, { method: 'PUT', body: JSON.stringify({ status: node.value }) });
      await refreshApp();
    };
  });
  document.querySelectorAll('[data-action="user-edit"]').forEach((node) => {
    node.onclick = async () => {
      setUserEdit(node.dataset.id);
    };
  });
  document.querySelectorAll('[data-action="location-save"]').forEach((node) => {
    node.onclick = async () => {
      const input = document.querySelector(`[data-action="location-name"][data-id="${node.dataset.id}"]`);
      await api(`/api/standorte/${node.dataset.id}`, { method: 'PUT', body: JSON.stringify({ name: input.value }) });
      await refreshApp();
    };
  });
  document.querySelectorAll('[data-action="location-delete"]').forEach((node) => {
    node.onclick = async () => {
      await api(`/api/standorte/${node.dataset.id}`, { method: 'DELETE' });
      await refreshApp();
    };
  });
}

async function downloadPdf(id) {
  const blob = await api(`/api/uvv/${id}/pdf`);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
window.downloadPdf = downloadPdf;

function bindEvents() {
  el('loginForm').addEventListener('submit', handleLogin);
  el('logoutBtn').addEventListener('click', clearAuth);
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));
  el('searchBtn').addEventListener('click', handleSearch);
  el('importForm').addEventListener('submit', handleImport);
  el('csvFileInput')?.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const text = await file.text();
    const csvField = document.querySelector('#importForm textarea[name="csv"]');
    if (csvField) csvField.value = text;
    el('importResult').textContent = 'CSV Datei geladen: ' + file.name;
  });
  el('exportCsvBtn')?.addEventListener('click', async () => {
    try {
      await handleExportCsv();
    } catch (error) {
      el('importResult').textContent = error.message || 'CSV Export fehlgeschlagen.';
    }
  });
}

function bindDynamicForms() {
  el('vehicleForm').onsubmit = handleVehicleSubmit;
  el('workshopForm').onsubmit = handleWorkshopSubmit;
  el('damageForm').onsubmit = handleDamageSubmit;
  el('uvvForm').onsubmit = handleUvvSubmit;
  el('userForm').onsubmit = handleUserSubmit;
  const cancelVehicleButton = document.querySelector('[data-action="vehicle-cancel"]');
  if (cancelVehicleButton) cancelVehicleButton.onclick = resetVehicleForm;
  const cancelWorkshopButton = document.querySelector('[data-action="workshop-cancel"]');
  if (cancelWorkshopButton) cancelWorkshopButton.onclick = resetWorkshopForm;
  const cancelUserButton = document.querySelector('[data-action="user-cancel"]');
  if (cancelUserButton) cancelUserButton.onclick = resetUserForm;
}

async function bootstrap() {
  bindEvents();
  updateUserBadge();
  if (state.token && state.user) {
    toggleApp(true);
    await refreshApp();
    showView(state.user.rolle === 'benutzer' ? 'schaeden' : 'dashboard');
  }
}

setInterval(async () => {
  if (state.token) await refreshApp();
}, 120000);

bootstrap();



