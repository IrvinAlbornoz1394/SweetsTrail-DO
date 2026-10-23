'use client';

import dynamic from 'next/dynamic';
import type { Caravan } from '@/lib/db';
import type { LatLng } from '@/lib/map';

/** Leaflet toca `window`: el mapa de la caravana solo se pinta en el navegador. */
const CaravanMap = dynamic(() => import('./CaravanMap'), {
  ssr: false,
  loading: () => <div className="map map--caravan map--loading">Cargando mapa…</div>,
});

export default function CaravanMapClient(props: {
  coloniaId: string;
  initial: Caravan;
  center: LatLng;
  backHref: string;
}) {
  return <CaravanMap {...props} />;
}
