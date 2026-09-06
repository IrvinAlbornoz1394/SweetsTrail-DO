/**
 * Aplica el SQL del proyecto contra Postgres, en orden.
 *
 *   node --env-file=.env.local scripts/migrate.mjs
 *
 * Usa DATABASE_URL (la cadena de conexión de Supabase → Settings → Database).
 * Es idempotente: se puede correr las veces que haga falta.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const FILES = ['schema.sql', 'seed_colonias.sql', 'security.sql'];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✖ Falta DATABASE_URL. Ponla en .env.local y vuelve a correr.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

try {
  await client.connect();
  const { rows: [info] } = await client.query('select current_database() as db, version() as v');
  console.log(`✔ Conectado a "${info.db}"`);
  console.log(`  ${info.v.split(',')[0]}\n`);

  for (const file of FILES) {
    const sql = await readFile(path.join(process.cwd(), 'supabase', file), 'utf8');
    process.stdout.write(`→ ${file} … `);
    await client.query(sql);
    console.log('ok');
  }

  const { rows: [{ count }] } = await client.query('select count(*)::int as count from colonias');
  const { rows: tables } = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`
  );

  console.log(`\n✔ Listo.`);
  console.log(`  Tablas:   ${tables.map((t) => t.table_name).join(', ')}`);
  console.log(`  Colonias: ${count}`);
} catch (err) {
  console.error(`\n✖ ${err.message}`);
  if (err.code) console.error(`  código: ${err.code}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
