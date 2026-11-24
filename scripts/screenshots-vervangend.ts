/** Schermafbeeldingen van de klantenservice-flow (vervangend vervoer). Draai tegen een verse demodatabase; past demodata aan. */
import { chromium } from 'playwright';
import { createPool } from '../src/lib/pg.ts';
const base = process.env.BASE_URL || 'http://localhost:3000';
const out = process.argv[2] || 'docs/screenshots';
const PW = 'Demo-wachtwoord-2026';
const db = await createPool(process.env.MIGRATION_DATABASE_URL || 'postgres://postgres@127.0.0.1:5433/pickmyride', 1);
await db.query(`update pickmyride.platform_settings set value = '-100000' where key = 'no_show_report_minutes'`);
const browser = await chromium.launch();
async function session(email: string, mobile = false) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(base + '/inloggen'); await p.fill('#f-email', email); await p.fill('#f-password', PW); await p.click('form[action="/inloggen"] button[type=submit]'); await p.waitForLoadState();
  return p;
}
const anon = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await anon.goto(base + '/'); await anon.locator('.support-band').scrollIntoViewIfNeeded();
await anon.screenshot({ path: `${out}/18-home-klantenservice.png`, clip: await anon.locator('.support-band').boundingBox().then(b => ({ x: 0, y: b!.y - 40, width: 1366, height: b!.height + 80 })) });

const k = await session('klant.twee@demo.pickmyride.test', true);
await k.click('a.card:has-text("Boeking")'); await k.waitForLoadState(); await k.click('a:has-text("Bekijk boeking")'); await k.waitForLoadState();
const bookingUrl = k.url();
await k.locator('#hulp').scrollIntoViewIfNeeded();
await k.screenshot({ path: `${out}/19-hulp-melden-mobiel.png` });
await k.fill('#f-details', 'Wij staan al 15 minuten bij de ingang, geen taxi te zien.');
await k.click('#hulp button[type=submit]'); await k.waitForLoadState();

const a = await session('beheer@demo.pickmyride.test');
await a.goto(base + '/beheer/vervangend-vervoer'); await a.click('table a[href^="/beheer/vervangend-vervoer/"]'); await a.waitForLoadState();
await a.click('text=Ik pak deze melding op'); await a.waitForLoadState();
await a.selectOption('#f-replacement_company_id', { index: 1 });
await a.selectOption('[name="eta__h"]', '15'); await a.selectOption('[name="eta__m"]', '20');
await a.screenshot({ path: `${out}/20-beheer-vervanger-regelen.png`, fullPage: true });
await a.click('text=Vervanger vastleggen en klant informeren'); await a.waitForLoadState();

await k.goto(bookingUrl); await k.locator('#hulp').scrollIntoViewIfNeeded();
await k.screenshot({ path: `${out}/21-vervanger-geregeld-mobiel.png` });
await browser.close();
await db.query(`update pickmyride.platform_settings set value = '10' where key = 'no_show_report_minutes'`);
await db.end?.();
console.log('klaar'); process.exit(0);
