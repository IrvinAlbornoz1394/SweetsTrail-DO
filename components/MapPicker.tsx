'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';

export type LatLng = { lat: number; lng: number };

/** Centro de Mérida, Yucatán, por defecto. */
export const DEFAULT_CENTER: LatLng = { lat: 20.9674, lng: -89.5926 };

/**
 * Reporta el centro del mapa cada vez que deja de moverse, y avisa aparte
 * cuando el movimiento lo hizo la persona arrastrando.
 *
 * Se separan las dos señales a propósito: Leaflet dispara `moveend` también
 * al inicializarse y al recentrar por GPS, así que usarlo como "ya eligió"
 * daría por válida una ubicación que nadie escogió.
 */
function CenterTracker({
  onCenterChange,
  onUserDrag,
  onMovingChange,
}: {
  onCenterChange: (p: LatLng) => void;
  onUserDrag: () => void;
  onMovingChange: (moving: boolean) => void;
}) {
  const map = useMapEvents({
    movestart: () => onMovingChange(true),
    moveend: () => {
      onMovingChange(false);
      const c = map.getCenter();
      onCenterChange({ lat: c.lat, lng: c.lng });
    },
    dragend: () => onUserDrag(),
  });

  return null;
}

/** Recentra el mapa cuando la ubicación llega de fuera (GPS). */
function Recenter({ target }: { target: (LatLng & { zoom?: number }) | null }) {
  const map = useMap();

  useEffect(() => {
    if (target) map.setView([target.lat, target.lng], target.zoom ?? map.getZoom());
  }, [target, map]);

  return null;
}

type Props = {
  picked: boolean;
  onCenterChange: (p: LatLng) => void;
  onUserDrag: () => void;
  flyTo: (LatLng & { zoom?: number }) | null;
};

export default function MapPicker({ picked, onCenterChange, onUserDrag, flyTo }: Props) {
  const [moving, setMoving] = useState(false);

  return (
    <div className="map-shell">
      <MapContainer
        center={[DEFAULT_CENTER.lat, DEFAULT_CENTER.lng]}
        zoom={14}
        className="map"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <CenterTracker
          onCenterChange={onCenterChange}
          onUserDrag={onUserDrag}
          onMovingChange={setMoving}
        />
        <Recenter target={flyTo} />
      </MapContainer>

      {/* El pin no es un marcador de Leaflet: se queda fijo al centro del
          visor mientras el mapa se mueve debajo. Es el patrón que funciona
          en móvil, donde atinarle con el dedo a un punto exacto es difícil. */}
      <div
        className={`map-shell__pin${moving ? ' is-moving' : ''}${picked ? ' is-picked' : ''}`}
        aria-hidden="true"
      >
        <span className="map-shell__pin-icon">📍</span>
        <span className="map-shell__pin-shadow" />
      </div>
    </div>
  );
}
