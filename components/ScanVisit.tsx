'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Toast, useToast } from './Toast';

// La cámara y el lector solo se cargan al tocar el botón.
const QrScanner = dynamic(() => import('./QrScanner'), { ssr: false });

type Visit = { station: string; firstTime: boolean };

/**
 * "Escanear QR de estación" dentro del panel: no todos los teléfonos leen QR
 * desde la cámara, y no todos saben cómo. Al leerlo se marca la visita aquí
 * mismo y el panel se refresca con el avance nuevo, listo para la siguiente.
 */
export default function ScanVisit() {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState<Visit | null>(null);

  async function register(token: string) {
    setScanning(false);
    setSaving(true);
    try {
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(data.error ?? 'No se pudo registrar la visita.', true);
        return;
      }

      setLast({ station: data.station, firstTime: data.firstTime });
      // El conteo de arriba lo pinta el servidor: se vuelve a pedir.
      router.refresh();
    } catch {
      showToast('Sin conexión. Revisa tu internet y vuelve a escanear.', true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="scan-cta"
        onClick={() => setScanning(true)}
        disabled={saving}
      >
        <span className="scan-cta__icon" aria-hidden="true">📷</span>
        <span className="scan-cta__text">
          <strong>{saving ? 'Registrando visita…' : 'Escanear QR de estación'}</strong>
          <small>Toca aquí y apunta la cámara al QR de la casa</small>
        </span>
      </button>

      {last && (
        <p className={`family__notice${last.firstTime ? '' : ' family__notice--again'}`}>
          {last.firstTime ? (
            <>🍬 ¡Visita registrada! <strong>{last.station}</strong></>
          ) : (
            <>✅ Ya habías pasado por <strong>{last.station}</strong>.</>
          )}
        </p>
      )}

      {scanning && <QrScanner onToken={register} onClose={() => setScanning(false)} />}

      <Toast toast={toast} />
    </>
  );
}
