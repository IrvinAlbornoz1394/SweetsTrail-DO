'use client';

import dynamic from 'next/dynamic';
import type { LatLng } from '@/lib/map';

/**
 * Envoltorio de cliente, por el mismo motivo que StationsMapClient:
 * `dynamic(..., { ssr: false })` solo se permite dentro de un Client Component,
 * y la pantalla de registro exitoso es un Server Component.
 */
const StationLocationMap = dynamic(() => import('./StationLocationMap'), {
  ssr: false,
  loading: () => <div className="map map--tall map--loading">Cargando mapa…</div>,
});

export default function StationLocationMapClient(props: {
  id: string;
  label: string;
  position: LatLng;
}) {
  return <StationLocationMap {...props} />;
}
