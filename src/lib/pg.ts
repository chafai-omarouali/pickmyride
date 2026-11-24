/**
 * Databaseverbinding.
 * - Als het npm-pakket `pg` beschikbaar is, wordt dat gebruikt (aanbevolen voor productie: TLS, SCRAM).
 * - Anders: een minimale PostgreSQL wire-protocol client (extended query, geparametriseerd),
 *   bedoeld voor lokale ontwikkeling en tests. Ondersteunt trust/cleartext/md5-authenticatie, geen TLS.
 */
import net from 'node:net';
import crypto from 'node:crypto';

export interface QueryResult<T = any> { rows: T[]; rowCount: number; command: string }
export interface Client { query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>; release(): void }
export interface Pool { connect(): Promise<Client>; query<T = any>(text: string, params?: unknown[]): Promise<QueryResult<T>>; end(): Promise<void> }

export class PgError extends Error {
  code?: string; detail?: string; constraint?: string;
  constructor(fields: Record<string, string>) {
    super(fields.M || 'Databasefout');
    this.code = fields.C; this.detail = fields.D; this.constraint = fields.n;
  }
}

// ───────── type-parsing (tekstformaat) ─────────
function parseValue(oid: number, s: string): unknown {
  switch (oid) {
    case 16: return s === 't';
    case 20: case 21: case 23: case 26: return Number(s);
    case 700: case 701: return Number(s);
    case 114: case 3802: return JSON.parse(s);
    case 1082: return s;
    case 1114: return new Date(s.replace(' ', 'T') + 'Z');
    case 1184: return new Date(s.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
    case 1009: case 1015: return parseTextArray(s);
    case 1007: return parseTextArray(s).map(Number);
    default: return s;
  }
}
function parseTextArray(s: string): string[] {
  if (s === '{}') return [];
  const out: string[] = []; let i = 1, cur = '', q = false;
  while (i < s.length - 1) {
    const ch = s[i];
    if (q) { if (ch === '\\') { cur += s[++i]; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch;
    i++;
  }
  out.push(cur);
  return out;
}
function serialize(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 't' : 'f';
  if (Array.isArray(v)) return '{' + v.map(x => x === null ? 'NULL' : '"' + String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ───────── protocol ─────────
function msg(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(5); head.write(type, 0, 'ascii'); head.writeInt32BE(body.length + 4, 1);
  return Buffer.concat([head, body]);
}
const cstr = (s: string) => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);
const i16 = (n: number) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const i32 = (n: number) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };

interface Cfg { host: string; port: number; user: string; password?: string; database: string }

class MiniConnection {
  private sock!: net.Socket;
  private buf = Buffer.alloc(0);
  private waiters: ((m: { type: string; body: Buffer }) => void)[] = [];
  private inbox: { type: string; body: Buffer }[] = [];
  private chain: Promise<unknown> = Promise.resolve();
  broken = false;

  constructor(private cfg: Cfg) {}

  private onData(d: Buffer) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) break;
      const m = { type: String.fromCharCode(this.buf[0]), body: this.buf.subarray(5, len + 1) };
      this.buf = this.buf.subarray(len + 1);
      const w = this.waiters.shift();
      if (w) w(m); else this.inbox.push(m);
    }
  }
  private next(): Promise<{ type: string; body: Buffer }> {
    const m = this.inbox.shift();
    if (m) return Promise.resolve(m);
    return new Promise((res, rej) => {
      if (this.broken) return rej(new Error('Databaseverbinding verbroken'));
      this.waiters.push(res);
    });
  }

  async open() {
    this.sock = net.connect(this.cfg.port, this.cfg.host);
    this.sock.on('data', d => this.onData(d));
    this.sock.on('error', () => { this.broken = true; });
    this.sock.on('close', () => { this.broken = true; for (const w of this.waiters.splice(0)) w({ type: '!', body: Buffer.alloc(0) }); });
    await new Promise<void>((res, rej) => { this.sock.once('connect', res); this.sock.once('error', rej); });
    const params = Buffer.concat([i32(196608), cstr('user'), cstr(this.cfg.user), cstr('database'), cstr(this.cfg.database),
      cstr('client_encoding'), cstr('UTF8'), cstr('TimeZone'), cstr('UTC'), Buffer.from([0])]);
    this.sock.write(Buffer.concat([i32(params.length + 4), params]));
    for (;;) {
      const m = await this.next();
      if (m.type === 'R') {
        const code = m.body.readInt32BE(0);
        if (code === 0) continue;
        if (code === 3) this.sock.write(msg('p', cstr(this.cfg.password || '')));
        else if (code === 5) {
          const salt = m.body.subarray(4, 8);
          const inner = crypto.createHash('md5').update((this.cfg.password || '') + this.cfg.user).digest('hex');
          const outer = crypto.createHash('md5').update(Buffer.concat([Buffer.from(inner), salt])).digest('hex');
          this.sock.write(msg('p', cstr('md5' + outer)));
        } else throw new Error('Authenticatiemethode niet ondersteund door minimale client; installeer het pakket "pg".');
      } else if (m.type === 'E') throw new PgError(parseFields(m.body));
      else if (m.type === 'Z') return;
    }
  }

  query<T>(text: string, params: unknown[] = []): Promise<QueryResult<T>> {
    const run = async (): Promise<QueryResult<T>> => {
      const vals = params.map(serialize);
      const bind = [cstr(''), cstr(''), i16(0), i16(vals.length)];
      for (const v of vals) { if (v === null) bind.push(i32(-1)); else { const b = Buffer.from(v, 'utf8'); bind.push(i32(b.length), b); } }
      bind.push(i16(0));
      this.sock.write(Buffer.concat([
        msg('P', Buffer.concat([cstr(''), cstr(text), i16(0)])),
        msg('B', Buffer.concat(bind)),
        msg('D', Buffer.concat([Buffer.from('P'), cstr('')])),
        msg('E', Buffer.concat([cstr(''), i32(0)])),
        msg('S', Buffer.alloc(0)),
      ]));
      let fields: { name: string; oid: number }[] = [];
      const rows: any[] = []; let command = ''; let err: PgError | null = null;
      for (;;) {
        const m = await this.next();
        if (m.type === '!') throw new Error('Databaseverbinding verbroken');
        if (m.type === 'T') {
          const n = m.body.readInt16BE(0); let o = 2; fields = [];
          for (let i = 0; i < n; i++) {
            const end = m.body.indexOf(0, o); const name = m.body.toString('utf8', o, end); o = end + 1;
            const oid = m.body.readInt32BE(o + 6); o += 18; fields.push({ name, oid });
          }
        } else if (m.type === 'D') {
          const n = m.body.readInt16BE(0); let o = 2; const row: any = {};
          for (let i = 0; i < n; i++) {
            const len = m.body.readInt32BE(o); o += 4;
            if (len === -1) row[fields[i].name] = null;
            else { row[fields[i].name] = parseValue(fields[i].oid, m.body.toString('utf8', o, o + len)); o += len; }
          }
          rows.push(row);
        } else if (m.type === 'C') command = m.body.toString('utf8', 0, m.body.length - 1);
        else if (m.type === 'E') err = new PgError(parseFields(m.body));
        else if (m.type === 'Z') break;
      }
      if (err) throw err;
      const parts = command.split(' ');
      const rowCount = rows.length || Number(parts[parts.length - 1]) || 0;
      return { rows, rowCount, command: parts[0] };
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }
  close() { try { this.sock.write(msg('X', Buffer.alloc(0))); this.sock.end(); } catch { /* */ } }
}
function parseFields(b: Buffer) {
  const f: Record<string, string> = {}; let o = 0;
  while (o < b.length && b[o] !== 0) { const code = String.fromCharCode(b[o]); const end = b.indexOf(0, o + 1); f[code] = b.toString('utf8', o + 1, end); o = end + 1; }
  return f;
}

class MiniPool implements Pool {
  private idle: MiniConnection[] = []; private total = 0; private queue: ((c: MiniConnection) => void)[] = [];
  constructor(private cfg: Cfg, private max = 10) {}
  async connect(): Promise<Client> {
    let conn = this.idle.pop();
    while (conn && conn.broken) { this.total--; conn = this.idle.pop(); }
    if (!conn) {
      if (this.total < this.max) { this.total++; conn = new MiniConnection(this.cfg); try { await conn.open(); } catch (e) { this.total--; throw e; } }
      else conn = await new Promise<MiniConnection>(res => this.queue.push(res));
    }
    const c = conn; let released = false;
    return {
      query: (t, p) => c.query(t, p),
      release: () => {
        if (released) return; released = true;
        if (c.broken) { this.total--; return; }
        const w = this.queue.shift(); if (w) w(c); else this.idle.push(c);
      },
    };
  }
  async query<T>(text: string, params?: unknown[]) { const c = await this.connect(); try { return await c.query<T>(text, params); } finally { c.release(); } }
  async end() { for (const c of this.idle) c.close(); this.idle = []; }
}

export async function createPool(url: string, max = 10): Promise<Pool> {
  try {
    const mod: any = await import('pg' as string);
    const pg = mod.default || mod;
    for (const oid of [20]) pg.types.setTypeParser(oid, Number);
    const pool = new pg.Pool({ connectionString: url, max });
    pool.on('connect', (c: any) => c.query("set search_path = pickmyride, public; set timezone = 'UTC'"));
    return pool as Pool;
  } catch { /* geen pg-pakket: minimale client */ }
  const u = new URL(url);
  const cfg: Cfg = { host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1) };
  return new MiniPool(cfg, max);  // search_path is ingesteld op rolniveau (migratie 002)
}
