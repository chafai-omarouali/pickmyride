import { type Actor, type Tx, SYSTEM, withActor, one, many, isUniqueViolation } from '../lib/db.ts';
import { getSettings, recordStatus, audit, logError } from '../lib/services.ts';
import { queueEmail } from '../lib/notify.ts';
import { formatDateTime, formatTime } from '../lib/time.ts';
import { formatEuro } from '../lib/money.ts';
import { config } from '../lib/config.ts';
import { HttpError } from '../lib/http.ts';
import { paymentProvider } from '../integrations/payments/index.ts';
import type { ProviderStatus } from '../integrations/payments/types.ts';
import { asSystem } from './context.ts';
import { addSystemMessage } from './communication.ts';
import { assertTransition, BOOKING_STATUS, label } from './status.ts';

/** Vrijgeven van een verlopen of geannuleerde reservering. Heropent het bod alleen als het nog geldig is. */
async function releaseReservation(tx: Tx, actor: Actor, reservationId: string, newStatus: 'verlopen' | 'vrijgegeven', note: string) {
  const res = await one(tx, `update reservations set status = $2, ended_at = now() where id = $1 and status = 'actief' returning bid_id`, [reservationId, newStatus]);
  if (!res) return;
  await recordStatus(tx, actor, 'reservation', reservationId, 'actief', newStatus, note);
  const bid = await one(tx, `update bids set status = case when valid_until > now() then 'actief' else 'verlopen' end, updated_at = now()
                             where id = $1 and status = 'gereserveerd' returning status`, [res.bid_id]);
  if (bid) await recordStatus(tx, actor, 'bid', res.bid_id, 'gereserveerd', bid.status, note);
}

/**
 * Klant kiest een aanbod: controle op de server, tijdelijke reservering (standaard 10 min) en start betaling.
 * Gelijktijdige pogingen worden geserialiseerd via een rijvergrendeling op de rit en unieke indexen.
 */
export async function chooseOffer(actor: Actor, bidId: string): Promise<{ checkoutUrl: string; paymentId: string }> {
  if (actor.role !== 'customer') throw new HttpError(403, 'Alleen de klant van deze aanvraag kan een aanbod kiezen.');
  const s = await getSettings();
  const provider = paymentProvider();
  const prep = await withActor(actor, async tx => {
    // Autorisatie via RLS: de klant ziet alleen biedingen op eigen ritten.
    const visible = await one(tx, 'select id, ride_request_id from bids where id = $1', [bidId]);
    if (!visible) throw new HttpError(404, 'Dit aanbod bestaat niet of is niet meer beschikbaar.');
    return asSystem(tx, actor, async () => {
      const ride = await one(tx, 'select * from ride_requests where id = $1 for update', [visible.ride_request_id]);
      const expired = await many(tx, `select id from reservations where ride_request_id = $1 and status = 'actief' and expires_at <= now()`, [ride.id]);
      for (const r of expired) await releaseReservation(tx, SYSTEM, r.id, 'verlopen', 'Reserveringstijd verstreken');
      const bid = await one(tx, 'select * from bids where id = $1 for update', [bidId]);

      const own = await one(tx, `select r.id, r.bid_id, r.expires_at, p.id as payment_id, p.checkout_url from reservations r left join payments p on p.reservation_id = r.id
                                 where r.ride_request_id = $1 and r.status = 'actief'`, [ride.id]);
      if (own && own.bid_id === bidId && own.checkout_url) return { reuse: own };
      if (own) throw new HttpError(409, `Je hebt al een ander aanbod voor deze rit gereserveerd (tot ${formatTime(own.expires_at)}). Rond die betaling af of annuleer die reservering eerst.`);
      if (ride.status !== 'open') throw new HttpError(409, ride.status === 'gesloten' ? 'Voor deze rit is al een boeking gemaakt.' : `Deze aanvraag is niet meer open (${label(ride.status)}).`);
      if (new Date(ride.booking_cutoff_at) <= new Date()) throw new HttpError(409, 'Het laatste boekingsmoment voor deze rit is verstreken.');
      if (bid.status !== 'actief') throw new HttpError(409, 'Dit aanbod is niet meer beschikbaar.');
      if (new Date(bid.valid_until) <= new Date()) {
        await tx.query(`update bids set status = 'verlopen' where id = $1`, [bidId]);
        await recordStatus(tx, SYSTEM, 'bid', bidId, 'actief', 'verlopen', 'Geldigheid verstreken');
        return { expired: true };
      }
      await tx.query(`update bids set status = 'gereserveerd', updated_at = now() where id = $1`, [bidId]);
      await recordStatus(tx, actor, 'bid', bidId, 'actief', 'gereserveerd');
      const resv = await one(tx, `insert into reservations (bid_id, ride_request_id, customer_user_id, expires_at)
        values ($1,$2,$3, least(now() + make_interval(mins => $4), $5)) returning id`, [bidId, ride.id, actor.userId, s.reservation_minutes, ride.booking_cutoff_at]);
      await recordStatus(tx, actor, 'reservation', resv.id, null, 'actief');
      const pay = await one(tx, `insert into payments (reservation_id, ride_request_id, customer_user_id, provider, amount_cents, is_simulated)
        values ($1,$2,$3,$4,$5,$6) returning id`, [resv.id, ride.id, actor.userId, provider.name, bid.total_price_cents, provider.isSimulated]);
      await recordStatus(tx, actor, 'payment', pay.id, null, 'in_behandeling');
      return { reservationId: resv.id, paymentId: pay.id, amount: bid.total_price_cents, groupId: ride.group_id, leg: ride.leg };
    });
  });
  if ('expired' in prep) throw new HttpError(409, 'Dit aanbod is verlopen en kan niet meer worden gekozen.');
  if ('reuse' in prep) return { checkoutUrl: prep.reuse.checkout_url, paymentId: prep.reuse.payment_id };

  try {
    const created = await provider.createPayment({
      paymentId: prep.paymentId, amountCents: prep.amount,
      description: `PickMyRide ${prep.leg === 'heen' ? 'heenrit' : 'terugrit'}`,
      returnUrl: `${config.baseUrl}/betaling/${prep.paymentId}`,
      webhookUrl: `${config.baseUrl}/api/webhooks/betalingen`,
    });
    await withActor(SYSTEM, tx => tx.query('update payments set provider_payment_id = $2, checkout_url = $3, updated_at = now() where id = $1', [prep.paymentId, created.providerPaymentId, created.checkoutUrl]));
    return { checkoutUrl: created.checkoutUrl, paymentId: prep.paymentId };
  } catch (e) {
    await withActor(SYSTEM, async tx => {
      await tx.query(`update payments set status = 'mislukt', updated_at = now() where id = $1`, [prep.paymentId]);
      await releaseReservation(tx, SYSTEM, prep.reservationId, 'vrijgegeven', 'Betaling kon niet worden gestart');
    });
    await logError('Betaling starten mislukt', { paymentId: prep.paymentId, error: (e as Error).message });
    throw new HttpError(502, 'De betaling kon niet worden gestart. Het aanbod is weer vrijgegeven; probeer het opnieuw.');
  }
}

export async function cancelReservation(actor: Actor, reservationId: string) {
  await withActor(actor, async tx => {
    const r = await one(tx, `select id, status from reservations where id = $1`, [reservationId]);   // RLS: alleen eigen
    if (!r) throw new HttpError(404, 'Reservering niet gevonden.');
    await asSystem(tx, actor, async () => {
      const pay = await one(tx, `select status from payments where reservation_id = $1 for update`, [reservationId]);
      if (pay && pay.status !== 'in_behandeling') throw new HttpError(409, 'Deze reservering kan niet meer worden geannuleerd.');
      await releaseReservation(tx, actor, reservationId, 'vrijgegeven', 'Door klant geannuleerd');
    });
  });
}

// ───────── Betaalmeldingen (webhooks) ─────────
export async function handlePaymentWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>): Promise<string> {
  const provider = paymentProvider();
  const ev = provider.parseWebhook(raw, headers);   // gooit bij ongeldige handtekening
  const rec = await withActor(SYSTEM, async tx => {
    const ins = await one(tx, `insert into payment_events (provider, provider_event_id, provider_payment_id, payload) values ($1,$2,$3,$4)
                               on conflict (provider, provider_event_id) do nothing returning id`, [provider.name, ev.eventId, ev.providerPaymentId, JSON.parse(raw.toString('utf8') || '{}')]);
    if (ins) return { id: ins.id, duplicate: false };
    const ex = await one(tx, `select id, processed_at from payment_events where provider = $1 and provider_event_id = $2`, [provider.name, ev.eventId]);
    return { id: ex.id, duplicate: !!ex.processed_at };
  });
  if (rec.duplicate) return 'dubbel';
  const status = await provider.getStatus(ev.providerPaymentId);   // betrouwbare status bij de provider
  const result = await processPaymentStatus(ev.providerPaymentId, status);
  await withActor(SYSTEM, tx => tx.query('select mark_payment_event($1, $2)', [rec.id, result]));
  return result;
}

export async function processPaymentStatus(providerPaymentId: string, status: ProviderStatus): Promise<string> {
  try {
    return await withActor(SYSTEM, async tx => {
      const pay = await one(tx, 'select * from payments where provider_payment_id = $1 for update', [providerPaymentId]);
      if (!pay) return 'onbekende_betaling';
      if (pay.status !== 'in_behandeling') return 'al_verwerkt';
      if (status === 'open') return 'nog_open';
      if (status !== 'paid') return failPayment(tx, pay);
      return confirmBooking(tx, pay);
    });
  } catch (e) {
    if (isUniqueViolation(e)) { await logError('Dubbele boeking voorkomen door unieke beperking', { providerPaymentId, constraint: (e as any).constraint }); return 'al_verwerkt'; }
    throw e;
  }
}

async function failPayment(tx: Tx, pay: any) {
  await tx.query(`update payments set status = 'mislukt', updated_at = now() where id = $1`, [pay.id]);
  await recordStatus(tx, SYSTEM, 'payment', pay.id, 'in_behandeling', 'mislukt');
  await releaseReservation(tx, SYSTEM, pay.reservation_id, 'vrijgegeven', 'Betaling mislukt');
  const c = await one(tx, `select cc.contact_email, p.contact_name from ride_request_private p join ride_request_contact cc using (ride_request_id) where ride_request_id = $1`, [pay.ride_request_id]);
  const g = await one(tx, `select group_id from ride_requests where id = $1`, [pay.ride_request_id]);
  await queueEmail(tx, `betaling_mislukt:${pay.id}`, c.contact_email, 'betaling_mislukt', 'Je betaling is niet gelukt',
    `Hallo ${c.contact_name},\n\nDe betaling is niet gelukt, er is geen boeking gemaakt. Als het aanbod nog geldig is, kun je het opnieuw kiezen:\n${config.baseUrl}/mijn/aanvragen/${g.group_id}`);
  return 'mislukt';
}

async function confirmBooking(tx: Tx, pay: any): Promise<string> {
  const ride = await one(tx, 'select * from ride_requests where id = $1 for update', [pay.ride_request_id]);
  const resv = await one(tx, 'select * from reservations where id = $1 for update', [pay.reservation_id]);
  const bid = await one(tx, 'select * from bids where id = $1 for update', [resv.bid_id]);
  const otherActive = await one(tx, `select 1 from reservations where ride_request_id = $1 and status = 'actief' and id <> $2`, [ride.id, resv.id]);
  const existingBooking = await one(tx, 'select 1 from bookings where ride_request_id = $1', [ride.id]);

  const stillOurs = resv.status === 'actief' && bid.status === 'gereserveerd';
  const reclaimable = resv.status !== 'actief' && bid.status === 'actief' && new Date(bid.valid_until) > new Date() && !otherActive;
  if (ride.status !== 'open' || existingBooking || !(stillOurs || reclaimable)) {
    // Betaald, maar het aanbod is niet meer beschikbaar: geen boeking, terugbetaling klaarzetten en beheer waarschuwen.
    await tx.query(`update payments set status = 'geslaagd', paid_at = now(), needs_attention = $2, updated_at = now() where id = $1`,
      [pay.id, 'Betaald nadat het aanbod niet meer beschikbaar was — volledige terugbetaling vereist']);
    await recordStatus(tx, SYSTEM, 'payment', pay.id, 'in_behandeling', 'geslaagd', 'Zonder boeking; terugbetaling vereist');
    await tx.query(`insert into refunds (payment_id, amount_cents, reason, is_simulated) values ($1,$2,$3,$4)`, [pay.id, pay.amount_cents, 'Betaling na verlopen reservering', pay.is_simulated]);
    await audit(tx, SYSTEM, 'betaling.zonder_boeking', 'payment', pay.id, { reden: 'reservering verlopen of rit niet meer open' });
    await logError('Betaling ontvangen zonder geldige reservering', { paymentId: pay.id });
    return 'betaald_zonder_boeking';
  }

  const rule = await one(tx, 'select id, name, percent_bp, fixed_cents, min_cents, is_demo from commission_rules where id = $1', [bid.commission_rule_id]);
  const settings = await getSettings(tx);
  const number = 'PMR-' + (await one(tx, `select nextval('booking_number_seq') as n`)).n;
  const booking = await one(tx, `insert into bookings (booking_number, ride_request_id, bid_id, company_id, customer_user_id, total_price_cents, commission_cents, payout_cents,
      commission_rule_snapshot, vat_note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
    [number, ride.id, bid.id, bid.company_id, pay.customer_user_id, bid.total_price_cents, bid.commission_cents, bid.payout_cents, rule, settings.vat_note]);
  await recordStatus(tx, SYSTEM, 'booking', booking.id, null, 'bevestigd', 'Betaling bevestigd door betaalprovider');

  await tx.query(`update bids set status = 'geaccepteerd', updated_at = now() where id = $1`, [bid.id]);
  await recordStatus(tx, SYSTEM, 'bid', bid.id, bid.status, 'geaccepteerd');
  const others = await many(tx, `update bids set status = 'niet_gekozen', updated_at = now() where ride_request_id = $1 and id <> $2 and status = 'actief' returning id`, [ride.id, bid.id]);
  for (const o of others) await recordStatus(tx, SYSTEM, 'bid', o.id, 'actief', 'niet_gekozen');
  await tx.query(`update ride_requests set status = 'gesloten', closed_at = now() where id = $1`, [ride.id]);
  await recordStatus(tx, SYSTEM, 'ride_request', ride.id, 'open', 'gesloten', `Geboekt: ${number}`);
  if (resv.status === 'actief') {
    await tx.query(`update reservations set status = 'omgezet', ended_at = now() where id = $1`, [resv.id]);
    await recordStatus(tx, SYSTEM, 'reservation', resv.id, 'actief', 'omgezet');
  }
  await tx.query(`update payments set status = 'geslaagd', paid_at = now(), booking_id = $2, updated_at = now() where id = $1`, [pay.id, booking.id]);
  await recordStatus(tx, SYSTEM, 'payment', pay.id, 'in_behandeling', 'geslaagd');
  await tx.query(`insert into payouts (booking_id, company_id, amount_cents) values ($1,$2,$3)`, [booking.id, bid.company_id, bid.payout_cents]);
  await audit(tx, SYSTEM, 'boeking.bevestigd', 'booking', booking.id, { booking_number: number, payment_id: pay.id, simulated: pay.is_simulated });
  await addSystemMessage(tx, booking.id, `Boeking ${number} is bevestigd. Hier kunnen klant en taxibedrijf berichten sturen en via PickMyRide bellen, met afgeschermde nummers.`);

  const c = await one(tx, `select p.*, cc.contact_email from ride_request_private p join ride_request_contact cc using (ride_request_id) where ride_request_id = $1`, [ride.id]);
  const comp = await one(tx, `select trade_name, email from companies where id = $1`, [bid.company_id]);
  await queueEmail(tx, `boeking_bevestigd:${booking.id}`, c.contact_email, 'boeking_bevestigd', `Boeking ${number} bevestigd`,
    `Hallo ${c.contact_name},\n\nJe rit is geboekt.\n\nBoekingsnummer: ${number}\nWanneer: ${formatDateTime(ride.pickup_at)}\nVan: ${c.pickup_address}\nNaar: ${c.dropoff_address}\n` +
    `Vervoerder: ${comp.trade_name}\nTotaalprijs: ${formatEuro(bid.total_price_cents)}${pay.is_simulated ? ' (DEMO — gesimuleerde betaling, er is niets afgeschreven)' : ''}\n\n` +
    `Bekijk je boeking: ${config.baseUrl}/mijn/boekingen/${booking.id}`);
  await queueEmail(tx, `bod_geaccepteerd:${booking.id}`, comp.email, 'bod_geaccepteerd', `Bod geaccepteerd — boeking ${number}`,
    `Uw aanbod van ${formatEuro(bid.total_price_cents)} is gekozen en betaald.\nBoekingsnummer: ${number}\nRit: ${formatDateTime(ride.pickup_at)}, ${ride.pickup_city} → ${ride.dropoff_city}\n\n` +
    `Wijs een chauffeur en voertuig toe: ${config.baseUrl}/bedrijf/ritten/${booking.id}`);
  return 'bevestigd';
}

// ───────── Automatisch verloop (draait periodiek; correctheid hangt er niet van af: alle acties controleren zelf de tijd) ─────────
export async function sweepExpired() {
  await withActor(SYSTEM, async tx => {
    for (const r of await many(tx, `select id from reservations where status = 'actief' and expires_at <= now() for update skip locked`))
      await releaseReservation(tx, SYSTEM, r.id, 'verlopen', 'Reserveringstijd verstreken');
    for (const b of await many(tx, `update bids set status = 'verlopen', updated_at = now() where status = 'actief' and valid_until <= now() returning id`))
      await recordStatus(tx, SYSTEM, 'bid', b.id, 'actief', 'verlopen', 'Geldigheid verstreken');
    for (const r of await many(tx, `update ride_requests set status = 'verlopen', closed_at = now()
        where status in ('open','concept') and booking_cutoff_at <= now()
          and not exists (select 1 from reservations x where x.ride_request_id = ride_requests.id and x.status = 'actief')
        returning id`)) {
      await recordStatus(tx, SYSTEM, 'ride_request', r.id, null, 'verlopen', 'Laatste boekingsmoment verstreken');
      await tx.query(`update bids set status = 'verlopen' where ride_request_id = $1 and status = 'actief'`, [r.id]);
    }
  });
}

// ───────── Taxibedrijf: gewonnen ritten en uitvoering ─────────
export async function listCompanyBookings(actor: Actor) {
  if (actor.role !== 'company') throw new HttpError(403, 'Geen toegang.');
  return withActor(actor, tx => many(tx, `select k.id, k.booking_number, k.status, k.total_price_cents, k.payout_cents, k.commission_cents, r.pickup_at, r.pickup_city, r.dropoff_city,
      r.passengers, d.full_name as driver_name, v.license_plate, po.status as payout_status
    from bookings k join ride_requests r on r.id = k.ride_request_id left join drivers d on d.id = k.driver_id left join vehicles v on v.id = k.vehicle_id
    left join payouts po on po.booking_id = k.id
    where k.company_id = $1 order by r.pickup_at`, [actor.companyId]));
}

export async function getCompanyBooking(actor: Actor, bookingId: string) {
  if (actor.role !== 'company') throw new HttpError(403, 'Geen toegang.');
  return withActor(actor, async tx => {
    const b = await one(tx, `select k.*, r.pickup_at, r.leg, r.passengers, r.large_bags, r.small_bags, r.seat_maxicosi, r.seat_kinderstoel, r.seat_verhoger, r.pickup_city, r.dropoff_city,
        p.pickup_address, p.dropoff_address, p.stop_address, p.flight_number, p.customer_notes, p.contact_name,
        bd.included_wait_minutes, bd.vehicle_category
      from bookings k join ride_requests r on r.id = k.ride_request_id join bids bd on bd.id = k.bid_id
      left join ride_request_private p on p.ride_request_id = r.id where k.id = $1`, [bookingId]);
    if (!b) throw new HttpError(404, 'Boeking niet gevonden.');
    const drivers = await many(tx, 'select id, full_name from drivers where active order by full_name');
    const vehicles = await many(tx, 'select id, description, license_plate, max_passengers, category_code from vehicles where active order by description');
    return { booking: b, drivers, vehicles };
  });
}

export async function assignDriverVehicle(actor: Actor, bookingId: string, driverId: string, vehicleId: string) {
  return withActor(actor, async tx => {
    const b = await one(tx, `select k.id, k.status, r.passengers from bookings k join ride_requests r on r.id = k.ride_request_id where k.id = $1 for update of k`, [bookingId]);
    if (!b) throw new HttpError(404, 'Boeking niet gevonden.');
    if (!['bevestigd', 'chauffeur_toegewezen'].includes(b.status)) throw new HttpError(409, 'In deze status kan de toewijzing niet meer worden gewijzigd.');
    const d = await one(tx, 'select id, full_name from drivers where id = $1 and active', [driverId]);     // RLS: alleen eigen chauffeurs
    const v = await one(tx, 'select id, description, license_plate, max_passengers from vehicles where id = $1 and active', [vehicleId]);
    if (!d || !v) throw new HttpError(400, 'Kies een eigen, actieve chauffeur en een eigen, actief voertuig.');
    if (v.max_passengers < b.passengers) throw new HttpError(400, `Dit voertuig heeft te weinig plaatsen (${v.max_passengers}) voor ${b.passengers} personen.`);
    await tx.query(`update bookings set driver_id = $2, vehicle_id = $3, status = 'chauffeur_toegewezen' where id = $1`, [bookingId, driverId, vehicleId]);
    if (b.status !== 'chauffeur_toegewezen') await recordStatus(tx, actor, 'booking', bookingId, b.status, 'chauffeur_toegewezen', `${d.full_name}, ${v.license_plate}`);
    await asSystem(tx, actor, async () => {
      await addSystemMessage(tx, bookingId, `Chauffeur toegewezen: ${d.full_name.split(' ')[0]}, ${v.description}, kenteken ${v.license_plate}.`);
      const c = await one(tx, `select cc.contact_email, p.contact_name, r.pickup_at, k.booking_number from bookings k join ride_request_private p on p.ride_request_id = k.ride_request_id join ride_request_contact cc on cc.ride_request_id = k.ride_request_id
        join ride_requests r on r.id = k.ride_request_id where k.id = $1`, [bookingId]);
      await queueEmail(tx, `chauffeur_toegewezen:${bookingId}:${driverId}:${vehicleId}`, c.contact_email, 'chauffeur_toegewezen', `Chauffeur toegewezen voor ${c.booking_number}`,
        `Hallo ${c.contact_name},\n\nVoor je rit op ${formatDateTime(c.pickup_at)} is een chauffeur toegewezen.\nVoertuig: ${v.description}, kenteken ${v.license_plate}\nChauffeur: ${d.full_name.split(' ')[0]}`);
    });
  });
}

export async function updateBookingStatus(actor: Actor, bookingId: string, to: string, note?: string) {
  return withActor(actor, async tx => {
    const b = await one(tx, 'select id, status, booking_number from bookings where id = $1 for update', [bookingId]);
    if (!b) throw new HttpError(404, 'Boeking niet gevonden.');
    assertTransition(BOOKING_STATUS, b.status, to, actor.role);
    if (to === 'onderweg' && !(await one(tx, 'select 1 from bookings where id = $1 and driver_id is not null', [bookingId]))) throw new HttpError(409, 'Wijs eerst een chauffeur en voertuig toe.');
    await tx.query('update bookings set status = $2 where id = $1', [bookingId, to]);
    await recordStatus(tx, actor, 'booking', bookingId, b.status, to, note?.slice(0, 300));
    if (to !== 'probleem_gemeld') await asSystem(tx, actor, () => addSystemMessage(tx, bookingId, `Status doorgegeven door het taxibedrijf: ${label(to)}.`));
    if (to === 'probleem_gemeld') await asSystem(tx, actor, async () => {
      await audit(tx, actor, 'boeking.probleem_gemeld', 'booking', bookingId, { note });
      for (const a of await many(tx, `select email from users where role = 'admin' and disabled_at is null`))
        await queueEmail(tx, `probleem:${bookingId}:${Date.now()}`, a.email, 'probleemmelding', `Probleem gemeld bij ${b.booking_number}`, `Melding: ${note || '(geen toelichting)'}\n${config.baseUrl}/beheer/boekingen/${bookingId}`);
    });
  });
}
