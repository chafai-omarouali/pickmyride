import { type Actor, type Tx, SYSTEM, withActor, one, many } from '../lib/db.ts';
import { publicPhotosFor } from './photos.ts';
import { amsterdamToUtc, formatDateTime, hours } from '../lib/time.ts';
import { getSettings, recordStatus, audit, type Settings } from '../lib/services.ts';
import { queueEmail } from '../lib/notify.ts';
import { createLoginLink } from '../lib/auth.ts';
import { scrubPersonalData } from '../lib/security.ts';
import { config } from '../lib/config.ts';
import { HttpError } from '../lib/http.ts';
import { asSystem } from './context.ts';
import { isAirportPostcode } from '../lib/airports.ts';
import { isCountry, normForeignPostcode, postalExample, countryName, isForeignAirportPostcode, type Country } from '../lib/abroad.ts';
import { SEAT_TYPES } from '../lib/seats.ts';

export interface RequestInput {
  trip_type: string;
  pickup_street: string; pickup_postcode: string; pickup_city: string; pickup_country: string;
  dropoff_street: string; dropoff_postcode: string; dropoff_city: string; dropoff_country: string;
  stop_street: string; stop_postcode: string; stop_city: string;
  date: string; time: string; return_date: string; return_time: string;
  flight_number: string; return_flight_number: string;
  passengers: string; large_bags: string; small_bags: string; vehicle_category: string; need_seats: string; seat_maxicosi: string; seat_kinderstoel: string; seat_verhoger: string; notes: string;
  name: string; email: string; phone: string; accept_terms: string; marketing: string;
}
export type FieldErrors = Partial<Record<keyof RequestInput | 'form', string>>;

export const FIELDS: (keyof RequestInput)[] = ['trip_type', 'pickup_street', 'pickup_postcode', 'pickup_city', 'pickup_country', 'dropoff_street', 'dropoff_postcode', 'dropoff_city', 'dropoff_country',
  'stop_street', 'stop_postcode', 'stop_city', 'date', 'time', 'return_date', 'return_time', 'flight_number', 'return_flight_number',
  'passengers', 'large_bags', 'small_bags', 'vehicle_category', 'need_seats', 'seat_maxicosi', 'seat_kinderstoel', 'seat_verhoger', 'notes', 'name', 'email', 'phone', 'accept_terms', 'marketing'];

const POSTCODE = /^([1-9]\d{3})\s?([A-Za-z]{2})$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-zA-Z]{2,}$/;
const PHONE = /^(\+|00)?[0-9][0-9\s\-()]{7,18}$/;
const FLIGHT = /^[A-Za-z0-9]{2}\s?\d{1,4}[A-Za-z]?$/;

const normPostcode = (p: string) => { const m = POSTCODE.exec(p.trim()); return m ? `${m[1]} ${m[2].toUpperCase()}` : null; };

interface ValidLeg { leg: 'heen' | 'terug'; pickupAt: Date; from: Addr; to: Addr; stop: Addr | null; flight: string | null }
interface Addr { street: string; postcode: string; pc4: number | null; city: string; country: Country; full: string }

export async function validateRequest(raw: Partial<RequestInput>, now = new Date()): Promise<{ errors: FieldErrors; legs?: ValidLeg[]; settings?: Settings; cat?: any }> {
  const v = (k: keyof RequestInput, max = 200) => String(raw[k] ?? '').trim().slice(0, max);
  const e: FieldErrors = {};
  const settings = await getSettings();
  const tripType = v('trip_type') === 'retour' ? 'retour' : v('trip_type') === 'enkel' ? 'enkel' : '';
  if (!tripType) e.trip_type = 'Kies enkele reis of retour.';

  const addr = (prefix: 'pickup' | 'dropoff' | 'stop', label: string, required: boolean): Addr | null => {
    const street = v(`${prefix}_street` as keyof RequestInput, 150), pcRaw = v(`${prefix}_postcode` as keyof RequestInput, 10), city = v(`${prefix}_city` as keyof RequestInput, 80);
    if (!required && !street && !pcRaw && !city) return null;
    const cRaw = prefix === 'stop' ? 'NL' : (v(`${prefix}_country` as keyof RequestInput, 2).toUpperCase() || 'NL');
    if (!isCountry(cRaw)) { e[`${prefix}_country` as keyof RequestInput] = 'Kies een land uit de lijst.'; return null; }
    const country = cRaw;
    if (country !== 'NL') {
      // Buitenland: geen huisnummerplicht (luchthavens en grote locaties hebben vaak geen nummer)
      if (!street) e[`${prefix}_street` as keyof RequestInput] = `Vul het adres in voor ${label}.`;
      const pc = normForeignPostcode(country, pcRaw);
      if (!pc) e[`${prefix}_postcode` as keyof RequestInput] = `Vul een geldige postcode in ${countryName(country)} in (bijv. ${postalExample(country)}).`;
      if (!city) e[`${prefix}_city` as keyof RequestInput] = `Vul de plaats in voor ${label}.`;
      if (!street || !pc || !city) return null;
      return { street, postcode: pc, pc4: null, city, country, full: `${street}, ${pc} ${city}, ${countryName(country)}` };
    }
    if (!street) e[`${prefix}_street` as keyof RequestInput] = `Vul straat en huisnummer in voor ${label}.`;
    else if (!/\d/.test(street)) e[`${prefix}_street` as keyof RequestInput] = 'Vul ook een huisnummer in.';
    const pc = normPostcode(pcRaw);
    if (!pc) e[`${prefix}_postcode` as keyof RequestInput] = 'Vul een geldige Nederlandse postcode in (bijv. 1012 AB).';
    if (!city) e[`${prefix}_city` as keyof RequestInput] = `Vul de plaats in voor ${label}.`;
    if (!street || !pc || !city) return null;
    return { street, postcode: pc, pc4: Number(pc.slice(0, 4)), city, country, full: `${street}, ${pc} ${city}` };
  };
  const from = addr('pickup', 'het vertrekadres', true);
  const to = addr('dropoff', 'de bestemming', true);
  const stop = addr('stop', 'de tussenstop', false);
  if (from && to && from.postcode === to.postcode && from.street.toLowerCase().replace(/\s+/g, '') === to.street.toLowerCase().replace(/\s+/g, ''))
    e.dropoff_street = 'Vertrekadres en bestemming mogen niet gelijk zijn.';
  if (from && to && from.country !== 'NL' && to.country !== 'NL')
    e.dropoff_country = 'Vertrek of bestemming moet in Nederland liggen. Ritten tussen twee plaatsen in het buitenland zijn niet mogelijk.';

  // Reizigers en voertuig
  const pax = Number(v('passengers')), large = Number(v('large_bags') || 0), small = Number(v('small_bags') || 0);
  if (!Number.isInteger(pax) || pax < 1) e.passengers = 'Vul het aantal personen in (minimaal 1).';
  if (!Number.isInteger(large) || large < 0 || large > 30) e.large_bags = 'Vul een geldig aantal grote koffers in.';
  if (!Number.isInteger(small) || small < 0 || small > 30) e.small_bags = 'Vul een geldig aantal kleine koffers in.';
  const needSeats = v('need_seats') === 'ja';
  let seats = 0;
  for (const [k, name] of SEAT_TYPES) {
    const n = needSeats ? Number(v(k) || 0) : 0;
    if (!Number.isInteger(n) || n < 0 || n > 3) e[k] = `Kies 0 tot 3 voor ${name}.`;
    else seats += n;
  }
  if (needSeats && seats === 0) e.seat_maxicosi = 'Kies minimaal één kinderzitje, of zet "Ik heb kinderzitjes nodig" uit.';
  const cat = await withActor(SYSTEM, tx => one(tx, 'select * from vehicle_categories where code = $1 and active', [v('vehicle_category')]));
  if (!cat) e.vehicle_category = 'Kies een voertuigcategorie.';
  else {
    if (!e.passengers && pax > cat.max_passengers) e.vehicle_category = `Een ${cat.name_nl.toLowerCase()} biedt plaats aan maximaal ${cat.max_passengers} personen. Kies een groter voertuig.`;
    if (!e.large_bags && !e.vehicle_category && large > cat.max_large_bags) e.vehicle_category = `In een ${cat.name_nl.toLowerCase()} passen maximaal ${cat.max_large_bags} grote koffers. Kies een groter voertuig.`;
    if (!e.small_bags && !e.vehicle_category && cat.max_small_bags != null && small > cat.max_small_bags) e.vehicle_category = `In een ${cat.name_nl.toLowerCase()} passen maximaal ${cat.max_large_bags} grote en ${cat.max_small_bags} kleine koffers. Kies een groter voertuig.`;
  }
  if (!e.passengers && seats > pax) e.seat_maxicosi = 'Er kunnen niet meer kinderzitjes zijn dan personen.';

  // Tijden (Europe/Amsterdam)
  const legs: ValidLeg[] = [];
  const earliest = new Date(now.getTime() + hours(settings.min_lead_hours));
  const out = amsterdamToUtc(v('date'), v('time'));
  if (!out.ok) e.date = out.error;
  else if (out.date < earliest) e.date = `Een rit moet minimaal ${settings.min_lead_hours} uur van tevoren worden aangevraagd.`;
  const flight = v('flight_number', 10).toUpperCase();
  if (flight && !FLIGHT.test(flight)) e.flight_number = 'Vul een geldig vluchtnummer in (bijv. KL1234) of laat het veld leeg.';
  if (out.ok && from && to) legs.push({ leg: 'heen', pickupAt: out.date, from, to, stop, flight: flight || null });

  if (tripType === 'retour') {
    const back = amsterdamToUtc(v('return_date'), v('return_time'));
    const rf = v('return_flight_number', 10).toUpperCase();
    if (!back.ok) e.return_date = back.error;
    else if (out.ok && back.date <= out.date) e.return_date = 'De terugrit moet na de heenrit plaatsvinden.';
    else if (back.date < earliest) e.return_date = `Ook de terugrit moet minimaal ${settings.min_lead_hours} uur van tevoren worden aangevraagd.`;
    if (rf && !FLIGHT.test(rf)) e.return_flight_number = 'Vul een geldig vluchtnummer in of laat het veld leeg.';
    if (back.ok && from && to) legs.push({ leg: 'terug', pickupAt: back.date, from: to, to: from, stop, flight: rf || null });
  }

  // Contact
  if (v('name', 100).length < 2) e.name = 'Vul je naam in.';
  if (!EMAIL.test(v('email', 254))) e.email = 'Vul een geldig e-mailadres in.';
  if (!PHONE.test(v('phone', 30))) e.phone = 'Vul een geldig telefoonnummer in.';
  if (v('accept_terms') !== 'ja') e.accept_terms = 'Ga akkoord met de algemene voorwaarden en de privacyverklaring om door te gaan.';
  if (v('notes', 1000).length > 800) e.notes = 'Opmerkingen mogen maximaal 800 tekens zijn.';

  return { errors: e, legs, settings, cat };
}

const isAirport = (a: Addr) => a.pc4 !== null ? isAirportPostcode(a.pc4) : isForeignAirportPostcode(a.country, a.postcode);

function legTiming(pickupAt: Date, s: Settings, now = new Date()) {
  const cutoff = new Date(pickupAt.getTime() - hours(s.booking_cutoff_hours));
  const closes = new Date(Math.min(now.getTime() + hours(s.bidding_window_hours), cutoff.getTime()));
  const enough = closes.getTime() - now.getTime() >= hours(s.min_bidding_window_hours);
  return { cutoff, closes, enough };
}

async function areaFor(tx: Tx, pc4: number): Promise<string | null> {
  const r = await one(tx, `select a.id from service_area_postcode_ranges r join service_areas a on a.id = r.service_area_id
                           where a.active and $1 between r.postcode_from and r.postcode_to order by (r.postcode_to - r.postcode_from) limit 1`, [pc4]);
  return r?.id ?? null;
}

export async function createRequest(raw: Partial<RequestInput>, actor: Actor): Promise<{ errors?: FieldErrors; groupId?: string; publicRef?: string; needsVerification?: boolean }> {
  if (actor.role === 'company' || actor.role === 'admin') return { errors: { form: 'Je bent ingelogd als taxibedrijf of beheerder. Log uit om als klant een rit aan te vragen.' } };
  const { errors, legs, settings } = await validateRequest(raw);
  if (Object.keys(errors).length || !legs || !settings) return { errors };
  const s = settings;
  for (const l of legs) if (!legTiming(l.pickupAt, s).enough)
    return { errors: { date: 'Het gekozen tijdstip ligt te dichtbij om nog biedingen te ontvangen. Kies een later tijdstip.' } };

  const email = String(raw.email).trim().toLowerCase();
  const name = String(raw.name).trim().slice(0, 100), phone = String(raw.phone).trim().slice(0, 30);
  const notes = String(raw.notes || '').trim().slice(0, 800);
  const marketing = raw.marketing === 'ja';

  return withActor(SYSTEM, async tx => {
    // Klantaccount bepalen
    let userId: string; let verified = false;
    if (actor.role === 'customer' && actor.userId) {
      const u = await one(tx, 'select id, email_verified_at from users where id = $1', [actor.userId]);
      userId = u.id; verified = !!u.email_verified_at;
    } else {
      const existing = await one(tx, 'select id, role from users where lower(email) = $1', [email]);
      if (existing && existing.role !== 'customer') return { errors: { email: 'Dit e-mailadres hoort bij een bedrijfs- of beheeraccount. Gebruik een ander e-mailadres.' } };
      if (existing) userId = existing.id;
      else {
        userId = (await one(tx, `insert into users (email, role, full_name, phone) values ($1,'customer',$2,$3) returning id`, [email, name, phone])).id;
        await tx.query('insert into customer_profiles (user_id) values ($1)', [userId]);
      }
    }
    if (marketing) await tx.query('update customer_profiles set marketing_consent = true, marketing_consent_at = now() where user_id = $1', [userId]);

    const ref = 'AV-' + (await one(tx, `select nextval('request_ref_seq') as n`)).n;
    const groupId = (await one(tx, `insert into request_groups (public_ref, customer_user_id, trip_type, terms_version, terms_accepted_at, marketing_consent)
      values ($1,$2,$3,$4, now(), $5) returning id`, [ref, userId, raw.trip_type, s.terms_version, marketing])).id;

    const scrubbed = notes ? scrubPersonalData(notes) : null;
    const status = verified ? 'open' : 'concept';
    for (const l of legs) {
      const t = legTiming(l.pickupAt, s);
      const ride = await one(tx, `insert into ride_requests (group_id, leg, status, pickup_at, pickup_city, pickup_postcode4, pickup_area_id,
          dropoff_city, dropoff_postcode4, dropoff_area_id, stop_city, passengers, large_bags, small_bags, vehicle_category, seat_maxicosi, seat_kinderstoel, seat_verhoger,
          is_airport, notes_for_bidders, has_private_notes, bidding_closes_at, booking_cutoff_at, opened_at, pickup_country, dropoff_country)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) returning id`,
        [groupId, l.leg, status, l.pickupAt, l.from.city, l.from.pc4, l.from.pc4 ? await areaFor(tx, l.from.pc4) : null, l.to.city, l.to.pc4, l.to.pc4 ? await areaFor(tx, l.to.pc4) : null,
         l.stop?.city ?? null, Number(raw.passengers), Number(raw.large_bags || 0), Number(raw.small_bags || 0), raw.vehicle_category, ...SEAT_TYPES.map(([k]) => raw.need_seats === 'ja' ? Number(raw[k] || 0) : 0),
         isAirport(l.from) || isAirport(l.to) || !!l.flight, scrubbed, !!notes, t.closes, t.cutoff, verified ? new Date() : null, l.from.country, l.to.country]);
      await tx.query(`insert into ride_request_private (ride_request_id, pickup_address, dropoff_address, stop_address, flight_number, customer_notes, contact_name)
        values ($1,$2,$3,$4,$5,$6,$7)`, [ride.id, l.from.full, l.to.full, l.stop?.full ?? null, l.flight, notes || null, name]);
      // Telefoon en e-mail apart: nooit zichtbaar voor taxibedrijven (zie migratie 007)
      await tx.query(`insert into ride_request_contact (ride_request_id, contact_email, contact_phone) values ($1,$2,$3)`, [ride.id, email, phone]);
      await recordStatus(tx, actor, 'ride_request', ride.id, null, status);
    }

    const token = await createLoginLink(tx, userId, 'request_access', groupId);
    const link = `${config.baseUrl}/toegang/${token}`;
    const legText = legs.map(l => `- ${l.leg === 'heen' ? 'Heenrit' : 'Terugrit'}: ${formatDateTime(l.pickupAt)}, ${l.from.city}${l.from.country !== 'NL' ? ` (${countryName(l.from.country)})` : ''} → ${l.to.city}${l.to.country !== 'NL' ? ` (${countryName(l.to.country)})` : ''}`).join('\n');
    await queueEmail(tx, `aanvraag_ontvangen:${groupId}`, email, 'aanvraag_ontvangen', `Je ritaanvraag ${ref} is ontvangen`,
      `Hallo ${name},\n\nWe hebben je ritaanvraag ontvangen:\n${legText}\n\n` +
      (verified ? 'Taxibedrijven kunnen nu een prijsvoorstel doen.' : 'Bevestig eerst je e-mailadres via de link hieronder. Pas daarna wordt je aanvraag zichtbaar voor taxibedrijven.') +
      `\n\nBekijk je aanvraag en aanbiedingen (link 48 uur geldig, eenmalig te gebruiken):\n${link}\n\nLet op: een aanvraag is nog geen boeking.`);
    if (verified) await notifyEligibleCompanies(tx, groupId);
    return { groupId, publicRef: ref, needsVerification: !verified };
  });
}

/** Opent concept-aanvragen na e-mailbevestiging. Biedtermijn start nu, maar nooit voorbij het laatste boekingsmoment. */
export async function openConceptRequests(groupId: string) {
  const s = await getSettings();
  await withActor(SYSTEM, async tx => {
    const rides = await many(tx, `select id, pickup_at from ride_requests where group_id = $1 and status = 'concept' for update`, [groupId]);
    for (const r of rides) {
      const t = legTiming(new Date(r.pickup_at), s);
      if (!t.enough) {
        await tx.query(`update ride_requests set status = 'verlopen', closed_at = now() where id = $1`, [r.id]);
        await recordStatus(tx, SYSTEM, 'ride_request', r.id, 'concept', 'verlopen', 'E-mail te laat bevestigd');
      } else {
        await tx.query(`update ride_requests set status = 'open', opened_at = now(), bidding_closes_at = $2 where id = $1`, [r.id, t.closes]);
        await recordStatus(tx, SYSTEM, 'ride_request', r.id, 'concept', 'open', 'E-mailadres bevestigd');
      }
    }
    if (rides.length) await notifyEligibleCompanies(tx, groupId);
  });
}

async function notifyEligibleCompanies(tx: Tx, groupId: string) {
  const rows = await many(tx, `select r.id as ride_id, r.pickup_at, r.pickup_city, r.dropoff_city, c.id as company_id, c.email
    from ride_requests r cross join companies c
    where r.group_id = $1 and r.status = 'open' and company_can_bid(c.id, r.id)`, [groupId]);
  for (const r of rows) await queueEmail(tx, `nieuwe_aanvraag:${r.ride_id}:${r.company_id}`, r.email, 'nieuwe_aanvraag_bedrijf',
    `Nieuwe passende ritaanvraag: ${r.pickup_city} → ${r.dropoff_city}`,
    `Er is een nieuwe ritaanvraag binnen uw werkgebied op ${formatDateTime(r.pickup_at)}.\n\nBekijk en bied: ${config.baseUrl}/bedrijf/aanvragen/${r.ride_id}`);
}

// ───────── Klantweergave ─────────
export async function listCustomerGroups(actor: Actor) {
  return withActor(actor, tx => many(tx, `
    select g.id, g.public_ref, g.trip_type, g.created_at,
      json_agg(json_build_object('id', r.id, 'leg', r.leg, 'status', r.status, 'pickup_at', r.pickup_at, 'pickup_city', r.pickup_city, 'dropoff_city', r.dropoff_city,
        'offers', (select count(*) from bids b where b.ride_request_id = r.id and b.status = 'actief' and b.valid_until > now()),
        'booking_number', (select k.booking_number from bookings k where k.ride_request_id = r.id)) order by r.leg) as legs
    from request_groups g join ride_requests r on r.group_id = g.id
    group by g.id order by g.created_at desc`));
}

export async function getCustomerGroup(actor: Actor, groupId: string) {
  return withActor(actor, async tx => {
    const g = await one(tx, 'select * from request_groups where id = $1', [groupId]);
    if (!g) throw new HttpError(404, 'Aanvraag niet gevonden.');
    const legs = await many(tx, `select r.*, p.pickup_address, p.dropoff_address, p.stop_address, p.flight_number, p.customer_notes, p.contact_name, cc.contact_email, cc.contact_phone,
        vc.name_nl as category_name
      from ride_requests r join ride_request_private p on p.ride_request_id = r.id join ride_request_contact cc on cc.ride_request_id = r.id join vehicle_categories vc on vc.code = r.vehicle_category
      where r.group_id = $1 order by r.leg`, [groupId]);
    for (const l of legs) {
      l.offers = await many(tx, `select b.id, b.company_id, b.status, b.total_price_cents, b.vehicle_category, vc.name_nl as category_name, b.max_passengers, b.max_large_bags,
          b.included_services, b.included_wait_minutes, b.flight_delay_policy, b.cancellation_policy, b.valid_until, b.note,
          cp.trade_name, cp.rating_avg, cp.rating_count, cp.avg_communicatie, cp.avg_klantvriendelijkheid, cp.avg_comfort_hygiene, cp.avg_betrouwbaarheid, cp.avg_rijgedrag_veiligheid
        from bids b join company_public cp on cp.id = b.company_id join vehicle_categories vc on vc.code = b.vehicle_category
        where b.ride_request_id = $1 and ((b.status = 'actief' and b.valid_until > now()) or b.status in ('gereserveerd','geaccepteerd'))
        order by b.total_price_cents, b.created_at`, [l.id]);
      const photos = await publicPhotosFor(tx, l.offers.map((o: any) => o.company_id));
      for (const o of l.offers) o.photos = photos[o.company_id] || [];
      l.reservation = await one(tx, `select r.id, r.bid_id, r.expires_at, p.id as payment_id, p.checkout_url from reservations r
        left join payments p on p.reservation_id = r.id where r.ride_request_id = $1 and r.status = 'actief' and r.expires_at > now()`, [l.id]);
      l.booking = await one(tx, `select k.id, k.booking_number, k.status, k.total_price_cents, cp.trade_name from bookings k join company_public cp on cp.id = k.company_id where k.ride_request_id = $1`, [l.id]);
    }
    return { group: g, legs };
  });
}

export async function getCustomerBooking(actor: Actor, bookingId: string) {
  return withActor(actor, async tx => {
    const b = await one(tx, `select k.*, cp.trade_name, r.pickup_at, r.leg, r.passengers, r.large_bags, r.small_bags, r.seat_maxicosi, r.seat_kinderstoel, r.seat_verhoger, g.public_ref, g.id as group_id,
        p.pickup_address, p.dropoff_address, p.stop_address, p.flight_number, bd.included_wait_minutes, bd.included_services, bd.flight_delay_policy, bd.cancellation_policy,
        vc.name_nl as category_name
      from bookings k join company_public cp on cp.id = k.company_id join ride_requests r on r.id = k.ride_request_id join request_groups g on g.id = r.group_id
      join ride_request_private p on p.ride_request_id = r.id join bids bd on bd.id = k.bid_id join vehicle_categories vc on vc.code = bd.vehicle_category
      where k.id = $1`, [bookingId]);
    if (!b) throw new HttpError(404, 'Boeking niet gevonden.');
    const history = await asSystem(tx, actor, () => many(tx, `select to_status, created_at, note from status_history where entity_type = 'booking' and entity_id = $1 order by created_at`, [bookingId]));
    const payment = await one(tx, `select status, amount_cents, refunded_cents, is_simulated, paid_at from payments where booking_id = $1`, [bookingId]);
    const review = await one(tx, `select * from reviews where booking_id = $1`, [bookingId]);
    return { booking: b, history, payment, review };
  });
}

export async function audited(actor: Actor, action: string, type: string, id: string, details: Record<string, unknown> = {}) {
  await withActor(SYSTEM, tx => audit(tx, actor, action, type, id, details));
}
