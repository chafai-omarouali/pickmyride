/**
 * Acceptatietests voor de eerste versie (zie docs/TESTRESULTATEN.md voor de koppeling met de criteria).
 * Draait tegen een echte PostgreSQL-testdatabase via echte HTTP-verzoeken.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp, Browser, ownerQuery, localDate } from './helpers.ts';

let base = ''; let server: any;
const PW = 'Test-wachtwoord-12345';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const S: Record<string, any> = {};
const errs = (t: string) => [...t.matchAll(/class="(?:error-text|notice notice-fout)[^"]*"[^>]*>(?:<p>)?([^<]+)/g)].map(m => m[1]).join(' | ') || t.slice(0, 300);   // gedeelde toestand tussen de stappen

const reqData = (o: Record<string, string> = {}) => {
  const d = localDate(72);
  return { trip_type: 'enkel', pickup_street: 'Teststraat 1', pickup_postcode: '1012 AB', pickup_city: 'Amsterdam', dropoff_street: 'Evert van de Beekstraat 202',
    dropoff_postcode: '1118 CP', dropoff_city: 'Schiphol', stop_street: '', stop_postcode: '', stop_city: '', date: d.date, time: '10:00', return_date: '', return_time: '',
    flight_number: 'KL1234', return_flight_number: '', passengers: '2', large_bags: '2', small_bags: '1', vehicle_category: 'personenauto', need_seats: '', seat_maxicosi: '0', seat_kinderstoel: '0', seat_verhoger: '0',
    notes: 'Bel me op 06-12345678 of mail klant@voorbeeld.test, graag hulp met bagage', name: 'Test Klant Een', email: 'klant1@pickmyride.test', phone: '0612345678', accept_terms: 'ja', marketing: '', ...o };
};
const companyData = (n: string, kvk: string, email: string, areas = ['amsterdam', 'schiphol']) => ({
  legal_name: `Testbedrijf ${n} B.V.`, trade_name: `Testtaxi ${n}`, kvk_number: kvk, vat_number: '', address_street: 'Bedrijfsweg 1', address_postcode: '1000 AA', address_city: 'Amsterdam',
  contact_name: `Contact ${n}`, email, phone: '0201234567', password: PW, password2: PW, areas, cat_personenauto: 'ja', cat_personenauto_pax: '4', cat_personenauto_bags: '3',
  cat_taxibus: 'ja', cat_taxibus_pax: '8', cat_taxibus_bags: '8', license_number: 'VG-123', license_expires_on: '', accept_agreement: 'ja', doc_vergunning_expires: '2027-06-01',
});
const latestLink = async (email: string) => {
  const [n] = await ownerQuery(`select body_text from notifications where to_address = $1 and body_text like '%/toegang/%' order by created_at desc limit 1`, [email]);
  return '/toegang/' + /\/toegang\/([\w-]+)/.exec(n.body_text)![1];
};
async function bid(b: Browser, rideId: string, price: string, extra: Record<string, string> = {}) {
  const v = localDate(30);
  return b.post(`/bedrijf/aanvragen/${rideId}/bod`, { price, vehicle_category: 'personenauto', max_passengers: '4', max_large_bags: '3', services: ['tol_parkeren', 'vluchtmonitoring'],
    wait_minutes: '60', flight_delay_policy: 'Wachttijd start bij landing, geen meerkosten.', cancellation_policy: 'Kosteloos annuleren tot 24 uur vooraf.', valid_date: v.date, valid_time: v.time, note: '', ...extra });
}

before(async () => {
  ({ server, base } = await startTestApp());
  const { hashPassword } = await import('../src/lib/security.ts');
  await ownerQuery(`insert into users (email, password_hash, role, full_name, email_verified_at) values ('beheer@pickmyride.test', $1, 'admin', 'Test Beheerder', now())`, [hashPassword(PW)]);
});
after(async () => { server?.close(); const { closePool } = await import('../src/lib/db.ts'); await closePool(); });

describe('Acceptatiecriteria', () => {
  const admin = () => S.admin as Browser;

  it('AC1: een klant kan op mobiel een aanvraag plaatsen (gast, met e-mailverificatie)', async () => {
    const klant = new Browser(base);
    const page = await klant.get('/rit-aanvragen');
    assert.equal(page.status, 200);
    assert.match(page.text, /class="card quick-form"[^>]*action="\/rit-aanvragen\/gegevens"/, 'stap 1 is hetzelfde formulier als op de homepage');
    assert.match(page.text, /name="viewport" content="width=device-width/);
    const res = await klant.post('/rit-aanvragen', reqData());
    assert.equal(res.status, 303, res.text.slice(0, 500));
    assert.match(res.location!, /\/aanvraag-ontvangen\?ref=AV-\d+&v=1/);
    const [g] = await ownerQuery(`select g.id, r.status, r.id as ride_id, r.notes_for_bidders from request_groups g join ride_requests r on r.group_id = g.id order by g.created_at desc limit 1`);
    assert.equal(g.status, 'concept', 'vóór e-mailbevestiging is de aanvraag nog niet zichtbaar voor bedrijven');
    assert.doesNotMatch(g.notes_for_bidders, /06-12345678|klant@voorbeeld/, 'contactgegevens zijn uit de opmerking voor bieders verwijderd');
    const link = await klant.get(await latestLink('klant1@pickmyride.test'));
    assert.equal(link.status, 303);
    assert.equal(link.location, `/mijn/aanvragen/${g.id}`);
    const [r] = await ownerQuery('select status from ride_requests where id = $1', [g.ride_id]);
    assert.equal(r.status, 'open');
    assert.equal((await klant.get(await latestLink('klant1@pickmyride.test').catch(() => '/toegang/x'))).status, 410, 'een link is eenmalig');
    S.klant1 = klant; S.group1 = g.id; S.ride1 = g.ride_id;
  });

  it('AC1b: server-side validatie van de aanvraag', async () => {
    const b = new Browser(base);
    const same = await b.post('/rit-aanvragen', reqData({ dropoff_street: 'Teststraat 1', dropoff_postcode: '1012AB', dropoff_city: 'Amsterdam' }));
    assert.equal(same.status, 422); assert.match(same.text, /mogen niet gelijk zijn/);
    const soon = await b.post('/rit-aanvragen', reqData({ ...localDate(5) }));
    assert.equal(soon.status, 422); assert.match(soon.text, /minimaal 24 uur van tevoren/);
    const tooMany = await b.post('/rit-aanvragen', reqData({ passengers: '6' }));
    assert.equal(tooMany.status, 422); assert.match(tooMany.text, /maximaal 4 personen/);
    const back = await b.post('/rit-aanvragen', reqData({ trip_type: 'retour', return_date: localDate(48).date, return_time: '10:00' }));
    assert.equal(back.status, 422); assert.match(back.text, /terugrit moet na de heenrit/);
    const noTerms = await b.post('/rit-aanvragen', reqData({ accept_terms: '' }));
    assert.equal(noTerms.status, 422); assert.match(noTerms.text, /Ga akkoord/);
    const noCsrf = await b.post('/rit-aanvragen', reqData(), { noCsrf: true });
    assert.equal(noCsrf.status, 403, 'formulier zonder CSRF-token wordt geweigerd');
  });

  it('AC2: een beheerder kan een taxibedrijf goedkeuren (incl. privé documentupload)', async () => {
    const a = new Browser(base, 'desktop'); await a.login('beheer@pickmyride.test', PW); S.admin = a;
    const regs = [['A', '10000001', 'a@taxi.test'], ['B', '10000002', 'b@taxi.test'], ['C', '10000003', 'c@taxi.test'], ['D', '10000004', 'd@taxi.test']];
    for (const [n, kvk, email] of regs) {
      const b = new Browser(base, 'desktop');
      const r = await b.postMultipart('/aanmelden-taxibedrijf', companyData(n, kvk, email), n === 'A' ? [{ field: 'doc_vergunning', name: 'vergunning.pdf', type: 'application/pdf', data: PDF }] : []);
      assert.equal(r.status, 303, errs(r.text));
    }
    const bad = await new Browser(base).postMultipart('/aanmelden-taxibedrijf', companyData('X', '10000009', 'x@taxi.test'), [{ field: 'doc_kvk', name: 'virus.pdf', type: 'application/pdf', data: Buffer.from('MZ-not-a-pdf') }]);
    assert.equal(bad.status, 422); assert.match(bad.text, /Alleen PDF, JPG of PNG/);
    const companies = await ownerQuery(`select id, trade_name, status from companies order by kvk_number`);
    assert.ok(companies.every(c => c.status === 'in_beoordeling'));
    S.companies = Object.fromEntries(companies.map(c => [c.trade_name.slice(-1), c.id]));

    // Niet-goedgekeurd bedrijf kan niet bieden
    const A = new Browser(base, 'desktop'); await A.login('a@taxi.test', PW); S.A = A;
    assert.equal((await A.get(`/bedrijf/aanvragen/${S.ride1}`)).status, 404);
    assert.equal((await bid(A, S.ride1, '55,00')).status, 404);

    for (const k of ['A', 'B', 'C', 'D']) {
      const r = await a.post(`/beheer/bedrijven/${S.companies[k]}/status`, { to: 'actief', note: '' });
      assert.equal(r.status, 303);
    }
    const [doc] = await ownerQuery(`select id, storage_key, verification_status from company_documents limit 1`);
    assert.equal(doc.verification_status, 'niet_gecontroleerd', 'upload wordt niet automatisch als gecontroleerd gezien');
    assert.equal((await new Browser(base).get(`/documenten/${doc.id}`)).status, 303, 'document niet publiek bereikbaar');
    const dl = await a.get(`/documenten/${doc.id}`); assert.equal(dl.status, 200); assert.match(dl.text, /^%PDF/);
    await a.post(`/beheer/documenten/${doc.id}/controle`, { verdict: 'goedgekeurd', note: 'Vergunning gecontroleerd' });
    const [d2] = await ownerQuery(`select verification_status, verified_by, verified_at from company_documents where id = $1`, [doc.id]);
    assert.equal(d2.verification_status, 'goedgekeurd'); assert.ok(d2.verified_by && d2.verified_at, 'wie en wanneer gecontroleerd is vastgelegd');
    const B = new Browser(base, 'desktop'); await B.login('b@taxi.test', PW); S.B = B;
    assert.equal((await B.get(`/documenten/${doc.id}`)).status, 404, 'ander bedrijf kan het document niet openen');
  });

  it('AC3: een goedgekeurd bedrijf kan op een passende aanvraag bieden (met commissie-uitleg)', async () => {
    const list = await S.A.get('/bedrijf/aanvragen');
    assert.match(list.text, new RegExp(`/bedrijf/aanvragen/${S.ride1}`), 'passende aanvraag staat in de lijst van het bedrijf');
    assert.doesNotMatch(list.text, /Test Klant Een|Teststraat/);
    const page = await S.A.get(`/bedrijf/aanvragen/${S.ride1}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /Platformcommissie/); assert.match(page.text, /Verwachte uitbetaling/); assert.match(page.text, /DEMO-instelling/);
    assert.doesNotMatch(page.text, /Test Klant Een|klant1@pickmyride\.test|0612345678|Teststraat 1/, 'geen persoonsgegevens vóór boeking');
    const r = await bid(S.A, S.ride1, '55,00');
    assert.equal(r.status, 303, errs(r.text));
    const [b] = await ownerQuery(`select id, total_price_cents, commission_cents, payout_cents, status from bids where company_id = $1`, [S.companies.A]);
    assert.deepEqual([b.total_price_cents, b.commission_cents, b.payout_cents, b.status], [5500, 660, 4840, 'actief']);
    S.bidA = b.id;
    const dup = await bid(S.A, S.ride1, '50,00');   // tweede bod = aanpassing van het bestaande
    assert.equal(dup.status, 303);
    assert.equal((await ownerQuery(`select count(*)::int n from bids where company_id = $1 and ride_request_id = $2`, [S.companies.A, S.ride1]))[0].n, 1, 'maximaal één actief bod per rit');
    const hidden = await bid(S.A, S.ride1, '50,00', { note: 'Bel ons op 020-1234567' });
    assert.equal(hidden.status, 422);
    // Intrekken en daarna opnieuw bieden moet kunnen
    assert.equal((await S.A.post(`/bedrijf/biedingen/${S.bidA}/intrekken`, {})).status, 303);
    assert.match((await S.A.get(`/bedrijf/aanvragen/${S.ride1}`)).text, /U kunt een nieuw bod uitbrengen/);
    assert.equal((await bid(S.A, S.ride1, '50,00')).status, 303);
    S.bidA = (await ownerQuery(`select id from bids where company_id = $1 and status = 'actief'`, [S.companies.A]))[0].id;
  });

  it('AC4: een ander bedrijf kan dat bod niet zien (server en database)', async () => {
    for (const [k, p] of [['B', '48,00'], ['C', '61,00'], ['D', '57,50']]) { const B = new Browser(base, 'desktop'); await B.login(`${k.toLowerCase()}@taxi.test`, PW); S[k] = B; const rr = await bid(B, S.ride1, p); assert.equal(rr.status, 303, errs(rr.text)); }
    assert.doesNotMatch((await S.A.get('/bedrijf/aanvragen')).text, new RegExp(S.ride1), 'na bieden verdwijnt de aanvraag uit "beschikbaar"');
    const mine = await S.B.get('/bedrijf/biedingen');
    assert.match(mine.text, /48,00/); assert.doesNotMatch(mine.text, /50,00|61,00|57,50/);
    const { withActor } = await import('../src/lib/db.ts');
    const seen = await withActor({ userId: null, role: 'company', companyId: S.companies.B }, tx => tx.query('select id, total_price_cents from bids'));
    assert.equal(seen.rows.length, 1, 'RLS: bedrijf B ziet alleen het eigen bod');
    const tamper = await withActor({ userId: null, role: 'company', companyId: S.companies.B }, tx => tx.query(`update bids set total_price_cents = 1 where id = $1`, [S.bidA]));
    assert.equal(tamper.rowCount, 0, 'RLS: bedrijf B kan het bod van A niet wijzigen');
  });

  it('AC5: de klant kan aanbiedingen vergelijken (max. 3 zichtbaar, alle te openen, sorteren)', async () => {
    const page = await S.klant1.get(`/mijn/aanvragen/${S.group1}`);
    assert.equal(page.status, 200);
    assert.equal((page.text.match(/Kies dit aanbod/g) || []).length, 4);
    assert.equal((page.text.match(/<li hidden=""/g) || []).length, 1, 'het vierde aanbod is standaard verborgen');
    assert.match(page.text, /Toon alle 4 aanbiedingen/);
    assert.match(page.text, /Nog geen beoordelingen/);
    assert.doesNotMatch(page.text, /beste keuze/i);
    const order = [...page.text.matchAll(/Testtaxi ([A-D])/g)].map(m => m[1]);
    assert.deepEqual(order.slice(0, 4), ['B', 'A', 'D', 'C'], 'gesorteerd op laagste prijs');
    const all = await S.klant1.get(`/mijn/aanvragen/${S.group1}?alle=1`);
    assert.equal((all.text.match(/<li hidden=""/g) || []).length, 0);
  });

  it('AC5b: een bedrijf kan foto\'s toevoegen; klanten zien ze bij het aanbod, beheer kan ze verbergen', async () => {
    const fs = await import('node:fs');
    const img = fs.readFileSync(new URL('../public/img/foto/lange-rit.webp', import.meta.url));
    const bad = await S.B.postMultipart('/bedrijf/fotos', {}, [{ field: 'photos', name: 'nep.jpg', type: 'image/jpeg', data: Buffer.from('MZ-geen-afbeelding') }]);
    assert.equal(bad.status, 303);
    assert.equal((await ownerQuery(`select count(*)::int n from company_photos where company_id = $1`, [S.companies.B]))[0].n, 0, 'geen afbeelding = niet opgeslagen');
    const up = await S.B.postMultipart('/bedrijf/fotos', {}, [{ field: 'photos', name: 'auto.webp', type: 'image/webp', data: img }]);
    assert.equal(up.status, 303);
    const [ph] = await ownerQuery(`select id, mime_type, width, height, hidden_by_staff from company_photos where company_id = $1`, [S.companies.B]);
    assert.equal(ph.mime_type, 'image/webp'); assert.ok(ph.width >= 400 && ph.height >= 300);
    assert.match((await S.klant1.get(`/mijn/aanvragen/${S.group1}?alle=1`)).text, new RegExp(`/bedrijfsfoto/${ph.id}`), 'klant ziet de foto bij het aanbod');
    const pub = await new Browser(base).get(`/bedrijfsfoto/${ph.id}`);
    assert.equal(pub.status, 200);
    assert.equal((await S.C.post(`/bedrijf/fotos/${ph.id}/verwijderen`, {})).status, 404, 'ander bedrijf kan de foto niet verwijderen');
    assert.equal((await S.admin.post(`/beheer/fotos/${ph.id}/zichtbaarheid`, { hidden: 'ja', reason: 'Kenteken leesbaar' })).status, 303);
    assert.equal((await new Browser(base).get(`/bedrijfsfoto/${ph.id}`)).status, 404, 'verborgen foto is niet meer publiek');
    assert.doesNotMatch((await S.klant1.get(`/mijn/aanvragen/${S.group1}?alle=1`)).text, new RegExp(ph.id));
    assert.match((await S.B.get('/bedrijf/fotos')).text, /Kenteken leesbaar/, 'bedrijf ziet waarom de foto verborgen is');
    const { withActor } = await import('../src/lib/db.ts');
    await assert.rejects(withActor({ userId: null, role: 'company', companyId: S.companies.B }, tx => tx.query(`update company_photos set hidden_by_staff = false where id = $1`, [ph.id])), 'bedrijf kan verbergen niet zelf ongedaan maken');
    assert.equal((await S.B.post(`/bedrijf/fotos/${ph.id}/verwijderen`, {})).status, 303);
    assert.equal((await ownerQuery(`select count(*)::int n from company_photos where company_id = $1`, [S.companies.B]))[0].n, 0);
  });

  it('AC6: een geldig aanbod kan tijdelijk gereserveerd worden', async () => {
    const r = await S.klant1.post(`/mijn/aanbod/${S.bidA}/kiezen`, {});
    assert.equal(r.status, 303); assert.match(r.location!, /^\/demo-betaalomgeving\/demo_tr_/);
    S.checkout = r.location;
    const [b] = await ownerQuery('select status from bids where id = $1', [S.bidA]);
    assert.equal(b.status, 'gereserveerd');
    const [res] = await ownerQuery(`select status, extract(epoch from expires_at - created_at)::int as secs from reservations where bid_id = $1`, [S.bidA]);
    assert.equal(res.status, 'actief'); assert.ok(res.secs >= 590 && res.secs <= 600, 'standaard 10 minuten');
    const bOther = (await ownerQuery(`select id from bids where company_id = $1`, [S.companies.B]))[0].id;
    const second = await S.klant1.post(`/mijn/aanbod/${bOther}/kiezen`, {});
    assert.equal(second.status, 409, 'geen tweede reservering op dezelfde rit');
    const page = await S.klant1.get(S.checkout); assert.match(page.text, /GEEN ECHTE BETALING/);
  });

  it('AC7 + AC8: geslaagde testbetaling levert precies één boeking op; dubbele webhook geen tweede', async () => {
    const [pay] = await ownerQuery(`select id, provider_payment_id from payments where status = 'in_behandeling'`);
    const back = await S.klant1.get(`/betaling/${pay.id}`);
    assert.match(back.text, /wachten op de bevestiging/, 'terugkeerpagina alleen is geen bewijs van betaling');
    assert.equal((await ownerQuery('select count(*)::int n from bookings'))[0].n, 0);

    const r = await S.klant1.post(S.checkout, { outcome: 'paid' });
    assert.equal(r.status, 303);
    const bookings = await ownerQuery('select id, booking_number, status, commission_rule_snapshot, total_price_cents from bookings');
    assert.equal(bookings.length, 1); assert.match(bookings[0].booking_number, /^PMR-\d+$/);
    assert.equal(bookings[0].commission_rule_snapshot.percent_bp, 1200);
    S.booking1 = bookings[0].id;
    const bids = await ownerQuery(`select status, count(*)::int n from bids where ride_request_id = $1 group by status order by status`, [S.ride1]);
    assert.deepEqual(bids.map(b => [b.status, b.n]), [['geaccepteerd', 1], ['ingetrokken', 1], ['niet_gekozen', 3]]);
    assert.equal((await ownerQuery('select status from ride_requests where id = $1', [S.ride1]))[0].status, 'gesloten');
    const mails = await ownerQuery(`select template from notifications where template in ('boeking_bevestigd','bod_geaccepteerd')`);
    assert.equal(mails.length, 2);

    const { demoProvider } = await import('../src/integrations/payments/demo.ts');
    const ev = demoProvider.signedEvent(pay.provider_payment_id, 'evt_herhaling');
    const send = (e: { body: string; signature: string }) => fetch(base + '/api/webhooks/betalingen', { method: 'POST', body: e.body, headers: { 'Content-Type': 'application/json', 'X-PickMyRide-Signature': e.signature } });
    assert.equal((await send(ev)).status, 200); assert.equal((await send(ev)).status, 200);   // exact dezelfde melding twee keer
    assert.equal((await send(demoProvider.signedEvent(pay.provider_payment_id))).status, 200);   // nieuwe melding, zelfde betaling
    await Promise.all(Array.from({ length: 5 }, () => send(demoProvider.signedEvent(pay.provider_payment_id))));   // gelijktijdig
    assert.equal((await ownerQuery('select count(*)::int n from bookings')).at(0).n, 1, 'nog steeds precies één boeking');
    const forged = await fetch(base + '/api/webhooks/betalingen', { method: 'POST', body: ev.body, headers: { 'X-PickMyRide-Signature': 'ongeldig' } });
    assert.equal(forged.status, 400, 'webhook met ongeldige handtekening geweigerd');
    const conf = await S.klant1.get(`/betaling/${pay.id}`); assert.match(conf.text, /je rit is geboekt/);
  });

  it('AC9: een verlopen bod kan niet meer gekocht worden', async () => {
    const k2 = new Browser(base);
    assert.equal((await k2.post('/rit-aanvragen', reqData({ email: 'klant2@pickmyride.test', name: 'Test Klant Twee' }))).status, 303);
    await k2.get(await latestLink('klant2@pickmyride.test'));
    const [ride] = await ownerQuery(`select r.id, r.group_id from ride_requests r join request_groups g on g.id = r.group_id join users u on u.id = g.customer_user_id where u.email = 'klant2@pickmyride.test'`);
    await bid(S.B, ride.id, '45,00'); await bid(S.C, ride.id, '47,00');
    const [b] = await ownerQuery(`select id from bids where ride_request_id = $1 and company_id = $2`, [ride.id, S.companies.B]);
    await ownerQuery(`update bids set valid_until = now() - interval '1 minute' where id = $1`, [b.id]);
    const r = await k2.post(`/mijn/aanbod/${b.id}/kiezen`, {});
    assert.equal(r.status, 409); assert.match(r.text, /verlopen/);
    const page = await k2.get(`/mijn/aanvragen/${ride.group_id}`);
    assert.doesNotMatch(page.text, /Testtaxi B/, 'verlopen aanbod wordt niet meer getoond');
    S.klant2 = k2; S.ride2 = ride.id; S.group2 = ride.group_id;
  });

  it('AC10: twee gelijktijdige acties veroorzaken geen dubbele toewijzing', async () => {
    const bids = await ownerQuery(`select id from bids where ride_request_id = $1 and status = 'actief'`, [S.ride2]);
    await bid(S.D, S.ride2, '44,00');
    const all = await ownerQuery(`select id from bids where ride_request_id = $1 and status = 'actief'`, [S.ride2]);
    assert.ok(all.length >= 2 && bids.length >= 1);
    const { chooseOffer } = await import('../src/domain/booking.ts');
    const [u] = await ownerQuery(`select id from users where email = 'klant2@pickmyride.test'`);
    const actor = { userId: u.id, role: 'customer' as const, companyId: null };
    const results = await Promise.allSettled([...all.map(b => chooseOffer(actor, b.id)), ...all.map(b => chooseOffer(actor, b.id))]);
    const ok = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const reserved = await ownerQuery(`select count(*)::int n from bids where ride_request_id = $1 and status = 'gereserveerd'`, [S.ride2]);
    const active = await ownerQuery(`select count(*)::int n from reservations where ride_request_id = $1 and status = 'actief'`, [S.ride2]);
    assert.equal(reserved[0].n, 1, 'precies één bod gereserveerd'); assert.equal(active[0].n, 1, 'precies één actieve reservering');
    assert.equal(new Set(ok.map(r => r.value.paymentId)).size, 1, 'alle geslaagde pogingen verwijzen naar dezelfde betaling');
    // Gelijktijdige bevestiging van dezelfde betaling
    const [pay] = await ownerQuery(`select provider_payment_id from payments where ride_request_id = $1 and status = 'in_behandeling'`, [S.ride2]);
    const { demoProvider } = await import('../src/integrations/payments/demo.ts');
    (demoProvider.lookup(pay.provider_payment_id) as any).status = 'paid';
    const { processPaymentStatus } = await import('../src/domain/booking.ts');
    await Promise.all(Array.from({ length: 6 }, () => processPaymentStatus(pay.provider_payment_id, 'paid')));
    assert.equal((await ownerQuery(`select count(*)::int n from bookings where ride_request_id = $1`, [S.ride2]))[0].n, 1);
  });

  it('AC11: alleen het toegewezen bedrijf kan de volledige klantgegevens bekijken', async () => {
    const page = await S.A.get(`/bedrijf/ritten/${S.booking1}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /Test Klant Een/); assert.match(page.text, /Teststraat 1/); assert.match(page.text, /KL1234/);
    assert.doesNotMatch(page.text, /0612345678|klant1@pickmyride\.test/, 'telefoon en e-mail van de klant blijven ook voor het toegewezen bedrijf afgeschermd');
    const { withActor: wa } = await import('../src/lib/db.ts');
    const ownContact = await wa({ userId: null, role: 'company', companyId: S.companies.A }, tx => tx.query('select * from ride_request_contact'));
    assert.equal(ownContact.rows.length, 0, 'RLS: ook het toegewezen bedrijf kan contactgegevens niet opvragen');
    assert.equal((await S.B.get(`/bedrijf/ritten/${S.booking1}`)).status, 404);
    const { withActor } = await import('../src/lib/db.ts');
    const rows = await withActor({ userId: null, role: 'company', companyId: S.companies.B }, tx => tx.query('select * from ride_request_private'));
    assert.equal(rows.rows.length, 0, 'RLS: verliezend bedrijf ziet geen privégegevens');
    const ride = await S.B.get(`/bedrijf/aanvragen/${S.ride1}`);
    assert.doesNotMatch(ride.text, /Test Klant Een|0612345678|Teststraat/);
  });

  it('AC12: de uitvoerder kan chauffeur en voertuig toewijzen; operationele statussen volgen de regels', async () => {
    assert.equal((await S.A.post('/bedrijf/wagenpark/chauffeur', { full_name: 'Chauffeur Test', phone: '0611111111' })).status, 303);
    assert.equal((await S.A.post('/bedrijf/wagenpark/voertuig', { description: 'Testauto zwart', license_plate: 'XX-123-X', max_passengers: '4', category_code: 'personenauto' })).status, 303);
    await S.B.post('/bedrijf/wagenpark/chauffeur', { full_name: 'Chauffeur Ander Bedrijf', phone: '0622222222' });
    const [dA] = await ownerQuery(`select id from drivers where company_id = $1`, [S.companies.A]);
    const [dB] = await ownerQuery(`select id from drivers where company_id = $1`, [S.companies.B]);
    const [vA] = await ownerQuery(`select id from vehicles where company_id = $1`, [S.companies.A]);
    const early = await S.A.post(`/bedrijf/ritten/${S.booking1}/status`, { to: 'onderweg' });
    assert.equal(early.status, 409, 'onderweg kan pas na toewijzing');
    assert.equal((await S.A.post(`/bedrijf/ritten/${S.booking1}/toewijzen`, { driver_id: dB.id, vehicle_id: vA.id })).status, 400, 'chauffeur van een ander bedrijf niet toegestaan');
    assert.equal((await S.A.post(`/bedrijf/ritten/${S.booking1}/toewijzen`, { driver_id: dA.id, vehicle_id: vA.id })).status, 303);
    assert.equal((await ownerQuery('select status from bookings where id = $1', [S.booking1]))[0].status, 'chauffeur_toegewezen');
    assert.equal((await S.A.post(`/bedrijf/ritten/${S.booking1}/status`, { to: 'afgerond' })).status, 409, 'niet toegestane statussprong');
    for (const s of ['onderweg', 'aangekomen']) assert.equal((await S.A.post(`/bedrijf/ritten/${S.booking1}/status`, { to: s })).status, 303);
    const cust = await S.klant1.get(`/mijn/boekingen/${S.booking1}`);
    assert.match(cust.text, /geen live GPS-tracking/); assert.match(cust.text, /Aangekomen/);
    const { withActor } = await import('../src/lib/db.ts');
    await assert.rejects(withActor({ userId: null, role: 'company', companyId: S.companies.A }, tx => tx.query('update bookings set total_price_cents = 1 where id = $1', [S.booking1])), /niet wijzigen/, 'database blokkeert prijswijziging door bedrijf');
  });

  it('Beoordelingen: vijf onderdelen, alleen na afgeronde rit, één keer, niet aanpasbaar door bedrijf, moderatie met reden', async () => {
    const scores = { score_communicatie: '5', score_klantvriendelijkheid: '4', score_comfort_hygiene: '4', score_betrouwbaarheid: '5', score_rijgedrag_veiligheid: '3', body: 'Prima rit, iets te hard gereden.' };
    const early = await S.klant1.post(`/mijn/boekingen/${S.booking1}/beoordeling`, scores);
    assert.equal(early.status, 422); assert.match(early.text, /pas een beoordeling plaatsen nadat de rit is afgerond/);
    for (const s of ['passagier_opgehaald', 'afgerond']) assert.equal((await S.A.post(`/bedrijf/ritten/${S.booking1}/status`, { to: s })).status, 303);
    const page = await S.klant1.get(`/mijn/boekingen/${S.booking1}`);
    for (const t of ['Communicatie', 'Klantvriendelijkheid', 'Comfort &amp; hygiëne', 'Betrouwbaarheid', 'Rijgedrag &amp; veiligheid']) assert.match(page.text, new RegExp(t));
    const missing = await S.klant1.post(`/mijn/boekingen/${S.booking1}/beoordeling`, { ...scores, score_rijgedrag_veiligheid: '' });
    assert.equal(missing.status, 422); assert.match(missing.text, /score van 1 tot 5 voor rijgedrag/);
    assert.equal((await S.klant1.post(`/mijn/boekingen/${S.booking1}/beoordeling`, { ...scores, score_communicatie: '9' })).status, 422);
    assert.equal((await S.klant2.post(`/mijn/boekingen/${S.booking1}/beoordeling`, scores)).status, 404, 'andere klant kan niet beoordelen');
    const ok = await S.klant1.post(`/mijn/boekingen/${S.booking1}/beoordeling`, scores);
    assert.equal(ok.status, 303, errs(ok.text));
    const [r] = await ownerQuery('select id, score, company_id from reviews where booking_id = $1', [S.booking1]);
    assert.equal(Number(r.score), 4.2, 'gemiddelde (5+4+4+5+3)/5'); assert.equal(r.company_id, S.companies.A);
    const again = await S.klant1.post(`/mijn/boekingen/${S.booking1}/beoordeling`, scores);
    assert.equal(again.status, 422); assert.match(again.text, /al een beoordeling geplaatst/);
    assert.equal((await ownerQuery('select count(*)::int n from reviews')).at(0).n, 1);
    // Bedrijf ziet het, kan het niet wijzigen
    const cp = await S.A.get('/bedrijf/beoordelingen'); assert.equal(cp.status, 200); assert.match(cp.text, /4,2/); assert.match(cp.text, /iets te hard gereden/);
    const { withActor } = await import('../src/lib/db.ts');
    const upd = await withActor({ userId: null, role: 'company', companyId: S.companies.A }, tx => tx.query('update reviews set score_rijgedrag_veiligheid = 5 where id = $1', [r.id]));
    assert.equal(upd.rowCount, 0, 'RLS: bedrijf kan scores niet aanpassen');
    assert.equal((await S.B.get('/bedrijf/beoordelingen')).text.includes('iets te hard'), false, 'ander bedrijf ziet het niet in eigen overzicht');
    // Zichtbaar bij volgende aanbiedingen van A, met gemiddelden per onderdeel
    const [u3] = await ownerQuery(`select g.id from request_groups g join users u on u.id = g.customer_user_id where u.email = 'klant3@pickmyride.test'`).catch(() => [undefined]);
    const offers = await S.klant2.get(`/mijn/aanvragen/${S.group2}`);
    void u3; void offers;
    const [pub] = await ownerQuery('select rating_avg, rating_count, avg_rijgedrag_veiligheid from company_public where id = $1', [S.companies.A]);
    assert.equal(Number(pub.rating_avg), 4.2); assert.equal(pub.rating_count, 1); assert.equal(Number(pub.avg_rijgedrag_veiligheid), 3);
    // Moderatie
    await assert.rejects(ownerQuery(`update reviews set status = 'verborgen' where id = $1`, [r.id]), /reden/, 'database eist een reden');
    assert.equal((await S.admin.post(`/beheer/beoordelingen/${r.id}`, { to: 'verborgen', reason: '' })).status, 400);
    assert.equal((await S.admin.post(`/beheer/beoordelingen/${r.id}`, { to: 'verborgen', reason: 'Test: bevat persoonsgegevens' })).status, 303);
    await assert.rejects(ownerQuery(`update reviews set body = 'aangepast' where id = $1`, [r.id]), /niet worden gewijzigd/, 'inhoud onveranderbaar, ook voor beheer');
    const [pub2] = await ownerQuery('select rating_count from company_public where id = $1', [S.companies.A]);
    assert.equal(pub2.rating_count, 0, 'verborgen beoordeling telt niet mee');
    assert.match((await S.A.get('/bedrijf/beoordelingen')).text, /bevat persoonsgegevens/, 'bedrijf ziet de moderatiereden');
    assert.ok((await ownerQuery(`select 1 from audit_logs where action = 'beoordeling.gemodereerd'`)).length);
    await S.admin.post(`/beheer/beoordelingen/${r.id}`, { to: 'gepubliceerd', reason: 'Na controle teruggezet' });
  });

  it('Communicatie: chat en afgeschermd bellen per boeking, alleen deelnemers, binnen het contactvenster', async () => {
    const cust = await S.klant1.get(`/mijn/boekingen/${S.booking1}`);
    assert.match(cust.text, /Contact met Testtaxi A/); assert.match(cust.text, /Bellen via PickMyRide/);
    assert.match(cust.text, /Boeking PMR-\d+ is bevestigd/, 'systeembericht bij bevestiging');
    // klant stuurt bericht, bedrijf ziet het als ongelezen en leest het
    assert.equal((await S.klant1.post(`/mijn/boekingen/${S.booking1}/bericht`, { body: 'Ik sta bij uitgang 2, blauwe koffer.' })).status, 303);
    assert.match((await S.A.get('/bedrijf/ritten')).text, /1 nieuw/);
    const comp = await S.A.get(`/bedrijf/ritten/${S.booking1}`);
    assert.match(comp.text, /Ik sta bij uitgang 2/); assert.doesNotMatch((await S.A.get('/bedrijf/ritten')).text, /1 nieuw/, 'gelezen na openen');
    assert.equal((await S.A.post(`/bedrijf/ritten/${S.booking1}/bericht`, { body: 'Prima, de chauffeur staat er om 10:00.' })).status, 303);
    const api = await S.klant1.get(`/api/boekingen/${S.booking1}/berichten?na=1970-01-01T00:00:00Z`);
    const rows = JSON.parse(api.text);
    assert.ok(rows.some((m: any) => m.role === 'company' && /chauffeur staat er/.test(m.body)));
    assert.ok((await ownerQuery(`select 1 from notifications where template = 'nieuw_bericht'`)).length >= 2, 'e-mailmelding naar beide kanten');
    // geen telefoonnummers of e-mail in de chat
    await S.klant1.post(`/mijn/boekingen/${S.booking1}/bericht`, { body: 'Bel me op 06 1234 5678' });
    assert.match((await S.klant1.get(`/mijn/boekingen/${S.booking1}`)).text, /Deel geen telefoonnummers/);
    assert.equal((await ownerQuery(`select count(*)::int n from messages where body like '%1234 5678%'`))[0].n, 0);
    // niet-deelnemers
    assert.equal((await S.B.get(`/bedrijf/ritten/${S.booking1}`)).status, 404);
    assert.equal((await S.B.post(`/bedrijf/ritten/${S.booking1}/bericht`, { body: 'hallo' })).status, 404);
    assert.equal((await S.klant2.get(`/api/boekingen/${S.booking1}/berichten`)).status, 404);
    const { withActor } = await import('../src/lib/db.ts');
    const otherSees = await withActor({ userId: null, role: 'company', companyId: S.companies.B }, tx => tx.query('select * from messages where booking_id = $1', [S.booking1]));
    assert.equal(otherSees.rows.length, 0, 'RLS: ander bedrijf ziet geen berichten');
    await assert.rejects(withActor({ userId: null, role: 'company', companyId: S.companies.A }, tx => tx.query(`update messages set body = 'x' where booking_id = $1`, [S.booking1])), /permission|niet worden gewijzigd/);
    // bellen: standaard niet aangesloten -> duidelijke melding, sessie geregistreerd, geen nummers
    const call = await S.klant1.post(`/mijn/boekingen/${S.booking1}/bellen`, {});
    assert.equal(call.status, 303);
    assert.match((await S.klant1.get(`/mijn/boekingen/${S.booking1}`)).text, /nog niet aangesloten/);
    const [cs] = await ownerQuery(`select status, provider from call_sessions where booking_id = $1`, [S.booking1]);
    assert.deepEqual([cs.status, cs.provider], ['niet_beschikbaar', 'geen']);
    // demo-provider: gesimuleerd en gemarkeerd
    process.env.CALL_PROVIDER = 'demo';
    await S.A.post(`/bedrijf/ritten/${S.booking1}/bellen`, {});
    const after = await S.A.get(`/bedrijf/ritten/${S.booking1}`);
    assert.match(after.text, /DEMO: in het echt belt PickMyRide/); assert.match(after.text, /DEMO: gesprek gesimuleerd/);
    const [demoCall] = await ownerQuery(`select status, is_simulated from call_sessions where provider = 'demo'`);
    assert.deepEqual([demoCall.status, demoCall.is_simulated], ['afgerond', true]);
    delete process.env.CALL_PROVIDER;
    // contactvenster: na sluiten geen berichten/bellen meer
    await ownerQuery(`update platform_settings set value = '-10000' where key = 'contact_hours_after_ride'`);
    assert.match((await S.klant1.get(`/mijn/boekingen/${S.booking1}`)).text, /contactvenster is gesloten/);
    await S.klant1.post(`/mijn/boekingen/${S.booking1}/bericht`, { body: 'Nog een vraag' });
    assert.equal((await ownerQuery(`select count(*)::int n from messages where body = 'Nog een vraag'`))[0].n, 0);
    assert.equal((await S.klant1.post(`/mijn/boekingen/${S.booking1}/bellen`, {})).status, 409);
    await ownerQuery(`update platform_settings set value = '24' where key = 'contact_hours_after_ride'`);
    // beheer: inzien en verbergen met reden
    const [msg] = await ownerQuery(`select id from messages where body like 'Ik sta bij%'`);
    assert.equal((await S.admin.post(`/beheer/berichten/${msg.id}/verbergen`, { reason: '' })).status, 400);
    assert.equal((await S.admin.post(`/beheer/berichten/${msg.id}/verbergen`, { reason: 'Test moderatie' })).status, 303);
    assert.match((await S.A.get(`/bedrijf/ritten/${S.booking1}`)).text, /door PickMyRide verborgen/);
    assert.doesNotMatch((await S.A.get(`/bedrijf/ritten/${S.booking1}`)).text, /uitgang 2/);
    assert.match((await S.admin.get(`/beheer/boekingen/${S.booking1}`)).text, /Verborgen door Test Beheerder: Test moderatie/);
  });

  it('AC14: klanten en bedrijven kunnen geen gegevens van andere accounts opvragen', async () => {
    assert.equal((await S.klant2.get(`/mijn/aanvragen/${S.group1}`)).status, 404);
    assert.equal((await S.klant2.get(`/mijn/boekingen/${S.booking1}`)).status, 404);
    const [p1] = await ownerQuery(`select id from payments where ride_request_id = $1 limit 1`, [S.ride1]);
    assert.equal((await S.klant2.get(`/betaling/${p1.id}`)).status, 404);
    assert.equal((await S.klant2.post(`/mijn/aanbod/${S.bidA}/kiezen`, {})).status, 404);
    assert.equal((await S.klant1.get('/beheer')).status, 403);
    assert.equal((await S.klant1.get('/bedrijf')).status, 403);
    assert.equal((await S.A.get('/mijn')).status, 403);
    assert.equal((await S.A.get('/beheer/bedrijven')).status, 403);
    assert.equal((await new Browser(base).get('/mijn')).status, 303);
    const { withActor } = await import('../src/lib/db.ts');
    const [u2] = await ownerQuery(`select id from users where email = 'klant2@pickmyride.test'`);
    const c2 = { userId: u2.id, role: 'customer' as const, companyId: null };
    for (const t of ['bookings', 'payments', 'ride_request_private', 'users', 'companies', 'audit_logs', 'notifications']) {
      const rows = (await withActor(c2, tx => tx.query(`select * from ${t}`))).rows;
      assert.ok(rows.every((r: any) => !JSON.stringify(r).includes('klant1@pickmyride.test') && !JSON.stringify(r).includes('Test Klant Een')), `RLS ${t}`);
    }
  });

  it('AC15: heen- en terugrit kunnen onafhankelijk beheerd worden', async () => {
    const k3 = new Browser(base);
    const r = await k3.post('/rit-aanvragen', reqData({ email: 'klant3@pickmyride.test', trip_type: 'retour', return_date: localDate(120).date, return_time: '18:00' }));
    assert.equal(r.status, 303);
    await k3.get(await latestLink('klant3@pickmyride.test'));
    const legs = await ownerQuery(`select r.id, r.leg, r.group_id, r.pickup_city, r.dropoff_city from ride_requests r join request_groups g on g.id = r.group_id join users u on u.id = g.customer_user_id where u.email = 'klant3@pickmyride.test' order by r.leg`);
    const heen = legs.find(l => l.leg === 'heen'), terug = legs.find(l => l.leg === 'terug');
    assert.equal(terug.pickup_city, 'Schiphol'); assert.equal(terug.dropoff_city, 'Amsterdam');
    await bid(S.A, heen.id, '52,00'); await bid(S.B, terug.id, '49,00');
    const [bh] = await ownerQuery(`select id from bids where ride_request_id = $1`, [heen.id]);
    const c = await k3.post(`/mijn/aanbod/${bh.id}/kiezen`, {});
    await k3.post(c.location!, { outcome: 'paid' });
    const st = await ownerQuery(`select leg, status from ride_requests where group_id = $1 order by leg`, [heen.group_id]);
    assert.deepEqual(st.map(s => [s.leg, s.status]), [['heen', 'gesloten'], ['terug', 'open']]);
    const [bt] = await ownerQuery(`select id from bids where ride_request_id = $1`, [terug.id]);
    const c2 = await k3.post(`/mijn/aanbod/${bt.id}/kiezen`, {});
    await k3.post(c2.location!, { outcome: 'paid' });
    const bk = await ownerQuery(`select k.company_id, p.id as payment_id from bookings k join payments p on p.booking_id = k.id where k.ride_request_id in ($1,$2)`, [heen.id, terug.id]);
    assert.equal(bk.length, 2); assert.equal(new Set(bk.map(b => b.company_id)).size, 2, 'verschillende uitvoerders'); assert.equal(new Set(bk.map(b => b.payment_id)).size, 2, 'eigen betaling per rit');
  });

  it('Klantenservice 24/7: taxi niet gekomen → melding, vervangend vervoer, afhandeling; bedrijf kan zelf melden', async () => {
    const [k] = await ownerQuery(`select k.id, k.company_id, k.booking_number from bookings k where k.ride_request_id = $1`, [S.ride2]);
    const letter = Object.entries(S.companies).find(([, id]) => id === k.company_id)![0];
    const comp = S[letter]; const other = S[letter === 'B' ? 'C' : 'B'];
    const page = await S.klant2.get(`/mijn/boekingen/${k.id}`);
    assert.match(page.text, /Hulp nodig met je rit\?/); assert.match(page.text, /Klantenservicenummers zijn nog niet ingesteld/, 'demo zonder nummers: duidelijk gemarkeerd');
    assert.doesNotMatch(page.text, /value="niet_verschenen"/, 'taxi niet gekomen pas na het ophaalmoment');
    let r = await S.klant2.post(`/mijn/boekingen/${k.id}/melding`, { reason: 'niet_verschenen' });
    assert.equal(r.status, 303); assert.match((await S.klant2.get(`/mijn/boekingen/${k.id}`)).text, /vanaf 10 minuten na het afgesproken ophaalmoment/);
    await ownerQuery(`update platform_settings set value = '-1000000' where key = 'no_show_report_minutes'`);
    assert.equal((await S.klant1.post(`/mijn/boekingen/${k.id}/melding`, { reason: 'niet_verschenen' })).status, 404, 'andere klant kan niet melden');
    assert.equal((await S.klant2.post(`/mijn/boekingen/${k.id}/melding`, { reason: 'bedrijf_kan_niet' })).status, 303);
    assert.equal((await ownerQuery('select count(*)::int n from replacement_cases'))[0].n, 0, 'klant kan geen bedrijfsreden gebruiken');
    r = await S.klant2.post(`/mijn/boekingen/${k.id}/melding`, { reason: 'niet_verschenen', details: 'Sta al 20 minuten te wachten bij uitgang 2.' });
    assert.equal(r.status, 303);
    const [c] = await ownerQuery('select * from replacement_cases where booking_id = $1', [k.id]);
    assert.deepEqual([c.status, c.reported_by_role, c.booking_status_before], ['gemeld', 'customer', 'bevestigd']); assert.match(c.case_number, /^VV-\d+$/);
    assert.equal((await ownerQuery('select status from bookings where id = $1', [k.id]))[0].status, 'probleem_gemeld');
    assert.equal((await ownerQuery('select status from payouts where booking_id = $1', [k.id]))[0].status, 'geblokkeerd', 'uitbetaling vastgezet');
    const mails = await ownerQuery(`select to_address, subject from notifications where template = 'vervangend_vervoer'`);
    assert.ok(mails.some(m => /^SPOED VV-/.test(m.subject)), 'spoedmail naar beheer'); assert.ok(mails.some(m => /melding ontvangen/.test(m.subject)), 'bevestiging naar klant');
    assert.ok(mails.some(m => /Melding van de klant/.test(m.subject)), 'bedrijf geïnformeerd');
    const cust = await S.klant2.get(`/mijn/boekingen/${k.id}`);
    assert.match(cust.text, new RegExp(`Melding ${c.case_number}`)); assert.match(cust.text, /De klant heeft een probleem gemeld/, 'systeembericht in de chat');
    assert.equal((await S.klant2.post(`/mijn/boekingen/${k.id}/melding`, { reason: 'overig', details: 'nog eens' })).status, 303);
    assert.equal((await ownerQuery('select count(*)::int n from replacement_cases where booking_id = $1', [k.id]))[0].n, 1, 'één lopende melding per boeking');
    const { withActor } = await import('../src/lib/db.ts');
    assert.equal((await withActor({ userId: null, role: 'company', companyId: S.companies[letter === 'B' ? 'C' : 'B'] }, tx => tx.query('select * from replacement_cases'))).rows.length, 0, 'RLS: ander bedrijf ziet niets');
    assert.match((await comp.get(`/bedrijf/ritten/${k.id}`)).text, new RegExp(`Melding ${c.case_number}`));
    assert.equal((await other.get(`/beheer/vervangend-vervoer/${c.id}`)).status, 403);
    // beheer
    assert.match((await S.admin.get('/beheer')).text, /Spoedmeldingen vervangend vervoer/);
    assert.match((await S.admin.get('/beheer/vervangend-vervoer')).text, new RegExp(c.case_number));
    const detail = await S.admin.get(`/beheer/vervangend-vervoer/${c.id}`);
    assert.match(detail.text, /Sta al 20 minuten te wachten/); assert.match(detail.text, /Ik pak deze melding op/);
    assert.equal((await S.admin.post(`/beheer/vervangend-vervoer/${c.id}/oppakken`, {})).status, 303);
    await S.admin.post(`/beheer/vervangend-vervoer/${c.id}/vervanger`, { replacement_company_id: k.company_id });
    assert.match((await S.admin.get(`/beheer/vervangend-vervoer/${c.id}`)).text, /De vervanger moet een ander bedrijf zijn/);
    const repl = S.companies[letter === 'A' ? 'C' : 'A'];
    await S.admin.post(`/beheer/vervangend-vervoer/${c.id}/vervanger`, { replacement_company_id: repl, eta__h: '23', eta__m: '55', extra_cost: '25,00', cost_bearer: 'platform' });
    const [c2] = await ownerQuery('select * from replacement_cases where id = $1', [c.id]);
    assert.deepEqual([c2.status, c2.extra_cost_cents, c2.cost_bearer], ['vervanger_geregeld', 2500, 'platform']); assert.ok(c2.replacement_eta);
    const name = (await ownerQuery('select trade_name from companies where id = $1', [repl]))[0].trade_name;
    const cust2 = await S.klant2.get(`/mijn/boekingen/${k.id}`);
    assert.match(cust2.text, new RegExp(`Vervangend vervoer: ${name}`)); assert.match(cust2.text, /Verwachte aankomst 23:55/); assert.match(cust2.text, /niets extra/);
    const compPage = await comp.get(`/bedrijf/ritten/${k.id}`);
    assert.match(compPage.text, /U hoeft deze rit niet meer uit te voeren/); assert.doesNotMatch(compPage.text, new RegExp(`Vervangend vervoer: ${name}`));
    assert.ok((await ownerQuery(`select 1 from notifications where dedupe_key = $1`, [`vv:${c.id}:geregeld`])).length, 'klant gemaild');
    await S.admin.post(`/beheer/vervangend-vervoer/${c.id}/sluiten`, { outcome: 'ongegrond', resolution: 'test' });
    assert.match((await S.admin.get(`/beheer/vervangend-vervoer/${c.id}`)).text, /al een vervanger geregeld/);
    await S.admin.post(`/beheer/vervangend-vervoer/${c.id}/sluiten`, { outcome: 'afgerond', resolution: '' });
    assert.equal((await ownerQuery('select status from replacement_cases where id = $1', [c.id]))[0].status, 'vervanger_geregeld', 'toelichting verplicht');
    await S.admin.post(`/beheer/vervangend-vervoer/${c.id}/sluiten`, { outcome: 'afgerond', resolution: 'Klant door vervanger op tijd afgezet.' });
    assert.equal((await ownerQuery('select status from replacement_cases where id = $1', [c.id]))[0].status, 'afgerond');
    assert.equal((await ownerQuery('select status from bookings where id = $1', [k.id]))[0].status, 'afgerond');
    assert.equal((await ownerQuery('select status from payouts where booking_id = $1', [k.id]))[0].status, 'geblokkeerd', 'oorspronkelijk bedrijf niet automatisch uitbetaald');
    await assert.rejects(ownerQuery(`update replacement_cases set reason = 'overig' where id = $1`, [c.id]), /niet worden aangepast|gesloten/);
    const acts = (await ownerQuery(`select action from audit_logs where entity_id = $1 order by id`, [c.id])).map(a => a.action);
    assert.deepEqual(acts, ['vervangend_vervoer.gemeld', 'vervangend_vervoer.in_behandeling', 'vervangend_vervoer.geregeld', 'vervangend_vervoer.afgerond']);

    // Bedrijf meldt zelf dat het niet kan; beheer sluit zonder vervanging → status en uitbetaling terug
    const [kb] = await ownerQuery(`select k.id, k.company_id, k.status from bookings k where k.id <> $1 and k.id <> $2 and k.status not in ('afgerond','geannuleerd') limit 1`, [k.id, S.booking1]);
    const cl = Object.entries(S.companies).find(([, id]) => id === kb.company_id)![0];
    await S[cl].post(`/bedrijf/ritten/${kb.id}/melding`, { reason: 'niet_verschenen' });
    assert.equal((await ownerQuery('select count(*)::int n from replacement_cases where booking_id = $1', [kb.id]))[0].n, 0, 'bedrijf kan geen klantreden gebruiken');
    assert.equal((await S[cl].post(`/bedrijf/ritten/${kb.id}/melding`, { reason: 'voertuig_defect', details: 'Motorstoring' })).status, 303);
    const [cb] = await ownerQuery('select * from replacement_cases where booking_id = $1', [kb.id]);
    assert.equal(cb.reported_by_role, 'company');
    await S.admin.post(`/beheer/vervangend-vervoer/${cb.id}/sluiten`, { outcome: 'ongegrond', resolution: 'Storing verholpen, rit gaat door.' });
    assert.equal((await ownerQuery('select status from bookings where id = $1', [kb.id]))[0].status, kb.status, 'terug naar status van vóór de melding');
    assert.equal((await ownerQuery('select status from payouts where booking_id = $1', [kb.id]))[0].status, 'nog_niet_beschikbaar', 'uitbetaling weer vrijgegeven');
    await ownerQuery(`update platform_settings set value = '10' where key = 'no_show_report_minutes'`);

    // Klantenservicenummers: validatie en tonen op de site
    assert.equal((await S.admin.post('/beheer/instellingen', { key: 'support_phone', value: 'bel ons' })).status, 400);
    await S.admin.post('/beheer/instellingen', { key: 'support_phone', value: '020 123 4567' });
    await S.admin.post('/beheer/instellingen', { key: 'support_whatsapp', value: '06 12345678' });
    const home = await new Browser(base).get('/');
    assert.match(home.text, /href="tel:\+31201234567"/); assert.match(home.text, /https:\/\/wa\.me\/31612345678/);
    assert.match(home.text, /Vervangend vervoer als je taxi niet komt/); assert.match(home.text, /Klantenservice 24\/7/);
    assert.match((await new Browser(base).get('/veelgestelde-vragen')).text, /Wat als mijn taxi niet komt opdagen\?/);
    assert.match((await S.klant2.get(`/mijn/boekingen/${k.id}`)).text, /wa\.me\/31612345678\?text=Hallo%20PickMyRide%2C%20mijn%20boekingsnummer%20is%20PMR-/);
    await S.admin.post('/beheer/instellingen', { key: 'replacement_guarantee', value: '0' });
    assert.doesNotMatch((await new Browser(base).get('/')).text, /Vervangend vervoer als je taxi niet komt/);
    // Productie zonder nummers: geen belofte, geen klantenservice-blok
    for (const key of ['support_phone', 'support_whatsapp']) await S.admin.post('/beheer/instellingen', { key, value: '' });
    await S.admin.post('/beheer/instellingen', { key: 'replacement_guarantee', value: '1' });
    const { config } = await import('../src/lib/config.ts'); const { invalidateSupportCache } = await import('../src/lib/support.ts');
    config.demoMode = false; invalidateSupportCache();
    try {
      const prod = await new Browser(base).get('/');
      assert.doesNotMatch(prod.text, /Vervangend vervoer als je taxi niet komt|Klantenservice 24\/7/);
    } finally { config.demoMode = true; invalidateSupportCache(); }
  });

  it('AC16: belangrijke beheeracties staan in het auditlog', async () => {
    await admin().post('/beheer/instellingen', { key: 'min_lead_hours', value: '24' });
    await admin().post('/beheer/commissie', { name: 'Test 10%', percent: '10', fixed: '0', min: '0' });
    const [b] = await ownerQuery(`select commission_rule_snapshot from bookings where id = $1`, [S.booking1]);
    assert.equal(b.commission_rule_snapshot.percent_bp, 1200, 'tariefwijziging verandert bestaande boeking niet');
    await admin().post(`/beheer/bedrijven/${S.companies.D}/status`, { to: 'geschorst', note: 'Test schorsing' });
    assert.equal((await ownerQuery(`select count(*)::int n from bids where company_id = $1 and status = 'actief'`, [S.companies.D]))[0].n, 0, 'biedingen geschorst bedrijf ingetrokken');
    const actions = (await ownerQuery(`select distinct action from audit_logs`)).map(r => r.action);
    for (const a of ['bedrijf.actief', 'bedrijf.geschorst', 'document.goedgekeurd', 'instelling.gewijzigd', 'commissie.gewijzigd', 'boeking.bevestigd', 'gebruiker.ingelogd', 'bedrijf.aangemeld'])
      assert.ok(actions.includes(a), `auditlog bevat ${a}`);
    const page = await admin().get('/beheer/audit'); assert.equal(page.status, 200); assert.match(page.text, /commissie.gewijzigd/);
    const csv = await admin().get('/beheer/export/boekingen.csv'); assert.equal(csv.status, 200); assert.match(csv.text, /booking_number;status/);
  });

  it('AC17: primaire knoppen en links leiden naar een werkende actie of duidelijke melding', async () => {
    const visit = new Set<string>(); const broken: string[] = [];
    const crawl = async (b: Browser, start: string[]) => {
      const queue = [...start];
      while (queue.length) {
        const p = queue.shift()!; if (visit.has(p + b.userAgent)) continue; visit.add(p + b.userAgent);
        const r = await b.get(p);
        if (r.status === 404 || r.status >= 500) broken.push(`${p} → ${r.status}`);
        if (r.status !== 200 || !(r.headers.get('content-type') || '').includes('html')) continue;
        for (const m of r.text.matchAll(/(?:href|action)="(\/[^"#?]*)/g)) {
          const u = m[1]; if (u.startsWith('/static') || u.startsWith('/toegang') || u === '/uitloggen' || u.startsWith('/documenten') || u.includes('/demo-betaalomgeving')) continue;
          if (!visit.has(u + b.userAgent) && queue.length < 400) queue.push(u);
        }
      }
    };
    await crawl(new Browser(base, 'anon'), ['/']);
    await crawl(S.klant1, ['/mijn']); await crawl(S.A, ['/bedrijf']); await crawl(admin(), ['/beheer']);
    // POST-acties worden als GET bezocht en geven dan 404 (alleen POST); filter die eruit: alleen GET-pagina's tellen.
    const realBroken = broken.filter(x => !/\/(bedrijven\/[0-9a-f-]{36}\/buitenland|verbergen|bericht|bellen|melding|oppakken|vervanger|sluiten|beoordelingen\/[0-9a-f-]{36}|beoordeling|kiezen|bod|intrekken|toewijzen|status|annuleren|chauffeur|voertuig|controle|instellingen|commissie|inloglink|contact|rit-aanvragen|aanmelden-taxibedrijf|inloggen)\b.*→ 404$/.test(x));
    assert.deepEqual(realBroken, []);
  });

  it('Extra: mislukte betaling geeft het bod vrij; betaling na verlopen reservering geeft geen boeking maar een terugbetaling', async () => {
    const k4 = new Browser(base);
    await k4.post('/rit-aanvragen', reqData({ email: 'klant4@pickmyride.test' }));
    await k4.get(await latestLink('klant4@pickmyride.test'));
    const [ride] = await ownerQuery(`select r.id from ride_requests r join request_groups g on g.id = r.group_id join users u on u.id = g.customer_user_id where u.email = 'klant4@pickmyride.test'`);
    await bid(S.A, ride.id, '58,00');
    const [b] = await ownerQuery(`select id from bids where ride_request_id = $1`, [ride.id]);
    const c = await k4.post(`/mijn/aanbod/${b.id}/kiezen`, {});
    await k4.post(c.location!, { outcome: 'failed' });
    assert.equal((await ownerQuery('select status from bids where id = $1', [b.id]))[0].status, 'actief');
    assert.equal((await ownerQuery(`select status from payments where ride_request_id = $1`, [ride.id]))[0].status, 'mislukt');
    // Nieuwe poging, reservering laten verlopen, ander bedrijf wint intussen niet — maar het bod zelf verloopt ook
    const c2 = await k4.post(`/mijn/aanbod/${b.id}/kiezen`, {});
    await ownerQuery(`update reservations set expires_at = now() - interval '1 second' where ride_request_id = $1 and status = 'actief'`, [ride.id]);
    const { sweepExpired } = await import('../src/domain/booking.ts');
    await ownerQuery(`update bids set valid_until = now() - interval '1 second' where id = $1`, [b.id]);
    await sweepExpired();
    assert.equal((await ownerQuery('select status from bids where id = $1', [b.id]))[0].status, 'verlopen', 'bod wordt niet heropend na verlopen geldigheid');
    await k4.post(c2.location!, { outcome: 'paid' });
    assert.equal((await ownerQuery(`select count(*)::int n from bookings where ride_request_id = $1`, [ride.id]))[0].n, 0);
    const [p] = await ownerQuery(`select status, needs_attention from payments where ride_request_id = $1 order by created_at desc limit 1`, [ride.id]);
    assert.equal(p.status, 'geslaagd'); assert.ok(p.needs_attention);
    assert.equal((await ownerQuery(`select count(*)::int n from refunds r join payments p on p.id = r.payment_id where p.ride_request_id = $1 and r.status = 'aangevraagd'`, [ride.id]))[0].n, 1);
  });

  it('Extra: lange afstand en andere luchthavens — landelijk werkgebied, luchthaven herkend', async () => {
    const k5 = new Browser(base);
    const r = await k5.post('/rit-aanvragen', reqData({ email: 'klant5@pickmyride.test', pickup_street: 'Stationsplein 1', pickup_postcode: '5611 AB', pickup_city: 'Eindhoven',
      dropoff_street: 'Luchthavenweg 25', dropoff_postcode: '5657 EA', dropoff_city: 'Eindhoven', flight_number: '' }));
    assert.equal(r.status, 303, errs(r.text));
    await k5.get(await latestLink('klant5@pickmyride.test'));
    const [ride] = await ownerQuery(`select r.id, r.is_airport, a.code from ride_requests r join service_areas a on a.id = r.pickup_area_id join request_groups g on g.id = r.group_id join users u on u.id = g.customer_user_id where u.email = 'klant5@pickmyride.test'`);
    assert.equal(ride.is_airport, true, 'Eindhoven Airport herkend als luchthaven');
    assert.equal(ride.code, 'landelijk', 'buiten de regionale gebieden valt de rit onder landelijk');
    assert.equal((await S.A.get(`/bedrijf/aanvragen/${ride.id}`)).status, 404, 'regionaal bedrijf (Amsterdam) komt niet in aanmerking');
    await ownerQuery(`insert into company_service_areas select $1, id from service_areas where code = 'landelijk'`, [S.companies.C]);
    assert.match((await S.C.get('/bedrijf/aanvragen')).text, new RegExp(ride.id), 'landelijk bedrijf ziet de rit');
    assert.equal((await bid(S.C, ride.id, '145,00')).status, 303);
    const form = await new Browser(base).get('/rit-aanvragen?pickup_street=Eindhoven%20Airport');
    assert.match(form.text, /Luchthavenweg 25/); assert.match(form.text, /Rotterdam The Hague Airport/);
  });

  it('Buitenland: rit naar Düsseldorf Airport, alleen bedrijven die over de grens rijden, adres afgeschermd', async () => {
    await ownerQuery('delete from rate_limits');
    const k8 = new Browser(base);
    const bad = await k8.post('/rit-aanvragen', reqData({ email: 'klant8@pickmyride.test', dropoff_street: 'Flughafenstraße 105', dropoff_postcode: '4047', dropoff_city: 'Düsseldorf', dropoff_country: 'DE' }));
    assert.equal(bad.status, 422); assert.match(bad.text, /geldige postcode in Duitsland/);
    const both = await k8.post('/rit-aanvragen', reqData({ email: 'klant8@pickmyride.test', pickup_street: 'Meir 1', pickup_postcode: '2000', pickup_city: 'Antwerpen', pickup_country: 'BE',
      dropoff_street: 'Flughafenstraße 105', dropoff_postcode: '40474', dropoff_city: 'Düsseldorf', dropoff_country: 'DE' }));
    assert.equal(both.status, 422); assert.match(both.text, /Vertrek of bestemming moet in Nederland liggen/);
    const r = await k8.post('/rit-aanvragen', reqData({ email: 'klant8@pickmyride.test', dropoff_street: 'Flughafenstraße 105', dropoff_postcode: 'D-40474', dropoff_city: 'Düsseldorf', dropoff_country: 'DE',
      trip_type: 'retour', return_date: localDate(120).date, return_time: '18:00', flight_number: '' }));
    assert.equal(r.status, 303, errs(r.text));
    await k8.get(await latestLink('klant8@pickmyride.test'));
    const legs = await ownerQuery(`select r.id, r.leg, r.pickup_country, r.dropoff_country, r.pickup_postcode4, r.dropoff_postcode4, r.dropoff_area_id, r.is_airport, p.dropoff_address
      from ride_requests r join ride_request_private p on p.ride_request_id = r.id join request_groups g on g.id = r.group_id join users u on u.id = g.customer_user_id
      where u.email = 'klant8@pickmyride.test' order by r.leg`);
    const heen = legs.find(l => l.leg === 'heen'), terug = legs.find(l => l.leg === 'terug');
    assert.deepEqual([heen.pickup_country, heen.dropoff_country, heen.dropoff_postcode4, heen.dropoff_area_id, heen.is_airport], ['NL', 'DE', null, null, true]);
    assert.equal(heen.dropoff_address, 'Flughafenstraße 105, 40474 Düsseldorf, Duitsland');
    assert.deepEqual([terug.pickup_country, terug.dropoff_country], ['DE', 'NL'], 'terugrit omgekeerd');
    // A rijdt in Amsterdam maar niet over de grens → mag niet bieden
    assert.equal((await S.A.get(`/bedrijf/aanvragen/${heen.id}`)).status, 404, 'zonder buitenland-instelling geen toegang');
    assert.equal((await S.admin.post(`/beheer/bedrijven/${S.companies.A}/buitenland`, { on: 'ja' })).status, 303);
    const list = await S.A.get('/bedrijf/aanvragen');
    assert.match(list.text, /Düsseldorf \(Duitsland\)/); assert.match(list.text, /Buitenland/);
    const detail = await S.A.get(`/bedrijf/aanvragen/${heen.id}`);
    assert.equal(detail.status, 200); assert.doesNotMatch(detail.text, /Flughafenstraße/, 'adres pas na boeking');
    assert.equal((await bid(S.A, heen.id, '189,00')).status, 303);
    assert.ok((await ownerQuery(`select 1 from audit_logs where action = 'bedrijf.buitenland'`)).length);
    await assert.rejects(ownerQuery(`update ride_requests set pickup_country = 'BE', pickup_postcode4 = null where id = $1`, [heen.id]), /one_side_nl/, 'database: één kant altijd in Nederland');
    // Formulier herkent buitenlandse luchthavens
    const f = await new Browser(base).get('/rit-aanvragen?dropoff_street=Brussels%20Airport');
    assert.match(f.text, /name="dropoff_street"[^>]*value="Leopoldlaan"/); assert.match(f.text, /<option value="BE" selected="">/);
  });

  it('Extra: routepagina’s, luchthavenpagina’s en buitenlandpagina’s', async () => {
    const anon = new Browser(base);
    const u = await anon.get('/taxi/utrecht/schiphol');
    assert.equal(u.status, 200); assert.match(u.text, /<h1>Taxi Utrecht – Schiphol<\/h1>/); assert.match(u.text, /"@type":"FAQPage"/);
    assert.equal((await anon.get('/taxi/emmen/schiphol')).status, 404, 'alleen routes met zoekvolume');
    const s = await anon.get('/luchthaven/schiphol');
    assert.equal(s.status, 200); assert.match(s.text, /Vertrekpassage 1/); assert.match(s.text, /href="\/taxi\/haarlem\/schiphol"/);
    const d = await anon.get('/buitenland/antwerpen');
    assert.equal(d.status, 200); assert.match(d.text, /<h1>Taxi naar Antwerpen<\/h1>/);
    assert.match(d.text, /name="dropoff_country" value="BE"/); assert.match(d.text, /name="dropoff_city" value="Antwerpen"/);
    assert.equal((await anon.get('/buitenland/dusseldorf-airport')).status, 200);
    assert.equal((await anon.get('/buitenland/londen')).status, 404);
    const sm = await anon.get('/sitemap.xml');
    assert.equal((sm.text.match(/<url>/g) || []).length, 130);
    const home = await anon.get('/');
    assert.match(home.text, /href="\/buitenland\/dusseldorf-airport"/); assert.match(home.text, /href="\/luchthaven\/eindhoven-airport"/);
  });

  it('Extra: 24-uurs tijdkiezer, kleine koffers en kinderzitjes per soort', async () => {
    await ownerQuery('delete from rate_limits');   // tests plaatsen meer aanvragen dan de limiet per IP
    const page = await new Browser(base).get('/rit-aanvragen/gegevens');
    assert.match(page.text, /name="time__h"/); assert.match(page.text, /<option value="23">23<\/option>/); assert.doesNotMatch(page.text, /type="time"/, 'geen browser-tijdveld (AM/PM) meer');
    assert.match(page.text, /Kleine koffers/); assert.match(page.text, /Maxi-Cosi/); assert.match(page.text, /Kinderstoel/); assert.match(page.text, /Verhoger/);
    assert.doesNotMatch((await new Browser(base).get('/')).text, /type="time"/);
    const k6 = new Browser(base);
    const base6 = reqData({ email: 'klant6@pickmyride.test', passengers: '3', small_bags: '2' });
    delete (base6 as any).time;
    const tooMany = await k6.post('/rit-aanvragen', { ...base6, time__h: '17', time__m: '45', need_seats: 'ja', seat_maxicosi: '2', seat_verhoger: '2' });
    assert.equal(tooMany.status, 422); assert.match(tooMany.text, /niet meer kinderzitjes zijn dan personen/);
    const none = await k6.post('/rit-aanvragen', { ...base6, time__h: '17', time__m: '45', need_seats: 'ja' });
    assert.equal(none.status, 422); assert.match(none.text, /minimaal één kinderzitje/);
    const ok = await k6.post('/rit-aanvragen', { ...base6, time__h: '17', time__m: '45', need_seats: 'ja', seat_maxicosi: '1', seat_verhoger: '1' });
    assert.equal(ok.status, 303, errs(ok.text));
    await k6.get(await latestLink('klant6@pickmyride.test'));
    const [ride] = await ownerQuery(`select r.id, r.pickup_at, r.small_bags, r.seat_maxicosi, r.seat_kinderstoel, r.seat_verhoger from ride_requests r join request_groups g on g.id = r.group_id join users u on u.id = g.customer_user_id where u.email = 'klant6@pickmyride.test'`);
    assert.deepEqual([ride.small_bags, ride.seat_maxicosi, ride.seat_kinderstoel, ride.seat_verhoger], [2, 1, 0, 1]);
    const { formatTime } = await import('../src/lib/time.ts');
    assert.equal(formatTime(ride.pickup_at), '17:45', 'tijd uit uur- en minutenkeuze correct opgeslagen (Amsterdamse tijd)');
    const bidPage = await S.A.get(`/bedrijf/aanvragen/${ride.id}`);
    assert.match(bidPage.text, /1 Maxi-Cosi, 1 verhoger/); assert.match(bidPage.text, /2 kleine koffers/);
    const noSeats = await bid(S.A, ride.id, '60,00', { services: ['tol_parkeren'] } as any);
    assert.equal(noSeats.status, 422); assert.match(noSeats.text, /vraagt kinderzitjes/);
    assert.equal((await bid(S.A, ride.id, '60,00', { services: ['kinderzitje'] } as any)).status, 303);
    // Zonder vinkje worden losse zitjeswaarden genegeerd
    const k7 = new Browser(base);
    assert.equal((await k7.post('/rit-aanvragen', reqData({ email: 'klant7@pickmyride.test', need_seats: '', seat_maxicosi: '2' }))).status, 303);
    const [r7] = await ownerQuery(`select r.seat_maxicosi from ride_requests r join request_groups g on g.id = r.group_id join users u on u.id = g.customer_user_id where u.email = 'klant7@pickmyride.test'`);
    assert.equal(r7.seat_maxicosi, 0);
  });

  it('Extra: 50 stadspagina’s met echte gegevens, overzicht, footer en sitemap', async () => {
    const anon = new Browser(base);
    const { CITIES } = await import('../src/lib/cities.ts');
    assert.equal(CITIES.length, 73); assert.equal(new Set(CITIES.map(c => c.slug)).size, 73);
    const z = await anon.get('/taxi/zaandam');
    assert.equal(z.status, 200);
    assert.match(z.text, /<title>Taxi Zaandam: vergelijk voorstellen en boek vooraf \| PickMyRide<\/title>/);
    assert.match(z.text, /<h1>Taxi in Zaandam<\/h1>/); assert.match(z.text, /Schiphol ligt hemelsbreed ca\. 15 km/); assert.match(z.text, /class="usp-bar"/);
    assert.match(z.text, /"@type":"BreadcrumbList"/); assert.match(z.text, /"@type":"FAQPage"/);
    assert.doesNotMatch(z.text, /noindex/);
    assert.doesNotMatch(z.text, /Geboekt naar Schiphol/, 'geen prijscijfers zonder minimaal 3 boekingen');
    assert.equal((await anon.get('/taxi/atlantis')).status, 404);
    const hub = await anon.get('/taxi');
    for (const c of CITIES) assert.ok(hub.text.includes(`href="/taxi/${c.slug}"`), c.slug);
    const home = await anon.get('/');
    assert.equal((home.text.match(/href="\/taxi\/[a-z-]+"/g) || []).length >= 73, true, 'alle steden gelinkt vanaf home (footer)');
    const sm = await anon.get('/sitemap.xml');
    assert.equal((sm.text.match(/\/taxi\/[a-z-]+<\/loc>/g) || []).length, 73);
    assert.doesNotMatch((await S.klant1.get('/mijn')).text, /footer-cities/, 'stedenlijst alleen op openbare pagina’s');
  });

  it('Extra: themapagina’s (kosten met rekenhulp, taxibus, reserveren, goedkoop, kinderzitje) en extra steden', async () => {
    const anon = new Browser(base);
    const c = await anon.get('/wat-kost-een-taxi?km=7&min=15&soort=personenauto');
    assert.equal(c.status, 200); assert.match(c.text, /€\s?34,30/, 'rekenvoorbeeld Rijksoverheid 2026: 4,31 + 7×3,17 + 15×0,52');
    assert.match(c.text, /€\s?3,17/); assert.match(c.text, /€\s?8,77/);
    const bus = await anon.get('/wat-kost-een-taxi?km=10&min=20&soort=busje');
    assert.match(bus.text, /€\s?60,57/, '8,77 + 10×4,00 + 20×0,59');
    assert.doesNotMatch((await anon.get('/wat-kost-een-taxi?km=-3&min=abc')).text, /calc-price/, 'ongeldige invoer: geen uitkomst');
    const tb = await anon.get('/taxibus');
    assert.equal(tb.status, 200); assert.match(tb.text, /name="vehicle_category" value="taxibus"/);
    const pre = await anon.get('/rit-aanvragen?vehicle_category=taxibus');
    assert.match(pre.text, /name="vehicle_category" checked="" value="taxibus"|name="vehicle_category" value="taxibus" checked=""/);
    for (const p of ['/taxi-reserveren', '/goedkope-taxi', '/taxi-met-kinderzitje', '/taxi/texel', '/taxi/ijmuiden', '/taxi/alphen-aan-den-rijn', '/taxi/hoofddorp'])
      assert.equal((await anon.get(p)).status, 200, p);
    assert.match((await anon.get('/')).text, /href="\/wat-kost-een-taxi"/, 'diensten in de footer');
  });

  it('Extra: SEO — openbare pagina’s indexeerbaar, privé pagina’s niet', async () => {
    const b = new Browser(base);
    const home = await b.get('/'); assert.match(home.text, /<title>.*\| PickMyRide<\/title>/); assert.match(home.text, /name="description"/); assert.doesNotMatch(home.text, /noindex/);
    const sm = await b.get('/sitemap.xml'); assert.match(sm.text, /voor-taxibedrijven/); assert.doesNotMatch(sm.text, /\/mijn|\/beheer|\/bedrijf\b/);
    const login = await b.get('/inloggen'); assert.match(login.text, /noindex/);
    assert.match((await S.klant1.get('/mijn')).text, /noindex/);
    assert.match(home.headers.get('content-security-policy') || '', /default-src 'self'/);
  });
});
