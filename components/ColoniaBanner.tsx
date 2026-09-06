import Link from 'next/link';
import type { Colonia } from '@/lib/db';

/**
 * Franja siempre visible con la colonia activa. Es deliberadamente llamativa:
 * evita que alguien registre en la colonia equivocada.
 *
 * También es el único punto de entrada al padrón: solo se puede consultar la
 * lista de niños de una colonia ya elegida.
 */
export default function ColoniaBanner({ colonia }: { colonia: Colonia }) {
  return (
    <div className="colonia-banner">
      <span className="colonia-banner__pin">📍</span>

      <div className="colonia-banner__text">
        <small>Estás registrando en</small>
        <strong>{colonia.name}</strong>
        <span className="colonia-banner__meta">
          {colonia.tipo ?? 'Colonia'} · CP {colonia.postal_code ?? '—'} · {colonia.municipio},{' '}
          {colonia.estado}
        </span>
      </div>

      <div className="colonia-banner__actions">
        <Link className="colonia-banner__roster" href={`/colonia/${colonia.slug}/registrados`}>
          🎃 Niños registrados
        </Link>
        <Link className="colonia-banner__change" href="/">
          Cambiar colonia
        </Link>
      </div>
    </div>
  );
}
