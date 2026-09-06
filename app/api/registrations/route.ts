import { NextResponse } from 'next/server';
import { coloniaExists, createRegistration } from '@/lib/db';
import { registrationSchema } from '@/lib/schemas';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? 'Datos inválidos.',
        issues: parsed.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
      },
      { status: 422 }
    );
  }

  try {
    if (!(await coloniaExists(parsed.data.coloniaId))) {
      return NextResponse.json(
        { error: 'La colonia indicada no existe. Vuelve a elegirla.' },
        { status: 404 }
      );
    }

    const tutorId = await createRegistration(parsed.data);
    return NextResponse.json(
      { tutorId, children: parsed.data.children.length },
      { status: 201 }
    );
  } catch (err) {
    console.error('[registrations]', err);
    return NextResponse.json({ error: 'No se pudo guardar el registro.' }, { status: 500 });
  }
}
