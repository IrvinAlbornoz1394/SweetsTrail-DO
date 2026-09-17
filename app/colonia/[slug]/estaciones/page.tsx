import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getColoniaBySlug, listStationsByColonia } from '@/lib/db';
import { getColoniaCenter } from '@/lib/geocode';
import ColoniaBanner from '@/components/ColoniaBanner';
import StationForm from '@/components/StationForm';

// El contador debe reflejar lo que acaba de registrarse: nada de caché.
export const dynamic = 'force-dynamic';

export default async function StationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const colonia = await getColoniaBySlug(slug);
  if (!colonia) notFound();

  const [total, center] = await Promise.all([
    listStationsByColonia(colonia.id).then((s) => s.length),
    getColoniaCenter(colonia),
  ]);

  return (
    <>
      <ColoniaBanner colonia={colonia} />

      <div className="page-head">
        <span className="page-head__icon">🏠</span>
        <div>
          <h2>Registro de estación de dulce</h2>
          <p>Coloca el marcador sobre la casa que va a participar en la ruta.</p>
        </div>
      </div>

      <div className="tally tally--compact">
        <span className="tally__number">{total}</span>
        <span className="tally__label">
          {total === 1 ? 'estación registrada' : 'estaciones registradas'} hasta ahora
        </span>
        <Link
          className="btn btn--ghost tally__action"
          href={`/colonia/${colonia.slug}/estaciones/registradas`}
        >
          🗺️ Ver estaciones registradas
        </Link>
      </div>

      <StationForm
        coloniaId={colonia.id}
        coloniaName={colonia.name}
        coloniaSlug={colonia.slug}
        initialCenter={center}
      />
    </>
  );
}
