/** Schermafbeeldingen van de kleurversie "Blauw" (logokleuren). Vereist DEMO_MODE=true. */
import { chromium } from 'playwright';
const base = process.env.BASE_URL || 'http://localhost:3000';
const PW = 'Demo-wachtwoord-2026';
const out = 'docs/screenshots/blauw';
const browser = await chromium.launch();
async function shot(name: string, path: string, o: { mobile?: boolean; login?: string; full?: boolean; act?: (p: any) => Promise<void> } = {}) {
  const ctx = await browser.newContext(o.mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true } : { viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(base + '/?thema=blauw');
  if (o.login) { await p.goto(base + '/inloggen'); await p.fill('#f-email', o.login); await p.fill('#f-password', PW); await p.click('form[action="/inloggen"] button[type=submit]'); await p.waitForLoadState(); }
  await p.goto(base + path); if (o.act) await o.act(p);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: o.full ?? true });
  await ctx.close();
}
await shot('01-home', '/');
await shot('02-home-mobiel', '/', { mobile: true, full: false });
await shot('03-aanbiedingen', '/mijn', { login: 'klant.een@demo.pickmyride.test', act: async p => { await p.click('a.card:has-text("AV-DEMO-9001")'); await p.waitForLoadState(); await p.click('details.more >> nth=1'); } });
await shot('04-bedrijf-bod', '/bedrijf/aanvragen', { login: 'airport@demo.pickmyride.test', full: false, act: async p => { await p.click('text=Bekijk en bied >> nth=0'); await p.waitForLoadState(); await p.fill('#f-price', '62,50'); } });
await shot('05-beheer', '/beheer', { login: 'beheer@demo.pickmyride.test' });
await browser.close();
console.log('ok');
