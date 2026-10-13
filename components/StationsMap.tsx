'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import type L from 'leaflet';
import type { Station } from '@/lib/db';
import { COLONIA_ZOOM, type LatLng } from '@/lib/map';
import { distance, formatDistance, formatMinutes, routeTime } from '@/lib/route';
import { stationLabel } from '@/lib/station';
import { arrowIcon, iconFor, offRouteIcon, startIcon, stopIcon } from './spookyIcon';
import FitToStations from './FitToStations';
import Modal from './Modal';
import RouteBuilder, { type PlannedRoute } from './RouteBuilder';
import OrganizerUnlock from './OrganizerUnlock';
import { Toast, useToast } from './Toast';

/**
 * Flechas repartidas a lo largo de la ruta, cada una girada con el rumbo de su
 * tramo, para que se lea hacia dónde avanzar. Van cada ~100 m, con un tope
 * para que una ruta larga no se llene de flechas.
 */
function routeArrows(path: LatLng[]): { at: LatLng; deg: number }[] {
  const lengths = path.slice(1).map((p, i) => distance(path[i], p));
  const total = lengths.reduce((a, b) => a + b, 0);
  const every = Math.max(100, total / 60);
  const arrows: { at: LatLng; deg: number }[] = [];

  let next = every / 2;
  let walked = 0;
  lengths.forEach((len, i) => {
    const a = path[i];
    const b = path[i + 1];
    // Rumbo en un plano local: el este se encoge con la latitud.
    const dx = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
    const dy = b.lat - a.lat;
    const deg = (Math.atan2(dx, dy) * 180) / Math.PI;

    while (len > 0 && next <= walked + len) {
      const t = (next - walked) / len;
      arrows.push({ at: { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) }, deg });
      next += every;
    }
    walked += len;
  });

  return arrows;
}

export default function StationsMap({
  stations,
  center,
  coloniaId,
  kids,
  focusId,
  onShowAll,
}: {
  stations: Station[];
  center: LatLng;
  coloniaId: string;
  kids: number;
  /** Estación elegida en la lista: el mapa se queda solo con ella. */
  focusId: string | null;
  onShowAll: () => void;
}) {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [pending, setPending] = useState<Station | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [route, setRoute] = useState<PlannedRoute | null>(null);

  // Las dos herramientas de quien organiza piden el código primero: armar la
  // ruta (en un modal a pantalla completa) y mover estaciones (aquí mismo).
  const [unlocking, setUnlocking] = useState<'route' | 'edit' | null>(null);
  const [building, setBuilding] = useState(false);

  // Código ya validado mientras dura el modo de edición: cada movimiento lo
  // vuelve a mandar y el servidor lo compara otra vez. Se borra al finalizar.
  const [editCode, setEditCode] = useState<string | null>(null);
  const editing = editCode !== null;
  // Posiciones recién guardadas, para no esperar al refresco del servidor.
  const [moved, setMoved] = useState<Record<string, LatLng>>({});

  // Al borrar, el servidor manda la lista nueva; mientras tanto se ocultan las
  // que ya se quitaron para que el mapa no muestre un marcador fantasma.
  // (El borrado es suave: la estación sigue en la base marcada como eliminada.)
  const [removed, setRemoved] = useState<string[]>([]);
  const visible = useMemo(
    () =>
      stations
        .filter((s) => !removed.includes(s.id))
        .map((s) => (moved[s.id] ? { ...s, ...moved[s.id] } : s)),
    [stations, removed, moved]
  );
  // En modo edición se ven todas, para poder mover cualquiera.
  const focused = editCode === null && focusId ? visible.find((s) => s.id === focusId) : undefined;
  const shown = useMemo(() => (focused ? [focused] : visible), [focused, visible]);

  /** Guarda la nueva ubicación al soltar el marcador. Si falla, regresa a su lugar. */
  async function saveMove(station: Station, marker: L.Marker) {
    const { lat, lng } = marker.getLatLng();

    try {
      const res = await fetch('/api/stations', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: station.id, coloniaId, code: editCode, lat, lng }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        marker.setLatLng([station.lat, station.lng]);
        showToast(data.error ?? 'No se pudo mover la estación.', true);
        // Si el código dejó de valer, no tiene caso seguir en modo edición.
        if (res.status === 403 || res.status === 503) setEditCode(null);
        return;
      }

      setMoved((all) => ({ ...all, [station.id]: { lat, lng } }));
      // La ruta trazada pasaba por la ubicación vieja: hay que armarla de nuevo.
      if (route?.stops.some((s) => s.id === station.id)) setRoute(null);
      showToast(`Se movió “${stationLabel(station)}”.`);
      router.refresh();
    } catch {
      marker.setLatLng([station.lat, station.lng]);
      showToast('Sin conexión. Revisa tu internet e inténtalo de nuevo.', true);
    }
  }

  // Número de visita de cada estación dentro de la ruta trazada.
  const order = useMemo(
    () => new Map(route?.stops.map((s, i) => [s.id, i + 1]) ?? []),
    [route]
  );
  const arrows = useMemo(() => (route ? routeArrows(route.path) : []), [route]);
  const time = route && routeTime(route.meters, route.stops.length, route.perStation);
  function closeModal() {
    if (busy) return;
    setPending(null);
    setCode('');
  }

  async function remove() {
    if (!pending) return;

    if (code.trim() === '') {
      showToast('Escribe el código para eliminar.', true);
      return;
    }

    setBusy(true);

    try {
      // El código viaja en el cuerpo, no en la URL: así no queda en los logs
      // del servidor ni en el historial. Quien valida es la API.
      const res = await fetch('/api/stations', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: pending.id, coloniaId, code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Con código incorrecto el diálogo sigue abierto para reintentar.
        showToast(data.error ?? 'No se pudo eliminar la estación.', true);
        setCode('');
        return;
      }

      setRemoved((ids) => [...ids, pending.id]);
      // La ruta trazada pasaba por esa casa: hay que generarla de nuevo.
      if (route?.stops.some((s) => s.id === pending.id)) setRoute(null);
      showToast(`Se eliminó “${stationLabel(pending)}”.`);
      setPending(null);
      setCode('');
      router.refresh();
    } catch {
      showToast('Sin conexión. Revisa tu internet e inténtalo de nuevo.', true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <MapContainer
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
        <FitToStations stations={shown} zoom={focused ? 18 : undefined} />

        {route && !editing && !focused && (
          <>
            <Polyline
              positions={route.path.map((p) => [p.lat, p.lng] as [number, number])}
              // Continua si va por las calles; punteada si es la línea recta de respaldo.
              pathOptions={{ color: '#ff7a1a', weight: 4, opacity: 0.9, dashArray: route.byStreet ? undefined : '8 8' }}
            />
            {arrows.map((arrow, i) => (
              <Marker
                key={i}
                position={[arrow.at.lat, arrow.at.lng]}
                icon={arrowIcon(arrow.deg)}
                interactive={false}
                keyboard={false}
              />
            ))}
            <Marker position={[route.start.lat, route.start.lng]} icon={startIcon} />
          </>
        )}

        {shown.map((station) => editing ? (
          // En modo edición se arrastran; el globo de borrar estorbaría.
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={iconFor(station.id)}
            draggable
            eventHandlers={{ dragend: (e) => saveMove(station, e.target) }}
          />
        ) : (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={!route || focused ? iconFor(station.id) : order.has(station.id) ? stopIcon(order.get(station.id)!) : offRouteIcon}
          >
            <Popup>
              <strong>{stationLabel(station)}</strong>
              <br />
              {station.lat.toFixed(5)}, {station.lng.toFixed(5)}
              <button
                type="button"
                className="popup__remove"
                onClick={() => setPending(station)}
              >
                🗑️ Eliminar estación
              </button>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {focused && (
        <p className="map-focus">
          Solo se muestra <strong>{stationLabel(focused)}</strong>.{' '}
          <button type="button" className="link-quiet" onClick={onShowAll}>
            Ver todas
          </button>
        </p>
      )}

      {editing ? (
        <div className="route-summary route-edit">
          <p className="route-build__prompt">Modo edición: arrastra una estación para moverla.</p>
          <p className="hint">La nueva ubicación se guarda al soltarla.</p>
          <button type="button" className="btn btn--primary route-edit__done" onClick={() => setEditCode(null)}>
            Finalizar
          </button>
        </div>
      ) : route && !focused ? (
        <div className="route-summary">
          <p>
            <strong>Ruta trazada</strong> · ⏱️ unos {formatMinutes(time!.total)} en total
          </p>
          <p className="hint">
            🚶 {formatMinutes(time!.walking)} caminando ({formatDistance(route.meters)}
            {route.byStreet ? ' por las calles' : ' en línea recta'}) · 🍬 {formatMinutes(time!.atStations)} en{' '}
            {route.stops.length} {route.stops.length === 1 ? 'estación' : 'estaciones'} ({route.perStation} min c/u)
          </p>
          <ol className="route-summary__stops">
            <li>Inicio</li>
            {route.stops.map((s, i) => (
              <li key={s.id}>
                {stationLabel(s)}
                {i === route.stops.length - 1 && ' · fin de la ruta'}
              </li>
            ))}
          </ol>
          <button type="button" className="link-quiet" onClick={() => setRoute(null)}>
            Quitar ruta
          </button>{' '}
          <button type="button" className="link-quiet" onClick={() => setUnlocking('route')}>
            Generar otra
          </button>
        </div>
      ) : null}

      {!editing && !focused && (
        <p className="map-tools">
          {!route && (
            <button type="button" className="link-quiet" onClick={() => setUnlocking('route')}>
              Generar una ruta
            </button>
          )}
          <button type="button" className="link-quiet" onClick={() => setUnlocking('edit')}>
            Editar ubicaciones
          </button>
        </p>
      )}

      <OrganizerUnlock
        open={unlocking !== null}
        title={unlocking === 'edit' ? 'Editar ubicaciones' : 'Generar ruta'}
        hint={
          unlocking === 'edit'
            ? 'Solo quien organiza la ruta puede mover estaciones.'
            : 'Solo quien organiza la ruta puede generarla.'
        }
        onClose={() => setUnlocking(null)}
        onUnlock={(code) => (unlocking === 'edit' ? setEditCode(code) : setBuilding(true))}
        onError={(message) => showToast(message, true)}
      />

      <RouteBuilder
        open={building}
        stations={visible}
        center={center}
        kids={kids}
        onClose={() => setBuilding(false)}
        onRoute={(r) => {
          setRoute(r);
          showToast(
            r.byStreet
              ? `Ruta trazada con ${r.stops.length} ${r.stops.length === 1 ? 'parada' : 'paradas'}.`
              : 'No se pudo trazar por las calles; se muestra en línea recta.',
            !r.byStreet
          );
        }}
        onError={(message) => showToast(message, true)}
      />

      <Modal
        open={pending !== null}
        title="Eliminar estación"
        confirmText="Sí, eliminar"
        busyText="Eliminando…"
        danger
        busy={busy}
        onClose={closeModal}
        onConfirm={remove}
      >
        <p>
          Se va a quitar <strong>{pending && stationLabel(pending)}</strong> del mapa y de la
          lista de estaciones.
        </p>
        <p className="hint">
          Deja de aparecer para todos, pero el registro se conserva por si hay que recuperarla.
        </p>

        <div className="field">
          <label htmlFor="deleteCode">Código de organizador</label>
          <input
            id="deleteCode"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) remove();
            }}
            disabled={busy}
          />
          <p className="hint">Solo quien organiza la ruta puede eliminar estaciones.</p>
        </div>
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
