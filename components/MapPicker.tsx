'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

export type LatLng = { lat: number; lng: number };

/** Centro de Mérida, Yucatán, por defecto. */
export const DEFAULT_CENTER: LatLng = { lat: 20.9674, lng: -89.5926 };

/**
 * Ícono propio: el marcador por defecto de Leaflet apunta a imágenes que los
 * bundlers no resuelven, así que se rompe en Next. Un divIcon lo evita.
 */
const pinIcon = L.divIcon({
  className: '',
  html: '<div class="pin">📍</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 30],
});

function ClickCatcher({ onPick }: { onPick: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/** Recentra el mapa cuando la ubicación llega de fuera (buscador o GPS). */
function Recenter({ target }: { target: (LatLng & { zoom?: number }) | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.setView([target.lat, target.lng], target.zoom ?? map.getZoom());
  }, [target, map]);
  return null;
}

type Props = {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  flyTo: (LatLng & { zoom?: number }) | null;
};

export default function MapPicker({ value, onChange, flyTo }: Props) {
  const markerHandlers = useMemo(
    () => ({
      dragend(e: L.DragEndEvent) {
        const p = (e.target as L.Marker).getLatLng();
        onChange({ lat: p.lat, lng: p.lng });
      },
    }),
    [onChange]
  );

  return (
    <MapContainer
      center={[DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]}
      zoom={13}
      className="map"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <ClickCatcher onPick={onChange} />
      <Recenter target={flyTo} />
      {value && (
        <Marker
          position={[value.lat, value.lng]}
          icon={pinIcon}
          draggable
          eventHandlers={markerHandlers}
        />
      )}
    </MapContainer>
  );
}
