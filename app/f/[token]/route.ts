import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getFamilyByToken, getStationByQrToken, recordVisit } from '@/lib/db';
import {
  FAMILY_COOKIE,
  PENDING_COOKIE,
  familyCookieOptions,
  isToken,
} from '@/lib/family';

/**
 * La liga que recibe cada familia por WhatsApp. Abrirla es "iniciar sesión":
 * guarda el token en una cookie y lleva al panel de la familia.
 *
 * Si antes escanearon un QR sin haber entrado, esa visita quedó pendiente en
 * otra cookie y se registra aquí mismo, para que no se pierda.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const panel = new URL('/mi-ruta', request.url);

  const family = isToken(token) ? await getFamilyByToken(token) : null;
  if (!family) {
    panel.searchParams.set('liga', 'invalida');
    return NextResponse.redirect(panel);
  }

  const store = await cookies();
  store.set(FAMILY_COOKIE, token, familyCookieOptions);

  const pending = store.get(PENDING_COOKIE)?.value;
  if (pending) {
    store.delete(PENDING_COOKIE);
    const station = isToken(pending) ? await getStationByQrToken(pending) : null;
    if (station && station.colonia_id === family.colonia_id) {
      await recordVisit(family.phone, station.id);
      panel.searchParams.set('visita', station.id);
    }
  }

  return NextResponse.redirect(panel);
}
