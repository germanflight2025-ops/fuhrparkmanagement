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

  async function loadEditor() {
    if (!token) {
      el('editorMessage').className = 'error';
      el('editorMessage').textContent = 'Kein Login gefunden. Bitte zuerst in der App einloggen.';
      return;
    }
    const [meta, vehicles, me] = await Promise.all([
      api('/api/meta'),
      api('/api/fahrzeuge'),
      api('/api/auth/me')
    ]);
    el('editorStandort').innerHTML = (meta.standorte || []).map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
    el('editorStatus').innerHTML = (meta.fahrzeugStatus || []).map((s) => `<option value="${s}">${s}</option>`).join('');
    if (me.rolle !== 'hauptadmin') {
      el('editorStandort').value = String(me.standort_id || '');
      el('editorStandort').disabled = true;
    }
    if (!vehicleId) return;
    const vehicle = (vehicles || []).find((item) => Number(item.id) === vehicleId);
    if (!vehicle) return;
    document.title = `${vehicle.kennzeichen} - Fahrzeugeditor`;
    el('editorTitle').textContent = `Fahrzeug bearbeiten - ${vehicle.kennzeichen}`;
    el('editorSubtitle').textContent = `${vehicle.fahrzeug || '-'} | ${vehicle.standort || '-'}`;
    const form = el('vehicleEditorForm');
    Object.entries({
      kennzeichen: vehicle.kennzeichen,
      fahrzeug: vehicle.fahrzeug,
      standort_id: vehicle.standort_id,
      status: vehicle.status,
      hu_datum: vehicle.hu_datum,
      uvv_datum: vehicle.uvv_datum,
      fin: vehicle.fin,
      radiocode: vehicle.radiocode,
      tankkarte_aral_nummer: vehicle.tankkarte_aral_nummer,
      tankkarte_aral_aktiv_seit: vehicle.tankkarte_aral_aktiv_seit,
      tankkarte_aral_gueltig_bis: vehicle.tankkarte_aral_gueltig_bis,
      tankkarte_shell_nummer: vehicle.tankkarte_shell_nummer,
      tankkarte_shell_name: vehicle.tankkarte_shell_name,
      tankkarte_shell_gueltig_von: vehicle.tankkarte_shell_gueltig_von,
      tankkarte_shell_gueltig_bis: vehicle.tankkarte_shell_gueltig_bis
    }).forEach(([key, value]) => {
      const node = form.elements.namedItem(key);
      if (node) node.value = value || '';
    });
    el('editorTankkartenVorhanden').checked = Boolean(vehicle.tankkarten_vorhanden);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const message = el('editorMessage');
    try {
      const formData = new FormData(event.target);
      formData.set('tankkarten_vorhanden', el('editorTankkartenVorhanden').checked ? 'true' : '');
      const pdfFile = formData.get('fahrzeugschein_pdf');
      const payload = Object.fromEntries([...formData.entries()].filter(([key]) => key !== 'fahrzeugschein_pdf'));
      let savedVehicle;
      if (vehicleId) {
        savedVehicle = await api(`/api/fahrzeuge/${vehicleId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        savedVehicle = await api('/api/fahrzeuge', { method: 'POST', body: JSON.stringify(payload) });
      }
      if (pdfFile && pdfFile.size > 0) {
        const uploadData = new FormData();
        uploadData.append('fahrzeugschein_pdf', pdfFile);
        await api(`/api/fahrzeuge/${savedVehicle.id}/upload-fahrzeugschein`, { method: 'POST', body: uploadData });
      }
      message.className = 'success';
      message.textContent = vehicleId ? 'Fahrzeug wurde aktualisiert.' : 'Fahrzeug wurde angelegt.';
      window.opener?.location?.reload();
    } catch (error) {
      message.className = 'error';
      message.textContent = error.message;
    }
  }

  el('closeWindowBtn')?.addEventListener('click', () => window.close());
  el('reloadBtn')?.addEventListener('click', () => window.location.reload());
  el('vehicleEditorForm')?.addEventListener('submit', handleSubmit);
  loadEditor();
})();
