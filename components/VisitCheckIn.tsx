'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type Result =
  | { kind: 'loading' }
  | { kind: 'done'; firstTime: boolean; visited: number; total: number; percent: number }
  | { kind: 'needsLink' }
  | { kind: 'error'; message: string };

/** Marca la visita en cuanto se abre el QR y enseña cómo va la familia. */
export default function VisitCheckIn({ token, label }: { token: string; label: string }) {
  const [result, setResult] = useState<Result>({ kind: 'loading' });
  // En desarrollo React monta dos veces: la visita se pide una sola.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    fetch('/api/visits', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) setResult({ kind: 'done', ...data });
        else if (data.needsLink) setResult({ kind: 'needsLink' });
        else setResult({ kind: 'error', message: data.error ?? 'No se pudo registrar la visita.' });
      })
      .catch(() =>
        setResult({ kind: 'error', message: 'Sin conexión. Revisa tu internet y vuelve a escanear.' })
      );
  }, [token]);

  if (result.kind === 'loading') {
    return (
      <div className="success">
        <span className="success__icon" aria-hidden="true">🎃</span>
        <h2>{label}</h2>
        <p>Marcando tu visita…</p>
      </div>
    );
  }

  if (result.kind === 'needsLink') {
    return (
      <div className="success">
        <span className="success__icon" aria-hidden="true">🔑</span>
        <h2>{label}</h2>
        <p>
          Para marcar tus visitas, abre primero la liga que te mandamos por WhatsApp. Esta visita
          se guardará en cuanto entres.
        </p>
        <p className="hint">¿No tienes la liga? Pídesela a quien organiza la ruta.</p>
      </div>
    );
  }

  if (result.kind === 'error') {
    return (
      <div className="success">
        <span className="success__icon" aria-hidden="true">👻</span>
        <h2>{label}</h2>
        <p>{result.message}</p>
      </div>
    );
  }

  return (
    <>
      <div className="success">
        <span className="success__icon" aria-hidden="true">{result.firstTime ? '🍬' : '✅'}</span>
        <h2>{result.firstTime ? '¡Visita registrada!' : 'Ya habías pasado por aquí'}</h2>
        <p>
          <strong>{label}</strong>
        </p>
      </div>

      <div className="progress">
        <div className="progress__stats">
          <span className="progress__stat">
            <strong>
              {result.visited} de {result.total}
            </strong>
            <small>estaciones</small>
          </span>
          <span className="progress__stat">
            <strong>{result.percent}%</strong>
            <small>de la ruta</small>
          </span>
        </div>
        <div className="progress__bar" aria-hidden="true">
          <span style={{ width: `${result.percent}%` }} />
        </div>
      </div>

      <Link className="btn btn--primary btn--block" href="/mi-ruta">
        Ver mi ruta
      </Link>
    </>
  );
}
