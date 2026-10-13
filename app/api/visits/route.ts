import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getStationByQrToken, recordVisit } from '@/lib/db';
import { PENDING_COOKIE, currentFamily, familyProgress, pendingCookieOptions } from '@/lib/family';
import { visitSchema } from '@/lib/schemas';
import { stationLabel } from '@/lib/station';

/**
 * Marca la visita al escanear el QR de una estación. La familia sale de su
 * cookie, nunca del cuerpo: así nadie puede marcarle visitas a otra.
 *
 * Sin sesión no se pierde el escaneo: el QR queda pendiente en una cookie y se
 * registra al abrir la liga de WhatsApp (ver /f/[token]).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = visitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' },
      { status: 422 }
    );
  }

  try {
    const station = await getStationByQrToken(parsed.data.token);
    if (!station) {
      return NextResponse.json({ error: 'Este QR ya no corresponde a ninguna estación.' }, { status: 404 });
    }

    const family = await currentFamily();
    if (!family) {
      (await cookies()).set(PENDING_COOKIE, parsed.data.token, pendingCookieOptions);
      return NextResponse.json(
        { error: 'Abre primero la liga que te mandamos por WhatsApp.', needsLink: true },
        { status: 401 }
      );
    }

    if (family.colonia_id !== station.colonia_id) {
      return NextResponse.json({ error: 'Esta estación es de otra colonia.' }, { status: 403 });
    }

    const firstTime = await recordVisit(family.phone, station.id);
    const progress = await familyProgress(family);

    return NextResponse.json({
      station: stationLabel(station),
      firstTime,
      visited: progress.visited.length,
      total: progress.total,
      percent: progress.percent,
    });
  } catch (err) {
    console.error('[visits:POST]', err);
    return NextResponse.json({ error: 'No se pudo registrar la visita.' }, { status: 500 });
  }
}
