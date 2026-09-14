import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="hero">
      <h1>Colonia no disponible</h1>
      <p>
        Esta edición de la ruta es exclusiva de la colonia Dolores Otero (CP 97270). El enlace que
        abriste apunta a otra colonia o está mal escrito.
      </p>
      <p style={{ marginTop: 20 }}>
        <Link className="btn btn--primary" href="/">
          Elegir colonia
        </Link>
      </p>
    </div>
  );
}
