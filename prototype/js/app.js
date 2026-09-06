/* ===========================================================
   SweetsTrail — Ruta de los Dulces
   Front-end only: nada se envía a un servidor todavía.
   =========================================================== */
(function () {
  'use strict';

  const $  = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  /* -----------------------------------------------------
     Navegación entre vistas
     ----------------------------------------------------- */
  const VIEWS = { home: 'view-home', kids: 'view-kids', station: 'view-station' };
  const backBtn = $('#backBtn');

  function goTo(name) {
    const id = VIEWS[name] || VIEWS.home;
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === id));
    backBtn.hidden = (name === 'home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'station') initMap();
  }

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-go]');
    if (trigger) goTo(trigger.dataset.go);
  });

  /* -----------------------------------------------------
     Helpers de validación / UI
     ----------------------------------------------------- */
  function setError(key, msg, input) {
    const box = $(`[data-error-for="${key}"]`);
    if (box) box.textContent = msg || '';
    if (input) input.classList.toggle('is-invalid', Boolean(msg));
  }

  function clearErrors(form) {
    $$('.error', form).forEach(e => (e.textContent = ''));
    $$('.is-invalid', form).forEach(i => i.classList.remove('is-invalid'));
  }

  let toastTimer;
  function toast(msg, isError = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('is-error', isError);
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3800);
  }

  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

  /* -----------------------------------------------------
     Modal genérico de confirmación
     ----------------------------------------------------- */
  const modal        = $('#modal');
  const modalTitle   = $('#modalTitle');
  const modalBody    = $('#modalBody');
  const modalConfirm = $('#modalConfirmBtn');
  let onConfirm = null;

  function openModal({ title, html, confirmText = 'Confirmar', onAccept }) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modalConfirm.textContent = confirmText;
    onConfirm = onAccept;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modalConfirm.focus();
  }

  function closeModal() {
    modal.hidden = true;
    modalBody.innerHTML = '';
    onConfirm = null;
    document.body.style.overflow = '';
  }

  modal.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
  modalConfirm.addEventListener('click', () => {
    const fn = onConfirm;
    closeModal();
    if (typeof fn === 'function') fn();
  });

  /* =====================================================
     FORMULARIO 1 — NIÑOS PARTICIPANTES
     ===================================================== */
  const kidsForm    = $('#kidsForm');
  const kidsList    = $('#kidsList');
  const kidsCounter = $('#kidsCounter');

  function addKidRow(value = '', focus = false) {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <span class="row__num"></span>
      <input type="text" class="row__input" name="kidName" placeholder="Nombre del niño" value="${escapeHtml(value)}" />
      <button type="button" class="row__remove" title="Quitar este niño" aria-label="Quitar este niño">✕</button>
    `;
    kidsList.appendChild(row);
    refreshRows();
    if (focus) $('.row__input', row).focus();
  }

  function refreshRows() {
    const rows = $$('.row', kidsList);
    rows.forEach((row, i) => {
      $('.row__num', row).textContent = i + 1;
      // Siempre debe quedar al menos una fila en pantalla.
      $('.row__remove', row).disabled = rows.length === 1;
    });
    updateCounter();
  }

  function getValidKids() {
    return $$('.row__input', kidsList)
      .map(i => i.value.trim())
      .filter(v => v !== '');
  }

  function updateCounter() {
    const n = getValidKids().length;
    kidsCounter.textContent = n === 1 ? '1 niño con nombre' : `${n} niños con nombre`;
  }

  $('#addKidBtn').addEventListener('click', () => addKidRow('', true));

  kidsList.addEventListener('click', (e) => {
    const btn = e.target.closest('.row__remove');
    if (!btn || btn.disabled) return;
    btn.closest('.row').remove();
    refreshRows();
  });

  kidsList.addEventListener('input', (e) => {
    if (e.target.classList.contains('row__input')) updateCounter();
  });

  // Enter dentro de una fila agrega otra en lugar de enviar.
  kidsList.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('row__input')) {
      e.preventDefault();
      addKidRow('', true);
    }
  });

  // Teléfono: solo dígitos, formateado 55 1234 5678
  const phoneInput = $('#tutorPhone');
  phoneInput.addEventListener('input', () => {
    const digits = phoneInput.value.replace(/\D/g, '').slice(0, 10);
    phoneInput.value = digits.replace(/^(\d{2})(\d{0,4})(\d{0,4}).*$/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(' ')
    );
  });

  kidsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors(kidsForm);

    const tutorName  = $('#tutorName').value.trim();
    const tutorPhone = phoneInput.value.replace(/\D/g, '');
    const kids       = getValidKids();
    let ok = true;

    if (!tutorName) {
      setError('tutorName', 'Escribe el nombre del responsable o tutor.', $('#tutorName'));
      ok = false;
    }
    if (!tutorPhone) {
      setError('tutorPhone', 'Escribe un número de teléfono.', phoneInput);
      ok = false;
    } else if (tutorPhone.length !== 10) {
      setError('tutorPhone', 'El teléfono debe tener 10 dígitos.', phoneInput);
      ok = false;
    }
    if (kids.length === 0) {
      setError('kids', 'Agrega al menos un niño con nombre. Las filas vacías se omiten.');
      ok = false;
    }

    if (!ok) {
      toast('Revisa los campos marcados.', true);
      return;
    }

    const omitted = $$('.row__input', kidsList).length - kids.length;

    openModal({
      title: 'Confirmar registro de niños',
      confirmText: `Confirmar ${kids.length} ${kids.length === 1 ? 'niño' : 'niños'}`,
      html: `
        <p class="modal__intro">Revisa la información antes de confirmar. Estos son los niños que se van a registrar:</p>
        <div class="summary">
          <div class="summary__item"><span>Responsable</span><strong>${escapeHtml(tutorName)}</strong></div>
          <div class="summary__item"><span>Teléfono</span><strong>${escapeHtml(phoneInput.value)}</strong></div>
        </div>
        <ul class="kid-list">
          ${kids.map((k, i) => `<li><b>${i + 1}.</b> ${escapeHtml(k)}</li>`).join('')}
        </ul>
        ${omitted > 0
          ? `<p class="note">⚠️ Se ${omitted === 1 ? 'omitió 1 campo vacío' : `omitieron ${omitted} campos vacíos`} y no se ${omitted === 1 ? 'tomará' : 'tomarán'} en cuenta.</p>`
          : ''}
      `,
      onAccept: () => {
        // Front-end únicamente: no se envía nada y el formulario se conserva.
        console.log('Registro confirmado (pendiente de backend):', { tutorName, tutorPhone, kids });
        toast(`✅ ${kids.length} ${kids.length === 1 ? 'niño confirmado' : 'niños confirmados'} (aún sin enviar).`);
      }
    });
  });

  $('#resetKidsBtn').addEventListener('click', () => {
    kidsForm.reset();
    clearErrors(kidsForm);
    kidsList.innerHTML = '';
    addKidRow();
    toast('Formulario limpiado.');
  });

  addKidRow(); // primera fila por defecto

  /* =====================================================
     FORMULARIO 2 — ESTACIÓN DE DULCE
     ===================================================== */
  const stationForm = $('#stationForm');
  const coordsLabel = $('#coordsLabel');
  const geocodeHint = $('#geocodeHint');

  const DEFAULT_CENTER = [19.4326, -99.1332]; // CDMX
  let map = null;
  let marker = null;

  function initMap() {
    if (map) { setTimeout(() => map.invalidateSize(), 60); return; }

    map = L.map('map', { center: DEFAULT_CENTER, zoom: 13 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    map.on('click', (e) => setPin(e.latlng.lat, e.latlng.lng));
    setTimeout(() => map.invalidateSize(), 60);
  }

  function setPin(lat, lng, zoom) {
    if (!map) return;
    if (marker) {
      marker.setLatLng([lat, lng]);
    } else {
      marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        updateCoords(p.lat, p.lng);
      });
    }
    if (zoom) map.setView([lat, lng], zoom);
    updateCoords(lat, lng);
    setError('location', '');
  }

  function updateCoords(lat, lng) {
    coordsLabel.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    coordsLabel.classList.add('is-set');
  }

  function clearPin() {
    if (marker) { map.removeLayer(marker); marker = null; }
    coordsLabel.textContent = 'Sin ubicación seleccionada';
    coordsLabel.classList.remove('is-set');
  }

  $('#clearPinBtn').addEventListener('click', clearPin);

  $('#locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Tu navegador no soporta geolocalización.', true);
    toast('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      pos => setPin(pos.coords.latitude, pos.coords.longitude, 17),
      ()  => toast('No se pudo obtener tu ubicación.', true),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  // Búsqueda de dirección con Nominatim (OpenStreetMap, sin API key).
  $('#geocodeBtn').addEventListener('click', async () => {
    const q = $('#stationAddress').value.trim();
    if (!q) {
      setError('stationAddress', 'Escribe una dirección para buscarla.', $('#stationAddress'));
      return;
    }
    geocodeHint.textContent = 'Buscando dirección…';
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
      const data = await res.json();
      if (!data.length) {
        geocodeHint.textContent = 'No se encontró la dirección. Coloca el marcador manualmente.';
        return;
      }
      setPin(parseFloat(data[0].lat), parseFloat(data[0].lon), 17);
      geocodeHint.textContent = `Aproximado: ${data[0].display_name}. Ajusta el marcador si es necesario.`;
    } catch (err) {
      geocodeHint.textContent = 'No se pudo buscar la dirección. Coloca el marcador manualmente.';
    }
  });

  stationForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors(stationForm);

    const name    = $('#stationName').value.trim();
    const address = $('#stationAddress').value.trim();
    const pos     = marker ? marker.getLatLng() : null;
    let ok = true;

    if (!name) {
      setError('stationName', 'Escribe el nombre de la estación.', $('#stationName'));
      ok = false;
    }
    if (!address) {
      setError('stationAddress', 'Escribe la dirección de la casa participante.', $('#stationAddress'));
      ok = false;
    }
    if (!pos) {
      setError('location', 'Marca la ubicación en el mapa dando clic sobre la casa.');
      ok = false;
    }

    if (!ok) {
      toast('Revisa los campos marcados.', true);
      return;
    }

    openModal({
      title: 'Confirmar estación de dulce',
      confirmText: 'Confirmar estación',
      html: `
        <p class="modal__intro">Revisa la información de la estación antes de confirmar:</p>
        <div class="summary">
          <div class="summary__item"><span>Estación</span><strong>${escapeHtml(name)}</strong></div>
          <div class="summary__item"><span>Dirección</span><strong>${escapeHtml(address)}</strong></div>
          <div class="summary__item"><span>Coordenadas</span><strong>${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}</strong></div>
        </div>
      `,
      onAccept: () => {
        console.log('Estación confirmada (pendiente de backend):', {
          name, address, lat: pos.lat, lng: pos.lng
        });
        toast('✅ Estación confirmada (aún sin enviar).');
      }
    });
  });

  $('#resetStationBtn').addEventListener('click', () => {
    stationForm.reset();
    clearErrors(stationForm);
    geocodeHint.textContent = '';
    clearPin();
    if (map) map.setView(DEFAULT_CENTER, 13);
    toast('Formulario limpiado.');
  });

})();
