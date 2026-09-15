import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getColoniaBySlug, listChildrenByColonia } from '@/lib/db';
import ColoniaBanner from '@/components/ColoniaBanner';
import RosterSearch from '@/components/RosterSearch';

// El conteo debe estar siempre al día: nada de caché.
export const dynamic = 'force-dynamic';

export default async function RegisteredChildrenPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const colonia = await getColoniaBySlug(slug);
  if (!colonia) notFound();

  const children = await listChildrenByColonia(colonia.id);
  const total = children.length;

  return (
    <>
      <ColoniaBanner colonia={colonia} roster={false} />

      <div className="page-head">
        <span className="page-head__icon">🎃</span>
        <div>
          <h2>Niños registrados</h2>
          <p>Busca a tu niño para verificar que su registro quedó guardado.</p>
        </div>
      </div>

      <div className="tally">
        <span className="tally__number">{total}</span>
        <span className="tally__label">
          {total === 1 ? 'niño registrado' : 'niños registrados'} en {colonia.name}
        </span>
      </div>

      {total === 0 ? (
        <p className="empty">
          Todavía no hay niños registrados en esta colonia.{' '}
          <Link href={`/colonia/${colonia.slug}/ninos`}>Registra al primero.</Link>
        </p>
      ) : (
        <RosterSearch items={children} coloniaId={colonia.id} coloniaName={colonia.name} />
      )}
    </>
  );
}
