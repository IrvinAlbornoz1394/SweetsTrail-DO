'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { formatPhone } from '@/lib/phone';
import Modal from './Modal';
import { Toast, useToast } from './Toast';
import type { LatLng } from './MapPicker';

// Leaflet toca `window` al importarse, así que el mapa no puede renderizarse en el servidor.
const MapPicker = dynamic(() => import('./MapPicker'), {
  ssr: false,
  loading: () => <div className="map map--loading">Cargando mapa…</div>,
});

type Errors = Partial<Record<'name' | 'businessName' | 'phone' | 'location', string>>;
type Props = {
  coloniaId: string;
  coloniaName: string;
  coloniaSlug: string;
  /** Centro con el que abre el mapa: el de la colonia seleccionada. */
  initialCenter: LatLng;
};

export default function StationForm({
  coloniaId,
  coloniaName,
  coloniaSlug,
  initialCenter,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
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

  function clearForm() {
    setName('');
    setBusinessName('');
    setPhone('');
    setPicked(false);
    setErrors({});
  }

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
    const phoneDigits = phone.replace(/\D/g, '');

    if (!name.trim()) next.name = 'Escribe el nombre del responsable.';
    if (!phoneDigits) next.phone = 'Escribe un número de teléfono.';
    else if (phoneDigits.length !== 10) next.phone = 'El teléfono debe tener 10 dígitos.';
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
    // El guardia contra el doble clic: además del botón deshabilitado mientras
    // `saving` está arriba, si un segundo evento se colara igual no dispararía
    // un segundo POST.
    if (!center || saving) return;
    setSaving(true);

    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coloniaId,
          name: name.trim(),
          businessName: businessName.trim(),
          phone: phone.replace(/\D/g, ''),
          lat: center.lat,
          lng: center.lng,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(data.error ?? 'No se pudo guardar la estación.', true);
        setSaving(false);
        setConfirming(false);
        return;
      }

      // Registro exitoso: `saving` se queda arriba a propósito. Apagarlo aquí
      // reactivaría los botones durante la navegación y dejaría una ventana para
      // volver a enviar la misma estación.
      //
      // `replace` y no `push`: el formulario ya se envió, así que el botón de
      // atrás del navegador debe llevar al menú, no de vuelta a un formulario
      // que invita a mandar lo mismo otra vez.
      router.replace(`/colonia/${coloniaSlug}/estaciones/exito?id=${data.stationId}`);
    } catch {
      showToast('Error de conexión. Intenta de nuevo.', true);
      setSaving(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <form className="card" onSubmit={handleSubmit} noValidate>
        <fieldset className="fieldset" disabled={saving}>
          <legend>Datos de la estación</legend>

          <div className="field">
            <label htmlFor="stationName">
              Nombre del responsable <span className="req">*</span>
            </label>
            <input
              id="stationName"
              type="text"
              placeholder="Ej. María González Pérez"
              autoComplete="name"
              className={errors.name ? 'is-invalid' : ''}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="error">{errors.name ?? ''}</p>
          </div>

          <div className="field">
            <label htmlFor="stationBusiness">Nombre del negocio o local</label>
            <input
              id="stationBusiness"
              type="text"
              placeholder="Ej. Abarrotes Doña Mary"
              className={errors.businessName ? 'is-invalid' : ''}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
            />
            <p className="hint">
              Opcional. Si lo llenas, es el nombre que se verá en el mapa; si lo dejas vacío, se
              muestra el del responsable.
            </p>
            <p className="error">{errors.businessName ?? ''}</p>
          </div>

          <div className="field">
            <label htmlFor="stationPhone">
              Número de teléfono <span className="req">*</span>
            </label>
            <input
              id="stationPhone"
              type="tel"
              placeholder="10 dígitos"
              inputMode="numeric"
              autoComplete="tel"
              className={errors.phone ? 'is-invalid' : ''}
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
            />
            <p className="hint">Es solo para quien organiza la ruta: no aparece en el mapa.</p>
            <p className="error">{errors.phone ?? ''}</p>
          </div>
        </fieldset>

        <fieldset className="fieldset" disabled={saving}>
          <legend>
            Ubicación en el mapa <span className="req">*</span>
          </legend>

          <p className="guide">
            El mapa abre sobre <strong>{coloniaName}</strong>.{' '}
            <strong>Arrástralo</strong> hasta que el pin quede sobre la casa, o toca{' '}
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
            initialCenter={initialCenter}
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
            disabled={saving}
            onClick={() => {
              clearForm();
              showToast('Formulario limpiado.');
            }}
          >
            Limpiar
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving && <span className="spinner" />}
            {saving ? 'Guardando…' : 'Registrar estación'}
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
            <span>Responsable</span>
            <strong>{name}</strong>
          </div>
          <div className="summary__item">
            <span>Negocio o local</span>
            <strong>{businessName.trim() || 'Sin negocio (se mostrará el responsable)'}</strong>
          </div>
          <div className="summary__item">
            <span>Teléfono</span>
            <strong>{phone}</strong>
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
