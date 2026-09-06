import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getColoniaBySlug, listStationsByColonia } from '@/lib/db';
import ColoniaBanner from '@/components/ColoniaBanner';
import StationsMapClient from '@/components/StationsMapClient';

// El conteo debe estar siempre al día: nada de caché.
export const dynamic = 'force-dynamic';

export default async function RegisteredStationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const colonia = await getColoniaBySlug(slug);
  if (!colonia) notFound();

  const stations = await listStationsByColonia(colonia.id);
  const total = stations.length;

  return (
    <>
      <ColoniaBanner colonia={colonia} />

      <div className="page-head">
        <span className="page-head__icon">🗺️</span>
        <div>
          <h2>Estaciones registradas</h2>
          <p>Casas que van a repartir dulces en esta colonia.</p>
        </div>
        <Link className="btn btn--ghost btn--back" href={`/colonia/${colonia.slug}/estaciones`}>
          ← Volver
        </Link>
      </div>

      <div className="tally">
        <span className="tally__number">{total}</span>
        <span className="tally__label">
          {total === 1 ? 'estación registrada' : 'estaciones registradas'} en {colonia.name}
        </span>
      </div>

      {total === 0 ? (
        <p className="empty">
          Todavía no hay estaciones en esta colonia.{' '}
          <Link href={`/colonia/${colonia.slug}/estaciones`}>Registra la primera.</Link>
        </p>
      ) : (
        <>
          <StationsMapClient stations={stations} />

          <ol className="roster roster--stations">
            {stations.map((station, i) => (
              <li className="roster__item" key={station.id}>
                <span className="roster__num">{i + 1}</span>
                <span className="roster__station">
                  <strong>{station.name}</strong>
                  <small>{station.address}</small>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
