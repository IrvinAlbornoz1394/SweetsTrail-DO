-- ===========================================================
-- SweetsTrail — seguridad (SOLO Supabase)
-- Ejecútalo DESPUÉS de schema.sql y seed_colonias.sql.
-- No aplica en local: PGlite no tiene los roles anon/authenticated.
-- ===========================================================

-- RLS activo y SIN políticas públicas: nadie llega a estas tablas desde el
-- navegador. Todas las escrituras pasan por los Route Handlers de Next, que
-- usan la service role key (server-only) y por eso saltan RLS.

alter table public.colonias enable row level security;
alter table public.tutors   enable row level security;
alter table public.children enable row level security;
alter table public.stations enable row level security;
alter table public.payments enable row level security;

revoke all on function public.create_registration(uuid, text, text, text[]) from anon, authenticated;
