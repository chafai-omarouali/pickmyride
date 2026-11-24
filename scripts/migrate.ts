/**
 * Voert SQL-migraties uit in volgorde, als database-eigenaar (MIGRATION_DATABASE_URL).
 * Gebruik: npm run db:migrate   |   npm run db:reset (alleen development/test)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createPool } from '../src/lib/pg.ts';

const url = process.env.MIGRATION_DATABASE_URL || 'postgres://postgres@127.0.0.1:5433/pickmyride';
const dir = new URL('../db/migrations/', import.meta.url).pathname;

export async function migrate(opts: { reset?: boolean; quiet?: boolean } = {}) {
  const pool = await createPool(url, 1);
  const log = (s: string) => { if (!opts.quiet) console.log(s); };
  try {
    if (opts.reset) {
      if ((process.env.APP_ENV || 'development') === 'production') throw new Error('Reset geweigerd in productie.');
      await pool.query('drop schema if exists pickmyride cascade');
      await pool.query('drop table if exists public.schema_migrations');
      log('Schema verwijderd.');
    }
    await pool.query('create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())');
    const done = new Set((await pool.query<{ name: string }>('select name from public.schema_migrations')).rows.map(r => r.name));
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      const c = await pool.connect();
      try {
        await c.query('begin');
        for (const stmt of splitSql(sql)) await c.query(stmt);
        await c.query('insert into public.schema_migrations(name) values ($1)', [f]);
        await c.query('commit');
        log(`✔ ${f}`);
      } catch (e) { await c.query('rollback'); throw new Error(`Migratie ${f} mislukt: ${(e as Error).message}`); }
      finally { c.release(); }
    }
  } finally { await pool.end(); }
}

/** Splitst op ; buiten strings, commentaar en $$-blokken (extended protocol staat één statement per keer toe). */
export function splitSql(sql: string): string[] {
  const out: string[] = []; let cur = ''; let i = 0; let dollar: string | null = null; let sq = false;
  while (i < sql.length) {
    const ch = sql[i];
    if (!dollar && !sq && ch === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; continue; }
    if (!sq) {
      const m = sql.slice(i).match(/^\$[a-zA-Z_]*\$/);
      if (m) { if (dollar === m[0]) dollar = null; else if (!dollar) dollar = m[0]; cur += m[0]; i += m[0].length; continue; }
    }
    if (!dollar && ch === "'") sq = !sq;
    if (!dollar && !sq && ch === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate({ reset: process.argv.includes('--reset') }).catch(e => { console.error(e.message); process.exit(1); });
}
