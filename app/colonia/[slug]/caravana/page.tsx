import { notFound } from 'next/navigation';
import { getCaravan, getColoniaBySlug } from '@/lib/db';
import { getColoniaCenter } from '@/lib/geocode';
import CaravanMapClient from '@/components/CaravanMapClient';

// Es la ubicación en vivo: siempre al día.
export const dynamic = 'force-dynamic';

/**
 * La caravana en el mapa, casi a pantalla completa. Se abre aunque no esté
 * compartiendo: el mapa lo dice y la muestra en cuanto vuelva.
 */
export default async function CaravanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const colonia = await getColoniaBySlug(slug);
  if (!colonia) notFound();

  const [caravan, center] = await Promise.all([getCaravan(colonia.id), getColoniaCenter(colonia)]);

  return (
    <>
      <div className="page-head">
        <span className="page-head__icon">🚐</span>
        <div>
          <h2>Caravana</h2>
          <p>Las calabazas marcan por dónde viene.</p>
        </div>
      </div>

      <CaravanMapClient
        coloniaId={colonia.id}
        initial={caravan}
        center={center}
        backHref={`/colonia/${colonia.slug}`}
      />
    </>
  );
}
