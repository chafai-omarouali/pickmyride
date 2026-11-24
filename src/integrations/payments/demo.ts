/**
 * DEMO-betaalprovider. Herkenbaar als simulatie: elke betaling heeft is_simulated = true,
 * de betaalpagina toont een duidelijke DEMO-banner en er wordt nooit geld verplaatst.
 * Werkt als een echte provider: aparte "betaalomgeving", ondertekende webhooks (HMAC-SHA256) en statusopvraag.
 * Niet beschikbaar wanneer APP_ENV=production.
 */
import { randomToken, hmac, safeEqual } from '../../lib/security.ts';
import { config } from '../../lib/config.ts';
import type { PaymentProvider, ProviderStatus, WebhookEvent } from './types.ts';

// De "provider-zijde" staat in het geheugen van dit proces (zoals een externe provider dat zelf zou bijhouden).
const store = new Map<string, { status: ProviderStatus; amountCents: number; returnUrl: string; webhookUrl: string }>();

export const demoProvider: PaymentProvider & {
  simulate(providerPaymentId: string, outcome: 'paid' | 'failed'): Promise<string>;
  lookup(id: string): { status: ProviderStatus; amountCents: number; returnUrl: string } | undefined;
  signedEvent(providerPaymentId: string, eventId?: string): { body: string; signature: string };
} = {
  name: 'demo',
  isSimulated: true,
  async createPayment(input) {
    if (config.appEnv === 'production') throw new Error('Demo-betalingen zijn uitgeschakeld in productie.');
    const id = 'demo_tr_' + randomToken(12);
    store.set(id, { status: 'open', amountCents: input.amountCents, returnUrl: input.returnUrl, webhookUrl: input.webhookUrl });
    return { providerPaymentId: id, checkoutUrl: `/demo-betaalomgeving/${id}` };
  },
  signedEvent(providerPaymentId, eventId = 'evt_' + randomToken(10)) {
    const body = JSON.stringify({ id: eventId, payment_id: providerPaymentId });
    return { body, signature: hmac(config.paymentWebhookSecret, body) };
  },
  parseWebhook(raw, headers) {
    const sig = String(headers['x-pickmyride-signature'] || '');
    const expected = hmac(config.paymentWebhookSecret, raw.toString('utf8'));
    if (!sig || !safeEqual(sig, expected)) throw new Error('Ongeldige webhook-handtekening');
    const data = JSON.parse(raw.toString('utf8'));
    if (typeof data.id !== 'string' || typeof data.payment_id !== 'string') throw new Error('Ongeldige webhook-inhoud');
    return { eventId: data.id, providerPaymentId: data.payment_id } as WebhookEvent;
  },
  async getStatus(id) {
    const p = store.get(id);
    if (!p) throw new Error('Onbekende demo-betaling');
    return p.status;
  },
  async refund(id, amountCents) {
    const p = store.get(id);
    if (!p || p.status !== 'paid') throw new Error('Terugbetaling niet mogelijk voor deze demo-betaling');
    if (amountCents > p.amountCents) throw new Error('Bedrag te hoog');
    return { providerRefundId: 'demo_re_' + randomToken(10) };
  },
  /** Zet de status in de demo-betaalomgeving en stuurt een ondertekende webhook naar de applicatie. */
  async simulate(id, outcome) {
    const p = store.get(id);
    if (!p) throw new Error('Onbekende demo-betaling');
    if (p.status === 'open') p.status = outcome;
    const ev = this.signedEvent(id);
    const res = await fetch(p.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PickMyRide-Signature': ev.signature }, body: ev.body });
    if (!res.ok) throw new Error(`Webhook gaf status ${res.status}`);
    return p.returnUrl;
  },
  lookup(id) { return store.get(id); },
};
