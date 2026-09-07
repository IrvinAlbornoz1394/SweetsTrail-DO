/** Tipos y constantes de mapa compartidos entre cliente y servidor. */

export type LatLng = { lat: number; lng: number };

/** Centro de Mérida: a dónde caer si la colonia no se pudo ubicar. */
export const MERIDA_CENTER: LatLng = { lat: 20.9674, lng: -89.5926 };

/** Zoom con el que se abre el mapa sobre una colonia. */
export const COLONIA_ZOOM = 16;
