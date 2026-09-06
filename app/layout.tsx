import type { Metadata } from 'next';
import Link from 'next/link';
// El CSS de Leaflet debe ir antes que globals.css: sin él los tiles pierden su
// posicionamiento absoluto (se apilan desalineados) y los marcadores no se ubican.
import 'leaflet/dist/leaflet.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'SweetsTrail · Ruta de los Dulces',
  description:
    'Gestión de la ruta de los dulces por colonia: registro de niños participantes y estaciones de dulce.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX">
      <body>
        <header className="topbar">
          <Link className="brand" href="/" title="Cambiar de colonia">
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
