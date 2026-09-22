import { NextResponse } from 'next/server';
import {
  coloniaExists,
  listChildrenWithTutorByColonia,
  listTutorsWithPaymentsByColonia,
  softDeleteChild,
} from '@/lib/db';
import { checkOrganizerCode } from '@/lib/organizer';
import { childDeleteSchema, rosterUnlockSchema } from '@/lib/schemas';

/**
 * Padrón con datos de contacto y tutores con su cooperación, detrás del código
 * de organizador.
 *
 * Es un POST y no un GET a propósito: el código va en el cuerpo, así no queda
 * escrito en los logs de acceso ni en el historial del navegador. Y los
 * teléfonos solo se leen de la base DESPUÉS de validar el código: mandarlos al
 * navegador y ocultarlos con CSS sería regalarlos en el HTML.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = rosterUnlockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 422 }
    );
  }

  const auth = checkOrganizerCode(parsed.data.code);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    if (!(await coloniaExists(parsed.data.coloniaId))) {
      return NextResponse.json({ error: 'La colonia indicada no existe.' }, { status: 404 });
    }

    // El padrón y los tutores con lo que llevan cooperado viajan juntos: los
    // dos salen del mismo código y el segundo alimenta el registro de pagos,
    // que se hace sin volver a pedirlo.
    const [children, tutors] = await Promise.all([
      listChildrenWithTutorByColonia(parsed.data.coloniaId),
      listTutorsWithPaymentsByColonia(parsed.data.coloniaId),
    ]);

    return NextResponse.json({ children, tutors });
  } catch (err) {
    console.error('[roster:POST]', err);
    return NextResponse.json({ error: 'No se pudo cargar el padrón.' }, { status: 500 });
  }
}

/**
 * Quita un niño del padrón. Borrado suave: la fila se queda con
 * `is_deleted = true` y deja de aparecer en la lista y en el conteo.
 *
 * Pide el código otra vez aunque el filtro avanzado ya esté abierto: el
 * desbloqueo vive en el estado del navegador, y de ese lado no se decide nada.
 */
export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = childDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 422 }
    );
  }

  const auth = checkOrganizerCode(parsed.data.code);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    if (!(await coloniaExists(parsed.data.coloniaId))) {
      return NextResponse.json({ error: 'La colonia indicada no existe.' }, { status: 404 });
    }

    const removed = await softDeleteChild(parsed.data.id, parsed.data.coloniaId);
    if (!removed) {
      return NextResponse.json(
        { error: 'El registro ya se había quitado o pertenece a otra colonia.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[roster:DELETE]', err);
    return NextResponse.json({ error: 'No se pudo quitar el registro.' }, { status: 500 });
  }
}
