/** Geldbedragen uitsluitend als gehele centen. */
export interface CommissionRule { id: string; name: string; percent_bp: number; fixed_cents: number; min_cents: number; is_demo: boolean }

const eur = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' });
export const formatEuro = (cents: number) => eur.format(cents / 100);

/** Parse invoer als "65", "65,50", "65.50", "€ 1.065,50" naar centen. Geeft null bij ongeldige invoer. */
export function parseEuroToCents(input: string): number | null {
  if (typeof input !== 'string') return null;
  let s = input.replace(/[€\s]/g, '');
  if (!/^\d{1,3}([.]\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(s)) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const [whole, frac = ''] = s.split('.');
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * Commissie = max(minimum, afgerond(totaal × percentage) + vast bedrag), nooit meer dan het totaal.
 * Afronding: half naar boven op hele centen (Math.round op gehele getallen).
 */
export function calculateCommission(totalCents: number, rule: Pick<CommissionRule, 'percent_bp' | 'fixed_cents' | 'min_cents'>) {
  const pct = Math.round((totalCents * rule.percent_bp) / 10000);
  const commission = Math.min(totalCents, Math.max(rule.min_cents, pct + rule.fixed_cents));
  return { commissionCents: commission, payoutCents: totalCents - commission };
}

export function describeRule(rule: CommissionRule) {
  const parts = [`${(rule.percent_bp / 100).toLocaleString('nl-NL')}% van de klantprijs`];
  if (rule.fixed_cents) parts.push(`plus ${formatEuro(rule.fixed_cents)} vast`);
  if (rule.min_cents) parts.push(`minimaal ${formatEuro(rule.min_cents)}`);
  return parts.join(', ') + (rule.is_demo ? ' (DEMO-instelling)' : '');
}
