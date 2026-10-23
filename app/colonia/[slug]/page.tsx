import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCaravan, getColoniaBySlug } from '@/lib/db';
import CaravanShare from '@/components/CaravanShare';
import ColoniaBanner from '@/components/ColoniaBanner';

// "Seguir caravana" aparece solo mientras alguien la comparte: nada de caché.
export const dynamic = 'force-dynamic';

export default async function ColoniaHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const colonia = await getColoniaBySlug(slug);
  if (!colonia) notFound();

  // Si la caravana no se puede leer (por ejemplo, la tabla aún no existe en la
  // base), la pantalla sigue funcionando: solo no aparece "Seguir caravana".
  const caravan = await getCaravan(colonia.id).catch((err) => {
    console.error('[colonia:caravan]', err);
    return { active: false };
  });

  return (
    <>
      <ColoniaBanner colonia={colonia} />

      <div className="hero">
        <span className="hero__step">Paso 2 de 2</span>
        <h1>¿Qué quieres hacer?</h1>
        <p>Elige una opción para continuar con el registro de tu colonia.</p>
      </div>

      <div className="choices">
        {caravan.active && (
          <Link className="choice choice--caravan" href={`/colonia/${colonia.slug}/caravana`}>
            <span className="choice__icon">🚐🎃</span>
            <span className="choice__title">Seguir caravana</span>
            <span className="choice__desc">La caravana va en camino: mira en el mapa por dónde va.</span>
            <span className="choice__cta">Ver en el mapa →</span>
          </Link>
        )}

        <Link className="choice" href={`/colonia/${colonia.slug}/ninos`}>
          <span className="choice__icon">👻</span>
          <span className="choice__title">Registrar niños participantes</span>
          <span className="choice__desc">
            Da de alta al tutor responsable y a todos los niños que lo acompañarán en la ruta.
          </span>
          <span className="choice__cta">Comenzar registro →</span>
        </Link>

        <Link className="choice choice--alt" href={`/colonia/${colonia.slug}/estaciones`}>
          <span className="choice__icon">🏠</span>
          <span className="choice__title">Registrar estación de dulce</span>
          <span className="choice__desc">
            Da de alta la casa o negocio que va a repartir dulces, con su responsable y su
            ubicación en el mapa.
          </span>
          <span className="choice__cta">Comenzar registro →</span>
        </Link>
      </div>

      <CaravanShare coloniaId={colonia.id} />
    </>
  );
}
