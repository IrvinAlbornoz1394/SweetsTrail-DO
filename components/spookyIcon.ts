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
