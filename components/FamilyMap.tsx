'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Station } from '@/lib/db';
import { COLONIA_ZOOM, type LatLng } from '@/lib/map';
import { formatDistance, formatMinutes, routeTime, tracePath, type TracedPath } from '@/lib/route';
import { stationLabel } from '@/lib/station';
import { iconFor, meIcon, visitedIconFor } from './spookyIcon';
import FitToStations from './FitToStations';
import { Toast, useToast } from './Toast';

/** Cerca de la calle: se ve la cuadra y las casas de alrededor. */
const ME_ZOOM = 18;

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
 * la estación" (traza el camino a pie desde su ubicación) y "Registrar visita"
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
  const { toast, showToast } = useToast();
  const [me, setMe] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(true);
  const [recenter, setRecenter] = useState(0);
  const [target, setTarget] = useState<Station | null>(null);
  const [path, setPath] = useState<TracedPath | null>(null);
  const [tracing, setTracing] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
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

  async function goTo(station: Station) {
    if (!me) {
      showToast('Activa tu ubicación para marcarte el camino.', true);
      return;
    }
    mapRef.current?.closePopup();
    setTarget(station);
    setPath(null);
    setTracing(true);
    const result = await tracePath([me, station], 'foot');
    setPath(result);
    setTracing(false);
    // Que se vea el camino completo, de donde está a la casa.
    mapRef.current?.fitBounds(
      L.latLngBounds(result.path.map((p) => [p.lat, p.lng] as [number, number])),
      { padding: [40, 40], maxZoom: ME_ZOOM }
    );
    if (!result.byStreet) showToast('No se pudo trazar por las calles; se muestra en línea recta.', true);
  }

  function clearRoute() {
    setTarget(null);
    setPath(null);
  }

  const walking = path ? routeTime(path.meters, 0, 0).walking : 0;

  return (
    <>
      <MapContainer
        ref={mapRef}
        center={[center.lat, center.lng]}
        zoom={COLONIA_ZOOM}
        className="map map--tall"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Rutas: <a href="https://routing.openstreetmap.de/">FOSSGIS / OSRM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {/* Mientras no hay ubicación, se encuadran las estaciones. */}
        {!me && <FitToStations stations={all} />}
        <FollowMe me={me} recenter={recenter} />

        {path && (
          <Polyline
            positions={path.path.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: '#ff7a1a', weight: 5, opacity: 0.9, dashArray: path.byStreet ? undefined : '8 8' }}
            interactive={false}
          />
        )}

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
                <button
                  type="button"
                  className="popup__btn"
                  onClick={() => goTo(station)}
                  disabled={tracing}
                >
                  🚶 Ir a la estación
                </button>
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

      {target && (
        <div className="route-summary">
          <p>
            <strong>Camino a {stationLabel(target)}</strong>
          </p>
          <p className="hint">
            {tracing || !path
              ? 'Trazando el camino…'
              : `🚶 ${formatDistance(path.meters)} · unos ${formatMinutes(walking)} caminando`}
          </p>
          <button type="button" className="link-quiet" onClick={clearRoute}>
            Quitar camino
          </button>
        </div>
      )}

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

      <Toast toast={toast} />
    </>
  );
}
