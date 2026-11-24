/**
 * 24-uurs klantenservice: melden dat een rit niet (op tijd) doorgaat en vervangend vervoer regelen.
 * - Klant of uitvoerend bedrijf meldt; RLS controleert dat het hun eigen boeking is.
 * - De boeking gaat naar "probleem gemeld", de uitbetaling aan het oorspronkelijke bedrijf wordt geblokkeerd.
 * - Beheer (klantenservice) regelt een vervanger en legt eventuele extra kosten vast, met wie ze draagt.
 *   De klant betaalt nooit automatisch iets extra.
 */
import { type Actor, type Tx, SYSTEM, withActor, one, many, isUniqueViolation } from '../lib/db.ts';
import { audit, recordStatus, getSettings } from '../lib/services.ts';
import { queueEmail } from '../lib/notify.ts';
import { HttpError } from '../lib/http.ts';
import { formatDateTime, formatTime, amsterdamToUtc, toLocalInput } from '../lib/time.ts';
import { parseEuroToCents, formatEuro } from '../lib/money.ts';
import { config } from '../lib/config.ts';
import { asSystem } from './context.ts';
import { addSystemMessage } from './communication.ts';
import { canTransition, BOOKING_STATUS } from './status.ts';

export const REASONS: Record<string, { label: string; roles: string[] }> = {
  niet_verschenen:  { label: 'De taxi is niet gekomen', roles: ['customer'] },
  te_laat:          { label: 'De taxi is (erg) te laat', roles: ['customer'] },
  bedrijf_kan_niet: { label: 'Wij kunnen deze rit niet uitvoeren', roles: ['company'] },
  voertuig_defect:  { label: 'Voertuig defect of chauffeur uitgevallen', roles: ['company'] },
  overig:           { label: 'Ander probleem', roles: ['customer', 'company'] },
};
export const reasonLabel = (r: string) => REASONS[r]?.label || r;

export const CASE_LABELS: Record<string, string> = {
  gemeld: 'Gemeld', in_behandeling: 'In behandeling', vervanger_geregeld: 'Vervanger geregeld', afgerond: 'Afgerond', ongegrond: 'Gesloten zonder vervanging',
};
export const COST_BEARERS: Record<string, string> = { nog_te_bepalen: 'Nog te bepalen', platform: 'PickMyRide', oorspronkelijk_bedrijf: 'Oorspronkelijk taxibedrijf' };
const OPEN = ['gemeld', 'in_behandeling', 'vervanger_geregeld'];
const ACTIVE_BOOKING = ['bevestigd', 'chauffeur_toegewezen', 'onderweg', 'aangekomen', 'passagier_opgehaald'];

/** Wat mag deze deelnemer nu melden? Gebruikt door de pagina én door de server-controle. */
export function reportOptions(role: string, booking: { status: string; pickup_at: string | Date; contact_open: boolean }, noShowMinutes: number, now = new Date()) {
  if (!ACTIVE_BOOKING.includes(booking.status) || !booking.contact_open) return [];
  const pickup = new Date(booking.pickup_at).getTime();
  return Object.entries(REASONS).filter(([code, r]) => {
    if (!r.roles.includes(role)) return false;
    if (code === 'niet_verschenen') return now.getTime() >= pickup + noShowMinutes * 60_000;
    if (code === 'te_laat') return now.getTime() >= pickup;
    return true;
  }).map(([code, r]) => ({ code, label: r.label }));
}

async function adminEmails(tx: Tx): Promise<string[]> {
  return (await many(tx, `select email from users where role = 'admin' and email is not null`)).map(r => r.email);
}

/** Lopende of laatste melding bij een boeking, voor klant en bedrijf (RLS beperkt tot eigen boekingen). */
export async function caseForBooking(actor: Actor, bookingId: string) {
  return withActor(actor, async tx => {
    const c = await one(tx, `select rc.*, coalesce(rp.trade_name, rc.replacement_external_name) as replacement_name
      from replacement_cases rc left join companies rp on rp.id = rc.replacement_company_id
      where rc.booking_id = $1 order by rc.reported_at desc limit 1`, [bookingId]);
    // Naam van de vervanger: de klant mag die zien (bedrijven zijn onderling afgeschermd via RLS); het oorspronkelijke bedrijf niet.
    if (c?.replacement_company_id) c.replacement_name = actor.role === 'customer'
      ? (await asSystem(tx, actor, () => one(tx, 'select trade_name from companies where id = $1', [c.replacement_company_id])))?.trade_name
      : 'een andere vervoerder';
    const b = await one(tx, `select k.status, r.pickup_at, booking_contact_open(k.id) as contact_open from bookings k join ride_requests r on r.id = k.ride_request_id where k.id = $1`, [bookingId]);
    const s = (await getSettings(tx)) as any;
    const options = b && !(c && OPEN.includes(c.status)) ? reportOptions(actor.role, b, Number(s.no_show_report_minutes ?? 10)) : [];
    return { current: c, options, noShowMinutes: Number(s.no_show_report_minutes ?? 10) };
  });
}

export async function reportProblem(actor: Actor, bookingId: string, reason: string, details: string) {
  if (actor.role !== 'customer' && actor.role !== 'company') throw new HttpError(403, 'Alleen de klant of het uitvoerende taxibedrijf kan een melding doen.');
  details = (details || '').trim().slice(0, 1000);
  return withActor(actor, async tx => {
    const b = await one(tx, `select k.id, k.booking_number, k.status, k.company_id, k.customer_user_id, r.pickup_at, r.pickup_city, booking_contact_open(k.id) as contact_open
      from bookings k join ride_requests r on r.id = k.ride_request_id where k.id = $1`, [bookingId]);
    if (!b) throw new HttpError(404, 'Boeking niet gevonden.');
    const s = (await getSettings(tx)) as any;
    const allowed = reportOptions(actor.role, b, Number(s.no_show_report_minutes ?? 10));
    if (!allowed.some(o => o.code === reason)) {
      if (reason === 'niet_verschenen') throw new HttpError(409, `Je kunt dit melden vanaf ${s.no_show_report_minutes ?? 10} minuten na het afgesproken ophaalmoment. Bel of app eerder de klantenservice als je twijfelt.`);
      throw new HttpError(409, 'Voor deze boeking kun je deze melding nu niet doen.');
    }
    if (reason === 'overig' && details.length < 5) throw new HttpError(400, 'Beschrijf kort wat er aan de hand is.');
    let c;
    try {
      c = await one(tx, `insert into replacement_cases (booking_id, original_company_id, reported_by_user_id, reported_by_role, reason, details, is_demo)
        values ($1,$2,$3,$4,$5,$6,$7) returning id, case_number`, [b.id, b.company_id, actor.userId, actor.role, reason, details || null, config.demoMode]);
    } catch (e) {
      if (isUniqueViolation(e)) throw new HttpError(409, 'Er loopt al een melding voor deze rit. De klantenservice is ermee bezig.');
      throw e;
    }
    await asSystem(tx, actor, async () => {
      await tx.query('update replacement_cases set booking_status_before = $2 where id = $1', [c.id, b.status]);
      if (canTransition(BOOKING_STATUS, b.status, 'probleem_gemeld', 'admin')) {
        await tx.query(`update bookings set status = 'probleem_gemeld' where id = $1`, [b.id]);
        await recordStatus(tx, actor, 'booking', b.id, b.status, 'probleem_gemeld', `Melding ${c.case_number}: ${reasonLabel(reason)}`);
      }
      const po = await one(tx, `update payouts set status = 'geblokkeerd' where booking_id = $1 and status in ('nog_niet_beschikbaar','gepland') returning id`, [b.id]);
      if (po) await recordStatus(tx, SYSTEM, 'payout', po.id, null, 'geblokkeerd', `Geblokkeerd door melding ${c.case_number}`);
      const who = actor.role === 'customer' ? 'De klant' : 'Het taxibedrijf';
      await addSystemMessage(tx, b.id, `${who} heeft een probleem gemeld (${reasonLabel(reason)}). De klantenservice van PickMyRide is ingeschakeld en regelt zo nodig vervangend vervoer.`);
      await audit(tx, actor, 'vervangend_vervoer.gemeld', 'replacement_case', c.id, { booking_id: b.id, reden: reason });
      const contact = await one(tx, `select cc.contact_email from bookings k join ride_request_contact cc on cc.ride_request_id = k.ride_request_id where k.id = $1`, [b.id]);
      const comp = await one(tx, 'select email, trade_name from companies where id = $1', [b.company_id]);
      const link = `${config.baseUrl}/beheer/vervangend-vervoer/${c.id}`;
      for (const to of await adminEmails(tx))
        await queueEmail(tx, `vv:${c.id}:admin:${to}`, to, 'vervangend_vervoer', `SPOED ${c.case_number}: ${reasonLabel(reason)} — boeking ${b.booking_number}`,
          `Melding ${c.case_number} door ${who.toLowerCase()} van boeking ${b.booking_number}.\nReden: ${reasonLabel(reason)}\nOphaalmoment: ${formatDateTime(b.pickup_at)} in ${b.pickup_city}\n${details ? `Toelichting: ${details}\n` : ''}\nOpenen: ${link}`);
      if (contact?.contact_email)
        await queueEmail(tx, `vv:${c.id}:klant`, contact.contact_email, 'vervangend_vervoer', `We hebben je melding ontvangen — ${b.booking_number}`,
          `We hebben je melding ontvangen (${c.case_number}). Onze klantenservice gaat er direct mee aan de slag en regelt zo nodig vervangend vervoer. Je hoort zo snel mogelijk van ons.\n\nVolg de status: ${config.baseUrl}/mijn/boekingen/${b.id}`);
      if (actor.role === 'customer' && comp?.email)
        await queueEmail(tx, `vv:${c.id}:bedrijf`, comp.email, 'vervangend_vervoer', `Melding van de klant — boeking ${b.booking_number}`,
          `De klant van boeking ${b.booking_number} meldt: ${reasonLabel(reason)}. De klantenservice van PickMyRide neemt contact met u op. De uitbetaling voor deze rit staat tot afhandeling vast.`);
    });
    return c;
  });
}

// ───────── Beheer / klantenservice ─────────
function requireAdmin(actor: Actor) { if (actor.role !== 'admin') throw new HttpError(403, 'Alleen de klantenservice heeft toegang.'); }

export async function listCases(actor: Actor) {
  requireAdmin(actor);
  return withActor(actor, tx => many(tx, `select rc.*, k.booking_number, r.pickup_at, r.pickup_city, r.dropoff_city, c.trade_name as original_name,
      coalesce(rp.trade_name, rc.replacement_external_name) as replacement_name, u.full_name as handler_name
    from replacement_cases rc join bookings k on k.id = rc.booking_id join ride_requests r on r.id = k.ride_request_id
    join companies c on c.id = rc.original_company_id left join companies rp on rp.id = rc.replacement_company_id left join users u on u.id = rc.handled_by
    order by (rc.status in ('gemeld','in_behandeling')) desc, (rc.status = 'vervanger_geregeld') desc, rc.reported_at desc limit 300`));
}

export async function getCase(actor: Actor, id: string) {
  requireAdmin(actor);
  return withActor(actor, async tx => {
    const c = await one(tx, `select rc.*, coalesce(rp.trade_name, rc.replacement_external_name) as replacement_name, u.full_name as handler_name, ru.full_name as reporter_name
      from replacement_cases rc left join companies rp on rp.id = rc.replacement_company_id left join users u on u.id = rc.handled_by left join users ru on ru.id = rc.reported_by_user_id
      where rc.id = $1`, [id]);
    if (!c) throw new HttpError(404, 'Melding niet gevonden.');
    const booking = await one(tx, `select k.*, c.trade_name, c.phone as company_phone, r.pickup_at, r.pickup_city, r.dropoff_city, r.passengers, r.large_bags, r.small_bags,
        r.vehicle_category, r.pickup_area_id, r.dropoff_area_id, p.contact_name, p.pickup_address, p.dropoff_address, p.flight_number, cc.contact_phone, cc.contact_email
      from bookings k join companies c on c.id = k.company_id join ride_requests r on r.id = k.ride_request_id
      join ride_request_private p on p.ride_request_id = r.id left join ride_request_contact cc on cc.ride_request_id = r.id where k.id = $1`, [c.booking_id]);
    // Kandidaat-vervangers: actieve bedrijven met de gevraagde voertuigcategorie in het werkgebied; passende eerst.
    const candidates = await many(tx, `select c.id, c.trade_name, c.phone,
        exists (select 1 from company_service_areas csa join service_areas sa on sa.id = csa.service_area_id and sa.active
                where csa.company_id = c.id and (sa.code = 'landelijk' or csa.service_area_id in ($2, $3))) as in_area,
        exists (select 1 from company_vehicle_categories v where v.company_id = c.id and v.category_code = $4) as has_category
      from companies c where c.status = 'actief' and c.id <> $1
      order by in_area desc, has_category desc, c.trade_name`, [c.original_company_id, booking.pickup_area_id, booking.dropoff_area_id, booking.vehicle_category]);
    const history = await many(tx, `select a.*, u.full_name from audit_logs a left join users u on u.id = a.actor_user_id
      where a.entity_type = 'replacement_case' and a.entity_id = $1 order by a.created_at`, [id]);
    return { c, booking, candidates, history };
  });
}

async function lockOpen(tx: Tx, id: string) {
  const c = await one(tx, 'select * from replacement_cases where id = $1 for update', [id]);
  if (!c) throw new HttpError(404, 'Melding niet gevonden.');
  if (!OPEN.includes(c.status)) throw new HttpError(409, 'Deze melding is al gesloten.');
  return c;
}

export async function takeCase(actor: Actor, id: string) {
  requireAdmin(actor);
  await withActor(actor, async tx => {
    const c = await lockOpen(tx, id);
    if (c.status !== 'gemeld') throw new HttpError(409, 'Deze melding is al in behandeling.');
    await tx.query(`update replacement_cases set status = 'in_behandeling', handled_by = $2, taken_at = now() where id = $1`, [id, actor.userId]);
    await recordStatus(tx, actor, 'replacement_case', id, 'gemeld', 'in_behandeling');
    await audit(tx, actor, 'vervangend_vervoer.in_behandeling', 'replacement_case', id);
  });
}

export async function arrangeReplacement(actor: Actor, id: string, f: Record<string, string>) {
  requireAdmin(actor);
  const companyId = (f.replacement_company_id || '').trim() || null;
  const external = (f.replacement_external_name || '').trim().slice(0, 120) || null;
  if (!companyId && !external) throw new HttpError(400, 'Kies een vervoerder van het platform of vul de naam van een externe vervoerder in.');
  if (companyId && external) throw new HttpError(400, 'Kies óf een vervoerder van het platform óf een externe vervoerder.');
  let eta: Date | null = null;
  if (f.eta) {
    const res = amsterdamToUtc(f.eta_date || toLocalInput(new Date()).date, f.eta);
    if (!res.ok) throw new HttpError(400, `Verwachte aankomst: ${res.error}`);
    eta = res.date;
  }
  const extra = f.extra_cost ? parseEuroToCents(f.extra_cost) : 0;
  if (extra === null || extra < 0) throw new HttpError(400, 'Vul extra kosten in als bedrag, bijvoorbeeld 25,00 (of laat leeg).');
  const bearer = f.cost_bearer && COST_BEARERS[f.cost_bearer] ? f.cost_bearer : 'nog_te_bepalen';
  await withActor(actor, async tx => {
    const c = await lockOpen(tx, id);
    if (c.status === 'vervanger_geregeld') throw new HttpError(409, 'Er is al een vervanger vastgelegd. Sluit de melding af of neem contact op met de vervanger.');
    if (companyId) {
      const rc = await one(tx, `select trade_name from companies where id = $1 and status = 'actief'`, [companyId]);
      if (!rc) throw new HttpError(400, 'Deze vervoerder is niet (meer) actief.');
      if (companyId === c.original_company_id) throw new HttpError(400, 'De vervanger moet een ander bedrijf zijn.');
    }
    await tx.query(`update replacement_cases set status = 'vervanger_geregeld', replacement_company_id = $2, replacement_external_name = $3, replacement_eta = $4,
      extra_cost_cents = $5, cost_bearer = $6, handled_by = coalesce(handled_by, $7), taken_at = coalesce(taken_at, now()), arranged_at = now() where id = $1`,
      [id, companyId, external, eta, extra, bearer, actor.userId]);
    await recordStatus(tx, actor, 'replacement_case', id, c.status, 'vervanger_geregeld');
    const name = companyId ? (await one(tx, 'select trade_name from companies where id = $1', [companyId])).trade_name : external;
    const k = await one(tx, `select k.id, k.booking_number, cc.contact_email from bookings k left join ride_request_contact cc on cc.ride_request_id = k.ride_request_id where k.id = $1`, [c.booking_id]);
    const etaText = eta ? ` Verwachte aankomst: ${formatTime(eta)}.` : '';
    await addSystemMessage(tx, c.booking_id, `Vervangend vervoer is geregeld door de klantenservice: ${name}.${etaText} Je betaalt hiervoor niets extra.`);
    await audit(tx, actor, 'vervangend_vervoer.geregeld', 'replacement_case', id, { vervanger: name, extern: !!external, eta, extra_kosten_cent: extra, kosten_voor: bearer });
    if (k.contact_email)
      await queueEmail(tx, `vv:${id}:geregeld`, k.contact_email, 'vervangend_vervoer', `Vervangend vervoer geregeld — ${k.booking_number}`,
        `Goed nieuws: we hebben vervangend vervoer voor je geregeld.\nVervoerder: ${name}${eta ? `\nVerwachte aankomst: ${formatDateTime(eta)}` : ''}\nJe betaalt hiervoor niets extra.\n\nBekijk je boeking: ${config.baseUrl}/mijn/boekingen/${k.id}`);
  });
}

export async function closeCase(actor: Actor, id: string, outcome: string, resolution: string) {
  requireAdmin(actor);
  resolution = (resolution || '').trim().slice(0, 1000);
  if (resolution.length < 3) throw new HttpError(400, 'Geef een korte toelichting bij het sluiten.');
  if (outcome !== 'afgerond' && outcome !== 'ongegrond') throw new HttpError(400, 'Onbekende afhandeling.');
  await withActor(actor, async tx => {
    const c = await lockOpen(tx, id);
    if (outcome === 'afgerond' && c.status !== 'vervanger_geregeld') throw new HttpError(409, 'Leg eerst de vervanger vast, of sluit de melding zonder vervanging.');
    if (outcome === 'ongegrond' && c.status === 'vervanger_geregeld') throw new HttpError(409, 'Er is al een vervanger geregeld; rond de melding af.');
    await tx.query(`update replacement_cases set status = $2, resolution = $3, closed_at = now(), handled_by = coalesce(handled_by, $4) where id = $1`, [id, outcome, resolution, actor.userId]);
    await recordStatus(tx, actor, 'replacement_case', id, c.status, outcome, resolution);
    const k = await one(tx, 'select id, status from bookings where id = $1 for update', [c.booking_id]);
    if (k.status === 'probleem_gemeld') {
      // Afgerond: de rit is door de vervanger gereden. Ongegrond: terug naar de status van vóór de melding.
      const to = outcome === 'afgerond' ? 'afgerond' : (c.booking_status_before && canTransition(BOOKING_STATUS, 'probleem_gemeld', c.booking_status_before, 'admin') ? c.booking_status_before : 'bevestigd');
      await tx.query('update bookings set status = $2 where id = $1', [k.id, to]);
      await recordStatus(tx, actor, 'booking', k.id, 'probleem_gemeld', to, `Melding ${c.case_number} gesloten`);
    }
    if (outcome === 'ongegrond') {
      const po = await one(tx, `update payouts set status = 'nog_niet_beschikbaar' where booking_id = $1 and status = 'geblokkeerd' returning id`, [c.booking_id]);
      if (po) await recordStatus(tx, actor, 'payout', po.id, 'geblokkeerd', 'nog_niet_beschikbaar', `Melding ${c.case_number} ongegrond`);
      await addSystemMessage(tx, c.booking_id, 'De klantenservice heeft de melding gesloten; de rit gaat door met de oorspronkelijke vervoerder.');
    }
    await audit(tx, actor, `vervangend_vervoer.${outcome}`, 'replacement_case', id, { toelichting: resolution });
  });
}

export const formatCost = (c: { extra_cost_cents: number }) => c.extra_cost_cents ? formatEuro(c.extra_cost_cents) : '—';
