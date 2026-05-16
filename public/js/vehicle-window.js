(function () {
  const token = sessionStorage.getItem('fuhrpark_token') || localStorage.getItem('fuhrpark_token') || '';
  const params = new URLSearchParams(window.location.search);
  const vehicleId = Number(params.get('id'));

  const el = (id) => document.getElementById(id);

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Fehlerhafte Antwort.' }));
      throw new Error(error.error || 'Fehler');
    }
    return response.json();
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

  function statusClass(value) {
    return `status-${String(value || '').toLowerCase().replace(/\s+/g, '_')}`;
  }

  function renderEmpty(text) {
    return `<div class="empty-note">${text}</div>`;
  }

  function renderMeta(vehicle) {
    const rows = [
      ['Kennzeichen', vehicle.kennzeichen || '-'],
      ['Modell', vehicle.fahrzeug || '-'],
      ['Standort', vehicle.standort || '-'],
      ['Status', vehicle.status || '-'],
      ['FIN', vehicle.fin || '-'],
      ['Radiocode', vehicle.radiocode || '-'],
      ['ARAL', vehicle.tankkarte_aral_nummer || '-'],
      ['SHELL', vehicle.tankkarte_shell_nummer || '-'],
      ['HU', formatShortDate(vehicle.hu_datum)],
      ['UVV', formatShortDate(vehicle.uvv_datum)],
      ['Fahrzeugschein', vehicle.fahrzeugschein_pdf ? 'PDF hinterlegt' : 'Kein PDF'],
      ['Angelegt', formatShortDate(vehicle.created_at)]
    ];
    return rows.map(([label, value]) => `<div class="meta-row"><span>${label}</span><strong>${value}</strong></div>`).join('');
  }

  function renderWorkshop(rows) {
    if (!rows.length) return renderEmpty('Kein Werkstattauftrag zugewiesen.');
    return rows.map((item) => `
      <div class="stack-item">
        <strong>${item.werkstatt_name || `Werkstatt ${item.workshop_slot || '-'}`}</strong>
        <p>${item.beschreibung || item.problem || 'Kein Werkstatttext hinterlegt.'}</p>
        <div class="inline-badge-row">
          <span class="inline-badge">Status: ${item.status || '-'}</span>
          <span class="inline-badge">Von: ${formatShortDate(item.datum_von)}</span>
          <span class="inline-badge">Bis: ${formatShortDate(item.datum_bis)}</span>
        </div>
      </div>
    `).join('');
  }

  function renderDamage(rows) {
    if (!rows.length) return renderEmpty('Keine Schaeden vorhanden.');
    return rows.map((item) => `
      <div class="stack-item">
        <strong>${item.status || 'gemeldet'}</strong>
        <p>${item.beschreibung || 'Keine Beschreibung hinterlegt.'}</p>
        <div class="inline-badge-row">
          <span class="inline-badge">Datum: ${formatShortDate(item.datum)}</span>
          <span class="inline-badge">Fahrer: ${item.fahrer_name || '-'}</span>
        </div>
      </div>
    `).join('');
  }

  function renderChecks(uvvRows, docs, vehicle) {
    const pieces = [];
    if (vehicle.hu_datum || vehicle.uvv_datum) {
      pieces.push(`
        <div class="stack-item">
          <strong>Termine</strong>
          <p>HU: ${formatShortDate(vehicle.hu_datum)} | UVV: ${formatShortDate(vehicle.uvv_datum)}</p>
          <div class="inline-badge-row">
            <span class="inline-badge">HU in ${daysUntil(vehicle.hu_datum) ?? '-'} Tagen</span>
            <span class="inline-badge">UVV in ${daysUntil(vehicle.uvv_datum) ?? '-'} Tagen</span>
          </div>
        </div>
      `);
    }
    if (uvvRows.length) {
      pieces.push(...uvvRows.map((item) => `
        <div class="stack-item">
          <strong>UVV vom ${formatShortDate(item.datum)}</strong>
          <p>${item.kommentar || 'Keine Bemerkung hinterlegt.'}</p>
          <div class="inline-badge-row">
            <span class="inline-badge">Naechste Pruefung: ${formatShortDate(item.naechste_pruefung_datum)}</span>
            <span class="inline-badge">Pruefer: ${item.pruefer || '-'}</span>
          </div>
        </div>
      `));
    }
    if (docs.length) {
      pieces.push(...docs.map((doc) => `
        <div class="stack-item">
          <strong>${doc.name || 'Dokument'}</strong>
          <p>${doc.typ || 'Sonstiges'} | ${formatShortDate(doc.datum)}</p>
        </div>
      `));
    }
    return pieces.length ? pieces.join('') : renderEmpty('Keine Pruefungen oder Dokumente vorhanden.');
  }

  function renderKpis(vehicle, workshopRows, damageRows, uvvRows) {
    const huDays = daysUntil(vehicle.hu_datum);
    const uvvDays = daysUntil(vehicle.uvv_datum);
    return `
      <article class="kpi-card"><span>Status</span><strong>${vehicle.status || '-'}</strong></article>
      <article class="kpi-card"><span>Werkstattauftraege</span><strong>${workshopRows.length}</strong></article>
      <article class="kpi-card"><span>Schaeden</span><strong>${damageRows.length}</strong></article>
      <article class="kpi-card"><span>UVV Eintraege</span><strong>${uvvRows.length}</strong></article>
      <article class="kpi-card"><span>HU in Tagen</span><strong>${huDays ?? '-'}</strong></article>
      <article class="kpi-card"><span>UVV in Tagen</span><strong>${uvvDays ?? '-'}</strong></article>
    `;
  }

  function bindButtons(vehicle) {
    el('closeWindowBtn')?.addEventListener('click', () => window.close());
    el('reloadBtn')?.addEventListener('click', () => window.location.reload());
    el('editVehicleBtn')?.addEventListener('click', () => {
      const popup = window.open(
        `/vehicle-editor.html?id=${vehicleId}`,
        `fleetcontrol24_vehicle_editor_${vehicleId}`,
        'popup=yes,width=1380,height=960,resizable=yes,scrollbars=yes'
      );
      if (popup) popup.focus();
    });
    el('openDocsBtn')?.addEventListener('click', () => {
      const popup = window.open(
        `/vehicle-documents.html?id=${vehicleId}`,
        `fleetcontrol24_vehicle_docs_${vehicleId}`,
        'popup=yes,width=1280,height=900,resizable=yes,scrollbars=yes'
      );
      if (popup) popup.focus();
    });
    el('gotoDamageBtn')?.addEventListener('click', () => {
      window.opener?.focus();
      if (window.opener?.location) window.opener.location.hash = '#schaeden';
    });
    el('gotoWorkshopBtn')?.addEventListener('click', () => {
      window.opener?.focus();
      if (window.opener?.location) window.opener.location.hash = '#werkstatt';
    });
    el('gotoUvvBtn')?.addEventListener('click', () => {
      window.opener?.focus();
      if (window.opener?.location) window.opener.location.hash = '#uvv';
    });
  }

  async function loadVehicleWindow() {
    const root = el('vehicleWindowContent');
    if (!token) {
      root.innerHTML = '<div class="error-box">Kein Login gefunden. Bitte zuerst in der App einloggen.</div>';
      return;
    }
    if (!vehicleId) {
      root.innerHTML = '<div class="error-box">Keine Fahrzeug-ID uebergeben.</div>';
      return;
    }
    try {
      const [vehicles, workshop, damages, uvv, docs] = await Promise.all([
        api('/api/fahrzeuge'),
        api('/api/werkstatt'),
        api('/api/schaeden'),
        api('/api/uvv'),
        api(`/api/fahrzeuge/${vehicleId}/dokumente`)
      ]);
      const vehicle = (vehicles || []).find((item) => Number(item.id) === vehicleId);
      if (!vehicle) {
        root.innerHTML = '<div class="error-box">Fahrzeug nicht gefunden oder kein Zugriff vorhanden.</div>';
        return;
      }

      const workshopRows = (workshop || []).filter((item) => Number(item.fahrzeug_id) === vehicleId);
      const damageRows = (damages || []).filter((item) => Number(item.fahrzeug_id) === vehicleId);
      const uvvRows = (uvv || []).filter((item) => Number(item.fahrzeug_id) === vehicleId);

      document.title = `${vehicle.kennzeichen} - Fahrzeugfenster`;
      el('vehicleTitle').textContent = `${vehicle.kennzeichen} - ${vehicle.fahrzeug || 'Fahrzeug'}`;
      el('vehicleSubtitle').textContent = `${vehicle.standort || '-'} | ${vehicle.status || '-'} | FleetControl24`;
      el('heroName').textContent = `${vehicle.kennzeichen} - ${vehicle.fahrzeug || 'Fahrzeug'}`;
      el('heroMeta').textContent = `${vehicle.standort || '-'} | HU ${formatShortDate(vehicle.hu_datum)} | UVV ${formatShortDate(vehicle.uvv_datum)}`;
      const status = el('heroStatus');
      status.textContent = vehicle.status || '-';
      status.className = `status-chip ${statusClass(vehicle.status)}`;

      el('vehicleKpis').innerHTML = renderKpis(vehicle, workshopRows, damageRows, uvvRows);
      el('vehicleMetaTable').innerHTML = renderMeta(vehicle);
      el('vehicleWorkshopPanel').innerHTML = renderWorkshop(workshopRows);
      el('vehicleDamagePanel').innerHTML = renderDamage(damageRows);
      el('vehicleChecksPanel').innerHTML = renderChecks(uvvRows, docs || [], vehicle);
      bindButtons(vehicle);
    } catch (error) {
      root.innerHTML = `<div class="error-box">Fahrzeugfenster konnte nicht geladen werden: ${error.message}</div>`;
    }
  }

  loadVehicleWindow();
})();
