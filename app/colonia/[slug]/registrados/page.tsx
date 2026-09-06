import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getColoniaBySlug, listChildrenByColonia } from '@/lib/db';
import ColoniaBanner from '@/components/ColoniaBanner';

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
      <ColoniaBanner colonia={colonia} />

      <div className="page-head">
        <span className="page-head__icon">🎃</span>
        <div>
          <h2>Niños registrados</h2>
          <p>Participantes dados de alta en esta colonia.</p>
        </div>
        <Link className="btn btn--ghost btn--back" href={`/colonia/${colonia.slug}`}>
          ← Volver
        </Link>
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
        <ol className="roster">
          {children.map((child, i) => (
            <li className="roster__item" key={child.id}>
              <span className="roster__num">{i + 1}</span>
              <span className="roster__name">{child.name}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
