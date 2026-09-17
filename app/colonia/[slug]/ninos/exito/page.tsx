import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getColoniaBySlug, getRegistrationById } from '@/lib/db';
import { isUuid } from '@/lib/schemas';
import ColoniaBanner from '@/components/ColoniaBanner';

// El registro se acaba de escribir: cachear esta pantalla mostraría el anterior.
export const dynamic = 'force-dynamic';

/**
 * Comprobante de un registro de niños recién hecho.
 *
 * Mismo criterio que la pantalla de estaciones: los datos se releen de la base
 * con el id del tutor —un uuid que solo tiene quien registró— en vez de viajar
 * por la URL, así lo que se enseña es lo que de verdad quedó guardado.
 */
export default async function KidsSuccessPage({
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

  const registration = await getRegistrationById(id, colonia.id);
  if (!registration) notFound();

  const total = registration.children.length;

  return (
    <>
      <ColoniaBanner colonia={colonia} roster={false} />

      <div className="success">
        <span className="success__icon" aria-hidden="true">
          🎉
        </span>
        <h2>¡Registro exitoso!</h2>
        <p>
          {total === 1 ? 'Quedó registrado 1 niño' : `Quedaron registrados ${total} niños`} en la
          ruta de {colonia.name}. Estos son los datos que se guardaron:
        </p>
      </div>

      <div className="summary summary--screen">
        <div className="summary__item summary__item--highlight">
          <span>Responsable o tutor</span>
          <strong>{registration.tutor_name}</strong>
        </div>
        <div className="summary__item">
          <span>Teléfono</span>
          <strong>{registration.tutor_phone}</strong>
        </div>
      </div>

      <ol className="roster">
        {registration.children.map((name, i) => (
          <li className="roster__item" key={i}>
            <span className="roster__num">{i + 1}</span>
            <span className="roster__name">{name}</span>
          </li>
        ))}
      </ol>

      <p className="hint success__hint">
        Guarda esta pantalla si quieres, pero no hace falta: el registro ya quedó hecho.
      </p>

      <div className="success__actions">
        <Link className="btn btn--primary" href="/">
          Volver al inicio
        </Link>
        <Link className="btn btn--ghost" href={`/colonia/${colonia.slug}/ninos`}>
          Registrar otro responsable
        </Link>
      </div>
    </>
  );
}
