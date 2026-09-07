import 'server-only';
import { setColoniaCenter, type Colonia } from './db';
import { MERIDA_CENTER, type LatLng } from './map';

/**
 * Devuelve el centro de la colonia para precargar el mapa.
 *
 * SEPOMEX no trae coordenadas, así que la primera vez que se pide una colonia
 * se resuelve con Nominatim y se guarda en su fila. De ahí en adelante sale de
 * la base. Se hace por demanda en lugar de sembrar las 682 de golpe: a 1
 * petición por segundo (el límite de uso de Nominatim) eso serían ~12 minutos
 * para colonias que quizá nadie use.
 *
 * Si la geocodificación falla o tarda, se cae al centro de Mérida: es mejor
 * abrir el mapa un poco lejos que no abrirlo.
 */
export async function getColoniaCenter(colonia: Colonia): Promise<LatLng> {
  if (colonia.lat != null && colonia.lng != null) {
    return { lat: colonia.lat, lng: colonia.lng };
  }

  const query = [
    colonia.name,
    colonia.postal_code,
    colonia.municipio,
    colonia.estado,
    'México',
  ]
    .filter(Boolean)
    .join(', ');

  try {
    const url =
      'https://nominatim.openstreetmap.org/search' +
      `?format=json&limit=1&countrycodes=mx&q=${encodeURIComponent(query)}`;

    const res = await fetch(url, {
      headers: {
        // La política de uso de Nominatim exige identificar la aplicación.
        'User-Agent': 'SweetsTrail/1.0 (ruta de dulces vecinal, Merida)',
        'Accept-Language': 'es',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return MERIDA_CENTER;

    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!Array.isArray(data) || data.length === 0) return MERIDA_CENTER;

    const center = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return MERIDA_CENTER;

    // El caché no debe tumbar la página si falla la escritura.
    await setColoniaCenter(colonia.id, center.lat, center.lng).catch((err) =>
      console.error('[geocode] no se pudo cachear el centro:', err)
    );

    return center;
  } catch (err) {
    console.error(`[geocode] "${query}":`, err instanceof Error ? err.message : err);
    return MERIDA_CENTER;
  }
}
