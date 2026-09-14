import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getColoniaBySlug } from '@/lib/db';
import ColoniaBanner from '@/components/ColoniaBanner';
import KidsForm from '@/components/KidsForm';

export default async function KidsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const colonia = await getColoniaBySlug(slug);
  if (!colonia) notFound();

  return (
    <>
      <ColoniaBanner colonia={colonia} />

      <div className="page-head">
        <span className="page-head__icon">👻</span>
        <div>
          <h2>Registro de niños participantes</h2>
          <p>Los campos de niño que queden vacíos se omitirán automáticamente.</p>
        </div>
      </div>

      <KidsForm coloniaId={colonia.id} coloniaName={colonia.name} />
    </>
  );
}
