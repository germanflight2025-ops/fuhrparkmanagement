(function () {
  const form = document.getElementById('marketingRequestForm');
  const typeField = document.getElementById('marketingRequestType');
  const packageField = document.getElementById('marketingPackageSelect');
  const message = document.getElementById('marketingRequestMessage');
  const pricingGrid = document.getElementById('marketingPricingGrid');

  function setMessage(text, type = '') {
    if (!message) return;
    message.className = `marketing-form-message${type ? ` ${type}` : ''}`;
    message.textContent = text || '';
  }

  function packageLabel(item) {
    const parts = [item.preis || '', item.abrechnung || ''];
    return parts.filter(Boolean).join(' / ');
  }

  function splitPrice(value) {
    const text = String(value || '').trim();
    if (!text) return { primary: '-', secondary: '' };
    const parts = text.split('|').map((entry) => entry.trim()).filter(Boolean);
    return {
      primary: parts[0] || text,
      secondary: parts[1] || ''
    };
  }

  function packageFeatures(item) {
    if (Array.isArray(item?.leistungen)) return item.leistungen.filter(Boolean);
    return String(item?.leistungen || '')
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function sortPackages(packages) {
    const order = { kostenlos: 1, starter: 2, professional: 3, enterprise: 4 };
    return [...packages].sort((left, right) => {
      const leftRank = order[String(left?.name || '').trim().toLowerCase()] || 99;
      const rightRank = order[String(right?.name || '').trim().toLowerCase()] || 99;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return String(left?.name || '').localeCompare(String(right?.name || ''), 'de');
    });
  }

  function renderPricingCards(packages) {
    if (!pricingGrid) return;
    if (!packages.length) {
      pricingGrid.innerHTML = '<article class="marketing-price-card"><strong>Pakete folgen</strong><p>Die Tarife werden gerade aktualisiert.</p></article>';
      return;
    }
    pricingGrid.innerHTML = packages.map((item) => {
      const price = splitPrice(item.preis);
      const meta = [item.beschreibung, item.standorte].filter(Boolean).join(' | ');
      const features = packageFeatures(item);
      return `
        <article class="marketing-price-card${item.featured ? ' marketing-price-card-featured' : ''}">
          ${item.featured ? '<span class="marketing-price-badge">Empfohlen</span>' : ''}
          <strong>${item.name || '-'}</strong>
          <div class="marketing-price-stack">
            <div class="marketing-price-main">${price.primary}</div>
            ${price.secondary ? `<div class="marketing-price-secondary">${price.secondary}</div>` : ''}
          </div>
          ${meta ? `<p class="marketing-price-alt">${meta}</p>` : ''}
          <ul>
            ${features.map((entry) => `<li>${entry}</li>`).join('')}
          </ul>
          <button type="button" class="marketing-button${item.featured ? '' : ' marketing-button-secondary'}" data-request-type="angebot" data-package-name="${item.name || ''}">${item.name || 'Paket'} anfragen</button>
        </article>
      `;
    }).join('');

    pricingGrid.querySelectorAll('[data-request-type]').forEach((node) => {
      node.addEventListener('click', () => {
        if (typeField) typeField.value = 'angebot';
        if (packageField) packageField.value = node.dataset.packageName || '';
        document.getElementById('kontakt')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function fillPackageSelect(packages) {
    if (!packageField) return;
    const currentValue = packageField.value;
    packageField.innerHTML = `
      <option value="">Bitte auswaehlen</option>
      <option value="Demo">Demo / Erstgespraech</option>
      ${packages.map((item) => `<option value="${item.name || ''}">${item.name || '-'}${packageLabel(item) ? ` - ${packageLabel(item)}` : ''}</option>`).join('')}
    `;
    packageField.value = currentValue || '';
  }

  async function loadPackages() {
    try {
      const response = await fetch('/api/website-pakete');
      const rows = await response.json().catch(() => []);
      if (!response.ok) throw new Error('Pakete konnten nicht geladen werden.');
      const sortedRows = sortPackages(Array.isArray(rows) ? rows : []);
      renderPricingCards(sortedRows);
      fillPackageSelect(sortedRows);
    } catch (error) {
      renderPricingCards([]);
    }
  }

  document.querySelectorAll('[data-request-type]').forEach((node) => {
    node.addEventListener('click', () => {
      if (typeField) typeField.value = node.dataset.requestType === 'angebot' ? 'angebot' : 'demo';
      if (packageField && node.dataset.requestType !== 'angebot') packageField.value = 'Demo';
    });
  });

  if (typeField && packageField) {
    typeField.addEventListener('change', () => {
      if (typeField.value === 'demo') packageField.value = 'Demo';
    });
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setMessage('Anfrage wird gesendet...');
      try {
        const payload = Object.fromEntries(new FormData(form));
        if (payload.typ === 'demo' && !payload.paket_wunsch) payload.paket_wunsch = 'Demo';
        const response = await fetch('/api/website-anfrage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({ error: 'Anfrage konnte nicht verarbeitet werden.' }));
        if (!response.ok) throw new Error(result.error || 'Anfrage konnte nicht gesendet werden.');
        form.reset();
        if (typeField) typeField.value = 'demo';
        if (packageField) packageField.value = 'Demo';
        setMessage('Anfrage wurde erfolgreich ins Backoffice uebernommen.', 'success');
      } catch (error) {
        setMessage(error.message || 'Anfrage konnte nicht gesendet werden.', 'error');
      }
    });
  }

  loadPackages();
})();
