'use client';

import { useMemo, useState } from 'react';
import type { Child } from '@/lib/db';

/** Quita acentos para que "jose" encuentre "José". */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Padrón con buscador: el caso real es un papá que ya registró a su niño y
 * quiere confirmarlo. La numeración que se muestra es la posición en el padrón
 * completo, no en los resultados, para que no cambie al filtrar.
 */
export default function RosterSearch({
  items,
  coloniaName,
}: {
  items: Child[];
  coloniaName: string;
}) {
  const [query, setQuery] = useState('');

  const index = useMemo(
    () => items.map((child, i) => ({ child, position: i + 1, haystack: norm(child.name) })),
    [items]
  );

  const q = norm(query.trim());
  const results = q ? index.filter((entry) => entry.haystack.includes(q)) : index;

  return (
    <>
      <div className="card">
        <div className="field">
          <label htmlFor="rosterSearch">¿Ya registraste a tu niño? Búscalo por su nombre</label>
          <input
            id="rosterSearch"
            type="search"
            placeholder="Ej. Sofía, Diego Martín…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <p className="hint">
            {q === ''
              ? `Escribe su nombre para confirmar que quedó registrado en ${coloniaName}.`
              : results.length === 0
                ? 'Ningún nombre coincide con tu búsqueda.'
                : `${results.length} ${results.length === 1 ? 'coincidencia' : 'coincidencias'} de ${items.length} registrados`}
          </p>
        </div>
      </div>

      {results.length === 0 ? (
        <p className="empty">
          No encontramos <strong>“{query.trim()}”</strong> en la lista. Revisa cómo lo escribiste
          (por ejemplo, solo el nombre) o vuelve a registrarlo.
        </p>
      ) : (
        <ol className="roster">
          {results.map(({ child, position }) => (
            <li className="roster__item" key={child.id}>
              <span className="roster__num">{position}</span>
              <span className="roster__name">{child.name}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
