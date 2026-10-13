'use client';

import { useState } from 'react';
import Modal from './Modal';

/**
 * Puerta de las herramientas de quien organiza en el mapa (armar la ruta,
 * mover estaciones): pide el código de organizador y nada más. Si no pasa, el
 * modal se cierra. Si pasa, entrega el código a quien lo pidió: hay acciones
 * que lo vuelven a mandar al servidor, que es quien decide.
 */
export default function OrganizerUnlock({
  open,
  title,
  hint,
  onClose,
  onUnlock,
  onError,
}: {
  open: boolean;
  title: string;
  hint: string;
  onClose: () => void;
  onUnlock: (code: string) => void;
  onError: (message: string) => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  function close() {
    if (busy) return;
    setCode('');
    onClose();
  }

  async function check() {
    if (code.trim() === '') {
      onError('Escribe el código de organizador.');
      return;
    }

    setBusy(true);
    try {
      // El código viaja en el cuerpo y lo compara el servidor, como en el
      // resto de la app.
      const res = await fetch('/api/organizer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      const checked = code.trim();
      setCode('');
      onClose();
      // Si no pasa, el modal se cierra igual: no se queda abierto para reintentar.
      if (res.ok) onUnlock(checked);
      else onError(data.error ?? 'No se pudo comprobar el código.');
    } catch {
      onError('Sin conexión. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      confirmText="Continuar"
      busyText="Comprobando…"
      busy={busy}
      onClose={close}
      onConfirm={check}
    >
      <div className="field">
        <label htmlFor="organizerCode">Código de organizador</label>
        <input
          id="organizerCode"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) check();
          }}
          disabled={busy}
        />
        <p className="hint">{hint}</p>
      </div>
    </Modal>
  );
}
