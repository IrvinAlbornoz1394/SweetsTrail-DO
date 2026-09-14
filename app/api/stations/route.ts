import { NextResponse } from 'next/server';
import { coloniaExists, createStation, deleteStation, listStationsByColonia } from '@/lib/db';
import { stationDeleteSchema, stationSchema } from '@/lib/schemas';

export async function GET(request: Request) {
  const coloniaId = new URL(request.url).searchParams.get('coloniaId');
  if (!coloniaId) {
    return NextResponse.json({ error: 'Falta el parámetro coloniaId.' }, { status: 400 });
  }

  try {
    return NextResponse.json({ stations: await listStationsByColonia(coloniaId) });
  } catch (err) {
    console.error('[stations:GET]', err);
    return NextResponse.json({ error: 'No se pudieron cargar las estaciones.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = stationSchema.safeParse(body);
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

    const stationId = await createStation(parsed.data);
    return NextResponse.json({ stationId }, { status: 201 });
  } catch (err) {
    console.error('[stations:POST]', err);
    return NextResponse.json({ error: 'No se pudo guardar la estación.' }, { status: 500 });
  }
}

/** Quita una estación registrada por error: DELETE /api/stations?id=…&coloniaId=… */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  // Los parámetros ausentes llegan como null; se pasan como '' para que falle
  // la regla de uuid (mensaje en español) y no el chequeo de tipo de Zod.
  const parsed = stationDeleteSchema.safeParse({
    id: searchParams.get('id') ?? '',
    coloniaId: searchParams.get('coloniaId') ?? '',
  });
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

    const removed = await deleteStation(parsed.data.id, parsed.data.coloniaId);
    if (!removed) {
      return NextResponse.json(
        { error: 'La estación ya no existe o pertenece a otra colonia.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[stations:DELETE]', err);
    return NextResponse.json({ error: 'No se pudo eliminar la estación.' }, { status: 500 });
  }
}
