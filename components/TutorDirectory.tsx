'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatPhone } from '@/lib/phone';
import Modal from './Modal';
import { Toast, useToast } from './Toast';

/** Lo único que la página pública sabe de cada tutor: nada de teléfonos ni pagos. */
export type PublicTutor = { id: string; name: string; children: string[] };

/** Quita acentos para que "jose" encuentre "José". */
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Lista pública de tutores con "Ver perfil". El nombre se filtra aquí mismo;
 * el teléfono no, porque no viene en la página: con los 10 dígitos se le
 * pregunta al servidor, que solo devuelve qué tutores coinciden.
 *
 * "Ver perfil" pide el teléfono con que se registró el tutor y, si corresponde,
 * abre su liga de entrada: la misma sesión que la liga de WhatsApp.
 */
export default function TutorDirectory({
  tutors,
  coloniaId,
}: {
  tutors: PublicTutor[];
  coloniaId: string;
}) {
  const { toast, showToast } = useToast();
  const [query, setQuery] = useState('');

  // Resultado de buscar por teléfono: null mientras no hay 10 dígitos que buscar.
  const [phoneIds, setPhoneIds] = useState<string[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [profile, setProfile] = useState<PublicTutor | null>(null);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const digits = query.replace(/[\s-]/g, '');
  const byPhone = /^\d+$/.test(digits);
  const fullPhone = byPhone && digits.length === 10 ? digits : '';

  useEffect(() => {
    if (fullPhone === '') {
      setPhoneIds(null);
      return;
    }

    // Si se sigue escribiendo, la respuesta vieja ya no se pinta.
    let stale = false;
    setSearching(true);
    fetch('/api/tutors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ coloniaId, phone: fullPhone }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (stale) return;
        if (!res.ok) {
          showToast(data.error ?? 'No se pudo buscar el teléfono.', true);
          setPhoneIds([]);
          return;
        }
        setPhoneIds((data.ids ?? []) as string[]);
      })
      .catch(() => {
        if (!stale) showToast('Sin conexión. Revisa tu internet e inténtalo de nuevo.', true);
      })
      .finally(() => {
        if (!stale) setSearching(false);
      });

    return () => {
      stale = true;
    };
  }, [fullPhone, coloniaId, showToast]);

  const results = useMemo(() => {
    if (query.trim() === '') return tutors;
    if (byPhone) return phoneIds === null ? [] : tutors.filter((t) => phoneIds.includes(t.id));
    const term = norm(query.trim());
    return tutors.filter((t) => [t.name, ...t.children].some((name) => norm(name).includes(term)));
  }, [tutors, query, byPhone, phoneIds]);

  function openProfile(tutor: PublicTutor) {
    // Quien ya escribió su teléfono completo en el filtro no lo vuelve a teclear.
    setPhone(fullPhone ? formatPhone(fullPhone) : '');
    setProfile(tutor);
  }

  async function login() {
    if (!profile) return;

    const raw = phone.replace(/\D/g, '');
    if (raw.length !== 10) {
      showToast('Escribe los 10 dígitos del teléfono.', true);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/family-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ coloniaId, tutorId: profile.id, phone: raw }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(data.error ?? 'No se pudo abrir el perfil.', true);
        setPhone('');
        setBusy(false);
        return;
      }

      // La liga guarda la sesión en la cookie y lleva al panel; busy se queda
      // encendido porque la página se va.
      window.location.assign(data.link as string);
    } catch {
      showToast('Sin conexión. Revisa tu internet e inténtalo de nuevo.', true);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="field">
          <label htmlFor="tutorDirectorySearch">Buscar tutor</label>
          <input
            id="tutorDirectorySearch"
            type="search"
            placeholder="Nombre o teléfono"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
          <p className="hint">
            {query.trim() === ''
              ? `${tutors.length} ${tutors.length === 1 ? 'tutor registrado' : 'tutores registrados'}`
              : byPhone && digits.length < 10
                ? 'Escribe los 10 dígitos del teléfono.'
                : byPhone && (searching || phoneIds === null)
                  ? 'Buscando…'
                  : results.length === 0
                    ? `Ningún tutor coincide con “${query.trim()}”.`
                    : `${results.length} de ${tutors.length} tutores`}
          </p>
        </div>
      </div>

      {results.length > 0 && (
        <ul className="tutor-list tutor-list--page">
          {results.map((t) => (
            <li key={t.id} className="tutor-opt tutor-row">
              <span className="tutor-opt__main">
                <strong>{t.name}</strong>
                <small className="tutor-row__children">{t.children.join(' · ')}</small>
              </span>
              <span className="family-link__actions">
                <button
                  type="button"
                  className="btn btn--ghost family-link__btn"
                  onClick={() => openProfile(t)}
                >
                  Ver perfil
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={profile !== null}
        title="Ver perfil"
        confirmText="Entrar"
        busyText="Comprobando…"
        busy={busy}
        onClose={() => {
          if (busy) return;
          setProfile(null);
          setPhone('');
        }}
        onConfirm={login}
      >
        <p>
          Perfil de <strong>{profile?.name}</strong>
        </p>

        <div className="field">
          <label htmlFor="profilePhone">Teléfono con que te registraste</label>
          <input
            id="profilePhone"
            type="tel"
            inputMode="numeric"
            autoComplete="off"
            placeholder="55 1234 5678"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) login();
            }}
            disabled={busy}
          />
          <p className="hint">Si corresponde, entras a tu panel de visitas.</p>
        </div>
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
