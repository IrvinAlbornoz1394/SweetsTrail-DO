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
          Elige tu colonia para ver y gestionar únicamente los registros de tu ruta. Cada colonia
          organiza su evento por separado.
        </p>
      </div>

      <ColoniaPicker colonias={colonias} />
    </>
  );
}
