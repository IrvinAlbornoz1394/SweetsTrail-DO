'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrganizerUnlock from './OrganizerUnlock';
import { Toast, useToast } from './Toast';

/** Cada cuánto, como máximo, se manda la ubicación. */
const SEND_EVERY_MS = 5000;

/** Dónde guarda este teléfono la llave de la caravana que comparte. */
const storageKey = (coloniaId: string) => `caravan-share:${coloniaId}`;

function readToken(coloniaId: string): string | null {
  try {
    return localStorage.getItem(storageKey(coloniaId));
  } catch {
    return null;
  }
}

function saveToken(coloniaId: string, token: string | null) {
  try {
    if (token) localStorage.setItem(storageKey(coloniaId), token);
    else localStorage.removeItem(storageKey(coloniaId));
  } catch {
    // Sin almacenamiento (modo privado): se comparte igual, pero al recargar
    // habría que volver a activarla.
  }
}

/**
 * "Activar caravana": quien organiza comparte desde aquí la ubicación de su
 * teléfono para que las familias la sigan.
 *
 * Activar pide el código de organizador y el permiso de ubicación. La primera
 * ubicación va con el código y el servidor regresa una llave que se guarda en
 * este teléfono; las siguientes van con la llave. Así, si se recarga la página
 * y la caravana sigue activa en la base, vuelve a compartir sola, hasta que se
 * toque "Dejar de compartir". El código nunca se guarda.
 *
 * El navegador solo da la ubicación con la página abierta: por eso se pide que
 * la pantalla no se apague (Wake Lock), donde se pueda.
 */
export default function CaravanShare({ coloniaId }: { coloniaId: string }) {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [asking, setAsking] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const watch = useRef<number | null>(null);
  const lastSent = useRef(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  // El código solo hasta que llega la llave; después, solo la llave.
  const auth = useRef<{ code?: string; token?: string }>({});
  const announced = useRef(false);

  const release = useCallback(() => {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, []);

  /** Deja de compartir en este teléfono, sin avisar al servidor. */
  const end = useCallback(() => {
    release();
    auth.current = {};
    saveToken(coloniaId, null);
    setSharing(false);
    setSentAt(null);
  }, [release, coloniaId]);

  // Al salir de la pantalla se deja de mirar el GPS, pero la llave se queda:
  // al volver, la caravana sigue.
  useEffect(() => release, [release]);

  // El reloj de "enviada hace X s".
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

  async function send(lat: number, lng: number) {
    try {
      const res = await fetch('/api/caravan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coloniaId, ...auth.current, lat, lng }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        auth.current = { token: data.token as string };
        saveToken(coloniaId, data.token as string);
        // La primera ubicación es la que prende "Seguir caravana" arriba.
        if (!announced.current) {
          announced.current = true;
          router.refresh();
        }
        setSentAt(Date.now());
        return;
      }

      // Código incorrecto, o la llave ya no vale (la detuvieron o la activó
      // otro teléfono): aquí se deja de compartir.
      if (res.status === 403 || res.status === 409 || res.status === 422) {
        end();
        router.refresh();
      }
      showToast(data.error ?? 'No se pudo compartir la ubicación.', true);
    } catch {
      // Sin señal un momento: se reintenta con la siguiente ubicación.
    }
  }

  function start(credentials: { code?: string; token?: string }) {
    if (!navigator.geolocation) {
      showToast('Este teléfono no puede compartir su ubicación.', true);
      return;
    }

    auth.current = credentials;
    lastSent.current = 0;
    announced.current = false;
    setSentAt(null);
    setSharing(true);
    keepAwake();

    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
        // Se marca antes de mandar para no encimar dos envíos.
        lastSent.current = Date.now();
        send(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        // Sin permiso no hay nada que hacer. Lo demás (señal débil, un
        // tiempo agotado) es pasajero: se avisa y se sigue escuchando el GPS.
        if (err.code === err.PERMISSION_DENIED) {
          // La llave se conserva: si se da el permiso y se recarga, sigue.
          release();
          setSharing(false);
          showToast('No diste permiso de ubicación. Actívalo en tu navegador para compartir la caravana.', true);
        } else {
          showToast('No pudimos obtener tu ubicación. Revisa que el GPS esté encendido.', true);
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 }
    );
  }

  // Al cargar la página: si este teléfono traía una caravana activa, sigue
  // compartiendo. Si ya no lo está, el servidor lo dice en el primer envío.
  useEffect(() => {
    const token = readToken(coloniaId);
    if (token) start({ token });
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function stop() {
    setBusy(true);
    const credentials = auth.current.token ? { token: auth.current.token } : { code: auth.current.code };
    release();
    try {
      const res = await fetch('/api/caravan', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coloniaId, ...credentials }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) showToast(data.error ?? 'No se pudo detener la caravana.', true);
      else showToast('Dejaste de compartir la caravana.');
    } catch {
      showToast('Sin conexión. La caravana se dará por detenida en un par de minutos.', true);
    } finally {
      end();
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
              Deja esta pantalla abierta: si sales, la caravana se pausa hasta que vuelvas.
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
        onUnlock={(code) => start({ code })}
        onError={(message) => showToast(message, true)}
      />

      <Toast toast={toast} />
    </>
  );
}
