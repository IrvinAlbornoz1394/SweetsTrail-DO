'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLng } from '@/lib/map';

/** Encuadra el mapa sobre todas las estaciones registradas. */
export default function FitToStations({
  stations,
  zoom = 16,
}: {
  stations: LatLng[];
  /** Acercamiento cuando hay una sola estación. */
  zoom?: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (stations.length === 0) return;

    if (stations.length === 1) {
      map.setView([stations[0].lat, stations[0].lng], zoom);
      return;
    }

    map.fitBounds(
      L.latLngBounds(stations.map((s) => [s.lat, s.lng] as [number, number])),
      { padding: [50, 50], maxZoom: 17 }
    );
  }, [stations, zoom, map]);

  return null;
}
