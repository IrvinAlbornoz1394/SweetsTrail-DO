'use client';

import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  confirmText?: string;
  /** Texto mientras corre la acción: "Guardando…" no sirve para un borrado. */
  busyText?: string;
  /** Pinta de rojo el botón de confirmar, para acciones que no se deshacen. */
  danger?: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  children: ReactNode;
};

export default function Modal({
  open,
  title,
  confirmText = 'Confirmar',
  busyText = 'Guardando…',
  danger = false,
  busy = false,
  onClose,
  onConfirm,
  children,
}: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  /**
   * El foco se coloca UNA vez, al abrir: si este efecto dependiera de `busy` o
   * de `onClose` (que el padre recrea en cada render), volvería a correr con
   * cada tecla y le robaría el foco al campo que se está escribiendo.
   *
   * Cuando el diálogo pide un dato, el foco va al primer campo; si no, al botón
   * de confirmar.
   */
  useEffect(() => {
    if (!open) return;

    const field = boxRef.current?.querySelector<HTMLElement>('input, textarea, select');
    (field ?? confirmRef.current)?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={() => !busy && onClose()} />
      <div className="modal__box" ref={boxRef} role="dialog" aria-modal="true" aria-labelledby="modalTitle">
        <header className="modal__head">
          <h3 id="modalTitle">{title}</h3>
          <button type="button" className="modal__x" onClick={onClose} disabled={busy} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <div className="modal__body">{children}</div>

        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
            ref={confirmRef}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy && <span className="spinner" />}
            {busy ? busyText : confirmText}
          </button>
        </footer>
      </div>
    </div>
  );
}
