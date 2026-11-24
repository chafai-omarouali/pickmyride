import { config } from '../../lib/config.ts';
import { demoProvider } from './demo.ts';
import { mollieProvider } from './mollie.ts';
import type { PaymentProvider } from './types.ts';

export function paymentProvider(): PaymentProvider {
  return config.paymentProvider === 'mollie' ? mollieProvider : demoProvider;
}
export { demoProvider };
