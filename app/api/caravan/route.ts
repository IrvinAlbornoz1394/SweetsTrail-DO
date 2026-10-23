import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { coloniaExists, getCaravan, isCaravanSharer, stopCaravan, updateCaravan } from '@/lib/db';
import { checkOrganizerCode } from '@/lib/organizer';
import { caravanStopSchema, caravanUpdateSchema, isUuid } from '@/lib/schemas';

// Es la ubicación en vivo: nunca de caché.
export const dynamic = 'force-dynamic';

/**
 * Dónde va la caravana. Pública a propósito: es lo que siguen las familias, y
 * solo trae coordenadas.
 */
export async function GET(request: Request) {
  const coloniaId = new URL(request.url).searchParams.get('coloniaId') ?? '';
  if (!isUuid(coloniaId)) {
    return NextResponse.json({ error: 'Colonia inválida.' }, { status: 422 });
  }

  try {
    return NextResponse.json(await getCaravan(coloniaId), {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (err) {
    console.error('[caravan:GET]', err);
    return NextResponse.json({ error: 'No se pudo leer la caravana.' }, { status: 500 });
  }
}

/**
 * El teléfono que comparte manda aquí su ubicación cada pocos segundos. La
 * primera va con el código de organizador: activa la caravana y regresa una
 * llave. Las siguientes van con esa llave, que el teléfono guarda para seguir
 * compartiendo aunque recargue la página. Sin una de las dos, cualquiera
 * podría mover la caravana a otra calle.
 */
export async function POST(request: Request) {
  const parsed = await parse(request, caravanUpdateSchema);
  if (parsed instanceof NextResponse) return parsed;
  const { coloniaId, code, token, lat, lng } = parsed;

  try {
    if (!(await coloniaExists(coloniaId))) {
      return NextResponse.json({ error: 'La colonia indicada no existe.' }, { status: 404 });
    }

    if (token) {
      const kept = await updateCaravan(coloniaId, lat, lng, { token });
      return kept ? NextResponse.json({ token: kept }) : stopped();
    }

    const auth = checkOrganizerCode(code ?? '');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    return NextResponse.json({ token: await updateCaravan(coloniaId, lat, lng, { start: true }) });
  } catch (err) {
    console.error('[caravan:POST]', err);
    return NextResponse.json({ error: 'No se pudo compartir la ubicación.' }, { status: 500 });
  }
}

/** Dejar de compartir: con el código o con la llave del teléfono que comparte. Borra la ubicación y el rastro. */
export async function DELETE(request: Request) {
  const parsed = await parse(request, caravanStopSchema);
  if (parsed instanceof NextResponse) return parsed;
  const { coloniaId, code, token } = parsed;

  try {
    if (token) {
      if (!(await isCaravanSharer(coloniaId, token))) return stopped();
    } else {
      const auth = checkOrganizerCode(code ?? '');
      if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
      }
    }

    await stopCaravan(coloniaId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[caravan:DELETE]', err);
    return NextResponse.json({ error: 'No se pudo detener la caravana.' }, { status: 500 });
  }
}

/**
 * La llave ya no vale: alguien detuvo la caravana o la activó desde otro
 * teléfono. El teléfono que la traía deja de compartir.
 */
function stopped() {
  return NextResponse.json(
    { error: 'La caravana ya no está activa en este teléfono.', stopped: true },
    { status: 409 }
  );
}

/** Lee el cuerpo y lo valida; si algo falla, regresa la respuesta de error. */
async function parse<T>(request: Request, schema: z.ZodType<T>): Promise<T | NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 422 }
    );
  }

  return parsed.data;
}
