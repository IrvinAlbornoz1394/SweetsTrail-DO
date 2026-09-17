/**
 * Formatea 10 dígitos como "55 1234 5678" mientras se escribe.
 *
 * Lo comparten los dos formularios que piden teléfono (niños y estaciones);
 * ambos mandan a la API solo los dígitos, sin los espacios.
 */
export function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 10);
  return digits.replace(/^(\d{2})(\d{0,4})(\d{0,4}).*$/, (_, a, b, c) =>
    [a, b, c].filter(Boolean).join(' ')
  );
}
