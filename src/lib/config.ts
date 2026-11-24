/** Configuratie uitsluitend via omgevingsvariabelen. Geen geheimen in code of frontend. */
const env = process.env;

export type AppEnv = 'development' | 'test' | 'production';

export const config = {
  appEnv: (env.APP_ENV || 'development') as AppEnv,
  port: Number(env.PORT || 3000),
  baseUrl: env.BASE_URL || `http://localhost:${env.PORT || 3000}`,
  databaseUrl: env.DATABASE_URL || 'postgres://pickmyride_app@127.0.0.1:5433/pickmyride',
  sessionSecret: env.SESSION_SECRET || '',
  // Demo-omgeving: toont demo-betaalomgeving en ontwikkel-mailbox. Nooit in productie.
  demoMode: env.DEMO_MODE === 'true',
  paymentProvider: (env.PAYMENT_PROVIDER || 'demo') as 'demo' | 'mollie',
  paymentWebhookSecret: env.PAYMENT_WEBHOOK_SECRET || '',
  mollieApiKey: env.MOLLIE_API_KEY || '',
  geoProvider: (env.GEO_PROVIDER || 'geen') as 'geen' | 'pdok',
  mailMode: (env.MAIL_MODE || 'outbox') as 'outbox' | 'smtp',
  storageDir: env.STORAGE_DIR || new URL('../../storage/private/', import.meta.url).pathname,
  secureCookies: (env.BASE_URL || '').startsWith('https://'),
};

export function assertConfig() {
  const problems: string[] = [];
  if (config.appEnv === 'production') {
    if (config.demoMode) problems.push('DEMO_MODE mag niet aan staan in productie.');
    if (config.paymentProvider === 'demo') problems.push('PAYMENT_PROVIDER=demo is niet toegestaan in productie.');
    if (config.mollieApiKey.startsWith('test_') === false && config.mollieApiKey && !process.env.ALLOW_LIVE_PAYMENTS)
      problems.push('Live betaalsleutel gedetecteerd zonder ALLOW_LIVE_PAYMENTS=true (expliciete toestemming vereist).');
  }
  if (!config.paymentWebhookSecret || config.paymentWebhookSecret.length < 24) problems.push('PAYMENT_WEBHOOK_SECRET ontbreekt of is te kort (min. 24 tekens).');
  if (!config.sessionSecret || config.sessionSecret.length < 32) problems.push('SESSION_SECRET ontbreekt of is te kort (min. 32 tekens).');
  if (problems.length) throw new Error('Configuratiefout:\n- ' + problems.join('\n- '));
}
