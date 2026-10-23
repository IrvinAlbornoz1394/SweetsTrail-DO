import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { coloniaExists, getCaravan, stopCaravan, updateCaravan } from '@/lib/db';
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
 * El teléfono que comparte manda aquí su ubicación cada pocos segundos. Va
 * detrás del código de organizador: sin él, cualquiera podría mover la
 * caravana a otra calle.
 */
export async function POST(request: Request) {
  const parsed = await parse(request, caravanUpdateSchema);
  if (parsed instanceof NextResponse) return parsed;

  try {
    if (!(await coloniaExists(parsed.coloniaId))) {
      return NextResponse.json({ error: 'La colonia indicada no existe.' }, { status: 404 });
    }
    await updateCaravan(parsed.coloniaId, parsed.lat, parsed.lng);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[caravan:POST]', err);
    return NextResponse.json({ error: 'No se pudo compartir la ubicación.' }, { status: 500 });
  }
}

/** Dejar de compartir: también con el código. */
export async function DELETE(request: Request) {
  const parsed = await parse(request, caravanStopSchema);
  if (parsed instanceof NextResponse) return parsed;

  try {
    await stopCaravan(parsed.coloniaId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[caravan:DELETE]', err);
    return NextResponse.json({ error: 'No se pudo detener la caravana.' }, { status: 500 });
  }
}

/** Lee el cuerpo, lo valida y comprueba el código; si algo falla, regresa la respuesta de error. */
async function parse<T extends { code: string }>(
  request: Request,
  schema: z.ZodType<T>
): Promise<T | NextResponse> {
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

  const auth = checkOrganizerCode(parsed.data.code);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  return parsed.data;
}
