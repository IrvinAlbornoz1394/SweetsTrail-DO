/**
 * Revisa el estado de la base: qué se aplicó y qué falta.
 *
 *   npm run db:check
 *
 * Es de solo lectura: no modifica nada. Usa DATABASE_URL.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('✖ Falta DATABASE_URL en .env.local.');
  process.exit(1);
}

const TABLES = ['colonias', 'tutors', 'children', 'stations', 'payments'];
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

let ok = true;
const fail = (msg) => { ok = false; console.log(`  ✖ ${msg}`); };

try {
  await client.connect();
  const { rows: [{ host }] } = await client.query('select inet_server_addr()::text as host');
  console.log(`Base: ${new URL(url).hostname}  (${host ?? 'local'})\n`);

  // --- Esquema ---
  console.log('Esquema:');
  const { rows: tbl } = await client.query(
    `select tablename, rowsecurity from pg_tables where schemaname = 'public'`
  );
  const found = new Map(tbl.map((t) => [t.tablename, t.rowsecurity]));
  for (const t of TABLES) {
    if (found.has(t)) console.log(`  ✔ tabla ${t}${found.get(t) ? ' (RLS activo)' : ' ⚠️  SIN RLS'}`);
    else fail(`falta la tabla ${t} — corre: npm run db:migrate`);
  }

  // --- Función de registro atómico ---
  const { rows: fn } = await client.query(
    `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_registration'`
  );
  if (fn.length) console.log('  ✔ función create_registration');
  else fail('falta create_registration — corre: npm run db:migrate');

  // --- Seed ---
  console.log('\nCatálogo:');
  if (found.has('colonias')) {
    const { rows: [c] } = await client.query('select count(*)::int as n from colonias');
    if (c.n === 0) fail('el catálogo está vacío — corre: npm run db:migrate');
    else console.log(`  ✔ ${c.n} colonias sembradas`);
  }

  // --- Datos capturados ---
  console.log('\nDatos capturados:');
  for (const t of ['tutors', 'children', 'stations', 'payments']) {
    if (!found.has(t)) continue;
    const { rows: [r] } = await client.query(`select count(*)::int as n from ${t}`);
    // Las estaciones se borran en suave: se distingue lo visible de lo archivado.
    // La columna puede no existir todavía si falta correr la migración.
    if (t === 'stations') {
      const { rows: [d] } = await client
        .query('select count(*)::int as n from stations where is_deleted')
        .catch(() => ({ rows: [null] }));
      if (d) {
        console.log(`  ${t.padEnd(9)} ${r.n - d.n}${d.n ? `  (+${d.n} eliminadas)` : ''}`);
        continue;
      }
      fail('falta la columna stations.is_deleted — corre: npm run db:migrate');
    }
    console.log(`  ${t.padEnd(9)} ${r.n}`);
  }

  // --- Seguridad ---
  const { rows: [pol] } = await client.query(
    `select count(*)::int as n from pg_policies where schemaname = 'public'`
  );
  console.log(`\nSeguridad:\n  políticas públicas: ${pol.n}${pol.n === 0 ? ' (correcto: solo el servidor escribe)' : ' ⚠️  revisa security.sql'}`);

  console.log(ok ? '\n✔ La base está lista.' : '\n✖ Falta aplicar el SQL: npm run db:migrate');
} catch (err) {
  console.error(`\n✖ ${err.message}${err.code ? ` (${err.code})` : ''}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
