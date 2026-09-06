'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import Modal from './Modal';
import { Toast, useToast } from './Toast';
import type { LatLng } from './MapPicker';

// Leaflet toca `window` al importarse, así que el mapa no puede renderizarse en el servidor.
const MapPicker = dynamic(() => import('./MapPicker'), {
  ssr: false,
  loading: () => <div className="map map--loading">Cargando mapa…</div>,
});

type Errors = Partial<Record<'name' | 'address' | 'location', string>>;

type Props = { coloniaId: string; coloniaName: string; postalCode: string | null };

export default function StationForm({ coloniaId, coloniaName, postalCode }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [position, setPosition] = useState<LatLng | null>(null);
  const [flyTo, setFlyTo] = useState<(LatLng & { zoom?: number }) | null>(null);
  const [hint, setHint] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const { toast, showToast } = useToast();

  const handlePick = useCallback((p: LatLng) => {
    setPosition(p);
    setErrors((prev) => ({ ...prev, location: undefined }));
  }, []);

  /** Geocodifica la dirección escrita con Nominatim (OpenStreetMap, sin API key). */
  async function searchAddress() {
    const q = address.trim();
    // Se acota la búsqueda a la colonia y a Mérida: sin esto Nominatim
    // se va a calles del mismo nombre en otras ciudades.
    const scoped = `${q}, ${coloniaName}, ${postalCode ?? ''} Mérida, Yucatán, México`;
    if (!q) {
      setErrors((prev) => ({ ...prev, address: 'Escribe una dirección para buscarla.' }));
      return;
    }

    setSearching(true);
    setHint('Buscando dirección…');
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=${encodeURIComponent(scoped)}`,
        { headers: { 'Accept-Language': 'es' } }
      );
      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        setHint('No se encontró la dirección. Coloca el marcador manualmente.');
        return;
      }

      const found = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      handlePick(found);
      setFlyTo({ ...found, zoom: 17 });
      setHint(`Aproximado: ${data[0].display_name}. Ajusta el marcador si es necesario.`);
    } catch {
      setHint('No se pudo buscar la dirección. Coloca el marcador manualmente.');
    } finally {
      setSearching(false);
    }
  }

  function locateMe() {
    if (!navigator.geolocation) {
      showToast('Tu navegador no soporta geolocalización.', true);
      return;
    }
    showToast('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        handlePick(p);
        setFlyTo({ ...p, zoom: 17 });
      },
      () => showToast('No se pudo obtener tu ubicación.', true),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Errors = {};

    if (!name.trim()) next.name = 'Escribe el nombre de la estación.';
    if (!address.trim()) next.address = 'Escribe la dirección de la casa participante.';
    if (!position) next.location = 'Marca la ubicación en el mapa dando clic sobre la casa.';

    setErrors(next);
    if (Object.keys(next).length > 0) {
      showToast('Revisa los campos marcados.', true);
      return;
    }
    setConfirming(true);
  }

  async function handleConfirm() {
    if (!position) return;
    setSaving(true);
    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coloniaId,
          name: name.trim(),
          address: address.trim(),
          lat: position.lat,
          lng: position.lng,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error ?? 'No se pudo guardar la estación.', true);
        return;
      }

      showToast('✅ Estación registrada.');
      // Vuelve a pedir el server component para que el contador suba al instante.
      router.refresh();
      setName('');
      setAddress('');
      setPosition(null);
      setHint('');
      setErrors({});
    } catch {
      showToast('Error de conexión. Intenta de nuevo.', true);
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <form className="card form" onSubmit={handleSubmit} noValidate>
        <fieldset className="fieldset">
          <legend>Datos de la estación</legend>

          <div className="field">
            <label htmlFor="stationName">
              Nombre de la estación <span className="req">*</span>
            </label>
            <input
              id="stationName"
              type="text"
              placeholder="Ej. Casa de los Sustos / Familia Ramírez"
              className={errors.name ? 'is-invalid' : ''}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="error">{errors.name ?? ''}</p>
          </div>

          <div className="field">
            <label htmlFor="stationAddress">
              Dirección <span className="req">*</span>
            </label>
            <div className="input-group">
              <input
                id="stationAddress"
                type="text"
                placeholder="Calle, número, colonia, ciudad"
                className={errors.address ? 'is-invalid' : ''}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    searchAddress();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={searchAddress}
                disabled={searching}
                title="Buscar la dirección en el mapa"
              >
                {searching ? '…' : '🔎 Buscar'}
              </button>
            </div>
            <p className="hint">{hint}</p>
            <p className="error">{errors.address ?? ''}</p>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>
            Ubicación en el mapa
            <span className="counter counter--muted">Da clic o arrastra el marcador</span>
          </legend>

          <div className="map-tools">
            <button type="button" className="btn btn--ghost btn--sm" onClick={locateMe}>
              📍 Usar mi ubicación
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setPosition(null)}
              disabled={!position}
            >
              ✕ Quitar marcador
            </button>
            <span className={`coords${position ? ' is-set' : ''}`}>
              {position
                ? `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`
                : 'Sin ubicación seleccionada'}
            </span>
          </div>

          <MapPicker value={position} onChange={handlePick} flyTo={flyTo} />
          <p className="error error--block">{errors.location ?? ''}</p>
        </fieldset>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setName('');
              setAddress('');
              setPosition(null);
              setHint('');
              setErrors({});
              showToast('Formulario limpiado.');
            }}
          >
            Limpiar formulario
          </button>
          <button type="submit" className="btn btn--primary">
            Registrar estación
          </button>
        </div>
      </form>

      <Modal
        open={confirming}
        busy={saving}
        title="Confirmar estación de dulce"
        confirmText="Confirmar estación"
        onClose={() => setConfirming(false)}
        onConfirm={handleConfirm}
      >
        <p className="modal__intro">Revisa la información de la estación antes de confirmar:</p>
        <div className="summary">
          <div className="summary__item summary__item--highlight">
            <span>Colonia</span>
            <strong>{coloniaName}</strong>
          </div>
          <div className="summary__item">
            <span>Estación</span>
            <strong>{name}</strong>
          </div>
          <div className="summary__item">
            <span>Dirección</span>
            <strong>{address}</strong>
          </div>
          <div className="summary__item">
            <span>Coordenadas</span>
            <strong>
              {position ? `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}` : '—'}
            </strong>
          </div>
        </div>
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
