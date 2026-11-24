/** Schermafbeeldingen van route-, luchthaven- en buitenlandpagina's. */
import { chromium } from 'playwright';
const base = process.env.BASE_URL || 'http://localhost:3000';
const b = await chromium.launch();
const d = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
for (const [n, p] of [['26-route-utrecht-schiphol', '/taxi/utrecht/schiphol'], ['27-luchthaven-schiphol', '/luchthaven/schiphol'], ['28-buitenland-dusseldorf-airport', '/buitenland/dusseldorf-airport'], ['29-buitenland-overzicht', '/buitenland']] as const) {
  await d.goto(base + p); await d.screenshot({ path: `docs/screenshots/${n}.png`, fullPage: true });
}
const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })).newPage();
await m.goto(base + '/rit-aanvragen?dropoff_street=Brussels%20Airport'); await m.locator('[data-address="dropoff"]').scrollIntoViewIfNeeded();
await m.screenshot({ path: 'docs/screenshots/30-formulier-buitenland-mobiel.png' });
await b.close(); process.exit(0);
