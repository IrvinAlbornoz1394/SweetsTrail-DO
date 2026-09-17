/**
 * Rótulo público de una estación: el negocio o local si se registró, y si no
 * el nombre de quien responde por la casa.
 *
 * Vive aquí y no en `lib/db.ts` porque también lo usan los componentes de
 * cliente, y `lib/db.ts` es `server-only`. El parámetro se declara por forma
 * en vez de importar el tipo `Station` para que este módulo no dependa de él.
 *
 * El teléfono nunca entra en este rótulo: es contacto para quien organiza.
 */
export function stationLabel(station: { name: string; business_name: string | null }) {
  return station.business_name?.trim() || station.name;
}
