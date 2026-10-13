'use client';

import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/**
 * Cámara a pantalla completa que lee el QR de una estación.
 *
 * Se decodifica con jsQR sobre los cuadros del video y no con BarcodeDetector,
 * que Safari no tiene: así funciona igual en iPhone que en Android. Solo pide
 * la cámara trasera, nada de audio, y la apaga en cuanto se cierra.
 *
 * La cámara exige HTTPS (o localhost): en producción, Vercel ya lo da.
 */

/** Lee el token de la URL que va en el QR impreso (`…/v/<token>`). */
function stationToken(text: string): string | null {
  const raw = text.trim();
  if (/^[0-9a-f]{32}$/.test(raw)) return raw;
  try {
    return new URL(raw).pathname.match(/^\/v\/([0-9a-f]{32})\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Cada cuánto se intenta leer: suficiente para que se sienta inmediato sin calentar el teléfono. */
const SCAN_EVERY_MS = 150;
/** El cuadro se reduce antes de leerlo; un QR impreso se lee de sobra a este tamaño. */
const MAX_SIDE = 720;

export default function QrScanner({
  onToken,
  onClose,
}: {
  onToken: (token: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let last = 0;
    let done = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function scan(now: number) {
      frame = requestAnimationFrame(scan);
      const video = videoRef.current;
      if (done || !ctx || !video || video.readyState < video.HAVE_ENOUGH_DATA) return;
      if (now - last < SCAN_EVERY_MS) return;
      last = now;

      const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      if (!code) return;

      const token = stationToken(code.data);
      if (!token) {
        setHint('Ese QR no es de una estación de la ruta.');
        return;
      }
      done = true;
      navigator.vibrate?.(80);
      onToken(token);
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador no deja usar la cámara aquí. Abre la página en Chrome o Safari.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        frame = requestAnimationFrame(scan);
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'No diste permiso para usar la cámara. Actívalo en los ajustes del navegador para esta página y vuelve a intentarlo.'
            : name === 'NotFoundError'
              ? 'No encontramos una cámara en este teléfono.'
              : 'No se pudo abrir la cámara. Cierra otras apps que la estén usando e inténtalo de nuevo.'
        );
      }
    }

    start();
    return () => {
      done = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // onToken se llama una sola vez por apertura; no debe reiniciar la cámara.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El aviso de "ese QR no es de la ruta" se borra solo.
  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 2500);
    return () => clearTimeout(t);
  }, [hint]);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label="Escanear QR de estación">
      {error ? (
        <div className="scanner__error">
          <span aria-hidden="true">📷</span>
          <p>{error}</p>
        </div>
      ) : (
        <>
          <video ref={videoRef} className="scanner__video" playsInline muted />
          <div className="scanner__frame" aria-hidden="true" />
          <p className="scanner__tip">{hint ?? 'Apunta al QR de la estación'}</p>
        </>
      )}
      <button type="button" className="btn btn--ghost scanner__close" onClick={onClose}>
        Cerrar
      </button>
    </div>
  );
}
