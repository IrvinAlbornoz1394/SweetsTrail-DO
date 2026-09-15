import 'server-only';

/**
 * Código de organizador (STATION_DELETE_CODE). Es la misma llave para todo lo
 * que solo puede hacer quien organiza la ruta: eliminar estaciones y ver los
 * datos de contacto del padrón.
 *
 * La comparación vive siempre en el servidor. Si se revisara en el navegador,
 * bastaría con leer el JS —o llamar a la API a mano— para saltársela, y del
 * otro lado hay teléfonos de familias.
 */
export function checkOrganizerCode(code: string):
  | { ok: true }
  | { ok: false; status: 503 | 403; error: string } {
  const expected = process.env.STATION_DELETE_CODE?.trim();

  if (!expected) {
    console.error('[organizer] falta STATION_DELETE_CODE en el entorno');
    return { ok: false, status: 503, error: 'El código de organizador no está configurado en este servidor.' };
  }

  return code === expected
    ? { ok: true }
    : { ok: false, status: 403, error: 'Código incorrecto.' };
}
