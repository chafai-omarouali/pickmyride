/**
 * Verwisselbare betaalprovider. De boeking wordt UITSLUITEND bevestigd op basis van een
 * betrouwbare statusbevestiging van de provider (webhook + statusopvraag), nooit op basis van de terugkeerpagina.
 */
export type ProviderStatus = 'open' | 'paid' | 'failed' | 'expired' | 'canceled';

export interface CreatePaymentInput {
  paymentId: string;            // onze interne id (metadata)
  amountCents: number;
  description: string;
  returnUrl: string;
  webhookUrl: string;
}
export interface CreatePaymentResult { providerPaymentId: string; checkoutUrl: string }

export interface WebhookEvent { eventId: string; providerPaymentId: string }

export interface PaymentProvider {
  readonly name: 'demo' | 'mollie';
  readonly isSimulated: boolean;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  /** Verifieert en leest een binnenkomende webhook. Gooit een fout bij een ongeldige handtekening. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): WebhookEvent;
  /** Haalt de actuele, betrouwbare status op bij de provider. */
  getStatus(providerPaymentId: string): Promise<ProviderStatus>;
  refund(providerPaymentId: string, amountCents: number, reason: string): Promise<{ providerRefundId: string }>;
}
