import { chromium } from 'playwright';
const b = await chromium.launch();
const d = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
await d.goto('http://localhost:3000/'); await d.screenshot({ path: 'docs/screenshots/22-home-compleet.png', fullPage: true });
await d.goto('http://localhost:3000/taxi/zaandam'); await d.screenshot({ path: 'docs/screenshots/23-stadspagina-zaandam.png', fullPage: true });
await d.goto('http://localhost:3000/taxi'); await d.screenshot({ path: 'docs/screenshots/24-taxi-per-stad.png', fullPage: true });
const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })).newPage();
await m.goto('http://localhost:3000/taxi/eindhoven'); await m.screenshot({ path: 'docs/screenshots/25-stadspagina-mobiel.png', fullPage: false });
await b.close(); process.exit(0);
