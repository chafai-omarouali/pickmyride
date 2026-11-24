import { type Actor, withActor, one, many, isUniqueViolation, isRlsViolation } from '../lib/db.ts';
import { calculateCommission, parseEuroToCents, formatEuro, type CommissionRule } from '../lib/money.ts';
import { amsterdamToUtc, formatDateTime, minutes } from '../lib/time.ts';
import { recordStatus } from '../lib/services.ts';
import { queueEmail } from '../lib/notify.ts';
import { config } from '../lib/config.ts';
import { HttpError } from '../lib/http.ts';
import { asSystem } from './context.ts';
import { seatTotal, describeSeats } from '../lib/seats.ts';

export const SERVICE_OPTIONS = [
  ['tol_parkeren', 'Parkeer- en tolkosten'],
  ['vluchtmonitoring', 'Vluchtmonitoring'],
  ['naambord', 'Ophalen met naambordje in aankomsthal'],
  ['bagagehulp', 'Hulp met bagage'],
  ['kinderzitje', 'Gevraagde kinderzitjes (soort en aantal)'],
] as const;

export interface BidInput { price: string; vehicle_category: string; max_passengers: string; max_large_bags: string; services: string[];
  wait_minutes: string; flight_delay_policy: string; cancellation_policy: string; valid_date: string; valid_time: string; note: string }
export type BidErrors = Partial<Record<keyof BidInput | 'form', string>>;

function requireCompany(actor: Actor) {
  if (actor.role !== 'company' || !actor.companyId) throw new HttpError(403, 'Alleen taxibedrijven hebben toegang tot deze functie.');
}

export async function activeCommissionRule(actor: Actor): Promise<CommissionRule> {
  return withActor(actor, async tx => {
    const r = await one<CommissionRule>(tx, 'select id, name, percent_bp, fixed_cents, min_cents, is_demo from commission_rules where active');
    if (!r) throw new HttpError(503, 'Er is geen actieve commissieregel ingesteld. Neem contact op met de beheerder.');
    return r;
  });
}

/** Aanvragen waarop dit bedrijf mag bieden en nog geen lopend bod heeft. Alleen niet-identificerende gegevens. */
export async function listAvailable(actor: Actor) {
  requireCompany(actor);
  return withActor(actor, tx => many(tx, `
    select r.id, r.leg, r.pickup_at, r.pickup_city, r.pickup_postcode4, r.pickup_country, r.dropoff_city, r.dropoff_postcode4, r.dropoff_country, r.stop_city, r.passengers, r.large_bags,
           r.small_bags, r.vehicle_category, vc.name_nl as category_name, r.seat_maxicosi, r.seat_kinderstoel, r.seat_verhoger, r.is_airport, r.bidding_closes_at
    from ride_requests r join vehicle_categories vc on vc.code = r.vehicle_category
    where company_can_bid($1, r.id)
      and not exists (select 1 from bids b where b.ride_request_id = r.id and b.company_id = $1 and b.status in ('actief','gereserveerd','geaccepteerd'))
    order by r.pickup_at`, [actor.companyId]));
}

export async function getRideForCompany(actor: Actor, rideId: string) {
  requireCompany(actor);
  return withActor(actor, async tx => {
    // RLS: alleen zichtbaar als het bedrijf mag bieden of al betrokken is.
    const ride = await one(tx, `select r.id, r.leg, r.status, r.pickup_at, r.pickup_city, r.pickup_postcode4, r.pickup_country, r.dropoff_city, r.dropoff_postcode4, r.dropoff_country, r.stop_city,
        r.passengers, r.large_bags, r.small_bags, r.vehicle_category, vc.name_nl as category_name, vc.sort_order as category_sort, r.seat_maxicosi, r.seat_kinderstoel, r.seat_verhoger, r.is_airport,
        r.notes_for_bidders, r.has_private_notes, r.distance_m, r.duration_s, r.route_source, r.bidding_closes_at, r.booking_cutoff_at,
        company_can_bid($2, r.id) as can_bid
      from ride_requests r join vehicle_categories vc on vc.code = r.vehicle_category where r.id = $1`, [rideId, actor.companyId]);
    if (!ride) throw new HttpError(404, 'Deze aanvraag bestaat niet of is niet beschikbaar voor uw bedrijf.');
    const bid = await one(tx, `select * from bids where ride_request_id = $1 and company_id = $2 order by created_at desc limit 1`, [rideId, actor.companyId]);
    const categories = await many(tx, `select vc.code, vc.name_nl, vc.sort_order, cvc.max_passengers, cvc.max_large_bags from company_vehicle_categories cvc
      join vehicle_categories vc on vc.code = cvc.category_code where cvc.company_id = $1 and vc.active order by vc.sort_order`, [actor.companyId]);
    return { ride, bid, categories };
  });
}

function validateBid(input: BidInput, ride: any, categories: any[], now = new Date()) {
  const e: BidErrors = {};
  const price = parseEuroToCents(input.price);
  if (price === null) e.price = 'Vul een geldige totaalprijs in, bijvoorbeeld 65,00.';
  else if (price < 500 || price > 500000) e.price = 'De totaalprijs moet tussen € 5 en € 5.000 liggen.';
  const cat = categories.find(c => c.code === input.vehicle_category);
  if (!cat) e.vehicle_category = 'Kies een voertuigcategorie die uw bedrijf aanbiedt.';
  else if (cat.sort_order < ride.category_sort) e.vehicle_category = `De klant vraagt minimaal een ${ride.category_name.toLowerCase()}.`;
  const pax = Number(input.max_passengers), bags = Number(input.max_large_bags), wait = Number(input.wait_minutes);
  if (!Number.isInteger(pax) || pax < ride.passengers) e.max_passengers = `Het voertuig moet plaats bieden aan minimaal ${ride.passengers} personen.`;
  else if (cat && pax > cat.max_passengers) e.max_passengers = `Volgens uw profiel biedt deze categorie maximaal ${cat.max_passengers} plaatsen.`;
  if (!Number.isInteger(bags) || bags < ride.large_bags) e.max_large_bags = `Er moet ruimte zijn voor minimaal ${ride.large_bags} grote koffers.`;
  if (!Number.isInteger(wait) || wait < 0 || wait > 240) e.wait_minutes = 'Vul de inbegrepen wachttijd in minuten in (0–240).';
  const fdp = String(input.flight_delay_policy || '').trim(), cp = String(input.cancellation_policy || '').trim();
  if (fdp.length < 5) e.flight_delay_policy = 'Beschrijf wat er gebeurt bij vluchtvertraging (bijv. "Wachttijd start pas bij landing, geen meerkosten").';
  if (cp.length < 5) e.cancellation_policy = 'Beschrijf de annuleringsvoorwaarden voor dit aanbod.';
  if (fdp.length > 400) e.flight_delay_policy = 'Maximaal 400 tekens.';
  if (cp.length > 400) e.cancellation_policy = 'Maximaal 400 tekens.';
  const note = String(input.note || '').trim();
  if (note.length > 500) e.note = 'Toelichting mag maximaal 500 tekens zijn.';
  if (/[\w.+-]+@[\w-]+\.\w+|(\+|00)?\d[\d\s-]{8,}\d/.test(note)) e.note = 'Zet geen contactgegevens in de toelichting; contact verloopt via het platform.';
  const vu = amsterdamToUtc(input.valid_date, input.valid_time);
  let validUntil: Date | null = null;
  if (!vu.ok) e.valid_date = vu.error;
  else if (vu.date.getTime() < now.getTime() + minutes(30)) e.valid_date = 'Het aanbod moet nog minimaal 30 minuten geldig zijn.';
  else if (vu.date > new Date(ride.booking_cutoff_at)) e.valid_date = `Het aanbod kan uiterlijk geldig zijn tot het laatste boekingsmoment (${formatDateTime(ride.booking_cutoff_at)}).`;
  else validUntil = vu.date;
  const services = (input.services || []).filter(s => SERVICE_OPTIONS.some(([k]) => k === s));
  if (seatTotal(ride) > 0 && !services.includes('kinderzitje')) e.form = `De klant vraagt kinderzitjes (${describeSeats(ride)}). Bevestig dat deze inbegrepen zijn door "Gevraagde kinderzitjes" aan te vinken, of bied niet op deze rit.`;
  return { e, price, validUntil, services, pax, bags, wait, fdp, cp, note };
}

export async function placeOrUpdateBid(actor: Actor, rideId: string, input: BidInput): Promise<{ errors?: BidErrors; bidId?: string }> {
  requireCompany(actor);
  const { ride, bid: existing, categories } = await getRideForCompany(actor, rideId);
  if (existing && existing.status === 'actief') return updateBid(actor, existing.id, input);
  if (!ride.can_bid) return { errors: { form: 'Op deze aanvraag kan niet (meer) worden geboden: de biedtermijn is verstreken, de aanvraag is gesloten of uw bedrijf komt er niet voor in aanmerking.' } };
  const v = validateBid(input, ride, categories);
  if (Object.keys(v.e).length) return { errors: v.e };
  const rule = await activeCommissionRule(actor);
  const { commissionCents, payoutCents } = calculateCommission(v.price!, rule);
  try {
    return await withActor(actor, async tx => {
      const b = await one(tx, `insert into bids (ride_request_id, company_id, total_price_cents, vehicle_category, max_passengers, max_large_bags, included_services,
          included_wait_minutes, flight_delay_policy, cancellation_policy, valid_until, note, commission_rule_id, commission_cents, payout_cents)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
        [rideId, actor.companyId, v.price, input.vehicle_category, v.pax, v.bags, v.services, v.wait, v.fdp, v.cp, v.validUntil, v.note || null, rule.id, commissionCents, payoutCents]);
      await recordStatus(tx, actor, 'bid', b.id, null, 'actief');
      await asSystem(tx, actor, async () => {
        const c = await one(tx, `select cc.contact_email, p.contact_name, g.id as group_id, r.pickup_city, r.dropoff_city, r.pickup_at
          from ride_request_private p join ride_request_contact cc on cc.ride_request_id = p.ride_request_id join ride_requests r on r.id = p.ride_request_id join request_groups g on g.id = r.group_id where r.id = $1`, [rideId]);
        await queueEmail(tx, `nieuw_aanbod:${b.id}`, c.contact_email, 'nieuw_aanbod', `Nieuw prijsvoorstel voor je rit ${c.pickup_city} → ${c.dropoff_city}`,
          `Hallo ${c.contact_name},\n\nEr is een nieuw aanbod van ${formatEuro(v.price!)} (totaalprijs) voor je rit op ${formatDateTime(c.pickup_at)}.\n\nVergelijk de aanbiedingen: ${config.baseUrl}/mijn/aanvragen/${c.group_id}`);
      });
      return { bidId: b.id };
    });
  } catch (err) {
    if (isUniqueViolation(err, 'bids_one_live_per_company')) return { errors: { form: 'Uw bedrijf heeft al een lopend bod op deze rit. Pas dat bod aan.' } };
    if (isRlsViolation(err)) return { errors: { form: 'Op deze aanvraag kan niet (meer) worden geboden.' } };
    throw err;
  }
}

export async function updateBid(actor: Actor, bidId: string, input: BidInput): Promise<{ errors?: BidErrors; bidId?: string }> {
  requireCompany(actor);
  const current = await withActor(actor, tx => one(tx, 'select * from bids where id = $1', [bidId]));
  if (!current) throw new HttpError(404, 'Bod niet gevonden.');
  const { ride, categories } = await getRideForCompany(actor, current.ride_request_id);
  if (current.status !== 'actief') return { errors: { form: 'Dit bod kan niet meer worden aangepast (status: ' + current.status + ').' } };
  if (!ride.can_bid) return { errors: { form: 'De biedtermijn is verstreken; het bod kan niet meer worden aangepast.' } };
  const v = validateBid(input, ride, categories);
  if (Object.keys(v.e).length) return { errors: v.e };
  const rule = await activeCommissionRule(actor);
  const { commissionCents, payoutCents } = calculateCommission(v.price!, rule);
  return withActor(actor, async tx => {
    const r = await tx.query(`update bids set total_price_cents=$2, vehicle_category=$3, max_passengers=$4, max_large_bags=$5, included_services=$6, included_wait_minutes=$7,
        flight_delay_policy=$8, cancellation_policy=$9, valid_until=$10, note=$11, commission_rule_id=$12, commission_cents=$13, payout_cents=$14, updated_at=now()
      where id = $1 and status = 'actief' and company_id = $15`,
      [bidId, v.price, input.vehicle_category, v.pax, v.bags, v.services, v.wait, v.fdp, v.cp, v.validUntil, v.note || null, rule.id, commissionCents, payoutCents, actor.companyId]);
    if (!r.rowCount) return { errors: { form: 'Het bod is inmiddels gereserveerd of gewijzigd en kan niet worden aangepast.' } };
    await recordStatus(tx, actor, 'bid', bidId, 'actief', 'actief', 'Bod aangepast');
    return { bidId };
  });
}

export async function withdrawBid(actor: Actor, bidId: string) {
  requireCompany(actor);
  return withActor(actor, async tx => {
    const r = await tx.query(`update bids set status = 'ingetrokken', updated_at = now() where id = $1 and status = 'actief' and company_id = $2`, [bidId, actor.companyId]);
    if (!r.rowCount) throw new HttpError(409, 'Dit bod kan niet meer worden ingetrokken (het is gereserveerd, geaccepteerd of al beëindigd).');
    await recordStatus(tx, actor, 'bid', bidId, 'actief', 'ingetrokken');
  });
}

export async function listOwnBids(actor: Actor) {
  requireCompany(actor);
  return withActor(actor, tx => many(tx, `select b.id, b.status, b.total_price_cents, b.payout_cents, b.commission_cents, b.valid_until, b.created_at,
      r.id as ride_id, r.pickup_at, r.pickup_city, r.dropoff_city, r.passengers
    from bids b join ride_requests r on r.id = b.ride_request_id where b.company_id = $1 order by b.created_at desc limit 200`, [actor.companyId]));
}
