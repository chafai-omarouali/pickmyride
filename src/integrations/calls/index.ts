/**
 * Afgeschermd bellen ("click-to-call" met doorverbinden).
 * 1. De beller tikt op "Bellen" in de app.
 * 2. De provider belt de beller op zijn eigen nummer, met het platformnummer als afzender.
 * 3. Neemt de beller op, dan verbindt de provider door met de ander, ook met het platformnummer als afzender.
 * Geen van beide partijen ziet het nummer van de ander. Gesprekken worden NIET opgenomen.
 *
 * Providers:
 *  - 'geen'   (standaard): niet aangesloten; de app meldt dit duidelijk en verwijst naar de chat.
 *  - 'demo'   : simulatie, alleen in de demo-omgeving, duidelijk gemarkeerd. Er wordt niemand gebeld.
 *  - 'twilio' : voorbereid, NIET getest (geen account/netwerk in de bouwomgeving). Zie docs/INTEGRATIES.md.
 */
import crypto from 'node:crypto';
import { config } from '../../lib/config.ts';

export type CallStatus = 'aangevraagd' | 'gaat_over' | 'verbonden' | 'afgerond' | 'niet_beantwoord' | 'mislukt' | 'niet_beschikbaar';

export interface StartCallInput { sessionId: string; callerPhone: string; calleePhone: string; statusUrl: string }
export interface CallProvider {
  readonly name: 'geen' | 'demo' | 'twilio';
  readonly available: boolean;
  readonly isSimulated: boolean;
  start(input: StartCallInput): Promise<{ providerCallId: string; status: CallStatus }>;
  /** Verifieert een statusmelding van de provider; gooit bij een ongeldige handtekening. */
  parseStatus(rawBody: string, headers: Record<string, string | string[] | undefined>, fullUrl: string): { providerCallId: string; status: CallStatus; durationS?: number };
}

const geen: CallProvider = {
  name: 'geen', available: false, isSimulated: false,
  async start() { throw new Error('Bellen via de app is nog niet aangesloten.'); },
  parseStatus() { throw new Error('Geen belprovider ingesteld'); },
};

const demo: CallProvider = {
  name: 'demo', available: true, isSimulated: true,
  async start() {
    if (config.appEnv === 'production') throw new Error('Demo-bellen is uitgeschakeld in productie.');
    return { providerCallId: 'demo_call_' + crypto.randomBytes(8).toString('hex'), status: 'afgerond' };
  },
  parseStatus() { throw new Error('Demo heeft geen statusmeldingen'); },
};

/** Normaliseert Nederlandse nummers naar E.164 (+31…). */
export function toE164(phone: string): string | null {
  let p = phone.replace(/[\s\-().]/g, '');
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (p.startsWith('0')) p = '+31' + p.slice(1);
  return /^\+[1-9]\d{7,14}$/.test(p) ? p : null;
}

const STATUS_MAP: Record<string, CallStatus> = { queued: 'aangevraagd', initiated: 'aangevraagd', ringing: 'gaat_over', 'in-progress': 'verbonden', completed: 'afgerond', busy: 'niet_beantwoord', 'no-answer': 'niet_beantwoord', failed: 'mislukt', canceled: 'mislukt' };

const twilio: CallProvider = {
  name: 'twilio', available: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.CALL_PLATFORM_NUMBER), isSimulated: false,
  async start({ callerPhone, calleePhone, statusUrl }) {
    const sid = process.env.TWILIO_ACCOUNT_SID!, token = process.env.TWILIO_AUTH_TOKEN!, from = process.env.CALL_PLATFORM_NUMBER!;
    const esc = (s: string) => s.replace(/[<>&"']/g, '');
    // Eerst de beller bellen; bij opnemen een korte melding en doorverbinden. Geen opname.
    const twiml = `<Response><Say language="nl-NL">U wordt doorverbonden via PickMyRide.</Say><Dial callerId="${esc(from)}" timeout="30" record="do-not-record"><Number>${esc(calleePhone)}</Number></Dial></Response>`;
    const body = new URLSearchParams({ To: callerPhone, From: from, Twiml: twiml, StatusCallback: statusUrl, StatusCallbackMethod: 'POST' });
    ['initiated', 'ringing', 'answered', 'completed'].forEach(e => body.append('StatusCallbackEvent', e));
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
      method: 'POST', body, headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();
    return { providerCallId: data.sid, status: STATUS_MAP[data.status] || 'aangevraagd' };
  },
  parseStatus(raw, headers, fullUrl) {
    // Twilio-handtekening: HMAC-SHA1 over URL + gesorteerde parameters, base64, met de auth token.
    const params = new URLSearchParams(raw);
    const data = fullUrl + [...params.keys()].sort().map(k => k + params.get(k)).join('');
    const expected = crypto.createHmac('sha1', process.env.TWILIO_AUTH_TOKEN || '').update(data).digest('base64');
    const sig = String(headers['x-twilio-signature'] || '');
    if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('Ongeldige handtekening');
    return { providerCallId: params.get('CallSid') || '', status: STATUS_MAP[params.get('CallStatus') || ''] || 'aangevraagd', durationS: Number(params.get('CallDuration')) || undefined };
  },
};

export function callProvider(): CallProvider {
  const p = process.env.CALL_PROVIDER || 'geen';
  if (p === 'twilio') return twilio;
  if (p === 'demo' && config.demoMode && config.appEnv !== 'production') return demo;
  return geen;
}
