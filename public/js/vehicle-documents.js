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

  function formatShortDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('de-DE');
  }

  async function openDocument(doc) {
    if (!doc?.id) throw new Error('Dokument konnte nicht zugeordnet werden.');
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const openPath = String(doc.id).startsWith('uvv_')
      ? doc.datei_pfad
      : `/api/fahrzeuge/dokumente/${encodeURIComponent(doc.id)}/open${String(doc.id) === 'schein' ? `?fahrzeug_id=${vehicleId}` : ''}`;
    const response = await fetch(openPath, { headers });
    if (!response.ok) throw new Error('Dokument konnte nicht geoeffnet werden.');
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }

  async function loadDocuments() {
    const docsList = el('docsList');
    docsList.innerHTML = '<div class="empty-note">Lade Dokumente...</div>';
    try {
      const [vehicles, docs] = await Promise.all([
        api('/api/fahrzeuge'),
        api(`/api/fahrzeuge/${vehicleId}/dokumente`)
      ]);
      const vehicle = (vehicles || []).find((item) => Number(item.id) === vehicleId);
      el('docsTitle').textContent = `Dokumente - ${vehicle?.kennzeichen || 'Fahrzeug'}`;
      el('docsSubtitle').textContent = `${vehicle?.fahrzeug || '-'} | ${vehicle?.standort || '-'} | Fahrzeug ${vehicleId}`;

      if (!docs.length) {
        docsList.innerHTML = '<div class="empty-note">Keine Dokumente vorhanden.</div>';
        return;
      }

      docsList.innerHTML = docs.map((doc) => {
        const canDelete = !String(doc.id || '').startsWith('uvv_');
        return `
          <div class="stack-item">
            <strong>${doc.name || 'Dokument'}</strong>
            <p>${doc.typ || 'Sonstiges'} | ${formatShortDate(doc.datum)}</p>
            <div class="inline-badge-row">
              <button type="button" class="secondary-btn docs-inline-link" data-action="open-doc" data-id="${doc.id}">Oeffnen</button>
              ${canDelete ? `<button type="button" class="secondary-btn" data-action="delete-doc" data-id="${doc.id}">Loeschen</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      document.querySelectorAll('[data-action="open-doc"]').forEach((node) => {
        node.addEventListener('click', async () => {
          const doc = docs.find((entry) => String(entry.id) === String(node.dataset.id));
          if (!doc) return;
          try {
            await openDocument(doc);
          } catch (error) {
            const message = el('docsMessage');
            if (message) {
              message.className = 'error';
              message.textContent = error.message;
            }
          }
        });
      });

      document.querySelectorAll('[data-action="delete-doc"]').forEach((node) => {
        node.addEventListener('click', async () => {
          if (!confirm('Dokument wirklich loeschen?')) return;
          await api(`/api/fahrzeuge/dokumente/${node.dataset.id}`, { method: 'DELETE' });
          await loadDocuments();
        });
      });
    } catch (error) {
      docsList.innerHTML = `<div class="error-box">Dokumente konnten nicht geladen werden: ${error.message}</div>`;
    }
  }

  async function handleUpload(event) {
    event.preventDefault();
    const message = el('docsMessage');
    try {
      const formData = new FormData(event.target);
      await api(`/api/fahrzeuge/${vehicleId}/dokumente`, { method: 'POST', body: formData });
      event.target.reset();
      message.className = 'success';
      message.textContent = 'Dokument wurde hochgeladen.';
      await loadDocuments();
    } catch (error) {
      message.className = 'error';
      message.textContent = error.message;
    }
  }

  el('closeWindowBtn')?.addEventListener('click', () => window.close());
  el('reloadBtn')?.addEventListener('click', () => window.location.reload());
  el('docsUploadForm')?.addEventListener('submit', handleUpload);

  if (!token) {
    el('docsList').innerHTML = '<div class="error-box">Kein Login gefunden. Bitte zuerst in der App einloggen.</div>';
  } else {
    loadDocuments();
  }
})();
