import { notFound } from 'next/navigation';
import { getStationByQrToken } from '@/lib/db';
import { isToken } from '@/lib/family';
import { stationLabel } from '@/lib/station';
import VisitCheckIn from '@/components/VisitCheckIn';

// Cada escaneo es una visita nueva: nada de caché.
export const dynamic = 'force-dynamic';

/**
 * Lo que abre el QR impreso de cada estación. La página solo enseña de qué
 * estación se trata; la visita la marca `VisitCheckIn` con un POST, porque
 * registrar algo no le toca a un GET (un precargador de enlaces lo dispararía
 * sin que nadie haya pasado por la casa).
 */
export default async function VisitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isToken(token)) notFound();

  const station = await getStationByQrToken(token);
  if (!station) notFound();

  return <VisitCheckIn token={token} label={stationLabel(station)} />;
}
