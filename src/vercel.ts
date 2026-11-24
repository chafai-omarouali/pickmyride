/**
 * Ingang voor Vercel (Node.js-functie). Lokaal en op een eigen server blijft src/server.ts de ingang.
 * Achtergrondwerk (verlopen biedingen, berichten) draait hier op verzoeken, hooguit eens per minuut per instantie,
 * en daarnaast via de dagelijkse cron op /api/cron/achtergrond.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { assertConfig } from './lib/config.ts';
import { handle, backgroundTick } from './server.ts';

let checked = false;
let lastTick = 0;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!checked) { assertConfig(); checked = true; }
  const url = req.url || '/';
  if (url.startsWith('/api/cron/achtergrond')) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) { res.writeHead(401); return res.end(); }
    await backgroundTick(); lastTick = Date.now();
    res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok');
  }
  if (Date.now() - lastTick > 60_000) { lastTick = Date.now(); await backgroundTick(); }
  await handle(req, res);
}
