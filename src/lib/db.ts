import { createPool, type Client, type Pool, PgError } from './pg.ts';
import { config } from './config.ts';

export type Role = 'anon' | 'customer' | 'company' | 'admin' | 'system';
export interface Actor { userId: string | null; role: Role; companyId: string | null; ip?: string }

export const SYSTEM: Actor = { userId: null, role: 'system', companyId: null };
export const ANON: Actor = { userId: null, role: 'anon', companyId: null };

let pool: Pool | null = null;
export async function getPool() { if (!pool) pool = await createPool(config.databaseUrl, 15); return pool; }
export async function closePool() { if (pool) { await pool.end(); pool = null; } }

export type Tx = Pick<Client, 'query'>;

/**
 * Voert fn uit in één transactie met de autorisatiecontext van de actor.
 * De database-policies (RLS) lezen deze context; zo wordt toegang óók in de database afgedwongen.
 */
export async function withActor<T>(actor: Actor, fn: (tx: Tx) => Promise<T>, opts: { serializable?: boolean } = {}): Promise<T> {
  const p = await getPool();
  const c = await p.connect();
  try {
    await c.query(opts.serializable ? 'begin isolation level serializable' : 'begin');
    await c.query(`select set_config('app.user_id', $1, true), set_config('app.role', $2, true), set_config('app.company_id', $3, true)`,
      [actor.userId || '', actor.role, actor.companyId || '']);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    try { await c.query('rollback'); } catch { /* verbinding stuk */ }
    throw e;
  } finally { c.release(); }
}

export const one = async <T = any>(tx: Tx, sql: string, params: unknown[] = []): Promise<T | null> => (await tx.query<T>(sql, params)).rows[0] ?? null;
export const many = async <T = any>(tx: Tx, sql: string, params: unknown[] = []): Promise<T[]> => (await tx.query<T>(sql, params)).rows;

export function isUniqueViolation(e: unknown, constraint?: string) {
  return e instanceof PgError && e.code === '23505' && (!constraint || e.constraint === constraint);
}
export function isRlsViolation(e: unknown) { return e instanceof PgError && e.code === '42501'; }
export { PgError };
