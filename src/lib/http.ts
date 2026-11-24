import type { IncomingMessage, ServerResponse } from 'node:http';
import { renderToString } from 'react-dom/server';
import type { ReactElement } from 'react';
import { config } from './config.ts';
import type { Actor } from './db.ts';
import { randomToken, safeEqual } from './security.ts';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export interface UploadedFile { field: string; filename: string; mimeType: string; data: Buffer }
export interface SessionUser { id: string; email: string; role: 'customer' | 'company' | 'admin'; full_name: string; company_id: string | null; company_status: string | null; company_name: string | null }

export interface Ctx {
  req: IncomingMessage; res: ServerResponse; url: URL; method: string; ip: string;
  params: Record<string, string>; query: URLSearchParams; cookies: Record<string, string>;
  body: Record<string, string>; bodyAll: URLSearchParams; files: UploadedFile[];
  user: SessionUser | null; actor: Actor; sessionId: string | null;
  csrfToken: string; support?: import('./support.ts').SupportInfo; flash: { type: 'ok' | 'fout' | 'info'; text: string; area?: string } | null;
  setFlash(type: 'ok' | 'fout' | 'info', text: string, area?: string): void;
  setCookie(name: string, value: string, opts?: { maxAge?: number; httpOnly?: boolean }): void;
}

export function parseCookies(h?: string) {
  const out: Record<string, string> = {};
  for (const part of (h || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
export function cookieHeader(name: string, value: string, opts: { maxAge?: number; httpOnly?: boolean } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (config.secureCookies) parts.push('Secure');
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join('; ');
}

const MAX_BODY = 12 * 1024 * 1024;
export async function readBody(req: IncomingMessage, limit = MAX_BODY): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > limit) throw new HttpError(413, 'Het verzonden bestand of formulier is te groot.'); chunks.push(c as Buffer); }
  return Buffer.concat(chunks);
}

/** Minimale multipart/form-data parser (geen externe afhankelijkheden). */
export function parseMultipart(buf: Buffer, contentType: string) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!m) throw new HttpError(400, 'Ongeldig formulier.');
  const boundary = Buffer.from('--' + (m[1] || m[2]));
  const fields = new URLSearchParams(); const files: UploadedFile[] = [];
  let pos = buf.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    const headerEnd = buf.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const headers = buf.slice(start + 2, headerEnd).toString('utf8');
    const next = buf.indexOf(boundary, headerEnd);
    if (next === -1) break;
    const data = buf.slice(headerEnd + 4, next - 2);
    const name = /name="([^"]*)"/i.exec(headers)?.[1] || '';
    const filename = /filename="([^"]*)"/i.exec(headers)?.[1];
    const type = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || 'application/octet-stream';
    if (filename !== undefined) { if (filename && data.length) files.push({ field: name, filename: filename.replace(/[^\w.\- ]/g, '_').slice(0, 120), mimeType: type, data }); }
    else fields.append(name, data.toString('utf8'));
    pos = next;
  }
  return { fields, files };
}

export function html(ctx: Ctx, el: ReactElement, status = 200, opts: { noindex?: boolean } = {}) {
  const body = '<!DOCTYPE html>' + renderToString(el);
  const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' };
  if (opts.noindex) headers['X-Robots-Tag'] = 'noindex, nofollow';
  ctx.res.writeHead(status, headers); ctx.res.end(body);
}
export function redirect(ctx: Ctx, location: string, status = 303) { ctx.res.writeHead(status, { Location: location }); ctx.res.end(); }
export function json(ctx: Ctx, data: unknown, status = 200) { ctx.res.writeHead(status, { 'Content-Type': 'application/json' }); ctx.res.end(JSON.stringify(data)); }
export function text(ctx: Ctx, body: string, status = 200, type = 'text/plain; charset=utf-8') { ctx.res.writeHead(status, { 'Content-Type': type }); ctx.res.end(body); }

export function ensureCsrf(ctx: Ctx) {
  const token = ctx.cookies.rb_csrf;
  const sent = ctx.body._csrf || '';
  if (!token || !sent || !safeEqual(token, sent)) throw new HttpError(403, 'Je sessie is verlopen of het formulier is ongeldig. Laad de pagina opnieuw en probeer het nog eens.');
}
export const newCsrf = () => randomToken(24);

// ───────── Router ─────────
type Handler = (ctx: Ctx) => Promise<void>;
interface Route { method: string; re: RegExp; keys: string[]; handler: Handler }
export class Router {
  routes: Route[] = [];
  add(method: string, path: string, handler: Handler) {
    const keys: string[] = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler });
  }
  get(p: string, h: Handler) { this.add('GET', p, h); }
  post(p: string, h: Handler) { this.add('POST', p, h); }
  match(method: string, path: string) {
    for (const r of this.routes) {
      if (r.method !== method && !(method === 'HEAD' && r.method === 'GET')) continue;
      const m = r.re.exec(path);
      if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
}

// ───────── Formulierhulpen ─────────
export const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const int = (v: unknown, def = 0) => { const n = Number(v); return Number.isInteger(n) ? n : def; };

/** Voegt tijdkiezers (naam__h + naam__m) samen tot naam = "uu:mm" (leeg als één deel ontbreekt). */
export function mergeTimeFields(params: URLSearchParams) {
  for (const key of [...params.keys()]) {
    if (!key.endsWith('__h')) continue;
    const base = key.slice(0, -3), h = params.get(key) || '', m = params.get(base + '__m') || '';
    params.set(base, /^\d{2}$/.test(h) && /^\d{2}$/.test(m) ? `${h}:${m}` : '');
  }
}
