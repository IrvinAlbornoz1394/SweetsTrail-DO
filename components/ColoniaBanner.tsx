import Link from 'next/link';
import type { Colonia } from '@/lib/db';

/**
 * Franja compacta con la colonia activa. La ruta es exclusiva de Dolores Otero,
 * así que no ofrece cambiar de colonia ni necesita ser llamativa: basta con
 * confirmar dónde se registra sin robarle altura al formulario en móvil.
 *
 * También es el único punto de entrada al padrón: solo se puede consultar la
 * lista de niños de una colonia ya elegida. En el padrón mismo el enlace sobra,
 * y esas páginas lo apagan con `roster={false}`.
 */
export default function ColoniaBanner({
  colonia,
  roster = true,
}: {
  colonia: Colonia;
  roster?: boolean;
}) {
  return (
    <div className="colonia-banner">
      <span className="colonia-banner__pin" aria-hidden="true">
        📍
      </span>

      <p className="colonia-banner__text">
        <strong>{colonia.name}</strong>
        <span className="colonia-banner__meta">
          CP {colonia.postal_code ?? '—'} · {colonia.municipio}
        </span>
      </p>

      {roster && (
        <Link className="colonia-banner__roster" href={`/colonia/${colonia.slug}/registrados`}>
          Ver niños registrados
        </Link>
      )}
    </div>
  );
}
