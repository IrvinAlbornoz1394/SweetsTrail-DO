'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import type { Caravan } from '@/lib/db';
import { COLONIA_ZOOM, type LatLng } from '@/lib/map';
import { caravanIcon, trailIcon } from './spookyIcon';

/** Ni tan cerca que se pierda la calle, ni tan lejos que no se vea avanzar. */
const CARAVAN_ZOOM = 17;

/** Cada cuánto se pregunta dónde va: el teléfono que comparte manda cada ~5 s. */
const POLL_MS = 5000;

/**
 * Sigue a la caravana sin pelear con quien mueve el mapa: la primera vez se
 * centra con el zoom de la caravana; después solo se recorre cuando la caravana
 * se acerca a la orilla de lo que se ve. "Centrar caravana" la vuelve a poner
 * en medio.
 */
function Follow({ at, recenter }: { at: LatLng | null; recenter: number }) {
  const map = useMap();
  const centered = useRef(false);

  useEffect(() => {
    if (!at) {
      centered.current = false;
      return;
    }
    if (!centered.current) {
      centered.current = true;
      map.setView([at.lat, at.lng], CARAVAN_ZOOM);
      return;
    }
    if (!map.getBounds().pad(-0.25).contains([at.lat, at.lng])) {
      map.panTo([at.lat, at.lng]);
    }
  }, [at, map]);

  useEffect(() => {
    if (at && recenter > 0) map.setView([at.lat, at.lng], CARAVAN_ZOOM);
    // Solo al tocar "Centrar caravana", no cada vez que se mueve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenter]);

  return null;
}

/** "hace 8 s", "hace 1 min": qué tan fresca es la ubicación. */
function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`;
}

/**
 * Mapa casi de pantalla completa con la caravana en vivo: la camioneta con una
 * flecha hacia donde avanza y, detrás, calabazas por donde ya pasó. Si deja de
 * compartir (o el teléfono se queda sin señal), el mapa lo dice en lugar de
 * mostrar una ubicación vieja como si fuera la de ahora.
 */
export default function CaravanMap({
  coloniaId,
  initial,
  center,
  backHref,
}: {
  coloniaId: string;
  initial: Caravan;
  center: LatLng;
  backHref: string;
}) {
  const [caravan, setCaravan] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [recenter, setRecenter] = useState(0);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch(`/api/caravan?coloniaId=${coloniaId}`, { cache: 'no-store' });
        if (res.ok && alive) setCaravan((await res.json()) as Caravan);
      } catch {
        // Sin conexión: se queda lo último y se reintenta en la siguiente vuelta.
      }
      if (alive) setNow(Date.now());
    }
    const timer = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [coloniaId]);

  const { lat, lng } = caravan;
  const live = caravan.active && lat !== null && lng !== null;
  // Mismo objeto mientras no cambie la ubicación: así `Follow` no se dispara
  // cada vez que la consulta regresa el mismo punto.
  const at = useMemo(() => (live ? { lat: lat!, lng: lng! } : null), [live, lat, lng]);

  return (
    <div className="caravan-view">
      <MapContainer
        center={at ? [at.lat, at.lng] : [center.lat, center.lng]}
        zoom={at ? CARAVAN_ZOOM : COLONIA_ZOOM}
        className="map map--caravan"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Follow at={at} recenter={recenter} />

        {at && caravan.trail.length > 0 && (
          <Polyline
            positions={[at, ...caravan.trail].map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: '#ff7a1a', weight: 3, opacity: 0.45, dashArray: '4 8' }}
            interactive={false}
          />
        )}

        {at &&
          caravan.trail.map((p, i) => (
            <Marker
              key={`${p.lat},${p.lng}`}
              position={[p.lat, p.lng]}
              icon={trailIcon(i)}
              interactive={false}
              keyboard={false}
            />
          ))}

        {at && (
          <Marker
            position={[at.lat, at.lng]}
            icon={caravanIcon(caravan.heading)}
            interactive={false}
            zIndexOffset={1000}
          />
        )}
      </MapContainer>

      {!at && (
        <div className="caravan-empty" role="status">
          <span className="caravan-empty__icon" aria-hidden="true">🚐</span>
          <strong>La caravana no está compartiendo su ubicación ahora</strong>
          <p>En cuanto vuelva a compartirla aparecerá aquí sola. Puedes dejar esta pantalla abierta.</p>
          <Link className="btn btn--ghost" href={backHref}>
            Volver
          </Link>
        </div>
      )}

      {at && (
        <p className="map-tools">
          <button type="button" className="link-quiet" onClick={() => setRecenter((n) => n + 1)}>
            📍 Centrar caravana
          </button>
          {caravan.updated_at && <span className="hint">Actualizada {ago(caravan.updated_at, now)}</span>}
        </p>
      )}
    </div>
  );
}
