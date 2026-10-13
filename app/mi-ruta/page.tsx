import Link from 'next/link';
import { ALLOWED_COLONIA_SLUG } from '@/lib/db';
import { currentFamily, familyProgress } from '@/lib/family';
import { stationLabel } from '@/lib/station';

// Es el avance de cada familia: siempre al día.
export const dynamic = 'force-dynamic';

const time = new Intl.DateTimeFormat('es-MX', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Merida',
});

/**
 * Panel de la familia: cuántas estaciones lleva, en número y en porcentaje, y
 * cuáles le faltan. Se entra con la liga de WhatsApp (ver /f/[token]).
 */
export default async function MyRoutePage({
  searchParams,
}: {
  searchParams: Promise<{ liga?: string; visita?: string }>;
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

      <h3 className="family__heading">Visitadas</h3>
      {progress.visited.length === 0 ? (
        <p className="empty">Todavía ninguna. Escanea el QR de cada estación al pasar.</p>
      ) : (
        <ol className="roster">
          {progress.visited.map(({ station, at }) => (
            <li className="roster__item" key={station.id}>
              <span className="roster__num">✅</span>
              <span className="roster__station">
                <strong>{stationLabel(station)}</strong>
                <small>{time.format(new Date(at))}</small>
              </span>
            </li>
          ))}
        </ol>
      )}

      {progress.pending.length > 0 && (
        <>
          <h3 className="family__heading">Te faltan</h3>
          <ol className="roster">
            {progress.pending.map((station) => (
              <li className="roster__item" key={station.id}>
                <span className="roster__num">🍬</span>
                <span className="roster__station">
                  <strong>{stationLabel(station)}</strong>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}

      <p className="hint family__map">
        <Link href={`/colonia/${ALLOWED_COLONIA_SLUG}/estaciones/registradas`}>
          Ver las estaciones en el mapa
        </Link>
      </p>
    </>
  );
}
