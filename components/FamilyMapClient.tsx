'use client';

import dynamic from 'next/dynamic';
import type { Station } from '@/lib/db';
import type { LatLng } from '@/lib/map';

/** Leaflet toca `window`: el mapa de la familia solo se pinta en el navegador. */
const FamilyMap = dynamic(() => import('./FamilyMap'), {
  ssr: false,
  loading: () => <div className="map map--tall map--loading">Cargando mapa…</div>,
});

export default function FamilyMapClient(props: { pending: Station[]; visited: Station[]; center: LatLng }) {
  return <FamilyMap {...props} />;
}
