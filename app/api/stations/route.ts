import { NextResponse } from 'next/server';
import { coloniaExists, createStation, listStationsByColonia, softDeleteStation } from '@/lib/db';
import { checkOrganizerCode } from '@/lib/organizer';
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

/**
 * Quita una estación registrada por error. El borrado es suave: la fila se
 * queda en la base con `is_deleted = true` y deja de aparecer en el mapa y en
 * la lista, así que un borrado equivocado se puede revertir.
 *
 * El código de organizador va en el cuerpo y no en la URL a propósito: no debe
 * quedar escrito en los logs de acceso ni en el historial del navegador. Y se
 * compara aquí, en el servidor: si solo se revisara en el navegador, bastaría
 * con leer el JS o llamar a la API a mano para saltárselo.
 */
export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = stationDeleteSchema.safeParse(body);
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

    const removed = await softDeleteStation(parsed.data.id, parsed.data.coloniaId);
    if (!removed) {
      return NextResponse.json(
        { error: 'La estación ya se había eliminado o pertenece a otra colonia.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[stations:DELETE]', err);
    return NextResponse.json({ error: 'No se pudo eliminar la estación.' }, { status: 500 });
  }
}
