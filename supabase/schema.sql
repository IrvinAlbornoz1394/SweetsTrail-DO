-- ===========================================================
-- SweetsTrail — esquema de base de datos
-- Orden de ejecución en Supabase → SQL Editor:
--   1) schema.sql        (este archivo)
--   2) seed_colonias.sql (catálogo de colonias de Mérida)
--   3) security.sql      (RLS)
-- ===========================================================

-- ---------- Catálogo de colonias ----------
-- Todo el evento se organiza por colonia: cada registro pertenece a una,
-- para que varias colonias puedan gestionar su propia ruta por separado.

create table if not exists public.colonias (
  id           uuid primary key default gen_random_uuid(),
  slug         text        not null unique,
  name         text        not null,
  tipo         text,
  postal_code  text,
  -- Centro aproximado, para abrir el mapa ya sobre la colonia. Se llena la
  -- primera vez que alguien la usa (geocodificación con caché en lib/geocode.ts).
  lat          double precision,
  lng          double precision,
  municipio    text        not null default 'Mérida',
  estado       text        not null default 'Yucatán',
  created_at   timestamptz not null default now()
);

create index if not exists colonias_name_idx on public.colonias (name);

-- ---------- Participantes ----------

create table if not exists public.tutors (
  id          uuid primary key default gen_random_uuid(),
  colonia_id  uuid        not null references public.colonias(id) on delete restrict,
  name        text        not null,
  phone       text        not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.children (
  id          uuid primary key default gen_random_uuid(),
  tutor_id    uuid        not null references public.tutors(id) on delete cascade,
  name        text        not null,
  created_at  timestamptz not null default now()
);

-- ---------- Estaciones de dulce ----------

create table if not exists public.stations (
  id          uuid primary key default gen_random_uuid(),
  colonia_id  uuid        not null references public.colonias(id) on delete restrict,
  name        text        not null,
  lat         double precision not null,
  lng         double precision not null,
  status      text        not null default 'pendiente',
  created_at  timestamptz not null default now(),
  constraint stations_lat_range   check (lat between -90 and 90),
  constraint stations_lng_range   check (lng between -180 and 180),
  constraint stations_status_valid check (status in ('pendiente', 'confirmada', 'cancelada'))
);

create index if not exists children_tutor_id_idx  on public.children (tutor_id);
create index if not exists tutors_colonia_id_idx  on public.tutors (colonia_id);
create index if not exists stations_colonia_id_idx on public.stations (colonia_id);

-- ---------- Registro atómico de tutor + niños ----------
-- El cliente de Supabase no maneja transacciones, así que la inserción de un
-- tutor con sus niños vive en esta función: o entra todo, o no entra nada.

create or replace function public.create_registration(
  p_colonia_id  uuid,
  p_tutor_name  text,
  p_tutor_phone text,
  p_children    text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tutor_id uuid;
  v_child    text;
  v_inserted int := 0;
begin
  if p_children is null or array_length(p_children, 1) is null then
    raise exception 'Se requiere al menos un niño';
  end if;

  insert into public.tutors (colonia_id, name, phone)
  values (p_colonia_id, btrim(p_tutor_name), btrim(p_tutor_phone))
  returning id into v_tutor_id;

  foreach v_child in array p_children loop
    if btrim(coalesce(v_child, '')) <> '' then
      insert into public.children (tutor_id, name) values (v_tutor_id, btrim(v_child));
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  if v_inserted = 0 then
    raise exception 'Se requiere al menos un niño con nombre';
  end if;

  return v_tutor_id;
end;
$$;

-- ===========================================================
-- Migraciones
--
-- `create table if not exists` no altera tablas que ya existen, así que los
-- cambios de esquema posteriores viven aquí. Todo debe ser idempotente.
-- ===========================================================

-- Centro de la colonia, para precargar el mapa.
alter table public.colonias add column if not exists lat double precision;
alter table public.colonias add column if not exists lng double precision;

-- La dirección de la estación se dejó de capturar: la ubicación se marca
-- en el mapa, que es más preciso para trazar la ruta.
alter table public.stations drop column if exists address;
