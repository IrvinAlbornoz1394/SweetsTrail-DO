import { redirect } from 'next/navigation';
import { ALLOWED_COLONIA_SLUG, getColoniaBySlug } from '@/lib/db';
import { getColoniaCenter } from '@/lib/geocode';
import { currentFamily, familyProgress } from '@/lib/family';
import FamilyMapClient from '@/components/FamilyMapClient';

// Las visitas cambian con cada escaneo: siempre al día.
export const dynamic = 'force-dynamic';

/**
 * Mapa de la familia: su ubicación y las estaciones, con las ya visitadas en
 * gris. Sin sesión no hay nada que mostrar: el panel explica cómo entrar.
 */
export default async function FamilyMapPage() {
  const family = await currentFamily();
  if (!family) redirect('/mi-ruta');

  const colonia = await getColoniaBySlug(ALLOWED_COLONIA_SLUG);
  if (!colonia) redirect('/mi-ruta');

  const [progress, center] = await Promise.all([familyProgress(family), getColoniaCenter(colonia)]);

  return (
    <>
      <div className="page-head">
        <span className="page-head__icon">🗺️</span>
        <div>
          <h2>Estaciones cerca de ti</h2>
          <p>
            Toca una estación para ir hacia ella o registrar tu visita. Llevas {progress.visited.length} de{' '}
            {progress.total}.
          </p>
        </div>
      </div>

      <FamilyMapClient
        pending={progress.pending}
        visited={progress.visited.map((v) => v.station)}
        center={center}
      />
    </>
  );
}
