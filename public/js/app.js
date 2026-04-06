const state = {
  token: sessionStorage.getItem('fuhrpark_token') || localStorage.getItem('fuhrpark_token') || '',
  user: JSON.parse(sessionStorage.getItem('fuhrpark_user') || localStorage.getItem('fuhrpark_user') || 'null'),
  selectedStandortId: sessionStorage.getItem('fuhrpark_selected_standort') || localStorage.getItem('fuhrpark_selected_standort') || '',
  meta: { standorte: [], fahrzeugStatus: [], werkstattStatus: [], schadenStatus: [], pruefzeichen: [], uvvCheckpoints: [], visibleViews: [] },
  dashboard: null,
  fahrzeuge: [],
  werkstatt: [],
  systemNotifications: [],
  schaeden: [],
  uvv: [],
  benutzer: [],
  kontakte: [],
  lagerorte: [],
  lagerartikel: [],
  lagerbewegungen: [],
  reinigung: { datum: new Date().toISOString().slice(0, 10), reinigungstag: '1', aktuelle: [], werkstatt: [], gereinigt: [] },
  kontaktFilter: { q: '', kategorie: '' },
  editKontaktId: null,
  editDamageId: null,
  editUvvId: null,
  editUserId: null,
  editVehicleId: null,
  vehicleDetailId: null,
  viewDocsVehicleId: null,
  editWorkshopId: null,
  workshopOverviewFilter: 'all',
  agendaFilter: 'all',
  editingWorkshopAreaId: null,
  damageLocale: localStorage.getItem('damage_form_locale') || 'de',
  damageDraftBuffer: null
};

const DAMAGE_MARKER_DEFS = [
  { id: 'front_left', label: 'Vorne links', view: 'Seite links', x: 10, y: 58, w: 18, h: 18 },
  { id: 'left_front_door', label: 'Tuer vorne links', view: 'Seite links', x: 32, y: 38, w: 16, h: 28 },
  { id: 'left_rear_door', label: 'Tuer hinten links', view: 'Seite links', x: 50, y: 38, w: 16, h: 28 },
  { id: 'rear_left', label: 'Hinten links', view: 'Seite links', x: 72, y: 58, w: 18, h: 18 },
  { id: 'front_center', label: 'Front', view: 'Front', x: 34, y: 20, w: 28, h: 24 },
  { id: 'front_right', label: 'Vorne rechts', view: 'Front', x: 64, y: 42, w: 16, h: 16 },
  { id: 'front_left_face', label: 'Vorne links', view: 'Front', x: 18, y: 42, w: 16, h: 16 },
  { id: 'roof', label: 'Dach', view: 'Oben', x: 28, y: 24, w: 36, h: 40 },
  { id: 'rear_center', label: 'Heck', view: 'Heck', x: 32, y: 24, w: 32, h: 22 },
  { id: 'rear_right', label: 'Hinten rechts', view: 'Heck', x: 64, y: 44, w: 16, h: 16 },
  { id: 'rear_left_face', label: 'Hinten links', view: 'Heck', x: 18, y: 44, w: 16, h: 16 },
  { id: 'front_right_side', label: 'Vorne rechts', view: 'Seite rechts', x: 72, y: 58, w: 18, h: 18 },
  { id: 'right_front_door', label: 'Tuer vorne rechts', view: 'Seite rechts', x: 50, y: 38, w: 16, h: 28 },
  { id: 'right_rear_door', label: 'Tuer hinten rechts', view: 'Seite rechts', x: 32, y: 38, w: 16, h: 28 },
  { id: 'rear_right_side', label: 'Hinten rechts', view: 'Seite rechts', x: 10, y: 58, w: 18, h: 18 }
];

const DAMAGE_FORM_TRANSLATIONS = {
  de: {
    language: 'Sprache',
    title_new: 'Schaden erfassen',
    title_edit: 'Schaden bearbeiten',
    title_user: 'Unfall melden',
    subtitle_new: 'Unfall- und Schadenmeldungen strukturiert erfassen.',
    subtitle_edit: 'Schadenmeldung bearbeiten.',
    cancel: 'Abbrechen',
    vehicle: 'Fahrzeug',
    accident_data: 'Unfalldaten',
    driver_name: 'Fahrername',
    driver_phone: 'Fahrer Telefon',
    date: 'Datum',
    other_phone: 'Telefon Unfallgegner',
    police: 'Polizei vor Ort',
    injured: 'Verletzte',
    claim_no: 'VU Nummer',
    no: 'Nein',
    yes: 'Ja',
    description_group: 'Beschreibung und Gegner',
    description: 'Unfallbeschreibung',
    description_placeholder: 'Bitte Unfallhergang so genau wie moeglich beschreiben',
    other_name: 'Unfallgegner Name',
    other_plate: 'Unfallgegner Kennzeichen',
    insurance: 'Versicherung',
    status: 'Status',
    photo: 'Schadenfoto',
    save_new: 'Unfallmeldung speichern',
    save_edit: 'Aenderungen speichern',
    sketch_title: 'Schadenskizze',
    sketch_view: 'Ansicht',
    sketch_help: 'Tippen oder klicken, um Schadenzonen ein- oder auszuschalten.',
    sketch_empty: 'Noch keine Bereiche markiert.'
  },
  en: {
    language: 'Language',
    title_new: 'Create damage report',
    title_edit: 'Edit damage report',
    title_user: 'Report accident',
    subtitle_new: 'Capture accident and damage reports in a structured way.',
    subtitle_edit: 'Edit damage report.',
    cancel: 'Cancel',
    vehicle: 'Vehicle',
    accident_data: 'Accident details',
    driver_name: 'Driver name',
    driver_phone: 'Driver phone',
    date: 'Date',
    other_phone: 'Other party phone',
    police: 'Police on site',
    injured: 'Injured persons',
    claim_no: 'Case number',
    no: 'No',
    yes: 'Yes',
    description_group: 'Description and other party',
    description: 'Accident description',
    description_placeholder: 'Describe the accident as precisely as possible',
    other_name: 'Other party name',
    other_plate: 'Other party plate',
    insurance: 'Insurance',
    status: 'Status',
    photo: 'Damage photo',
    save_new: 'Save accident report',
    save_edit: 'Save changes',
    sketch_title: 'Damage sketch',
    sketch_view: 'View',
    sketch_help: 'Tap or click to toggle damage zones.',
    sketch_empty: 'No areas selected yet.'
  },
  pl: {
    language: 'Jezyk',
    title_new: 'Zglos szkode',
    title_edit: 'Edytuj zgloszenie szkody',
    title_user: 'Zglos wypadek',
    subtitle_new: 'Wprowadzaj zgloszenia wypadkow i szkod w uporzadkowany sposob.',
    subtitle_edit: 'Edytuj zgloszenie szkody.',
    cancel: 'Anuluj',
    vehicle: 'Pojazd',
    accident_data: 'Dane zdarzenia',
    driver_name: 'Imie kierowcy',
    driver_phone: 'Telefon kierowcy',
    date: 'Data',
    other_phone: 'Telefon drugiej strony',
    police: 'Policja na miejscu',
    injured: 'Osoby ranne',
    claim_no: 'Numer sprawy',
    no: 'Nie',
    yes: 'Tak',
    description_group: 'Opis i druga strona',
    description: 'Opis zdarzenia',
    description_placeholder: 'Opisz przebieg zdarzenia jak najdokladniej',
    other_name: 'Nazwa drugiej strony',
    other_plate: 'Tablica drugiej strony',
    insurance: 'Ubezpieczenie',
    status: 'Status',
    photo: 'Zdjecie szkody',
    save_new: 'Zapisz zgloszenie',
    save_edit: 'Zapisz zmiany',
    sketch_title: 'Szkic uszkodzen',
    sketch_view: 'Widok',
    sketch_help: 'Kliknij lub dotknij, aby zaznaczyc strefy uszkodzen.',
    sketch_empty: 'Nie zaznaczono jeszcze zadnych miejsc.'
  },
  ru: {
    language: 'Yazyk',
    title_new: 'Soobshit o povrezhdenii',
    title_edit: 'Redaktirovat povrezhdenie',
    title_user: 'Soobshit o DTP',
    subtitle_new: 'Zapolnyayte dannye o DTP i povrezhdeniyakh v strukturirovannom vide.',
    subtitle_edit: 'Redaktirovat zayavku o povrezhdenii.',
    cancel: 'Otmena',
    vehicle: 'Transport',
    accident_data: 'Dannye o proisshestvii',
    driver_name: 'Imya voditelya',
    driver_phone: 'Telefon voditelya',
    date: 'Data',
    other_phone: 'Telefon drugoy storony',
    police: 'Politsiya na meste',
    injured: 'Postradavshie',
    claim_no: 'Nomer dela',
    no: 'Net',
    yes: 'Da',
    description_group: 'Opisanie i drugaia storona',
    description: 'Opisanie proisshestviya',
    description_placeholder: 'Opishite proisshestvie kak mozhno tochnee',
    other_name: 'Imya drugoy storony',
    other_plate: 'Nomer drugoy storony',
    insurance: 'Strakhovka',
    status: 'Status',
    photo: 'Foto povrezhdeniya',
    save_new: 'Sohranit soobshchenie',
    save_edit: 'Sohranit izmeneniya',
    sketch_title: 'Skhema povrezhdeniy',
    sketch_view: 'Vid',
    sketch_help: 'Nazhmite ili kliknite, chtoby otmetit zony povrezhdeniya.',
    sketch_empty: 'Poka nichego ne otmecheno.'
  },
  ar: {
    language: 'اللغة',
    title_new: 'تسجيل ضرر',
    title_edit: 'تعديل بلاغ الضرر',
    title_user: 'الإبلاغ عن حادث',
    subtitle_new: 'تسجيل الحوادث والأضرار بشكل منظم.',
    subtitle_edit: 'تعديل بلاغ الضرر.',
    cancel: 'إلغاء',
    vehicle: 'المركبة',
    accident_data: 'بيانات الحادث',
    driver_name: 'اسم السائق',
    driver_phone: 'هاتف السائق',
    date: 'التاريخ',
    other_phone: 'هاتف الطرف الآخر',
    police: 'الشرطة في الموقع',
    injured: 'مصابون',
    claim_no: 'رقم الحادث',
    no: 'لا',
    yes: 'نعم',
    description_group: 'الوصف والطرف الآخر',
    description: 'وصف الحادث',
    description_placeholder: 'اشرح الحادث بأكبر قدر ممكن من الدقة',
    other_name: 'اسم الطرف الآخر',
    other_plate: 'لوحة الطرف الآخر',
    insurance: 'التأمين',
    status: 'الحالة',
    photo: 'صورة الضرر',
    save_new: 'حفظ البلاغ',
    save_edit: 'حفظ التغييرات',
    sketch_title: 'مخطط الضرر',
    sketch_view: 'العرض',
    sketch_help: 'اضغط أو انقر لتحديد مناطق الضرر.',
    sketch_empty: 'لم يتم تحديد أي منطقة بعد.'
  },
  uk: {
    language: 'Mova',
    title_new: 'Zareiestruvaty poshkodzhennia',
    title_edit: 'Redahuvaty zayavku pro poshkodzhennia',
    title_user: 'Povidomyty pro avariiu',
    subtitle_new: 'Strukturovano fiksuite avarii ta poshkodzhennia.',
    subtitle_edit: 'Redahuvaty zayavku pro poshkodzhennia.',
    cancel: 'Skasuvaty',
    vehicle: 'Transport',
    accident_data: 'Dani pro avariiu',
    driver_name: 'Imia vodiia',
    driver_phone: 'Telefon vodiia',
    date: 'Data',
    other_phone: 'Telefon inshoi storony',
    police: 'Politsiia na mistsi',
    injured: 'Postrazhdali',
    claim_no: 'Nomer spravy',
    no: 'Ni',
    yes: 'Tak',
    description_group: 'Opys i insha storona',
    description: 'Opys avarii',
    description_placeholder: 'Opishit avariiu yaknaidetalnishe',
    other_name: 'Imia inshoi storony',
    other_plate: 'Nomer inshoi storony',
    insurance: 'Strakhuvannia',
    status: 'Status',
    photo: 'Foto poshkodzhennia',
    save_new: 'Zberehty zayavku',
    save_edit: 'Zberehty zminy',
    sketch_title: 'Skhema poshkodzhennia',
    sketch_view: 'Vyhliad',
    sketch_help: 'Natysnit abo kliknit, shchob poznachyty zony poshkodzhennia.',
    sketch_empty: 'Shche ne poznacheno zhodnoi dilianky.'
  }
};

const el = (id) => document.getElementById(id);
const SYMBOLS = { ok: '&#10004;', nein: '&#10006;', nicht_ok: '&#10006;' };
const APP_ROLE_LABELS = {
  hauptadmin: 'Verwaltung',
  superadmin: 'Verwaltung',
  admin: 'Fuhrparkmanager',
  abteilungsleiter: 'Abteilungsleiter',
  lagerleiter: 'Lagerleiter',
  benutzer: 'Fahrer'
};
const viewMeta = {
  dashboard: ['Dashboard', 'Zentrale Uebersicht des Fuhrparks.'],
  fahrzeuge: ['Fahrzeuge', 'Verwalten Sie Ihren Fuhrparkbestand.'],
  werkstatt: ['Werkstatt', 'Werkstatt-Uebersicht mit aktiven Auftraegen und Bereichen.'],
  schaeden: ['Schaeden', 'Unfall- und Schadenmeldungen strukturiert erfassen.'],
  uvv: ['UVV', 'Pruefungen mit 20 Punkten dokumentieren.'],
  benutzer: ['Benutzer', 'Benutzer anlegen, aktivieren und verwalten.'],
  kontakte: ['Adressbuch', 'Kontakte fuer Werkstatt, Versicherungen und Dienstleister.'],
  reinigung: ['Reinigung', 'Zweitaegige Reinigungsliste mit PDF und Werkstattabgleich.'],
  lager: ['Lagerverwaltung', 'Lagerorte, Artikel, Bestandsbewegungen und Mindestmengen.'],
  standorte: ['Standorte', 'Standorte anlegen und bearbeiten.'],
  statistik: ['Statistik', 'Verdichtete Auswertung aller Kernbereiche.'],
  suche: ['Suche', 'Globale Suche ueber Fahrzeuge und Statusdaten.'],
  import: ['CSV Import', 'Fahrzeuge per CSV-Datei in das System laden.'],
  benachrichtigungen: ['Benachrichtigungen', 'Dringende Termine und Werkstatt-Hinweise.']
};

function appRoleLabel(role) {
  return APP_ROLE_LABELS[String(role || '').trim()] || String(role || '-').trim() || '-';
}


function reinigungQuery() {
  const params = new URLSearchParams();
  if (state.user?.rolle === 'hauptadmin' && state.selectedStandortId) params.set('standort_id', state.selectedStandortId);
  params.set('datum', state.reinigung?.datum || new Date().toISOString().slice(0, 10));
  params.set('reinigungstag', state.reinigung?.reinigungstag || '1');
  return '?' + params.toString();
}

function querySuffix() {
  return state.user?.rolle === 'hauptadmin' && state.selectedStandortId ? `?standort_id=${encodeURIComponent(state.selectedStandortId)}` : '';
}

function hasVisibleView(viewName) {
  return new Set(state.meta?.visibleViews || []).has(viewName);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Fehlerhafte Antwort.' }));
    if (response.status === 401) {
      clearAuth();
      toggleApp(false);
      throw new Error('Sitzung abgelaufen. Bitte neu einloggen.');
    }
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
  el('userBadge').textContent = state.user ? `${state.user.name} | ${appRoleLabel(state.user.rolle)}${state.user.standort ? ` | ${state.user.standort}` : ''}` : 'Nicht angemeldet';
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
  const currentView = state.currentView || desiredViewFromHash();
  const canManageVehicles = state.user.rolle !== 'benutzer' && currentView === 'fahrzeuge';
  const createButton = canManageVehicles ? '<button type="button" class="topbar-primary-btn" id="topbarCreateVehicleBtn">+ Neues Fahrzeug anlegen</button>' : '';
  const canManageWorkshop = state.user.rolle !== 'benutzer' && currentView === 'werkstatt';
  const workshopButton = canManageWorkshop ? '<button type="button" class="topbar-primary-btn" id="topbarCreateWorkshopBtn">+ Neuer Auftrag</button>' : '';
  const packagePill = state.meta?.paket?.name ? `<div class="topbar-pill">Paket: ${state.meta.paket.name}</div>` : '';
  if (state.user.rolle === 'hauptadmin') {
    const options = state.meta.standorte.map((s) => `<option value="${s.id}" ${String(s.id) === String(state.selectedStandortId) ? 'selected' : ''}>${s.name}</option>`).join('');
    el('topbarControls').innerHTML = `<div class="topbar-stack"><div class="topbar-pill">Hauptverwaltung: Carlswerk</div>${packagePill}<label class="topbar-label">Standort<select id="standortFilter"><option value="">Gesamtuebersicht alle Standorte</option>${options}</select></label>${createButton}${workshopButton}</div>`;
    el('standortFilter').onchange = async (event) => {
      state.selectedStandortId = event.target.value;
      sessionStorage.setItem('fuhrpark_selected_standort', state.selectedStandortId || '');
      await refreshApp();
    };
  } else {
    el('topbarControls').innerHTML = `<div class="topbar-stack"><div class="topbar-pill">Standort: ${state.user.standort || '-'}</div>${packagePill}${createButton}${workshopButton}</div>`;
  }
  el('topbarCreateVehicleBtn')?.addEventListener('click', () => openVehicleEditor());
  el('topbarCreateWorkshopBtn')?.addEventListener('click', () => openWorkshopEditor());
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

function availableUserRoleOptions() {
  if (['hauptadmin', 'superadmin'].includes(state.user?.rolle)) {
    return [
      ['hauptadmin', 'Verwaltung'],
      ['admin', 'Fuhrparkmanager'],
      ['abteilungsleiter', 'Abteilungsleiter'],
      ['lagerleiter', 'Lagerleiter'],
      ['benutzer', 'Fahrer']
    ];
  }
  if (state.user?.rolle === 'admin') {
    return [
      ['abteilungsleiter', 'Abteilungsleiter'],
      ['lagerleiter', 'Lagerleiter'],
      ['benutzer', 'Fahrer']
    ];
  }
  if (['abteilungsleiter', 'lagerleiter'].includes(state.user?.rolle)) {
    return [['benutzer', 'Fahrer']];
  }
  return [['benutzer', 'Fahrer']];
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
      fahrzeugschein_pdf: '',
      fin: '',
      radiocode: '',
      tankkarten_vorhanden: false,
      tankkarte_aral_nummer: '',
      tankkarte_aral_aktiv_seit: '',
      tankkarte_aral_gueltig_bis: '',
      tankkarte_shell_nummer: '',
      tankkarte_shell_gueltig_von: '',
      tankkarte_shell_gueltig_bis: '',
      tankkarte_shell_name: ''
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
    fahrzeugschein_pdf: vehicle?.fahrzeugschein_pdf || '',
    fin: vehicle?.fin || '',
    radiocode: vehicle?.radiocode || '',
    tankkarten_vorhanden: !!vehicle?.tankkarten_vorhanden,
    tankkarte_aral_nummer: vehicle?.tankkarte_aral_nummer || '',
    tankkarte_aral_aktiv_seit: vehicle?.tankkarte_aral_aktiv_seit || '',
    tankkarte_aral_gueltig_bis: vehicle?.tankkarte_aral_gueltig_bis || '',
    tankkarte_shell_nummer: vehicle?.tankkarte_shell_nummer || '',
    tankkarte_shell_gueltig_von: vehicle?.tankkarte_shell_gueltig_von || '',
    tankkarte_shell_gueltig_bis: vehicle?.tankkarte_shell_gueltig_bis || '',
    tankkarte_shell_name: vehicle?.tankkarte_shell_name || ''
  };
}

function currentVehicleDetail() {
  return state.fahrzeuge.find((entry) => String(entry.id) === String(state.vehicleDetailId)) || null;
}

function openVehicleDetail(id) {
  const targetId = Number(id);
  if (!targetId) return;
  const popup = window.open(
    `/vehicle-window.html?id=${targetId}`,
    `fleetcontrol24_vehicle_${targetId}`,
    'popup=yes,width=1480,height=980,resizable=yes,scrollbars=yes'
  );
  if (popup) popup.focus();
}

function closeVehicleDetail() {
  state.vehicleDetailId = null;
  renderVehicleDetailModal();
}

function renderVehicleDetailModal() {
  const modal = el('vehicleDetailModal');
  const body = el('vehicleDetailBody');
  const title = el('vehicleDetailTitle');
  const subtitle = el('vehicleDetailSubtitle');
  if (!modal || !body || !title || !subtitle) return;
  const vehicle = currentVehicleDetail();
  if (!vehicle) {
    modal.classList.add('hidden');
    body.innerHTML = '';
    return;
  }

  const workshopRows = (state.werkstatt || []).filter((item) => Number(item.fahrzeug_id) === Number(vehicle.id));
  const damageRows = (state.schaeden || []).filter((item) => Number(item.fahrzeug_id) === Number(vehicle.id));
  const uvvRows = (state.uvv || []).filter((item) => Number(item.fahrzeug_id) === Number(vehicle.id));
  const huDays = daysUntil(vehicle.hu_datum);
  const uvvDays = daysUntil(vehicle.uvv_datum);
  const latestWorkshop = workshopRows[0];
  const latestDamage = damageRows[0];

  title.textContent = `${vehicle.kennzeichen || '-'} · ${vehicle.fahrzeug || 'Fahrzeug'}`;
  subtitle.textContent = `${vehicle.standort || '-'} | ${vehicle.status || '-'} | ${vehicle.fin || 'Keine FIN gepflegt'}`;

  body.innerHTML = `
    <section class="vehicle-detail-hero">
      <article class="vehicle-hero-card">
        <div class="vehicle-detail-title-row">
          <span class="vehicle-status-chip">${vehicle.kennzeichen || '-'} · ${vehicle.fahrzeug || 'Fahrzeug'}</span>
          <span class="${badgeClass(vehicle.status)}">${vehicle.status || '-'}</span>
        </div>
        <div class="vehicle-summary-row">
          <span class="badge ${previewDueTone(huDays)}">HU ${vehicle.hu_datum ? formatShortDate(vehicle.hu_datum) : '-'}</span>
          <span class="badge ${previewDueTone(uvvDays)}">UVV ${vehicle.uvv_datum ? formatShortDate(vehicle.uvv_datum) : '-'}</span>
          <span class="badge ${vehicle.tankkarten_vorhanden ? 'ok' : 'muted'}">${vehicle.tankkarten_vorhanden ? 'Tankkarten aktiv' : 'Keine Tankkarten'}</span>
        </div>
        <div class="vehicle-kpi-grid">
          <div class="vehicle-kpi"><span>HU in</span><strong>${huDays === null ? '-' : `${huDays} Tg`}</strong></div>
          <div class="vehicle-kpi"><span>UVV in</span><strong>${uvvDays === null ? '-' : `${uvvDays} Tg`}</strong></div>
          <div class="vehicle-kpi"><span>Werkstatt</span><strong>${workshopRows.length}</strong></div>
          <div class="vehicle-kpi"><span>Schaeden</span><strong>${damageRows.length}</strong></div>
        </div>
        <div class="vehicle-actions-row">
          <button type="button" class="vehicle-detail-btn" data-action="vehicle-detail-edit" data-id="${vehicle.id}">Bearbeiten</button>
          <button type="button" class="vehicle-detail-btn-secondary" data-action="vehicle-detail-docs" data-id="${vehicle.id}">Dokumente</button>
          ${state.user && state.user.rolle !== 'benutzer' ? `<button type="button" class="vehicle-detail-btn-secondary" data-action="vehicle-detail-workshop" data-id="${vehicle.id}">Werkstattauftrag</button>` : ''}
          <button type="button" class="vehicle-detail-btn-secondary" data-action="vehicle-detail-close">Schliessen</button>
        </div>
      </article>
      <article class="vehicle-side-card">
        <h4>Fahrzeugdaten</h4>
        <dl class="vehicle-meta-table">
          <div class="vehicle-meta-card"><dt>Standort</dt><dd>${vehicle.standort || '-'}</dd></div>
          <div class="vehicle-meta-card"><dt>FIN</dt><dd>${vehicle.fin || '-'}</dd></div>
          <div class="vehicle-meta-card"><dt>Radiocode</dt><dd>${vehicle.radiocode || '-'}</dd></div>
          <div class="vehicle-meta-card"><dt>ARAL</dt><dd>${vehicle.tankkarte_aral_nummer || '-'}</dd></div>
          <div class="vehicle-meta-card"><dt>SHELL</dt><dd>${vehicle.tankkarte_shell_nummer || '-'}</dd></div>
          <div class="vehicle-meta-card"><dt>Angelegt</dt><dd>${String(vehicle.created_at || '').slice(0, 10) || '-'}</dd></div>
        </dl>
      </article>
    </section>
    <section class="vehicle-detail-split">
      <article class="vehicle-side-card">
        <h4>Werkstatt</h4>
        ${latestWorkshop ? `
          <div class="vehicle-mini-grid">
            <div class="vehicle-mini-card"><span>Letzter Auftrag</span><strong>${latestWorkshop.werkstatt_name || workshopAreaDisplayName(latestWorkshop.standort_id, latestWorkshop.workshop_slot)}</strong></div>
            <div class="vehicle-mini-card"><span>Status</span><strong>${latestWorkshop.status || '-'}</strong></div>
            <div class="vehicle-mini-card"><span>Problem</span><strong>${latestWorkshop.problem || '-'}</strong></div>
            <div class="vehicle-mini-card"><span>Von / Bis</span><strong>${latestWorkshop.datum_von || '-'} ${latestWorkshop.datum_bis ? `- ${latestWorkshop.datum_bis}` : ''}</strong></div>
          </div>` : '<div class="vehicle-empty-note">Kein Werkstattauftrag zugewiesen.</div>'}
      </article>
      <article class="vehicle-side-card">
        <h4>Schaeden</h4>
        ${latestDamage ? `
          <div class="vehicle-mini-grid">
            <div class="vehicle-mini-card"><span>Letzte Meldung</span><strong>${latestDamage.datum || '-'}</strong></div>
            <div class="vehicle-mini-card"><span>Status</span><strong>${latestDamage.status || '-'}</strong></div>
            <div class="vehicle-mini-card"><span>Beschreibung</span><strong>${latestDamage.beschreibung || '-'}</strong></div>
            <div class="vehicle-mini-card"><span>Markierungen</span><strong>${parseDamageMarkers(latestDamage.schaden_markierungen).length || 0}</strong></div>
          </div>` : '<div class="vehicle-empty-note">Keine Schadenmeldungen vorhanden.</div>'}
      </article>
    </section>
    <section class="vehicle-detail-split">
      <article class="vehicle-side-card">
        <h4>Pruefungen</h4>
        ${uvvRows.length ? `<div class="vehicle-mini-grid">${uvvRows.slice(0, 4).map((item) => `<div class="vehicle-mini-card"><span>${item.pruefer || 'UVV'}</span><strong>${item.datum || '-'}</strong></div>`).join('')}</div>` : '<div class="vehicle-empty-note">Noch keine UVV-Pruefungen dokumentiert.</div>'}
      </article>
      <article class="vehicle-side-card">
        <h4>Dokumente & Hinweise</h4>
        <div class="vehicle-mini-grid">
          <div class="vehicle-mini-card"><span>Fahrzeugschein</span><strong>${vehicle.fahrzeugschein_pdf ? 'Vorhanden' : 'Nicht hinterlegt'}</strong></div>
          <div class="vehicle-mini-card"><span>Modell</span><strong>${vehicle.fahrzeug || '-'}</strong></div>
        </div>
      </article>
    </section>
  `;

  modal.classList.remove('hidden');
}

function setVehicleEdit(id) {
  openVehicleEditor(id);
}

function resetVehicleForm() {
  state.editVehicleId = null;
  state.viewDocsVehicleId = null;
  el('vehicleDocumentsPanel').classList.add('hidden');
  renderForms();
  bindDynamicForms();
}

function openVehicleEditor(id = null) {
  const targetId = Number(id);
  const query = Number.isFinite(targetId) && targetId > 0 ? `?id=${targetId}` : '';
  const popup = window.open(
    `/vehicle-editor.html${query}`,
    Number.isFinite(targetId) && targetId > 0 ? `fleetcontrol24_vehicle_editor_${targetId}` : 'fleetcontrol24_vehicle_create',
    'popup=yes,width=1380,height=980,resizable=yes,scrollbars=yes'
  );
  if (popup) popup.focus();
}

async function showVehicleDocuments(vehicleId) {
  const targetId = Number(vehicleId);
  if (!targetId) return;
  const popup = window.open(
    `/vehicle-documents.html?id=${targetId}`,
    `fleetcontrol24_vehicle_docs_${targetId}`,
    'popup=yes,width=1280,height=900,resizable=yes,scrollbars=yes'
  );
  if (popup) popup.focus();
}

async function renderDocuments(vehicleId) {
  const docsList = el('vehicleDocumentsList');
  docsList.innerHTML = '<p class="muted">Lade Dokumente...</p>';
  try {
    const docs = await api(`/api/fahrzeuge/${vehicleId}/dokumente`);
    if (!docs.length) {
      docsList.innerHTML = '<p class="muted">Keine Dokumente gefunden.</p>';
      return;
    }
    docsList.innerHTML = docs.map(doc => {
      const url = doc.datei_pfad.includes('?') ? `${doc.datei_pfad}&token=${state.token}` : `${doc.datei_pfad}?token=${state.token}`;
      const canDeleteDoc = !String(doc.id || '').startsWith('uvv_');
      return `
      <div class="compact-item">
        <div class="doc-info">
          <strong>${doc.name}</strong>
          <span class="badge">${doc.typ}</span>
          <small class="muted">${String(doc.datum || '').slice(0, 10)}</small>
        </div>
        <div class="action-row">
          <a class="secondary-link" href="${url}" target="_blank" rel="noopener">Oeffnen</a>
          ${canDeleteDoc ? `<button class="secondary" data-action="doc-delete" data-id="${doc.id}">Loeschen</button>` : ''}
        </div>
      </div>
    `; }).join('');
    
    docsList.querySelectorAll('[data-action="doc-delete"]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Dokument wirklich loeschen?')) return;
        const query = btn.dataset.id === 'schein' ? `?fahrzeug_id=${vehicleId}` : '';
        await api(`/api/fahrzeuge/dokumente/${btn.dataset.id}${query}`, { method: 'DELETE' });
        await renderDocuments(vehicleId);
      };
    });
  } catch (error) {
    docsList.innerHTML = `<p class="error">Fehler beim Laden: ${error.message}</p>`;
  }
}

async function handleUploadDoc(event) {
  event.preventDefault();
  if (!state.viewDocsVehicleId) return;
  try {
    const formData = new FormData(event.target);
    await api(`/api/fahrzeuge/${state.viewDocsVehicleId}/dokumente`, {
      method: 'POST',
      body: formData
    });
    event.target.reset();
    await renderDocuments(state.viewDocsVehicleId);
  } catch (error) {
    alert('Upload fehlgeschlagen: ' + error.message);
  }
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
      workshop_slot: 1,
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
    workshop_slot: row?.workshop_slot || 1,
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
  openWorkshopEditor(id);
}

function resetWorkshopForm() {
  state.editWorkshopId = null;
  renderForms();
  bindDynamicForms();
}

function openWorkshopEditor(id = null) {
  const targetId = Number(id);
  const query = Number.isFinite(targetId) && targetId > 0 ? `?id=${targetId}` : '';
  const popup = window.open(
    `/workshop-editor.html${query}`,
    Number.isFinite(targetId) && targetId > 0 ? `fleetcontrol24_workshop_editor_${targetId}` : 'fleetcontrol24_workshop_create',
    'popup=yes,width=1380,height=960,resizable=yes,scrollbars=yes'
  );
  if (popup) popup.focus();
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

function currentKontaktDraft() {
  if (!state.editKontaktId) {
    return {
      id: '',
      name: '',
      firma: '',
      kategorie: 'werkstatt',
      ansprechpartner: '',
      telefon: '',
      mobil: '',
      email: '',
      adresse: '',
      website: '',
      standort_id: activeLocationId(),
      notiz: ''
    };
  }
  const kontakt = state.kontakte.find((entry) => String(entry.id) === String(state.editKontaktId));
  return {
    id: kontakt?.id || '',
    name: kontakt?.name || '',
    firma: kontakt?.firma || '',
    kategorie: kontakt?.kategorie || 'werkstatt',
    ansprechpartner: kontakt?.ansprechpartner || '',
    telefon: kontakt?.telefon || '',
    mobil: kontakt?.mobil || '',
    email: kontakt?.email || '',
    adresse: kontakt?.adresse || '',
    website: kontakt?.website || '',
    standort_id: kontakt?.standort_id || activeLocationId(),
    notiz: kontakt?.notiz || ''
  };
}

function setKontaktEdit(id) {
  state.editKontaktId = id;
  renderForms();
  bindDynamicForms();
  const form = el('kontaktForm');
  form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetKontaktForm() {
  state.editKontaktId = null;
  renderForms();
  bindDynamicForms();
}

function setKontaktFormMessage(message, type = 'info') {
  const node = el('kontaktFormMessage');
  if (!node) return;
  node.className = type === 'error' ? 'error visible' : 'success visible';
  node.textContent = message;
}

function parseDamageMarkers(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function damageMarkerLabel(markerId) {
  return DAMAGE_MARKER_DEFS.find((item) => item.id === markerId)?.label || markerId;
}

function damageText(key) {
  const locale = DAMAGE_FORM_TRANSLATIONS[state.damageLocale] ? state.damageLocale : 'de';
  return DAMAGE_FORM_TRANSLATIONS[locale]?.[key] || DAMAGE_FORM_TRANSLATIONS.de[key] || key;
}

function damageStatusLabel(value) {
  const map = {
    gemeldet: { de: 'gemeldet', en: 'reported', pl: 'zgloszone', ru: 'zayavleno', ar: 'مبلغ', uk: 'zaiavleno' },
    in_pruefung: { de: 'in_pruefung', en: 'under review', pl: 'weryfikacja', ru: 'na proverke', ar: 'قيد المراجعة', uk: 'na perevirtsi' },
    freigabe: { de: 'freigabe', en: 'approval', pl: 'akceptacja', ru: 'soglasovanie', ar: 'اعتماد', uk: 'uzghodzhennia' },
    in_reparatur: { de: 'in_reparatur', en: 'in repair', pl: 'w naprawie', ru: 'v remonte', ar: 'في الإصلاح', uk: 'u remonta' },
    abgeschlossen: { de: 'abgeschlossen', en: 'completed', pl: 'zakonczone', ru: 'zaversheno', ar: 'مكتمل', uk: 'zaversheno' }
  };
  const locale = DAMAGE_FORM_TRANSLATIONS[state.damageLocale] ? state.damageLocale : 'de';
  return map[value]?.[locale] || value;
}

function damageStatusOptionsMarkup(selected) {
  return (state.meta.schadenStatus || []).map((value) => `<option value="${value}" ${String(value) === String(selected) ? 'selected' : ''}>${damageStatusLabel(value)}</option>`).join('');
}

function captureDamageFormBuffer() {
  const form = el('damageForm');
  if (!form) return;
  state.damageDraftBuffer = Object.fromEntries(new FormData(form).entries());
}

function renderDamageMarkerBadges(value) {
  const markers = parseDamageMarkers(value);
  return markers.length
    ? markers.map((marker) => `<span class="badge danger">${damageMarkerLabel(marker)}</span>`).join('')
    : `<span class="muted">${damageText('sketch_empty')}</span>`;
}

function detectDamageSketchProfile(vehicleName) {
  const text = String(vehicleName || '').toLowerCase();
  if ((text.includes('iveco daily') || text.includes('daily') || text.includes('sprinter') || text.includes('crafter') || text.includes('transit')) &&
      (text.includes('koffer') || text.includes('aufbau') || text.includes('kofferaufbau') || text.includes('box'))) {
    return { key: 'box-truck', label: 'Kofferaufbau' };
  }
  if (text.includes('iveco daily') || text.includes('daily') || text.includes('sprinter') || text.includes('crafter') || text.includes('transit') || text.includes('master') || text.includes('ducato')) {
    return { key: 'van', label: 'Transporter' };
  }
  return { key: 'car', label: 'PKW' };
}

function damageSketchProfile(fahrzeugId) {
  const vehicle = (state.fahrzeuge || []).find((item) => String(item.id) === String(fahrzeugId));
  return detectDamageSketchProfile(vehicle?.fahrzeug || '');
}

function applyDamageSketchProfile(form, fahrzeugId) {
  const profile = damageSketchProfile(fahrzeugId);
  form.querySelectorAll('.damage-sketch-canvas').forEach((node) => {
    node.dataset.profile = profile.key;
  });
  const label = form.querySelector('[data-damage-profile-label]');
  if (label) label.textContent = `Ansicht: ${profile.label}`;
}

function renderDamageSketch(value, fahrzeugId) {
  const selected = new Set(parseDamageMarkers(value));
  const views = ['Seite links', 'Front', 'Oben', 'Heck', 'Seite rechts'];
  const profile = damageSketchProfile(fahrzeugId);
  return `
    <div class="damage-sketch-card">
      <div class="section-head">
        <h4>${damageText('sketch_title')}</h4>
        <span class="muted" data-damage-profile-label>${damageText('sketch_view')}: ${profile.label}</span>
      </div>
      <input type="hidden" name="schaden_markierungen" value="${parseDamageMarkers(value).join(',')}">
      <div class="damage-sketch-grid">
        ${views.map((view) => `
          <div class="damage-sketch-view">
            <strong>${view}</strong>
            <div class="damage-sketch-canvas damage-view-${view.toLowerCase().replace(/\s+/g, '-')}" data-profile="${profile.key}">
              ${DAMAGE_MARKER_DEFS.filter((item) => item.view === view).map((item) => `
                <button
                  type="button"
                  class="damage-marker ${selected.has(item.id) ? 'active' : ''}"
                  data-damage-marker="${item.id}"
                  title="${item.label}"
                  style="left:${item.x}%;top:${item.y}%;width:${item.w}%;height:${item.h}%;">
                </button>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
      <div class="damage-sketch-help">${damageText('sketch_help')}</div>
      <div class="damage-marker-summary" data-damage-summary>${renderDamageMarkerBadges(value)}</div>
    </div>
  `;
}

function updateDamageSketchSummary(form) {
  const hidden = form.querySelector('[name="schaden_markierungen"]');
  const summary = form.querySelector('[data-damage-summary]');
  if (!hidden || !summary) return;
  summary.innerHTML = renderDamageMarkerBadges(hidden.value);
}

function toggleDamageMarker(form, markerId) {
  const hidden = form.querySelector('[name="schaden_markierungen"]');
  if (!hidden) return;
  const selected = new Set(parseDamageMarkers(hidden.value));
  if (selected.has(markerId)) selected.delete(markerId);
  else selected.add(markerId);
  hidden.value = Array.from(selected).join(',');
  form.querySelectorAll(`[data-damage-marker="${markerId}"]`).forEach((node) => {
    node.classList.toggle('active', selected.has(markerId));
  });
  updateDamageSketchSummary(form);
}

function currentDamageDraft() {
  if (!state.editDamageId) {
    const draft = {
      fahrzeug_id: state.fahrzeuge[0]?.id || '',
      fahrer_name: state.user?.rolle === 'benutzer' ? (state.user?.name || '') : '',
      fahrer_telefon: '',
      datum: new Date().toISOString().slice(0, 10),
      uhrzeit: new Date().toTimeString().slice(0, 5),
      telefon: '',
      polizei_vor_ort: 'nein',
      verletzte: 'nein',
      vu_nummer: '',
      beschreibung: '',
      unfallgegner_name: '',
      unfallgegner_kennzeichen: '',
      versicherung: '',
      status: 'gemeldet',
      schaden_markierungen: ''
    };
    return state.damageDraftBuffer ? { ...draft, ...state.damageDraftBuffer } : draft;
  }
  const row = state.schaeden.find((entry) => String(entry.id) === String(state.editDamageId));
  const draft = {
    fahrzeug_id: row?.fahrzeug_id || state.fahrzeuge[0]?.id || '',
    fahrer_name: row?.fahrer_name || '',
    fahrer_telefon: row?.fahrer_telefon || '',
    datum: row?.datum || new Date().toISOString().slice(0, 10),
    uhrzeit: row?.uhrzeit || '',
    telefon: row?.telefon || '',
    polizei_vor_ort: row?.polizei_vor_ort || 'nein',
    verletzte: row?.verletzte || 'nein',
    vu_nummer: row?.vu_nummer || '',
    beschreibung: row?.beschreibung || '',
    unfallgegner_name: row?.unfallgegner_name || '',
    unfallgegner_kennzeichen: row?.unfallgegner_kennzeichen || '',
    versicherung: row?.versicherung || '',
    status: row?.status || 'gemeldet',
    schaden_markierungen: row?.schaden_markierungen || ''
  };
  return state.damageDraftBuffer ? { ...draft, ...state.damageDraftBuffer } : draft;
}

function setDamageEdit(id) {
  state.editDamageId = id;
  state.damageDraftBuffer = null;
  renderForms();
  bindDynamicForms();
  el('damageForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetDamageForm() {
  state.editDamageId = null;
  state.damageDraftBuffer = null;
  renderForms();
  bindDynamicForms();
}

function setDamageFormMessage(message, type = 'info') {
  const node = el('damageSuccessBox');
  if (!node) return;
  node.textContent = message;
  node.className = type === 'error' ? 'error visible' : 'success visible';
}

function resetLicenseForm() {
  const form = el('licenseCheckForm');
  if (!form) return;
  form.reset();
  const idField = form.querySelector('[name="id"]');
  if (idField) idField.value = '';
  setLicenseFormMessage('Neue Fuehrerscheinkontrolle anlegen oder einen vorhandenen Eintrag bearbeiten.');
}

function setLicenseFormMessage(message, type = 'info') {
  const node = el('licenseCheckMessage');
  if (!node) return;
  node.textContent = message;
  node.className = type === 'error' ? 'error visible' : type === 'success' ? 'success visible' : 'muted';
}

function currentUvvDraft() {
  if (!state.editUvvId) {
    return {
      fahrzeug_id: state.fahrzeuge[0]?.id || '',
      pruefer: state.user?.name || '',
      datum: '',
      naechste_pruefung_datum: '',
      kommentar: '',
      checkpunkte: state.meta.uvvCheckpoints.map(() => ({ status: 'ok', kommentar: '' }))
    };
  }
  const row = state.uvv.find((entry) => String(entry.id) === String(state.editUvvId));
  return {
    fahrzeug_id: row?.fahrzeug_id || state.fahrzeuge[0]?.id || '',
    pruefer: row?.pruefer || (state.user?.name || ''),
    datum: row?.datum || '',
    naechste_pruefung_datum: row?.naechste_pruefung_datum || '',
    kommentar: row?.kommentar || '',
    checkpunkte: state.meta.uvvCheckpoints.map((_, idx) => ({
      status: row?.checkpunkte?.[idx]?.status || 'ok',
      kommentar: row?.checkpunkte?.[idx]?.kommentar || ''
    }))
  };
}

function setUvvEdit(id) {
  state.editUvvId = id;
  renderForms();
  bindDynamicForms();
  el('uvvForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetUvvForm() {
  state.editUvvId = null;
  renderForms();
  bindDynamicForms();
}

function setUvvFormMessage(message, type = 'info') {
  const node = el('uvvFormMessage');
  if (!node) return;
  node.className = type === 'error' ? 'error visible' : 'success visible';
  node.textContent = message;
}

function filteredKontakte() {
  const q = String(state.kontaktFilter?.q || '').trim().toLowerCase();
  const kategorie = String(state.kontaktFilter?.kategorie || '').trim().toLowerCase();
  return (state.kontakte || []).filter((item) => {
    const matchesQuery = !q || [item.name, item.firma, item.ansprechpartner, item.telefon, item.mobil, item.email, item.adresse, item.website, item.notiz, item.standort, item.kategorie]
      .some((value) => String(value || '').toLowerCase().includes(q));
    const matchesKategorie = !kategorie || String(item.kategorie || '').toLowerCase() === kategorie;
    return matchesQuery && matchesKategorie;
  });
}

function renderForms() {
  el('vehicleForm').innerHTML = `
    <div class="compact-launch-card">
      <div>
        <span class="eyebrow">Fahrzeugverwaltung</span>
        <strong>Neue Fahrzeuge oben rechts anlegen</strong>
      </div>
      <p class="muted">Die Liste bleibt frei, der Editor laeuft im separaten Fenster.</p>
    </div>`;

  el('workshopForm').innerHTML = `
    <div class="compact-launch-card">
      <div>
        <span class="eyebrow">Werkstatt</span>
        <strong>Neue Auftraege oben rechts anlegen</strong>
      </div>
      <p class="muted">Werkstattliste bleibt sauber, Neu und Bearbeiten laufen im separaten Fenster.</p>
    </div>`;

  const draftDamage = currentDamageDraft();
  const isEditingDamage = Boolean(state.editDamageId);
  const isDriverDamageFlow = state.user?.rolle === 'benutzer';
  if (!isDriverDamageFlow && !isEditingDamage) {
    el('damageForm').innerHTML = `
      <div class="compact-launch-card">
        <div>
          <span class="eyebrow">Schadenverwaltung</span>
          <strong>Fahrer melden neue Schaeden direkt selbst</strong>
        </div>
        <p class="muted">Als Verwaltung bearbeitest, pruefst und schliesst du bestehende Schadenmeldungen direkt in der Liste.</p>
      </div>`;
  } else {
  const damageStatusSelect = state.user?.rolle === 'benutzer' ? '' : `<label>${damageText('status')}<select name="status">${damageStatusOptionsMarkup(draftDamage.status)}</select></label>`;
  const damageTitle = state.user?.rolle === 'benutzer' ? damageText('title_user') : (isEditingDamage ? damageText('title_edit') : damageText('title_new'));
  el('damageForm').innerHTML = `
    <div class="damage-form-shell" dir="${state.damageLocale === 'ar' ? 'rtl' : 'ltr'}">
    <div class="form-header-row">
      <div>
        <h3>${damageTitle}</h3>
        <p class="muted">${isEditingDamage ? damageText('subtitle_edit') : damageText('subtitle_new')}</p>
      </div>
      <div class="action-row damage-language-row">
        <label class="damage-language-select">${damageText('language')}<select name="damage_locale" id="damageLocaleSelect">
          <option value="de" ${state.damageLocale === 'de' ? 'selected' : ''}>Deutsch</option>
          <option value="en" ${state.damageLocale === 'en' ? 'selected' : ''}>English</option>
          <option value="pl" ${state.damageLocale === 'pl' ? 'selected' : ''}>Polski</option>
          <option value="ru" ${state.damageLocale === 'ru' ? 'selected' : ''}>Russkiy</option>
          <option value="ar" ${state.damageLocale === 'ar' ? 'selected' : ''}>العربية</option>
          <option value="uk" ${state.damageLocale === 'uk' ? 'selected' : ''}>Ukrainska</option>
        </select></label>
        ${isEditingDamage && state.user?.rolle !== 'benutzer' ? `<button type="button" class="secondary" data-action="damage-cancel">${damageText('cancel')}</button>` : ''}
      </div>
    </div>
    <div id="damageSuccessBox" class="success hidden"></div>
    <label>${damageText('vehicle')}<select name="fahrzeug_id">${state.fahrzeuge.map((f)=>`<option value="${f.id}" ${String(draftDamage.fahrzeug_id)===String(f.id)?'selected':''}>${f.kennzeichen} - ${f.fahrzeug}</option>`).join('')}</select></label>
    <div class="damage-form-grid">
      <div class="panel sub-panel damage-form-section">
        <h4>${damageText('accident_data')}</h4>
        <div class="two-col">
          <label>${damageText('driver_name')}<input name="fahrer_name" placeholder="${damageText('driver_name')}" value="${draftDamage.fahrer_name || ''}"></label>
          <label>${damageText('driver_phone')}<input name="fahrer_telefon" placeholder="${damageText('driver_phone')}" value="${draftDamage.fahrer_telefon || ''}"></label>
        </div>
        <div class="two-col">
          <label>${damageText('date')}<input name="datum" type="date" required value="${draftDamage.datum || ''}"></label>
          <label>Uhrzeit<input name="uhrzeit" type="time" value="${draftDamage.uhrzeit || ''}"></label>
        </div>
        <div class="two-col">
          <label>${damageText('other_phone')}<input name="telefon" placeholder="${damageText('other_phone')}" value="${draftDamage.telefon || ''}"></label>
          <div></div>
        </div>
        <div class="three-col">
          <label>${damageText('police')}<select name="polizei_vor_ort"><option value="nein" ${draftDamage.polizei_vor_ort==='nein'?'selected':''}>${damageText('no')}</option><option value="ja" ${draftDamage.polizei_vor_ort==='ja'?'selected':''}>${damageText('yes')}</option></select></label>
          <label>${damageText('injured')}<select name="verletzte"><option value="nein" ${draftDamage.verletzte==='nein'?'selected':''}>${damageText('no')}</option><option value="ja" ${draftDamage.verletzte==='ja'?'selected':''}>${damageText('yes')}</option></select></label>
          <label>${damageText('claim_no')}<input name="vu_nummer" placeholder="z. B. VU-2026-001" value="${draftDamage.vu_nummer || ''}"></label>
        </div>
      </div>
      <div class="panel sub-panel damage-form-section">
        <h4>${damageText('description_group')}</h4>
        <label>${damageText('description')}<textarea name="beschreibung" rows="5" placeholder="${damageText('description_placeholder')}">${draftDamage.beschreibung || ''}</textarea></label>
        <div class="two-col">
          <label>${damageText('other_name')}<input name="unfallgegner_name" value="${draftDamage.unfallgegner_name || ''}"></label>
          <label>${damageText('other_plate')}<input name="unfallgegner_kennzeichen" value="${draftDamage.unfallgegner_kennzeichen || ''}"></label>
        </div>
        <div class="two-col">
          <label>${damageText('insurance')}<input name="versicherung" value="${draftDamage.versicherung || ''}"></label>
          ${damageStatusSelect || '<div></div>'}
        </div>
      </div>
      ${renderDamageSketch(draftDamage.schaden_markierungen, draftDamage.fahrzeug_id)}
    </div>
    <label>${damageText('photo')}<input name="foto" type="file" accept="image/png,image/jpeg,image/webp"></label>
    <button type="submit">${isEditingDamage ? damageText('save_edit') : damageText('save_new')}</button>
    </div>`;
  }

  const draftUvv = currentUvvDraft();
  const isEditingUvv = Boolean(state.editUvvId);
  const checklist = state.meta.uvvCheckpoints.map((name, index) => `
    <div class="uvv-row">
      <div class="uvv-row-head"><strong>${String(index + 1).padStart(2, '0')}</strong> ${name}</div>
      <div class="uvv-row-controls">
        <select name="checkpoint_status_${index}">
          <option value="ok" ${draftUvv.checkpunkte[index]?.status==='ok'?'selected':''}>&#10004;</option>
          <option value="nicht_ok" ${draftUvv.checkpunkte[index]?.status==='nicht_ok'?'selected':''}>&#10006;</option>
        </select>
        <input name="checkpoint_comment_${index}" placeholder="Kommentar..." value="${draftUvv.checkpunkte[index]?.kommentar || ''}">
      </div>
    </div>`).join('');

  el('uvvForm').innerHTML = `
    <div class="form-header-row">
      <div>
        <h3>${isEditingUvv ? 'UVV bearbeiten' : 'Neue UVV-Pruefung'}</h3>
        <p class="muted">${isEditingUvv ? 'Alle 20 Pruefpunkte koennen bearbeitet werden.' : 'Neue UVV-Pruefung erfassen.'}</p>
      </div>
      ${isEditingUvv ? '<button type="button" class="secondary" data-action="uvv-cancel">Abbrechen</button>' : ''}
    </div>
    <div class="two-col">
      <label>Fahrzeug<select name="fahrzeug_id">${state.fahrzeuge.map((f)=>`<option value="${f.id}" ${String(draftUvv.fahrzeug_id)===String(f.id)?'selected':''}>${f.kennzeichen} - ${f.fahrzeug}</option>`).join('')}</select></label>
      <label>Pruefer<input name="pruefer" required value="${draftUvv.pruefer || ''}"></label>
    </div>
    <div class="two-col">
      <label>Pruefdatum<input name="datum" type="date" required value="${draftUvv.datum || ''}"></label>
      <label>Naechste Pruefung<input name="naechste_pruefung_datum" type="date" value="${draftUvv.naechste_pruefung_datum || ''}"></label>
    </div>
    <div class="uvv-card">
      <h4>Pruefpunkte (20)</h4>
      ${checklist}
    </div>
    <label>Gesamtkommentar<textarea name="kommentar" rows="3">${draftUvv.kommentar || ''}</textarea></label>
    <p id="uvvFormMessage" class="muted"></p>
    <button type="submit">${isEditingUvv ? 'Aenderungen speichern' : 'UVV speichern'}</button>`;

  const draftUser = currentUserDraft();
  const isEditingUser = Boolean(state.editUserId);
  const roleOptions = availableUserRoleOptions().map(([value, label]) => `<option value="${value}" ${draftUser.rolle === value ? 'selected' : ''}>${label}</option>`).join('');
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
      <label>Rolle<select name="rolle">${roleOptions}</select></label>
      <label>Standort<select name="standort_id" ${!['hauptadmin', 'superadmin'].includes(state.user?.rolle) ? 'disabled' : ''}>${state.meta.standorte.map((s) => `<option value="${s.id}" ${String(draftUser.standort_id) === String(s.id) ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label>
    </div>
    <label>Aktiv<select name="aktiv"><option value="1" ${draftUser.aktiv ? 'selected' : ''}>Ja</option><option value="0" ${!draftUser.aktiv ? 'selected' : ''}>Nein</option></select></label>
    <p id="userFormMessage" class="muted">${isEditingUser ? 'Hier kannst du Name, Rolle, Standort, Aktiv-Status und manuell ein neues Passwort setzen.' : 'Hier kannst du neue Benutzer fuer den Standort anlegen. Passwort: mindestens 8 Zeichen, Gross- und Kleinbuchstabe, Zahl.'}</p>
    <button type="submit">${isEditingUser ? 'Aenderungen speichern' : 'Benutzer speichern'}</button>`;

  const draftKontakt = currentKontaktDraft();
  const isEditingKontakt = Boolean(state.editKontaktId);
  if (el('kontaktForm')) el('kontaktForm').innerHTML = `
    <div class="form-header-row">
      <div>
        <h3>${isEditingKontakt ? 'Kontakt bearbeiten' : 'Kontakt anlegen'}</h3>
        <p class="muted">Adressbuch fuer Werkstatt, Versicherungen und Dienstleister.</p>
      </div>
      ${isEditingKontakt ? '<button type="button" class="secondary" data-action="kontakt-cancel">Abbrechen</button>' : ''}
    </div>
    <label>Name<input name="name" required placeholder="z. B. Iveco Service Koeln" value="${draftKontakt.name}"></label>
    <div class="two-col">
      <label>Firma<input name="firma" placeholder="Firma / Organisation" value="${draftKontakt.firma}"></label>
      <label>Kategorie<select name="kategorie">${optionsHtml(['werkstatt', 'versicherung', 'abschleppdienst', 'lieferant', 'dienstleister', 'sonstiges'], draftKontakt.kategorie)}</select></label>
    </div>
    <div class="two-col">
      <label>Ansprechpartner<input name="ansprechpartner" placeholder="Kontaktperson" value="${draftKontakt.ansprechpartner}"></label>
      <label>Telefon<input name="telefon" placeholder="Telefonnummer" value="${draftKontakt.telefon}"></label>
    </div>
    <div class="two-col">
      <label>Mobil<input name="mobil" placeholder="Mobilnummer" value="${draftKontakt.mobil}"></label>
      <label>E-Mail<input name="email" type="email" placeholder="mail@firma.de" value="${draftKontakt.email}"></label>
    </div>
    <label>Adresse<input name="adresse" placeholder="Adresse" value="${draftKontakt.adresse}"></label>
    <div class="two-col">
      <label>Website<input name="website" placeholder="https://..." value="${draftKontakt.website}"></label>
      <label>Standort<select name="standort_id" ${state.user?.rolle !== 'hauptadmin' ? 'disabled' : ''}><option value="">Global</option>${state.meta.standorte.map((s) => `<option value="${s.id}" ${String(draftKontakt.standort_id) === String(s.id) ? 'selected' : ''}>${s.name}</option>`).join('')}</select></label>
    </div>
    <label>Notiz<textarea name="notiz" rows="3" placeholder="Zusatzinfo">${draftKontakt.notiz}</textarea></label>
    <p id="kontaktFormMessage" class="muted">${isEditingKontakt ? 'Kontakt aktualisieren oder Standort anpassen.' : 'Neuen Kontakt im Adressbuch speichern.'}</p>
    <button type="submit">${isEditingKontakt ? 'Kontakt speichern' : 'Kontakt anlegen'}</button>`;
}

function rampLabel(number) {
  return `Rampe ${number}`;
}

function openScannerAssignmentModal(scannerId = '') {
  state.scannerModalOpen = true;
  const modal = el('scannerAssignmentModal');
  if (!modal) return;
  const scannerSelect = el('scannerScannerSelect');
  const rampSelect = el('scannerRampSelect');
  const selectedScannerId = scannerId ? Number(scannerId) : null;
  if (scannerSelect) {
    scannerSelect.innerHTML = (state.scanner || []).map((item) => {
      const current = item.aktuelle_rampe_nummer ? ` | aktuell ${item.aktuelle_rampe}` : '';
      return `<option value="${item.id}" ${selectedScannerId === Number(item.id) ? 'selected' : ''}>${item.bezeichnung}${current}</option>`;
    }).join('');
  }
  if (rampSelect) {
    rampSelect.innerHTML = (state.rampen || []).map((item) => {
      const current = item.scanner_label && item.scanner_label !== '-' ? ` | belegt: ${item.scanner_label}` : '';
      return `<option value="${item.id}">${rampLabel(item.nummer)}${current}</option>`;
    }).join('');
  }
  if (el('scannerSimInput')) el('scannerSimInput').value = '';
  if (el('scannerPhoneInput')) el('scannerPhoneInput').value = '';
  if (el('scannerProviderInput')) el('scannerProviderInput').value = '';
  if (selectedScannerId) {
    const scanner = (state.scanner || []).find((item) => Number(item.id) === selectedScannerId);
    if (scanner?.aktuelle_rampe_nummer && rampSelect) rampSelect.value = String(scanner.aktuelle_rampe_nummer);
    if (el('scannerSimInput')) el('scannerSimInput').value = scanner?.sim_nummer || '';
    if (el('scannerPhoneInput')) el('scannerPhoneInput').value = scanner?.telefonnummer || '';
    if (el('scannerProviderInput')) el('scannerProviderInput').value = scanner?.provider || '';
  }
  modal.classList.remove('hidden');
}

function closeScannerAssignmentModal() {
  state.scannerModalOpen = false;
  el('scannerAssignmentModal')?.classList.add('hidden');
  el('scannerAssignmentForm')?.reset();
}

function openScannerCreateModal() {
  state.scannerCreateModalOpen = true;
  const modal = el('scannerCreateModal');
  if (!modal) return;
  const standortSelect = el('scannerCreateStandort');
  if (standortSelect) {
    standortSelect.innerHTML = (state.meta.standorte || []).map((item) => `<option value="${item.id}" ${String(item.id) === String(state.selectedStandortId || item.id) ? 'selected' : ''}>${item.name}</option>`).join('');
  }
  const nextNumber = Math.max(0, ...(state.scanner || []).map((item) => Number(item.nummer) || 0)) + 1;
  if (el('scannerCreateNumber')) el('scannerCreateNumber').value = String(nextNumber);
  if (el('scannerCreateName')) el('scannerCreateName').value = `Scanner ${String(nextNumber).padStart(3, '0')}`;
  el('scannerCreateModal')?.classList.remove('hidden');
}

function closeScannerCreateModal() {
  state.scannerCreateModalOpen = false;
  el('scannerCreateModal')?.classList.add('hidden');
  el('scannerCreateForm')?.reset();
}

async function handleScannerCreateSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  await api('/api/scanner', {
    method: 'POST',
    body: JSON.stringify({
      nummer: Number(form.get('nummer')),
      bezeichnung: String(form.get('bezeichnung') || '').trim(),
      sim_nummer: String(form.get('sim_nummer') || '').trim(),
      telefonnummer: String(form.get('telefonnummer') || '').trim(),
      provider: String(form.get('provider') || '').trim(),
      status: String(form.get('status') || 'verfuegbar').trim(),
      standort_id: Number(form.get('standort_id')),
      notiz: String(form.get('notiz') || '').trim()
    })
  });
  closeScannerCreateModal();
  await refreshApp();
  showView('scanner');
}

async function handleScannerAssignmentSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const scannerId = Number(form.get('scanner_id'));
  await api(`/api/scanner/${scannerId}`, {
    method: 'PUT',
    body: JSON.stringify({
      sim_nummer: String(form.get('sim_nummer') || '').trim(),
      telefonnummer: String(form.get('telefonnummer') || '').trim(),
      provider: String(form.get('provider') || '').trim(),
      notiz: String(form.get('notiz') || '').trim()
    })
  });
  await api('/api/scanner-zuweisungen', {
    method: 'POST',
    body: JSON.stringify({
      scanner_id: scannerId,
      rampe_id: Number(form.get('rampe_id')),
      notiz: String(form.get('notiz') || '').trim()
    })
  });
  closeScannerAssignmentModal();
  await refreshApp();
  showView('scanner');
}

function renderScannerModule() {
  if (!el('scannerAssignmentsTable')) return;
  const scannerRows = state.scanner || [];
  const rampRows = state.rampen || [];
  const assigned = scannerRows.filter((item) => item.aktuelle_rampe_nummer).length;
  const free = scannerRows.length - assigned;
  const occupiedRamps = rampRows.filter((item) => item.scanner_id).length;
  const locationText = state.selectedStandortId
    ? (state.meta.standorte.find((item) => String(item.id) === String(state.selectedStandortId))?.name || 'Standort')
    : 'Alle Standorte';

  el('scannerSummary').innerHTML = `
    <div class="stats-grid scanner-kpi-grid">
      <div class="panel card"><span class="muted">Scanner gesamt</span><strong>${scannerRows.length}</strong></div>
      <div class="panel card"><span class="muted">Aktiv zugeordnet</span><strong>${assigned}</strong></div>
      <div class="panel card"><span class="muted">Frei verfuegbar</span><strong>${free}</strong></div>
      <div class="panel card"><span class="muted">Belegte Rampen</span><strong>${occupiedRamps} / ${rampRows.length}</strong></div>
    </div>
    <div class="panel card scanner-summary-note">
      <strong>${locationText}</strong>
      <span>Beispiel: Scanner 79 bekommt Rampe 12. Die Zuordnung bleibt flexibel und kann jederzeit geaendert werden.</span>
    </div>`;

  el('scannerAssignmentsTable').innerHTML = renderTable(scannerRows, [
    { key: 'nummer', label: 'Scanner', render: (v, row) => `<strong>${row.bezeichnung || `Scanner ${v}`}</strong>` },
    { key: 'sim_nummer', label: 'SIM', render: (v, row) => v ? `${v}${row.provider ? `<br><small class="muted">${row.provider}</small>` : ''}` : '<span class="muted">Nicht hinterlegt</span>' },
    { key: 'telefonnummer', label: 'Telefon', render: (v) => v || '<span class="muted">-</span>' },
    { key: 'standort', label: 'Standort', render: (v) => v || '<span class="muted">-</span>' },
    { key: 'aktuelle_rampe', label: 'Aktuelle Rampe', render: (v) => v && v !== '-' ? `<span class="badge ok">${v}</span>` : '<span class="muted">Nicht zugeordnet</span>' },
    { key: 'zuletzt_zugewiesen_am', label: 'Zuletzt', render: (v) => v || '<span class="muted">-</span>' },
    { key: 'status', label: 'Status', render: (v) => `<span class="${badgeClass(v === 'zugewiesen' ? 'aktiv' : 'nicht_aktiv')}">${v}</span>` },
    { key: 'id', label: 'Aktion', render: (v) => {
      const assignment = (state.scannerAssignments || []).find((item) => Number(item.scanner_id) === Number(v));
      return `<div class="action-row"><button class="secondary" data-action="scanner-assign" data-id="${v}">Zuordnen</button>${assignment ? `<button class="secondary" data-action="scanner-release" data-id="${assignment.id}">Loesen</button>` : ''}</div>`;
    } }
  ]);

  el('rampenTable').innerHTML = renderTable(rampRows, [
    { key: 'nummer', label: 'Rampe', render: (v) => `<strong>${rampLabel(v)}</strong>` },
    { key: 'scanner_label', label: 'Scanner', render: (v, row) => row.scanner_id ? `<span>${v}</span><br><small class="muted">Nr. ${row.scanner_nummer}</small>` : '<span class="muted">Frei</span>' },
    { key: 'standort', label: 'Standort', render: (v) => v || '<span class="muted">-</span>' },
    { key: 'status', label: 'Status', render: (v, row) => `<span class="${badgeClass(row.scanner_id ? 'aktiv' : 'pruefung')}">${row.scanner_id ? 'belegt' : 'frei'}</span>` },
    { key: 'id', label: 'Aktion', render: (v) => {
      const assignment = (state.scannerAssignments || []).find((item) => Number(item.rampe_id) === Number(v));
      return `<div class="action-row"><button class="secondary" data-action="scanner-ramp-assign" data-id="${v}">Zuweisen</button>${assignment ? `<button class="secondary" data-action="scanner-release" data-id="${assignment.id}">Loesen</button>` : ''}</div>`;
    } }
  ]);
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

function daysUntil(dateString) {
  if (!dateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  if (Number.isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function formatShortDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('de-DE');
}

function licenseHeldText(value) {
  if (!value) return '-';
  const start = new Date(value);
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
  if (years === 0) return `${months} Mon.`;
  if (months === 0) return `${years} J.`;
  return `${years} J. ${months} Mon.`;
}

function previewDueTone(days) {
  if (days === null) return 'ok';
  if (days < 0) return 'danger';
  if (days <= 14) return 'warn';
  return 'ok';
}

function renderPreviewPanel() {
  const root = el('previewPanel');
  if (!root) return;

  const dueVehicles = [...(state.fahrzeuge || [])]
    .map((item) => {
      const huDays = daysUntil(item.hu_datum);
      const uvvDays = daysUntil(item.uvv_datum);
      const nextDays = [huDays, uvvDays].filter((value) => value !== null).sort((a, b) => a - b)[0] ?? null;
      return { ...item, huDays, uvvDays, nextDays };
    })
    .filter((item) => item.nextDays !== null)
    .sort((a, b) => a.nextDays - b.nextDays)
    .slice(0, 4);

  const userOptions = (state.benutzer || []).filter((item) => Number(item.aktiv) === 1).slice(0, 4);
  const ownerText = userOptions.length
    ? userOptions.map((item) => `${item.name} (${item.rolle})`).join(', ')
    : 'Verantwortliche koennen spaeter je Fahrzeug oder Standort gepflegt werden.';

  const totalOpen = (state.werkstatt || []).filter((item) => item.status !== 'abgeschlossen').length;
  const damageOpen = (state.schaeden || []).filter((item) => item.status !== 'abgeschlossen').length;
  const huWarn = dueVehicles.filter((item) => item.huDays !== null && item.huDays <= 30).length;
  const uvvWarn = dueVehicles.filter((item) => item.uvvDays !== null && item.uvvDays <= 30).length;

  root.innerHTML = `
    <div class="section-head preview-head">
      <div>
        <h3>Erweiterungsvorschau</h3>
        <p class="muted">Nur als zusaetzlicher Blick nach vorn. Alles Bestehende bleibt unveraendert.</p>
      </div>
      <span class="preview-badge">Additiv</span>
    </div>
    <div class="preview-grid">
      <div class="preview-card">
        <span class="preview-eyebrow">Fristen-Cockpit</span>
        <strong>Naechste Faelligkeiten</strong>
        <div class="preview-list">
          ${dueVehicles.length ? dueVehicles.map((item) => `
            <div class="preview-item">
              <div>
                <strong>${item.kennzeichen}</strong>
                <span>${item.fahrzeug}</span>
              </div>
              <div class="preview-tags">
                <span class="badge ${previewDueTone(item.huDays)}">HU ${item.huDays ?? '-'} Tg</span>
                <span class="badge ${previewDueTone(item.uvvDays)}">UVV ${item.uvvDays ?? '-'} Tg</span>
              </div>
            </div>
          `).join('') : '<p class="muted">Noch keine Fristen zur Vorschau vorhanden.</p>'}
        </div>
      </div>
      <div class="preview-card">
        <span class="preview-eyebrow">Verantwortung</span>
        <strong>Zustaendige im Blick</strong>
        <div class="preview-list">
          <div class="preview-item preview-item-stack">
            <span>${ownerText}</span>
          </div>
          <div class="preview-metrics">
            <div><span>HU bald faellig</span><strong>${huWarn}</strong></div>
            <div><span>UVV bald faellig</span><strong>${uvvWarn}</strong></div>
          </div>
        </div>
      </div>
      <div class="preview-card">
        <span class="preview-eyebrow">Arbeitsvorrat</span>
        <strong>Was spaeter hervorgehoben werden koennte</strong>
        <div class="preview-metrics">
          <div><span>Werkstatt offen</span><strong>${totalOpen}</strong></div>
          <div><span>Schaeden offen</span><strong>${damageOpen}</strong></div>
          <div><span>Fahrzeuge gesamt</span><strong>${state.fahrzeuge?.length || 0}</strong></div>
        </div>
        <p class="muted">Diese Vorschau nutzt nur vorhandene Daten und zeigt, wie ein spaeterer Zusatzblock aussehen koennte.</p>
      </div>
    </div>
  `;
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
  renderPreviewPanel();
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

function workshopDaysSince(dateString) {
  const start = startOfDay(dateString);
  const today = startOfDay(new Date());
  if (!start || !today) return null;
  return Math.round((today - start) / 86400000);
}

function workshopDueState(entry) {
  const end = startOfDay(entry.datum_bis);
  const today = startOfDay(new Date());
  if (!end || !today || entry.status === 'abgeschlossen') return 'ok';
  if (end < today) return 'danger';
  const days = Math.round((end - today) / 86400000);
  return days <= 2 ? 'warn' : 'ok';
}

function workshopStatusBuckets() {
  const source = state.werkstatt || [];
  const activeRows = source.filter((item) => item.status !== 'abgeschlossen');
  const isCritical = (item) => workshopDueState(item) !== 'ok';
  const isInProgress = (item) => ['in_bearbeitung', 'werkstatt', 'zur_pruefung'].includes(item.status);
  return [
    { key: 'offen', label: 'Offen', rows: source.filter((item) => item.status === 'offen') },
    { key: 'in_bearbeitung', label: 'In Bearbeitung', rows: activeRows.filter((item) => isInProgress(item) && !isCritical(item)) },
    { key: 'kritisch', label: 'Kritisch', rows: activeRows.filter((item) => isCritical(item)) },
    { key: 'abgeschlossen', label: 'Abgeschlossen', rows: source.filter((item) => item.status === 'abgeschlossen') }
  ];
}

function filteredWorkshopRows() {
  const rows = state.werkstatt || [];
  const filter = state.workshopOverviewFilter || 'all';
  const filtered = filter === 'all'
    ? rows
    : filter === 'kritisch'
      ? rows.filter((item) => item.status !== 'abgeschlossen' && workshopDueState(item) !== 'ok')
      : rows.filter((item) => item.status === filter);

  return [...filtered].sort((a, b) => {
    const aDate = new Date(a.created_at || a.status_datum || a.datum_von || 0).getTime();
    const bDate = new Date(b.created_at || b.status_datum || b.datum_von || 0).getTime();
    return bDate - aDate;
  });
}

function renderWorkshopOverview() {
  const root = el('workshopOverview');
  if (!root) return;

  const rows = state.werkstatt || [];
  const canManage = state.user && state.user.rolle !== 'benutzer';
  const activeRows = [...rows]
    .filter((item) => item.status !== 'abgeschlossen')
    .sort((a, b) => new Date(b.created_at || b.status_datum || b.datum_von || 0).getTime() - new Date(a.created_at || a.status_datum || a.datum_von || 0).getTime());
  const overdueRows = activeRows.filter((item) => workshopDueState(item) === 'danger');
  const inProgressRows = rows.filter((item) => ['in_bearbeitung', 'werkstatt', 'zur_pruefung'].includes(item.status));
  const slots = workshopAreaGroups().flatMap((group) => group.areas.map((area) => ({
    ...area,
    standort_name: group.standort?.name || '-'
  })));
  const slotCards = slots.slice(0, isWorkshopOverallView() ? 12 : 9).map((area) => {
    const sameStandort = activeRows.filter((item) => String(item.standort || '') === String(area.standort_name || ''));
    const exactNameMatches = sameStandort.filter((item) => String(item.werkstatt_name || '').trim().toLowerCase() === String(area.name || '').trim().toLowerCase());
    const slotMatches = sameStandort.filter((item) => Number(item.workshop_slot) === Number(area.slot));
    const entries = exactNameMatches.length ? exactNameMatches : slotMatches;
    return {
      area,
      entries
    };
  });
  const buckets = workshopStatusBuckets();

  root.innerHTML = `
    <div class="workshop-overview-shell">
      <div class="workshop-overview-kpis">
        <div class="workshop-kpi-card">
          <span>Offene Auftraege</span>
          <strong>${activeRows.length}</strong>
          <small>Alles ausser abgeschlossen</small>
        </div>
        <div class="workshop-kpi-card">
          <span>In Bearbeitung</span>
          <strong>${inProgressRows.length}</strong>
          <small>Aktive Werkstattfaelle</small>
        </div>
        <div class="workshop-kpi-card workshop-kpi-card-warn">
          <span>Ueberfaellig</span>
          <strong>${overdueRows.length}</strong>
          <small>Bis-Datum ueberschritten</small>
        </div>
        <div class="workshop-kpi-card">
          <span>Werkstattplaetze</span>
          <strong>${slotCards.filter((item) => item.entries.length).length}/${slotCards.length}</strong>
          <small>Belegte Plaetze</small>
        </div>
      </div>
      <section class="workshop-status-board">
        <div class="section-head">
          <h4>Status-Uebersicht</h4>
          <span class="muted">Schneller Blick auf den Arbeitsstand</span>
        </div>
        <div class="workshop-status-columns">
          ${buckets.map((bucket) => `
            <div class="workshop-status-column ${state.workshopOverviewFilter === bucket.key ? 'active' : ''}" data-action="workshop-filter" data-filter="${bucket.key}">
              <div class="workshop-status-column-head">
                <strong>${bucket.label}</strong>
                <span>${bucket.rows.length}</span>
              </div>
              <div class="workshop-status-column-list">
                ${bucket.rows.length ? bucket.rows.slice(0, 5).map((row) => {
                  const days = workshopDaysSince(row.datum_von);
                  const dueState = workshopDueState(row);
                  return `
                    <article class="workshop-status-item ${dueState}">
                      <div class="workshop-status-item-head">
                        <strong>${row.kennzeichen}</strong>
                        <span class="${badgeClass(row.status)}">${row.status}</span>
                      </div>
                      <div class="workshop-status-item-copy">${row.problem || row.beschreibung || 'Kein Thema hinterlegt.'}</div>
                      <small>${row.werkstatt_name || workshopAreaDisplayName(row.standort_id, row.workshop_slot)}${days !== null ? ` | seit ${days} Tagen` : ''}</small>
                    </article>
                  `;
                }).join('') : '<p class="muted">Keine Eintraege.</p>'}
              </div>
            </div>
          `).join('')}
        </div>
      </section>
      <section class="workshop-slot-board">
        <div class="section-head">
          <h4>Plaetze und Belegung</h4>
          <span class="muted">Welche Werkstattplaetze gerade belegt sind</span>
        </div>
        <div class="workshop-slot-grid">
          ${slotCards.map(({ area, entries }) => `
            <article class="workshop-slot-card ${entries.length ? 'occupied' : 'free'}" data-action="workshop-slot" data-id="${entries[0]?.id || ''}" data-filter="${entries[0] ? entries[0].status : 'all'}">
              <div class="workshop-slot-head">
                ${String(state.editingWorkshopAreaId) === String(area.id) ? `
                  <div class="workshop-slot-edit">
                    <input data-action="workshop-area-name" data-id="${area.id}" value="${area.name || `Werkstatt ${area.slot}`}" placeholder="Werkstattname">
                    <div class="action-row">
                      <button type="button" class="secondary" data-action="workshop-area-save" data-id="${area.id}">Speichern</button>
                      <button type="button" class="secondary" data-action="workshop-area-cancel">Abbrechen</button>
                    </div>
                  </div>
                ` : `
                  <strong>${area.name || `Werkstatt ${area.slot}`}</strong>
                  <span>${area.standort_name}</span>
                  ${canManage ? `<button type="button" class="secondary workshop-slot-edit-btn" data-action="workshop-area-edit" data-id="${area.id}">Name aendern</button>` : ''}
                `}
              </div>
              ${entries.length ? `
                <div class="workshop-slot-stack">
                  ${entries.map((entry) => `
                    <div class="workshop-slot-entry" data-action="workshop-slot" data-id="${entry.id}" data-filter="${entry.status}">
                      <div class="workshop-slot-main">
                        <strong>${entry.kennzeichen}</strong>
                        <span>${entry.problem || entry.beschreibung || 'Ohne Beschreibung'}</span>
                      </div>
                      <div class="workshop-slot-meta">
                        <span class="${badgeClass(entry.status)}">${entry.status}</span>
                        <small>${entry.datum_bis ? `bis ${entry.datum_bis}` : 'ohne Enddatum'}</small>
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div class="workshop-slot-empty">
                  <strong>Frei</strong>
                  <span>Der Platz ist aktuell nicht belegt.</span>
                </div>
              `}
            </article>
          `).join('')}
        </div>
      </section>
    </div>
  `;
}

function renderInventoryModule() {
  if (!el('lagerForm')) return;
  const locationOptions = (state.lagerorte || []).map((item) => `<option value="${item.id}">${item.name}${item.standort ? ` | ${item.standort}` : ''}</option>`).join('');
  const lowStock = (state.lagerartikel || []).filter((item) => Number(item.bestand || 0) <= Number(item.mindestbestand || 0)).length;
  el('lagerForm').innerHTML = `
    <div class="form-grid">
      <form id="lagerortForm" class="form-grid sub-panel">
        <h4>Lagerort anlegen</h4>
        <label>Name<input name="name" required placeholder="z. B. Hauptlager"></label>
        <label>Typ<input name="typ" placeholder="z. B. hauptlager"></label>
        <button type="submit">Lagerort speichern</button>
      </form>
      <form id="lagerartikelForm" class="form-grid sub-panel">
        <h4>Lagerartikel anlegen</h4>
        <label>Lagerort<select name="lagerort_id" required>${locationOptions}</select></label>
        <label>Name<input name="name" required placeholder="z. B. Bremsbelag"></label>
        <label>Artikelnummer<input name="artikelnummer"></label>
        <label>Bestand<input name="bestand" type="number" step="1" value="0"></label>
        <label>Mindestbestand<input name="mindestbestand" type="number" step="1" value="0"></label>
        <label>Einheit<input name="einheit" value="Stk"></label>
        <button type="submit">Artikel speichern</button>
      </form>
      <form id="lagerbewegungForm" class="form-grid sub-panel">
        <h4>Bestandsbewegung buchen</h4>
        <label>Artikel<select name="lagerartikel_id" required>${(state.lagerartikel || []).map((item) => `<option value="${item.id}">${item.name} (${item.bestand} ${item.einheit || 'Stk'})</option>`).join('')}</select></label>
        <label>Typ<select name="typ"><option value="ein">Zugang</option><option value="aus">Entnahme</option></select></label>
        <label>Menge<input name="menge" type="number" step="1" min="1" value="1"></label>
        <label>Referenz<input name="referenz" placeholder="Werkstatt, Auftrag, Lieferung"></label>
        <button type="submit">Bewegung buchen</button>
      </form>
    </div>`;
  el('lagerSummary').innerHTML = miniCards([
    ['Lagerorte', state.lagerorte?.length || 0],
    ['Artikel', state.lagerartikel?.length || 0],
    ['Bewegungen', state.lagerbewegungen?.length || 0],
    ['Mindestbestand', lowStock]
  ]);
  el('lagerorteTable').innerHTML = renderTable(state.lagerorte || [], [
    { key: 'name', label: 'Lagerort' },
    { key: 'standort', label: 'Standort' },
    { key: 'typ', label: 'Typ' },
    { key: 'id', label: 'Aktion', render: (v) => `<div class="action-row"><button class="secondary" data-action="lagerort-edit" data-id="${v}">Bearbeiten</button><button class="secondary" data-action="lagerort-delete" data-id="${v}">Loeschen</button></div>` }
  ]);
  el('lagerartikelTable').innerHTML = renderTable(state.lagerartikel || [], [
    { key: 'name', label: 'Artikel' },
    { key: 'artikelnummer', label: 'Nummer' },
    { key: 'lagerort_name', label: 'Lagerort' },
    { key: 'bestand', label: 'Bestand', render: (v, row) => `${v} ${row.einheit || 'Stk'}` },
    { key: 'mindestbestand', label: 'Min.' },
    { key: 'id', label: 'Aktion', render: (v) => `<div class="action-row"><button class="secondary" data-action="lagerartikel-edit" data-id="${v}">Bearbeiten</button><button class="secondary" data-action="lagerartikel-delete" data-id="${v}">Loeschen</button></div>` }
  ]);
  el('lagerbewegungenTable').innerHTML = renderTable(state.lagerbewegungen || [], [
    { key: 'created_at', label: 'Datum', render: (v) => String(v || '').slice(0, 10) },
    { key: 'artikel', label: 'Artikel' },
    { key: 'typ', label: 'Typ' },
    { key: 'menge', label: 'Menge' },
    { key: 'referenz', label: 'Referenz' }
  ]);
}

async function handleLagerortSubmit(event) {
  event.preventDefault();
  await api('/api/lagerorte', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
  await refreshApp();
}

async function handleLagerartikelSubmit(event) {
  event.preventDefault();
  await api('/api/lagerartikel', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
  await refreshApp();
}

async function handleLagerbewegungSubmit(event) {
  event.preventDefault();
  await api('/api/lagerbewegungen', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
  await refreshApp();
}

function startOfDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatCalendarGroupLabel(date) {
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  });
}

function formatCalendarMonthTitle(date) {
  return date.toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric'
  });
}

function calendarEventTone(type) {
  return ({
    hu: 'hu',
    uvv: 'uvv',
    werkstatt: 'werkstatt',
    schaden: 'schaden',
    allgemein: 'allgemein'
  })[type] || 'allgemein';
}

function calendarEventLabel(type) {
  return ({
    hu: 'HU',
    uvv: 'UVV',
    werkstatt: 'Werkstatt',
    schaden: 'Schaden',
    allgemein: 'Termin'
  })[type] || 'Termin';
}

function describeCalendarEvent(event) {
  const bits = [];
  const vehicle = state.fahrzeuge.find((item) => Number(item.id) === Number(event.fahrzeug_id));
  if (vehicle) bits.push(`${vehicle.kennzeichen} - ${vehicle.fahrzeug}`);
  if (event.typ === 'hu' && vehicle) bits.push('Hauptuntersuchung');
  if (event.typ === 'uvv' && vehicle) bits.push('UVV-Pruefung');
  if (event.typ === 'werkstatt' && event.problem) bits.push(event.problem);
  if (event.beschreibung) bits.push(event.beschreibung);
  return bits.filter(Boolean).join(' | ');
}

function calendarStatusBuckets(events, today) {
  return [
    {
      key: 'heute',
      label: 'Heute',
      rows: events.filter((event) => event._date.getTime() === today.getTime())
    },
    {
      key: 'naechste7',
      label: 'Naechste 7 Tage',
      rows: events.filter((event) => {
        const diff = Math.round((event._date - today) / 86400000);
        return diff >= 1 && diff <= 7;
      })
    },
    {
      key: 'spaeter',
      label: 'Spaeter',
      rows: events.filter((event) => event._date > today && Math.round((event._date - today) / 86400000) > 7)
    },
    {
      key: 'vergangen',
      label: 'Vergangen',
      rows: events.filter((event) => event._date < today)
    }
  ];
}

function calendarMonthBuckets(events) {
  return [
    { key: 'hu', label: 'HU', rows: events.filter((event) => event.typ === 'hu') },
    { key: 'uvv', label: 'UVV', rows: events.filter((event) => event.typ === 'uvv') },
    { key: 'werkstatt', label: 'Werkstatt', rows: events.filter((event) => event.typ === 'werkstatt') },
    { key: 'allgemein', label: 'Sonstige', rows: events.filter((event) => !['hu', 'uvv', 'werkstatt'].includes(event.typ)) }
  ];
}

function renderCalendar() {
  const root = el('kalenderGrid');
  const kpiRoot = el('calendarKpis');
  if (!root || !kpiRoot) return;
  
  if (!state.user || state.user.rolle === 'benutzer') {
    root.innerHTML = '<p class="muted">Kein Zugriff auf den Kalender.</p>';
    return;
  }

  const baseDate = new Date(state.calendarBaseDate);
  const monthStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const monthEnd = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  monthStart.setHours(0, 0, 0, 0);
  monthEnd.setHours(23, 59, 59, 999);
  
  const calendarTitle = el('calendarRangeLabel');
  if (calendarTitle) calendarTitle.textContent = formatCalendarMonthTitle(baseDate);

  const allEvents = [...(state.kalenderEvents || []), ...autoEvents()];
  
  const monthEvents = allEvents.filter(e => {
    const d = startOfDay(e.start_datum || e.date);
    if (!d) return false;
    return d >= monthStart && d <= monthEnd;
  });

  const kpiStats = [
    { label: 'Termine gesamt', value: monthEvents.length, tone: '1' },
    { label: 'HU Termine', value: monthEvents.filter(e => e.typ === 'hu').length, tone: '2' },
    { label: 'UVV Termine', value: monthEvents.filter(e => e.typ === 'uvv').length, tone: '3' },
    { label: 'Werkstatt', value: monthEvents.filter(e => e.typ === 'werkstatt').length, tone: '4' },
    { label: 'Sonstige', value: monthEvents.filter(e => e.typ === 'allgemein' || e.typ === 'schaden').length, tone: '5' }
  ];

  kpiRoot.innerHTML = kpiStats.map(s => `
    <div class="stat-card stat-card-${s.tone}">
      <span>${s.label}</span>
      <strong>${s.value}</strong>
      <small>Im aktuellen Monat</small>
    </div>
  `).join('');

  const today = startOfDay(new Date());
  const nextSevenDays = new Date(today);
  nextSevenDays.setDate(nextSevenDays.getDate() + 6);
  
  const sortedEvents = allEvents
    .map((event) => ({ ...event, _date: startOfDay(event.start_datum || event.date) }))
    .filter((event) => event._date && event._date >= monthStart && event._date <= monthEnd)
    .sort((a, b) => a._date - b._date || String(a.titel || a.label || '').localeCompare(String(b.titel || b.label || '')));

  if (!sortedEvents.length) {
    root.innerHTML = '<p class="muted center-text" style="padding: 40px;">Keine Termine in diesem Zeitraum gefunden.</p>';
    return;
  }

  const nextItems = sortedEvents.filter((event) => event._date >= today && event._date <= nextSevenDays).slice(0, 6);
  const buckets = calendarStatusBuckets(sortedEvents, today);
  const monthBuckets = calendarMonthBuckets(sortedEvents);

  root.innerHTML = `
    <div class="calendar-shell calendar-shell-compact">
      <section class="calendar-status-board">
        <div class="section-head">
          <h4>Status-Uebersicht</h4>
          <span class="muted">Schneller Blick auf alle Termine</span>
        </div>
        <div class="calendar-status-columns">
          ${buckets.map((bucket) => `
            <div class="calendar-status-column">
              <div class="calendar-status-column-head">
                <strong>${bucket.label}</strong>
                <span>${bucket.rows.length}</span>
              </div>
              <div class="calendar-status-column-list">
                ${bucket.rows.length ? bucket.rows.slice(0, 4).map((event) => `
                  <article class="calendar-status-item ${calendarEventTone(event.typ)} ${event._date.getTime() === today.getTime() ? 'is-today' : ''}">
                    <div class="calendar-status-item-head">
                      <strong>${event.titel || event.label}</strong>
                      <span class="calendar-type-chip ${calendarEventTone(event.typ)}">${calendarEventLabel(event.typ)}</span>
                    </div>
                    <div class="calendar-status-item-copy">${describeCalendarEvent(event) || 'Kein weiterer Hinweis hinterlegt.'}</div>
                    <small>${event._date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</small>
                  </article>
                `).join('') : '<p class="muted">Keine Eintraege.</p>'}
              </div>
            </div>
          `).join('')}
        </div>
      </section>

      <section class="calendar-slot-board">
        <div class="section-head">
          <h4>Naechste Termine</h4>
          <span class="muted">Die wichtigsten Termine im Blick</span>
        </div>
        <div class="calendar-overview-strip">
          ${nextItems.length ? nextItems.map((event) => {
            const iso = event._date.toISOString().slice(0, 10);
            const isToday = iso === today.toISOString().slice(0, 10);
            return `
              <div class="calendar-overview-card ${calendarEventTone(event.typ)} ${isToday ? 'is-today' : ''}">
                <span>${isToday ? 'Heute' : event._date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
                <strong>${event.titel || event.label}</strong>
                <small>${describeCalendarEvent(event) || calendarEventLabel(event.typ)}</small>
              </div>
            `;
          }).join('') : '<div class="calendar-overview-empty muted">Keine anstehenden Termine in den naechsten 7 Tagen.</div>'}
        </div>
      </section>

      <section class="calendar-status-board">
        <div class="section-head">
          <h4>Bereiche</h4>
          <span class="muted">${formatCalendarMonthTitle(baseDate)}</span>
        </div>
        <div class="calendar-status-columns">
          ${monthBuckets.map((bucket) => {
            return `
              <div class="calendar-status-column">
                <div class="calendar-status-column-head">
                  <strong>${bucket.label}</strong>
                  <span>${bucket.rows.length}</span>
                </div>
                <div class="calendar-status-column-list">
                  ${bucket.rows.length ? bucket.rows.slice(0, 8).map((e) => `
                    <article class="calendar-status-item ${calendarEventTone(e.typ)} ${e._date.getTime() === today.getTime() ? 'is-today' : ''}" data-action="edit-calendar-event" data-id="${e.id}" data-manual="${!String(e.id).includes('_')}">
                      <div class="calendar-status-item-head">
                        <strong>${e.titel || e.label}</strong>
                        <span class="calendar-type-chip ${calendarEventTone(e.typ)}">${calendarEventLabel(e.typ)}</span>
                      </div>
                      <div class="calendar-status-item-copy">${describeCalendarEvent(e) || 'Kein weiterer Hinweis hinterlegt.'}</div>
                      <small>${e._date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}</small>
                    </article>
                  `).join('') : '<p class="muted">Keine Eintraege.</p>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </section>

      <section class="calendar-status-board">
        <div class="section-head">
          <h4>Alle Termine</h4>
          <span class="muted">Neueste und naechste Termine kompakt</span>
        </div>
        <div class="calendar-list-compact">
          ${sortedEvents.map((e) => `
            <article class="calendar-list-item ${calendarEventTone(e.typ)}" data-action="edit-calendar-event" data-id="${e.id}" data-manual="${!String(e.id).includes('_')}">
              <div class="calendar-list-date">
                <strong>${e._date.getDate()}</strong>
                <span>${e._date.toLocaleDateString('de-DE', { month: 'short' })}</span>
              </div>
              <div class="calendar-list-main">
                <div class="calendar-status-item-head">
                  <strong>${e.titel || e.label}</strong>
                  <span class="calendar-type-chip ${calendarEventTone(e.typ)}">${calendarEventLabel(e.typ)}</span>
                </div>
                <div class="calendar-status-item-copy">${describeCalendarEvent(e) || 'Kein weiterer Hinweis hinterlegt.'}</div>
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    </div>
  `;

  root.querySelectorAll('[data-action="edit-calendar-event"]').forEach(item => {
    item.onclick = () => {
      const id = item.dataset.id;
      if (item.dataset.manual === 'true') {
        const event = state.kalenderEvents.find(ev => String(ev.id) === String(id));
        if (event) openEventModal(event);
      }
    };
  });
}

function autoEvents() {
  const list = [];
  state.fahrzeuge.forEach(v => {
    if (v.hu_datum) list.push({ id: `hu_${v.id}`, titel: `HU: ${v.kennzeichen}`, start_datum: v.hu_datum, typ: 'hu', fahrzeug_id: v.id });
    if (v.uvv_datum) list.push({ id: `uvv_${v.id}`, titel: `UVV: ${v.kennzeichen}`, start_datum: v.uvv_datum, typ: 'uvv', fahrzeug_id: v.id });
  });
  state.werkstatt.forEach(w => {
    if (w.status === 'abgeschlossen') return;
    const v = state.fahrzeuge.find(f => f.id === w.fahrzeug_id);
    if (v) list.push({ id: `w_${w.id}`, titel: `W: ${v.kennzeichen}`, start_datum: w.datum_von, typ: 'werkstatt', fahrzeug_id: v.id, problem: w.problem });
  });
  return list;
}

function openEventModal(event) {
  const modal = el('eventModal');
  const form = el('eventForm');
  const deleteBtn = el('deleteEventBtn');
  const select = el('eventVehicleSelect');
  if (!modal || !form) return;
  
  form.reset();
  form.id.value = event.id || '';
  form.titel.value = event.titel || '';
  form.beschreibung.value = event.beschreibung || '';
  form.start_datum.value = event.start_datum || '';
  form.typ.value = event.typ || 'allgemein';
  
  // Fahrzeug Select befüllen
  select.innerHTML = '<option value="">-- Kein Fahrzeug --</option>' + 
    state.fahrzeuge.map(v => `<option value="${v.id}" ${Number(event.fahrzeug_id) === v.id ? 'selected' : ''}>${v.kennzeichen} - ${v.fahrzeug}</option>`).join('');
  
  if (event.id) {
    el('eventModalTitle').textContent = 'Termin bearbeiten';
    deleteBtn.classList.remove('hidden');
  } else {
    el('eventModalTitle').textContent = 'Neuer Termin';
    deleteBtn.classList.add('hidden');
  }
  
  modal.classList.remove('hidden');
}

async function handleEventSubmit(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());
  
  try {
    await api('/api/kalender-events', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    el('eventModal').classList.add('hidden');
    await refreshApp();
  } catch (err) {
    alert('Fehler beim Speichern: ' + err.message);
  }
}

async function deleteEvent(id) {
  if (!confirm('Diesen Termin wirklich loeschen?')) return;
  try {
    await api(`/api/kalender-events/${id}`, { method: 'DELETE' });
    el('eventModal').classList.add('hidden');
    await refreshApp();
  } catch (err) {
    alert('Fehler beim Loeschen: ' + err.message);
  }
}

function openAppointmentModal(vehicleId, vehicleName, date) {
  const modal = el('appointmentModal');
  const form = el('appointmentForm');
  const select = el('appointmentVehicleSelect');
  if (!modal || !form || !select) return;

  // Fahrzeug-Select befüllen
  select.innerHTML = state.fahrzeuge.map(v => `<option value="${v.id}" ${Number(vehicleId) === v.id ? 'selected' : ''}>${v.kennzeichen} - ${v.fahrzeug}</option>`).join('');

  form.datum_von.value = date;
  form.datum_bis.value = date;
  
  modal.classList.remove('hidden');
}

async function handleAppointmentSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const type = formData.get('type');
  const vehicleId = Number(formData.get('fahrzeug_id'));
  
  try {
    if (type === 'werkstatt') {
      await api('/api/werkstatt', {
        method: 'POST',
        body: JSON.stringify({
          fahrzeug_id: vehicleId,
          datum_von: formData.get('datum_von'),
          datum_bis: formData.get('datum_bis'),
          problem: formData.get('problem'),
          status: 'offen'
        })
      });
    } else if (type === 'hu' || type === 'uvv') {
      // Fahrzeug-Stammdaten aktualisieren
      const field = type === 'hu' ? 'hu_datum' : 'uvv_datum';
      await api(`/api/fahrzeuge/${vehicleId}`, {
        method: 'PUT',
        body: JSON.stringify({ [field]: formData.get('datum_von') })
      });
    }
    
    el('appointmentModal').classList.add('hidden');
    await refreshApp();
  } catch (error) {
    alert('Fehler beim Speichern: ' + error.message);
  }
}

function renderNotifications() {
  const urgentRoot = el('urgentAlerts');
  const workshopRoot = el('workshopAlerts');
  if (!urgentRoot || !workshopRoot) return;

  const urgentList = [];
  state.fahrzeuge.forEach((v) => {
    if (v.hu_in_tagen !== null && v.hu_in_tagen < 30) {
      urgentList.push({ type: 'hu', vehicle: v, days: v.hu_in_tagen });
    }
    if (v.uvv_in_tagen !== null && v.uvv_in_tagen < 30) {
      urgentList.push({ type: 'uvv', vehicle: v, days: v.uvv_in_tagen });
    }
  });

  urgentRoot.innerHTML = urgentList.length ? urgentList.map((item) => `
    <div class="alert-item ${item.days < 0 ? 'overdue' : 'urgent'}">
      <div class="alert-head">
        <strong>${item.vehicle.kennzeichen}</strong>
        <span class="badge ${item.days < 0 ? 'danger' : 'warn'}">${item.type.toUpperCase()}</span>
      </div>
      <p>${item.days < 0 ? 'Bereits ueberfaellig!' : `Faellig in ${item.days} Tagen`}</p>
    </div>
  `).join('') : '<p class="muted">Keine dringenden Termine.</p>';

  const workshopList = state.werkstatt.filter(w => w.status !== 'abgeschlossen' && w.datum_bis && new Date(w.datum_bis) < new Date());
  workshopRoot.innerHTML = workshopList.length ? workshopList.map((item) => `
    <div class="alert-item overdue">
      <div class="alert-head">
        <strong>${item.kennzeichen}</strong>
        <span class="badge warn">${item.status}</span>
      </div>
      <p>Geplantes Ende (${item.datum_bis}) ueberschritten.</p>
    </div>
  `).join('') : '<p class="muted">Keine Werkstatt-Hinweise.</p>';

  const scannerList = (state.systemNotifications || []).filter((item) => item.modul === 'scanner').slice(0, 5);
  if (scannerList.length) {
    urgentRoot.innerHTML += scannerList.map((item) => `
      <div class="alert-item scanner-alert">
        <div class="alert-head">
          <strong>${item.titel}</strong>
          <span class="badge">${item.typ}</span>
        </div>
        <p>${item.text}</p>
      </div>
    `).join('');
  }

  const total = urgentList.length + workshopList.length + scannerList.length;
  const badge = el('notificationBadge');
  if (badge) {
    badge.textContent = total;
    badge.className = total > 0 ? 'badge danger' : 'badge danger hidden';
  }
}

function renderReinigung() {
  if (!el('reinigungAktuellTable')) return;
  if (el('reinigungDatum')) el('reinigungDatum').value = state.reinigung?.datum || new Date().toISOString().slice(0, 10);
  if (el('reinigungTag')) el('reinigungTag').value = state.reinigung?.reinigungstag || '1';

  const canManageCleaning = state.user && state.user.rolle !== 'benutzer';
  const aktuelle = state.reinigung?.aktuelle || [];
  const erledigt = state.reinigung?.gereinigt || [];
  const werkstatt = state.reinigung?.werkstatt || [];

  el('reinigungAktuellTable').innerHTML = renderTable(aktuelle, [
    { key: 'kennzeichen', label: 'Kennzeichen' },
    { key: 'fahrzeug', label: 'Fahrzeug' },
    { key: 'standort', label: 'Standort' },
    { key: 'gereinigt', label: 'Wurde gereinigt', render: (v, row) => canManageCleaning ? `<input type="checkbox" data-action="reinigung-toggle" data-id="${row.fahrzeug_id}" ${v ? 'checked' : ''}>` : (v ? 'Ja' : 'Nein') },
    { key: 'gereinigt_am', label: 'Datum', render: (v) => v || '-' }
  ]);

  el('reinigungErledigtTable').innerHTML = renderTable(erledigt, [
    { key: 'kennzeichen', label: 'Kennzeichen' },
    { key: 'fahrzeug', label: 'Fahrzeug' },
    { key: 'gereinigt_am', label: 'Datum' },
    { key: 'reinigungstag', label: 'Tag', render: (v) => `Tag ${v}` },
    { key: 'bearbeitet_von', label: 'Bearbeitet von' }
  ]);

  el('reinigungWerkstattTable').innerHTML = renderTable(werkstatt, [
    { key: 'kennzeichen', label: 'Kennzeichen' },
    { key: 'fahrzeug', label: 'Fahrzeug' },
    { key: 'werkstatt_name', label: 'Werkstatt' },
    { key: 'datum_von', label: 'Seit' },
    { key: 'status', label: 'Status', render: (v) => `<span class="${badgeClass(v)}">${v || '-'}</span>` },
    { key: 'hinweis', label: 'Hinweis' }
  ]);
}

function renderLists() {
  const canManage = state.user && state.user.rolle !== 'benutzer';

  el('vehiclesTable').innerHTML = renderTable(state.fahrzeuge, [
    { key: 'kennzeichen', label: 'Kennzeichen', render: (v, row) => `<button class="vehicle-link-btn" data-action="vehicle-open" data-id="${row.id}">${v || '-'}</button>${String(state.editVehicleId) === String(row.id) ? '<br><span class="muted">Wird gerade bearbeitet</span>' : ''}` },
    { key: 'fahrzeug', label: 'Modell' },
    { key: 'fin', label: 'FIN', render: (v) => `<small class="code-font">${v || '-'}</small>` },
    { key: 'radiocode', label: 'Radiocode', render: (v) => `<small class="code-font">${v || '-'}</small>` },
    { key: 'tankkarten_vorhanden', label: 'Tankkarten', render: (v) => v ? '<span class="badge success">Ja</span>' : '<span class="badge muted">Nein</span>' },
    { key: 'standort', label: 'Standort' },
    { key: 'status', label: 'Status', render: (v) => `<span class="${badgeClass(v)}">${v}</span>` },
    { key: 'hu_datum', label: 'HU' },
    { key: 'uvv_datum', label: 'UVV' },
    { key: 'fahrzeugschein_pdf', label: 'Fahrzeugschein', render: (v) => v ? `<a class="secondary-link" href="${v}" target="_blank" rel="noopener">PDF oeffnen</a>` : '<span class="muted">Kein PDF</span>' },
    { key: 'created_at', label: 'Angelegt', render: (v) => String(v || '').slice(0, 10) },
    { key: 'id', label: 'Aktion', render: (v, row) => canManage ? `<div class="action-row"><button class="secondary" data-action="vehicle-open" data-id="${v}">Details</button>${row.fahrzeugschein_pdf ? `<a class="icon-btn secondary-link" href="${row.fahrzeugschein_pdf}" target="_blank" rel="noopener" title="Fahrzeugschein oeffnen">PDF</a>` : ''}<button class="icon-btn" data-action="vehicle-docs" data-id="${v}" title="Dokumenten-Archiv">&#128193;</button><button class="icon-btn" data-action="vehicle-edit" data-id="${v}" title="Fahrzeug bearbeiten">&#9998;</button><button class="secondary" data-action="vehicle-delete" data-id="${v}">Loeschen</button></div>` : `<div class="action-row"><button class="secondary" data-action="vehicle-open" data-id="${v}">Details</button><button class="icon-btn" data-action="vehicle-docs" data-id="${v}" title="Dokumenten-Archiv">&#128193;</button></div>` }
  ]);
  el('workshopTable').innerHTML = renderTable(filteredWorkshopRows(), [
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
  renderWorkshopOverview();
  const canEditDamageRow = (row) => canManage || (state.user?.rolle === 'benutzer' && Number(row.created_by) === Number(state.user?.id) && row.status !== 'abgeschlossen');
  el('damageTable').innerHTML = renderTable(state.schaeden, [
    { key: 'kennzeichen', label: 'Kennzeichen' },
    { key: 'fahrer_name', label: 'Fahrer', render: (v, row) => [v || '-', row.fahrer_telefon || ''].filter(Boolean).join('<br>') },
    { key: 'datum', label: 'Datum' },
    { key: 'vu_nummer', label: 'VU Nummer' },
    { key: 'polizei_vor_ort', label: 'Polizei', render: (v) => v === 'ja' ? '<span class="badge ok">Ja</span>' : '<span class="badge danger">Nein</span>' },
    { key: 'verletzte', label: 'Verletzte', render: (v) => v === 'ja' ? '<span class="badge ok">Ja</span>' : '<span class="badge danger">Nein</span>' },
    { key: 'beschreibung', label: 'Beschreibung', render: (v) => `<div class="damage-text-cell">${v || '-'}</div>` },
    { key: 'unfallgegner_name', label: 'Gegner', render: (v, row) => `<div class="damage-text-cell"><strong>${v || '-'}</strong>${row.unfallgegner_kennzeichen ? `<br><span class="muted">${row.unfallgegner_kennzeichen}</span>` : ''}</div>` },
    { key: 'schaden_markierungen', label: 'Skizze', render: (v) => `<div class="damage-sketch-cell">${parseDamageMarkers(v).length ? renderDamageMarkerBadges(v) : '<span class="muted">-</span>'}</div>` },
    { key: 'status', label: 'Status', render: (v, row) => canManage ? `<select data-action="damage-status" data-id="${row.id}">${optionsHtml(state.meta.schadenStatus, v)}</select>` : `<span class="${badgeClass(v)}">${v}</span>` },
    { key: 'foto', label: 'Foto', render: (v) => v ? `<img class="damage-preview" src="${v}" alt="Schaden">` : '-' },
    { key: 'id', label: 'Aktion', render: (v, row) => canEditDamageRow(row) ? `<div class="action-row"><button class="icon-btn" data-action="damage-edit" data-id="${v}" title="Schaden bearbeiten">&#9998;</button>${canManage ? `<button class="secondary" data-action="damage-delete" data-id="${v}">Loeschen</button>` : ''}</div>` : '-' }
  ]);

  el('uvvTable').innerHTML = renderTable(state.uvv, [
    { key: 'kennzeichen', label: 'Kennzeichen' },
    { key: 'pruefer', label: 'Pruefer' },
    { key: 'datum', label: 'Pruefdatum' },
    { key: 'naechste_pruefung_datum', label: 'Naechste Pruefung' },
    { key: 'checkpunkte', label: 'Pruefung', render: (v) => `<div class="uvv-symbols">${v.map((item) => `<span class="${badgeClass(item.status)} symbol-badge">${symbolFor(item.status)}</span>`).join('')}</div>` },
    { key: 'id', label: 'Aktion', render: (v) => canManage ? `<div class="action-row"><button class="icon-btn" data-action="uvv-edit" data-id="${v}" title="UVV bearbeiten">&#9998;</button><button class="secondary" data-action="uvv-delete" data-id="${v}">Loeschen</button><button onclick="downloadPdf(${v})">PDF</button></div>` : `<button onclick="downloadPdf(${v})">PDF</button>` }
  ]);
  renderVehicleDetailModal();

  el('licenseCheckTable').innerHTML = renderTable(state.licenseChecks || [], [
    { key: 'benutzer_name', label: 'Fahrer' },
    { key: 'klassen', label: 'Klassen' },
    { key: 'ausstellungsdatum', label: 'Ausstellung', render: (v) => formatShortDate(v) },
    { key: 'gueltig_bis', label: 'Gueltig bis', render: (v) => formatShortDate(v) },
    { key: 'besitz_seit', label: 'Seit wann', render: (v) => `${formatShortDate(v)}<br><span class="muted">${licenseHeldText(v)}</span>` },
    { key: 'pruef_datum', label: 'Pruefdatum' },
    { key: 'naechste_pruefung', label: 'Naechste Pruefung' },
    { key: 'status', label: 'Status', render: (v) => `<span class="${badgeClass(v)}">${v}</span>` },
    { key: 'bemerkung', label: 'Bemerkung' },
    { key: 'id', label: 'Aktion', render: (v) => canManage ? `<div class="action-row"><button class="icon-btn" data-action="license-edit" data-id="${v}" title="Kontrolle bearbeiten">&#9998;</button><button class="secondary" data-action="license-delete" data-id="${v}">Loeschen</button><button onclick="downloadLicensePdf(${v})">PDF</button></div>` : `<button onclick="downloadLicensePdf(${v})">PDF</button>` }
  ]);

  el('usersTable').innerHTML = renderTable(state.benutzer, [
    { key: 'benutzername', label: 'Benutzername' },
    { key: 'name', label: 'Name', render: (v, row) => `${v || '-'}${String(state.editUserId) === String(row.id) ? '<br><span class="muted">Wird gerade bearbeitet</span>' : ''}` },
    { key: 'email', label: 'E-Mail' },
    { key: 'rolle', label: 'Rolle', render: (v) => `<span class="${badgeClass(v)}">${appRoleLabel(v)}</span>` },
    { key: 'standort', label: 'Standort' },
    { key: 'aktiv', label: 'Aktiv', render: (v) => v ? '<span class="badge ok">Ja</span>' : '<span class="badge danger">Nein</span>' },
    { key: 'id', label: 'Aktion', render: (v, row) => { if (!canManage) return '-'; const edit = `<button class="icon-btn" data-action="user-edit" data-id="${v}" title="Benutzer bearbeiten">&#9998;</button>`; const canDelete = ['hauptadmin', 'superadmin'].includes(state.user?.rolle) && Number(row.id) !== Number(state.user?.id); const del = canDelete ? `<button class="icon-btn secondary" data-action="user-delete" data-id="${v}" title="Benutzer loeschen">&#128465;</button>` : ''; return `<div class="action-row">${edit}${del}</div>`; } }
  ]);

  if (el('kontakteToolbar')) {
    const categoryOptions = ['werkstatt', 'versicherung', 'abschleppdienst', 'lieferant', 'dienstleister', 'sonstiges']
      .map((value) => `<option value="${value}" ${String(state.kontaktFilter?.kategorie || '') === String(value) ? 'selected' : ''}>${value}</option>`)
      .join('');
    el('kontakteToolbar').innerHTML = `
      <div class="contacts-toolbar-grid">
        <label>Suche<input id="kontaktSearchInput" value="${state.kontaktFilter?.q || ''}" placeholder="Name, Firma, Telefon, E-Mail"></label>
        <label>Kategorie<select id="kontaktKategorieFilter"><option value="">Alle</option>${categoryOptions}</select></label>
      </div>`;
  }
  if (el('kontakteTable')) el('kontakteTable').innerHTML = renderTable(filteredKontakte(), [
    { key: 'name', label: 'Name', render: (v, row) => `${v || '-'}${String(state.editKontaktId) === String(row.id) ? '<br><span class="muted">Wird gerade bearbeitet</span>' : ''}` },
    { key: 'firma', label: 'Firma' },
    { key: 'kategorie', label: 'Kategorie', render: (v) => `<span class="${badgeClass(v)}">${v}</span>` },
    { key: 'ansprechpartner', label: 'Ansprechpartner' },
    { key: 'telefon', label: 'Telefon' },
    { key: 'mobil', label: 'Mobil' },
    { key: 'email', label: 'E-Mail' },
    { key: 'standort', label: 'Standort' },
    { key: 'website', label: 'Website', render: (v) => v ? `<a class="secondary-link" href="${v}" target="_blank" rel="noopener">Oeffnen</a>` : '-' },
    { key: 'adresse', label: 'Adresse' },
    { key: 'notiz', label: 'Notiz' },
    { key: 'id', label: 'Aktion', render: (v) => canManage ? `<div class="action-row"><button class="icon-btn" data-action="kontakt-edit" data-id="${v}" title="Kontakt bearbeiten">&#9998;</button><button class="secondary" data-action="kontakt-delete" data-id="${v}">Loeschen</button></div>` : '-' }
  ]);

  renderCalendar();

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
    state.scanner = [];
    state.rampen = [];
    state.scannerAssignments = [];
    state.systemNotifications = [];
    state.schaeden = [];
    state.uvv = [];
    state.benutzer = [];
    state.kontakte = [];
    state.lagerorte = [];
    state.lagerartikel = [];
    state.lagerbewegungen = [];
    renderForms();
    renderLists();
    renderDashboard();
    renderReinigung();
    applyRoleVisibility();
    bindDynamicForms();
    bindInlineActions();
    return;
  }

  const suffix = querySuffix();
  const requests = [
    api(`/api/fahrzeuge${suffix}`),
    state.user?.rolle === 'benutzer' || !hasVisibleView('werkstatt') ? Promise.resolve([]) : api(`/api/werkstatt${suffix}`),
    state.user?.rolle === 'benutzer' || !hasVisibleView('werkstatt') ? Promise.resolve([]) : api(`/api/werkstatt-bereiche${suffix}`),
    hasVisibleView('schaeden') ? api(`/api/schaeden${suffix}`) : Promise.resolve([]),
    state.user?.rolle === 'benutzer' || !hasVisibleView('uvv') ? Promise.resolve([]) : api(`/api/uvv${suffix}`),
    state.user?.rolle === 'benutzer' || !hasVisibleView('licenseCheck') ? Promise.resolve([]) : api(`/api/fuehrerscheinkontrolle${suffix}`),
    state.user?.rolle === 'benutzer' ? Promise.resolve(null) : api(`/api/dashboard${suffix}`),
    state.user?.rolle === 'benutzer' || !hasVisibleView('reinigung') ? Promise.resolve({ datum: state.reinigung?.datum || new Date().toISOString().slice(0, 10), reinigungstag: state.reinigung?.reinigungstag || '1', aktuelle: [], werkstatt: [], gereinigt: [] }) : api(`/api/reinigung${reinigungQuery()}`),
    state.user?.rolle === 'benutzer' ? Promise.resolve([]) : api(`/api/system-notifications${suffix}`),
    state.user?.rolle === 'benutzer' || !hasVisibleView('lager') ? Promise.resolve([]) : api(`/api/lagerorte${suffix}`),
    state.user?.rolle === 'benutzer' || !hasVisibleView('lager') ? Promise.resolve([]) : api(`/api/lagerartikel${suffix}`),
    state.user?.rolle === 'benutzer' || !hasVisibleView('lager') ? Promise.resolve([]) : api(`/api/lagerbewegungen${suffix}`)
  ];
  const [fahrzeuge, werkstatt, workshopBereiche, schaeden, uvv, licenseChecks, dashboard, reinigung, systemNotifications, lagerorte, lagerartikel, lagerbewegungen] = await Promise.all(requests);
  state.fahrzeuge = fahrzeuge;
  state.werkstatt = werkstatt;
  state.workshopBereiche = workshopBereiche;
  state.schaeden = schaeden;
  state.uvv = uvv;
  state.licenseChecks = licenseChecks;
  state.dashboard = dashboard;
  state.reinigung = reinigung;
  state.systemNotifications = systemNotifications;
  state.lagerorte = lagerorte;
  state.lagerartikel = lagerartikel;
  state.lagerbewegungen = lagerbewegungen;
  state.benutzer = state.user.rolle === 'benutzer' || !hasVisibleView('benutzer') ? [] : await api(`/api/benutzer${suffix}`);
  state.kontakte = state.user.rolle === 'benutzer' || !hasVisibleView('kontakte') ? [] : await api(`/api/kontakte${suffix}`);
  renderForms();
  renderLists();
  renderDashboard();
  renderReinigung();
  renderNotifications();
  applyRoleVisibility();
  if (el('licenseUserSelect')) {
    const users = state.benutzer || [];
    el('licenseUserSelect').innerHTML = users.map(u => `<option value="${u.id}">${u.name} (${u.benutzername})</option>`).join('');
  }
  bindDynamicForms();
  bindInlineActions();
}

async function refreshApp() {
  await loadData();
}

async function refreshLicenseChecksOnly() {
  const suffix = querySuffix();
  state.licenseChecks = await api(`/api/fuehrerscheinkontrolle${suffix}`);
  const form = el('licenseCheckForm');
  const currentId = form?.querySelector('[name="id"]')?.value;
  if (currentId && !state.licenseChecks.some((item) => String(item.id) === String(currentId))) {
    resetLicenseForm();
  }
  renderLists();
  bindInlineActions();
}

async function refreshWorkshopOnly() {
  const suffix = querySuffix();
  const [fahrzeuge, werkstatt, workshopBereiche] = await Promise.all([
    api(`/api/fahrzeuge${suffix}`),
    api(`/api/werkstatt${suffix}`),
    api(`/api/werkstatt-bereiche${suffix}`)
  ]);
  state.fahrzeuge = fahrzeuge;
  state.werkstatt = werkstatt;
  state.workshopBereiche = workshopBereiche;
  if (state.editWorkshopId && !state.werkstatt.some((item) => String(item.id) === String(state.editWorkshopId))) {
    state.editWorkshopId = null;
  }
  if (state.editingWorkshopAreaId && !state.workshopBereiche.some((item) => String(item.id) === String(state.editingWorkshopAreaId))) {
    state.editingWorkshopAreaId = null;
  }
  renderForms();
  renderLists();
  bindDynamicForms();
  bindInlineActions();
}

function applyRoleVisibility() {
  const visible = new Set(state.meta.visibleViews || []);
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.style.display = visible.has(btn.dataset.view) ? 'block' : 'none';
  });

  const sidebar = el('sidebar');
  const topbar = el('topbar');

  if (state.user?.rolle === 'benutzer') {
    showView('schaeden');

    if (sidebar) sidebar.style.display = '';
    if (topbar) topbar.style.display = 'none';

    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.style.display = btn.dataset.view === 'schaeden' ? 'block' : 'none';
    });

    if (el('vehicleForm')) el('vehicleForm').style.display = 'none';
    if (el('workshopForm')) el('workshopForm').style.display = 'none';
    if (el('uvvForm')) el('uvvForm').style.display = 'none';
    if (el('userForm')) el('userForm').style.display = 'none';
    if (el('kontaktForm')) el('kontaktForm').style.display = 'none';
    if (el('damageTablePanel')) el('damageTablePanel').style.display = 'none';
    if (el('damageLayout')) el('damageLayout').classList.add('damage-layout-user');
    if (el('schaedenView')) el('schaedenView').classList.add('driver-view');
    if (el('viewTitle')) el('viewTitle').textContent = 'Schaeden';
    if (el('viewSubtitle')) el('viewSubtitle').textContent = 'Unfall- und Schadenmeldungen strukturiert erfassen.';
    return;
  }

  if (sidebar) sidebar.style.display = '';
  if (topbar) topbar.style.display = '';
  if (el('damageTablePanel')) el('damageTablePanel').style.display = '';
  if (el('damageLayout')) el('damageLayout').classList.remove('damage-layout-user');
  if (el('schaedenView')) el('schaedenView').classList.remove('driver-view');
}

function desiredViewFromHash() {
  const rawHash = String(window.location.hash || '').replace(/^#/, '').trim();
  if (!rawHash) return '';
  const normalized = rawHash.replace(/^\/+/, '').replace(/\/+$/, '');
  if (normalized === 'app') return '';
  if (normalized.startsWith('app#')) return normalized.slice(4);
  if (normalized.startsWith('app/')) return normalized.slice(4);
  return normalized;
}

function applyHashView(fallbackView) {
  const requestedView = desiredViewFromHash();
  const availableViews = state.meta?.visibleViews?.length ? state.meta.visibleViews : Object.keys(viewMeta);
  const targetView = availableViews.includes(requestedView) ? requestedView : fallbackView;
  showView(targetView);
}

function showView(name) {
  const availableViews = state.meta?.visibleViews?.length ? state.meta.visibleViews : Object.keys(viewMeta);
  const safeName = availableViews.includes(name) ? name : (availableViews[0] || 'dashboard');
  if (safeName !== 'fahrzeuge' && state.vehicleDetailId) closeVehicleDetail();
  document.querySelectorAll('.view').forEach((view) => view.className = 'view hidden');
  const target = el(`${safeName}View`);
  if (target) target.className = 'view visible';
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === safeName));
  const [title, subtitle] = viewMeta[safeName] || [safeName, ''];
  state.currentView = safeName;
  el('viewTitle').textContent = title;
  el('viewSubtitle').textContent = subtitle;
  renderTopbarControls();
  if (window.location.hash !== `#${safeName}`) {
    history.replaceState(null, '', `${window.location.pathname}#${safeName}`);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  try {
    const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    setAuth(result.token, result.user);
    toggleApp(true);
    el('loginError').textContent = '';
    await refreshApp();
    applyHashView(state.user.rolle === 'benutzer' ? 'schaeden' : 'dashboard');
  } catch (error) {
    el('loginError').textContent = error.message.includes('Zu viele Fehlversuche') ? error.message + ' Bitte spaeter erneut versuchen oder einen Admin informieren.' : error.message;
  }
}

async function handleVehicleSubmit(event) {
  event.preventDefault();
  try {
    const isEditing = Boolean(state.editVehicleId);
    const formData = new FormData(event.target);
    const pdfFile = formData.get('fahrzeugschein_pdf');
    const payload = Object.fromEntries([...formData.entries()].filter(([key]) => key !== 'fahrzeugschein_pdf'));
    if (!['hauptadmin', 'superadmin'].includes(state.user?.rolle)) payload.standort_id = state.user?.standort_id || '';
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
    if (isEditing && !state.werkstatt.some((item) => String(item.id) === String(state.editWorkshopId))) {
      state.editWorkshopId = null;
      renderForms();
      bindDynamicForms();
      throw new Error('Der ausgewaehlte Werkstattauftrag ist nicht mehr aktuell. Bitte Auftrag neu oeffnen.');
    }
    const draftWorkshop = currentWorkshopDraft();
    const payload = Object.fromEntries(new FormData(event.target));
    payload.workshop_slot = Number(payload.workshop_slot || draftWorkshop.workshop_slot || 1) || 1;
    payload.werkstatt_name = String(payload.werkstatt_name || '').trim() || draftWorkshop.werkstatt_name || 'Werkstatt';
    if (!payload.fahrzeug_id || !payload.datum_von) throw new Error('Fahrzeug und Von Datum sind Pflichtfelder.');
    if (isEditing) {
      await api(`/api/werkstatt/${state.editWorkshopId}`, { method: 'PUT', body: JSON.stringify(payload) });
      state.editWorkshopId = null;
    } else {
      await api('/api/werkstatt', { method: 'POST', body: JSON.stringify(payload) });
    }
    event.target.reset();
      try {
        await refreshWorkshopOnly();
      } catch (refreshError) {
        await refreshApp();
      }
      setWorkshopFormMessage(isEditing ? 'Werkstattauftrag wurde aktualisiert.' : 'Werkstattauftrag wurde angelegt.', 'success');
  } catch (error) {
    if ((error.message || '').includes('Werkstattauftrag nicht gefunden')) {
      state.editWorkshopId = null;
      renderForms();
      bindDynamicForms();
      setWorkshopFormMessage('Der Auftrag war nicht mehr vorhanden. Bitte neu aus der Liste oeffnen.', 'error');
      return;
    }
    setWorkshopFormMessage(error.message || 'Werkstattauftrag konnte nicht gespeichert werden.', 'error');
  }
}

async function handleDamageSubmit(event) {
  event.preventDefault();
  try {
    const formData = new FormData(event.target);
    const payload = Object.fromEntries([...formData.entries()].filter(([key]) => key !== 'foto'));
    const isEditing = Boolean(state.editDamageId);
    const created = await api(isEditing ? `/api/schaeden/${state.editDamageId}` : '/api/schaeden', { method: isEditing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    const file = formData.get('foto');
    if (file && file.size > 0) {
      const uploadData = new FormData();
      uploadData.append('foto', file);
      await api(`/api/schaeden/${created.id || state.editDamageId}/upload`, { method: 'POST', body: uploadData, headers: {} });
    }
    state.editDamageId = null;
    state.damageDraftBuffer = null;
    event.target.reset();
    const successBox = el('damageSuccessBox');
    if (successBox) {
      successBox.textContent = isEditing ? 'Schadenmeldung wurde aktualisiert.' : 'Unfallmeldung ist raus.';
      successBox.className = 'success visible';
    }
    await refreshApp();
  } catch (error) {
    setDamageFormMessage(error.message || 'Schaden konnte nicht gespeichert werden.', 'error');
  }
}

async function handleUvvSubmit(event) {
  event.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(event.target));
    const checkpunkte = state.meta.uvvCheckpoints.map((punkt, index) => ({ status: data[`checkpoint_status_${index}`], kommentar: data[`checkpoint_comment_${index}`] || '' }));
    const isEditing = Boolean(state.editUvvId);
    await api(isEditing ? `/api/uvv/${state.editUvvId}` : '/api/uvv', { method: isEditing ? 'PUT' : 'POST', body: JSON.stringify({ fahrzeug_id: data.fahrzeug_id, pruefer: data.pruefer, datum: data.datum, naechste_pruefung_datum: data.naechste_pruefung_datum, kommentar: data.kommentar, checkpunkte }) });
    state.editUvvId = null;
    event.target.reset();
    setUvvFormMessage(isEditing ? 'UVV wurde aktualisiert.' : 'UVV wurde gespeichert.', 'success');
    await refreshApp();
  } catch (error) {
    setUvvFormMessage(error.message || 'UVV konnte nicht gespeichert werden.', 'error');
  }
}

async function handleUserSubmit(event) {
  event.preventDefault();
  try {
    const isEditing = Boolean(state.editUserId);
    const payload = Object.fromEntries(new FormData(event.target));
    payload.aktiv = Number(payload.aktiv ?? 1);
    if (state.user?.rolle !== 'hauptadmin') payload.standort_id = state.user?.standort_id || '';
    if (!payload.benutzername || !payload.name || !payload.email) throw new Error('Bitte Benutzername, Name und E-Mail vollstaendig ausfuellen.');
    if (!isEditing && !payload.passwort) throw new Error('Bitte fuer den neuen Benutzer ein Passwort vergeben.');

    if (isEditing) {
      if (!payload.passwort) delete payload.passwort;
      await api(`/api/benutzer/${state.editUserId}`, { method: 'PUT', body: JSON.stringify(payload) });
      state.editUserId = null;
    } else {
      await api('/api/benutzer', { method: 'POST', body: JSON.stringify(payload) });
    }

    event.target.reset();
    await refreshApp();
    setUserFormMessage(isEditing ? 'Benutzer wurde gespeichert. Neues Passwort ist sofort aktiv.' : 'Benutzer wurde angelegt.', 'success');
  } catch (error) {
    setUserFormMessage(error.message || 'Benutzer konnte nicht gespeichert werden.', 'error');
  }
}

async function handleKontaktSubmit(event) {
  event.preventDefault();
  try {
    const isEditing = Boolean(state.editKontaktId);
    const payload = Object.fromEntries(new FormData(event.target));
    if (state.user?.rolle !== 'hauptadmin') payload.standort_id = state.user?.standort_id || '';
    if (!payload.name) throw new Error('Name ist Pflicht.');
    if (isEditing) {
      await api(`/api/kontakte/${state.editKontaktId}`, { method: 'PUT', body: JSON.stringify(payload) });
      state.editKontaktId = null;
    } else {
      await api('/api/kontakte', { method: 'POST', body: JSON.stringify(payload) });
    }
    event.target.reset();
    await refreshApp();
    setKontaktFormMessage(isEditing ? 'Kontakt wurde aktualisiert.' : 'Kontakt wurde angelegt.', 'success');
  } catch (error) {
    setKontaktFormMessage(error.message || 'Kontakt konnte nicht gespeichert werden.', 'error');
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
  document.querySelectorAll('[data-action="reinigung-toggle"]').forEach((node) => {
    node.onchange = async () => {
      await api('/api/reinigung/toggle', {
        method: 'PUT',
        body: JSON.stringify({
          fahrzeug_id: Number(node.dataset.id),
          datum: state.reinigung?.datum || new Date().toISOString().slice(0, 10),
          reinigungstag: state.reinigung?.reinigungstag || '1',
          erledigt: node.checked
        })
      });
      await refreshApp();
    };
  });

  document.querySelectorAll('[data-action="vehicle-edit"]').forEach((node) => {
    node.onclick = async () => {
      el('vehicleDocumentsPanel').classList.add('hidden');
      setVehicleEdit(node.dataset.id);
    };
  });
  document.querySelectorAll('[data-action="vehicle-open"]').forEach((node) => {
    node.onclick = async () => {
      openVehicleDetail(node.dataset.id);
    };
  });
  document.querySelectorAll('[data-action="vehicle-docs"]').forEach((node) => {
    node.onclick = async () => {
      await showVehicleDocuments(node.dataset.id);
    };
  });
  document.querySelectorAll('[data-action="vehicle-delete"]').forEach((node) => {
    node.onclick = async () => {
      await api(`/api/fahrzeuge/${node.dataset.id}`, { method: 'DELETE' });
      if (String(state.vehicleDetailId) === String(node.dataset.id)) closeVehicleDetail();
      await refreshApp();
    };
  });
  document.querySelectorAll('[data-action="vehicle-detail-close"]').forEach((node) => {
    node.onclick = closeVehicleDetail;
  });
  document.querySelectorAll('[data-action="vehicle-detail-edit"]').forEach((node) => {
    node.onclick = () => {
      closeVehicleDetail();
      setVehicleEdit(node.dataset.id);
    };
  });
  document.querySelectorAll('[data-action="vehicle-detail-docs"]').forEach((node) => {
    node.onclick = async () => {
      closeVehicleDetail();
      await showVehicleDocuments(node.dataset.id);
    };
  });
  document.querySelectorAll('[data-action="vehicle-detail-workshop"]').forEach((node) => {
    node.onclick = () => {
      closeVehicleDetail();
      showView('werkstatt');
      el('workshopForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      try {
        await refreshWorkshopOnly();
      } catch (error) {
        await refreshApp();
      }
    };
  });
  document.querySelectorAll('[data-action="workshop-list-save"]').forEach((node) => {
    node.onclick = async () => {
      const sign = document.querySelector(`[data-action="workshop-list-sign"][data-id="${node.dataset.id}"]`)?.value;
      const status_datum = document.querySelector(`[data-action="workshop-list-date"][data-id="${node.dataset.id}"]`)?.value;
      const datum_bis = document.querySelector(`[data-action="workshop-list-bis"][data-id="${node.dataset.id}"]`)?.value;
      const status = document.querySelector(`[data-action="workshop-status"][data-id="${node.dataset.id}"]`)?.value;
      await api(`/api/werkstatt/${node.dataset.id}`, { method: 'PUT', body: JSON.stringify({ pruefzeichen: sign, status_datum, datum_bis, status }) });
      try {
        await refreshWorkshopOnly();
      } catch (error) {
        await refreshApp();
      }
    };
  });
  document.querySelectorAll('[data-action="workshop-delete"]').forEach((node) => {
    node.onclick = async () => {
      if (String(state.editWorkshopId) === String(node.dataset.id)) {
        state.editWorkshopId = null;
      }
      await api(`/api/werkstatt/${node.dataset.id}`, { method: 'DELETE' });
      try {
        await refreshWorkshopOnly();
      } catch (error) {
        await refreshApp();
      }
    };
  });
  document.querySelectorAll('[data-action="scanner-assign"]').forEach((node) => {
    node.onclick = () => openScannerAssignmentModal(node.dataset.id);
  });
  document.querySelectorAll('[data-action="scanner-ramp-assign"]').forEach((node) => {
    node.onclick = () => openScannerAssignmentModal();
  });
  document.querySelectorAll('[data-action="scanner-release"]').forEach((node) => {
    node.onclick = async () => {
      if (!node.dataset.id) return;
      await api(`/api/scanner-zuweisungen/${node.dataset.id}`, { method: 'DELETE' });
      await refreshApp();
      showView('scanner');
    };
  });
  document.querySelectorAll('[data-action="workshop-area-edit"]').forEach((node) => {
    node.onclick = async (event) => {
      event.stopPropagation();
      state.editingWorkshopAreaId = node.dataset.id;
      renderLists();
      bindInlineActions();
    };
  });
  document.querySelectorAll('[data-action="workshop-area-cancel"]').forEach((node) => {
    node.onclick = async (event) => {
      event.stopPropagation();
      state.editingWorkshopAreaId = null;
      renderLists();
      bindInlineActions();
    };
  });
  document.querySelectorAll('[data-action="workshop-area-save"]').forEach((node) => {
    node.onclick = async (event) => {
      event.stopPropagation();
      const input = document.querySelector(`[data-action="workshop-area-name"][data-id="${node.dataset.id}"]`);
      if (!input || !node.dataset.id) return;
      await api(`/api/werkstatt-bereiche/${node.dataset.id}`, { method: 'PUT', body: JSON.stringify({ name: input.value }) });
      state.editingWorkshopAreaId = null;
      try {
        await refreshWorkshopOnly();
      } catch (error) {
        await refreshApp();
      }
    };
  });
  document.querySelectorAll('[data-action="damage-edit"]').forEach((node) => {
    node.onclick = async () => {
      setDamageEdit(node.dataset.id);
    };
  });
  document.querySelectorAll('[data-action="damage-delete"]').forEach((node) => {
    node.onclick = async () => {
      if (!confirm('Schaden wirklich loeschen?')) return;
      await api(`/api/schaeden/${node.dataset.id}`, { method: 'DELETE' });
      await refreshApp();
    };
  });
  document.querySelectorAll('[data-action="license-edit"]').forEach((node) => {
    node.onclick = async () => {
      const entry = state.licenseChecks.find(f => String(f.id) === String(node.dataset.id));
      if (!entry) return;
      const form = el('licenseCheckForm');
      form.querySelector('[name="id"]').value = entry.id || '';
      form.querySelector('[name="benutzer_id"]').value = entry.benutzer_id || '';
      form.querySelector('[name="klassen"]').value = entry.klassen || '';
      form.querySelector('[name="ausstellungsdatum"]').value = entry.ausstellungsdatum || '';
      form.querySelector('[name="gueltig_bis"]').value = entry.gueltig_bis || '';
      form.querySelector('[name="besitz_seit"]').value = entry.besitz_seit || '';
      form.querySelector('[name="pruef_datum"]').value = entry.pruef_datum || '';
      form.querySelector('[name="naechste_pruefung"]').value = entry.naechste_pruefung || '';
      form.querySelector('[name="bemerkung"]').value = entry.bemerkung || '';
      setLicenseFormMessage(`Fuehrerscheinkontrolle fuer ${entry.benutzer_name || 'den Fahrer'} wird bearbeitet.`);
      form.scrollIntoView({ behavior: 'smooth' });
    };
  });
  document.querySelectorAll('[data-action="license-delete"]').forEach((node) => {
    node.onclick = async () => {
      if (!confirm('Kontrolle wirklich loeschen?')) return;
      await api(`/api/fuehrerscheinkontrolle/${node.dataset.id}`, { method: 'DELETE' });
      try {
        await refreshLicenseChecksOnly();
      } catch (error) {
        await refreshApp();
      }
      if (el('licenseCheckForm')?.querySelector('[name="id"]')?.value === String(node.dataset.id)) {
        resetLicenseForm();
      }
    };
  });
  document.querySelectorAll('[data-action="uvv-edit"]').forEach((node) => {
    node.onclick = async () => {
      setUvvEdit(node.dataset.id);
    };
  });
  document.querySelectorAll('[data-action="uvv-delete"]').forEach((node) => {
    node.onclick = async () => {
      if (!confirm('UVV wirklich loeschen?')) return;
      await api(`/api/uvv/${node.dataset.id}`, { method: 'DELETE' });
      await refreshApp();
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
  document.querySelectorAll('[data-action="kontakt-edit"]').forEach((node) => {
    node.onclick = async () => {
      setKontaktEdit(node.dataset.id);
    };
  });
  document.querySelectorAll('[data-action="kontakt-delete"]').forEach((node) => {
    node.onclick = async () => {
      await api(`/api/kontakte/${node.dataset.id}`, { method: 'DELETE' });
      await refreshApp();
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

async function downloadLicensePdf(id) {
  const blob = await api(`/api/fuehrerscheinkontrolle/${id}/pdf`);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
window.downloadLicensePdf = downloadLicensePdf;

function bindEvents() {
  el('loginForm').addEventListener('submit', handleLogin);
  el('logoutBtn').addEventListener('click', clearAuth);
  el('closeVehicleDetailBtn')?.addEventListener('click', closeVehicleDetail);
  el('vehicleDetailModal')?.addEventListener('click', (event) => {
    if (event.target?.id === 'vehicleDetailModal') closeVehicleDetail();
  });
  el('scannerAssignmentForm')?.addEventListener('submit', handleScannerAssignmentSubmit);
  el('scannerCreateForm')?.addEventListener('submit', handleScannerCreateSubmit);
  el('scannerScannerSelect')?.addEventListener('change', (event) => {
    const scanner = (state.scanner || []).find((item) => Number(item.id) === Number(event.target.value));
    if (el('scannerSimInput')) el('scannerSimInput').value = scanner?.sim_nummer || '';
    if (el('scannerPhoneInput')) el('scannerPhoneInput').value = scanner?.telefonnummer || '';
    if (el('scannerProviderInput')) el('scannerProviderInput').value = scanner?.provider || '';
    if (scanner?.aktuelle_rampe_nummer && el('scannerRampSelect')) el('scannerRampSelect').value = String(scanner.aktuelle_rampe_nummer);
  });
  el('closeScannerAssignmentBtn')?.addEventListener('click', closeScannerAssignmentModal);
  el('closeScannerAssignmentSecondaryBtn')?.addEventListener('click', closeScannerAssignmentModal);
  el('closeScannerCreateBtn')?.addEventListener('click', closeScannerCreateModal);
  el('closeScannerCreateSecondaryBtn')?.addEventListener('click', closeScannerCreateModal);
  el('scannerAssignmentModal')?.addEventListener('click', (event) => {
    if (event.target?.id === 'scannerAssignmentModal') closeScannerAssignmentModal();
  });
  el('scannerCreateModal')?.addEventListener('click', (event) => {
    if (event.target?.id === 'scannerCreateModal') closeScannerCreateModal();
  });
  document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));
  window.addEventListener('hashchange', () => {
    if (!state.token) return;
    applyHashView(state.user?.rolle === 'benutzer' ? 'schaeden' : 'dashboard');
  });
  el('searchBtn').addEventListener('click', handleSearch);
  el('workshopOverview')?.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="workshop-area-edit"]') || event.target.closest('[data-action="workshop-area-save"]') || event.target.closest('[data-action="workshop-area-cancel"]') || event.target.closest('[data-action="workshop-area-name"]')) {
      return;
    }
    const filterNode = event.target.closest('[data-action="workshop-filter"]');
    if (filterNode) {
      state.workshopOverviewFilter = filterNode.dataset.filter || 'all';
      renderLists();
      bindInlineActions();
      el('workshopTable')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    const slotNode = event.target.closest('[data-action="workshop-slot"]');
    if (slotNode) {
      const workshopId = slotNode.dataset.id;
      if (workshopId) {
        setWorkshopEdit(workshopId);
        return;
      }
      state.workshopOverviewFilter = 'all';
      renderLists();
      bindInlineActions();
    }
  });
  el('reinigungRefreshBtn')?.addEventListener('click', async () => {
    state.reinigung.datum = el('reinigungDatum')?.value || new Date().toISOString().slice(0, 10);
    state.reinigung.reinigungstag = el('reinigungTag')?.value || '1';
    await refreshApp();
  });
  el('reinigungPdfBtn')?.addEventListener('click', async () => {
    const blob = await api(`/api/reinigung/pdf${reinigungQuery()}`);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  });
  document.addEventListener('input', (event) => {
    if (event.target?.id === 'kontaktSearchInput') {
      state.kontaktFilter.q = event.target.value;
      renderLists();
      bindInlineActions();
    }
  });
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'reinigungDatum') {
      state.reinigung.datum = event.target.value || new Date().toISOString().slice(0, 10);
    }
    if (event.target?.id === 'reinigungTag') {
      state.reinigung.reinigungstag = event.target.value || '1';
    }
    if (event.target?.id === 'kontaktKategorieFilter') {
      state.kontaktFilter.kategorie = event.target.value;
      renderLists();
      bindInlineActions();
    }
  });
  el('importForm').addEventListener('submit', handleImport);
  el('licenseCheckForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    try {
      if (!data.benutzer_id || !data.pruef_datum || !data.naechste_pruefung) {
        throw new Error('Bitte Fahrer, Pruef-Datum und naechste Pruefung ausfuellen.');
      }
      await api('/api/fuehrerscheinkontrolle', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      const wasEditing = Boolean(data.id);
      resetLicenseForm();
      try {
        await refreshLicenseChecksOnly();
      } catch (error) {
        await refreshApp();
      }
      setLicenseFormMessage(wasEditing ? 'Fuehrerscheinkontrolle wurde aktualisiert.' : 'Fuehrerscheinkontrolle wurde gespeichert.', 'success');
    } catch (err) {
      setLicenseFormMessage(err.message || 'Fuehrerscheinkontrolle konnte nicht gespeichert werden.', 'error');
    }
  });
  el('licenseResetBtn')?.addEventListener('click', resetLicenseForm);
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
  if (el('vehicleForm')) el('vehicleForm').onsubmit = handleVehicleSubmit;
  el('uploadDocForm').onsubmit = handleUploadDoc;
  el('closeDocsBtn').onclick = () => {
    state.viewDocsVehicleId = null;
    el('vehicleDocumentsPanel').classList.add('hidden');
  };
  el('workshopForm').onsubmit = handleWorkshopSubmit;
  el('damageForm').onsubmit = handleDamageSubmit;
  el('uvvForm').onsubmit = handleUvvSubmit;
  el('userForm').onsubmit = handleUserSubmit;
  if (el('kontaktForm')) el('kontaktForm').onsubmit = handleKontaktSubmit;
  const cancelVehicleButton = document.querySelector('[data-action="vehicle-cancel"]');
  if (cancelVehicleButton) cancelVehicleButton.onclick = resetVehicleForm;
  const cancelWorkshopButton = document.querySelector('[data-action="workshop-cancel"]');
  if (cancelWorkshopButton) cancelWorkshopButton.onclick = resetWorkshopForm;
  const cancelDamageButton = document.querySelector('[data-action="damage-cancel"]');
  if (cancelDamageButton) cancelDamageButton.onclick = resetDamageForm;
  const cancelUvvButton = document.querySelector('[data-action="uvv-cancel"]');
  if (cancelUvvButton) cancelUvvButton.onclick = resetUvvForm;
  const cancelUserButton = document.querySelector('[data-action="user-cancel"]');
  if (cancelUserButton) cancelUserButton.onclick = resetUserForm;
  const cancelKontaktButton = document.querySelector('[data-action="kontakt-cancel"]');
  if (cancelKontaktButton) cancelKontaktButton.onclick = resetKontaktForm;
  const damageLocaleSelect = document.querySelector('#damageLocaleSelect');
  if (damageLocaleSelect) {
    damageLocaleSelect.onchange = () => {
      captureDamageFormBuffer();
      state.damageLocale = damageLocaleSelect.value || 'de';
      localStorage.setItem('damage_form_locale', state.damageLocale);
      renderForms();
      bindDynamicForms();
    };
  }
  document.querySelectorAll('[data-damage-marker]').forEach((node) => {
    node.onclick = () => {
      const form = el('damageForm');
      if (!form) return;
      toggleDamageMarker(form, node.dataset.damageMarker);
    };
  });
  const damageVehicleSelect = document.querySelector('#damageForm [name="fahrzeug_id"]');
  if (damageVehicleSelect) {
    damageVehicleSelect.onchange = () => {
      const form = el('damageForm');
      if (!form) return;
      applyDamageSketchProfile(form, damageVehicleSelect.value);
    };
    applyDamageSketchProfile(el('damageForm'), damageVehicleSelect.value);
  }
}

async function bootstrap() {
  bindEvents();
  updateUserBadge();
  if (state.token && state.user) {
    toggleApp(true);
    await refreshApp();
    applyHashView(state.user.rolle === 'benutzer' ? 'schaeden' : 'dashboard');
  }
}

setInterval(async () => {
  if (state.token) await refreshApp();
}, 120000);

bootstrap();
