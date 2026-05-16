(function () {
  const token = sessionStorage.getItem('fuhrpark_token') || localStorage.getItem('fuhrpark_token') || '';
  const params = new URLSearchParams(window.location.search);
  const workshopId = Number(params.get('id'));
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

  async function loadEditor() {
    if (!token) {
      el('editorMessage').className = 'error';
      el('editorMessage').textContent = 'Kein Login gefunden. Bitte zuerst in der App einloggen.';
      return;
    }
    const [meta, vehicles, workshopRows, workshopAreas] = await Promise.all([
      api('/api/meta'),
      api('/api/fahrzeuge'),
      api('/api/werkstatt'),
      api('/api/werkstatt-bereiche')
    ]);

    el('workshopVehicle').innerHTML = (vehicles || []).map((item) => `<option value="${item.id}">${item.kennzeichen} - ${item.fahrzeug}</option>`).join('');
    el('workshopStatus').innerHTML = (meta.werkstattStatus || []).map((item) => `<option value="${item}">${item}</option>`).join('');
    const fallbackAreas = (meta.workshopSlots || []).map((slot) => ({ slot, name: `Werkstatt ${slot}` }));
    const resolvedAreas = (workshopAreas && workshopAreas.length ? workshopAreas : fallbackAreas);
    el('workshopSlot').innerHTML = resolvedAreas.map((item) => `<option value="${item.slot}">${item.name || `Werkstatt ${item.slot}`}</option>`).join('');
    if (!workshopAreas || !workshopAreas.length) {
      el('editorMessage').className = 'success';
      el('editorMessage').textContent = 'Werkstattplaetze wurden automatisch vorbereitet.';
    }

    if (!workshopId) return;
    const row = (workshopRows || []).find((item) => Number(item.id) === workshopId);
    if (!row) return;
    document.title = `Werkstattauftrag ${row.positionsnummer || row.id}`;
    el('editorTitle').textContent = `Werkstattauftrag bearbeiten - ${row.positionsnummer || row.id}`;
    el('editorSubtitle').textContent = `${row.kennzeichen || '-'} | ${row.werkstatt_name || '-'} | ${row.status || '-'}`;
    const form = el('workshopEditorForm');
    Object.entries({
      fahrzeug_id: row.fahrzeug_id,
      workshop_slot: row.workshop_slot,
      werkstatt_name: row.werkstatt_name,
      positionsnummer: row.positionsnummer,
      problem: row.problem,
      pruefzeichen: row.pruefzeichen,
      status: row.status,
      status_datum: row.status_datum,
      datum_von: row.datum_von,
      datum_bis: row.datum_bis,
      beschreibung: row.beschreibung
    }).forEach(([key, value]) => {
      const node = form.elements.namedItem(key);
      if (node) node.value = value || '';
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const message = el('editorMessage');
    try {
      const payload = Object.fromEntries(new FormData(event.target));
      if (workshopId) {
        await api(`/api/werkstatt/${workshopId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/werkstatt', { method: 'POST', body: JSON.stringify(payload) });
      }
      message.className = 'success';
      message.textContent = workshopId ? 'Werkstattauftrag wurde aktualisiert.' : 'Werkstattauftrag wurde angelegt.';
      window.opener?.location?.reload();
    } catch (error) {
      message.className = 'error';
      message.textContent = error.message;
    }
  }

  el('closeWindowBtn')?.addEventListener('click', () => window.close());
  el('reloadBtn')?.addEventListener('click', () => window.location.reload());
  el('workshopEditorForm')?.addEventListener('submit', handleSubmit);
  loadEditor();
})();
