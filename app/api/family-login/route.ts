import { NextResponse } from 'next/server';
import { coloniaExists, ensureFamilyToken, listTutorsWithPaymentsByColonia } from '@/lib/db';
import { familyLoginSchema } from '@/lib/schemas';

/**
 * "Ver perfil" desde la lista de tutores: quien conoce el teléfono con que se
 * registró el tutor recibe su liga de entrada, la misma que se manda por
 * WhatsApp, y el navegador la abre para iniciar la sesión (ver /f/[token]).
 *
 * El teléfono es la única prueba, así que la respuesta a un teléfono que no
 * corresponde no dice nada más: ni de quién es ni si existe en otra familia.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = familyLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 422 }
    );
  }

  const { coloniaId, tutorId, phone } = parsed.data;

  try {
    if (!(await coloniaExists(coloniaId))) {
      return NextResponse.json({ error: 'La colonia indicada no existe.' }, { status: 404 });
    }

    const tutor = (await listTutorsWithPaymentsByColonia(coloniaId)).find((t) => t.id === tutorId);
    if (!tutor || tutor.children.length === 0 || tutor.phone !== phone) {
      return NextResponse.json(
        { error: 'Ese teléfono no corresponde a este tutor.' },
        { status: 403 }
      );
    }

    const token = await ensureFamilyToken(phone, coloniaId);
    if (!token) {
      return NextResponse.json({ error: 'No se pudo abrir el perfil.' }, { status: 500 });
    }

    return NextResponse.json({ link: `/f/${token}` });
  } catch (err) {
    console.error('[family-login:POST]', err);
    return NextResponse.json({ error: 'No se pudo abrir el perfil.' }, { status: 500 });
  }
}
