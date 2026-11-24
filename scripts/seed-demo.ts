/**
 * Demo-omgeving vullen met DUIDELIJK FICTIEVE gegevens. Nooit uitvoeren tegen productie.
 * Gebruik: npm run db:seed-demo   (vereist APP_ENV !== production)
 * Alle e-mailadressen eindigen op .test (gereserveerd domein, kan nooit echt bezorgd worden).
 */
import { createPool } from '../src/lib/pg.ts';
import { hashPassword } from '../src/lib/security.ts';
import { calculateCommission } from '../src/lib/money.ts';

export const DEMO_PASSWORD = 'Demo-wachtwoord-2026';
const H = 3600_000, D = 24 * H;

export async function seedDemo(url = process.env.MIGRATION_DATABASE_URL || 'postgres://postgres@127.0.0.1:5433/pickmyride', quiet = false) {
  if (process.env.APP_ENV === 'production') throw new Error('Demodata wordt nooit in productie geladen.');
  const pool = await createPool(url, 1);
  const c = await pool.connect();
  const q = async (sql: string, p: unknown[] = []) => (await c.query(sql, p)).rows;
  const one = async (sql: string, p: unknown[] = []) => (await q(sql, p))[0];
  const now = Date.now();
  const at = (ms: number) => { const d = new Date(now + ms); d.setUTCMinutes(0, 0, 0); return d; };
  const pw = hashPassword(DEMO_PASSWORD);
  try {
    await q('begin');
    await q('set search_path = pickmyride, public');
    await q(`select set_config('app.role','system',true)`);
    if (await one(`select 1 from users where email = 'beheer@demo.pickmyride.test'`)) { await q('rollback'); if (!quiet) console.log('Demodata is al aanwezig.'); return; }

    const user = async (email: string, role: string, name: string, phone: string) =>
      (await one(`insert into users (email, password_hash, role, full_name, phone, email_verified_at, is_demo) values ($1,$2,$3,$4,$5, now(), true) returning id`, [email, pw, role, name, phone])).id;
    const admin = await user('beheer@demo.pickmyride.test', 'admin', 'Demo Beheerder', '+31 20 000 0000');
    const k1 = await user('klant.een@demo.pickmyride.test', 'customer', 'Fictieve Klant Een', '+31 6 0000 0001');
    const k2 = await user('klant.twee@demo.pickmyride.test', 'customer', 'Fictieve Klant Twee', '+31 6 0000 0002');
    for (const k of [k1, k2]) await q('insert into customer_profiles (user_id) values ($1)', [k]);

    const area = async (code: string) => (await one('select id from service_areas where code = $1', [code])).id;
    const company = async (o: { email: string; trade: string; kvk: string; status: string; areas: string[]; cats: [string, number, number][]; city: string }) => {
      const u = await user(o.email, 'company', `Contact ${o.trade}`, '+31 20 000 00' + o.kvk.slice(-2));
      const id = (await one(`insert into companies (legal_name, trade_name, kvk_number, contact_name, email, phone, address_street, address_postcode, address_city, license_number,
          license_expires_on, status, partner_agreement_version, partner_agreement_accepted_at, reviewed_by, reviewed_at, is_demo)
        values ($1,$2,$3,$4,$5,$6,'Demostraat 1','1000 AA',$7,'DEMO-VERGUNNING', current_date + 400, $8, 'concept-2026-11', now(), $9, $10, true) returning id`,
        [`${o.trade} B.V. (fictief)`, o.trade, o.kvk, `Contact ${o.trade}`, o.email, '+31 20 000 00' + o.kvk.slice(-2), o.city, o.status, o.status === 'actief' ? admin : null, o.status === 'actief' ? new Date() : null])).id;
      await q(`insert into company_memberships (company_id, user_id) values ($1,$2)`, [id, u]);
      for (const a of o.areas) await q('insert into company_service_areas values ($1,$2)', [id, await area(a)]);
      for (const [cat, pax, bags] of o.cats) await q('insert into company_vehicle_categories values ($1,$2,$3,$4)', [id, cat, pax, bags]);
      await q(`insert into company_documents (company_id, doc_type, storage_key, original_filename, mime_type, size_bytes, expires_on, uploaded_by, verification_status, verified_by, verified_at)
        values ($1,'taxivergunning',$2,'demo-vergunning.pdf','application/pdf', 1024, current_date + 20, $3, $4, $5, $6)`,
        [id, 'demo-' + id, u, o.status === 'actief' ? 'goedgekeurd' : 'niet_gecontroleerd', o.status === 'actief' ? admin : null, o.status === 'actief' ? new Date() : null]);
      return { id, user: u };
    };
    const c1 = await company({ email: 'noord@demo.pickmyride.test', trade: 'Demo Taxi Noord', kvk: '00000001', status: 'actief', areas: ['amsterdam', 'schiphol', 'noord-holland-nz', 'landelijk'], cats: [['personenauto', 4, 2], ['stationwagen', 4, 4], ['taxibus', 8, 8]], city: 'Amsterdam' });
    await q(`update companies set serves_abroad = true where id = $1`, [c1.id]);   // demo: rijdt ook naar het buitenland
    const c2 = await company({ email: 'airport@demo.pickmyride.test', trade: 'Demo Airport Cars', kvk: '00000002', status: 'actief', areas: ['schiphol', 'amsterdam', 'zuid-holland'], cats: [['personenauto', 4, 3], ['stationwagen', 4, 4]], city: 'Hoofddorp' });
    const c3 = await company({ email: 'utrecht@demo.pickmyride.test', trade: 'Demo Rijdienst Utrecht', kvk: '00000003', status: 'in_beoordeling', areas: ['utrecht', 'schiphol'], cats: [['personenauto', 4, 2]], city: 'Utrecht' });
    void c3;

    for (const [co, names] of [[c1, ['Demo Chauffeur A', 'Demo Chauffeur B']], [c2, ['Demo Chauffeur C']]] as const) {
      for (const n of names) await q(`insert into drivers (company_id, full_name, phone, driver_pass_number, pass_expires_on) values ($1,$2,'+31 6 0000 0099','DEMO-PAS', current_date + 300)`, [co.id, n]);
      await q(`insert into vehicles (company_id, category_code, description, license_plate, max_passengers) values ($1,'stationwagen','Demo stationwagen (fictief)','DEMO-01',4), ($1,'taxibus','Demo taxibus (fictief)','DEMO-02',8)`, [co.id]);
    }
    const rule = await one('select * from commission_rules where active');
    let ref = 9001;
    const group = async (cust: string, trip: string) => (await one(`insert into request_groups (public_ref, customer_user_id, trip_type, terms_version, terms_accepted_at, is_demo) values ($1,$2,$3,'concept-2026-11', now(), true) returning id`, ['AV-DEMO-' + ref++, cust, trip])).id;
    const ride = async (o: { group: string; leg: string; status: string; pickup: Date; from: [string, number, string, string]; to: [string, number, string, string]; pax: number; bags: number; cat?: string; contact: [string, string, string]; closes?: Date }) => {
      const cutoff = new Date(o.pickup.getTime() - 4 * H);
      const closes = o.closes || new Date(Math.min(now + 12 * H, cutoff.getTime()));
      const id = (await one(`insert into ride_requests (group_id, leg, status, pickup_at, pickup_city, pickup_postcode4, pickup_area_id, dropoff_city, dropoff_postcode4, dropoff_area_id,
          passengers, large_bags, small_bags, vehicle_category, is_airport, bidding_closes_at, booking_cutoff_at, opened_at, created_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,1,$13,true,$14,$15,$16,$16) returning id`,
        [o.group, o.leg, o.status, o.pickup, o.from[0], o.from[1], await area(o.from[2]), o.to[0], o.to[1], await area(o.to[2]), o.pax, o.bags, o.cat || 'personenauto', closes, cutoff, new Date(Math.min(now, closes.getTime() - H))])).id;
      await q(`insert into ride_request_private (ride_request_id, pickup_address, dropoff_address, contact_name) values ($1,$2,$3,$4)`, [id, o.from[3], o.to[3], o.contact[0]]);
      await q(`insert into ride_request_contact (ride_request_id, contact_email, contact_phone) values ($1,$2,$3)`, [id, o.contact[1], o.contact[2]]);
      await q(`insert into status_history (entity_type, entity_id, to_status, actor_role, note) values ('ride_request',$1,$2,'system','Demodata')`, [id, o.status]);
      return id;
    };
    const bid = async (rideId: string, co: string, cents: number, status: string, validUntil: Date, wait = 60) => {
      const { commissionCents, payoutCents } = calculateCommission(cents, rule);
      return (await one(`insert into bids (ride_request_id, company_id, status, total_price_cents, vehicle_category, max_passengers, max_large_bags, included_services, included_wait_minutes,
          flight_delay_policy, cancellation_policy, valid_until, commission_rule_id, commission_cents, payout_cents)
        values ($1,$2,$3,$4,'personenauto',4,2,'{tol_parkeren,vluchtmonitoring}',$5,'Wij volgen de vlucht; wachttijd start bij landing. (demotekst)','Kosteloos annuleren tot 24 uur voor ophalen. (demotekst)',$6,$7,$8,$9) returning id`,
        [rideId, co, status, cents, wait, validUntil, rule.id, commissionCents, payoutCents])).id;
    };
    const K1: [string, string, string] = ['Fictieve Klant Een', 'klant.een@demo.pickmyride.test', '+31 6 0000 0001'];
    const K2: [string, string, string] = ['Fictieve Klant Twee', 'klant.twee@demo.pickmyride.test', '+31 6 0000 0002'];
    const ADAM: [string, number, string, string] = ['Amsterdam', 1017, 'amsterdam', 'Demostraat 10, 1017 AA Amsterdam (fictief)'];
    const SPL: [string, number, string, string] = ['Schiphol', 1118, 'schiphol', 'Vertrekpassage 1, 1118 AP Schiphol'];
    const HLM: [string, number, string, string] = ['Haarlem', 2011, 'noord-holland-nz', 'Demoweg 5, 2011 AB Haarlem (fictief)'];

    // 1) Open aanvraag met twee actieve biedingen
    const g1 = await group(k1, 'enkel');
    const r1 = await ride({ group: g1, leg: 'heen', status: 'open', pickup: at(3 * D), from: ADAM, to: SPL, pax: 2, bags: 2, contact: K1 });
    await bid(r1, c1.id, 5250, 'actief', at(10 * H));
    await bid(r1, c2.id, 4900, 'actief', at(9 * H), 45);
    // 2) Retour: heenrit met één actief en één verlopen bod; terugrit nog zonder biedingen
    const g2 = await group(k2, 'retour');
    const r2a = await ride({ group: g2, leg: 'heen', status: 'open', pickup: at(5 * D), from: HLM, to: SPL, pax: 3, bags: 2, contact: K2 });
    await bid(r2a, c1.id, 6500, 'actief', at(11 * H));
    await bid(r2a, c2.id, 5900, 'verlopen', at(-2 * H));
    await ride({ group: g2, leg: 'terug', status: 'open', pickup: at(12 * D), from: SPL, to: HLM, pax: 3, bags: 2, contact: K2 });

    // Hulpfunctie voor boekingen
    let bn = 900001;
    const booking = async (rideId: string, bidId: string, co: string, cust: string, cents: number, status: string, payStatus: string, refunded = 0) => {
      const { commissionCents, payoutCents } = calculateCommission(cents, rule);
      const res = (await one(`insert into reservations (bid_id, ride_request_id, customer_user_id, status, expires_at, ended_at) values ($1,$2,$3,'omgezet', now(), now()) returning id`, [bidId, rideId, cust])).id;
      const b = (await one(`insert into bookings (booking_number, ride_request_id, bid_id, company_id, customer_user_id, status, total_price_cents, commission_cents, payout_cents, commission_rule_snapshot, vat_note, is_demo,
          cancelled_at, cancellation_reason) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Btw-behandeling nog vast te stellen door boekhouder', true, $11, $12) returning id`,
        ['PMR-DEMO-' + bn++, rideId, bidId, co, cust, status, cents, commissionCents, payoutCents, { id: rule.id, name: rule.name, percent_bp: rule.percent_bp, fixed_cents: rule.fixed_cents, min_cents: rule.min_cents, is_demo: rule.is_demo },
         status === 'geannuleerd' ? new Date() : null, status === 'geannuleerd' ? 'Door klant geannuleerd (demoscenario)' : null])).id;
      const pay = (await one(`insert into payments (reservation_id, ride_request_id, customer_user_id, booking_id, provider, provider_payment_id, amount_cents, refunded_cents, status, is_simulated, paid_at)
        values ($1,$2,$3,$4,'demo',$5,$6,$7,$8,true, now()) returning id`, [res, rideId, cust, b, 'demo_seed_' + bn, cents, refunded, payStatus])).id;
      await q(`insert into payouts (booking_id, company_id, amount_cents, status) values ($1,$2,$3,$4)`, [b, co, status === 'geannuleerd' ? 0 : payoutCents, status === 'afgerond' ? 'gepland' : status === 'geannuleerd' ? 'geblokkeerd' : 'nog_niet_beschikbaar']);
      for (const s of ['bevestigd', ...(status === 'afgerond' ? ['chauffeur_toegewezen', 'onderweg', 'aangekomen', 'passagier_opgehaald', 'afgerond'] : status === 'geannuleerd' ? ['geannuleerd'] : [])])
        await q(`insert into status_history (entity_type, entity_id, to_status, actor_role, note) values ('booking',$1,$2,'system','Demodata')`, [b, s]);
      return { b, pay };
    };
    // 3) Afgeronde rit in het verleden + (fictieve) beoordeling
    const g3 = await group(k1, 'enkel');
    const r3 = await ride({ group: g3, leg: 'heen', status: 'gesloten', pickup: at(-3 * D), from: SPL, to: ADAM, pax: 1, bags: 1, contact: K1, closes: at(-3 * D - 10 * H) });
    const b3 = await bid(r3, c1.id, 4500, 'geaccepteerd', at(-3 * D - 5 * H));
    const bk3 = await booking(r3, b3, c1.id, k1, 4500, 'afgerond', 'geslaagd');
    await q(`insert into reviews (booking_id, company_id, customer_user_id, score_communicatie, score_klantvriendelijkheid, score_comfort_hygiene, score_betrouwbaarheid, score_rijgedrag_veiligheid, body) values ($1,$2,$3,5,5,4,5,4,'Fictieve demobeoordeling — niet echt.')`, [bk3.b, c1.id, k1]);
    // 3b) Afgeronde rit zonder beoordeling (om het beoordelingsformulier te proberen als klant.een)
    const g3b = await group(k1, 'enkel');
    const r3b = await ride({ group: g3b, leg: 'heen', status: 'gesloten', pickup: at(-1 * D), from: ADAM, to: SPL, pax: 2, bags: 2, contact: K1, closes: at(-1 * D - 10 * H) });
    const b3b = await bid(r3b, c2.id, 4700, 'geaccepteerd', at(-1 * D - 5 * H));
    await booking(r3b, b3b, c2.id, k1, 4700, 'afgerond', 'geslaagd');
    // 4) Bevestigde komende boeking, nog zonder chauffeur
    const g4 = await group(k2, 'enkel');
    const r4 = await ride({ group: g4, leg: 'heen', status: 'gesloten', pickup: at(7 * D), from: ADAM, to: SPL, pax: 2, bags: 2, contact: K2 });
    const b4 = await bid(r4, c1.id, 5500, 'geaccepteerd', at(10 * H));
    await booking(r4, b4, c1.id, k2, 5500, 'bevestigd', 'geslaagd');
    // Demo-gesprek bij de komende boeking (fictief)
    const bk4row = await one(`select id, booking_number from bookings where ride_request_id = $1`, [r4]);
    await q(`insert into messages (booking_id, sender_role, body, created_at) values ($1,'system',$2, now() - interval '50 minutes')`, [bk4row.id, `Boeking ${bk4row.booking_number} is bevestigd. Hier kunnen klant en taxibedrijf berichten sturen en via PickMyRide bellen, met afgeschermde nummers.`]);
    await q(`insert into messages (booking_id, sender_role, sender_user_id, body, created_at, read_by_company_at) values ($1,'customer',$2,'Goedemiddag, wij hebben ook een opvouwbare kinderwagen bij ons. Past die erbij?', now() - interval '40 minutes', now() - interval '35 minutes')`, [bk4row.id, k2]);
    await q(`insert into messages (booking_id, sender_role, sender_user_id, body, created_at, read_by_customer_at) values ($1,'company',$2,'Goedemiddag! Ja, dat past. We nemen een stationwagen zodat er ruim plek is.', now() - interval '30 minutes', now() - interval '20 minutes')`, [bk4row.id, c1.user]);
    await q(`insert into messages (booking_id, sender_role, sender_user_id, body, created_at) values ($1,'customer',$2,'Top, dank u wel!', now() - interval '5 minutes')`, [bk4row.id, k2]);
    // 5) Annulering met volledige (gesimuleerde) terugbetaling
    const g5 = await group(k1, 'enkel');
    const r5 = await ride({ group: g5, leg: 'heen', status: 'geannuleerd', pickup: at(10 * D), from: HLM, to: SPL, pax: 2, bags: 1, contact: K1 });
    const b5 = await bid(r5, c2.id, 6100, 'geaccepteerd', at(10 * H));
    const bk5 = await booking(r5, b5, c2.id, k1, 6100, 'geannuleerd', 'volledig_terugbetaald', 6100);
    await q(`insert into refunds (payment_id, booking_id, amount_cents, reason, status, provider_refund_id, is_simulated, initiated_by, processed_at) values ($1,$2,6100,'Annulering binnen kosteloze termijn (demoscenario)','verwerkt','demo_re_seed',true,$3, now())`, [bk5.pay, bk5.b, admin]);
    await q(`insert into audit_logs (actor_user_id, actor_role, action, entity_type, entity_id, details) values ($1,'admin','terugbetaling.gestart','booking',$2,'{"demo": true, "bedrag_cents": 6100}')`, [admin, bk5.b]);
    // 6) Verlopen aanvraag zonder biedingen
    const g6 = await group(k2, 'enkel');
    await ride({ group: g6, leg: 'heen', status: 'verlopen', pickup: at(-1 * D), from: ADAM, to: HLM, pax: 1, bags: 0, contact: K2, closes: at(-1 * D - 6 * H) });

    await q('commit');
    if (!quiet) console.log(`Demodata geladen. Wachtwoord voor alle demo-accounts: ${DEMO_PASSWORD}\n  beheer@demo.pickmyride.test (beheerder)\n  noord@demo.pickmyride.test, airport@demo.pickmyride.test (actieve bedrijven)\n  utrecht@demo.pickmyride.test (in beoordeling)\n  klant.een@demo.pickmyride.test, klant.twee@demo.pickmyride.test (klanten)`);
  } catch (e) { await q('rollback'); throw e; } finally { c.release(); await pool.end(); }
}

if (import.meta.url === `file://${process.argv[1]}`) seedDemo().catch(e => { console.error(e); process.exit(1); });
