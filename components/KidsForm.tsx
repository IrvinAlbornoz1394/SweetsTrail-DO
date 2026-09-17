'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { formatPhone } from '@/lib/phone';
import Modal from './Modal';
import { Toast, useToast } from './Toast';

type Kid = { id: number; name: string };
type Errors = Partial<Record<'tutorName' | 'tutorPhone' | 'kids', string>>;

type Props = { coloniaId: string; coloniaName: string; coloniaSlug: string };

export default function KidsForm({ coloniaId, coloniaName, coloniaSlug }: Props) {
  const router = useRouter();
  const nextId = useRef(1);
  const [tutorName, setTutorName] = useState('');
  const [tutorPhone, setTutorPhone] = useState('');
  const [kids, setKids] = useState<Kid[]>([{ id: 0, name: '' }]);
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, showToast } = useToast();

  // Los campos vacíos simplemente no cuentan.
  const validKids = useMemo(
    () => kids.map((k) => k.name.trim()).filter((n) => n !== ''),
    [kids]
  );
  const omitted = kids.length - validKids.length;

  function addKid() {
    setKids((prev) => [...prev, { id: nextId.current++, name: '' }]);
  }

  function removeKid(id: number) {
    setKids((prev) => (prev.length === 1 ? prev : prev.filter((k) => k.id !== id)));
  }

  function updateKid(id: number, name: string) {
    setKids((prev) => prev.map((k) => (k.id === id ? { ...k, name } : k)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const next: Errors = {};
    const phoneDigits = tutorPhone.replace(/\D/g, '');

    if (!tutorName.trim()) next.tutorName = 'Escribe el nombre del responsable o tutor.';
    if (!phoneDigits) next.tutorPhone = 'Escribe un número de teléfono.';
    else if (phoneDigits.length !== 10) next.tutorPhone = 'El teléfono debe tener 10 dígitos.';
    if (validKids.length === 0)
      next.kids = 'Agrega al menos un niño con nombre. Las filas vacías se omiten.';

    setErrors(next);
    if (Object.keys(next).length > 0) {
      showToast('Revisa los campos marcados.', true);
      return;
    }
    setConfirming(true);
  }

  async function handleConfirm() {
    // El guardia contra el doble clic: además del botón deshabilitado mientras
    // `saving` está arriba, si un segundo evento se colara igual no dispararía
    // un segundo POST.
    if (saving) return;
    setSaving(true);

    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coloniaId,
          tutorName: tutorName.trim(),
          tutorPhone: tutorPhone.replace(/\D/g, ''),
          children: validKids,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        showToast(data.error ?? 'No se pudo guardar el registro.', true);
        setSaving(false);
        setConfirming(false);
        return;
      }

      // Registro exitoso: `saving` se queda arriba a propósito. Apagarlo aquí
      // reactivaría los botones durante la navegación y dejaría una ventana
      // para registrar dos veces a los mismos niños.
      //
      // `replace` y no `push`: el formulario ya se envió, así que el botón de
      // atrás del navegador debe llevar al menú, no de vuelta a un formulario
      // que invita a mandar lo mismo otra vez.
      router.replace(`/colonia/${coloniaSlug}/ninos/exito?id=${data.tutorId}`);
    } catch {
      showToast('Error de conexión. Intenta de nuevo.', true);
      setSaving(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <form className="card" onSubmit={handleSubmit} noValidate>
        <fieldset className="fieldset" disabled={saving}>
          <legend>Datos del responsable</legend>

          <div className="grid-2">
            <div className="field">
              <label htmlFor="tutorName">
                Responsable o tutor <span className="req">*</span>
              </label>
              <input
                id="tutorName"
                type="text"
                placeholder="Ej. María González Pérez"
                autoComplete="name"
                className={errors.tutorName ? 'is-invalid' : ''}
                value={tutorName}
                onChange={(e) => setTutorName(e.target.value)}
              />
              <p className="error">{errors.tutorName ?? ''}</p>
            </div>

            <div className="field">
              <label htmlFor="tutorPhone">
                Número de teléfono <span className="req">*</span>
              </label>
              <input
                id="tutorPhone"
                type="tel"
                placeholder="10 dígitos"
                inputMode="numeric"
                autoComplete="tel"
                className={errors.tutorPhone ? 'is-invalid' : ''}
                value={tutorPhone}
                onChange={(e) => setTutorPhone(formatPhone(e.target.value))}
              />
              <p className="error">{errors.tutorPhone ?? ''}</p>
            </div>
          </div>
        </fieldset>

        <fieldset className="fieldset" disabled={saving}>
          <legend>
            Niños participantes
            <span className="counter">
              {validKids.length === 1 ? '1 niño con nombre' : `${validKids.length} niños con nombre`}
            </span>
          </legend>

          <div className="rows">
            {kids.map((kid, i) => (
              <div className="row" key={kid.id}>
                <span className="row__num">{i + 1}</span>
                <input
                  type="text"
                  className="row__input"
                  placeholder="Nombre del niño"
                  value={kid.name}
                  onChange={(e) => updateKid(kid.id, e.target.value)}
                  onKeyDown={(e) => {
                    // Enter agrega otra fila en lugar de enviar el formulario.
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addKid();
                    }
                  }}
                />
                <button
                  type="button"
                  className="row__remove"
                  title="Quitar este niño"
                  aria-label="Quitar este niño"
                  disabled={kids.length === 1}
                  onClick={() => removeKid(kid.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button type="button" className="btn btn--dashed" onClick={addKid}>
            ＋ Agregar otro niño
          </button>
          <p className="error error--block">{errors.kids ?? ''}</p>
        </fieldset>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={saving}
            onClick={() => {
              setTutorName('');
              setTutorPhone('');
              setKids([{ id: nextId.current++, name: '' }]);
              setErrors({});
              showToast('Formulario limpiado.');
            }}
          >
            Limpiar formulario
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving && <span className="spinner" />}
            {saving ? 'Guardando…' : 'Registrar niños'}
          </button>
        </div>
      </form>

      <Modal
        open={confirming}
        busy={saving}
        title="Confirmar registro de niños"
        confirmText={`Confirmar ${validKids.length} ${validKids.length === 1 ? 'niño' : 'niños'}`}
        onClose={() => setConfirming(false)}
        onConfirm={handleConfirm}
      >
        <p className="modal__intro">
          Revisa la información antes de confirmar. Estos son los niños que se van a registrar:
        </p>

        <div className="summary">
          <div className="summary__item summary__item--highlight">
            <span>Colonia</span>
            <strong>{coloniaName}</strong>
          </div>
          <div className="summary__item">
            <span>Responsable</span>
            <strong>{tutorName}</strong>
          </div>
          <div className="summary__item">
            <span>Teléfono</span>
            <strong>{tutorPhone}</strong>
          </div>
        </div>

        <ul className="kid-list">
          {validKids.map((name, i) => (
            <li key={i}>
              <b>{i + 1}.</b> {name}
            </li>
          ))}
        </ul>

        {omitted > 0 && (
          <p className="note">
            ⚠️ Se {omitted === 1 ? 'omitió 1 campo vacío' : `omitieron ${omitted} campos vacíos`} y
            no se {omitted === 1 ? 'tomará' : 'tomarán'} en cuenta.
          </p>
        )}
      </Modal>

      <Toast toast={toast} />
    </>
  );
}
