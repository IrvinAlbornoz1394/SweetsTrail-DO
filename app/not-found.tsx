import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="hero">
      <h1>Colonia no encontrada</h1>
      <p>La colonia que buscas no existe en el catálogo o el enlace está mal escrito.</p>
      <p style={{ marginTop: 20 }}>
        <Link className="btn btn--primary" href="/">
          Elegir colonia
        </Link>
      </p>
    </div>
  );
}
