import { NextResponse } from 'next/server';
import { coloniaExists, createCandyDonation, listTutorsWithPaymentsByColonia } from '@/lib/db';
import { checkOrganizerCode } from '@/lib/organizer';
import { candyDonationSchema } from '@/lib/schemas';

/**
 * Registra los dulces que entregó un tutor, detrás del código de organizador.
 *
 * Mismo trato que /api/payments: el código se compara aquí aunque las
 * funciones especiales ya estén abiertas, y la respuesta trae la lista de
 * tutores recién leída para que dos personas capturando a la vez vean lo real.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = candyDonationSchema.safeParse(body);
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

  const { coloniaId, tutorId, quantity } = parsed.data;

  try {
    if (!(await coloniaExists(coloniaId))) {
      return NextResponse.json({ error: 'La colonia indicada no existe.' }, { status: 404 });
    }

    const saved = await createCandyDonation(tutorId, coloniaId, quantity);
    if (!saved) {
      return NextResponse.json(
        { error: 'Ese tutor no existe o pertenece a otra colonia.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ tutors: await listTutorsWithPaymentsByColonia(coloniaId) });
  } catch (err) {
    console.error('[candies:POST]', err);
    return NextResponse.json({ error: 'No se pudieron registrar los dulces.' }, { status: 500 });
  }
}
