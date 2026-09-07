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
type Props = { coloniaId: string; coloniaName: string };

export default function StationForm({ coloniaId, coloniaName }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  // El centro del mapa siempre tiene coordenadas; `picked` distingue si la
  // persona ya eligió a propósito o solo estamos en el centro inicial.
  const [center, setCenter] = useState<LatLng | null>(null);
  const [picked, setPicked] = useState(false);
  const [flyTo, setFlyTo] = useState<(LatLng & { zoom?: number }) | null>(null);
  const [locating, setLocating] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

  const handleCenterChange = useCallback((p: LatLng) => setCenter(p), []);

  const handleUserDrag = useCallback(() => {
    setPicked(true);
    setErrors((prev) => ({ ...prev, location: undefined }));
  }, []);

  function locateMe() {
    if (!navigator.geolocation) {
      showToast('Tu teléfono no permite compartir la ubicación.', true);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFlyTo({ lat: pos.coords.latitude, lng: pos.coords.longitude, zoom: 18 });
        setPicked(true);
        setErrors((prev) => ({ ...prev, location: undefined }));
        setLocating(false);
        showToast('📍 Listo. Ajusta el mapa si el pin no quedó justo en la casa.');
      },
      () => {
        setLocating(false);
        showToast('No se pudo obtener tu ubicación. Arrastra el mapa a mano.', true);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Errors = {};

    if (!name.trim()) next.name = 'Escribe el nombre de la estación.';
    if (!address.trim()) next.address = 'Escribe la dirección de la casa participante.';
    if (!picked || !center) {
      next.location = 'Coloca el pin sobre la casa: arrastra el mapa o usa tu ubicación.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      showToast('Revisa los campos marcados.', true);
      return;
    }
    setConfirming(true);
  }

  async function handleConfirm() {
    if (!center) return;
    setSaving(true);
    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coloniaId,
          name: name.trim(),
          address: address.trim(),
          lat: center.lat,
          lng: center.lng,
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
      setPicked(false);
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
      <form className="card" onSubmit={handleSubmit} noValidate>
        <fieldset className="fieldset">
          <legend>Datos de la estación</legend>

          <div className="field">
            <label htmlFor="stationName">
              Nombre de la estación <span className="req">*</span>
            </label>
            <input
              id="stationName"
              type="text"
              placeholder="Ej. Casa de los Sustos"
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
            <input
              id="stationAddress"
              type="text"
              placeholder="Calle 20 #123 x 15 y 17"
              className={errors.address ? 'is-invalid' : ''}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <p className="error">{errors.address ?? ''}</p>
          </div>
        </fieldset>

        <fieldset className="fieldset">
          <legend>
            Ubicación en el mapa <span className="req">*</span>
          </legend>

          <p className="guide">
            <strong>Arrastra el mapa</strong> hasta que el pin quede sobre la casa, o toca{' '}
            <strong>Usar mi ubicación</strong> si estás ahí en este momento.
          </p>

          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={locateMe}
            disabled={locating}
          >
            {locating ? <span className="spinner spinner--dark" /> : '📍 '}
            {locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}
          </button>

          <MapPicker
            picked={picked}
            onCenterChange={handleCenterChange}
            onUserDrag={handleUserDrag}
            flyTo={flyTo}
          />

          <p className={`coords${picked ? ' is-set' : ''}`}>
            {picked && center
              ? `✓ Ubicación marcada · ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`
              : 'Todavía sin marcar'}
          </p>
          <p className="error error--block">{errors.location ?? ''}</p>
        </fieldset>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setName('');
              setAddress('');
              setPicked(false);
              setErrors({});
              showToast('Formulario limpiado.');
            }}
          >
            Limpiar
          </button>
          <button type="submit" className="btn btn--primary">
            Registrar estación
          </button>
        </div>
      </form>

      <Modal
        open={confirming}
        busy={saving}
        title="Confirmar estación"
        confirmText="Confirmar estación"
        onClose={() => setConfirming(false)}
        onConfirm={handleConfirm}
      >
        <p className="modal__intro">Revisa la información antes de confirmar:</p>
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
            <strong>{center ? `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}` : '—'}</strong>
          </div>
        </div>
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
