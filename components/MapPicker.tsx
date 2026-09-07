'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { COLONIA_ZOOM, type LatLng } from '@/lib/map';

export type { LatLng };

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
  /** Centro con el que abre el mapa: el de la colonia seleccionada. */
  initialCenter: LatLng;
  picked: boolean;
  onCenterChange: (p: LatLng) => void;
  onUserDrag: () => void;
  flyTo: (LatLng & { zoom?: number }) | null;
};

export default function MapPicker({
  initialCenter,
  picked,
  onCenterChange,
  onUserDrag,
  flyTo,
}: Props) {
  const [moving, setMoving] = useState(false);

  return (
    <div className="map-shell">
      <MapContainer
        center={[initialCenter.lat, initialCenter.lng]}
        zoom={COLONIA_ZOOM}
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
