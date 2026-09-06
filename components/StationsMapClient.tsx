'use client';

import dynamic from 'next/dynamic';
import type { Station } from '@/lib/db';

/**
 * Envoltorio de cliente para el mapa.
 *
 * `dynamic(..., { ssr: false })` solo se permite dentro de un Client Component,
 * y la página de estaciones es un Server Component. Sin este intermediario,
 * Leaflet se renderizaría en el servidor y tronaría al tocar `window`.
 */
const StationsMap = dynamic(() => import('./StationsMap'), {
  ssr: false,
  loading: () => <div className="map map--tall map--loading">Cargando mapa…</div>,
});

export default function StationsMapClient({ stations }: { stations: Station[] }) {
  return <StationsMap stations={stations} />;
}
