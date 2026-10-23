'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrganizerUnlock from './OrganizerUnlock';
import { Toast, useToast } from './Toast';

/** Cada cuánto, como máximo, se manda la ubicación. */
const SEND_EVERY_MS = 5000;

/**
 * "Activar caravana": quien organiza comparte desde aquí la ubicación de su
 * teléfono para que las familias la sigan. Pide el código de organizador y el
 * permiso de ubicación; mientras comparte, esta pantalla tiene que seguir
 * abierta, porque el navegador deja de dar la ubicación al salir de ella. Por
 * eso se pide que la pantalla no se apague (Wake Lock), donde se pueda.
 *
 * El código vive solo en memoria y el servidor lo vuelve a comparar con cada
 * ubicación que llega.
 */
export default function CaravanShare({ coloniaId }: { coloniaId: string }) {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState('');
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const watch = useRef<number | null>(null);
  const lastSent = useRef(0);
  const announced = useRef(false);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const sharing = code !== '';

  const release = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, []);

  // Al salir de la pantalla se deja de mirar el GPS; el servidor da la
  // caravana por detenida sola cuando dejan de llegar ubicaciones.
  useEffect(() => release, [release]);

  // El reloj de "actualizada hace X s".
  useEffect(() => {
    if (!sharing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [sharing]);

  // El Wake Lock se suelta solo al cambiar de app; al volver se pide otra vez.
  useEffect(() => {
    if (!sharing) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && wakeLock.current === null) keepAwake();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [sharing]);

  async function keepAwake() {
    try {
      wakeLock.current = (await navigator.wakeLock?.request('screen')) ?? null;
      wakeLock.current?.addEventListener('release', () => {
        wakeLock.current = null;
      });
    } catch {
      // Sin Wake Lock (o con batería baja): se comparte igual.
    }
  }

  async function send(organizerCode: string, lat: number, lng: number) {
    try {
      const res = await fetch('/api/caravan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coloniaId, code: organizerCode, lat, lng }),
      });
      if (res.ok) {
        // La primera ubicación es la que prende "Seguir caravana" arriba.
        if (!announced.current) {
          announced.current = true;
          router.refresh();
        }
        setSentAt(Date.now());
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        release();
        setCode('');
      }
      showToast(data.error ?? 'No se pudo compartir la ubicación.', true);
    } catch {
      // Sin señal un momento: se reintenta con la siguiente ubicación.
    }
  }

  function start(organizerCode: string) {
    if (!navigator.geolocation) {
      showToast('Este teléfono no puede compartir su ubicación.', true);
      return;
    }

    lastSent.current = 0;
    announced.current = false;
    setSentAt(null);
    setCode(organizerCode);
    keepAwake();

    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
        // Se marca antes de mandar para no encimar dos envíos.
        lastSent.current = Date.now();
        send(organizerCode, pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        // Sin permiso no hay nada que hacer. Lo demás (señal débil, un
        // tiempo agotado) es pasajero: se avisa y se sigue escuchando el GPS.
        if (err.code === err.PERMISSION_DENIED) {
          release();
          setCode('');
          showToast('No diste permiso de ubicación. Actívalo en tu navegador para compartir la caravana.', true);
        } else {
          showToast('No pudimos obtener tu ubicación. Revisa que el GPS esté encendido.', true);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  }

  async function stop() {
    setBusy(true);
    release();
    try {
      const res = await fetch('/api/caravan', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coloniaId, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) showToast(data.error ?? 'No se pudo detener la caravana.', true);
      else showToast('Dejaste de compartir la caravana.');
    } catch {
      showToast('Sin conexión. La caravana se dará por detenida en un par de minutos.', true);
    } finally {
      setCode('');
      setSentAt(null);
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <>
      {sharing ? (
        <div className="caravan-share" role="status">
          <span className="caravan-share__dot" aria-hidden="true" />
          <span className="caravan-share__text">
            <strong>Compartiendo la caravana</strong>
            <small>
              {sentAt === null
                ? 'Buscando tu ubicación…'
                : `Ubicación enviada hace ${Math.max(0, Math.round((now - sentAt) / 1000))} s`}
              <br />
              Deja esta pantalla abierta: si sales, la caravana se detiene.
            </small>
          </span>
          <button type="button" className="btn btn--ghost family-link__btn" onClick={stop} disabled={busy}>
            Dejar de compartir
          </button>
        </div>
      ) : (
        <div className="caravan-activate">
          <button type="button" className="link-quiet" onClick={() => setAsking(true)}>
            🚐 Activar caravana
          </button>
        </div>
      )}

      <OrganizerUnlock
        open={asking}
        title="Activar caravana"
        hint="Vas a compartir la ubicación de este teléfono para que las familias sigan la caravana."
        onClose={() => setAsking(false)}
        onUnlock={start}
        onError={(message) => showToast(message, true)}
      />

      <Toast toast={toast} />
    </>
  );
}
