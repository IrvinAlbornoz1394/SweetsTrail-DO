import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { FAMILY_COOKIE, isToken } from '@/lib/family';
import BackButton from '@/components/BackButton';
// El CSS de Leaflet debe ir antes que globals.css: sin él los tiles pierden su
// posicionamiento absoluto (se apilan desalineados) y los marcadores no se ubican.
import 'leaflet/dist/leaflet.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'SweetsTrail · Ruta de los Dulces',
  description:
    'Gestión de la ruta de los dulces por colonia: registro de niños participantes y estaciones de dulce.',
};

/**
 * App pensada primero para teléfono: `viewportFit: 'cover'` permite usar toda
 * la pantalla en equipos con notch, y el CSS respeta las safe areas con
 * env(safe-area-inset-*). Se deja el zoom habilitado a propósito: bloquearlo
 * estorba a quien necesita acercar el texto.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#14101f',
};

/**
 * El título lleva a la familia que ya entró con su liga directo a su panel: la
 * portada sirve para elegir colonia y registrarse, y eso ya lo hizo. Basta con
 * ver que la cookie exista; si la liga ya no vale, el panel lo dice.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(FAMILY_COOKIE)?.value;
  const home = token && isToken(token) ? '/mi-ruta' : '/';

  return (
    <html lang="es-MX">
      <body>
        <header className="topbar">
          <BackButton />
          <Link className="brand" href={home} title={home === '/' ? 'Inicio' : 'Mi ruta'}>
            <span className="brand__icon">🍬</span>
            <span className="brand__text">
              <strong>SweetsTrail</strong>
              <small>Ruta de los Dulces 2026</small>
            </span>
          </Link>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
