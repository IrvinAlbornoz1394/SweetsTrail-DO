import { NextResponse } from 'next/server';
import { coloniaExists, createPayment, listTutorsWithPaymentsByColonia } from '@/lib/db';
import { checkOrganizerCode } from '@/lib/organizer';
import { paymentSchema } from '@/lib/schemas';

/**
 * Registra la cooperación de un tutor, detrás del código de organizador.
 *
 * Como el resto del padrón, el código viaja en el cuerpo y se compara en el
 * servidor: que el filtro avanzado esté abierto en el navegador no autoriza
 * nada de este lado.
 *
 * La respuesta trae la lista de tutores recién leída, no solo un `ok`: si dos
 * personas registran pagos a la vez, quien confirmó de último ve el estado
 * real y no el suyo sumado a una lista vieja.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = paymentSchema.safeParse(body);
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

  const { coloniaId, tutorId, amount } = parsed.data;

  try {
    if (!(await coloniaExists(coloniaId))) {
      return NextResponse.json({ error: 'La colonia indicada no existe.' }, { status: 404 });
    }

    const saved = await createPayment(tutorId, coloniaId, amount);
    if (!saved) {
      return NextResponse.json(
        { error: 'Ese tutor no existe o pertenece a otra colonia.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ tutors: await listTutorsWithPaymentsByColonia(coloniaId) });
  } catch (err) {
    console.error('[payments:POST]', err);
    return NextResponse.json({ error: 'No se pudo registrar el pago.' }, { status: 500 });
  }
}
