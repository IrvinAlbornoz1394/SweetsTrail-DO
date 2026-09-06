'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastState = { message: string; isError: boolean } | null;

/** Toast efímero reutilizable por los dos formularios. */
export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ message, isError });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { toast, showToast };
}

export function Toast({ toast }: { toast: ToastState }) {
  if (!toast) return null;
  return <div className={`toast${toast.isError ? ' is-error' : ''}`}>{toast.message}</div>;
}
