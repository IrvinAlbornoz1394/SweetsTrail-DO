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

/** Padrón con los datos de contacto: solo sale detrás del código de organizador. */
export type ChildWithTutor = Child & {
  tutor_name: string;
  tutor_phone: string;
};

/**
 * Tutor del padrón con lo que lleva cooperado. Alimenta el selector de
 * "Registrar pago", así que, como `ChildWithTutor`, solo sale detrás del
 * código de organizador: trae el teléfono con que se registró.
 */
export type TutorPayment = {
  id: string;
  name: string;
  phone: string;
  /** Niños vivos que registró. Sirve para distinguir a dos tutores homónimos. */
  children_count: number;
  /** Suma de sus pagos; 0 mientras no haya pagado. */
  paid_total: number;
  /** Fecha del último pago; null mientras no haya pagado. */
  paid_at: string | null;
};

/**
 * Estación tal como sale a la vista pública (mapa y listas).
 *
 * `name` es quien responde por la casa y `business_name` el negocio o local,
 * si lo hay; `stationLabel()` en lib/station.ts decide cuál se rotula.
 *
 * El teléfono NO está en este tipo a propósito: estas filas viajan enteras al
 * navegador de cualquiera que abra el mapa, así que el dato de contacto no se
 * consulta siquiera. Vive en `StationDetail`, que solo se pide por id.
 */
export type Station = {
  id: string;
  name: string;
  business_name: string | null;
  lat: number;
  lng: number;
  status: string;
  created_at: string;
};

/** La estación con su teléfono: solo para la pantalla de quien la acaba de registrar. */
export type StationDetail = Station & {
  phone: string | null;
};

/** Un registro de niños completo, para devolvérselo a quien lo acaba de hacer. */
export type Registration = {
  tutor_name: string;
  tutor_phone: string;
  children: string[];
};

export const backendName = () => (hasSupabaseConfig() ? 'supabase' : 'pglite-local');

const COLONIA_COLS = 'id, slug, name, tipo, postal_code, municipio, estado, lat, lng';

/** Columnas públicas de una estación. `phone` queda fuera: ver el tipo `Station`. */
const STATION_COLS = 'id, name, business_name, lat, lng, status, created_at';

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
 * Un registro concreto: el responsable con los niños que dio de alta, en el
 * orden en que se capturaron.
 *
 * Alimenta la pantalla de "registro exitoso", que le devuelve a quien acaba de
 * registrar exactamente lo que capturó. El id del tutor es un uuid que solo
 * conoce esa persona, y el `colonia_id` en el filtro impide alcanzar registros
 * de otra colonia con un id ajeno. Los niños quitados del padrón no salen.
 */
export async function getRegistrationById(
  tutorId: string,
  coloniaId: string
): Promise<Registration | null> {
  if (hasSupabaseConfig()) {
    const supabase = getSupabase();

    const { data: tutor, error: tutorError } = await supabase
      .from('tutors')
      .select('name, phone')
      .eq('id', tutorId)
      .eq('colonia_id', coloniaId)
      .maybeSingle();
    if (tutorError) throw new Error(tutorError.message);
    if (!tutor) return null;

    const { data: kids, error: kidsError } = await supabase
      .from('children')
      .select('name')
      .eq('tutor_id', tutorId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });
    if (kidsError) throw new Error(kidsError.message);

    return {
      tutor_name: tutor.name as string,
      tutor_phone: tutor.phone as string,
      children: (kids ?? []).map((k) => k.name as string),
    };
  }

  const db = await getPglite();
  const { rows } = await db.query<{ name: string; phone: string; children: string[] | null }>(
    `select t.name,
            t.phone,
            array_remove(array_agg(c.name order by c.created_at), null) as children
       from tutors t
       left join children c on c.tutor_id = t.id and not c.is_deleted
      where t.id = $1 and t.colonia_id = $2
      group by t.id, t.name, t.phone`,
    [tutorId, coloniaId]
  );

  const row = rows[0];
  if (!row) return null;
  return { tutor_name: row.name, tutor_phone: row.phone, children: row.children ?? [] };
}

/**
 * Niños registrados en una colonia, los más nuevos primero. Los marcados como
 * eliminados no salen.
 * `children` no guarda la colonia: cuelga del tutor, así que el filtro va por ahí.
 */
export async function listChildrenByColonia(coloniaId: string): Promise<Child[]> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('children')
      .select('id, name, created_at, tutors!inner(colonia_id)')
      .eq('tutors.colonia_id', coloniaId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(({ id, name, created_at }) => ({ id, name, created_at }));
  }

  const db = await getPglite();
  const { rows } = await db.query<Child>(
    `select c.id, c.name, c.created_at
       from children c
       join tutors t on t.id = c.tutor_id
      where t.colonia_id = $1 and not c.is_deleted
      order by c.created_at desc`,
    [coloniaId]
  );
  return rows;
}

/**
 * Mismo padrón, pero con el tutor que registró a cada niño. Es información de
 * contacto de familias, así que esta consulta solo se llama desde la API que
 * ya validó el código de organizador.
 */
export async function listChildrenWithTutorByColonia(coloniaId: string): Promise<ChildWithTutor[]> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('children')
      .select('id, name, created_at, tutors!inner(colonia_id, name, phone)')
      .eq('tutors.colonia_id', coloniaId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    // El join anidado llega como objeto (o arreglo, según la relación); se
    // aplana aquí para que el cliente reciba siempre la misma forma.
    return (data ?? []).map(({ id, name, created_at, tutors }) => {
      const tutor = (Array.isArray(tutors) ? tutors[0] : tutors) as
        | { name: string; phone: string }
        | undefined;
      return {
        id,
        name,
        created_at,
        tutor_name: tutor?.name ?? '',
        tutor_phone: tutor?.phone ?? '',
      };
    });
  }

  const db = await getPglite();
  const { rows } = await db.query<ChildWithTutor>(
    `select c.id, c.name, c.created_at, t.name as tutor_name, t.phone as tutor_phone
       from children c
       join tutors t on t.id = c.tutor_id
      where t.colonia_id = $1 and not c.is_deleted
      order by c.created_at desc`,
    [coloniaId]
  );
  return rows;
}

/**
 * Quita un niño del padrón sin borrar la fila: marca `is_deleted`, igual que
 * las estaciones, así que un borrado por error se revierte con un update. El
 * tutor y sus demás niños se quedan intactos.
 *
 * `children` no guarda la colonia, cuelga del tutor, así que la pertenencia se
 * comprueba por ahí: un id de otra colonia no alcanza nada.
 */
export async function softDeleteChild(id: string, coloniaId: string): Promise<boolean> {
  if (hasSupabaseConfig()) {
    const supabase = getSupabase();

    // El cliente de Supabase no hace subconsultas en un update, así que la
    // pertenencia se verifica antes, con el join que sí permite el select.
    const { data: found, error: findError } = await supabase
      .from('children')
      .select('id, tutors!inner(colonia_id)')
      .eq('id', id)
      .eq('tutors.colonia_id', coloniaId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!found) return false;

    const { data, error } = await supabase
      .from('children')
      .update({ is_deleted: true })
      .eq('id', id)
      .eq('is_deleted', false)
      .select('id');
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  }

  const db = await getPglite();
  const { rows } = await db.query(
    `update children c set is_deleted = true
       from tutors t
      where c.tutor_id = t.id
        and c.id = $1
        and t.colonia_id = $2
        and not c.is_deleted
      returning c.id`,
    [id, coloniaId]
  );
  return rows.length > 0;
}

/* ---------------- Pagos ---------------- */

/**
 * Tutores de la colonia con lo que llevan cooperado, en orden alfabético.
 *
 * Es la lista que se elige al registrar un pago, así que incluye a los que ya
 * pagaron (marcados) en lugar de esconderlos: quien organiza necesita verlo
 * para no cobrar dos veces, y un tutor puede cooperar en partes.
 *
 * Trae teléfonos, igual que el padrón detallado: solo se llama desde la API
 * que ya validó el código de organizador.
 */
export async function listTutorsWithPaymentsByColonia(coloniaId: string): Promise<TutorPayment[]> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('tutors')
      .select('id, name, phone, children(is_deleted), payments(amount, created_at)')
      .eq('colonia_id', coloniaId)
      .order('name');
    if (error) throw new Error(error.message);

    // PostgREST no agrega: los embebidos llegan como arreglos y la cuenta y la
    // suma se hacen aquí. Son los tutores de una colonia, no un padrón nacional.
    return (data ?? []).map((tutor) => {
      const kids = (tutor.children ?? []) as { is_deleted: boolean }[];
      const paid = (tutor.payments ?? []) as { amount: number | string; created_at: string }[];

      return {
        id: tutor.id as string,
        name: tutor.name as string,
        phone: tutor.phone as string,
        children_count: kids.filter((kid) => !kid.is_deleted).length,
        paid_total: paid.reduce((total, p) => total + Number(p.amount), 0),
        paid_at: paid.reduce<string | null>(
          (last, p) => (last === null || p.created_at > last ? p.created_at : last),
          null
        ),
      };
    });
  }

  const db = await getPglite();
  // `sum` sobre numeric vuelve como texto; el cast a float8 lo entrega como
  // número, que es lo que espera el tipo. Son pesos con dos decimales.
  const { rows } = await db.query<TutorPayment>(
    `select t.id,
            t.name,
            t.phone,
            (select count(*)::int from children c
              where c.tutor_id = t.id and not c.is_deleted) as children_count,
            coalesce((select sum(p.amount) from payments p where p.tutor_id = t.id), 0)::float8
              as paid_total,
            (select max(p.created_at) from payments p where p.tutor_id = t.id) as paid_at
       from tutors t
      where t.colonia_id = $1
      order by t.name`,
    [coloniaId]
  );
  return rows;
}

/**
 * Registra un pago del tutor. No sustituye lo anterior: cada llamada agrega una
 * fila, así que cooperar en dos partes deja las dos.
 *
 * Devuelve false si el tutor no existe o es de otra colonia. La pertenencia va
 * en la misma escritura (o en un select previo, en Supabase) para que un id
 * ajeno no alcance nada, igual que en el borrado de niños.
 */
export async function createPayment(
  tutorId: string,
  coloniaId: string,
  amount: number
): Promise<boolean> {
  if (hasSupabaseConfig()) {
    const supabase = getSupabase();

    const { data: tutor, error: findError } = await supabase
      .from('tutors')
      .select('id')
      .eq('id', tutorId)
      .eq('colonia_id', coloniaId)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (!tutor) return false;

    const { error } = await supabase.from('payments').insert({ tutor_id: tutorId, amount });
    if (error) throw new Error(error.message);
    return true;
  }

  const db = await getPglite();
  const { rows } = await db.query(
    `insert into payments (tutor_id, amount)
     select $1::uuid, $3::numeric
      where exists (select 1 from tutors where id = $1 and colonia_id = $2)
     returning id`,
    [tutorId, coloniaId, amount]
  );
  return rows.length > 0;
}

/* ---------------- Estaciones ---------------- */

export async function createStation(input: StationInput): Promise<string> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('stations')
      .insert({
        colonia_id: input.coloniaId,
        name: input.name,
        business_name: input.businessName,
        phone: input.phone,
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
    `insert into stations (colonia_id, name, business_name, phone, lat, lng)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [input.coloniaId, input.name, input.businessName, input.phone, input.lat, input.lng]
  );
  return rows[0].id;
}

/**
 * Una estación concreta, con su teléfono, acotada a su colonia.
 *
 * Es lo que alimenta la pantalla de "registro exitoso": quien acaba de dar de
 * alta la casa ve de vuelta lo que capturó, teléfono incluido. El id es un uuid
 * que solo conoce quien hizo el registro, y el `colonia_id` en el filtro impide
 * llegar a estaciones de otra colonia aun con un id ajeno.
 */
export async function getStationById(
  id: string,
  coloniaId: string
): Promise<StationDetail | null> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('stations')
      .select(`${STATION_COLS}, phone`)
      .eq('id', id)
      .eq('colonia_id', coloniaId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as StationDetail) ?? null;
  }

  const db = await getPglite();
  const { rows } = await db.query<StationDetail>(
    `select ${STATION_COLS}, phone
       from stations
      where id = $1 and colonia_id = $2 and not is_deleted`,
    [id, coloniaId]
  );
  return rows[0] ?? null;
}

/**
 * Quita una estación mal registrada. No borra la fila: marca `is_deleted`, así
 * que un borrado por error se puede revertir desde la base sin perder quién la
 * registró ni cuándo. El `colonia_id` va en el filtro a propósito: aunque
 * alguien mande un id ajeno, solo puede tocar estaciones de la colonia que ya
 * se validó. `is_deleted = false` en el filtro hace que borrar dos veces
 * devuelva false en lugar de fingir que se quitó algo.
 */
export async function softDeleteStation(id: string, coloniaId: string): Promise<boolean> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('stations')
      .update({ is_deleted: true })
      .eq('id', id)
      .eq('colonia_id', coloniaId)
      .eq('is_deleted', false)
      .select('id');
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  }

  const db = await getPglite();
  const { rows } = await db.query(
    `update stations set is_deleted = true
      where id = $1 and colonia_id = $2 and not is_deleted
      returning id`,
    [id, coloniaId]
  );
  return rows.length > 0;
}

/** Estaciones vivas de una colonia: las marcadas como borradas no salen. */
export async function listStationsByColonia(coloniaId: string): Promise<Station[]> {
  if (hasSupabaseConfig()) {
    const { data, error } = await getSupabase()
      .from('stations')
      .select(STATION_COLS)
      .eq('colonia_id', coloniaId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Station[];
  }

  const db = await getPglite();
  const { rows } = await db.query<Station>(
    `select ${STATION_COLS}
       from stations
      where colonia_id = $1 and not is_deleted
      order by created_at desc`,
    [coloniaId]
  );
  return rows;
}
