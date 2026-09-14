'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Botón de volver en la barra superior. El destino se deriva de la ruta —el
 * segmento padre— en lugar de `router.back()`: así siempre sube un nivel del
 * flujo aunque se haya llegado por un enlace directo o recargando la página.
 *
 * Se oculta en el inicio y en el menú de la colonia, donde no hay a dónde subir.
 */
export default function BackButton() {
  const segments = (usePathname() ?? '/').split('/').filter(Boolean);
  if (segments.length <= 2) return null;

  const parent = `/${segments.slice(0, -1).join('/')}`;

  return (
    <Link className="topbar__back" href={parent} aria-label="Volver" title="Volver">
      <span aria-hidden="true">←</span>
    </Link>
  );
}
