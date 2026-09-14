import 'server-only';
import { getSupabase, hasSupabaseConfig } from './supabase';
import { getPglite } from './pglite';
import type { RegistrationInput, StationInput } from './schemas';

/**
 * Capa de datos con dos backends detrás de la misma interfaz:
 *
 *   • Supabase → cuando SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY están definidas.
 *   • PGlite   → mientras tanto, Postgres local en .data/pglite.
 *
 * Ambos corren el mismo schema.sql, así que migrar es solo llenar .env.local.
 */

export type Colonia = {
  id: string;
  slug: string;
  name: string;
  tipo: string | null;
  postal_code: string | null;
  municipio: string;
  estado: string;
  /** Centro aproximado; null hasta que se geocodifica por primera vez. */
  lat: number | null;
  lng: number | null;
};

export type Child = {
  id: string;
  name: string;
  created_at: string;
};

export type Station = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  status: string;
  created_at: string;
};

export const backendName = () => (hasSupabaseConfig() ? 'supabase' : 'pglite-local');

const COLONIA_COLS = 'id, slug, name, tipo, postal_code, municipio, estado, lat, lng';

/**
 * La plataforma opera solo para Dolores Otero (CP 97270). El catálogo completo
 * sigue en la base, pero aquí se filtra en un solo lugar: así ni el buscador,
 * ni las URLs `/colonia/<slug>`, ni las APIs pueden alcanzar otra colonia.
 */
export const ALLOWED_COLONIA_SLUG = 'dolores-otero-97270';

/* ---------------- Colonias ---------------- */

export async function listColonias(): Promise<Colonia[]> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('colonias')
      .select(COLONIA_COLS)
      .eq('slug', ALLOWED_COLONIA_SLUG)
      .order('name');
    if (error) throw new Error(error.message);
    return (data ?? []) as Colonia[];
  }

  const db = await getPglite();
  const { rows } = await db.query<Colonia>(
    `select ${COLONIA_COLS} from colonias where slug = $1 order by name`,
    [ALLOWED_COLONIA_SLUG]
  );
  return rows;
}

export async function getColoniaBySlug(slug: string): Promise<Colonia | null> {
  if (slug !== ALLOWED_COLONIA_SLUG) return null;

  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('colonias')
      .select(COLONIA_COLS)
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Colonia) ?? null;
  }

  const db = await getPglite();
  const { rows } = await db.query<Colonia>(
    `select ${COLONIA_COLS} from colonias where slug = $1`,
    [slug]
  );
  return rows[0] ?? null;
}

/** Confirma que la colonia existe antes de escribir cualquier registro. */
export async function coloniaExists(id: string): Promise<boolean> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('colonias')
      .select('id')
      .eq('id', id)
      .eq('slug', ALLOWED_COLONIA_SLUG)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data !== null;
  }

  const db = await getPglite();
  const { rows } = await db.query('select 1 from colonias where id = $1 and slug = $2', [
    id,
    ALLOWED_COLONIA_SLUG,
  ]);
  return rows.length > 0;
}

/** Guarda el centro geocodificado de una colonia para no volver a pedirlo. */
export async function setColoniaCenter(id: string, lat: number, lng: number): Promise<void> {
  if (hasSupabaseConfig()) {
    const { error } = await getSupabase().from('colonias').update({ lat, lng }).eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }

  const db = await getPglite();
  await db.query('update colonias set lat = $2, lng = $3 where id = $1', [id, lat, lng]);
}

/* ---------------- Registros ---------------- */

/** Crea el tutor con todos sus niños de forma atómica. */
export async function createRegistration(input: RegistrationInput): Promise<string> {
  const args = {
    p_colonia_id: input.coloniaId,
    p_tutor_name: input.tutorName,
    p_tutor_phone: input.tutorPhone,
    p_children: input.children,
  };

  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase().rpc('create_registration', args);
    if (error) throw new Error(error.message);
    return data as string;
  }

  const db = await getPglite();
  const { rows } = await db.query<{ create_registration: string }>(
    'select create_registration($1, $2, $3, $4) as create_registration',
    [args.p_colonia_id, args.p_tutor_name, args.p_tutor_phone, args.p_children]
  );
  return rows[0].create_registration;
}

/**
 * Niños registrados en una colonia, los más nuevos primero.
 * `children` no guarda la colonia: cuelga del tutor, así que el filtro va por ahí.
 */
export async function listChildrenByColonia(coloniaId: string): Promise<Child[]> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('children')
      .select('id, name, created_at, tutors!inner(colonia_id)')
      .eq('tutors.colonia_id', coloniaId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(({ id, name, created_at }) => ({ id, name, created_at }));
  }

  const db = await getPglite();
  const { rows } = await db.query<Child>(
    `select c.id, c.name, c.created_at
       from children c
       join tutors t on t.id = c.tutor_id
      where t.colonia_id = $1
      order by c.created_at desc`,
    [coloniaId]
  );
  return rows;
}

/* ---------------- Estaciones ---------------- */

export async function createStation(input: StationInput): Promise<string> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('stations')
      .insert({
        colonia_id: input.coloniaId,
        name: input.name,
        lat: input.lat,
        lng: input.lng,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  const db = await getPglite();
  const { rows } = await db.query<{ id: string }>(
    `insert into stations (colonia_id, name, lat, lng)
     values ($1, $2, $3, $4) returning id`,
    [input.coloniaId, input.name, input.lat, input.lng]
  );
  return rows[0].id;
}

/**
 * Borra una estación mal registrada. El `colonia_id` va en el filtro a
 * propósito: aunque alguien mande un id ajeno, solo puede tocar estaciones de
 * la colonia que ya se validó. Devuelve false si no había nada que borrar.
 */
export async function deleteStation(id: string, coloniaId: string): Promise<boolean> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('stations')
      .delete()
      .eq('id', id)
      .eq('colonia_id', coloniaId)
      .select('id');
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  }

  const db = await getPglite();
  const { rows } = await db.query(
    'delete from stations where id = $1 and colonia_id = $2 returning id',
    [id, coloniaId]
  );
  return rows.length > 0;
}

export async function listStationsByColonia(coloniaId: string): Promise<Station[]> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('stations')
      .select('id, name, lat, lng, status, created_at')
      .eq('colonia_id', coloniaId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Station[];
  }

  const db = await getPglite();
  const { rows } = await db.query<Station>(
    `select id, name, lat, lng, status, created_at
       from stations where colonia_id = $1 order by created_at desc`,
    [coloniaId]
  );
  return rows;
}
