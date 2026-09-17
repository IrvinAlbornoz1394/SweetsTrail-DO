import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getColoniaBySlug, getStationById } from '@/lib/db';
import { isUuid } from '@/lib/schemas';
import { stationLabel } from '@/lib/station';
import ColoniaBanner from '@/components/ColoniaBanner';
import StationLocationMapClient from '@/components/StationLocationMapClient';

// La estación se acaba de escribir: cachear esta pantalla mostraría la anterior.
export const dynamic = 'force-dynamic';

/**
 * Comprobante de una estación recién registrada.
 *
 * La estación se vuelve a leer de la base en lugar de arrastrar los datos por
 * la URL: lo que se enseña aquí es lo que quedó guardado de verdad, no lo que
 * se tecleó. El id es un uuid que solo tiene quien acaba de registrar, y la
 * consulta va acotada a la colonia de la ruta.
 */
export default async function StationSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const colonia = await getColoniaBySlug(slug);
  if (!colonia) notFound();

  const id = Array.isArray(query.id) ? query.id[0] : query.id;
  if (!id || !isUuid(id)) notFound();

  const station = await getStationById(id, colonia.id);
  if (!station) notFound();

  const label = stationLabel(station);

  return (
    <>
      <ColoniaBanner colonia={colonia} roster={false} />

      <div className="success">
        <span className="success__icon" aria-hidden="true">
          🎉
        </span>
        <h2>¡Estación registrada!</h2>
        <p>
          <strong>{label}</strong> ya forma parte de la ruta de dulces de {colonia.name}. Así es
          como aparece en el mapa:
        </p>
      </div>

      <div className="summary summary--screen">
        <div className="summary__item summary__item--highlight">
          <span>Se muestra en el mapa como</span>
          <strong>{label}</strong>
        </div>
        <div className="summary__item">
          <span>Responsable</span>
          <strong>{station.name}</strong>
        </div>
        {station.business_name && (
          <div className="summary__item">
            <span>Negocio o local</span>
            <strong>{station.business_name}</strong>
          </div>
        )}
        <div className="summary__item">
          <span>Teléfono (no se publica)</span>
          <strong>{station.phone ?? '—'}</strong>
        </div>
        <div className="summary__item">
          <span>Coordenadas</span>
          <strong>
            {station.lat.toFixed(6)}, {station.lng.toFixed(6)}
          </strong>
        </div>
      </div>

      <StationLocationMapClient
        id={station.id}
        label={label}
        position={{ lat: station.lat, lng: station.lng }}
      />

      <p className="hint success__hint">
        Si el pin no quedó justo sobre la casa, avísale a quien organiza la ruta para corregirlo.
      </p>

      <div className="success__actions">
        <Link className="btn btn--primary" href="/">
          Volver al inicio
        </Link>
        <Link className="btn btn--ghost" href={`/colonia/${colonia.slug}/estaciones`}>
          Registrar otra estación
        </Link>
      </div>
    </>
  );
}
