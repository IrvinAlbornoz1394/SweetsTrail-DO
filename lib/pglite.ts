import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/**
 * Postgres local en proceso (WASM) para desarrollo sin Docker ni Supabase.
 * Corre EXACTAMENTE el mismo schema.sql y la misma función plpgsql que
 * producción, así que lo que funciona aquí funciona en Supabase.
 *
 * Los datos se persisten en .data/pglite (ignorado por git).
 */

const DATA_DIR = path.join(process.cwd(), '.data', 'pglite');

// El dev server de Next recarga los módulos en caliente; sin esto se abriría
// una instancia nueva de PGlite en cada recarga.
const globalForPg = globalThis as unknown as { __sweetsPg?: Promise<PGlite> };

async function bootstrap(): Promise<PGlite> {
  // PGlite no crea los directorios padre, solo el suyo.
  await fs.mkdir(path.dirname(DATA_DIR), { recursive: true });

  const db = new PGlite(DATA_DIR);
  await db.waitReady;

  const sqlDir = path.join(process.cwd(), 'supabase');
  const schema = await fs.readFile(path.join(sqlDir, 'schema.sql'), 'utf8');
  await db.exec(schema);

  // El catálogo se siembra una sola vez.
  const { rows } = await db.query<{ count: string }>('select count(*)::text as count from colonias');
  if (rows[0]?.count === '0') {
    const seed = await fs.readFile(path.join(sqlDir, 'seed_colonias.sql'), 'utf8');
    await db.exec(seed);
    console.log('[pglite] catálogo de colonias sembrado');
  }

  return db;
}

export function getPglite(): Promise<PGlite> {
  globalForPg.__sweetsPg ??= bootstrap();
  return globalForPg.__sweetsPg;
}
