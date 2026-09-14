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
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    confirmRef.current?.focus();
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={() => !busy && onClose()} />
      <div className="modal__box" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
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
