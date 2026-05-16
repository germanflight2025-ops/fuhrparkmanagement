const BACKOFFICE_META = {
  dashboard: ['Dashboard', 'Zentrale Steuerung von Kunden, Vertrieb, Support und Finanzen.'],
  kunden: ['Kunden', 'Kundenverwaltung mit Status, Paketen und Ansprechpartnern.'],
  leads: ['Anfragen & Demos', 'Neue Anfragen, Demo-Termine und Angebotsphasen im Ueberblick.'],
  mandanten: ['Mandanten', 'Instanzen, URLs und Kundenzugaenge zentral steuern.'],
  pakete: ['Pakete', 'Tarife, Preise und Leistungsumfang fuer Kunden und Angebote.'],
  angebote: ['Angebote', 'Angebote und Vertragsstatus professionell verwalten.'],
  rechnungen: ['Rechnungen', 'Offene Forderungen, Fakturierung und Monatsumsatz im Blick.'],
  tickets: ['Tickets', 'Supportfaelle, Prioritaeten und Bearbeitungsstatus im Team.'],
  mitarbeiter: ['Kundenteam', 'Mitarbeiter und Rollen der betreuten Fuhrpark-Kunden.'],
  personal: ['HR / Personal', 'Interne Mitarbeiter, Gehalt, Personalakte und Zugangsdaten.'],
  aufgaben: ['Aufgaben', 'Operative To-dos fuer Vertrieb, Support und Betrieb.'],
  dokumente: ['Dokumente', 'Vertraege, Rechnungen und interne Unterlagen zentral abgelegt.'],
  reports: ['Reports', 'Management-Sicht auf Wachstum, Umsatz und Service.'],
  technik: ['Technik', 'Instanzen, Backups, Deployments und Plattformstatus.'],
  einstellungen: ['Einstellungen', 'Grundkonfiguration, Branding und Rollenrechte.']
};

const PACKAGE_MODULES = {
  kostenlos: ['grundfunktionen', 'tuev'],
  starter: ['grundfunktionen', 'berichte', 'export'],
  professional: ['grundfunktionen', 'berichte', 'export', 'schadenmodul', 'versicherung', 'email_support'],
  enterprise: ['all']
};

const APP_ROLE_LABELS = {
  superadmin: 'Verwaltung',
  hauptadmin: 'Verwaltung',
  admin: 'Fuhrparkmanager',
  abteilungsleiter: 'Abteilungsleiter',
  lagerleiter: 'Lagerleiter',
  benutzer: 'Fahrer',
  hr: 'HR',
  mitarbeiter: 'Mitarbeiter'
};

const state = {
  token: localStorage.getItem('backoffice_token') || '',
  user: JSON.parse(localStorage.getItem('backoffice_user') || 'null'),
  customers: [],
  leads: [],
  tickets: [],
  invoices: [],
  offers: [],
  mandants: [],
  packages: [],
  employees: [],
  personnel: [],
  moduleCatalog: [],
  tasks: [],
  documents: [],
  settings: null,
  dashboard: null,
  editCustomerId: null,
  editLeadId: null,
  editTicketId: null,
  editInvoiceId: null,
  editOfferId: null,
  editMandantId: null,
  editPackageId: null,
  editEmployeeId: null,
  editPersonnelId: null,
  editTaskId: null,
  editDocumentId: null,
  filters: {
    q: '',
    status: '',
    paket: ''
  }
};

function byId(id) {
  return document.getElementById(id);
}

function currentBackofficeRole() {
  return String(state.user?.rolle || '').trim();
}

function appRoleLabel(role) {
  return APP_ROLE_LABELS[String(role || '').trim()] || String(role || '-').trim() || '-';
}

function availableCustomerAppRoles() {
  const current = currentBackofficeRole();
  if (['superadmin', 'hauptadmin'].includes(current)) {
    return [
      ['hauptadmin', 'Verwaltung'],
      ['admin', 'Fuhrparkmanager'],
      ['abteilungsleiter', 'Abteilungsleiter'],
      ['lagerleiter', 'Lagerleiter'],
      ['benutzer', 'Fahrer']
    ];
  }
  if (current === 'hr') {
    return [
      ['admin', 'Fuhrparkmanager'],
      ['abteilungsleiter', 'Abteilungsleiter'],
      ['lagerleiter', 'Lagerleiter'],
      ['benutzer', 'Fahrer']
    ];
  }
  return [['benutzer', 'Fahrer']];
}

function renderEmployeeRoleOptions(selectedValue = 'admin') {
  const target = byId('boEmployeeForm')?.querySelector('[name="app_rolle"]');
  if (!target) return;
  const roles = availableCustomerAppRoles();
  const value = roles.some(([role]) => role === selectedValue) ? selectedValue : (roles[0]?.[0] || 'benutzer');
  target.innerHTML = roles.map(([role, label]) => `<option value="${role}" ${role === value ? 'selected' : ''}>${label}</option>`).join('');
}

function canSeePersonnel() {
  return ['superadmin', 'hauptadmin', 'hr'].includes(currentBackofficeRole());
}

function canManageBackoffice() {
  return ['superadmin', 'hauptadmin', 'hr'].includes(currentBackofficeRole());
}

function parseModuleList(value) {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
  return [...new Set(String(value || '')
    .split(/\r?\n|,|;/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean))];
}

function moduleLabel(name) {
  const match = (state.moduleCatalog || []).find((item) => String(item.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase());
  return match?.label || name;
}

function packageModuleNames(packageName) {
  const key = String(packageName || '').trim().toLowerCase();
  return PACKAGE_MODULES[key] || [];
}

function effectiveCustomerModules(packageName, extraModules = []) {
  const merged = new Set([...(packageModuleNames(packageName) || []), ...parseModuleList(extraModules)]);
  if (merged.has('all')) return ['all'];
  return [...merged];
}

function applyBackofficeAccessRules() {
  const readonly = currentBackofficeRole() === 'mitarbeiter';
  document.body.classList.toggle('bo-readonly', readonly);
  document.querySelectorAll('[data-view="personal"]').forEach((node) => {
    node.classList.toggle('hidden', !canSeePersonnel());
  });
  if (!canSeePersonnel() && desiredBackofficeView() === 'personal') {
    setBackofficeView('dashboard');
  }
}

function setLayoutFormState(form, isOpen) {
  const layout = form?.closest('.bo-customer-layout');
  if (layout) layout.classList.toggle('has-form', Boolean(isOpen));
}

function logoutBackoffice() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('backoffice_token');
  localStorage.removeItem('backoffice_user');
  document.body.classList.remove('bo-modal-open');
  setAuthVisible(false);
  if (byId('boLoginError')) byId('boLoginError').textContent = '';
}

function togglePersonnelModal(isOpen) {
  const modal = byId('boPersonnelModal');
  if (!modal) return;
  modal.classList.toggle('hidden', !isOpen);
  document.body.classList.toggle('bo-modal-open', Boolean(isOpen));
}

async function deleteBackofficeEntry(path, promptText) {
  if (!window.confirm(promptText || 'Eintrag wirklich loeschen?')) return false;
  await backofficeApi(path, { method: 'DELETE' });
  return true;
}

function backofficeApi(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  return fetch(path, { ...options, headers }).then(async (response) => {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Backoffice-Fehler.' }));
      throw new Error(error.error || 'Backoffice-Fehler.');
    }
    return response.json();
  });
}

function setBackofficeView(name) {
  const requestedName = BACKOFFICE_META[name] ? name : 'dashboard';
  const safeName = !canSeePersonnel() && requestedName === 'personal' ? 'dashboard' : requestedName;
  document.querySelectorAll('.bo-view').forEach((node) => {
    node.classList.toggle('visible', node.id === `${safeName}View`);
    node.classList.toggle('hidden', node.id !== `${safeName}View`);
  });
  document.querySelectorAll('.bo-nav-btn').forEach((node) => {
    node.classList.toggle('active', node.dataset.view === safeName);
  });
  const [title, subtitle] = BACKOFFICE_META[safeName];
  if (byId('boTitle')) byId('boTitle').textContent = title;
  if (byId('boSubtitle')) byId('boSubtitle').textContent = subtitle;
  if (window.location.hash !== `#${safeName}`) {
    history.replaceState(null, '', `${window.location.pathname}#${safeName}`);
  }
}

function desiredBackofficeView() {
  const hash = String(window.location.hash || '').replace(/^#/, '').trim();
  return BACKOFFICE_META[hash] ? hash : 'dashboard';
}

function badgeClass(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'aktiv' || value === 'angebot' || value === 'geplant') return 'bo-status ok';
  if (value === 'test' || value === 'offen' || value === 'mittel' || value === 'neu') return 'bo-status warn';
  if (value === 'pausiert' || value === 'gekuendigt' || value === 'ueberfaellig' || value === 'hoch') return 'bo-status danger';
  return 'bo-status';
}

function filteredCustomers() {
  return state.customers.filter((item) => {
    const q = state.filters.q.trim().toLowerCase();
    const text = [item.firma, item.ansprechpartner, item.email, item.telefon].join(' ').toLowerCase();
    if (q && !text.includes(q)) return false;
    if (state.filters.status && item.status !== state.filters.status) return false;
    if (state.filters.paket && item.paket !== state.filters.paket) return false;
    return true;
  });
}

function renderCustomerTable() {
  const target = byId('boCustomerTableBody');
  if (!target) return;
  const rows = filteredCustomers();
  if (!rows.length) {
    target.innerHTML = '<tr><td colspan="6">Keine Kunden gefunden.</td></tr>';
    return;
  }
  target.innerHTML = rows.map((item) => `
    <tr>
      <td><strong>${item.firma || '-'}</strong><br><small>${item.email || '-'}</small>${(item.zusatzmodule || []).length ? `<br><small>Module: ${(item.zusatzmodule || []).map(moduleLabel).join(', ')}</small>` : ''}</td>
      <td>${item.ansprechpartner || '-'}</td>
      <td>${item.paket || '-'}${(item.zusatzmodule || []).length ? `<br><small>+ ${(item.zusatzmodule || []).map(moduleLabel).join(', ')}</small>` : ''}</td>
      <td>${item.standorte || 1}</td>
      <td><span class="${badgeClass(item.status)}">${item.status || '-'}</span></td>
      <td>
        <button type="button" class="bo-inline-btn" data-customer-edit="${item.id}">Bearbeiten</button>
        <button type="button" class="bo-inline-btn bo-inline-btn-danger" data-customer-delete="${item.id}">Loeschen</button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('[data-customer-edit]').forEach((node) => {
    node.addEventListener('click', () => openCustomerForm(node.dataset.customerEdit));
  });
  document.querySelectorAll('[data-customer-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.customers.find((entry) => String(entry.id) === String(node.dataset.customerDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/kunden/${item.id}`, `Kunde "${item.firma}" wirklich loeschen?`))) return;
      await loadCustomers();
      await loadDashboard();
    });
  });
}

function setAuthVisible(isLoggedIn) {
  if (byId('boAuthGate')) byId('boAuthGate').style.display = isLoggedIn ? 'none' : 'grid';
  if (byId('boShell')) byId('boShell').style.display = isLoggedIn ? 'grid' : 'none';
}

function setCustomerMessage(message, type = '') {
  const target = byId('boCustomerMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function resetCustomerForm() {
  state.editCustomerId = null;
  const form = byId('boCustomerForm');
  if (!form) return;
  form.reset();
  form.classList.add('hidden');
  setLayoutFormState(form, false);
  form.querySelector('[name="id"]').value = '';
  if (form.querySelector('[name="zusatzmodule"]')) form.querySelector('[name="zusatzmodule"]').value = '';
  if (byId('boCustomerFormTitle')) byId('boCustomerFormTitle').textContent = 'Kunde anlegen';
  setCustomerMessage('');
  renderCustomerModuleHint();
}

function openCustomerForm(id = null) {
  const form = byId('boCustomerForm');
  if (!form) return;
  form.classList.remove('hidden');
  setLayoutFormState(form, true);
  setCustomerMessage('');
  if (!id) {
    state.editCustomerId = null;
    form.reset();
    form.querySelector('[name="id"]').value = '';
    if (form.querySelector('[name="zusatzmodule"]')) form.querySelector('[name="zusatzmodule"]').value = '';
    if (byId('boCustomerFormTitle')) byId('boCustomerFormTitle').textContent = 'Kunde anlegen';
    renderCustomerModuleHint();
    return;
  }
  const item = state.customers.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  state.editCustomerId = item.id;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="firma"]').value = item.firma || '';
  form.querySelector('[name="ansprechpartner"]').value = item.ansprechpartner || '';
  form.querySelector('[name="email"]').value = item.email || '';
  form.querySelector('[name="telefon"]').value = item.telefon || '';
  form.querySelector('[name="paket"]').value = item.paket || 'Starter';
  form.querySelector('[name="status"]').value = item.status || 'aktiv';
  form.querySelector('[name="standorte"]').value = item.standorte || 1;
  if (form.querySelector('[name="zusatzmodule"]')) form.querySelector('[name="zusatzmodule"]').value = (item.zusatzmodule || []).join(', ');
  form.querySelector('[name="notiz"]').value = item.notiz || '';
  if (byId('boCustomerFormTitle')) byId('boCustomerFormTitle').textContent = 'Kunde bearbeiten';
  renderCustomerModuleHint();
}

async function loadCustomers() {
  state.customers = await backofficeApi('/api/backoffice/kunden');
  renderCustomerTable();
}

function renderCustomerModuleHint() {
  const target = byId('boCustomerModuleHint');
  const list = byId('boCustomerModuleList');
  const form = byId('boCustomerForm');
  if (!target || !list || !form) return;
  const selectedPackage = form.querySelector('[name="paket"]')?.value || 'Starter';
  const selectedModules = parseModuleList(form.querySelector('[name="zusatzmodule"]')?.value || '');
  const includedModules = packageModuleNames(selectedPackage);
  const activeModules = (state.moduleCatalog || []).filter((item) => item.status !== 'archiviert');
  const selectableModules = includedModules.includes('all')
    ? []
    : activeModules.filter((item) => !includedModules.includes(String(item.name || '').trim().toLowerCase()));

  target.textContent = includedModules.includes('all')
    ? 'Enterprise enthaelt bereits alle Funktionen.'
    : `Im Paket enthalten: ${(includedModules || []).map(moduleLabel).join(', ') || 'Keine festen Module'}`;

  if (!selectableModules.length) {
    list.innerHTML = '<p class="bo-form-hint">Keine zusaetzlichen Module fuer dieses Paket verfuegbar.</p>';
    form.querySelector('[name="zusatzmodule"]').value = '';
    return;
  }

  list.innerHTML = selectableModules.map((item) => {
    const moduleName = String(item.name || '').trim().toLowerCase();
    const checked = selectedModules.includes(moduleName) ? 'checked' : '';
    return `
      <label class="bo-module-option">
        <input type="checkbox" value="${moduleName}" ${checked} data-customer-module>
        <span><strong>${item.label || item.name}</strong><span>${moduleName}</span></span>
      </label>`;
  }).join('');

  list.querySelectorAll('[data-customer-module]').forEach((node) => {
    node.addEventListener('change', syncCustomerModuleSelection);
  });
  syncCustomerModuleSelection();
}

function syncCustomerModuleSelection() {
  const form = byId('boCustomerForm');
  const list = byId('boCustomerModuleList');
  if (!form || !list) return;
  const selected = Array.from(list.querySelectorAll('[data-customer-module]:checked')).map((node) => String(node.value || '').trim().toLowerCase());
  form.querySelector('[name="zusatzmodule"]').value = selected.join(', ');
}

function setModuleCatalogMessage(message, type = '') {
  const target = byId('boModuleCatalogMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function resetModuleCatalogForm() {
  const form = byId('boModuleCatalogForm');
  if (!form) return;
  form.reset();
  form.querySelector('[name="id"]').value = '';
  setModuleCatalogMessage('');
}

function openModuleCatalogForm(id = null) {
  const form = byId('boModuleCatalogForm');
  if (!form) return;
  if (!id) {
    resetModuleCatalogForm();
    return;
  }
  const item = state.moduleCatalog.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="name"]').value = item.name || '';
  form.querySelector('[name="label"]').value = item.label || '';
  form.querySelector('[name="status"]').value = item.status || 'aktiv';
}

function renderModuleCatalogTable() {
  const target = byId('boModuleCatalogTableBody');
  if (!target) return;
  if (!state.moduleCatalog.length) {
    target.innerHTML = '<tr><td colspan="4">Keine Module vorhanden.</td></tr>';
    renderCustomerModuleHint();
    return;
  }
  target.innerHTML = state.moduleCatalog.map((item) => `
    <tr>
      <td>${item.label || '-'}</td>
      <td>${item.name || '-'}</td>
      <td><span class="${badgeClass(item.status || 'aktiv')}">${item.status || 'aktiv'}</span></td>
      <td>
        <div class="bo-action-row">
          <button type="button" class="bo-inline-btn" data-module-edit="${item.id}">Bearbeiten</button>
          <button type="button" class="bo-inline-btn danger" data-module-delete="${item.id}">Loeschen</button>
        </div>
      </td>
    </tr>
  `).join('');
  document.querySelectorAll('[data-module-edit]').forEach((node) => {
    node.addEventListener('click', () => openModuleCatalogForm(node.dataset.moduleEdit));
  });
  document.querySelectorAll('[data-module-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.moduleCatalog.find((entry) => String(entry.id) === String(node.dataset.moduleDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/module-catalog/${item.id}`, `Modul "${item.label || item.name}" wirklich loeschen?`))) return;
      await loadModuleCatalog();
    });
  });
  renderCustomerModuleHint();
}

async function loadModuleCatalog() {
  state.moduleCatalog = await backofficeApi('/api/backoffice/module-catalog');
  renderModuleCatalogTable();
}

function setLeadMessage(message, type = '') {
  const target = byId('boLeadMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysClient(startValue, days) {
  const base = startValue ? new Date(`${startValue}T00:00:00`) : new Date();
  const next = new Date(base);
  next.setDate(next.getDate() + Number(days || 0));
  return next.toISOString().slice(0, 10);
}

function demoDaysLeft(endValue) {
  if (!endValue) return null;
  const now = new Date(`${todayIso()}T00:00:00`);
  const end = new Date(`${endValue}T00:00:00`);
  return Math.ceil((end - now) / 86400000);
}

function syncLeadDemoDates() {
  const form = byId('boLeadForm');
  if (!form) return;
  const status = form.querySelector('[name="status"]')?.value || 'neu';
  const startField = form.querySelector('[name="demo_start"]');
  const endField = form.querySelector('[name="demo_end"]');
  if (!startField || !endField) return;
  if (status === 'demo') {
    startField.value = startField.value || todayIso();
    endField.value = endField.value || addDaysClient(startField.value, 7);
  } else {
    startField.value = '';
    endField.value = '';
  }
}

function resetLeadForm() {
  state.editLeadId = null;
  const form = byId('boLeadForm');
  if (!form) return;
  form.reset();
  form.classList.add('hidden');
  setLayoutFormState(form, false);
  form.querySelector('[name="id"]').value = '';
  if (byId('boLeadFormTitle')) byId('boLeadFormTitle').textContent = 'Anfrage anlegen';
  setLeadMessage('');
}

function openLeadForm(id = null) {
  const form = byId('boLeadForm');
  if (!form) return;
  form.classList.remove('hidden');
  setLayoutFormState(form, true);
  setLeadMessage('');
  if (!id) {
    state.editLeadId = null;
    form.reset();
    form.querySelector('[name="id"]').value = '';
    syncLeadDemoDates();
    if (byId('boLeadFormTitle')) byId('boLeadFormTitle').textContent = 'Anfrage anlegen';
    return;
  }
  const item = state.leads.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  state.editLeadId = item.id;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="name"]').value = item.name || '';
  form.querySelector('[name="firma"]').value = item.firma || '';
  form.querySelector('[name="email"]').value = item.email || '';
  form.querySelector('[name="telefon"]').value = item.telefon || '';
  form.querySelector('[name="fahrzeuge"]').value = item.fahrzeuge || 0;
  form.querySelector('[name="status"]').value = item.status || 'neu';
  form.querySelector('[name="quelle"]').value = item.quelle || '';
  form.querySelector('[name="paket_wunsch"]').value = item.paket_wunsch || '';
  form.querySelector('[name="demo_start"]').value = item.demo_start || '';
  form.querySelector('[name="demo_end"]').value = item.demo_end || '';
  form.querySelector('[name="notiz"]').value = item.notiz || '';
  if (byId('boLeadFormTitle')) byId('boLeadFormTitle').textContent = 'Anfrage bearbeiten';
}

function renderLeadBoard() {
  const statuses = ['neu', 'kontaktiert', 'demo', 'angebot', 'gewonnen', 'verloren'];
  statuses.forEach((status) => {
    const target = document.querySelector(`[data-lead-column="${status}"]`);
    if (!target) return;
    const rows = state.leads.filter((item) => item.status === status);
    if (!rows.length) {
      target.innerHTML = '<div class="bo-ticket-card"><span>Keine Eintraege</span></div>';
      return;
    }
      target.innerHTML = rows.map((item) => `
        <div class="bo-ticket-card">
          <strong>${item.firma || '-'}</strong>
          <span>${item.name || '-'}${item.fahrzeuge ? ` | ${item.fahrzeuge} Fahrzeuge` : ''}${item.anfrage_typ ? ` | ${item.anfrage_typ}` : ''}</span>
          ${item.paket_wunsch ? `<small>Paketwunsch: ${item.paket_wunsch}</small>` : ''}
          ${item.status === 'demo' && item.demo_end ? `<small>Demo bis ${item.demo_end}${demoDaysLeft(item.demo_end) !== null ? ` | ${demoDaysLeft(item.demo_end)} Tage` : ''}</small>` : ''}
          <div class="bo-card-actions">
            <button type="button" class="bo-inline-btn" data-lead-edit="${item.id}">Bearbeiten</button>
          <button type="button" class="bo-inline-btn bo-inline-btn-danger" data-lead-delete="${item.id}">Loeschen</button>
        </div>
      </div>
    `).join('');
  });
  document.querySelectorAll('[data-lead-edit]').forEach((node) => {
    node.addEventListener('click', () => openLeadForm(node.dataset.leadEdit));
  });
  document.querySelectorAll('[data-lead-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.leads.find((entry) => String(entry.id) === String(node.dataset.leadDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/leads/${item.id}`, `Anfrage von "${item.firma}" wirklich loeschen?`))) return;
      await loadLeads();
      await loadDashboard();
    });
  });
}

async function loadLeads() {
  state.leads = await backofficeApi('/api/backoffice/leads');
  renderLeadBoard();
}

function setTicketMessage(message, type = '') {
  const target = byId('boTicketMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function resetTicketForm() {
  state.editTicketId = null;
  const form = byId('boTicketForm');
  if (!form) return;
  form.reset();
  form.classList.add('hidden');
  setLayoutFormState(form, false);
  form.querySelector('[name="id"]').value = '';
  if (byId('boTicketFormTitle')) byId('boTicketFormTitle').textContent = 'Ticket anlegen';
  setTicketMessage('');
}

function openTicketForm(id = null) {
  const form = byId('boTicketForm');
  if (!form) return;
  form.classList.remove('hidden');
  setLayoutFormState(form, true);
  setTicketMessage('');
  if (!id) {
    state.editTicketId = null;
    form.reset();
    form.querySelector('[name="id"]').value = '';
    if (byId('boTicketFormTitle')) byId('boTicketFormTitle').textContent = 'Ticket anlegen';
    return;
  }
  const item = state.tickets.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  state.editTicketId = item.id;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="kunde"]').value = item.kunde || '';
  form.querySelector('[name="betreff"]').value = item.betreff || '';
  form.querySelector('[name="prioritaet"]').value = item.prioritaet || 'normal';
  form.querySelector('[name="status"]').value = item.status || 'offen';
  form.querySelector('[name="zustaendig"]').value = item.zustaendig || '';
  form.querySelector('[name="notiz"]').value = item.notiz || '';
  if (byId('boTicketFormTitle')) byId('boTicketFormTitle').textContent = 'Ticket bearbeiten';
}

function renderTicketBoard() {
  const statuses = ['offen', 'in_bearbeitung', 'wartet_auf_kunde', 'erledigt'];
  statuses.forEach((status) => {
    const target = document.querySelector(`[data-ticket-column="${status}"]`);
    if (!target) return;
    const rows = state.tickets.filter((item) => item.status === status);
    if (!rows.length) {
      target.innerHTML = '<div class="bo-ticket-card"><span>Keine Eintraege</span></div>';
      return;
    }
    target.innerHTML = rows.map((item) => `
      <div class="bo-ticket-card">
        <strong>${item.kunde || '-'}</strong>
        <span>${item.betreff || '-'}</span>
        <small>${item.zustaendig || 'Nicht zugewiesen'} | <span class="${badgeClass(item.prioritaet)}">${item.prioritaet || 'normal'}</span></small>
        <div class="bo-card-actions">
          <button type="button" class="bo-inline-btn" data-ticket-edit="${item.id}">Bearbeiten</button>
          <button type="button" class="bo-inline-btn bo-inline-btn-danger" data-ticket-delete="${item.id}">Loeschen</button>
        </div>
      </div>
    `).join('');
  });
  document.querySelectorAll('[data-ticket-edit]').forEach((node) => {
    node.addEventListener('click', () => openTicketForm(node.dataset.ticketEdit));
  });
  document.querySelectorAll('[data-ticket-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.tickets.find((entry) => String(entry.id) === String(node.dataset.ticketDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/tickets/${item.id}`, `Ticket "${item.betreff}" wirklich loeschen?`))) return;
      await loadTickets();
      await loadDashboard();
    });
  });
}

async function loadTickets() {
  state.tickets = await backofficeApi('/api/backoffice/tickets');
  renderTicketBoard();
}

function formatCurrency(value) {
  const number = Number(value || 0);
  return `${number.toFixed(2).replace('.', ',')} EUR`;
}

function renderDashboard() {
  const data = state.dashboard;
  if (!data) return;
  if (byId('dashKpiCustomers')) byId('dashKpiCustomers').textContent = String(data.kpis?.activeCustomers || 0);
  if (byId('dashKpiCustomersMeta')) byId('dashKpiCustomersMeta').textContent = `${data.customerStatus?.test || 0} Testkunden`;
  if (byId('dashKpiTickets')) byId('dashKpiTickets').textContent = String(data.kpis?.openTickets || 0);
  if (byId('dashKpiTicketsMeta')) byId('dashKpiTicketsMeta').textContent = `${data.ticketStatus?.in_bearbeitung || 0} in Bearbeitung`;
  if (byId('dashKpiRevenue')) byId('dashKpiRevenue').textContent = formatCurrency(data.kpis?.monthlyRevenue || 0);
  if (byId('dashKpiRevenueMeta')) byId('dashKpiRevenueMeta').textContent = `${data.finance?.monthlyCount || 0} Rechnungen diesen Monat`;
  if (byId('dashKpiLeads')) byId('dashKpiLeads').textContent = String(data.kpis?.newLeads || 0);
  if (byId('dashKpiLeadsMeta')) byId('dashKpiLeadsMeta').textContent = `${data.leadStatus?.demo || 0} Demo`;

  if (byId('dashCustomerActive')) byId('dashCustomerActive').textContent = String(data.customerStatus?.aktiv || 0);
  if (byId('dashCustomerTest')) byId('dashCustomerTest').textContent = String(data.customerStatus?.test || 0);
  if (byId('dashCustomerPaused')) byId('dashCustomerPaused').textContent = String(data.customerStatus?.pausiert || 0);
  if (byId('dashCustomerCancelled')) byId('dashCustomerCancelled').textContent = String(data.customerStatus?.gekuendigt || 0);
  if (byId('dashCustomerList')) {
    const rows = data.recentCustomers || [];
    byId('dashCustomerList').innerHTML = rows.length ? rows.map((item) => `
      <div class="bo-list-row"><strong>${item.firma || '-'}</strong><span>${item.paket || '-'} | ${item.standorte || 1} Standorte</span><em class="${badgeClass(item.status)}">${item.status || '-'}</em></div>
    `).join('') : '<div class="bo-list-row"><strong>Keine Daten</strong><span>-</span><em class="bo-status">-</em></div>';
  }

  if (byId('dashTicketOpen')) byId('dashTicketOpen').textContent = String(data.ticketStatus?.offen || 0);
  if (byId('dashTicketProgress')) byId('dashTicketProgress').textContent = String(data.ticketStatus?.in_bearbeitung || 0);
  if (byId('dashTicketWaiting')) byId('dashTicketWaiting').textContent = String(data.ticketStatus?.wartet_auf_kunde || 0);
  if (byId('dashTicketDone')) byId('dashTicketDone').textContent = String(data.ticketStatus?.erledigt || 0);
  if (byId('dashTicketTableBody')) {
    const rows = data.recentTickets || [];
    byId('dashTicketTableBody').innerHTML = rows.length ? rows.map((item) => `
      <tr><td>${item.kunde || '-'}</td><td>${item.betreff || '-'}</td><td><span class="${badgeClass(item.prioritaet)}">${item.prioritaet || '-'}</span></td></tr>
    `).join('') : '<tr><td colspan="3">Keine Daten</td></tr>';
  }

  if (byId('dashLeadNew')) byId('dashLeadNew').textContent = String(data.leadStatus?.neu || 0);
  if (byId('dashLeadDemo')) byId('dashLeadDemo').textContent = String(data.leadStatus?.demo || 0);
  if (byId('dashLeadOffer')) byId('dashLeadOffer').textContent = String(data.leadStatus?.angebot || 0);
  if (byId('dashLeadWon')) byId('dashLeadWon').textContent = String(data.leadStatus?.gewonnen || 0);
  if (byId('dashLeadList')) {
    const rows = data.recentLeads || [];
    byId('dashLeadList').innerHTML = rows.length ? rows.map((item) => `
      <div class="bo-list-row"><strong>${item.firma || '-'}</strong><span>${item.name || '-'}${item.fahrzeuge ? ` | ${item.fahrzeuge} Fahrzeuge` : ''}</span><em class="${badgeClass(item.status)}">${item.status || '-'}</em></div>
    `).join('') : '<div class="bo-list-row"><strong>Keine Daten</strong><span>-</span><em class="bo-status">-</em></div>';
  }

  if (byId('dashInvoiceOpen')) byId('dashInvoiceOpen').textContent = formatCurrency(data.finance?.offen || 0);
  if (byId('dashInvoiceOverdue')) byId('dashInvoiceOverdue').textContent = formatCurrency(data.finance?.ueberfaellig || 0);
  if (byId('dashInvoiceCount')) byId('dashInvoiceCount').textContent = String(data.finance?.monthlyCount || 0);
  if (byId('dashFinanceTableBody')) {
    const rows = data.recentInvoices || [];
    byId('dashFinanceTableBody').innerHTML = rows.length ? rows.map((item) => `
      <tr><td>${item.kunde || '-'}</td><td>${item.faellig_am || '-'}</td><td><span class="${badgeClass(item.status)}">${item.status || '-'}</span></td></tr>
    `).join('') : '<tr><td colspan="3">Keine Daten</td></tr>';
  }

  if (byId('dashActivityList')) {
    const rows = data.activities || [];
    byId('dashActivityList').innerHTML = rows.length ? rows.map((item) => `
      <div><strong>${item.aktion || 'Aktivitaet'}:</strong><span>${item.details || '-'}</span></div>
    `).join('') : '<div><strong>Keine Aktivitaeten:</strong><span>Noch keine Eintraege.</span></div>';
  }

  if (byId('dashSystemList')) {
    byId('dashSystemList').innerHTML = `
      <div><span>Homepage</span><strong class="bo-status ok">online</strong></div>
      <div><span>App</span><strong class="bo-status ok">online</strong></div>
      <div><span>Backoffice</span><strong class="bo-status ok">online</strong></div>
      <div><span>Mandanten</span><strong>${data.system?.mandanten || 0}</strong></div>
      <div><span>Nutzer</span><strong>${data.system?.users || 0}</strong></div>
      <div><span>Letzter Backup</span><strong>${data.system?.lastBackup || '-'}</strong></div>
    `;
  }
}

async function loadDashboard() {
  state.dashboard = await backofficeApi('/api/backoffice/dashboard');
  renderDashboard();
  renderReports();
  renderTechnik();
}

function renderReports() {
  const activeCustomers = state.customers.filter((item) => item.status === 'aktiv').length;
  const pausedCustomers = state.customers.filter((item) => item.status === 'pausiert' || item.status === 'gekuendigt').length;
  const openTickets = state.tickets.filter((item) => item.status !== 'erledigt').length;
  const wonLeads = state.leads.filter((item) => item.status === 'gewonnen').length;
  const totalLeads = state.leads.length;
  const conversion = totalLeads ? Math.round((wonLeads / totalLeads) * 100) : 0;
  const receivables = state.invoices
    .filter((item) => item.status === 'offen' || item.status === 'ueberfaellig')
    .reduce((sum, item) => sum + Number(item.betrag || 0), 0);

  if (byId('reportCustomerGrowth')) byId('reportCustomerGrowth').textContent = `${activeCustomers}`;
  if (byId('reportCustomerGrowthMeta')) byId('reportCustomerGrowthMeta').textContent = `${pausedCustomers} pausiert oder gekuendigt`;
  if (byId('reportTicketVolume')) byId('reportTicketVolume').textContent = `${openTickets}`;
  if (byId('reportTicketVolumeMeta')) byId('reportTicketVolumeMeta').textContent = `${state.tickets.filter((item) => item.status === 'erledigt').length} erledigt`;
  if (byId('reportLeadConversion')) byId('reportLeadConversion').textContent = `${conversion} %`;
  if (byId('reportLeadConversionMeta')) byId('reportLeadConversionMeta').textContent = `${wonLeads} von ${totalLeads} Leads gewonnen`;
  if (byId('reportOpenReceivables')) byId('reportOpenReceivables').textContent = formatCurrency(receivables);
  if (byId('reportOpenReceivablesMeta')) byId('reportOpenReceivablesMeta').textContent = `${state.invoices.filter((item) => item.status === 'ueberfaellig').length} ueberfaellig`;

  if (byId('reportSalesTableBody')) {
    byId('reportSalesTableBody').innerHTML = `
      <tr><td>Leads gesamt</td><td>${totalLeads}</td></tr>
      <tr><td>Leads im Angebot</td><td>${state.leads.filter((item) => item.status === 'angebot').length}</td></tr>
      <tr><td>Angebote gesendet</td><td>${state.offers.filter((item) => item.status === 'gesendet').length}</td></tr>
      <tr><td>Angebote angenommen</td><td>${state.offers.filter((item) => item.status === 'angenommen').length}</td></tr>
    `;
  }

  if (byId('reportServiceTableBody')) {
    byId('reportServiceTableBody').innerHTML = `
      <tr><td>Tickets offen</td><td>${state.tickets.filter((item) => item.status === 'offen').length}</td></tr>
      <tr><td>Tickets in Bearbeitung</td><td>${state.tickets.filter((item) => item.status === 'in_bearbeitung').length}</td></tr>
      <tr><td>Aufgaben offen</td><td>${state.tasks.filter((item) => item.status === 'offen').length}</td></tr>
      <tr><td>Aufgaben erledigt</td><td>${state.tasks.filter((item) => item.status === 'erledigt').length}</td></tr>
    `;
  }

  if (byId('reportFinanceTableBody')) {
    byId('reportFinanceTableBody').innerHTML = `
      <tr><td>Rechnungen offen</td><td>${formatCurrency(state.invoices.filter((item) => item.status === 'offen').reduce((sum, item) => sum + Number(item.betrag || 0), 0))}</td></tr>
      <tr><td>Rechnungen ueberfaellig</td><td>${formatCurrency(state.invoices.filter((item) => item.status === 'ueberfaellig').reduce((sum, item) => sum + Number(item.betrag || 0), 0))}</td></tr>
      <tr><td>Rechnungen bezahlt</td><td>${formatCurrency(state.invoices.filter((item) => item.status === 'bezahlt').reduce((sum, item) => sum + Number(item.betrag || 0), 0))}</td></tr>
      <tr><td>Anzahl Rechnungen</td><td>${state.invoices.length}</td></tr>
    `;
  }
}

function setSettingsMessage(message, type = '') {
  const target = byId('boSettingsMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function renderTechnik() {
  const activeMandants = state.mandants.filter((item) => item.status === 'aktiv').length;
  const totalUsers = state.employees.length + (state.dashboard?.system?.users || 0);
  const openOps = state.tickets.filter((item) => item.status !== 'erledigt').length
    + state.tasks.filter((item) => item.status !== 'erledigt').length;

  if (byId('techActiveInstances')) byId('techActiveInstances').textContent = String(activeMandants);
  if (byId('techActiveInstancesMeta')) byId('techActiveInstancesMeta').textContent = `${state.mandants.length} Mandanten insgesamt`;
  if (byId('techUsers')) byId('techUsers').textContent = String(totalUsers);
  if (byId('techUsersMeta')) byId('techUsersMeta').textContent = `${state.employees.length} Teammitglieder bei Kunden`;
  if (byId('techBackups')) byId('techBackups').textContent = 'OK';
  if (byId('techBackupsMeta')) byId('techBackupsMeta').textContent = state.dashboard?.system?.lastBackup || 'Letzter Lauf unbekannt';
  if (byId('techOpenOps')) byId('techOpenOps').textContent = String(openOps);
  if (byId('techOpenOpsMeta')) byId('techOpenOpsMeta').textContent = `${state.tickets.filter((item) => item.status !== 'erledigt').length} Tickets, ${state.tasks.filter((item) => item.status !== 'erledigt').length} Aufgaben`;

  if (byId('techSystemTableBody')) {
    byId('techSystemTableBody').innerHTML = `
      <tr><td>Homepage</td><td><span class="bo-status ok">online</span></td><td>Marketingseite erreichbar</td></tr>
      <tr><td>App</td><td><span class="bo-status ok">online</span></td><td>${state.dashboard?.system?.mandanten || 0} Mandanten verbunden</td></tr>
      <tr><td>Backoffice</td><td><span class="bo-status ok">online</span></td><td>Admin-Zugriff aktiv</td></tr>
      <tr><td>Backups</td><td><span class="bo-status warn">geplant</span></td><td>${state.dashboard?.system?.lastBackup || '-'}</td></tr>
    `;
  }

  if (byId('techOperationsTableBody')) {
    byId('techOperationsTableBody').innerHTML = `
      <tr><td>Offene Tickets</td><td>${state.tickets.filter((item) => item.status !== 'erledigt').length}</td></tr>
      <tr><td>Offene Aufgaben</td><td>${state.tasks.filter((item) => item.status !== 'erledigt').length}</td></tr>
      <tr><td>Offene Forderungen</td><td>${formatCurrency(state.invoices.filter((item) => item.status === 'offen' || item.status === 'ueberfaellig').reduce((sum, item) => sum + Number(item.betrag || 0), 0))}</td></tr>
      <tr><td>Dokumente gesamt</td><td>${state.documents.length}</td></tr>
    `;
  }
}

function renderSettings() {
  const settings = state.settings || {};
  const form = byId('boSettingsForm');
  if (form) {
    form.querySelector('[name="firmenname"]').value = settings.firmenname || '';
    form.querySelector('[name="marken_claim"]').value = settings.marken_claim || '';
    form.querySelector('[name="support_email"]').value = settings.support_email || '';
    form.querySelector('[name="vertrieb_email"]').value = settings.vertrieb_email || '';
    form.querySelector('[name="antwortadresse"]').value = settings.antwortadresse || '';
  form.querySelector('[name="standard_paket"]').value = settings.standard_paket || 'Starter';
  }
  if (byId('boSettingsSummaryBody')) {
    byId('boSettingsSummaryBody').innerHTML = `
      <tr><td>Firmenname</td><td>${settings.firmenname || '-'}</td></tr>
      <tr><td>Claim</td><td>${settings.marken_claim || '-'}</td></tr>
      <tr><td>Support</td><td>${settings.support_email || '-'}</td></tr>
      <tr><td>Vertrieb</td><td>${settings.vertrieb_email || '-'}</td></tr>
      <tr><td>Antwortadresse</td><td>${settings.antwortadresse || '-'}</td></tr>
      <tr><td>Standard-Paket</td><td>${settings.standard_paket || '-'}</td></tr>
    `;
  }
}

async function loadSettings() {
  state.settings = await backofficeApi('/api/backoffice/einstellungen');
  renderSettings();
}

async function handleSettingsSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.firmenname) throw new Error('Firmenname ist Pflicht.');
    state.settings = await backofficeApi('/api/backoffice/einstellungen', { method: 'PUT', body: JSON.stringify(payload) });
    renderSettings();
    setSettingsMessage('Einstellungen wurden gespeichert.');
  } catch (error) {
    setSettingsMessage(error.message || 'Einstellungen konnten nicht gespeichert werden.', 'error');
  }
}

function setInvoiceMessage(message, type = '') {
  const target = byId('boInvoiceMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function resetInvoiceForm() {
  state.editInvoiceId = null;
  const form = byId('boInvoiceForm');
  if (!form) return;
  form.reset();
  form.classList.add('hidden');
  setLayoutFormState(form, false);
  form.querySelector('[name="id"]').value = '';
  form.querySelector('[name="betrag"]').value = '0';
  if (byId('boInvoiceFormTitle')) byId('boInvoiceFormTitle').textContent = 'Rechnung anlegen';
  setInvoiceMessage('');
}

function openInvoiceForm(id = null) {
  const form = byId('boInvoiceForm');
  if (!form) return;
  form.classList.remove('hidden');
  setLayoutFormState(form, true);
  setInvoiceMessage('');
  if (!id) {
    state.editInvoiceId = null;
    form.reset();
    form.querySelector('[name="id"]').value = '';
    form.querySelector('[name="betrag"]').value = '0';
    if (byId('boInvoiceFormTitle')) byId('boInvoiceFormTitle').textContent = 'Rechnung anlegen';
    return;
  }
  const item = state.invoices.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  state.editInvoiceId = item.id;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="nummer"]').value = item.nummer || '';
  form.querySelector('[name="kunde"]').value = item.kunde || '';
  form.querySelector('[name="betrag"]').value = item.betrag || 0;
  form.querySelector('[name="faellig_am"]').value = item.faellig_am || '';
  form.querySelector('[name="status"]').value = item.status || 'entwurf';
  form.querySelector('[name="notiz"]').value = item.notiz || '';
  if (byId('boInvoiceFormTitle')) byId('boInvoiceFormTitle').textContent = 'Rechnung bearbeiten';
}

function renderInvoiceTable() {
  const target = byId('boInvoiceTableBody');
  if (!target) return;
  if (!state.invoices.length) {
    target.innerHTML = '<tr><td colspan="6">Keine Rechnungen vorhanden.</td></tr>';
  } else {
    target.innerHTML = state.invoices.map((item) => `
      <tr>
        <td><strong>${item.nummer || '-'}</strong></td>
        <td>${item.kunde || '-'}</td>
        <td>${formatCurrency(item.betrag)}</td>
        <td>${item.faellig_am || '-'}</td>
        <td><span class="${badgeClass(item.status)}">${item.status || '-'}</span></td>
        <td><button type="button" class="bo-inline-btn" data-invoice-edit="${item.id}">Bearbeiten</button> <button type="button" class="bo-inline-btn bo-inline-btn-danger" data-invoice-delete="${item.id}">Loeschen</button></td>
      </tr>
    `).join('');
  }

  const summary = byId('boInvoiceSummary');
  if (summary) {
    const offen = state.invoices.filter((item) => item.status === 'offen').reduce((sum, item) => sum + Number(item.betrag || 0), 0);
    const ueberfaellig = state.invoices.filter((item) => item.status === 'ueberfaellig').reduce((sum, item) => sum + Number(item.betrag || 0), 0);
    const bezahlt = state.invoices.filter((item) => item.status === 'bezahlt').reduce((sum, item) => sum + Number(item.betrag || 0), 0);
    summary.innerHTML = `
      <article><strong>${formatCurrency(offen)}</strong><span>Offen</span></article>
      <article><strong>${formatCurrency(ueberfaellig)}</strong><span>Ueberfaellig</span></article>
      <article><strong>${formatCurrency(bezahlt)}</strong><span>Bezahlt</span></article>
    `;
  }

  document.querySelectorAll('[data-invoice-edit]').forEach((node) => {
    node.addEventListener('click', () => openInvoiceForm(node.dataset.invoiceEdit));
  });
  document.querySelectorAll('[data-invoice-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.invoices.find((entry) => String(entry.id) === String(node.dataset.invoiceDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/rechnungen/${item.id}`, `Rechnung "${item.nummer}" wirklich loeschen?`))) return;
      await loadInvoices();
      await loadDashboard();
    });
  });
}

async function loadInvoices() {
  state.invoices = await backofficeApi('/api/backoffice/rechnungen');
  renderInvoiceTable();
}

function setMandantMessage(message, type = '') {
  const target = byId('boMandantMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function resetMandantForm() {
  state.editMandantId = null;
  const form = byId('boMandantForm');
  if (!form) return;
  form.reset();
  form.classList.add('hidden');
  setLayoutFormState(form, false);
  form.querySelector('[name="id"]').value = '';
  form.querySelector('[name="aktiv"]').value = 'true';
  if (byId('boMandantFormTitle')) byId('boMandantFormTitle').textContent = 'Mandant anlegen';
  setMandantMessage('');
}

function openMandantForm(id = null) {
  const form = byId('boMandantForm');
  if (!form) return;
  form.classList.remove('hidden');
  setLayoutFormState(form, true);
  setMandantMessage('');
  if (!id) {
    state.editMandantId = null;
    form.reset();
    form.querySelector('[name="id"]').value = '';
    form.querySelector('[name="aktiv"]').value = 'true';
    if (byId('boMandantFormTitle')) byId('boMandantFormTitle').textContent = 'Mandant anlegen';
    return;
  }
  const item = state.mandants.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  state.editMandantId = item.id;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="name"]').value = item.name || '';
  form.querySelector('[name="subdomain"]').value = item.subdomain || '';
  form.querySelector('[name="firma"]').value = item.firma || '';
  form.querySelector('[name="aktiv"]').value = item.aktiv === false ? 'false' : 'true';
  if (byId('boMandantFormTitle')) byId('boMandantFormTitle').textContent = 'Mandant bearbeiten';
}

function renderMandantTable() {
  const target = byId('boMandantTableBody');
  if (!target) return;
  if (!state.mandants.length) {
    target.innerHTML = '<tr><td colspan="6">Keine Mandanten vorhanden.</td></tr>';
    return;
  }
  target.innerHTML = state.mandants.map((item) => `
    <tr>
      <td><strong>${item.name || '-'}</strong><br><small>${item.subdomain || '-'}</small></td>
      <td>${item.firma || '-'}</td>
      <td>${item.url || '-'}</td>
      <td>${item.users || 0}</td>
      <td><span class="${badgeClass(item.status)}">${item.status || '-'}</span></td>
      <td><button type="button" class="bo-inline-btn" data-mandant-edit="${item.id}">Bearbeiten</button> <button type="button" class="bo-inline-btn bo-inline-btn-danger" data-mandant-delete="${item.id}">Loeschen</button></td>
    </tr>
  `).join('');
  document.querySelectorAll('[data-mandant-edit]').forEach((node) => {
    node.addEventListener('click', () => openMandantForm(node.dataset.mandantEdit));
  });
  document.querySelectorAll('[data-mandant-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.mandants.find((entry) => String(entry.id) === String(node.dataset.mandantDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/mandanten/${item.id}`, `Mandant "${item.name}" wirklich loeschen? Leere Grundstruktur, Kunde und Zugangslogins werden mit entfernt.`))) return;
      await loadMandants();
      await loadCustomers();
      await loadEmployees();
      await loadDashboard();
    });
  });
}

async function loadMandants() {
  state.mandants = await backofficeApi('/api/backoffice/mandanten');
  renderMandantTable();
}

function setPackageMessage(message, type = '') {
  const target = byId('boPackageMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function resetPackageForm() {
  state.editPackageId = null;
  const form = byId('boPackageForm');
  if (!form) return;
  form.reset();
  form.classList.add('hidden');
  setLayoutFormState(form, false);
  form.querySelector('[name="id"]').value = '';
  if (byId('boPackageFormTitle')) byId('boPackageFormTitle').textContent = 'Paket anlegen';
  setPackageMessage('');
}

function openPackageForm(id = null) {
  const form = byId('boPackageForm');
  if (!form) return;
  form.classList.remove('hidden');
  setLayoutFormState(form, true);
  setPackageMessage('');
  if (!id) {
    state.editPackageId = null;
    form.reset();
    form.querySelector('[name="id"]').value = '';
    if (byId('boPackageFormTitle')) byId('boPackageFormTitle').textContent = 'Paket anlegen';
    return;
  }
  const item = state.packages.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  state.editPackageId = item.id;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="name"]').value = item.name || '';
  form.querySelector('[name="preis"]').value = item.preis || '';
  form.querySelector('[name="standorte"]').value = item.standorte || '';
  form.querySelector('[name="abrechnung"]').value = item.abrechnung || 'monatlich';
  form.querySelector('[name="status"]').value = item.status || 'aktiv';
  form.querySelector('[name="beschreibung"]').value = item.beschreibung || '';
  form.querySelector('[name="leistungen"]').value = item.leistungen || '';
  if (byId('boPackageFormTitle')) byId('boPackageFormTitle').textContent = 'Paket bearbeiten';
}

function renderPackageTable() {
  const target = byId('boPackageTableBody');
  if (!target) return;
  if (!state.packages.length) {
    target.innerHTML = '<tr><td colspan="7">Keine Pakete vorhanden.</td></tr>';
    return;
  }
  target.innerHTML = state.packages.map((item) => `
      <tr>
        <td><strong>${item.name || '-'}</strong><br><small>${item.beschreibung || '-'}</small></td>
        <td>${item.preis || '-'}</td>
        <td>${item.abrechnung || '-'}</td>
        <td>${item.standorte || '-'}</td>
        <td><span class="${badgeClass(item.status)}">${item.status || '-'}</span></td>
        <td>${item.leistungen || '-'}</td>
      <td><button type="button" class="bo-inline-btn" data-package-edit="${item.id}">Bearbeiten</button> <button type="button" class="bo-inline-btn bo-inline-btn-danger" data-package-delete="${item.id}">Loeschen</button></td>
    </tr>
  `).join('');
  document.querySelectorAll('[data-package-edit]').forEach((node) => {
    node.addEventListener('click', () => openPackageForm(node.dataset.packageEdit));
  });
  document.querySelectorAll('[data-package-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.packages.find((entry) => String(entry.id) === String(node.dataset.packageDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/pakete/${item.id}`, `Paket "${item.name}" wirklich loeschen?`))) return;
      await loadPackages();
    });
  });
}

async function loadPackages() {
  state.packages = await backofficeApi('/api/backoffice/pakete');
  renderPackageTable();
  renderCustomerModuleHint();
}

function setOfferMessage(message, type = '') {
  const target = byId('boOfferMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function resetOfferForm() {
  state.editOfferId = null;
  const form = byId('boOfferForm');
  if (!form) return;
  form.reset();
  form.classList.add('hidden');
  setLayoutFormState(form, false);
  form.querySelector('[name="id"]').value = '';
  if (byId('boOfferFormTitle')) byId('boOfferFormTitle').textContent = 'Angebot anlegen';
  setOfferMessage('');
}

function openOfferForm(id = null) {
  const form = byId('boOfferForm');
  if (!form) return;
  form.classList.remove('hidden');
  setLayoutFormState(form, true);
  setOfferMessage('');
  if (!id) {
    state.editOfferId = null;
    form.reset();
    form.querySelector('[name="id"]').value = '';
    if (byId('boOfferFormTitle')) byId('boOfferFormTitle').textContent = 'Angebot anlegen';
    return;
  }
  const item = state.offers.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  state.editOfferId = item.id;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="kunde"]').value = item.kunde || '';
  form.querySelector('[name="paket"]').value = item.paket || 'Starter';
  form.querySelector('[name="volumen"]').value = item.volumen || '';
  form.querySelector('[name="status"]').value = item.status || 'entwurf';
  form.querySelector('[name="stand"]').value = item.stand || '';
  form.querySelector('[name="notiz"]').value = item.notiz || '';
  if (byId('boOfferFormTitle')) byId('boOfferFormTitle').textContent = 'Angebot bearbeiten';
}

function renderOfferTable() {
  const target = byId('boOfferTableBody');
  if (!target) return;
  if (!state.offers.length) {
    target.innerHTML = '<tr><td colspan="6">Keine Angebote vorhanden.</td></tr>';
    return;
  }
  target.innerHTML = state.offers.map((item) => `
    <tr>
      <td>${item.kunde || '-'}</td>
      <td>${item.paket || '-'}</td>
      <td>${item.volumen || '-'}</td>
      <td><span class="${badgeClass(item.status)}">${item.status || '-'}</span></td>
      <td>${item.stand || '-'}</td>
      <td><button type="button" class="bo-inline-btn" data-offer-edit="${item.id}">Bearbeiten</button> <button type="button" class="bo-inline-btn bo-inline-btn-danger" data-offer-delete="${item.id}">Loeschen</button></td>
    </tr>
  `).join('');
  document.querySelectorAll('[data-offer-edit]').forEach((node) => {
    node.addEventListener('click', () => openOfferForm(node.dataset.offerEdit));
  });
  document.querySelectorAll('[data-offer-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.offers.find((entry) => String(entry.id) === String(node.dataset.offerDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/angebote/${item.id}`, `Angebot fuer "${item.kunde}" wirklich loeschen?`))) return;
      await loadOffers();
      await loadDashboard();
    });
  });
}

async function loadOffers() {
  state.offers = await backofficeApi('/api/backoffice/angebote');
  renderOfferTable();
}

function setEmployeeMessage(message, type = '') {
  const target = byId('boEmployeeMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function slugifyLoginValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18);
}

function generateWelcomePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!?';
  let result = '';
  for (let index = 0; index < 12; index += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result + 'A1';
}

function buildWelcomeAccessText() {
  const form = byId('boEmployeeForm');
  if (!form) return 'Noch keine Zugangsdaten erzeugt.';
  const customerName = form.querySelector('[name="customer_id"]')?.selectedOptions?.[0]?.textContent || '-';
  const name = form.querySelector('[name="name"]')?.value || '-';
  const username = form.querySelector('[name="benutzername"]')?.value || '-';
  const email = form.querySelector('[name="email"]')?.value || '-';
  const password = form.querySelector('[name="passwort"]')?.value || '(bestehendes Passwort unveraendert)';
  const role = form.querySelector('[name="app_rolle"]')?.value || 'admin';
  return [
    `Kunde: ${customerName}`,
    `Name: ${name}`,
    `Login: ${username}`,
    `E-Mail: ${email}`,
    `Startpasswort: ${password}`,
    `App-Rolle: ${appRoleLabel(role)}`,
    'Login-URL: http://212.227.45.117/app'
  ].join('\n');
}

function renderWelcomeAccessText() {
  const target = byId('boWelcomeAccessText');
  if (!target) return;
  target.textContent = buildWelcomeAccessText();
}

function generateWelcomeAccess() {
  const form = byId('boEmployeeForm');
  if (!form) return;
  const nameField = form.querySelector('[name="name"]');
  const emailField = form.querySelector('[name="email"]');
  const usernameField = form.querySelector('[name="benutzername"]');
  const passwordField = form.querySelector('[name="passwort"]');
  const customerId = form.querySelector('[name="customer_id"]')?.value || '';
  const customer = (state.customers || []).find((item) => String(item.id) === String(customerId));
  const nameValue = String(nameField?.value || '').trim();
  const nameSeed = slugifyLoginValue(nameValue);
  const customerSeed = slugifyLoginValue(customer?.firma || '');
  const username = (nameSeed || customerSeed || 'kunde') + (customerId ? customerId : '');
  if (usernameField && !String(usernameField.value || '').trim()) usernameField.value = username.slice(0, 24);
  if (emailField && !String(emailField.value || '').trim() && customer?.email) emailField.value = customer.email;
  if (passwordField) passwordField.value = generateWelcomePassword();
  renderWelcomeAccessText();
  setEmployeeMessage('Willkommenszugang wurde erzeugt.');
}

async function copyWelcomeAccess() {
  const text = buildWelcomeAccessText();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      setEmployeeMessage('Zugangsdaten wurden kopiert.');
      return;
    }
  } catch (error) {
    // Fallback below
  }
  const target = byId('boWelcomeAccessText');
  if (target) {
    const range = document.createRange();
    range.selectNodeContents(target);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  setEmployeeMessage('Zugangsdaten markieren und kopieren.');
}

function renderEmployeeCustomerOptions(selectedValue = '') {
  const target = byId('boEmployeeCustomerSelect');
  if (!target) return;
  const rows = [...(state.customers || [])].sort((a, b) => String(a.firma || '').localeCompare(String(b.firma || ''), 'de'));
  target.innerHTML = [
    '<option value="">Kunden auswaehlen</option>',
    ...rows.map((item) => `<option value="${item.id}" ${String(item.id) === String(selectedValue) ? 'selected' : ''}>${item.firma}</option>`)
  ].join('');
}

function resetEmployeeForm() {
  state.editEmployeeId = null;
  const form = byId('boEmployeeForm');
  if (!form) return;
  form.reset();
  form.classList.add('hidden');
  setLayoutFormState(form, false);
  form.querySelector('[name="id"]').value = '';
  renderEmployeeCustomerOptions('');
  renderEmployeeRoleOptions('admin');
  renderWelcomeAccessText();
  if (byId('boEmployeeFormTitle')) byId('boEmployeeFormTitle').textContent = 'Teammitglied anlegen';
  setEmployeeMessage('');
}

function openEmployeeForm(id = null) {
  const form = byId('boEmployeeForm');
  if (!form) return;
  form.classList.remove('hidden');
  setLayoutFormState(form, true);
  setEmployeeMessage('');
  if (!id) {
    state.editEmployeeId = null;
    form.reset();
    form.querySelector('[name="id"]').value = '';
    renderEmployeeCustomerOptions('');
    renderEmployeeRoleOptions('admin');
    renderWelcomeAccessText();
    if (byId('boEmployeeFormTitle')) byId('boEmployeeFormTitle').textContent = 'Teammitglied anlegen';
    return;
  }
  const item = state.employees.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  state.editEmployeeId = item.id;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="name"]').value = item.name || '';
  renderEmployeeCustomerOptions(item.customer_id || '');
  form.querySelector('[name="rolle"]').value = item.rolle || 'fuhrparkleitung';
  form.querySelector('[name="status"]').value = item.status || 'aktiv';
  form.querySelector('[name="benutzername"]').value = item.benutzername || '';
  renderEmployeeRoleOptions(item.app_rolle || 'admin');
  form.querySelector('[name="email"]').value = item.email || '';
  form.querySelector('[name="telefon"]').value = item.telefon || '';
  form.querySelector('[name="passwort"]').value = '';
  renderWelcomeAccessText();
  if (byId('boEmployeeFormTitle')) byId('boEmployeeFormTitle').textContent = 'Teammitglied bearbeiten';
}

function renderEmployeeTable() {
  const target = byId('boEmployeeTableBody');
  if (!target) return;
  if (!state.employees.length) {
    target.innerHTML = '<tr><td colspan="7">Kein Kundenteam vorhanden.</td></tr>';
    return;
  }
  target.innerHTML = state.employees.map((item) => `
    <tr>
      <td>${item.name || '-'}</td>
      <td>${item.kunde || '-'}</td>
      <td>${item.benutzername || '-'}</td>
      <td>${appRoleLabel(item.app_rolle || '-')}</td>
      <td>${item.email || '-'}</td>
      <td><span class="${badgeClass(item.status)}">${item.status || '-'}</span></td>
      <td><button type="button" class="bo-inline-btn" data-employee-edit="${item.id}">Bearbeiten</button> <button type="button" class="bo-inline-btn bo-inline-btn-danger" data-employee-delete="${item.id}">Loeschen</button></td>
    </tr>
  `).join('');
  document.querySelectorAll('[data-employee-edit]').forEach((node) => {
    node.addEventListener('click', () => openEmployeeForm(node.dataset.employeeEdit));
  });
  document.querySelectorAll('[data-employee-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.employees.find((entry) => String(entry.id) === String(node.dataset.employeeDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/mitarbeiter/${item.id}`, `Teammitglied "${item.name}" wirklich loeschen?`))) return;
      await loadEmployees();
    });
  });
}

async function loadEmployees() {
  state.employees = await backofficeApi('/api/backoffice/mitarbeiter');
  renderEmployeeTable();
}

function setPersonnelMessage(message, type = '') {
  const target = byId('boPersonnelMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function resetPersonnelForm() {
  state.editPersonnelId = null;
  const form = byId('boPersonnelForm');
  if (!form) return;
  form.reset();
  form.querySelector('[name="id"]').value = '';
  if (byId('boPersonnelFormTitle')) byId('boPersonnelFormTitle').textContent = 'Mitarbeiter anlegen';
  setPersonnelMessage('');
  togglePersonnelModal(false);
}

function openPersonnelForm(id = null) {
  const form = byId('boPersonnelForm');
  if (!form) return;
  setPersonnelMessage('');
  togglePersonnelModal(true);
  if (!id) {
    state.editPersonnelId = null;
    form.reset();
    form.querySelector('[name="id"]').value = '';
    if (byId('boPersonnelFormTitle')) byId('boPersonnelFormTitle').textContent = 'Mitarbeiter anlegen';
    return;
  }
  const item = state.personnel.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  state.editPersonnelId = item.id;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="name"]').value = item.name || '';
  form.querySelector('[name="abteilung"]').value = item.abteilung || '';
  form.querySelector('[name="rolle"]').value = item.rolle || '';
  form.querySelector('[name="status"]').value = item.status || 'aktiv';
  form.querySelector('[name="email"]').value = item.email || '';
  form.querySelector('[name="telefon"]').value = item.telefon || '';
  form.querySelector('[name="startdatum"]').value = item.startdatum || '';
    form.querySelector('[name="gehalt"]').value = item.gehalt || '';
    form.querySelector('[name="personalakte_nummer"]').value = item.personalakte_nummer || '';
    form.querySelector('[name="personalakte_status"]').value = item.personalakte_status || '';
    form.querySelector('[name="mitarbeiterportal_status"]').value = item.mitarbeiterportal_status || '';
    form.querySelector('[name="recruiting_phase"]').value = item.recruiting_phase || '';
    form.querySelector('[name="performance_status"]').value = item.performance_status || '';
    form.querySelector('[name="zeiterfassung_modell"]').value = item.zeiterfassung_modell || '';
    form.querySelector('[name="kostenstelle"]').value = item.kostenstelle || '';
    form.querySelector('[name="backoffice_rolle"]').value = item.backoffice_rolle || 'mitarbeiter';
    form.querySelector('[name="zugang_login"]').value = item.zugang_login || '';
    form.querySelector('[name="zugang_passwort"]').value = item.zugang_passwort || '';
    form.querySelector('[name="notiz"]').value = item.notiz || '';
  if (byId('boPersonnelFormTitle')) byId('boPersonnelFormTitle').textContent = 'Mitarbeiter bearbeiten';
}

function renderPersonnelTable() {
  const target = byId('boPersonnelTableBody');
  if (!target) return;
  if (!state.personnel.length) {
    target.innerHTML = '<tr><td colspan="9">Keine HR- oder Personal-Daten vorhanden.</td></tr>';
    return;
  }
  target.innerHTML = state.personnel.map((item) => `
      <tr>
        <td><strong>${item.name || '-'}</strong><br><small>${item.email || '-'}</small></td>
        <td>${item.abteilung || '-'}</td>
      <td>${item.rolle || '-'}</td>
      <td>${appRoleLabel(item.backoffice_rolle || 'mitarbeiter')}<br><small>${item.mitarbeiterportal_status || '-'}</small></td>
        <td>${item.startdatum || '-'}</td>
        <td>${item.gehalt || '-'}</td>
        <td>${item.zugang_login || '-'}</td>
        <td><span class="${badgeClass(item.status)}">${item.status || '-'}</span></td>
        <td><button type="button" class="bo-inline-btn" data-personnel-edit="${item.id}">Bearbeiten</button> <button type="button" class="bo-inline-btn bo-inline-btn-danger" data-personnel-delete="${item.id}">Loeschen</button></td>
    </tr>
  `).join('');
  document.querySelectorAll('[data-personnel-edit]').forEach((node) => {
    node.addEventListener('click', () => openPersonnelForm(node.dataset.personnelEdit));
  });
  document.querySelectorAll('[data-personnel-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.personnel.find((entry) => String(entry.id) === String(node.dataset.personnelDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/personal/${item.id}`, `Personal-Eintrag "${item.name}" wirklich loeschen?`))) return;
      await loadPersonnel();
    });
  });
}

async function loadPersonnel() {
  if (!canSeePersonnel()) {
    state.personnel = [];
    renderPersonnelTable();
    return;
  }
  state.personnel = await backofficeApi('/api/backoffice/personal');
  renderPersonnelTable();
}

function setTaskMessage(message, type = '') {
  const target = byId('boTaskMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function resetTaskForm() {
  state.editTaskId = null;
  const form = byId('boTaskForm');
  if (!form) return;
  form.reset();
  form.classList.add('hidden');
  setLayoutFormState(form, false);
  form.querySelector('[name="id"]').value = '';
  if (byId('boTaskFormTitle')) byId('boTaskFormTitle').textContent = 'Aufgabe anlegen';
  setTaskMessage('');
}

function openTaskForm(id = null) {
  const form = byId('boTaskForm');
  if (!form) return;
  form.classList.remove('hidden');
  setLayoutFormState(form, true);
  setTaskMessage('');
  if (!id) {
    state.editTaskId = null;
    form.reset();
    form.querySelector('[name="id"]').value = '';
    if (byId('boTaskFormTitle')) byId('boTaskFormTitle').textContent = 'Aufgabe anlegen';
    return;
  }
  const item = state.tasks.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  state.editTaskId = item.id;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="titel"]').value = item.titel || '';
  form.querySelector('[name="bereich"]').value = item.bereich || 'allgemein';
  form.querySelector('[name="status"]').value = item.status || 'offen';
  form.querySelector('[name="faellig_am"]').value = item.faellig_am || '';
  form.querySelector('[name="notiz"]').value = item.notiz || '';
  if (byId('boTaskFormTitle')) byId('boTaskFormTitle').textContent = 'Aufgabe bearbeiten';
}

function renderTaskTable() {
  const target = byId('boTaskTableBody');
  if (!target) return;
  if (!state.tasks.length) {
    target.innerHTML = '<tr><td colspan="5">Keine Aufgaben vorhanden.</td></tr>';
    return;
  }
  target.innerHTML = state.tasks.map((item) => `
    <tr>
      <td>${item.titel || '-'}</td>
      <td>${item.bereich || '-'}</td>
      <td><span class="${badgeClass(item.status)}">${item.status || '-'}</span></td>
      <td>${item.faellig_am || '-'}</td>
      <td><button type="button" class="bo-inline-btn" data-task-edit="${item.id}">Bearbeiten</button> <button type="button" class="bo-inline-btn bo-inline-btn-danger" data-task-delete="${item.id}">Loeschen</button></td>
    </tr>
  `).join('');
  document.querySelectorAll('[data-task-edit]').forEach((node) => {
    node.addEventListener('click', () => openTaskForm(node.dataset.taskEdit));
  });
  document.querySelectorAll('[data-task-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.tasks.find((entry) => String(entry.id) === String(node.dataset.taskDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/aufgaben/${item.id}`, `Aufgabe "${item.titel}" wirklich loeschen?`))) return;
      await loadTasks();
      await loadDashboard();
    });
  });
}

async function loadTasks() {
  state.tasks = await backofficeApi('/api/backoffice/aufgaben');
  renderTaskTable();
}

function setDocumentMessage(message, type = '') {
  const target = byId('boDocumentMessage');
  if (!target) return;
  target.textContent = message || '';
  target.className = 'bo-form-message' + (type === 'error' ? ' bo-error' : '');
}

function resetDocumentForm() {
  state.editDocumentId = null;
  const form = byId('boDocumentForm');
  if (!form) return;
  form.reset();
  form.classList.add('hidden');
  setLayoutFormState(form, false);
  form.querySelector('[name="id"]').value = '';
  if (byId('boDocumentFormTitle')) byId('boDocumentFormTitle').textContent = 'Dokument anlegen';
  setDocumentMessage('');
}

function openDocumentForm(id = null) {
  const form = byId('boDocumentForm');
  if (!form) return;
  form.classList.remove('hidden');
  setLayoutFormState(form, true);
  setDocumentMessage('');
  if (!id) {
    state.editDocumentId = null;
    form.reset();
    form.querySelector('[name="id"]').value = '';
    if (byId('boDocumentFormTitle')) byId('boDocumentFormTitle').textContent = 'Dokument anlegen';
    return;
  }
  const item = state.documents.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  state.editDocumentId = item.id;
  form.querySelector('[name="id"]').value = item.id || '';
  form.querySelector('[name="titel"]').value = item.titel || '';
  form.querySelector('[name="typ"]').value = item.typ || 'sonstiges';
  form.querySelector('[name="status"]').value = item.status || 'aktiv';
  form.querySelector('[name="bezug"]').value = item.bezug || '';
  form.querySelector('[name="notiz"]').value = item.notiz || '';
  if (byId('boDocumentFormTitle')) byId('boDocumentFormTitle').textContent = 'Dokument bearbeiten';
}

function renderDocumentTable() {
  const target = byId('boDocumentTableBody');
  if (!target) return;
  if (!state.documents.length) {
    target.innerHTML = '<tr><td colspan="5">Keine Dokumente vorhanden.</td></tr>';
    return;
  }
  target.innerHTML = state.documents.map((item) => `
    <tr>
      <td>${item.titel || '-'}</td>
      <td>${item.typ || '-'}</td>
      <td>${item.bezug || '-'}</td>
      <td><span class="${badgeClass(item.status)}">${item.status || '-'}</span></td>
      <td><button type="button" class="bo-inline-btn" data-document-edit="${item.id}">Bearbeiten</button> <button type="button" class="bo-inline-btn bo-inline-btn-danger" data-document-delete="${item.id}">Loeschen</button></td>
    </tr>
  `).join('');
  document.querySelectorAll('[data-document-edit]').forEach((node) => {
    node.addEventListener('click', () => openDocumentForm(node.dataset.documentEdit));
  });
  document.querySelectorAll('[data-document-delete]').forEach((node) => {
    node.addEventListener('click', async () => {
      const item = state.documents.find((entry) => String(entry.id) === String(node.dataset.documentDelete));
      if (!item) return;
      if (!(await deleteBackofficeEntry(`/api/backoffice/dokumente/${item.id}`, `Dokument "${item.titel}" wirklich loeschen?`))) return;
      await loadDocuments();
    });
  });
}

async function loadDocuments() {
  state.documents = await backofficeApi('/api/backoffice/dokumente');
  renderDocumentTable();
}

async function handleBackofficeLogin(event) {
  event.preventDefault();
  const errorNode = byId('boLoginError');
  try {
      const payload = Object.fromEntries(new FormData(event.target));
      const result = await backofficeApi('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
      if (!['superadmin', 'hauptadmin', 'hr', 'mitarbeiter'].includes(result.user?.rolle)) {
        throw new Error('Backoffice-Zugang fehlt fuer diese Rolle.');
      }
    state.token = result.token;
    state.user = result.user;
    localStorage.setItem('backoffice_token', result.token);
    localStorage.setItem('backoffice_user', JSON.stringify(result.user));
    if (byId('boUserName')) byId('boUserName').textContent = result.user.name || result.user.benutzername || '-';
      if (byId('boUserRole')) byId('boUserRole').textContent = appRoleLabel(result.user.rolle || '-');
      if (errorNode) errorNode.textContent = '';
      setAuthVisible(true);
      applyBackofficeAccessRules();
      await loadCustomers();
    await loadLeads();
    await loadTickets();
    await loadInvoices();
      await loadMandants();
      await loadPackages();
    await loadModuleCatalog();
    await loadOffers();
    await loadEmployees();
    await loadPersonnel();
    await loadTasks();
    await loadDocuments();
      await loadSettings();
      await loadDashboard();
      setBackofficeView(desiredBackofficeView());
  } catch (error) {
    if (errorNode) errorNode.textContent = error.message || 'Login fehlgeschlagen.';
  }
}

async function handleCustomerSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const payload = Object.fromEntries(new FormData(form));
  try {
    if (!payload.firma) throw new Error('Firmenname ist Pflicht.');
    if (payload.id) {
      await backofficeApi(`/api/backoffice/kunden/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setCustomerMessage('Kunde wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/kunden', { method: 'POST', body: JSON.stringify(payload) });
      setCustomerMessage('Kunde wurde angelegt.');
    }
    await loadCustomers();
    await loadMandants();
    await loadModuleCatalog();
    await loadDashboard();
    resetCustomerForm();
  } catch (error) {
    setCustomerMessage(error.message || 'Kunde konnte nicht gespeichert werden.', 'error');
  }
}

async function handleLeadSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.name || !payload.firma) throw new Error('Name und Firma sind Pflicht.');
    if (payload.status === 'demo') {
      payload.demo_start = payload.demo_start || todayIso();
      payload.demo_end = payload.demo_end || addDaysClient(payload.demo_start, 7);
    } else {
      payload.demo_start = '';
      payload.demo_end = '';
    }
    if (payload.id) {
      await backofficeApi(`/api/backoffice/leads/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setLeadMessage('Anfrage wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/leads', { method: 'POST', body: JSON.stringify(payload) });
      setLeadMessage('Anfrage wurde angelegt.');
    }
    await loadLeads();
    await loadDashboard();
    resetLeadForm();
  } catch (error) {
    setLeadMessage(error.message || 'Anfrage konnte nicht gespeichert werden.', 'error');
  }
}

async function handleTicketSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.kunde || !payload.betreff) throw new Error('Kunde und Betreff sind Pflicht.');
    if (payload.id) {
      await backofficeApi(`/api/backoffice/tickets/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setTicketMessage('Ticket wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/tickets', { method: 'POST', body: JSON.stringify(payload) });
      setTicketMessage('Ticket wurde angelegt.');
    }
    await loadTickets();
    await loadDashboard();
    resetTicketForm();
  } catch (error) {
    setTicketMessage(error.message || 'Ticket konnte nicht gespeichert werden.', 'error');
  }
}

async function handleInvoiceSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.kunde) throw new Error('Kunde ist Pflicht.');
    if (payload.id) {
      await backofficeApi(`/api/backoffice/rechnungen/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setInvoiceMessage('Rechnung wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/rechnungen', { method: 'POST', body: JSON.stringify(payload) });
      setInvoiceMessage('Rechnung wurde angelegt.');
    }
    await loadInvoices();
    await loadDashboard();
    resetInvoiceForm();
  } catch (error) {
    setInvoiceMessage(error.message || 'Rechnung konnte nicht gespeichert werden.', 'error');
  }
}

async function handleMandantSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.name) throw new Error('Mandantenname ist Pflicht.');
    if (payload.id) {
      await backofficeApi(`/api/backoffice/mandanten/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setMandantMessage('Mandant wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/mandanten', { method: 'POST', body: JSON.stringify(payload) });
      setMandantMessage('Mandant wurde angelegt.');
    }
    await loadMandants();
    await loadCustomers();
    await loadDashboard();
    resetMandantForm();
  } catch (error) {
    setMandantMessage(error.message || 'Mandant konnte nicht gespeichert werden.', 'error');
  }
}

async function handlePackageSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.name) throw new Error('Paketname ist Pflicht.');
    if (payload.id) {
      await backofficeApi(`/api/backoffice/pakete/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setPackageMessage('Paket wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/pakete', { method: 'POST', body: JSON.stringify(payload) });
      setPackageMessage('Paket wurde angelegt.');
    }
    await loadPackages();
    resetPackageForm();
  } catch (error) {
    setPackageMessage(error.message || 'Paket konnte nicht gespeichert werden.', 'error');
  }
}

async function handleModuleCatalogSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.name || !payload.label) throw new Error('Modulname und Label sind Pflicht.');
    payload.name = String(payload.name || '').trim().toLowerCase();
    if (payload.id) {
      await backofficeApi(`/api/backoffice/module-catalog/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setModuleCatalogMessage('Modul wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/module-catalog', { method: 'POST', body: JSON.stringify(payload) });
      setModuleCatalogMessage('Modul wurde angelegt.');
    }
    await loadModuleCatalog();
    resetModuleCatalogForm();
  } catch (error) {
    setModuleCatalogMessage(error.message || 'Modul konnte nicht gespeichert werden.', 'error');
  }
}

async function handleOfferSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.kunde) throw new Error('Kunde ist Pflicht.');
    if (payload.id) {
      await backofficeApi(`/api/backoffice/angebote/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setOfferMessage('Angebot wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/angebote', { method: 'POST', body: JSON.stringify(payload) });
      setOfferMessage('Angebot wurde angelegt.');
    }
    await loadOffers();
    await loadDashboard();
    resetOfferForm();
  } catch (error) {
    setOfferMessage(error.message || 'Angebot konnte nicht gespeichert werden.', 'error');
  }
}

async function handleEmployeeSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.customer_id) throw new Error('Bitte einen Kunden auswaehlen.');
    if (!payload.name) throw new Error('Name ist Pflicht.');
    if (!payload.benutzername) throw new Error('Benutzername ist Pflicht.');
    if (!payload.email) throw new Error('E-Mail ist Pflicht.');
    if (!payload.id && !payload.passwort) throw new Error('Bitte ein Startpasswort vergeben.');
    if (payload.id) {
      await backofficeApi(`/api/backoffice/mitarbeiter/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setEmployeeMessage('Teammitglied wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/mitarbeiter', { method: 'POST', body: JSON.stringify(payload) });
      setEmployeeMessage('Teammitglied wurde angelegt.');
    }
    await loadEmployees();
    resetEmployeeForm();
  } catch (error) {
    setEmployeeMessage(error.message || 'Teammitglied konnte nicht gespeichert werden.', 'error');
  }
}

async function handlePersonnelSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.name) throw new Error('Name ist Pflicht.');
    if (payload.id) {
      await backofficeApi(`/api/backoffice/personal/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setPersonnelMessage('Mitarbeiter wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/personal', { method: 'POST', body: JSON.stringify(payload) });
      setPersonnelMessage('Mitarbeiter wurde angelegt.');
    }
    await loadPersonnel();
    resetPersonnelForm();
  } catch (error) {
    setPersonnelMessage(error.message || 'Personal-Eintrag konnte nicht gespeichert werden.', 'error');
  }
}

async function handleTaskSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.titel) throw new Error('Titel ist Pflicht.');
    if (payload.id) {
      await backofficeApi(`/api/backoffice/aufgaben/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setTaskMessage('Aufgabe wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/aufgaben', { method: 'POST', body: JSON.stringify(payload) });
      setTaskMessage('Aufgabe wurde angelegt.');
    }
    await loadTasks();
    resetTaskForm();
  } catch (error) {
    setTaskMessage(error.message || 'Aufgabe konnte nicht gespeichert werden.', 'error');
  }
}

async function handleDocumentSubmit(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.target));
  try {
    if (!payload.titel) throw new Error('Titel ist Pflicht.');
    if (payload.id) {
      await backofficeApi(`/api/backoffice/dokumente/${payload.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      setDocumentMessage('Dokument wurde aktualisiert.');
    } else {
      await backofficeApi('/api/backoffice/dokumente', { method: 'POST', body: JSON.stringify(payload) });
      setDocumentMessage('Dokument wurde angelegt.');
    }
    await loadDocuments();
    resetDocumentForm();
  } catch (error) {
    setDocumentMessage(error.message || 'Dokument konnte nicht gespeichert werden.', 'error');
  }
}

async function handleLogoutClick() {
  logoutBackoffice();
}

function bindEvents() {
  document.querySelectorAll('.bo-nav-btn').forEach((node) => {
    node.addEventListener('click', () => setBackofficeView(node.dataset.view));
  });
window.addEventListener('hashchange', () => {
  if (state.token) setBackofficeView(desiredBackofficeView());
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !byId('boPersonnelModal')?.classList.contains('hidden')) {
    resetPersonnelForm();
  }
});
  byId('boLoginForm')?.addEventListener('submit', handleBackofficeLogin);
  byId('boCustomerForm')?.addEventListener('submit', handleCustomerSubmit);
  byId('boLeadForm')?.addEventListener('submit', handleLeadSubmit);
  byId('boTicketForm')?.addEventListener('submit', handleTicketSubmit);
  byId('boInvoiceForm')?.addEventListener('submit', handleInvoiceSubmit);
  byId('boMandantForm')?.addEventListener('submit', handleMandantSubmit);
  byId('boPackageForm')?.addEventListener('submit', handlePackageSubmit);
  byId('boModuleCatalogForm')?.addEventListener('submit', handleModuleCatalogSubmit);
  byId('boOfferForm')?.addEventListener('submit', handleOfferSubmit);
  byId('boEmployeeForm')?.addEventListener('submit', handleEmployeeSubmit);
  byId('boPersonnelForm')?.addEventListener('submit', handlePersonnelSubmit);
  byId('boTaskForm')?.addEventListener('submit', handleTaskSubmit);
  byId('boDocumentForm')?.addEventListener('submit', handleDocumentSubmit);
  byId('boSettingsForm')?.addEventListener('submit', handleSettingsSubmit);
  byId('openCustomerFormBtn')?.addEventListener('click', () => openCustomerForm());
  byId('openLeadFormBtn')?.addEventListener('click', () => openLeadForm());
  byId('openTicketFormBtn')?.addEventListener('click', () => openTicketForm());
  byId('openInvoiceFormBtn')?.addEventListener('click', () => openInvoiceForm());
  byId('openMandantFormBtn')?.addEventListener('click', () => openMandantForm());
  byId('openPackageFormBtn')?.addEventListener('click', () => openPackageForm());
  byId('openOfferFormBtn')?.addEventListener('click', () => openOfferForm());
  byId('openEmployeeFormBtn')?.addEventListener('click', () => openEmployeeForm());
  byId('openPersonnelFormBtn')?.addEventListener('click', () => openPersonnelForm());
  byId('openTaskFormBtn')?.addEventListener('click', () => openTaskForm());
  byId('openDocumentFormBtn')?.addEventListener('click', () => openDocumentForm());
  byId('generateWelcomeAccessBtn')?.addEventListener('click', generateWelcomeAccess);
  byId('copyWelcomeAccessBtn')?.addEventListener('click', copyWelcomeAccess);
  byId('quickCreateCustomerBtn')?.addEventListener('click', () => {
    setBackofficeView('kunden');
    openCustomerForm();
  });
  byId('boLogoutBtn')?.addEventListener('click', handleLogoutClick);
  byId('boCustomerCancelBtn')?.addEventListener('click', resetCustomerForm);
  byId('boLeadCancelBtn')?.addEventListener('click', resetLeadForm);
  byId('boTicketCancelBtn')?.addEventListener('click', resetTicketForm);
  byId('boInvoiceCancelBtn')?.addEventListener('click', resetInvoiceForm);
  byId('boMandantCancelBtn')?.addEventListener('click', resetMandantForm);
  byId('boPackageCancelBtn')?.addEventListener('click', resetPackageForm);
  byId('boModuleCatalogCancelBtn')?.addEventListener('click', resetModuleCatalogForm);
  byId('boOfferCancelBtn')?.addEventListener('click', resetOfferForm);
  byId('boEmployeeCancelBtn')?.addEventListener('click', resetEmployeeForm);
  byId('boPersonnelCancelBtn')?.addEventListener('click', resetPersonnelForm);
  byId('boPersonnelModal')?.addEventListener('click', (event) => {
    if (event.target?.hasAttribute('data-close-personnel-modal')) resetPersonnelForm();
  });
  byId('boTaskCancelBtn')?.addEventListener('click', resetTaskForm);
  byId('boDocumentCancelBtn')?.addEventListener('click', resetDocumentForm);
  byId('boCustomerSearch')?.addEventListener('input', (event) => {
    state.filters.q = event.target.value || '';
    renderCustomerTable();
  });
  byId('boLeadForm')?.addEventListener('change', (event) => {
    if (event.target?.name === 'status' || event.target?.name === 'demo_start') {
      syncLeadDemoDates();
    }
  });
  byId('boEmployeeForm')?.addEventListener('input', (event) => {
    if (event.target?.name && ['customer_id', 'name', 'benutzername', 'email', 'passwort', 'app_rolle'].includes(event.target.name)) {
      renderWelcomeAccessText();
    }
  });
  byId('boCustomerStatusFilter')?.addEventListener('change', (event) => {
    state.filters.status = event.target.value || '';
    renderCustomerTable();
  });
  byId('boCustomerPackageFilter')?.addEventListener('change', (event) => {
    state.filters.paket = event.target.value || '';
    renderCustomerTable();
  });
  byId('boCustomerForm')?.addEventListener('change', (event) => {
    if (event.target?.name === 'paket') renderCustomerModuleHint();
  });
}

async function bootstrap() {
  bindEvents();
  if (state.user && state.token) {
    if (byId('boUserName')) byId('boUserName').textContent = state.user.name || state.user.benutzername || '-';
    if (byId('boUserRole')) byId('boUserRole').textContent = appRoleLabel(state.user.rolle || '-');
      setAuthVisible(true);
      applyBackofficeAccessRules();
      try {
        await loadCustomers();
      await loadLeads();
      await loadTickets();
      await loadInvoices();
      await loadMandants();
      await loadPackages();
      await loadModuleCatalog();
      await loadOffers();
      await loadEmployees();
      await loadPersonnel();
      await loadTasks();
      await loadDocuments();
      await loadSettings();
      await loadDashboard();
    } catch (error) {
      logoutBackoffice();
    }
    } else {
      setAuthVisible(false);
    }
    applyBackofficeAccessRules();
    setBackofficeView(desiredBackofficeView());
  }

bootstrap();
