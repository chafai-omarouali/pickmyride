import { type Actor, type Tx, SYSTEM, ANON, withActor, one } from './db.ts';
import { randomToken, sha256 } from './security.ts';
import type { SessionUser } from './http.ts';

const SESSION_DAYS = 14;

export async function createSession(userId: string, ip: string, userAgent: string): Promise<string> {
  const token = randomToken(32);
  await withActor(SYSTEM, tx => tx.query(
    `insert into sessions (token_hash, user_id, expires_at, ip, user_agent) values ($1,$2, now() + interval '${SESSION_DAYS} days', $3, $4)`,
    [sha256(token), userId, ip, userAgent.slice(0, 300)]));
  return token;
}

export async function loadSession(token: string | undefined): Promise<{ user: SessionUser; sessionId: string } | null> {
  if (!token || token.length > 100) return null;
  return withActor(SYSTEM, async tx => {
    const row = await one(tx, `
      select s.id as session_id, u.id, u.email, u.role, u.full_name,
             m.company_id, c.status as company_status, c.trade_name as company_name
      from sessions s join users u on u.id = s.user_id
      left join company_memberships m on m.user_id = u.id
      left join companies c on c.id = m.company_id
      where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.disabled_at is null`, [sha256(token)]);
    if (!row) return null;
    const { session_id, ...user } = row;
    return { user: user as SessionUser, sessionId: session_id };
  });
}

export async function revokeSession(sessionId: string) {
  await withActor(SYSTEM, tx => tx.query('update sessions set revoked_at = now() where id = $1', [sessionId]));
}

export function actorFor(user: SessionUser | null, ip: string): Actor {
  if (!user) return { ...ANON, ip };
  // Een bedrijfsaccount krijgt alleen bedrijfsrechten als het bedrijf actief is; anders beperkte toegang.
  return { userId: user.id, role: user.role, companyId: user.role === 'company' ? user.company_id : null, ip };
}

/** Eenmalige inloglink (bijv. voor gasten die zonder wachtwoord een aanvraag plaatsten). Geldig 48 uur. */
export async function createLoginLink(tx: Tx, userId: string, purpose: 'login_link' | 'request_access', requestGroupId?: string) {
  const token = randomToken(32);
  await tx.query(`insert into access_tokens (token_hash, user_id, purpose, request_group_id, expires_at) values ($1,$2,$3,$4, now() + interval '48 hours')`,
    [sha256(token), userId, purpose, requestGroupId || null]);
  return token;
}

/** Wisselt een link in. Markeert het e-mailadres als bevestigd en opent eventuele concept-aanvragen. */
export async function redeemLoginLink(token: string): Promise<{ userId: string; requestGroupId: string | null } | null> {
  if (!token || token.length > 100) return null;
  return withActor(SYSTEM, async tx => {
    const row = await one(tx, `update access_tokens set used_at = now()
      where token_hash = $1 and used_at is null and expires_at > now() returning user_id, request_group_id`, [sha256(token)]);
    if (!row) return null;
    await tx.query('update users set email_verified_at = coalesce(email_verified_at, now()) where id = $1', [row.user_id]);
    return { userId: row.user_id, requestGroupId: row.request_group_id };
  });
}
