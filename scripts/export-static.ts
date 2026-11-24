/**
 * Statische voorvertoning van alle openbare pagina's (voor een tijdelijke link).
 * - Rendert elke pagina via de echte server tegen de demodatabase.
 * - Zet een duidelijke banner bovenaan: voorvertoning, formulieren versturen werkt hier niet.
 * - Blokkeert indexering (noindex + robots.txt), zodat de voorvertoning nooit met de echte site concurreert.
 * Gebruik: DEMO_MODE=true DATABASE_URL=... npx tsx scripts/export-static.ts [uitvoermap]
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

process.env.DEMO_MODE = 'true';
const out = path.resolve(process.argv[2] || 'preview-site');
const { createServer } = await import('../src/server.ts');
const { CITIES } = await import('../src/lib/cities.ts');
const { SEO_PATHS } = await import('../src/ui/pages/seo.tsx');
const { TOPIC_PAGES } = await import('../src/ui/pages/topics.tsx');

const server = createServer();
await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const pages = ['/', '/rit-aanvragen', '/rit-aanvragen/gegevens', '/hoe-werkt-het', '/voor-taxibedrijven', '/aanmelden-taxibedrijf', '/veelgestelde-vragen', '/contact',
  '/privacyverklaring', '/algemene-voorwaarden', '/annuleringsvoorwaarden', '/inloggen', '/taxi',
  ...CITIES.map(c => `/taxi/${c.slug}`), ...SEO_PATHS(), ...TOPIC_PAGES.map(([h]) => h)];

/** RELATIVE=1: alle links relatief en naar index.html, voor hosting zonder routering (bijv. een bestand-gebaseerde host). */
const RELATIVE = process.env.RELATIVE === '1';
function relativize(html: string, depth: number) {
  const pre = '../'.repeat(depth);
  const conv = (u: string) => {
    const m = /^([^?#]*)(.*)$/.exec(u)!; const pth = m[1].replace(/\/$/, ''), rest = m[2];
    if (pth.startsWith('static/')) return pre + pth + rest;
    return pre + (pth ? pth + '/' : '') + 'index.html' + rest;
  };
  return html.replace(/(href|src|action)="\/(?!\/)([^"]*)"/g, (_, a, u) => `${a}="${conv(u)}"`)
    .replace(/(srcSet|imageSrcSet)="([^"]*)"/g, (_: string, a: string, v: string) => `${a}="${v.replace(/(^|,\s*)\/static\//g, `$1${pre}static/`)}"`);
}

const BANNER = `<div class="preview-banner" role="note"><strong>Voorvertoning.</strong> Alleen om te bekijken: aanvragen, inloggen en formulieren versturen werken hier niet. Alle bedrijven en cijfers zijn fictieve demodata.</div>`;

fs.rmSync(out, { recursive: true, force: true });
let n = 0;
for (const p of pages) {
  const res = await fetch(base + p);
  if (res.status !== 200) throw new Error(`${p} gaf ${res.status}`);
  let html = await res.text();
  html = html.replace(/<span class="theme-switch">[\s\S]*?<\/span><\/div>/, '</div>')           // kleurkeuze werkt niet statisch
    .replace('<meta charSet="utf-8"/>', '<meta charSet="utf-8"/><meta name="robots" content="noindex, nofollow"/>')
    .replace(/<body([^>]*)>/, `<body$1>${BANNER}`);
  if (RELATIVE) html = relativize(html, p === '/' ? 0 : p.split('/').filter(Boolean).length);
  const file = p === '/' ? path.join(out, 'index.html') : path.join(out, p, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html); n++;
}
// 404-pagina
{
  const res = await fetch(base + '/bestaat-niet');
  fs.writeFileSync(path.join(out, '404.html'), (await res.text()).replace(/<body([^>]*)>/, `<body$1>${BANNER}`));
}
// Statische bestanden
const pub = new URL('../public/', import.meta.url).pathname;
fs.cpSync(pub, path.join(out, 'static'), { recursive: true });
if (RELATIVE) { const css = path.join(out, 'static', 'styles.css'); fs.writeFileSync(css, fs.readFileSync(css, 'utf8').replaceAll('url("/static/', 'url("')); }
fs.appendFileSync(path.join(out, 'static', 'styles.css'), `
.preview-banner { background: #A88462; color: #1A120E; text-align: center; font-size: .9rem; padding: .55rem 1rem; }
`);
fs.writeFileSync(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
fs.writeFileSync(path.join(out, 'vercel.json'), JSON.stringify({
  cleanUrls: true, trailingSlash: false,
  headers: [{ source: '/(.*)', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }],
}, null, 2));
server.close();
console.log(`${n} pagina's geëxporteerd naar ${out}`);
process.exit(0);
