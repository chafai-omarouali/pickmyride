/** Testopzet: aparte testdatabase, echte server op een vrije poort, HTTP-client met cookies en CSRF. */
import type { AddressInfo } from 'node:net';

process.env.APP_ENV = 'test';
process.env.DEMO_MODE = 'true';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://pickmyride_app@127.0.0.1:5433/pickmyride_test';
process.env.MIGRATION_DATABASE_URL = process.env.TEST_MIGRATION_DATABASE_URL || 'postgres://postgres@127.0.0.1:5433/pickmyride_test';
process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef0123';
process.env.PAYMENT_WEBHOOK_SECRET = 'test-webhook-secret-0123456789abcdef';
process.env.PORT = '0';

export async function startTestApp() {
  const { migrate } = await import('../scripts/migrate.ts');
  await migrate({ reset: true, quiet: true });
  const { createServer } = await import('../src/server.ts');
  const server = createServer();
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  const { config } = await import('../src/lib/config.ts');
  config.baseUrl = `http://127.0.0.1:${port}`;
  return { server, base: config.baseUrl };
}

export class Browser {
  cookies = new Map<string, string>();
  constructor(public base: string, public userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile') {}
  private cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }
  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (/Max-Age=0/.test(c)) this.cookies.delete(k); else this.cookies.set(k, v); }
  }
  async get(path: string) {
    const res = await fetch(this.base + path, { redirect: 'manual', headers: { Cookie: this.cookieHeader(), 'User-Agent': this.userAgent } });
    this.store(res); return { status: res.status, location: res.headers.get('location'), text: await res.text(), headers: res.headers };
  }
  async csrf() { if (!this.cookies.get('rb_csrf')) await this.get('/inloggen'); return decodeURIComponent(this.cookies.get('rb_csrf')!); }
  async post(path: string, data: Record<string, string | string[]>, opts: { noCsrf?: boolean } = {}) {
    const body = new URLSearchParams();
    if (!opts.noCsrf) body.append('_csrf', await this.csrf());
    for (const [k, v] of Object.entries(data)) for (const x of Array.isArray(v) ? v : [v]) body.append(k, x);
    const res = await fetch(this.base + path, { method: 'POST', redirect: 'manual', body, headers: { Cookie: this.cookieHeader(), 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': this.userAgent } });
    this.store(res); return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  }
  async postMultipart(path: string, fields: Record<string, string | string[]>, files: { field: string; name: string; type: string; data: Buffer }[] = []) {
    const fd = new FormData();
    fd.append('_csrf', await this.csrf());
    for (const [k, v] of Object.entries(fields)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
    for (const f of files) fd.append(f.field, new Blob([f.data], { type: f.type }), f.name);
    const res = await fetch(this.base + path, { method: 'POST', redirect: 'manual', body: fd, headers: { Cookie: this.cookieHeader() } });
    this.store(res); return { status: res.status, location: res.headers.get('location'), text: await res.text() };
  }
  async login(email: string, password: string) {
    const r = await this.post('/inloggen', { email, password });
    if (r.status !== 303) throw new Error(`Inloggen mislukt voor ${email}: ${r.status}`);
    return r;
  }
}

/** Directe databasetoegang als eigenaar (alleen voor testopzet en controles; omzeilt RLS bewust). */
export async function ownerQuery(sql: string, params: unknown[] = []) {
  const { createPool } = await import('../src/lib/pg.ts');
  const pool = await createPool(process.env.MIGRATION_DATABASE_URL!, 1);
  try { await pool.query('set search_path = pickmyride, public'); const c = await pool.connect(); try { await c.query('set search_path = pickmyride, public'); return (await c.query(sql, params)).rows; } finally { c.release(); } }
  finally { await pool.end(); }
}

export function localDate(offsetHours: number) {
  const d = new Date(Date.now() + offsetHours * 3600_000);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
