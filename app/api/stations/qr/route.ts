import { NextResponse } from 'next/server';
import { zipSync } from 'fflate';
import {
  ALLOWED_COLONIA_SLUG,
  coloniaExists,
  getColoniaBySlug,
  listStationsForQr,
} from '@/lib/db';
import { checkOrganizerCode } from '@/lib/organizer';
import { renderStationCard } from '@/lib/qrCard';
import { stationQrSchema } from '@/lib/schemas';
import { stationLabel } from '@/lib/station';

// Generar decenas de imágenes tarda: se le da margen en Vercel.
export const maxDuration = 120;

const TITLE = 'Ruta de los Dulces';
const YEAR = '2026';

/** "Tienda Doña Mary" → "tienda-dona-mary", para nombrar los archivos del ZIP. */
function fileSlug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'estacion'
  );
}

/**
 * ZIP con una tarjeta PNG por estación, cada una con su QR, para mandársela a
 * cada casa y que la imprima.
 *
 * Detrás del código de organizador, como todo lo de quien organiza, y por POST
 * para que el código no quede en los logs. Los tokens de los QR solo se leen
 * de la base después de validarlo: son lo que prueba que alguien pasó por la
 * casa, y no deben salir de aquí más que impresos.
 *
 * El QR abre `PUBLIC_SITE_URL/v/<token>`. Sin esa variable se usa la dirección
 * desde donde se pidió el ZIP; si es localhost se avisa en `X-Qr-Warning`,
 * porque un QR impreso ya no se puede corregir.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.' }, { status: 400 });
  }

  const parsed = stationQrSchema.safeParse(body);
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

    const [colonia, stations] = await Promise.all([
      getColoniaBySlug(ALLOWED_COLONIA_SLUG),
      listStationsForQr(parsed.data.coloniaId),
    ]);
    if (stations.length === 0) {
      return NextResponse.json({ error: 'Todavía no hay estaciones registradas.' }, { status: 404 });
    }

    const base = (process.env.PUBLIC_SITE_URL?.trim() || new URL(request.url).origin).replace(/\/+$/, '');
    const local = /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(base);

    const files: Record<string, Uint8Array> = {};
    const digits = String(stations.length).length;

    // Una a la vez: Resvg ocupa memoria por imagen y no hay prisa de segundos.
    for (const [i, station] of stations.entries()) {
      const label = stationLabel(station);
      const png = await renderStationCard({
        title: TITLE,
        year: YEAR,
        colonia: colonia?.name ?? 'Dolores Otero',
        label,
        url: `${base}/v/${station.qr_token}`,
      });
      const name = `${String(i + 1).padStart(Math.max(2, digits), '0')}-${fileSlug(label)}.png`;
      files[name] = new Uint8Array(png);
    }

    // Los PNG ya vienen comprimidos: guardarlos sin volver a comprimir es igual de chico y más rápido.
    const zip = zipSync(files, { level: 0 });

    const headers: Record<string, string> = {
      'content-type': 'application/zip',
      'content-disposition': 'attachment; filename="qr-estaciones-dolores-otero.zip"',
      'cache-control': 'no-store',
    };
    if (local) headers['x-qr-warning'] = 'localhost';

    return new Response(zip, { headers });
  } catch (err) {
    console.error('[stations/qr]', err);
    return NextResponse.json({ error: 'No se pudieron generar los QR.' }, { status: 500 });
  }
}
