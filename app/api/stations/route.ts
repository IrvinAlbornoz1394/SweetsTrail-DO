import { NextResponse } from 'next/server';
import { coloniaExists, createStation, listStationsByColonia } from '@/lib/db';
import { stationSchema } from '@/lib/schemas';

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
