'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import type { Station } from '@/lib/db';
import { COLONIA_ZOOM, type LatLng } from '@/lib/map';
import { stationLabel } from '@/lib/station';
import { iconFor, meIcon, visitedIconFor } from './spookyIcon';
import FitToStations from './FitToStations';

/** Cerca de la calle: se ve la cuadra y las casas de alrededor. */
const ME_ZOOM = 18;

/**
 * Camino a pie hasta la estación en el mapa del teléfono. Es la liga universal
 * de Google Maps: abre la app si está instalada (Android o iPhone) y si no, la
 * versión web. Sin origen, Maps sale de la ubicación actual y guía en tiempo
 * real, cosa que aquí no tendría caso rehacer.
 */
function directionsUrl(station: Station): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${station.lat},${station.lng}`,
    travelmode: 'walking',
  });
  return `https://www.google.com/maps/dir/?${params}`;
}

/** Centra el mapa en la familia la primera vez que llega su ubicación, y cuando lo pide. */
function FollowMe({ me, recenter }: { me: LatLng | null; recenter: number }) {
  const map = useMap();
  const centered = useRef(false);

  useEffect(() => {
    if (!me || centered.current) return;
    centered.current = true;
    map.setView([me.lat, me.lng], ME_ZOOM);
  }, [me, map]);

  useEffect(() => {
    if (me && recenter > 0) map.setView([me.lat, me.lng], ME_ZOOM);
    // Solo al tocar "Dónde estoy", no cada vez que se mueve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenter]);

  return null;
}

/**
 * Mapa de la familia: dónde está ahora y las estaciones de la ruta. Las que ya
 * visitó van en gris y no se pueden tocar; en las demás, el globo ofrece "Ir a
 * la estación" (abre Google Maps caminando hasta la casa) y "Registrar visita"
 * (lo lleva a su panel con la cámara abierta para escanear el QR).
 */
export default function FamilyMap({
  pending,
  visited,
  center,
}: {
  pending: Station[];
  visited: Station[];
  center: LatLng;
}) {
  const router = useRouter();
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(true);
  const [recenter, setRecenter] = useState(0);
  const all = useMemo(() => [...pending, ...visited], [pending, visited]);

  // Se sigue la ubicación mientras el mapa está abierto: la familia va caminando.
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocating(false);
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  return (
    <>
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
        {/* Mientras no hay ubicación, se encuadran las estaciones. */}
        {!me && <FitToStations stations={all} />}
        <FollowMe me={me} recenter={recenter} />

        {visited.map((station) => (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={visitedIconFor(station.id)}
            interactive={false}
            keyboard={false}
            zIndexOffset={-1000}
          />
        ))}

        {pending.map((station) => (
          <Marker key={station.id} position={[station.lat, station.lng]} icon={iconFor(station.id)}>
            <Popup>
              <strong>{stationLabel(station)}</strong>
              <span className="popup__actions">
                <a
                  className="popup__btn"
                  href={directionsUrl(station)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🚶 Ir a la estación
                </a>
                <button
                  type="button"
                  className="popup__btn popup__btn--primary"
                  onClick={() => router.push('/mi-ruta?escanear=1')}
                >
                  📷 Registrar visita
                </button>
              </span>
            </Popup>
          </Marker>
        ))}

        {me && <Marker position={[me.lat, me.lng]} icon={meIcon} interactive={false} zIndexOffset={1000} />}
      </MapContainer>

      <p className="map-tools">
        {me ? (
          <button type="button" className="link-quiet" onClick={() => setRecenter((n) => n + 1)}>
            📍 Dónde estoy
          </button>
        ) : (
          <span className="hint">
            {locating
              ? 'Buscando tu ubicación…'
              : 'No vemos tu ubicación. Actívala en tu teléfono para ver dónde estás.'}
          </span>
        )}
        <span className="hint">
          {visited.length > 0 && 'En gris, las que ya visitaste.'}
        </span>
      </p>
    </>
  );
}
