'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Child, ChildWithTutor, TutorPayment } from '@/lib/db';
import { paymentsDocx } from '@/lib/paymentsDocx';
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

/** Una familia con su liga de entrada, tal como la manda /api/family-links. */
type FamilyLinkRow = { phone: string; tutors: string[]; children: string[]; link: string };

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

/** Piezas de dulce: solo enteros. Lo que no lo sea se rechaza, no se redondea. */
const parseQuantity = (value: string) => {
  const n = Number(value.trim());
  return Number.isInteger(n) ? n : NaN;
};

/** 1 dulce, 30 dulces. */
const candies = (n: number) => `${n.toLocaleString('es-MX')} ${n === 1 ? 'dulce' : 'dulces'}`;

/** Lista de opciones de un select: valores únicos, ordenados como se leen. */
const options = (values: string[]) =>
  [...new Set(values.filter((v) => v !== ''))].sort((a, b) => a.localeCompare(b, 'es'));

/** Nombres que se comparan igual: sin acentos, sin mayúsculas y con un solo espacio. */
const nameKey = (s: string) => norm(s).replace(/\s+/g, ' ').trim();

/** El teléfono se compara sin espacios: “999 234 5678” es el mismo que “9992345678”. */
const phoneKey = (s: string) => s.replace(/\s+/g, '');

/** Qué abre el código que se está pidiendo. */
type Unlock = 'advanced' | 'special';

/** Cómo se agrupa la vista de funciones especiales. Por ahora solo por tutor. */
type GroupBy = 'tutor';

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
 * "Funciones especiales" pide el mismo código y cambia la vista: en lugar de
 * niños lista a los tutores, cada uno con "Pago" y "Dulces". Van por tutor y
 * no por niño porque la cooperación la da una familia, no cada niño.
 */
export default function RosterSearch({
  items,
  coloniaId,
  coloniaName,
  registerHref,
  tutorsHref,
}: {
  items: Child[];
  coloniaId: string;
  coloniaName: string;
  /** Pantalla de registro de niños, para quien no se encontró en la lista. */
  registerHref: string;
  /** Lista pública de tutores, para entrar al perfil de la familia. */
  tutorsHref: string;
}) {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const [query, setQuery] = useState('');

  // Filtro avanzado
  const [detailed, setDetailed] = useState<ChildWithTutor[] | null>(null);
  const [payers, setPayers] = useState<TutorPayment[]>([]);
  const [askFor, setAskFor] = useState<Unlock | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [tutor, setTutor] = useState('');
  const [phone, setPhone] = useState('');
  const [dupeBy, setDupeBy] = useState<DupeBy>('');

  // Funciones especiales
  const [special, setSpecial] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('tutor');
  const [tutorQuery, setTutorQuery] = useState('');

  // El código que ya se validó, para registrar pagos sin volver a pedirlo en
  // cada uno: quien organiza captura varios seguidos en la puerta. Vive solo en
  // memoria y se borra al cerrar el filtro y las funciones especiales; el servidor lo vuelve a comparar
  // siempre, así que guardarlo aquí no autoriza nada por sí solo.
  const [organizerCode, setOrganizerCode] = useState('');

  // Registrar pago y registrar dulces: el tutor ya viene elegido desde su renglón.
  const [payTutorId, setPayTutorId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState(String(DEFAULT_PAYMENT_AMOUNT));
  const [candyTutorId, setCandyTutorId] = useState<string | null>(null);
  const [candyQty, setCandyQty] = useState('');

  // Ligas por WhatsApp: una por familia, para entrar a su panel de visitas.
  const [links, setLinks] = useState<FamilyLinkRow[] | null>(null);
  const [linksQuery, setLinksQuery] = useState('');
  // Las que ya se abrieron en WhatsApp en esta sesión, para no perder la cuenta.
  const [sent, setSent] = useState<string[]>([]);

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
        showToast(
          data.error ??
            (askFor === 'special'
              ? 'No se pudieron abrir las funciones especiales.'
              : 'No se pudo abrir el filtro avanzado.'),
          true
        );
        setCode('');
        return;
      }

      // La respuesta trae niños y tutores: cada vista se queda con lo suyo, y
      // la otra se puede abrir después sin que el padrón quede a medias.
      setPayers((data.tutors ?? []) as TutorPayment[]);
      setOrganizerCode(code.trim());
      if (askFor === 'special') {
        setTutorQuery('');
        setSpecial(true);
        showToast('Funciones especiales habilitadas.');
      } else {
        setDetailed(data.children as ChildWithTutor[]);
        showToast('Filtro avanzado habilitado.');
      }
      setAskFor(null);
      setCode('');
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
    setDupeBy('');
    // El código se olvida solo cuando ya no queda nada abierto que lo use.
    if (!special) forgetCode();
  }

  function disableSpecial() {
    setSpecial(false);
    setTutorQuery('');
    if (detailed === null) forgetCode();
  }

  function forgetCode() {
    setPayers([]);
    setOrganizerCode('');
  }

  /** Pide las ligas (crea las que falten) con el código que ya se validó. */
  async function openLinks() {
    setBusy(true);
    try {
      const res = await fetch('/api/family-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coloniaId, code: organizerCode }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(data.error ?? 'No se pudieron generar las ligas.', true);
        return;
      }

      setLinksQuery('');
      setLinks((data.families ?? []) as FamilyLinkRow[]);
    } catch {
      showToast('Sin conexión. Revisa tu internet e inténtalo de nuevo.', true);
    } finally {
      setBusy(false);
    }
  }

  /** El mensaje de WhatsApp de cada familia, ya con su liga. */
  function linkMessage(family: FamilyLinkRow) {
    return (
      `Hola ${family.tutors[0]}, esta es tu liga para la Ruta de los Dulces 2026 en ${coloniaName} 🎃\n\n` +
      `${family.link}\n\n` +
      'Ábrela una vez en tu celular y después escanea el QR de cada estación para marcar tus visitas. ' +
      'No la compartas: es la llave de tu familia.'
    );
  }

  async function copyLink(family: FamilyLinkRow) {
    try {
      await navigator.clipboard.writeText(linkMessage(family));
      showToast(`Mensaje para ${family.tutors[0]} copiado.`);
    } catch {
      showToast('No se pudo copiar. Mantén presionada la liga para copiarla a mano.', true);
    }
  }

  /** Baja en Word la lista de quienes pagaron, con lo que ya está en pantalla. */
  function downloadPayments() {
    const blob = new Blob([paymentsDocx(payers, coloniaName) as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pagos-${new Date().toISOString().slice(0, 10)}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function openPayment(tutorId: string) {
    setPayAmount(String(DEFAULT_PAYMENT_AMOUNT));
    setPayTutorId(tutorId);
  }

  function openCandies(tutorId: string) {
    setCandyQty('');
    setCandyTutorId(tutorId);
  }

  async function savePayment() {
    if (payTutorId === null) return;

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
      setPayTutorId(null);
    } catch {
      showToast('Sin conexión. Revisa tu internet e inténtalo de nuevo.', true);
    } finally {
      setBusy(false);
    }
  }

  async function saveCandies() {
    if (candyTutorId === null) return;

    const quantity = parseQuantity(candyQty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showToast('Escribe cuántos dulces entregó, en piezas.', true);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/candies', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coloniaId, code: organizerCode, tutorId: candyTutorId, quantity }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(data.error ?? 'No se pudieron registrar los dulces.', true);
        return;
      }

      // Igual que en los pagos: la lista recién leída del servidor.
      setPayers((data.tutors ?? []) as TutorPayment[]);
      showToast(`${candies(quantity)} registrados a nombre de ${donor?.name ?? 'el tutor'}.`);
      setCandyTutorId(null);
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
  const donor = payers.find((t) => t.id === candyTutorId) ?? null;

  const linkResults = useMemo(() => {
    const term = linksQuery.trim();
    if (!links || term === '') return links ?? [];
    const byName = norm(term);
    const byPhone = phoneKey(term);
    return links.filter(
      (f) =>
        [...f.tutors, ...f.children].some((name) => norm(name).includes(byName)) ||
        (byPhone !== '' && f.phone.includes(byPhone))
    );
  }, [links, linksQuery]);

  // Un solo campo para nombre o teléfono, que es como se distingue a dos
  // tutores que se llaman igual. El nombre también se busca entre sus niños:
  // en la puerta muchas veces se sabe cómo se llama el niño y no el tutor.
  const tutorResults = useMemo(() => {
    const term = tutorQuery.trim();
    if (term === '') return payers;

    const byName = norm(term);
    const byPhone = phoneKey(term);
    return payers.filter(
      (t) =>
        [t.name, ...t.children].some((name) => norm(name).includes(byName)) ||
        (byPhone !== '' && t.phone.includes(byPhone))
    );
  }, [payers, tutorQuery]);

  const paidCount = payers.filter((t) => t.paid_total > 0).length;
  const collected = payers.reduce((total, t) => total + t.paid_total, 0);
  const candiesCount = payers.filter((t) => t.candies_total > 0).length;
  const candiesTotal = payers.reduce((total, t) => total + t.candies_total, 0);

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

  const specialView = (
    <>
      <div className="card">
        <div className="field">
          <label htmlFor="groupBy">Agrupar por</label>
          <select id="groupBy" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            <option value="tutor">Tutores</option>
          </select>
        </div>

        <div className="field special__search">
          <label htmlFor="tutorSearch">Buscar tutor o niño</label>
          <input
            id="tutorSearch"
            type="search"
            placeholder="Tutor, niño o teléfono"
            value={tutorQuery}
            onChange={(e) => setTutorQuery(e.target.value)}
            autoComplete="off"
          />
          <p className="hint">
            {payers.length === 0
              ? 'Todavía no hay tutores registrados en esta colonia.'
              : tutorResults.length === 0
                ? `Ningún tutor coincide con “${tutorQuery.trim()}”.`
                : `${tutorResults.length} de ${payers.length} tutores`}
          </p>
        </div>

        {payers.length > 0 && (
          <p className="hint hint--tally">
            {paidCount} de {payers.length} han cooperado · {money(collected)} en total
            <br />
            {candiesCount} de {payers.length} han dado dulces · {candies(candiesTotal)} en total
          </p>
        )}

        <div className="special__footer">
          <button type="button" className="link-quiet" onClick={disableSpecial}>
            Ocultar funciones especiales
          </button>
          <button
            type="button"
            className="btn btn--ghost family-link__btn"
            onClick={downloadPayments}
            disabled={paidCount === 0}
            title={paidCount === 0 ? 'Todavía nadie ha pagado' : 'Lista de pagos en Word'}
          >
            📄 Descargar pagos
          </button>
        </div>
      </div>

      {tutorResults.length > 0 && (
        <ul className="tutor-list tutor-list--page">
          {tutorResults.map((t) => (
            <li key={t.id} className="tutor-opt tutor-row">
              <span className="tutor-opt__main">
                <strong>{t.name}</strong>
                <small>
                  <a href={`tel:${t.phone}`}>{prettyPhone(t.phone)}</a> · {t.children.length}{' '}
                  {t.children.length === 1 ? 'niño' : 'niños'}
                </small>
                {t.children.length > 0 && (
                  <small className="tutor-row__children">{t.children.join(' · ')}</small>
                )}
                {(t.paid_total > 0 || t.candies_total > 0) && (
                  <span className="tutor-row__badges">
                    {t.paid_total > 0 && (
                      <span className="tutor-opt__paid">Pagó {money(t.paid_total)}</span>
                    )}
                    {t.candies_total > 0 && (
                      <span className="tutor-opt__paid tutor-opt__candies">
                        Dio {candies(t.candies_total)}
                      </span>
                    )}
                  </span>
                )}
              </span>
              <span className="family-link__actions">
                <button
                  type="button"
                  className="btn btn--ghost family-link__btn"
                  onClick={() => openPayment(t.id)}
                  disabled={busy}
                >
                  💵 Pago
                </button>
                <button
                  type="button"
                  className="btn btn--ghost family-link__btn"
                  onClick={() => openCandies(t.id)}
                  disabled={busy}
                >
                  🍬 Dulces
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const rosterView = (
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
          <div className="roster-actions">
            <Link className="link-quiet" href={tutorsHref}>
              Ver lista de tutores
            </Link>
            <Link className="btn btn--ghost family-link__btn" href={registerHref}>
              ➕ Agregar nuevo
            </Link>
          </div>
        </div>

        {detailed === null ? (
          <div className="unlock-links">
            <button type="button" className="link-quiet" onClick={() => setAskFor('advanced')}>
              Habilitar filtro avanzado
            </button>
            <button type="button" className="link-quiet" onClick={() => setAskFor('special')}>
              Funciones especiales
            </button>
          </div>
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

            <button
              type="button"
              className="btn btn--ghost btn--block advanced__pay"
              onClick={openLinks}
              disabled={busy}
            >
              📲 Ligas por WhatsApp
            </button>

            <div className="unlock-links">
              <button type="button" className="link-quiet" onClick={disable}>
                Ocultar filtro avanzado
              </button>
              <button type="button" className="link-quiet" onClick={() => setAskFor('special')}>
                Funciones especiales
              </button>
            </div>
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
    </>
  );

  return (
    <>
      {special ? specialView : rosterView}

      <Modal
        open={askFor !== null}
        title={askFor === 'special' ? 'Funciones especiales' : 'Filtro avanzado'}
        confirmText="Habilitar"
        busyText="Comprobando…"
        busy={busy}
        onClose={() => {
          if (busy) return;
          setAskFor(null);
          setCode('');
        }}
        onConfirm={unlock}
      >
        <p>
          {askFor === 'special'
            ? 'Lista a los tutores para registrar su pago y los dulces que entregan.'
            : 'Muestra el tutor y el teléfono con que se registró cada niño.'}
        </p>

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
        open={payee !== null}
        title="Registrar pago"
        confirmText="Confirmar pago"
        busyText="Guardando…"
        busy={busy}
        onClose={() => {
          if (busy) return;
          setPayTutorId(null);
        }}
        onConfirm={savePayment}
      >
        <p>
          A nombre de <strong>{payee?.name}</strong>
          {payee && ` · ${prettyPhone(payee.phone)}`}
        </p>

        <div className="field field--amount">
          <label htmlFor="payAmount">Cantidad pagada</label>
          <input
            id="payAmount"
            type="text"
            inputMode="decimal"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) savePayment();
            }}
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
        open={donor !== null}
        title="Registrar dulces"
        confirmText="Confirmar dulces"
        busyText="Guardando…"
        busy={busy}
        onClose={() => {
          if (busy) return;
          setCandyTutorId(null);
        }}
        onConfirm={saveCandies}
      >
        <p>
          A nombre de <strong>{donor?.name}</strong>
          {donor && ` · ${prettyPhone(donor.phone)}`}
        </p>

        <div className="field field--amount">
          <label htmlFor="candyQty">¿Cuántos dulces dio?</label>
          <input
            id="candyQty"
            type="text"
            inputMode="numeric"
            placeholder="Ej. 50"
            value={candyQty}
            onChange={(e) => setCandyQty(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) saveCandies();
            }}
            autoComplete="off"
            disabled={busy}
          />
          <p className="hint">
            {donor !== null && donor.candies_total > 0
              ? `${donor.name} ya tiene ${candies(donor.candies_total)} registrados. Confirmar suma esta entrega a la anterior.`
              : 'En piezas. Si entrega más después, se registra otra vez y se suma.'}
          </p>
        </div>
      </Modal>

      <Modal
        open={links !== null}
        title="Ligas por WhatsApp"
        confirmText="Listo"
        onClose={() => setLinks(null)}
        onConfirm={() => setLinks(null)}
      >
        <p className="hint">
          Cada familia entra a su panel de visitas con su propia liga. Mándasela una vez; si la
          pides otra vez sale la misma.
        </p>

        <div className="field">
          <label htmlFor="linksSearch">Buscar familia</label>
          <input
            id="linksSearch"
            type="search"
            placeholder="Nombre del tutor, de un niño o teléfono"
            value={linksQuery}
            onChange={(e) => setLinksQuery(e.target.value)}
            autoComplete="off"
          />
          <p className="hint">
            {links?.length === 0
              ? 'Todavía no hay familias registradas.'
              : `${linkResults.length} de ${links?.length ?? 0} familias · ${sent.length} enviadas en esta sesión`}
          </p>
        </div>

        {linkResults.length > 0 && (
          <ul className="tutor-list">
            {linkResults.map((f) => (
              <li key={f.phone} className="tutor-opt family-link">
                <span className="tutor-opt__main">
                  <strong>
                    {sent.includes(f.phone) && '✅ '}
                    {f.tutors.join(' / ')}
                  </strong>
                  <small>
                    {prettyPhone(f.phone)} · {f.children.join(', ')}
                  </small>
                </span>
                <span className="family-link__actions">
                  <a
                    className="btn btn--primary family-link__btn"
                    href={`https://wa.me/52${f.phone}?text=${encodeURIComponent(linkMessage(f))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setSent((all) => (all.includes(f.phone) ? all : [...all, f.phone]))}
                  >
                    Enviar
                  </a>
                  <button
                    type="button"
                    className="btn btn--ghost family-link__btn"
                    onClick={() => copyLink(f)}
                  >
                    Copiar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
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
