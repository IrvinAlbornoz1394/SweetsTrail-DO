import { NextResponse } from 'next/server';
import { coloniaExists, ensureFamilyLinks } from '@/lib/db';
import { checkOrganizerCode } from '@/lib/organizer';
import { familyLinksSchema } from '@/lib/schemas';

/**
 * Ligas de entrada de todas las familias, para mandarlas por WhatsApp. Crea las
 * que falten y nunca cambia las que ya existen: una liga mandada sigue sirviendo.
 *
 * Detrás del código de organizador y por POST, como el padrón: son teléfonos
 * de familias, y cada liga es la llave de su panel.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = familyLinksSchema.safeParse(body);
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

    const base = (process.env.PUBLIC_SITE_URL?.trim() || new URL(request.url).origin).replace(/\/+$/, '');
    const families = await ensureFamilyLinks(parsed.data.coloniaId);

    return NextResponse.json({
      families: families.map(({ token, ...family }) => ({ ...family, link: `${base}/f/${token}` })),
    });
  } catch (err) {
    console.error('[family-links:POST]', err);
    return NextResponse.json({ error: 'No se pudieron generar las ligas.' }, { status: 500 });
  }
}
