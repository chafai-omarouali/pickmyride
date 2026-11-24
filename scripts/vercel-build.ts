/**
 * Build voor Vercel (Build Output API v3):
 * 1. databasemigraties uitvoeren als eigenaar (Neon-koppeling: DATABASE_URL_UNPOOLED),
 * 2. wachtwoord van de beperkte app-rol zetten (APP_DB_PASSWORD),
 * 3. optioneel duidelijk fictieve demodata laden (SEED_DEMO=true, nooit in productie),
 * 4. de server bundelen tot één Node.js-functie en public/ als statische bestanden klaarzetten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url).pathname;
const out = path.join(root, '.vercel/output');
const env = process.env;

const ownerUrl = env.DATABASE_URL_UNPOOLED || env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;
if (!ownerUrl) throw new Error('Geen database gekoppeld: DATABASE_URL (Neon-koppeling in Vercel) ontbreekt.');
if (!env.APP_DB_PASSWORD || !/^[A-Za-z0-9]{24,}$/.test(env.APP_DB_PASSWORD)) throw new Error('APP_DB_PASSWORD ontbreekt of is ongeldig (minimaal 24 letters/cijfers).');
process.env.MIGRATION_DATABASE_URL = ownerUrl;

// 1 + 2: migraties en app-rol
const { migrate } = await import('./migrate.ts');
await migrate();
const { createPool } = await import('../src/lib/pg.ts');
const pool = await createPool(ownerUrl, 1);
await pool.query(`alter role pickmyride_app with login password '${env.APP_DB_PASSWORD}'`);
await pool.end();
console.log('✔ app-rol ingesteld');

// 3: demodata
if (env.SEED_DEMO === 'true') {
  if (env.APP_ENV === 'production') throw new Error('Demodata wordt nooit in productie geladen.');
  const { seedDemo } = await import('./seed-demo.ts');
  await seedDemo(ownerUrl);
  console.log('✔ demodata (fictief) aanwezig');
}

// 4: bundel en statische bestanden
fs.rmSync(out, { recursive: true, force: true });
const fn = path.join(out, 'functions/index.func');
fs.mkdirSync(fn, { recursive: true });
await build({
  entryPoints: [path.join(root, 'src/vercel.ts')], outfile: path.join(fn, 'index.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node22', jsx: 'automatic',
  external: ['pg-native', ...(process.env.PMR_LOCAL_BUILD ? ['pg'] : [])], logLevel: 'warning',
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
fs.writeFileSync(path.join(fn, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', shouldAddHelpers: false, maxDuration: 30, regions: ['fra1'] }, null, 2));
fs.cpSync(path.join(root, 'public'), path.join(out, 'static/static'), { recursive: true });
fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({
  version: 3,
  routes: [
    { src: '/static/(.*)', headers: { 'Cache-Control': 'public, max-age=86400' }, continue: true },
    { handle: 'filesystem' },
    { src: '/(.*)', dest: '/index' },
  ],
  crons: [{ path: '/api/cron/achtergrond', schedule: '0 3 * * *' }],
}, null, 2));
console.log('✔ Vercel-uitvoer klaar');
