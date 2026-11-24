import crypto from 'node:crypto';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

/** Wachtwoord-hash met scrypt (node:crypto). Formaat: scrypt$N$r$p$salt$hash */
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1;
  const hash = crypto.scryptSync(pw, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verifyPassword(pw: string, stored: string | null): boolean {
  if (!stored) { crypto.scryptSync(pw, 'dummy-salt-for-timing', 64); return false; }
  const [alg, N, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const calc = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), 64, { N: +N, r: +r, p: +p, maxmem: 64 * 1024 * 1024 });
  const expected = Buffer.from(hash, 'base64');
  return expected.length === calc.length && crypto.timingSafeEqual(expected, calc);
}
export function passwordProblem(pw: string): string | null {
  if (!pw || pw.length < 10) return 'Kies een wachtwoord van minimaal 10 tekens.';
  if (pw.length > 200) return 'Wachtwoord is te lang.';
  return null;
}

export function hmac(secret: string, payload: string) { return crypto.createHmac('sha256', secret).update(payload).digest('hex'); }
export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Verwijdert e-mailadressen, telefoonnummers en postcodes+huisnummers uit vrije tekst voor bieders. */
export function scrubPersonalData(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail verwijderd]')
    .replace(/(\+|00)?\d[\d\s\-()]{7,}\d/g, '[nummer verwijderd]')
    .replace(/\b\d{4}\s?[A-Za-z]{2}\b(\s*\d+[a-zA-Z]?)?/g, '[adres verwijderd]')
    .trim();
}
