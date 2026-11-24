/**
 * Mollie-adapter (voorbereid, NIET getest in deze ontwikkelomgeving: geen netwerktoegang en geen API-sleutel).
 *
 * Waarom Mollie: Nederlandse provider met iDEAL, kaart en Apple Pay, en "Mollie Connect" voor platformen
 * (betalingen innen namens aangesloten bedrijven, commissie inhouden via application fees, uitbetalen aan bedrijven).
 * Alternatief: Stripe Connect. De keuze en het contractmodel (wie is "merchant of record") moet juridisch/fiscaal
 * worden bevestigd — zie docs/BESLISSINGEN.md.
 *
 * Mollie ondertekent webhooks niet; de webhook bevat alleen een betaling-id. Daarom wordt de status ALTIJD
 * opnieuw opgehaald bij de Mollie-API (getStatus). Dat is het betrouwbare bewijs.
 * Gebruik in ontwikkeling uitsluitend een test_-sleutel. Live-sleutels worden geweigerd zonder ALLOW_LIVE_PAYMENTS=true.
 */
import { config } from '../../lib/config.ts';
import type { PaymentProvider, ProviderStatus } from './types.ts';

const API = 'https://api.mollie.com/v2';

async function call(path: string, init: RequestInit = {}) {
  if (!config.mollieApiKey) throw new Error('MOLLIE_API_KEY is niet ingesteld.');
  if (!config.mollieApiKey.startsWith('test_') && process.env.ALLOW_LIVE_PAYMENTS !== 'true') throw new Error('Live betalingen zijn niet vrijgegeven.');
  const res = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${config.mollieApiKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`Mollie API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<any>;
}

export const mollieProvider: PaymentProvider = {
  name: 'mollie',
  isSimulated: false,
  async createPayment(input) {
    const p = await call('/payments', { method: 'POST', body: JSON.stringify({
      amount: { currency: 'EUR', value: (input.amountCents / 100).toFixed(2) },
      description: input.description.slice(0, 250),
      redirectUrl: input.returnUrl, webhookUrl: input.webhookUrl,
      metadata: { paymentId: input.paymentId },
      // TODO bij Mollie Connect: profileId / applicationFee voor commissie per aangesloten bedrijf.
    }) });
    return { providerPaymentId: p.id, checkoutUrl: p._links.checkout.href };
  },
  parseWebhook(raw) {
    const id = new URLSearchParams(raw.toString('utf8')).get('id');
    if (!id || !/^tr_\w+$/.test(id)) throw new Error('Ongeldige Mollie-webhook');
    // Mollie stuurt geen event-id; we gebruiken id + tijdvak niet: de idempotentie zit in de statusverwerking zelf.
    return { eventId: `${id}:${Date.now()}`, providerPaymentId: id };
  },
  async getStatus(id) {
    const p = await call(`/payments/${encodeURIComponent(id)}`);
    const map: Record<string, ProviderStatus> = { open: 'open', pending: 'open', authorized: 'open', paid: 'paid', failed: 'failed', expired: 'expired', canceled: 'canceled' };
    return map[p.status] || 'open';
  },
  async refund(id, amountCents, reason) {
    const r = await call(`/payments/${encodeURIComponent(id)}/refunds`, { method: 'POST', body: JSON.stringify({ amount: { currency: 'EUR', value: (amountCents / 100).toFixed(2) }, description: reason.slice(0, 140) }) });
    return { providerRefundId: r.id };
  },
};
