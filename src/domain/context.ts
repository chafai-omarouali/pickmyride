import { type Actor, type Tx, SYSTEM } from '../lib/db.ts';

async function setCtx(tx: Tx, a: Actor) {
  await tx.query(`select set_config('app.user_id', $1, true), set_config('app.role', $2, true), set_config('app.company_id', $3, true)`,
    [a.userId || '', a.role, a.companyId || '']);
}
/**
 * Voert een afgebakende stap uit met systeemrechten binnen dezelfde transactie,
 * NADAT de autorisatie van de actor al is gecontroleerd (bijv. melding aan de klant na een bod).
 */
export async function asSystem<T>(tx: Tx, actor: Actor, fn: () => Promise<T>): Promise<T> {
  await setCtx(tx, { ...SYSTEM, userId: actor.userId });
  try { return await fn(); } finally { await setCtx(tx, actor); }
}
