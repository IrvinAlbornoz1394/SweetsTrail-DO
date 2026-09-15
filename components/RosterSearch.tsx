'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Child, ChildWithTutor } from '@/lib/db';
import Modal from './Modal';
import { Toast, useToast } from './Toast';

/** Quita acentos para que "jose" encuentre "José". */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** 9992345678 → 999 234 5678, más fácil de leer y de dictar. */
const prettyPhone = (p: string) =>
  /^\d{10}$/.test(p) ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : p;

/** Lista de opciones de un select: valores únicos, ordenados como se leen. */
const options = (values: string[]) =>
  [...new Set(values.filter((v) => v !== ''))].sort((a, b) => a.localeCompare(b, 'es'));

/**
 * Padrón con buscador: el caso real es un papá que ya registró a su niño y
 * quiere confirmarlo. La numeración que se muestra es la posición en el padrón
 * completo, no en los resultados, para que no cambie al filtrar.
 *
 * El filtro avanzado (tutor y teléfono de contacto) es para quien organiza. Los
 * datos NO vienen en `items`: el servidor los manda solo después de validar el
 * código, así que hasta entonces no están ni en el HTML de la página.
 */
export default function RosterSearch({
  items,
  coloniaId,
  coloniaName,
}: {
  items: Child[];
  coloniaId: string;
  coloniaName: string;
}) {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [query, setQuery] = useState('');

  // Filtro avanzado
  const [detailed, setDetailed] = useState<ChildWithTutor[] | null>(null);
  const [askCode, setAskCode] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [tutor, setTutor] = useState('');
  const [phone, setPhone] = useState('');

  // Quitar un registro: pide el código de nuevo, no basta con tener abierto el
  // filtro (eso vive en el navegador y ahí no se decide nada).
  const [pending, setPending] = useState<ChildWithTutor | null>(null);
  const [deleteCode, setDeleteCode] = useState('');

  async function unlock() {
    if (code.trim() === '') {
      showToast('Escribe el código de organizador.', true);
      return;
    }

    setBusy(true);
    try {
      // El código viaja en el cuerpo, no en la URL: así no queda en los logs
      // del servidor ni en el historial. Quien valida es la API.
      const res = await fetch('/api/roster', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coloniaId, code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(data.error ?? 'No se pudo abrir el filtro avanzado.', true);
        setCode('');
        return;
      }

      setDetailed(data.children as ChildWithTutor[]);
      setAskCode(false);
      setCode('');
      showToast('Filtro avanzado habilitado.');
    } catch {
      showToast('Sin conexión. Revisa tu internet e inténtalo de nuevo.', true);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!pending) return;

    if (deleteCode.trim() === '') {
      showToast('Escribe el código para quitarlo.', true);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/roster', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coloniaId, id: pending.id, code: deleteCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Con código incorrecto el diálogo sigue abierto para reintentar.
        showToast(data.error ?? 'No se pudo quitar el registro.', true);
        setDeleteCode('');
        return;
      }

      setDetailed((list) => (list ?? []).filter((c) => c.id !== pending.id));
      showToast(`Se quitó a “${pending.name}” del padrón.`);
      setPending(null);
      setDeleteCode('');
      router.refresh(); // el conteo de arriba lo pinta el servidor
    } catch {
      showToast('Sin conexión. Revisa tu internet e inténtalo de nuevo.', true);
    } finally {
      setBusy(false);
    }
  }

  function disable() {
    setDetailed(null);
    setTutor('');
    setPhone('');
  }

  // Con el filtro abierto manda la lista del servidor (trae el contacto); si
  // no, la que ya venía pintada. Ambas llegan en el mismo orden.
  const rows: (Child | ChildWithTutor)[] = detailed ?? items;

  const index = useMemo(
    () => rows.map((child, i) => ({ child, position: i + 1, haystack: norm(child.name) })),
    [rows]
  );

  const tutors = useMemo(() => options((detailed ?? []).map((c) => c.tutor_name)), [detailed]);
  const phones = useMemo(() => options((detailed ?? []).map((c) => c.tutor_phone)), [detailed]);

  const q = norm(query.trim());
  const results = index.filter(({ child, haystack }) => {
    if (q && !haystack.includes(q)) return false;
    const row = child as ChildWithTutor;
    if (tutor && row.tutor_name !== tutor) return false;
    if (phone && row.tutor_phone !== phone) return false;
    return true;
  });

  const filtering = q !== '' || tutor !== '' || phone !== '';

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
            {!filtering
              ? `Escribe su nombre para confirmar que quedó registrado en ${coloniaName}.`
              : results.length === 0
                ? 'Ningún registro coincide con la búsqueda.'
                : `${results.length} ${results.length === 1 ? 'coincidencia' : 'coincidencias'} de ${rows.length} registrados`}
          </p>
        </div>

        {detailed === null ? (
          <button type="button" className="link-quiet" onClick={() => setAskCode(true)}>
            Habilitar filtro avanzado
          </button>
        ) : (
          <div className="advanced">
            <div className="grid-2 grid-2--filters">
              <div className="field">
                <label htmlFor="filterTutor">Filtrar por tutor</label>
                <select id="filterTutor" value={tutor} onChange={(e) => setTutor(e.target.value)}>
                  <option value="">Todos los tutores</option>
                  {tutors.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="filterPhone">Filtrar por teléfono</label>
                <select id="filterPhone" value={phone} onChange={(e) => setPhone(e.target.value)}>
                  <option value="">Todos los teléfonos</option>
                  {phones.map((p) => (
                    <option key={p} value={p}>{prettyPhone(p)}</option>
                  ))}
                </select>
              </div>
            </div>

            <button type="button" className="link-quiet" onClick={disable}>
              Ocultar filtro avanzado
            </button>
          </div>
        )}
      </div>

      {results.length === 0 ? (
        <p className="empty">
          {q === '' ? (
            <>Ningún niño coincide con los filtros seleccionados.</>
          ) : (
            <>
              No encontramos <strong>“{query.trim()}”</strong> en la lista. Revisa cómo lo
              escribiste (por ejemplo, solo el nombre) o vuelve a registrarlo.
            </>
          )}
        </p>
      ) : (
        <ol className={`roster${detailed !== null ? ' roster--detailed' : ''}`}>
          {results.map(({ child, position }) => {
            const row = child as ChildWithTutor;
            return (
              <li className="roster__item" key={child.id}>
                <span className="roster__num">{position}</span>
                <span className="roster__person">
                  <span className="roster__name">{child.name}</span>
                  {detailed !== null && (
                    <span className="meta">
                      <span className="meta__cell">
                        <small>Tutor</small>
                        <strong>{row.tutor_name || '—'}</strong>
                      </span>
                      <span className="meta__cell">
                        <small>Teléfono</small>
                        <strong>
                          {row.tutor_phone ? (
                            <a href={`tel:${row.tutor_phone}`}>{prettyPhone(row.tutor_phone)}</a>
                          ) : (
                            '—'
                          )}
                        </strong>
                      </span>
                    </span>
                  )}
                </span>
                {detailed !== null && (
                  <button
                    type="button"
                    className="roster__remove"
                    onClick={() => setPending(row)}
                    aria-label={`Quitar a ${child.name} del padrón`}
                    title="Quitar del padrón"
                  >
                    🗑️
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <Modal
        open={askCode}
        title="Filtro avanzado"
        confirmText="Habilitar"
        busyText="Comprobando…"
        busy={busy}
        onClose={() => {
          if (busy) return;
          setAskCode(false);
          setCode('');
        }}
        onConfirm={unlock}
      >
        <p>Muestra el tutor y el teléfono con que se registró cada niño.</p>

        <div className="field">
          <label htmlFor="rosterCode">Código de organizador</label>
          <input
            id="rosterCode"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) unlock();
            }}
            disabled={busy}
          />
          <p className="hint">Son datos de contacto de las familias: solo quien organiza la ruta.</p>
        </div>
      </Modal>

      <Modal
        open={pending !== null}
        title="Quitar del padrón"
        confirmText="Sí, quitar"
        busyText="Quitando…"
        danger
        busy={busy}
        onClose={() => {
          if (busy) return;
          setPending(null);
          setDeleteCode('');
        }}
        onConfirm={remove}
      >
        <p>
          Se va a quitar a <strong>{pending?.name}</strong> de la lista de niños registrados.
        </p>
        <p className="hint">
          Deja de contar y de aparecer para todos, pero el registro se conserva por si hay que
          recuperarlo. {pending?.tutor_name} sigue con sus demás niños.
        </p>

        <div className="field">
          <label htmlFor="childDeleteCode">Código de organizador</label>
          <input
            id="childDeleteCode"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••"
            value={deleteCode}
            onChange={(e) => setDeleteCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) remove();
            }}
            disabled={busy}
          />
          <p className="hint">Se confirma en el servidor, aunque el filtro ya esté abierto.</p>
        </div>
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
