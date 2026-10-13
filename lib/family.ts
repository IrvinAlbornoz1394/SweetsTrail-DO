import 'server-only';
import { cookies } from 'next/headers';
import { getFamilyByToken, listStationsByColonia, listVisits, type Family, type Station } from './db';

/**
 * Sesión de las familias. No hay usuarios ni contraseñas: cada familia recibe
 * por WhatsApp una liga secreta (`/f/<token>`) y al abrirla se guarda el token
 * en una cookie. Esa cookie es la sesión; el servidor la vuelve a buscar en la
 * base en cada petición, así que borrar la liga corta la sesión al instante.
 *
 * La cookie es httpOnly: ningún script de la página la puede leer, y por eso
 * tampoco puede robarla un enlace o una extensión del navegador.
 */
export const FAMILY_COOKIE = 'family';

/**
 * QR escaneado antes de entrar con la liga. Se guarda aquí y la visita se
 * registra en cuanto la familia abre su liga, para no perderla.
 */
export const PENDING_COOKIE = 'pending_visit';

/** Hasta pasado el evento: después ya no hay nada que marcar. */
const FAMILY_COOKIE_EXPIRES = new Date('2026-11-30T23:59:59-06:00');

export const familyCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  expires: FAMILY_COOKIE_EXPIRES,
};

/** Un QR pendiente solo vale un rato: si nadie entra, se olvida. */
export const pendingCookieOptions = {
  ...familyCookieOptions,
  expires: undefined,
  maxAge: 60 * 60 * 6,
};

/** Los tokens son hexadecimales; cualquier otra cosa ni se consulta. */
export const isToken = (value: string) => /^[0-9a-f]{32,64}$/.test(value);

/** La familia de la cookie actual, o null si no ha entrado (o su liga ya no existe). */
export async function currentFamily(): Promise<Family | null> {
  const token = (await cookies()).get(FAMILY_COOKIE)?.value;
  if (!token || !isToken(token)) return null;
  return getFamilyByToken(token);
}

export type Progress = {
  visited: { station: Station; at: string }[];
  pending: Station[];
  total: number;
  /** Entero de 0 a 100. */
  percent: number;
};

/**
 * Avance de una familia: cuántas de las estaciones vivas de su colonia ya
 * visitó. Una estación borrada deja de contar en ambos lados.
 */
export async function familyProgress(family: Family): Promise<Progress> {
  const [stations, visits] = await Promise.all([
    listStationsByColonia(family.colonia_id),
    listVisits(family.phone),
  ]);

  const byId = new Map(stations.map((s) => [s.id, s]));
  const visited = visits
    .filter((v) => byId.has(v.station_id))
    .map((v) => ({ station: byId.get(v.station_id)!, at: v.created_at }));
  const seen = new Set(visited.map((v) => v.station.id));
  const pending = stations.filter((s) => !seen.has(s.id));
  const total = stations.length;

  return {
    visited,
    pending,
    total,
    percent: total === 0 ? 0 : Math.round((visited.length / total) * 100),
  };
}
