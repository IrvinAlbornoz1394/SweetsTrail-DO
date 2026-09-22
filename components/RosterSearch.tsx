'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Child, ChildWithTutor, TutorPayment } from '@/lib/db';
import { DEFAULT_PAYMENT_AMOUNT } from '@/lib/schemas';
import Modal from './Modal';
import { Toast, useToast } from './Toast';

/** Quita acentos para que "jose" encuentre "José". */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** 9992345678 → 999 234 5678, más fácil de leer y de dictar. */
const prettyPhone = (p: string) =>
  /^\d{10}$/.test(p) ? `${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}` : p;

/** $35 y $35.50, sin decimales de más ni de menos. */
const money = (n: number) =>
  `$${n.toLocaleString('es-MX', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

/** Fecha corta del pago: el año sobra, todo esto pasa en la misma temporada. */
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

/**
 * La cantidad se captura como texto para no pelear con el teclado del teléfono:
 * aquí se vuelve número. Acepta coma decimal y redondea a centavos, que es lo
 * que guarda la columna.
 */
const parseAmount = (value: string) => {
  const n = Number(value.trim().replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

/** Lista de opciones de un select: valores únicos, ordenados como se leen. */
const options = (values: string[]) =>
  [...new Set(values.filter((v) => v !== ''))].sort((a, b) => a.localeCompare(b, 'es'));

/** Nombres que se comparan igual: sin acentos, sin mayúsculas y con un solo espacio. */
const nameKey = (s: string) => norm(s).replace(/\s+/g, ' ').trim();

/** El teléfono se compara sin espacios: “999 234 5678” es el mismo que “9992345678”. */
const phoneKey = (s: string) => s.replace(/\s+/g, '');

/** Qué se está buscando repetido; '' es la vista normal, sin agrupar. */
type DupeBy = '' | 'child' | 'tutor' | 'phone';

const dupeKey = (row: ChildWithTutor, by: DupeBy) =>
  by === 'child' ? nameKey(row.name) : by === 'tutor' ? nameKey(row.tutor_name) : phoneKey(row.tutor_phone);

/** Lo que se lee en el divisor del grupo: el dato tal cual lo escribieron. */
const dupeLabel = (row: ChildWithTutor, by: DupeBy) =>
  by === 'child' ? row.name : by === 'tutor' ? row.tutor_name : prettyPhone(phoneKey(row.tutor_phone));

const DUPE_NOUN: Record<Exclude<DupeBy, ''>, string> = {
  child: 'niños con el mismo nombre',
  tutor: 'tutores con el mismo nombre',
  phone: 'teléfonos repetidos',
};

/**
 * Padrón con buscador: el caso real es un papá que ya registró a su niño y
 * quiere confirmarlo. La numeración que se muestra es la posición en el padrón
 * completo, no en los resultados, para que no cambie al filtrar.
 *
 * El filtro avanzado (tutor y teléfono de contacto) es para quien organiza. Los
 * datos NO vienen en `items`: el servidor los manda solo después de validar el
 * código, así que hasta entonces no están ni en el HTML de la página.
 *
 * Con el filtro abierto aparece además "Registrar pago", que no es una acción
 * por renglón: la cooperación la debe una familia, no cada niño, así que se
 * elige al tutor en un diálogo aparte.
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
  const [payers, setPayers] = useState<TutorPayment[]>([]);
  const [askCode, setAskCode] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [tutor, setTutor] = useState('');
  const [phone, setPhone] = useState('');
  const [dupeBy, setDupeBy] = useState<DupeBy>('');

  // El código que ya se validó, para registrar pagos sin volver a pedirlo en
  // cada uno: quien organiza captura varios seguidos en la puerta. Vive solo en
  // memoria y se borra al cerrar el filtro; el servidor lo vuelve a comparar
  // siempre, así que guardarlo aquí no autoriza nada por sí solo.
  const [organizerCode, setOrganizerCode] = useState('');

  // Registrar pago
  const [payOpen, setPayOpen] = useState(false);
  const [payQuery, setPayQuery] = useState('');
  const [payTutorId, setPayTutorId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState(String(DEFAULT_PAYMENT_AMOUNT));

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
      setPayers((data.tutors ?? []) as TutorPayment[]);
      setOrganizerCode(code.trim());
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
    setPayers([]);
    setOrganizerCode('');
    setTutor('');
    setPhone('');
    setDupeBy('');
  }

  function openPayment() {
    setPayQuery('');
    setPayTutorId(null);
    setPayAmount(String(DEFAULT_PAYMENT_AMOUNT));
    setPayOpen(true);
  }

  async function savePayment() {
    if (payTutorId === null) {
      showToast('Elige de la lista quién pagó.', true);
      return;
    }

    const amount = parseAmount(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('Escribe la cantidad pagada.', true);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coloniaId, code: organizerCode, tutorId: payTutorId, amount }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(data.error ?? 'No se pudo registrar el pago.', true);
        return;
      }

      // El servidor devuelve la lista recién leída, no la nuestra con el pago
      // sumado: si alguien más cobró al mismo tiempo, aquí ya se ve.
      setPayers((data.tutors ?? []) as TutorPayment[]);
      showToast(`Pago de ${money(amount)} registrado a nombre de ${payee?.name ?? 'el tutor'}.`);
      setPayOpen(false);
    } catch {
      showToast('Sin conexión. Revisa tu internet e inténtalo de nuevo.', true);
    } finally {
      setBusy(false);
    }
  }

  // Con el filtro abierto manda la lista del servidor (trae el contacto); si
  // no, la que ya venía pintada. Ambas llegan en el mismo orden.
  const rows: (Child | ChildWithTutor)[] = detailed ?? items;

  const index = useMemo(
    () => rows.map((child, i) => ({ child, position: i + 1, haystack: norm(child.name) })),
    [rows]
  );

  const payee = payers.find((t) => t.id === payTutorId) ?? null;

  // Buscador del selector: por nombre o por teléfono, que es como se distingue
  // a dos tutores que se llaman igual.
  const payerResults = useMemo(() => {
    const term = payQuery.trim();
    if (term === '') return payers;

    const byName = norm(term);
    const byPhone = phoneKey(term);
    return payers.filter(
      (t) => norm(t.name).includes(byName) || t.phone.includes(byPhone)
    );
  }, [payers, payQuery]);

  const paidCount = payers.filter((t) => t.paid_total > 0).length;
  const collected = payers.reduce((total, t) => total + t.paid_total, 0);

  const tutors = useMemo(() => options((detailed ?? []).map((c) => c.tutor_name)), [detailed]);
  const phones = useMemo(() => options((detailed ?? []).map((c) => c.tutor_phone)), [detailed]);

  // Qué valores están repetidos. Se cuenta sobre el padrón completo, no sobre
  // lo que ya filtró el buscador: si no, esconder a un hermano haría que el
  // otro dejara de verse como duplicado.
  const repeated = useMemo(() => {
    if (dupeBy === '' || detailed === null) return null;

    const count = new Map<string, number>();
    for (const row of detailed) {
      const key = dupeKey(row, dupeBy);
      if (key === '') continue; // sin dato no hay nada que comparar
      count.set(key, (count.get(key) ?? 0) + 1);
    }

    return new Set([...count].filter(([, n]) => n > 1).map(([key]) => key));
  }, [detailed, dupeBy]);

  const q = norm(query.trim());
  const results = index.filter(({ child, haystack }) => {
    if (q && !haystack.includes(q)) return false;
    const row = child as ChildWithTutor;
    if (tutor && row.tutor_name !== tutor) return false;
    if (phone && row.tutor_phone !== phone) return false;
    if (repeated && !repeated.has(dupeKey(row, dupeBy))) return false;
    return true;
  });

  // Buscando duplicados la lista se parte en grupos, en el orden en que
  // aparece el primero de cada uno: así el divisor dice qué comparten.
  const groups = (() => {
    if (!repeated) return null;

    const byKey = new Map<string, { label: string; items: typeof results }>();
    for (const entry of results) {
      const row = entry.child as ChildWithTutor;
      const key = dupeKey(row, dupeBy);
      const group = byKey.get(key) ?? { label: dupeLabel(row, dupeBy) || '—', items: [] };
      group.items.push(entry);
      byKey.set(key, group);
    }

    return [...byKey.values()];
  })();

  const filtering = q !== '' || tutor !== '' || phone !== '' || dupeBy !== '';

  function item({ child, position }: (typeof results)[number]) {
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
  }

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
              : groups
                ? groups.length === 0
                  ? `No hay ${DUPE_NOUN[dupeBy as Exclude<DupeBy, ''>]} con estos filtros.`
                  : `${groups.length} ${groups.length === 1 ? 'grupo repetido' : 'grupos repetidos'} · ${results.length} registros`
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
            <div className="field">
              <label htmlFor="filterDupes">Encontrar duplicados</label>
              <select
                id="filterDupes"
                value={dupeBy}
                onChange={(e) => setDupeBy(e.target.value as DupeBy)}
              >
                <option value="">No buscar duplicados</option>
                <option value="child">Niños con el mismo nombre</option>
                <option value="tutor">Tutores con el mismo nombre</option>
                <option value="phone">Teléfonos repetidos</option>
              </select>
              {dupeBy !== '' && (
                <p className="hint">
                  {dupeBy === 'phone'
                    ? 'Compara los teléfonos sin espacios. Un mismo tutor con varios niños sale junto: revisa que no sean el mismo niño dos veces.'
                    : 'Solo se listan los que aparecen más de una vez, agrupados por lo que comparten.'}
                </p>
              )}
            </div>

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

            {payers.length > 0 && (
              <p className="hint hint--tally">
                {paidCount} de {payers.length}{' '}
                {payers.length === 1 ? 'tutor ha cooperado' : 'tutores han cooperado'} ·{' '}
                {money(collected)} en total
              </p>
            )}

            <button
              type="button"
              className="btn btn--ghost btn--block advanced__pay"
              onClick={openPayment}
            >
              💵 Registrar pago
            </button>

            <button type="button" className="link-quiet" onClick={disable}>
              Ocultar filtro avanzado
            </button>
          </div>
        )}
      </div>

      {results.length === 0 ? (
        <p className="empty">
          {dupeBy !== '' ? (
            <>
              No hay <strong>{DUPE_NOUN[dupeBy as Exclude<DupeBy, ''>]}</strong> en el padrón de{' '}
              {coloniaName}
              {q === '' && tutor === '' && phone === '' ? '.' : ' con los filtros puestos.'}
            </>
          ) : q === '' ? (
            <>Ningún niño coincide con los filtros seleccionados.</>
          ) : (
            <>
              No encontramos <strong>“{query.trim()}”</strong> en la lista. Revisa cómo lo
              escribiste (por ejemplo, solo el nombre) o vuelve a registrarlo.
            </>
          )}
        </p>
      ) : groups ? (
        <div className="dupes">
          {groups.map((group) => (
            <section className="dupe" key={group.label + group.items[0].child.id}>
              <h3 className="dupe__head">
                <span className="dupe__label">{group.label}</span>
                <span className="dupe__count">{group.items.length} registros</span>
              </h3>
              <ol className="roster roster--detailed">{group.items.map(item)}</ol>
            </section>
          ))}
        </div>
      ) : (
        <ol className={`roster${detailed !== null ? ' roster--detailed' : ''}`}>
          {results.map(item)}
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
        open={payOpen}
        title="Registrar pago"
        confirmText="Confirmar pago"
        busyText="Guardando…"
        busy={busy}
        onClose={() => {
          if (busy) return;
          setPayOpen(false);
        }}
        onConfirm={savePayment}
      >
        <div className="field">
          <label htmlFor="paySearch">¿Quién pagó?</label>
          <input
            id="paySearch"
            type="search"
            placeholder="Busca por nombre o teléfono"
            value={payQuery}
            onChange={(e) => setPayQuery(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
          <p className="hint">
            {payers.length === 0
              ? 'Todavía no hay tutores registrados en esta colonia.'
              : payerResults.length === 0
                ? `Ningún tutor coincide con “${payQuery.trim()}”.`
                : `${payerResults.length} de ${payers.length} tutores`}
          </p>
        </div>

        {payerResults.length > 0 && (
          <ul className="tutor-list">
            {payerResults.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`tutor-opt${t.id === payTutorId ? ' is-on' : ''}`}
                  onClick={() => setPayTutorId(t.id)}
                  aria-pressed={t.id === payTutorId}
                  disabled={busy}
                >
                  <span className="tutor-opt__main">
                    <strong>{t.name}</strong>
                    <small>
                      {prettyPhone(t.phone)} · {t.children_count}{' '}
                      {t.children_count === 1 ? 'niño' : 'niños'}
                    </small>
                  </span>
                  {t.paid_total > 0 && (
                    <span className="tutor-opt__paid">Pagó {money(t.paid_total)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="field field--amount">
          <label htmlFor="payAmount">Cantidad pagada</label>
          <input
            id="payAmount"
            type="text"
            inputMode="decimal"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
          <p className="hint">
            {payee !== null && payee.paid_total > 0 && payee.paid_at !== null
              ? `${payee.name} ya tiene ${money(payee.paid_total)} registrados desde el ${shortDate(payee.paid_at)}. Confirmar suma este pago al anterior.`
              : `La cooperación es de ${money(DEFAULT_PAYMENT_AMOUNT)} por familia. Cámbiala solo si pagó otra cantidad.`}
          </p>
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
