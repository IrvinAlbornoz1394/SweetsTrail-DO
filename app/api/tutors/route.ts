import { NextResponse } from 'next/server';
import { coloniaExists, listTutorsWithPaymentsByColonia } from '@/lib/db';
import { tutorPhoneSearchSchema } from '@/lib/schemas';

/**
 * Buscar por teléfono en la lista pública de tutores. La lista que pinta la
 * página no trae teléfonos (es pública), así que con un número completo se
 * pregunta aquí y solo vuelven los ids que coinciden, nunca un teléfono.
 *
 * Por POST para que el número no quede en los logs ni en el historial.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = tutorPhoneSearchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 422 }
    );
  }

  try {
    if (!(await coloniaExists(parsed.data.coloniaId))) {
      return NextResponse.json({ error: 'La colonia indicada no existe.' }, { status: 404 });
    }

    const tutors = await listTutorsWithPaymentsByColonia(parsed.data.coloniaId);
    const ids = tutors
      .filter((t) => t.children.length > 0 && t.phone === parsed.data.phone)
      .map((t) => t.id);

    return NextResponse.json({ ids });
  } catch (err) {
    console.error('[tutors:POST]', err);
    return NextResponse.json({ error: 'No se pudo buscar el teléfono.' }, { status: 500 });
  }
}
