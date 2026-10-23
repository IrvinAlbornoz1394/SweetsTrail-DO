import { notFound } from 'next/navigation';
import { getColoniaBySlug, listTutorsWithPaymentsByColonia } from '@/lib/db';
import TutorDirectory from '@/components/TutorDirectory';

// Quien se acaba de registrar debe aparecer: nada de caché.
export const dynamic = 'force-dynamic';

/**
 * Lista de tutores para entrar al perfil de la familia sin la liga de
 * WhatsApp. Es pública: al navegador solo bajan nombres de tutores y de sus
 * niños; el teléfono, que es lo que abre el perfil, se queda en el servidor.
 */
export default async function TutorsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const colonia = await getColoniaBySlug(slug);
  if (!colonia) notFound();

  // Un tutor sin niños vivos no tiene perfil que abrir.
  const tutors = (await listTutorsWithPaymentsByColonia(colonia.id))
    .filter((t) => t.children.length > 0)
    .map(({ id, name, children }) => ({ id, name, children }));

  return (
    <>
      <div className="page-head">
        <span className="page-head__icon">👨‍👩‍👧</span>
        <div>
          <h2>Tutores</h2>
          <p>Busca tu nombre y entra a tu perfil con tu teléfono.</p>
        </div>
      </div>

      {tutors.length === 0 ? (
        <p className="empty">Todavía no hay tutores registrados en {colonia.name}.</p>
      ) : (
        <TutorDirectory tutors={tutors} coloniaId={colonia.id} />
      )}
    </>
  );
}
