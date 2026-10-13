'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { Station } from '@/lib/db';
import type { LatLng } from '@/lib/map';
import { stationLabel } from '@/lib/station';

/**
 * Envoltorio de cliente para el mapa.
 *
 * `dynamic(..., { ssr: false })` solo se permite dentro de un Client Component,
 * y la página de estaciones es un Server Component. Sin este intermediario,
 * Leaflet se renderizaría en el servidor y tronaría al tocar `window`.
 *
 * La lista de estaciones vive aquí también: al tocar una, el mapa se queda
 * solo con esa para ubicarla de un vistazo.
 */
const StationsMap = dynamic(() => import('./StationsMap'), {
  ssr: false,
  loading: () => <div className="map map--tall map--loading">Cargando mapa…</div>,
});

export default function StationsMapClient({
  stations,
  center,
  coloniaId,
  kids,
}: {
  stations: Station[];
  center: LatLng;
  coloniaId: string;
  /** Niños registrados, para estimar cuánto se tarda en cada estación. */
  kids: number;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  function focus(station: Station) {
    // Tocar otra vez la misma regresa todas.
    if (focusId === station.id) {
      setFocusId(null);
      return;
    }
    setFocusId(station.id);
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <div ref={mapRef} className="map-anchor">
        <StationsMap
          stations={stations}
          center={center}
          coloniaId={coloniaId}
          kids={kids}
          focusId={focusId}
          onShowAll={() => setFocusId(null)}
        />
      </div>

      <ol className="roster roster--stations">
        {stations.map((station, i) => (
          <li
            className={`roster__item${focusId === station.id ? ' roster__item--active' : ''}`}
            key={station.id}
          >
            <button
              type="button"
              className="roster__pick"
              onClick={() => focus(station)}
              aria-pressed={focusId === station.id}
            >
              <span className="roster__num">{i + 1}</span>
              <span className="roster__station">
                <strong>{stationLabel(station)}</strong>
                <small>
                  {station.lat.toFixed(5)}, {station.lng.toFixed(5)}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}
