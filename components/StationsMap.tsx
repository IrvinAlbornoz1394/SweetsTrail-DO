'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Station } from '@/lib/db';
import { COLONIA_ZOOM, type LatLng } from '@/lib/map';

/** Mismo criterio que el selector: divIcon para no depender de las imágenes de Leaflet. */
const houseIcon = L.divIcon({
  className: '',
  html: '<div class="pin">🏠</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 30],
});

/** Encuadra el mapa sobre todas las estaciones registradas. */
function FitToStations({ stations }: { stations: Station[] }) {
  const map = useMap();

  useEffect(() => {
    if (stations.length === 0) return;

    if (stations.length === 1) {
      map.setView([stations[0].lat, stations[0].lng], 16);
      return;
    }

    map.fitBounds(
      L.latLngBounds(stations.map((s) => [s.lat, s.lng] as [number, number])),
      { padding: [50, 50], maxZoom: 17 }
    );
  }, [stations, map]);

  return null;
}

export default function StationsMap({
  stations,
  center,
}: {
  stations: Station[];
  center: LatLng;
}) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={COLONIA_ZOOM}
      className="map map--tall"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitToStations stations={stations} />

      {stations.map((station) => (
        <Marker key={station.id} position={[station.lat, station.lng]} icon={houseIcon}>
          <Popup>
            <strong>{station.name}</strong>
            <br />
            {station.lat.toFixed(5)}, {station.lng.toFixed(5)}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
