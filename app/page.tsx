import { listColonias } from '@/lib/db';
import ColoniaPicker from '@/components/ColoniaPicker';

// El catálogo cambia muy poco: se revalida una vez por hora.
export const revalidate = 3600;

export default async function HomePage() {
  const colonias = await listColonias();

  return (
    <>
      <div className="hero">
        <span className="hero__step">Paso 1 de 2</span>
        <h1>¿En qué colonia participas?</h1>
        <p>
          La ruta de este año se organiza únicamente en la colonia Dolores Otero (CP 97270).
          Confírmala para ver y gestionar los registros de tu ruta.
        </p>
      </div>

      <ColoniaPicker colonias={colonias} />
    </>
  );
}
