import type { LatLng } from './map';

/**
 * Trazo de la ruta de dulces. El orden lo decide quien organiza, tocando las
 * estaciones una por una; aquí solo se dibuja el camino entre ellas.
 *
 * El camino sale del motor OSRM que FOSSGIS publica sobre OpenStreetMap, en
 * su perfil de auto: sigue las calles y respeta el sentido de cada vialidad.
 * Es gratis, sin llave, y con CORS abierto para pedirlo desde el navegador.
 * Solo viajan coordenadas —las mismas que ya muestra el mapa—, nunca nombres
 * ni teléfonos.
 *
 * Si el servicio no responde, la ruta se une en línea recta: es mejor un trazo
 * aproximado que quedarse sin ruta en plena noche de dulces.
 */
const OSRM = 'https://routing.openstreetmap.de/routed-car';

/**
 * Paso de un grupo grande con niños: unos 3 km/h, más lento que un adulto
 * solo (4–5 km/h) porque se avanza al ritmo de los más chicos.
 */
const WALK_SPEED = 3000 / 3600; // m/s

/**
 * Referencia del año pasado: con ~100 niños se iban unos 5 minutos en cada
 * estación repartiendo dulces. Con más niños, el reparto tarda en proporción.
 */
const REFERENCE_KIDS = 100;
const REFERENCE_MINUTES = 5;

/** Minutos sugeridos por estación según cuántos niños hay registrados. */
export function minutesPerStation(kids: number): number {
  return Math.max(1, Math.round((kids / REFERENCE_KIDS) * REFERENCE_MINUTES));
}

/** Tiempo estimado de la ruta, en minutos: caminando más el reparto en cada estación. */
export function routeTime(meters: number, stations: number, perStation: number) {
  const walking = Math.round(meters / WALK_SPEED / 60);
  const atStations = stations * perStation;
  return { walking, atStations, total: walking + atStations };
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export type TracedPath = {
  meters: number;
  /** La línea a dibujar: por las calles, o recta entre puntos si falló. */
  path: LatLng[];
  byStreet: boolean;
};

/** Distancia en metros entre dos puntos (haversine). */
export function distance(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Rumbo de `a` hacia `b` en grados (0 = norte, en sentido de las manecillas),
 * en un plano local: a esta escala la curvatura no se nota.
 */
export function bearing(a: LatLng, b: LatLng): number {
  const dx = (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180);
  const dy = b.lat - a.lat;
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

/** Camino por las calles que pasa por `points` en ese orden. */
export async function tracePath(points: LatLng[]): Promise<TracedPath> {
  try {
    const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const res = await fetch(
      `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(10000) }
    );
    const data = await res.json();
    if (!res.ok || data.code !== 'Ok') throw new Error(data.message ?? `OSRM ${res.status}`);

    const route = data.routes[0] as {
      distance: number;
      geometry: { coordinates: [number, number][] };
    };

    return {
      meters: route.distance,
      path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      byStreet: true,
    };
  } catch (err) {
    console.error('[route]', err instanceof Error ? err.message : err);

    let meters = 0;
    for (let i = 1; i < points.length; i++) meters += distance(points[i - 1], points[i]);
    return { meters, path: points, byStreet: false };
  }
}

/**
 * Flechas repartidas a lo largo de la ruta, cada una girada con el rumbo de su
 * tramo, para que se lea hacia dónde avanzar. Van cada ~100 m, con un tope
 * para que una ruta larga no se llene de flechas.
 */
export function routeArrows(path: LatLng[]): { at: LatLng; deg: number }[] {
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
