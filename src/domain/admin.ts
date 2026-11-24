import { type Actor, withActor, one, many } from '../lib/db.ts';
import { audit } from '../lib/services.ts';
import { parseEuroToCents } from '../lib/money.ts';
import { HttpError } from '../lib/http.ts';
import { invalidateSupportCache } from '../lib/support.ts';
import { toE164 } from '../integrations/calls/index.ts';

function requireAdmin(actor: Actor) { if (actor.role !== 'admin') throw new HttpError(403, 'Alleen beheerders hebben toegang.'); }

export async function dashboardCounts(actor: Actor) {
  requireAdmin(actor);
  return withActor(actor, tx => one(tx, `select
    (select count(*) from ride_requests where created_at > now() - interval '24 hours')::int as nieuwe_aanvragen,
    (select count(*) from ride_requests r where r.status = 'open' and not exists (select 1 from bids b where b.ride_request_id = r.id and b.status in ('actief','gereserveerd')))::int as zonder_aanbod,
    (select count(*) from bids where status = 'actief' and valid_until > now())::int as open_biedingen,
    (select count(*) from bookings where status not in ('geannuleerd','afgerond'))::int as bevestigde_boekingen,
    (select count(*) from bookings k join ride_requests r on r.id = k.ride_request_id where k.status not in ('geannuleerd','afgerond') and r.pickup_at between now() and now() + interval '48 hours')::int as komende_ritten,
    (select count(*) from bookings where status = 'probleem_gemeld')::int as probleemritten,
    (select count(*) from replacement_cases where status in ('gemeld','in_behandeling'))::int as spoedmeldingen,
    (select count(*) from bookings where status = 'geannuleerd')::int as annuleringen,
    (select count(*) from payments where status = 'geslaagd')::int as betalingen,
    (select count(*) from payments where needs_attention is not null)::int as betalingen_aandacht,
    (select count(*) from refunds where status = 'aangevraagd')::int as terugbetalingen_open,
    (select count(*) from companies where status = 'in_beoordeling')::int as te_beoordelen,
    (select count(*) from company_documents where expires_on is not null and expires_on < current_date + 30)::int as documenten_verlopen`));
}

export async function listRequestsAdmin(actor: Actor) {
  requireAdmin(actor);
  return withActor(actor, tx => many(tx, `select r.id, r.leg, r.status, r.pickup_at, r.pickup_city, r.dropoff_city, r.passengers, g.public_ref, g.is_demo,
      (select count(*) from bids b where b.ride_request_id = r.id)::int as bids, k.booking_number, k.id as booking_id
    from ride_requests r join request_groups g on g.id = r.group_id left join bookings k on k.ride_request_id = r.id
    order by r.pickup_at desc limit 300`));
}

export async function getRequestAdmin(actor: Actor, rideId: string) {
  requireAdmin(actor);
  return withActor(actor, async tx => {
    const ride = await one(tx, `select r.*, g.public_ref, p.*, cc.contact_email, cc.contact_phone from ride_requests r join request_groups g on g.id = r.group_id join ride_request_private p on p.ride_request_id = r.id left join ride_request_contact cc on cc.ride_request_id = r.id where r.id = $1`, [rideId]);
    if (!ride) throw new HttpError(404, 'Aanvraag niet gevonden.');
    const bids = await many(tx, `select b.*, c.trade_name from bids b join companies c on c.id = b.company_id where b.ride_request_id = $1 order by b.total_price_cents`, [rideId]);
    const history = await many(tx, `select * from status_history where entity_id = $1 or entity_id in (select id from bids where ride_request_id = $1) order by created_at`, [rideId]);
    return { ride, bids, history };
  });
}

export async function getAuditLog(actor: Actor, limit = 200) {
  requireAdmin(actor);
  return withActor(actor, tx => many(tx, `select a.*, u.full_name from audit_logs a left join users u on u.id = a.actor_user_id order by a.created_at desc limit $1`, [limit]));
}

export async function getSettingsAdmin(actor: Actor) {
  requireAdmin(actor);
  return withActor(actor, async tx => ({
    settings: await many(tx, 'select * from platform_settings order by key'),
    rules: await many(tx, 'select * from commission_rules order by created_at desc'),
  }));
}

const NUMERIC_LIMITS: Record<string, [number, number]> = {
  min_lead_hours: [1, 720], bidding_window_hours: [1, 336], booking_cutoff_hours: [0, 72], min_bidding_window_hours: [0, 48],
  reservation_minutes: [3, 60], max_offers_shown: [1, 10], contact_hours_after_ride: [0, 168], calls_per_hour_limit: [1, 100],
  replacement_guarantee: [0, 1], no_show_report_minutes: [0, 120],
};

export async function updateSetting(actor: Actor, key: string, rawValue: string) {
  requireAdmin(actor);
  await withActor(actor, async tx => {
    const cur = await one(tx, 'select value from platform_settings where key = $1 for update', [key]);
    if (!cur) throw new HttpError(404, 'Onbekende instelling.');
    let value: unknown;
    if (key in NUMERIC_LIMITS) {
      const n = Number(rawValue); const [min, max] = NUMERIC_LIMITS[key];
      if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `Waarde moet een geheel getal tussen ${min} en ${max} zijn.`);
      value = n;
    } else if (key === 'support_phone' || key === 'support_whatsapp') {
      const v = String(rawValue).trim();
      if (v && !toE164(v)) throw new HttpError(400, 'Vul een geldig telefoonnummer in, bijvoorbeeld +31 20 123 4567, of laat het veld leeg.');
      value = v.slice(0, 30);
    } else value = String(rawValue).trim().slice(0, 300);
    await tx.query('update platform_settings set value = $2, updated_by = $3, updated_at = now() where key = $1', [key, JSON.stringify(value), actor.userId]);
    await audit(tx, actor, 'instelling.gewijzigd', 'platform_setting', key, { van: cur.value, naar: value });
  });
  invalidateSupportCache();
}

/** Nieuwe commissieregel activeren. Bestaande boekingen houden hun vastgelegde regel (snapshot). */
export async function createCommissionRule(actor: Actor, f: URLSearchParams) {
  requireAdmin(actor);
  const name = (f.get('name') || '').trim().slice(0, 80);
  const pct = Number(String(f.get('percent') || '').replace(',', '.'));
  const fixed = parseEuroToCents(f.get('fixed') || '0'), min = parseEuroToCents(f.get('min') || '0');
  if (name.length < 2 || !Number.isFinite(pct) || pct < 0 || pct > 50 || fixed === null || min === null) throw new HttpError(400, 'Vul een naam, een percentage (0–50) en geldige bedragen in.');
  const bp = Math.round(pct * 100);
  await withActor(actor, async tx => {
    const old = await one(tx, 'update commission_rules set active = false where active returning id, name, percent_bp');
    const r = await one(tx, `insert into commission_rules (name, percent_bp, fixed_cents, min_cents, is_demo, active, created_by) values ($1,$2,$3,$4,$5,true,$6) returning id`,
      [name, bp, fixed, min, f.get('is_demo') === 'ja', actor.userId]);
    await audit(tx, actor, 'commissie.gewijzigd', 'commission_rule', r.id, { vorige: old, nieuw: { name, percent_bp: bp, fixed_cents: fixed, min_cents: min } });
  });
}

export async function exportCsv(actor: Actor, kind: 'boekingen' | 'aanvragen'): Promise<string> {
  requireAdmin(actor);
  const rows = await withActor(actor, tx => kind === 'boekingen'
    ? many(tx, `select k.booking_number, k.status, r.pickup_at, r.pickup_city, r.dropoff_city, c.trade_name, k.total_price_cents, k.commission_cents, k.payout_cents, p.status as betaalstatus, p.is_simulated as gesimuleerd, k.is_demo
                from bookings k join ride_requests r on r.id = k.ride_request_id join companies c on c.id = k.company_id left join payments p on p.booking_id = k.id order by r.pickup_at`)
    : many(tx, `select g.public_ref, r.leg, r.status, r.pickup_at, r.pickup_city, r.dropoff_city, r.passengers, r.vehicle_category, (select count(*) from bids b where b.ride_request_id = r.id) as biedingen, g.is_demo
                from ride_requests r join request_groups g on g.id = r.group_id order by r.pickup_at`));
  await withActor(actor, tx => audit(tx, actor, 'export.csv', null, kind, { rijen: rows.length }));
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { let s = v instanceof Date ? v.toISOString() : v === null ? '' : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(';'), ...rows.map(r => cols.map(c => esc(r[c])).join(';'))].join('\n');
}
