import Link from 'next/link';
import { currentFamily, familyProgress } from '@/lib/family';
import { stationLabel } from '@/lib/station';
import ScanVisit from '@/components/ScanVisit';

// Es el avance de cada familia: siempre al día.
export const dynamic = 'force-dynamic';

/**
 * Panel de la familia: cuántas estaciones lleva, en número y en porcentaje, y
 * el botón para escanear el QR de cada casa con la cámara. La lista de
 * estaciones se queda en el mapa: aquí estorbaría al botón, que es lo que se
 * usa en la calle. Se entra con la liga de WhatsApp (ver /f/[token]).
 */
export default async function MyRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ liga?: string; visita?: string; escanear?: string }>;
}) {
  const [query, family] = await Promise.all([searchParams, currentFamily()]);

  if (!family) {
    return (
      <div className="success">
        <span className="success__icon" aria-hidden="true">🔑</span>
        <h2>{query.liga === 'invalida' ? 'Esta liga ya no es válida' : 'Mi ruta'}</h2>
        <p>
          {query.liga === 'invalida'
            ? 'Pídele una nueva a quien organiza la ruta.'
            : 'Para ver tus estaciones visitadas, abre la liga que te mandamos por WhatsApp.'}
        </p>
      </div>
    );
  }

  const progress = await familyProgress(family);
  const justVisited = query.visita
    ? progress.visited.find((v) => v.station.id === query.visita)
    : undefined;

  return (
    <>
      <div className="page-head">
        <span className="page-head__icon">🎃</span>
        <div>
          <h2>Mi ruta</h2>
          <p>{family.tutors.join(' · ')}</p>
        </div>
      </div>

      {family.children.length > 0 && (
        <p className="family__kids">
          {family.children.map((child) => (
            <span key={child} className="family__kid">
              {child}
            </span>
          ))}
        </p>
      )}

      {justVisited && (
        <p className="family__notice">
          🍬 Se registró tu visita a <strong>{stationLabel(justVisited.station)}</strong>.
        </p>
      )}

      {/* "Registrar visita" en el mapa llega aquí con la cámara ya abierta. */}
      <ScanVisit autoOpen={query.escanear === '1'} />

      <div className="progress">
        <div className="progress__stats">
          <span className="progress__stat">
            <strong>
              {progress.visited.length} de {progress.total}
            </strong>
            <small>estaciones visitadas</small>
          </span>
          <span className="progress__stat">
            <strong>{progress.percent}%</strong>
            <small>de la ruta</small>
          </span>
        </div>
        <div className="progress__bar" aria-hidden="true">
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        {progress.total > 0 && progress.pending.length === 0 && (
          <p className="progress__done">🏆 ¡Completaron toda la ruta!</p>
        )}
      </div>

      <p className="hint family__map">
        <Link className="btn btn--ghost btn--block" href="/mi-ruta/mapa">
          🗺️ Ver las estaciones en el mapa
        </Link>
      </p>
    </>
  );
}
