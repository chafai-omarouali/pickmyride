/** Kleine gedeelde diensten: instellingen, audit, statusgeschiedenis, rate limiting, foutregistratie. */
import { type Actor, type Tx, SYSTEM, withActor, one, many } from './db.ts';

// ───────── Instellingen ─────────
export interface Settings {
  min_lead_hours: number; bidding_window_hours: number; booking_cutoff_hours: number; min_bidding_window_hours: number;
  reservation_minutes: number; max_offers_shown: number; terms_version: string; partner_agreement_version: string; vat_note: string;
}
export async function getSettings(tx?: Tx): Promise<Settings> {
  const run = async (t: Tx) => Object.fromEntries((await many(t, 'select key, value from platform_settings')).map(r => [r.key, r.value])) as Settings;
  return tx ? run(tx) : withActor(SYSTEM, run);
}

// ───────── Audit ─────────
export async function audit(tx: Tx, actor: Actor, action: string, entityType: string | null, entityId: string | null, details: Record<string, unknown> = {}) {
  await tx.query('insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details, ip) values ($1,$2,$3,$4,$5,$6,$7)',
    [actor.userId, actor.role, action, entityType, entityId, details, actor.ip || null]);
}

export async function recordStatus(tx: Tx, actor: Actor, entityType: string, entityId: string, from: string | null, to: string, note?: string) {
  await tx.query('insert into status_history (entity_type, entity_id, from_status, to_status, actor_user_id, actor_role, note) values ($1,$2,$3,$4,$5,$6,$7)',
    [entityType, entityId, from, to, actor.userId, actor.role, note || null]);
}

// ───────── Rate limiting (per vast tijdvenster, opgeslagen in de database zodat het ook met meerdere servers werkt) ─────────
export async function rateLimit(bucket: string, max: number, windowSeconds: number): Promise<boolean> {
  return withActor(SYSTEM, async tx => {
    const r = await one<{ hits: number }>(tx, `
      insert into rate_limits (bucket, window_start, hits)
      values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
      on conflict (bucket, window_start) do update set hits = rate_limits.hits + 1
      returning hits`, [bucket, windowSeconds]);
    return (r?.hits ?? 0) <= max;
  });
}

// ───────── Gestructureerde foutregistratie ─────────
export async function logError(message: string, context: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level: 'error', time: new Date().toISOString(), message, ...context });
  console.error(line);
  try { await withActor(SYSTEM, tx => tx.query('insert into error_log (level, message, context) values ($1,$2,$3)', ['error', message.slice(0, 1000), context])); }
  catch { /* database niet bereikbaar: alleen stdout */ }
}
export function logInfo(message: string, context: Record<string, unknown> = {}) {
  if (process.env.APP_ENV !== 'test') console.log(JSON.stringify({ level: 'info', time: new Date().toISOString(), message, ...context }));
}
