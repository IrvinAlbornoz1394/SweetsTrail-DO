'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Colonia } from '@/lib/db';

/** Quita acentos para que "merida" encuentre "Mérida". */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const MAX_VISIBLE = 60;

export default function ColoniaPicker({ colonias }: { colonias: Colonia[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [going, setGoing] = useState<string | null>(null);

  /** La plataforma opera para una sola colonia: buscar entre una opción sobra. */
  const single = colonias.length <= 1;

  const index = useMemo(
    () => colonias.map((c) => ({ colonia: c, haystack: norm(`${c.name} ${c.postal_code ?? ''} ${c.tipo ?? ''}`) })),
    [colonias]
  );

  const results = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return index.slice(0, MAX_VISIBLE).map((i) => i.colonia);
    return index
      .filter((i) => i.haystack.includes(q))
      .slice(0, MAX_VISIBLE)
      .map((i) => i.colonia);
  }, [index, query]);

  const total = query.trim()
    ? index.filter((i) => i.haystack.includes(norm(query.trim()))).length
    : colonias.length;

  function choose(colonia: Colonia) {
    setGoing(colonia.slug);
    router.push(`/colonia/${colonia.slug}`);
  }

  return (
    <div className="card picker">
      {single ? (
        <p className="hint">
          {colonias.length === 0
            ? 'La colonia Dolores Otero (CP 97270) aún no está cargada en la base de datos.'
            : 'Esta edición de la ruta es exclusiva de la colonia Dolores Otero (CP 97270).'}
        </p>
      ) : (
        <div className="field">
          <label htmlFor="coloniaSearch">Buscar colonia, fraccionamiento o código postal</label>
          <input
            id="coloniaSearch"
            type="search"
            placeholder="Ej. Francisco de Montejo, Altabrisa, 97130…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <p className="hint">
            {total === 0
              ? 'Ninguna colonia coincide con tu búsqueda.'
              : `${total} ${total === 1 ? 'resultado' : 'resultados'} en Mérida, Yucatán` +
                (total > results.length ? ` · mostrando los primeros ${results.length}` : '')}
          </p>
        </div>
      )}

      {results.length > 0 && (
        <ul className="colonia-list">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="colonia-item"
                onClick={() => choose(c)}
                disabled={going !== null}
              >
                <span className="colonia-item__main">
                  <strong>{c.name}</strong>
                  <small>
                    {c.tipo ?? 'Colonia'} · CP {c.postal_code ?? '—'}
                  </small>
                </span>
                <span className="colonia-item__go">
                  {going === c.slug ? <span className="spinner spinner--dark" /> : '→'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!single && results.length === 0 && query.trim() !== '' && (
        <p className="empty">
          No encontramos <strong>“{query.trim()}”</strong> en el catálogo de Mérida. Revisa la
          ortografía o busca por código postal.
        </p>
      )}
    </div>
  );
}
