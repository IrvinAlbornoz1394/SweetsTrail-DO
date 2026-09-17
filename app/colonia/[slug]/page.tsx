import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getColoniaBySlug } from '@/lib/db';
import ColoniaBanner from '@/components/ColoniaBanner';

export default async function ColoniaHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const colonia = await getColoniaBySlug(slug);
  if (!colonia) notFound();

  return (
    <>
      <ColoniaBanner colonia={colonia} />

      <div className="hero">
        <span className="hero__step">Paso 2 de 2</span>
        <h1>¿Qué quieres hacer?</h1>
        <p>Elige una opción para continuar con el registro de tu colonia.</p>
      </div>

      <div className="choices">
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
    </>
  );
}
