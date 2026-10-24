import L from 'leaflet';

/**
 * Cada estación luce un elemento de Halloween distinto. No se sortea en cada
 * render: se deriva del id de la estación, así el fantasma de una casa sigue
 * siendo el mismo al recargar, al filtrar o al borrar otra estación —y es el
 * mismo en el mapa general y en la pantalla de registro exitoso.
 *
 * Los marcadores son divIcon y no las imágenes de Leaflet: así no dependen de
 * los PNG del paquete, que se rompen con el bundler.
 */
const SPOOKY = ['👻', '🎃', '🦇', '🕷️', '🕸️', '💀', '☠️', '🧙', '🧟', '🧛', '🪦', '⚰️', '🏰', '🐈‍⬛', '🦉', '🍬'];

export function spookyFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return SPOOKY[hash % SPOOKY.length];
}

const iconCache = new Map<string, L.DivIcon>();

export function iconFor(id: string): L.DivIcon {
  let icon = iconCache.get(id);
  if (!icon) {
    icon = L.divIcon({
      className: '',
      html: `<div class="pin">${spookyFor(id)}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 30],
    });
    iconCache.set(id, icon);
  }
  return icon;
}

/**
 * Con una ruta trazada los emojis se apartan: cada parada es un punto rojo con
 * su número de visita, para que el orden se lea de un vistazo.
 */
export function stopIcon(order: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="stop">${order}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/** Estación que no entra en la ruta trazada: un punto gris, sin emoji. */
export const offRouteIcon = L.divIcon({
  className: '',
  html: '<div class="stop stop--off"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

/** Punto de paso de la ruta: un conector gris que la guía, no una parada. */
export const viaIcon = L.divIcon({
  className: '',
  html: '<div class="stop stop--via"></div>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

/**
 * Flecha de sentido sobre la línea de la ruta. `deg` es el rumbo (0 = norte,
 * en sentido de las manecillas). Se cachea por grado para no crear un icono
 * por cada flecha.
 */
const arrowCache = new Map<number, L.DivIcon>();

export function arrowIcon(deg: number): L.DivIcon {
  const key = Math.round(deg);
  let icon = arrowCache.get(key);
  if (!icon) {
    icon = L.divIcon({
      className: '',
      html: `<div class="route-arrow" style="transform: rotate(${key}deg)"></div>`,
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    });
    arrowCache.set(key, icon);
  }
  return icon;
}

/**
 * Inicio (I) de una ruta. El final no lleva marca propia: es la última
 * estación, con su número.
 */
export const startIcon = L.divIcon({
  className: '',
  html: '<div class="stop stop--start">I</div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/**
 * Estación que la familia ya visitó: el mismo emoji, pero en gris y apagado,
 * para que se note que ya pasaron y no llame la atención.
 */
const visitedCache = new Map<string, L.DivIcon>();

export function visitedIconFor(id: string): L.DivIcon {
  let icon = visitedCache.get(id);
  if (!icon) {
    icon = L.divIcon({
      className: '',
      html: `<div class="pin pin--visited">${spookyFor(id)}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 25],
    });
    visitedCache.set(id, icon);
  }
  return icon;
}

/** Dónde está la familia ahora: el punto azul de siempre en los mapas. */
export const meIcon = L.divIcon({
  className: '',
  html: '<div class="me-dot"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/**
 * La caravana: la camioneta con su murciélago dentro de un círculo, y una
 * flecha alrededor que apunta hacia donde avanza. Sin rumbo todavía (no se ha
 * movido) la flecha no se pinta. Se cachea por grado, como las flechas.
 */
const caravanCache = new Map<number | null, L.DivIcon>();

export function caravanIcon(deg: number | null): L.DivIcon {
  const key = deg === null ? null : Math.round(deg);
  let icon = caravanCache.get(key);
  if (!icon) {
    const arrow =
      key === null
        ? ''
        : `<div class="caravan-pin__arrow" style="transform: rotate(${key}deg)"><span></span></div>`;
    icon = L.divIcon({
      className: '',
      html: `<div class="caravan-pin">${arrow}<div class="caravan-pin__body">🚐<span class="caravan-pin__bat">🦇</span></div></div>`,
      iconSize: [64, 64],
      iconAnchor: [32, 32],
    });
    caravanCache.set(key, icon);
  }
  return icon;
}

/**
 * Calabaza del rastro. `i` es qué tan atrás quedó (0 = la más reciente): cada
 * una más chica y más tenue, para que se lea de dónde viene la caravana.
 */
const trailCache = new Map<number, L.DivIcon>();

export function trailIcon(i: number): L.DivIcon {
  let icon = trailCache.get(i);
  if (!icon) {
    const size = Math.max(10, 22 - i * 2);
    const opacity = Math.max(0.2, 0.9 - i * 0.1);
    icon = L.divIcon({
      className: '',
      html: `<div class="trail-pumpkin" style="font-size:${size}px;opacity:${opacity}">🎃</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
    trailCache.set(i, icon);
  }
  return icon;
}
