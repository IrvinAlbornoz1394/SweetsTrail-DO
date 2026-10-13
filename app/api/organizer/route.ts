import { NextResponse } from 'next/server';
import { checkOrganizerCode } from '@/lib/organizer';
import { organizerCheckSchema } from '@/lib/schemas';

/**
 * Comprueba el código de organizador y nada más. Es la puerta del generador de
 * rutas: el cálculo corre en el navegador con las estaciones públicas, pero la
 * comparación del código se queda aquí, como en el resto de la app.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = organizerCheckSchema.safeParse(body);
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

  return NextResponse.json({ ok: true });
}
