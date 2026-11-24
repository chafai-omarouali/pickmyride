/** Maakt schermafbeeldingen van belangrijke schermen (mobiel en desktop) tegen een draaiende demo-server. */
import { chromium } from 'playwright';
const base = process.env.BASE_URL || 'http://localhost:3000';
const out = process.argv[2] || 'docs/screenshots';
const PW = 'Demo-wachtwoord-2026';
const browser = await chromium.launch();
async function shoot(name: string, path: string, opts: { mobile?: boolean; login?: string; full?: boolean; act?: (p: any) => Promise<void> } = {}) {
  const ctx = await browser.newContext(opts.mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  if (opts.login) { await p.goto(base + '/inloggen'); await p.fill('#f-email', opts.login); await p.fill('#f-password', PW); await p.click('form[action="/inloggen"] button[type=submit]'); await p.waitForLoadState(); }
  await p.goto(base + path); if (opts.act) await opts.act(p);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: opts.full ?? true });
  await ctx.close();
}
await shoot('01-home-mobiel', '/', { mobile: true });
await shoot('02-home-desktop', '/', { full: false });
await shoot('15-home-volledig', '/', { full: true });
await shoot('03-aanvraag-stap1-mobiel', '/rit-aanvragen?pickup_street=Teststraat%201%2C%201012AB%20Amsterdam&dropoff_street=Eindhoven%20Airport&passengers=2', { mobile: true });
const d3 = new Date(Date.now() + 3 * 86400e3).toISOString().slice(0, 10);
await shoot('04-aanvraag-stap2-mobiel', `/rit-aanvragen?pickup_street=Teststraat%201%2C%201012AB%20Amsterdam&dropoff_street=Schiphol&date=${d3}`, { mobile: true, act: async p => {
  await p.selectOption('[name="time__h"]', '17'); await p.selectOption('[name="time__m"]', '45');
  await p.click('[data-step="1"] [data-next]'); await p.selectOption('[name="small_bags"]', '2'); await p.click('label[for="f-need_seats"]');
  await p.selectOption('[name="seat_maxicosi"]', '1'); await p.selectOption('[name="seat_verhoger"]', '1'); } });
const k1 = 'klant.een@demo.pickmyride.test';
await shoot('05-aanbiedingen-mobiel', '/mijn', { mobile: true, login: k1, act: async p => { await p.click('a.card:has-text("AV-DEMO-9001")'); await p.waitForLoadState(); } });
await shoot('06-aanbiedingen-desktop', '/mijn', { login: k1, act: async p => { await p.click('a.card:has-text("AV-DEMO-9001")'); await p.waitForLoadState(); } });
await shoot('07-bedrijf-aanvragen', '/bedrijf/aanvragen', { login: 'airport@demo.pickmyride.test' });
await shoot('08-bedrijf-bod-formulier', '/bedrijf/aanvragen', { login: 'airport@demo.pickmyride.test', act: async p => { await p.click('text=Bekijk en bied >> nth=0'); await p.waitForLoadState(); await p.fill('#f-price', '62,50'); } });
await shoot('09-beheer-dashboard', '/beheer', { login: 'beheer@demo.pickmyride.test' });
await shoot('10-beheer-bedrijf-beoordelen', '/beheer/bedrijven', { login: 'beheer@demo.pickmyride.test', act: async p => { await p.click('text=Demo Rijdienst Utrecht'); await p.waitForLoadState(); } });
await shoot('11-bedrijf-aanmelden-mobiel', '/aanmelden-taxibedrijf', { mobile: true, full: false });
await shoot('12-beoordeling-formulier-mobiel', '/mijn', { mobile: true, login: k1, act: async p => {
  await p.click('a.card:has-text("Demo Airport Cars") >> nth=0').catch(async () => {});
  const links = await p.$$eval('a', as => as.map(a => (a as HTMLAnchorElement).href).filter(h => h.includes('/mijn/aanvragen/')));
  for (const l of links) { await p.goto(l); const b = await p.$('a:has-text("Bekijk boeking")'); if (b && (await p.content()).includes('Afgerond') === false) { await b.click(); await p.waitForLoadState(); if (await p.$('form[action$="/beoordeling"]')) break; } }
  for (const [k, n] of [['communicatie', 5], ['klantvriendelijkheid', 5], ['comfort_hygiene', 4], ['betrouwbaarheid', 5], ['rijgedrag_veiligheid', 4]] as const) await p.click(`label[for="r-${k}-${n}"]`);
  await p.locator('#beoordeling').scrollIntoViewIfNeeded();
} });
await shoot('13-bedrijf-beoordelingen', '/bedrijf/beoordelingen', { login: 'noord@demo.pickmyride.test' });
await shoot('14-aanbod-met-beoordelingen', '/mijn', { login: k1, act: async p => { await p.click('a.card:has-text("AV-DEMO-9001")'); await p.waitForLoadState(); await p.click('details.more >> nth=1'); } });
await shoot('16-chat-klant-mobiel', '/mijn', { mobile: true, login: 'klant.twee@demo.pickmyride.test', act: async p => {
  await p.click('a.card:has-text("Boeking")'); await p.waitForLoadState(); await p.click('a:has-text("Bekijk boeking")'); await p.waitForLoadState(); await p.locator('#contact').scrollIntoViewIfNeeded(); } , full: false });
await shoot('17-chat-bedrijf', '/bedrijf/ritten', { login: 'noord@demo.pickmyride.test', act: async p => {
  await p.click('a.badge:has-text("nieuw")'); await p.waitForLoadState(); } });
await browser.close();
console.log('Schermafbeeldingen opgeslagen in ' + out);
