'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import type { Station } from '@/lib/db';
import { COLONIA_ZOOM, type LatLng } from '@/lib/map';
import {
  distance,
  formatDistance,
  formatMinutes,
  minutesPerStation,
  routeTime,
  tracePath,
  type TracedPath,
} from '@/lib/route';
import { stationLabel } from '@/lib/station';
import { iconFor, startIcon, stopIcon, viaIcon } from './spookyIcon';
import FitToStations from './FitToStations';
import Modal from './Modal';

export type PlannedRoute = TracedPath & {
  start: LatLng;
  /** En el orden en que se tocaron; la última es donde termina la ruta. */
  stops: Station[];
  /** Puntos de paso que guían el trazo; no son paradas ni suman tiempo. */
  vias: LatLng[];
  /** Minutos de reparto en cada estación, para el tiempo total. */
  perStation: number;
};

/**
 * Punto de paso: un toque en el mapa fuera de las estaciones. La ruta pasa por
 * ahí (sirve para llevarla por una calle en particular), pero no es parada.
 */
type Via = LatLng & { id: string; via: true };

/** Lo que se va tocando después del inicio: estaciones o puntos de paso. */
type Point = Station | Via;

const isVia = (p: Point): p is Via => 'via' in p;

/** Un tramo de la ruta: del punto anterior (inicio, estación o paso) al siguiente. */
type Leg = { key: string; from: LatLng; to: Point };

/** Toques en el mapa (no en un marcador): el primero marca el inicio, los demás son puntos de paso. */
function MapTaps({ onTap }: { onTap: (point: LatLng) => void }) {
  useMapEvents({ click: (e) => onTap({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

/**
 * El mapa nace dentro del modal mientras este todavía se anima, y Leaflet mide
 * su contenedor a medio camino. Se le pide que vuelva a medir al terminar.
 */
function SettleSize() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 260);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

/**
 * Armado de la ruta en un modal casi a pantalla completa, para ver bien el
 * mapa. Se marca dónde inicia y se tocan las estaciones en el orden en que se
 * visitarán (tocar otra vez la última la quita); "Finalizar ruta" la cierra
 * en la última estación tocada. Tocar el mapa entre estaciones agrega un punto
 * de paso gris por donde pasa la ruta, sin contarlo como parada.
 *
 * Cada tramo se traza por las calles en cuanto se toca la estación, así el
 * dibujo y el tiempo estimado van al día mientras se arma.
 */
export default function RouteBuilder({
  open,
  stations,
  center,
  kids,
  onClose,
  onRoute,
  onError,
}: {
  open: boolean;
  stations: Station[];
  center: LatLng;
  /** Niños registrados: de ahí sale el tiempo sugerido por estación. */
  kids: number;
  onClose: () => void;
  onRoute: (route: PlannedRoute) => void;
  onError: (message: string) => void;
}) {
  const [start, setStart] = useState<LatLng | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [perStation, setPerStation] = useState(() => minutesPerStation(kids));
  const [tracing, setTracing] = useState(false);

  // Tramos ya trazados, por clave "origen>destino". Al deshacer y volver a
  // tocar la misma estación no se vuelve a pedir; las promesas en curso se
  // guardan aparte para no pedir dos veces el mismo tramo.
  const [traced, setTraced] = useState<Record<string, TracedPath>>({});
  const inflight = useRef(new Map<string, Promise<TracedPath>>());

  const stops = points.filter((p): p is Station => !isVia(p));
  const order = new Map(stops.map((s, i) => [s.id, i + 1]));

  const legs = useMemo<Leg[]>(() => {
    if (!start) return [];
    let from: LatLng = start;
    let fromKey = `${start.lat.toFixed(6)},${start.lng.toFixed(6)}`;
    return points.map((to) => {
      const leg = { key: `${fromKey}>${to.id}`, from, to };
      from = to;
      fromKey = to.id;
      return leg;
    });
  }, [start, points]);

  function traceLeg(leg: Leg): Promise<TracedPath> {
    let pending = inflight.current.get(leg.key);
    if (!pending) {
      pending = tracePath([leg.from, leg.to]).then((result) => {
        setTraced((all) => ({ ...all, [leg.key]: result }));
        // Si cayó en línea recta, se olvida para reintentarlo al finalizar.
        if (!result.byStreet) inflight.current.delete(leg.key);
        return result;
      });
      inflight.current.set(leg.key, pending);
    }
    return pending;
  }

  useEffect(() => {
    // traceLeg solo usa refs y setters estables: basta con depender de los tramos.
    legs.forEach(traceLeg);
  }, [legs]);

  // Mientras un tramo se calcula, cuenta su distancia en línea recta.
  const meters = legs.reduce(
    (sum, leg) => sum + (traced[leg.key]?.meters ?? distance(leg.from, leg.to)),
    0
  );
  const calculating = legs.some((leg) => !traced[leg.key]);
  const time = routeTime(meters, stops.length, perStation);

  function restart() {
    setStart(null);
    setPoints([]);
  }

  function close() {
    if (tracing) return;
    restart();
    onClose();
  }

  function pick(station: Station) {
    if (!start) {
      onError('Primero toca el mapa para marcar dónde inicia la ruta.');
      return;
    }
    // Tocar otra vez la última quita esa parada: la ruta regresa un paso.
    if (points[points.length - 1]?.id === station.id) {
      setPoints((list) => list.slice(0, -1));
      return;
    }
    // Las demás ya elegidas se visitan una sola vez: tocarlas no hace nada.
    if (order.has(station.id)) return;
    setPoints((list) => [...list, station]);
  }

  function tapMap(point: LatLng) {
    if (!start) {
      setStart(point);
      return;
    }
    const id = `via:${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
    setPoints((list) => (list.some((p) => p.id === id) ? list : [...list, { ...point, id, via: true }]));
  }

  /** Como con las estaciones: tocar el último punto de paso lo quita. */
  function pickVia(via: Via) {
    if (points[points.length - 1]?.id === via.id) setPoints((list) => list.slice(0, -1));
  }

  async function finish() {
    if (!start) {
      onError('Toca el mapa para marcar dónde inicia la ruta.');
      return;
    }
    if (stops.length === 0) {
      onError('Toca al menos una estación para armar la ruta.');
      return;
    }

    // La ruta acaba en la última estación: los pasos que sobren después se descartan.
    const end = points.findLastIndex((p) => !isVia(p)) + 1;

    setTracing(true);
    const results = await Promise.all(legs.slice(0, end).map(traceLeg));
    setTracing(false);

    onRoute({
      start,
      stops,
      vias: points.slice(0, end).filter(isVia),
      perStation,
      meters: results.reduce((sum, r) => sum + r.meters, 0),
      // Cada tramo empieza donde acabó el anterior: se omite el punto repetido.
      path: results.flatMap((r, i) => (i === 0 ? r.path : r.path.slice(1))),
      byStreet: results.every((r) => r.byStreet),
    });
    restart();
    onClose();
  }

  return (
    <Modal
      open={open}
      full
      title="Armar ruta"
      confirmText="Finalizar ruta"
      busyText="Trazando…"
      busy={tracing}
      onClose={close}
      onConfirm={finish}
      extraAction={
        <button
          type="button"
          className="btn btn--ghost modal__extra"
          onClick={restart}
          disabled={tracing || !start}
        >
          Reiniciar ruta
        </button>
      }
    >
      <p className="route-build__prompt">
        {!start
          ? 'Toca el mapa donde inicia la ruta.'
          : stops.length === 0
            ? 'Ahora toca la primera estación que se va a visitar.'
            : `Toca la siguiente estación. Va en: ${stationLabel(stops[stops.length - 1])}.`}
      </p>
      <p className="hint">
        {!start
          ? 'Puedes arrastrar el inicio para ajustarlo.'
          : stops.length === 0
            ? 'Puedes arrastrar el inicio. Si tocas el mapa fuera de una estación, la ruta pasa por ahí (punto gris, no cuenta como parada).'
            : `${stops.length} ${stops.length === 1 ? 'estación' : 'estaciones'} en la ruta; acaba en la última que toques. Toca el mapa para guiar la ruta por un punto gris; toca el último punto otra vez para quitarlo.`}
      </p>

      <div className="route-time">
        <span className="route-time__total">
          ⏱️ {formatMinutes(time.total)}
          {calculating && <small> · calculando…</small>}
        </span>
        <span className="route-time__part">
          🚶 {formatMinutes(time.walking)} caminando ({formatDistance(meters)})
        </span>
        <span className="route-time__part">
          🍬 {formatMinutes(time.atStations)} en estaciones
        </span>
        <label className="route-time__per">
          <input
            type="number"
            min={1}
            max={60}
            inputMode="numeric"
            value={perStation}
            onChange={(e) => setPerStation(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
          />
          min por estación
        </label>
      </div>

      <MapContainer
        center={[center.lat, center.lng]}
        zoom={COLONIA_ZOOM}
        className={`map${start ? '' : ' map--picking'}`}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Rutas: <a href="https://routing.openstreetmap.de/">FOSSGIS / OSRM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <SettleSize />
        <FitToStations stations={stations} />
        <MapTaps onTap={tapMap} />

        {legs.map((leg) => {
          const done = traced[leg.key];
          return done ? (
            <Polyline
              key={leg.key}
              positions={done.path.map((p) => [p.lat, p.lng] as [number, number])}
              pathOptions={{ color: '#ff7a1a', weight: 4, opacity: 0.9, dashArray: done.byStreet ? undefined : '6 6' }}
              interactive={false}
            />
          ) : (
            // Mientras llega el trazo por las calles, una guía tenue.
            <Polyline
              key={leg.key}
              positions={[[leg.from.lat, leg.from.lng], [leg.to.lat, leg.to.lng]]}
              pathOptions={{ color: '#ff7a1a', weight: 2, opacity: 0.4, dashArray: '4 6' }}
              interactive={false}
            />
          );
        })}

        {stations.map((station) => (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={order.has(station.id) ? stopIcon(order.get(station.id)!) : iconFor(station.id)}
            eventHandlers={{ click: () => pick(station) }}
          />
        ))}

        {points.filter(isVia).map((via) => (
          <Marker
            key={via.id}
            position={[via.lat, via.lng]}
            icon={viaIcon}
            eventHandlers={{ click: () => pickVia(via) }}
          />
        ))}

        {start && (
          <Marker
            position={[start.lat, start.lng]}
            icon={startIcon}
            draggable
            eventHandlers={{ dragend: (e) => setStart(e.target.getLatLng()) }}
          />
        )}
      </MapContainer>

      <p className="hint route-time__note">
        Caminando a ~3 km/h, el paso de un grupo con niños. {kids} niños registrados: el año pasado,
        con 100, se tardaba unos 5 min por estación; ajústalo si hace falta.
      </p>
    </Modal>
  );
}
