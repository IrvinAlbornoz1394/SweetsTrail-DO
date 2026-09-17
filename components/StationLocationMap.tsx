'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { iconFor } from './spookyIcon';
import type { LatLng } from '@/lib/map';

/**
 * Mapa de una sola estación: el que ve quien acaba de registrarla, para
 * confirmar a simple vista que el pin quedó donde debía.
 *
 * Es de solo lectura —sin arrastre del pin ni opción de borrar— y abre acercado
 * sobre la casa, no sobre la colonia: aquí no hay nada más que mirar.
 */
export default function StationLocationMap({
  id,
  label,
  position,
}: {
  id: string;
  label: string;
  position: LatLng;
}) {
  return (
    <MapContainer
      center={[position.lat, position.lng]}
      zoom={18}
      className="map map--tall"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <Marker position={[position.lat, position.lng]} icon={iconFor(id)}>
        <Popup>
          <strong>{label}</strong>
          <br />
          {position.lat.toFixed(5)}, {position.lng.toFixed(5)}
        </Popup>
      </Marker>
    </MapContainer>
  );
}
