import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase para uso EXCLUSIVO en el servidor (Route Handlers).
 * Usa la service role key, así que nunca debe importarse desde un componente
 * cliente: eso filtraría la llave al bundle del navegador.
 */

/**
 * Supabase renombró las llaves: la `service_role` ahora se llama "secret key"
 * y empieza con `sb_secret_`. Se aceptan ambos nombres para no romper
 * proyectos viejos.
 */
function secretKey(): string | undefined {
  return (
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    undefined
  );
}

export function hasSupabaseConfig(): boolean {
  const url = process.env.SUPABASE_URL?.trim();
  const key = secretKey();
  // Los valores de ejemplo de .env.example no cuentan como configuración real:
  // si contaran, la app intentaría conectarse a un host que no existe.
  return Boolean(url && key && url.startsWith('https://') && !url.includes('xxxx'));
}

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = secretKey();

  if (!url || !key) {
    throw new Error(
      'Faltan SUPABASE_URL y/o SUPABASE_SECRET_KEY. Cópialas de .env.example a .env.local.'
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
