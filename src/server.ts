import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createElement as h } from 'react';
import { config, assertConfig } from './lib/config.ts';
import { Router, HttpError, html, redirect, text, parseCookies, cookieHeader, readBody, parseMultipart, ensureCsrf, newCsrf, mergeTimeFields, type Ctx } from './lib/http.ts';
import { loadSession, createSession, revokeSession, actorFor, redeemLoginLink, createLoginLink } from './lib/auth.ts';
import { SYSTEM, withActor, one, many } from './lib/db.ts';
import { getSettings, rateLimit, logError, logInfo, audit } from './lib/services.ts';
import { verifyPassword } from './lib/security.ts';
import { queueEmail, deliverPending } from './lib/notify.ts';
import { describeRule } from './lib/money.ts';
import { geoProvider } from './integrations/geo/index.ts';
import { findAirport } from './lib/airports.ts';
import { findForeignAirport, isCountry } from './lib/abroad.ts';
import { supportInfo } from './lib/support.ts';
import { demoProvider } from './integrations/payments/index.ts';
import * as R from './domain/requests.ts';
import * as B from './domain/bids.ts';
import * as K from './domain/booking.ts';
import * as C from './domain/companies.ts';
import * as A from './domain/admin.ts';
import * as V from './domain/reviews.ts';
import * as M from './domain/communication.ts';
import * as VV from './domain/replacement.ts';
import * as PubP from './ui/pages/public.tsx';
import * as ReqP from './ui/pages/request.tsx';
import * as CusP from './ui/pages/customer.tsx';
import * as ComP from './ui/pages/company.tsx';
import * as AdmP from './ui/pages/admin.tsx';
import * as CityP from './ui/pages/cities.tsx';
import * as SeoP from './ui/pages/seo.tsx';
import * as TopP from './ui/pages/topics.tsx';
import { hasSchipholRoute, findAirportPage } from './lib/cities.ts';
import { findDestination } from './lib/abroad.ts';
import { AIRPORTS } from './lib/airports.ts';
import { CITIES, findCity } from './lib/cities.ts';
import { cityStats, routeStats, airportStats, abroadStats } from './domain/cities.ts';

const router = new Router();
const r = router;
const STATIC_DIR = new URL('../public/', import.meta.url).pathname;
const INLINE_JS_HASH = crypto.createHash('sha256').update("document.documentElement.classList.add('js')").digest('base64');
const PUBLIC_PAGES = ['/', '/rit-aanvragen', '/hoe-werkt-het', '/voor-taxibedrijven', '/aanmelden-taxibedrijf', '/veelgestelde-vragen', '/contact', '/privacyverklaring', '/algemene-voorwaarden', '/annuleringsvoorwaarden', '/taxi'];
const SITEMAP_PAGES = () => [...PUBLIC_PAGES, ...CITIES.map(c => `/taxi/${c.slug}`), ...SeoP.SEO_PATHS(), ...TopP.TOPIC_PAGES.map(([h]) => h)];

function requireRole(ctx: Ctx, ...roles: string[]) {
  if (!ctx.user) throw Object.assign(new HttpError(401, 'Log in om deze pagina te bekijken.'), { redirectTo: `/inloggen?terug=${encodeURIComponent(ctx.url.pathname)}` });
  if (!roles.includes(ctx.user.role)) throw new HttpError(403, 'Je hebt geen toegang tot deze pagina.');
}
const page = (ctx: Ctx, Comp: any, props: any = {}, status = 200) => html(ctx, h(Comp, { ctx, ...props }), status);
const priv = (ctx: Ctx, Comp: any, props: any = {}) => html(ctx, h(Comp, { ctx, ...props }), 200, { noindex: true });

// ───────── Openbaar ─────────
r.get('/', async ctx => page(ctx, PubP.HomePage, { minLeadHours: (await getSettings()).min_lead_hours }));
r.get('/taxi', async ctx => page(ctx, CityP.CitiesHubPage));
r.get('/taxi/:stad', async ctx => {
  const city = findCity(ctx.params.stad);
  if (!city) throw new HttpError(404, 'Deze stad staat (nog) niet in ons overzicht. Je kunt vanaf elk adres in Nederland een rit aanvragen.');
  page(ctx, CityP.CityPage, { city, stats: await cityStats(city), minLeadHours: (await getSettings()).min_lead_hours });
});
r.get('/taxi/:stad/schiphol', async ctx => {
  const city = findCity(ctx.params.stad);
  if (!city || !hasSchipholRoute(city.slug)) throw new HttpError(404, 'Deze route staat (nog) niet in ons overzicht. Je kunt vanaf elk adres in Nederland een rit naar Schiphol aanvragen.');
  page(ctx, SeoP.RoutePage, { city, price: await routeStats(city), minLeadHours: (await getSettings()).min_lead_hours });
});
r.get('/wat-kost-een-taxi', async ctx => {
  const km = Number(String(ctx.query.get('km') || '').replace(',', '.')), min = Number(ctx.query.get('min') || '');
  const kind = ctx.query.get('soort') === 'busje' ? 'busje' : 'personenauto';
  const calc = km > 0 && km <= 1000 && min > 0 && min <= 900 ? { kind, km: Math.round(km * 10) / 10, min: Math.round(min), price: TopP.maxMeterPrice(kind, Math.round(km * 10) / 10, Math.round(min)) } : null;
  const ams = AIRPORTS.find(a => a.code === 'AMS')!;
  page(ctx, TopP.CostPage, { calc, schiphol: await airportStats('AMS', ams.pc4), minLeadHours: (await getSettings()).min_lead_hours });
});
r.get('/taxibus', async ctx => {
  const cat = await withActor(SYSTEM, tx => one(tx, `select max_passengers, max_large_bags from vehicle_categories where code = 'taxibus'`));
  page(ctx, TopP.MinibusPage, { maxPax: cat?.max_passengers ?? 8, maxBags: cat?.max_large_bags ?? 8, minLeadHours: (await getSettings()).min_lead_hours });
});
r.get('/taxi-reserveren', async ctx => page(ctx, TopP.ReservePage, { minLeadHours: (await getSettings()).min_lead_hours }));
r.get('/goedkope-taxi', async ctx => page(ctx, TopP.CheapPage, { minLeadHours: (await getSettings()).min_lead_hours }));
r.get('/taxi-met-kinderzitje', async ctx => page(ctx, TopP.ChildSeatPage, { minLeadHours: (await getSettings()).min_lead_hours }));
r.get('/luchthavens', async ctx => page(ctx, SeoP.AirportsHubPage));
r.get('/luchthaven/:slug', async ctx => {
  const p = findAirportPage(ctx.params.slug);
  if (!p) throw new HttpError(404, 'Deze luchthaven staat (nog) niet in ons overzicht.');
  const ap = AIRPORTS.find(a => a.code === p.code)!;
  page(ctx, SeoP.AirportPage, { slug: p.slug, price: await airportStats(p.code, ap.pc4), minLeadHours: (await getSettings()).min_lead_hours });
});
r.get('/buitenland', async ctx => page(ctx, SeoP.AbroadHubPage));
r.get('/buitenland/:slug', async ctx => {
  const dest = findDestination(ctx.params.slug);
  if (!dest) throw new HttpError(404, 'Deze bestemming staat (nog) niet in ons overzicht. Kies het land in het aanvraagformulier en vul het adres zelf in.');
  const city = dest.airport ? (await import('./lib/abroad.ts')).FOREIGN_AIRPORTS.find(a => a.code === dest.airport)!.city : dest.name;
  const st = await abroadStats(city, dest.country);
  page(ctx, SeoP.AbroadPage, { dest, companies: st.companies, price: st.prices, minLeadHours: (await getSettings()).min_lead_hours });
});
r.get('/hoe-werkt-het', async ctx => page(ctx, PubP.HowItWorksPage));
r.get('/voor-taxibedrijven', async ctx => {
  const rule = await withActor(SYSTEM, tx => one(tx, 'select * from commission_rules where active'));
  page(ctx, PubP.ForCompaniesPage, { commissionText: rule ? describeRule(rule) : 'nog niet vastgesteld' });
});
r.get('/veelgestelde-vragen', async ctx => page(ctx, PubP.FaqPage));
r.get('/privacyverklaring', async ctx => page(ctx, PubP.LegalPage, { kind: 'privacy' }));
r.get('/algemene-voorwaarden', async ctx => page(ctx, PubP.LegalPage, { kind: 'voorwaarden' }));
r.get('/annuleringsvoorwaarden', async ctx => page(ctx, PubP.LegalPage, { kind: 'annulering' }));
r.get('/contact', async ctx => page(ctx, PubP.ContactPage, { sent: ctx.query.get('verzonden') === '1' }));
r.post('/contact', async ctx => {
  if (!(await rateLimit(`contact:${ctx.ip}`, 5, 3600))) throw new HttpError(429, 'Je hebt te veel berichten verstuurd. Probeer het later opnieuw.');
  const v = ctx.body; const e: Record<string, string> = {};
  if ((v.name || '').trim().length < 2) e.name = 'Vul je naam in.';
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.email || '')) e.email = 'Vul een geldig e-mailadres in.';
  if ((v.subject || '').trim().length < 3) e.subject = 'Vul een onderwerp in.';
  if ((v.body || '').trim().length < 10) e.body = 'Schrijf een bericht van minimaal 10 tekens.';
  if (Object.keys(e).length) return page(ctx, PubP.ContactPage, { errors: e, values: v }, 422);
  await withActor(SYSTEM, tx => tx.query(`insert into support_requests (kind, user_id, name, email, subject, body) values ('contact',$1,$2,$3,$4,$5)`,
    [ctx.user?.id || null, v.name.trim().slice(0, 100), v.email.trim().slice(0, 254), v.subject.trim().slice(0, 150), v.body.trim().slice(0, 3000)]));
  redirect(ctx, '/contact?verzonden=1');
});

const PREFILL_KEYS = ['pickup_street', 'dropoff_street', 'stop_street', 'date', 'time', 'passengers', 'trip_type', 'vehicle_category', 'pickup_postcode', 'dropoff_postcode'];
r.get('/rit-aanvragen', async ctx => {
  // Zonder ritgegevens: stap 1 (zelfde invoer als op de homepage). Met gegevens (oude links): direct stap 2.
  if (!PREFILL_KEYS.some(k => ctx.query.get(k))) return page(ctx, ReqP.RequestStartPage, { settings: await getSettings(), geoConnected: geoProvider().supportsAutocomplete });
  return requestDetails(ctx);
});
r.get('/rit-aanvragen/gegevens', async ctx => requestDetails(ctx));
async function requestDetails(ctx: any) {
  const settings = await getSettings();
  const categories = await withActor(SYSTEM, tx => many(tx, 'select * from vehicle_categories where active order by sort_order'));
  const q = Object.fromEntries(ctx.query) as Record<string, string>;
  for (const p of ['pickup', 'dropoff', 'stop']) {   // snelformulier: postcode/plaats uit één adresregel halen indien aanwezig
    const raw = q[`${p}_street`] || '';
    const m = /^(.*?)[,\s]+([1-9]\d{3}\s?[A-Za-z]{2})[,\s]*(.*)$/.exec(raw);
    if (m && !q[`${p}_postcode`]) { q[`${p}_street`] = m[1].trim(); q[`${p}_postcode`] = m[2].toUpperCase(); q[`${p}_city`] = m[3].trim(); }
    const ap = findAirport(raw);
    if (ap && !q[`${p}_postcode`]) { q[`${p}_street`] = ap.street; q[`${p}_postcode`] = ap.postcode; q[`${p}_city`] = ap.city; q[`${p}_country`] = 'NL'; }
    const fa = findForeignAirport(raw);
    if (fa && !q[`${p}_postcode`]) { q[`${p}_street`] = fa.street; q[`${p}_postcode`] = fa.postcode; q[`${p}_city`] = fa.city; q[`${p}_country`] = fa.country; }
    if (q[`${p}_country`] && !isCountry(String(q[`${p}_country`]).toUpperCase())) delete q[`${p}_country`];
  }
  page(ctx, ReqP.RequestPage, { values: q, settings, categories, geoConnected: geoProvider().supportsAutocomplete });
}
r.post('/rit-aanvragen', async ctx => {
  if (!(await rateLimit(`aanvraag:${ctx.ip}`, 10, 3600))) throw new HttpError(429, 'Je hebt veel aanvragen in korte tijd geplaatst. Probeer het over een uur opnieuw.');
  const input = Object.fromEntries(R.FIELDS.map(k => [k, ctx.body[k] ?? ''])) as unknown as R.RequestInput;
  const res = await R.createRequest(input, ctx.actor);
  if (res.errors) {
    const settings = await getSettings();
    const categories = await withActor(SYSTEM, tx => many(tx, 'select * from vehicle_categories where active order by sort_order'));
    return page(ctx, ReqP.RequestPage, { values: input, errors: res.errors, settings, categories, geoConnected: geoProvider().supportsAutocomplete }, 422);
  }
  redirect(ctx, `/aanvraag-ontvangen?ref=${encodeURIComponent(res.publicRef!)}&v=${res.needsVerification ? 1 : 0}`);
});
r.get('/aanvraag-ontvangen', async ctx => priv(ctx, ReqP.RequestSubmittedPage, { publicRef: (ctx.query.get('ref') || '').replace(/[^\w-]/g, ''), needsVerification: ctx.query.get('v') === '1' }));

r.get('/toegang/:token', async ctx => {
  const res = await redeemLoginLink(ctx.params.token);
  if (!res) throw new HttpError(410, 'Deze link is verlopen of al gebruikt. Vraag via "Inloggen" een nieuwe inloglink aan.');
  const token = await createSession(res.userId, ctx.ip, String(ctx.req.headers['user-agent'] || ''));
  ctx.setCookie('rb_sess', token, { maxAge: 14 * 86400 });
  if (res.requestGroupId) { await R.openConceptRequests(res.requestGroupId); ctx.setFlash('ok', 'Je e-mailadres is bevestigd.'); return redirect(ctx, `/mijn/aanvragen/${res.requestGroupId}`); }
  redirect(ctx, '/mijn');
});

r.get('/aanmelden-taxibedrijf', async ctx => {
  const ref = await withActor(SYSTEM, async tx => ({ areas: await many(tx, 'select code, name from service_areas where active order by name'), categories: await many(tx, 'select * from vehicle_categories where active order by sort_order') }));
  page(ctx, ComP.CompanySignupPage, { ...ref, done: ctx.query.get('ontvangen') === '1' });
});
r.post('/aanmelden-taxibedrijf', async ctx => {
  if (!(await rateLimit(`bedrijf:${ctx.ip}`, 5, 3600))) throw new HttpError(429, 'Te veel aanmeldingen vanaf dit adres. Probeer het later opnieuw.');
  const res = await C.registerCompany(ctx.bodyAll, ctx.files, ctx.ip);
  if (res.errors) {
    const ref = await withActor(SYSTEM, async tx => ({ areas: await many(tx, 'select code, name from service_areas where active order by name'), categories: await many(tx, 'select * from vehicle_categories where active order by sort_order') }));
    ctx.bodyAll.delete('password'); ctx.bodyAll.delete('password2');
    return page(ctx, ComP.CompanySignupPage, { ...ref, errors: res.errors, values: ctx.bodyAll }, 422);
  }
  redirect(ctx, '/aanmelden-taxibedrijf?ontvangen=1');
});

// ───────── Inloggen ─────────
r.get('/inloggen', async ctx => priv(ctx, CusP.LoginPage, { next: ctx.query.get('terug') || '' }));
r.post('/inloggen', async ctx => {
  const email = (ctx.body.email || '').trim().toLowerCase();
  if (!(await rateLimit(`login:${ctx.ip}`, 20, 900)) || !(await rateLimit(`login:${email}`, 8, 900))) throw new HttpError(429, 'Te veel inlogpogingen. Wacht 15 minuten en probeer het opnieuw.');
  const u = await withActor(SYSTEM, tx => one(tx, 'select id, password_hash, role, disabled_at from users where lower(email) = $1', [email]));
  const ok = verifyPassword(ctx.body.password || '', u?.password_hash ?? null) && !u?.disabled_at;
  if (!ok) {
    const msg = u && !u.password_hash ? 'Voor dit account is geen wachtwoord ingesteld. Vraag hiernaast een inloglink aan.' : 'E-mailadres of wachtwoord is onjuist.';
    return html(ctx, h(CusP.LoginPage, { ctx, error: msg, email }), 401);
  }
  const token = await createSession(u.id, ctx.ip, String(ctx.req.headers['user-agent'] || ''));
  ctx.setCookie('rb_sess', token, { maxAge: 14 * 86400 });
  await withActor(SYSTEM, tx => audit(tx, { userId: u.id, role: u.role, companyId: null, ip: ctx.ip }, 'gebruiker.ingelogd', 'user', u.id));
  const next = ctx.body.terug || '';
  redirect(ctx, /^\/[a-z]/.test(next) && !next.startsWith('//') ? next : u.role === 'admin' ? '/beheer' : u.role === 'company' ? '/bedrijf' : '/mijn');
});
r.post('/inloglink', async ctx => {
  const email = (ctx.body.email || '').trim().toLowerCase();
  if (!(await rateLimit(`link:${ctx.ip}`, 10, 3600)) || !(await rateLimit(`link:${email}`, 3, 3600))) throw new HttpError(429, 'Te veel aanvragen. Probeer het later opnieuw.');
  await withActor(SYSTEM, async tx => {
    const u = await one(tx, `select id, full_name from users where lower(email) = $1 and role = 'customer' and disabled_at is null`, [email]);
    if (!u) return;   // geen informatie prijsgeven over het bestaan van accounts
    const t = await createLoginLink(tx, u.id, 'login_link');
    await queueEmail(tx, `inloglink:${u.id}:${Date.now()}`, email, 'toegangslink', 'Je inloglink voor PickMyRide', `Hallo ${u.full_name},\n\nLog in met deze link (48 uur geldig, eenmalig):\n${config.baseUrl}/toegang/${t}`);
  });
  html(ctx, h(CusP.LoginPage, { ctx, linkSent: true }));
});
r.post('/uitloggen', async ctx => { if (ctx.sessionId) await revokeSession(ctx.sessionId); ctx.setCookie('rb_sess', '', { maxAge: 0 }); redirect(ctx, '/'); });

// ───────── Klant ─────────
r.get('/mijn', async ctx => { requireRole(ctx, 'customer'); priv(ctx, CusP.MyRequestsPage, { groups: await R.listCustomerGroups(ctx.actor) }); });
r.get('/mijn/aanvragen/:id', async ctx => {
  requireRole(ctx, 'customer');
  const data = await R.getCustomerGroup(ctx.actor, uuid(ctx.params.id));
  priv(ctx, CusP.RequestDetailPage, { ...data, unread: await M.unreadCounts(ctx.actor), maxShown: (await getSettings()).max_offers_shown, sort: ctx.query.get('sorteer') === 'beoordeling' ? 'beoordeling' : 'prijs', showAll: ctx.query.get('alle') === '1' });
});
r.post('/mijn/aanbod/:id/kiezen', async ctx => {
  requireRole(ctx, 'customer');
  if (!(await rateLimit(`kiezen:${ctx.user!.id}`, 20, 600))) throw new HttpError(429, 'Te veel pogingen. Wacht even.');
  const res = await K.chooseOffer(ctx.actor, uuid(ctx.params.id));
  redirect(ctx, res.checkoutUrl);
});
r.post('/mijn/reservering/:id/annuleren', async ctx => {
  requireRole(ctx, 'customer');
  await K.cancelReservation(ctx.actor, uuid(ctx.params.id));
  ctx.setFlash('info', 'De reservering is geannuleerd. Je kunt een ander aanbod kiezen.');
  redirect(ctx, String(ctx.req.headers.referer || '/mijn').replace(/^https?:\/\/[^/]+/, '') || '/mijn');
});
r.get('/betaling/:id', async ctx => {
  requireRole(ctx, 'customer');
  const p = await withActor(ctx.actor, tx => one(tx, `select p.id, p.status, p.is_simulated, p.booking_id, k.booking_number, r.group_id from payments p
      join ride_requests r on r.id = p.ride_request_id left join bookings k on k.id = p.booking_id where p.id = $1`, [uuid(ctx.params.id)]));
  if (!p) throw new HttpError(404, 'Betaling niet gevonden.');
  priv(ctx, CusP.PaymentStatusPage, { payment: p, groupId: p.group_id });
});
r.get('/mijn/boekingen/:id', async ctx => {
  requireRole(ctx, 'customer'); const id = uuid(ctx.params.id);
  const data = await R.getCustomerBooking(ctx.actor, id);
  priv(ctx, CusP.BookingDetailPage, { ...data, conv: await M.getConversation(ctx.actor, id), help: await VV.caseForBooking(ctx.actor, id) });
});
r.post('/mijn/boekingen/:id/bericht', async ctx => {
  requireRole(ctx, 'customer'); const id = uuid(ctx.params.id);
  const res = await M.sendMessage(ctx.actor, id, ctx.body.body);
  if (res.error) ctx.setFlash('fout', res.error, 'contact');
  redirect(ctx, `/mijn/boekingen/${id}#contact`);
});
r.post('/mijn/boekingen/:id/bellen', async ctx => {
  requireRole(ctx, 'customer'); const id = uuid(ctx.params.id);
  const res = await M.startCall(ctx.actor, id);
  ctx.setFlash(res.status === 'mislukt' ? 'fout' : 'info', res.message, 'contact');
  redirect(ctx, `/mijn/boekingen/${id}#contact`);
});
const reportRoute = (base: string, role: string) => async (ctx: Ctx) => {
  requireRole(ctx, role); const id = uuid(ctx.params.id);
  if (!(await rateLimit(`melding:${ctx.actor.userId}`, 5, 3600))) throw new HttpError(429, 'Te veel meldingen. Bel of app de klantenservice.');
  try {
    const c = await VV.reportProblem(ctx.actor, id, ctx.body.reason || '', ctx.body.details || '');
    ctx.setFlash('ok', role === 'customer' ? `Melding ${c.case_number} is ontvangen. Onze klantenservice regelt zo nodig direct vervangend vervoer.` : `Melding ${c.case_number} is ontvangen. De klantenservice neemt contact met u op.`, 'hulp');
  } catch (e) { if (!(e instanceof HttpError) || e.status >= 500 || e.status === 404) throw e; ctx.setFlash('fout', e.message, 'hulp'); }
  redirect(ctx, `${base}/${id}#hulp`);
};
r.post('/mijn/boekingen/:id/melding', reportRoute('/mijn/boekingen', 'customer'));
r.post('/bedrijf/ritten/:id/melding', reportRoute('/bedrijf/ritten', 'company'));
r.post('/mijn/boekingen/:id/beoordeling', async ctx => {
  requireRole(ctx, 'customer'); const id = uuid(ctx.params.id);
  if (!(await rateLimit(`review:${ctx.user!.id}`, 10, 3600))) throw new HttpError(429, 'Te veel pogingen. Probeer het later opnieuw.');
  const res = await V.submitReview(ctx.actor, id, ctx.body);
  if (res.errors) return html(ctx, h(CusP.BookingDetailPage, { ctx, ...(await R.getCustomerBooking(ctx.actor, id)), reviewErrors: res.errors, reviewValues: ctx.body }), 422, { noindex: true });
  ctx.setFlash('ok', 'Bedankt! Je beoordeling is geplaatst.'); redirect(ctx, `/mijn/boekingen/${id}#beoordeling`);
});

// ───────── Betaalprovider ─────────
r.get('/api/boekingen/:id/berichten', async ctx => {
  requireRole(ctx, 'customer', 'company');
  const since = new Date(ctx.query.get('na') || 0);
  const rows = await M.messagesSince(ctx.actor, uuid(ctx.params.id), isNaN(since.getTime()) ? new Date(0) : since);
  ctx.res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  ctx.res.end(JSON.stringify(rows.map(m => ({ id: m.id, role: m.sender_role, body: m.body, hidden: m.hidden, at: new Date(m.created_at).toISOString() }))));
});
r.post('/api/webhooks/telefonie', async ctx => {
  try { await M.handleCallStatus((ctx as any).rawBody.toString('utf8'), ctx.req.headers, config.baseUrl + ctx.url.pathname); text(ctx, 'ok'); }
  catch (e) { await logError('Telefonie-webhook geweigerd', { error: (e as Error).message }); text(ctx, 'ongeldig', 400); }
});
r.post('/api/webhooks/betalingen', async ctx => {
  try {
    const result = await K.handlePaymentWebhook((ctx as any).rawBody, ctx.req.headers);
    logInfo('Betaalmelding verwerkt', { result });
    text(ctx, 'ok');
  } catch (e) {
    if (/handtekening|Ongeldige/.test((e as Error).message)) { await logError('Webhook geweigerd', { error: (e as Error).message, ip: ctx.ip }); return text(ctx, 'ongeldig', 400); }
    throw e;
  }
});
r.get('/demo-betaalomgeving/:id', async ctx => {
  if (config.paymentProvider !== 'demo' || config.appEnv === 'production') throw new HttpError(404, 'Niet beschikbaar.');
  const p = demoProvider.lookup(ctx.params.id);
  if (!p) throw new HttpError(404, 'Onbekende demo-betaling (de demo-betaalomgeving wordt gewist bij een herstart van de server).');
  priv(ctx, AdmP.DemoCheckoutPage, { providerPaymentId: ctx.params.id, amountCents: p.amountCents, status: p.status });
});
r.post('/demo-betaalomgeving/:id', async ctx => {
  if (config.paymentProvider !== 'demo' || config.appEnv === 'production') throw new HttpError(404, 'Niet beschikbaar.');
  const ret = await demoProvider.simulate(ctx.params.id, ctx.body.outcome === 'paid' ? 'paid' : 'failed');
  redirect(ctx, ret.replace(config.baseUrl, ''));
});

// ───────── Taxibedrijf ─────────
r.get('/bedrijf', async ctx => {
  requireRole(ctx, 'company');
  const [available, bids, bookings, unread] = await Promise.all([B.listAvailable(ctx.actor), B.listOwnBids(ctx.actor), K.listCompanyBookings(ctx.actor), M.unreadCounts(ctx.actor)]);
  priv(ctx, ComP.CompanyDashboardPage, { available: available.length, bids, bookings, unread });
});
r.get('/bedrijf/aanvragen', async ctx => { requireRole(ctx, 'company'); priv(ctx, ComP.AvailablePage, { rows: await B.listAvailable(ctx.actor) }); });
r.get('/bedrijf/aanvragen/:id', async ctx => {
  requireRole(ctx, 'company');
  const d = await B.getRideForCompany(ctx.actor, uuid(ctx.params.id));
  priv(ctx, ComP.RideBidPage, { ...d, rule: await B.activeCommissionRule(ctx.actor) });
});
r.post('/bedrijf/aanvragen/:id/bod', async ctx => {
  requireRole(ctx, 'company');
  const input: B.BidInput = { price: ctx.body.price, vehicle_category: ctx.body.vehicle_category, max_passengers: ctx.body.max_passengers, max_large_bags: ctx.body.max_large_bags,
    services: ctx.bodyAll.getAll('services'), wait_minutes: ctx.body.wait_minutes, flight_delay_policy: ctx.body.flight_delay_policy, cancellation_policy: ctx.body.cancellation_policy,
    valid_date: ctx.body.valid_date, valid_time: ctx.body.valid_time, note: ctx.body.note };
  const id = uuid(ctx.params.id);
  const res = await B.placeOrUpdateBid(ctx.actor, id, input);
  if (res.errors) { const d = await B.getRideForCompany(ctx.actor, id); return html(ctx, h(ComP.RideBidPage, { ctx, ...d, rule: await B.activeCommissionRule(ctx.actor), errors: res.errors, values: input }), 422); }
  ctx.setFlash('ok', 'Uw bod is opgeslagen. De klant ziet uw aanbod nu.');
  redirect(ctx, `/bedrijf/aanvragen/${id}`);
});
r.post('/bedrijf/biedingen/:id/intrekken', async ctx => { requireRole(ctx, 'company'); await B.withdrawBid(ctx.actor, uuid(ctx.params.id)); ctx.setFlash('info', 'Uw bod is ingetrokken.'); redirect(ctx, '/bedrijf/biedingen'); });
r.get('/bedrijf/biedingen', async ctx => { requireRole(ctx, 'company'); priv(ctx, ComP.MyBidsPage, { rows: await B.listOwnBids(ctx.actor) }); });
r.get('/bedrijf/ritten', async ctx => { requireRole(ctx, 'company'); priv(ctx, ComP.CompanyBookingsPage, { rows: await K.listCompanyBookings(ctx.actor), unread: await M.unreadCounts(ctx.actor) }); });
r.get('/bedrijf/ritten/:id', async ctx => {
  requireRole(ctx, 'company'); const id = uuid(ctx.params.id);
  const data = await K.getCompanyBooking(ctx.actor, id);
  priv(ctx, ComP.CompanyBookingPage, { ...data, conv: await M.getConversation(ctx.actor, id), help: await VV.caseForBooking(ctx.actor, id) });
});
r.post('/bedrijf/ritten/:id/bericht', async ctx => {
  requireRole(ctx, 'company'); const id = uuid(ctx.params.id);
  const res = await M.sendMessage(ctx.actor, id, ctx.body.body);
  if (res.error) ctx.setFlash('fout', res.error, 'contact');
  redirect(ctx, `/bedrijf/ritten/${id}#contact`);
});
r.post('/bedrijf/ritten/:id/bellen', async ctx => {
  requireRole(ctx, 'company'); const id = uuid(ctx.params.id);
  const res = await M.startCall(ctx.actor, id);
  ctx.setFlash(res.status === 'mislukt' ? 'fout' : 'info', res.message, 'contact');
  redirect(ctx, `/bedrijf/ritten/${id}#contact`);
});
r.post('/bedrijf/ritten/:id/toewijzen', async ctx => {
  requireRole(ctx, 'company'); const id = uuid(ctx.params.id);
  await K.assignDriverVehicle(ctx.actor, id, uuid(ctx.body.driver_id, 'Kies een chauffeur.'), uuid(ctx.body.vehicle_id, 'Kies een voertuig.'));
  ctx.setFlash('ok', 'Chauffeur en voertuig zijn toegewezen. De klant is geïnformeerd.'); redirect(ctx, `/bedrijf/ritten/${id}`);
});
r.post('/bedrijf/ritten/:id/status', async ctx => {
  requireRole(ctx, 'company'); const id = uuid(ctx.params.id);
  await K.updateBookingStatus(ctx.actor, id, String(ctx.body.to || ''), ctx.body.note);
  ctx.setFlash('ok', 'Status doorgegeven.'); redirect(ctx, `/bedrijf/ritten/${id}`);
});
r.get('/bedrijf/wagenpark', async ctx => { requireRole(ctx, 'company'); priv(ctx, ComP.FleetPage, await C.listFleet(ctx.actor)); });
r.post('/bedrijf/wagenpark/chauffeur', async ctx => { requireRole(ctx, 'company'); await C.addDriver(ctx.actor, ctx.bodyAll); ctx.setFlash('ok', 'Chauffeur toegevoegd.'); redirect(ctx, '/bedrijf/wagenpark'); });
r.post('/bedrijf/wagenpark/voertuig', async ctx => { requireRole(ctx, 'company'); await C.addVehicle(ctx.actor, ctx.bodyAll); ctx.setFlash('ok', 'Voertuig toegevoegd.'); redirect(ctx, '/bedrijf/wagenpark'); });
r.get('/bedrijf/financieel', async ctx => { requireRole(ctx, 'company'); priv(ctx, ComP.FinancePage, { rows: await K.listCompanyBookings(ctx.actor) }); });
r.get('/bedrijf/beoordelingen', async ctx => { requireRole(ctx, 'company'); priv(ctx, ComP.CompanyReviewsPage, await V.companyReviews(ctx.actor)); });
r.get('/bedrijf/profiel', async ctx => { requireRole(ctx, 'company'); priv(ctx, ComP.ProfilePage, await C.getOwnCompany(ctx.actor)); });
r.get('/bedrijf/meldingen', async ctx => { requireRole(ctx, 'company'); priv(ctx, ComP.CompanyPlaceholderPage, { title: 'Meldingsinstellingen', what: 'Zelf instellen welke e-mails u ontvangt' }); });
r.get('/bedrijf/ondersteuning', async ctx => { requireRole(ctx, 'company'); priv(ctx, ComP.CompanyPlaceholderPage, { title: 'Ondersteuning', what: 'Een ondersteuningsverzoek indienen vanuit het portaal' }); });
r.get('/documenten/:id', async ctx => {
  requireRole(ctx, 'company', 'admin');
  const d = await C.readDocument(ctx.actor, uuid(ctx.params.id));
  ctx.res.writeHead(200, { 'Content-Type': d.mime, 'Content-Disposition': `attachment; filename="${d.filename.replace(/"/g, '')}"`, 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' });
  ctx.res.end(d.data);
});

// ───────── Beheer ─────────
r.get('/beheer', async ctx => { requireRole(ctx, 'admin'); priv(ctx, AdmP.AdminDashboardPage, { k: await A.dashboardCounts(ctx.actor) }); });
r.get('/beheer/bedrijven', async ctx => { requireRole(ctx, 'admin'); priv(ctx, AdmP.AdminCompaniesPage, { rows: await C.listCompanies(ctx.actor) }); });
r.get('/beheer/bedrijven/:id', async ctx => { requireRole(ctx, 'admin'); priv(ctx, AdmP.AdminCompanyPage, await C.getCompanyAdmin(ctx.actor, uuid(ctx.params.id))); });
r.post('/beheer/bedrijven/:id/status', async ctx => {
  requireRole(ctx, 'admin'); const id = uuid(ctx.params.id);
  await C.setCompanyStatus(ctx.actor, id, ctx.body.to as any, ctx.body.note || '');
  ctx.setFlash('ok', 'Status van het bedrijf is gewijzigd en vastgelegd in het auditlog.'); redirect(ctx, `/beheer/bedrijven/${id}`);
});
r.post('/beheer/bedrijven/:id/buitenland', async ctx => {
  requireRole(ctx, 'admin'); const id = uuid(ctx.params.id);
  await C.setServesAbroad(ctx.actor, id, ctx.body.on === 'ja');
  ctx.setFlash('ok', 'Instelling buitenland opgeslagen en vastgelegd in het auditlog.'); redirect(ctx, `/beheer/bedrijven/${id}`);
});
r.post('/beheer/documenten/:id/controle', async ctx => {
  requireRole(ctx, 'admin');
  const verdict = ctx.body.verdict === 'goedgekeurd' ? 'goedgekeurd' : 'afgekeurd';
  await C.verifyDocument(ctx.actor, uuid(ctx.params.id), verdict, ctx.body.note || '');
  const d = await withActor(ctx.actor, tx => one(tx, 'select company_id from company_documents where id = $1', [ctx.params.id]));
  ctx.setFlash('ok', `Document ${verdict}.`); redirect(ctx, `/beheer/bedrijven/${d.company_id}`);
});
r.get('/beheer/aanvragen', async ctx => { requireRole(ctx, 'admin'); priv(ctx, AdmP.AdminRequestsPage, { rows: await A.listRequestsAdmin(ctx.actor) }); });
r.get('/beheer/aanvragen/:id', async ctx => { requireRole(ctx, 'admin'); priv(ctx, AdmP.AdminRequestPage, await A.getRequestAdmin(ctx.actor, uuid(ctx.params.id))); });
r.get('/beheer/instellingen', async ctx => { requireRole(ctx, 'admin'); priv(ctx, AdmP.AdminSettingsPage, await A.getSettingsAdmin(ctx.actor)); });
r.post('/beheer/instellingen', async ctx => { requireRole(ctx, 'admin'); await A.updateSetting(ctx.actor, ctx.body.key, ctx.body.value); ctx.setFlash('ok', 'Instelling opgeslagen.'); redirect(ctx, '/beheer/instellingen'); });
r.post('/beheer/commissie', async ctx => { requireRole(ctx, 'admin'); await A.createCommissionRule(ctx.actor, ctx.bodyAll); ctx.setFlash('ok', 'Nieuwe commissieregel is actief.'); redirect(ctx, '/beheer/instellingen'); });
r.get('/beheer/beoordelingen', async ctx => { requireRole(ctx, 'admin'); priv(ctx, AdmP.AdminReviewsPage, { rows: await V.listReviewsAdmin(ctx.actor) }); });
r.post('/beheer/beoordelingen/:id', async ctx => {
  requireRole(ctx, 'admin');
  await V.moderateReview(ctx.actor, uuid(ctx.params.id), ctx.body.to === 'gepubliceerd' ? 'gepubliceerd' : 'verborgen', ctx.body.reason || '');
  ctx.setFlash('ok', 'Beoordeling bijgewerkt en vastgelegd in het auditlog.'); redirect(ctx, '/beheer/beoordelingen');
});
r.get('/beheer/boekingen/:id', async ctx => { requireRole(ctx, 'admin'); priv(ctx, AdmP.AdminBookingPage, await M.getBookingAdmin(ctx.actor, uuid(ctx.params.id))); });
r.post('/beheer/berichten/:id/verbergen', async ctx => {
  requireRole(ctx, 'admin');
  const bookingId = await M.hideMessage(ctx.actor, uuid(ctx.params.id), ctx.body.reason || '');
  ctx.setFlash('ok', 'Bericht verborgen en vastgelegd in het auditlog.'); redirect(ctx, `/beheer/boekingen/${bookingId}`);
});
r.get('/beheer/vervangend-vervoer', async ctx => { requireRole(ctx, 'admin'); priv(ctx, AdmP.AdminCasesPage, { rows: await VV.listCases(ctx.actor) }); });
r.get('/beheer/vervangend-vervoer/:id', async ctx => { requireRole(ctx, 'admin'); priv(ctx, AdmP.AdminCasePage, await VV.getCase(ctx.actor, uuid(ctx.params.id))); });
const caseAction = (fn: (ctx: Ctx, id: string) => Promise<void>, ok: string) => async (ctx: Ctx) => {
  requireRole(ctx, 'admin'); const id = uuid(ctx.params.id);
  try { await fn(ctx, id); ctx.setFlash('ok', ok); }
  catch (e) { if (!(e instanceof HttpError) || e.status >= 500) throw e; ctx.setFlash('fout', e.message); }
  redirect(ctx, `/beheer/vervangend-vervoer/${id}`);
};
r.post('/beheer/vervangend-vervoer/:id/oppakken', caseAction((ctx, id) => VV.takeCase(ctx.actor, id), 'Je behandelt deze melding nu.'));
r.post('/beheer/vervangend-vervoer/:id/vervanger', caseAction((ctx, id) => VV.arrangeReplacement(ctx.actor, id, ctx.body), 'Vervanger vastgelegd. De klant is geïnformeerd in de app en per e-mail.'));
r.post('/beheer/vervangend-vervoer/:id/sluiten', caseAction((ctx, id) => VV.closeCase(ctx.actor, id, ctx.body.outcome, ctx.body.resolution), 'Melding gesloten en vastgelegd in het auditlog.'));
r.get('/beheer/audit', async ctx => { requireRole(ctx, 'admin'); priv(ctx, AdmP.AuditPage, { rows: await A.getAuditLog(ctx.actor) }); });
r.get('/beheer/export/:kind', async ctx => {
  requireRole(ctx, 'admin');
  const kind = ctx.params.kind.replace('.csv', '');
  if (kind !== 'boekingen' && kind !== 'aanvragen') throw new HttpError(404, 'Onbekende export.');
  const csv = await A.exportCsv(ctx.actor, kind);
  ctx.res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="pickmyride-${kind}.csv"`, 'Cache-Control': 'no-store' });
  ctx.res.end('﻿' + csv);
});
r.get('/ontwikkeling/mailbox', async ctx => {
  if (!config.demoMode || config.appEnv === 'production') throw new HttpError(404, 'Niet beschikbaar.');
  await deliverPending();
  priv(ctx, AdmP.MailboxPage, { rows: await withActor(SYSTEM, tx => many(tx, 'select * from notifications order by created_at desc limit 100')) });
});

// ───────── SEO ─────────
r.get('/robots.txt', async ctx => text(ctx, `User-agent: *\nDisallow: /mijn\nDisallow: /bedrijf\nDisallow: /beheer\nDisallow: /toegang\nDisallow: /betaling\nDisallow: /demo-betaalomgeving\nDisallow: /ontwikkeling\nDisallow: /documenten\nSitemap: ${config.baseUrl}/sitemap.xml\n`));
r.get('/sitemap.xml', async ctx => text(ctx, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SITEMAP_PAGES().map(p => `  <url><loc>${config.baseUrl}${p}</loc></url>`).join('\n')}\n</urlset>\n`, 200, 'application/xml; charset=utf-8'));
r.get('/gezondheid', async ctx => { await withActor(SYSTEM, tx => tx.query('select 1')); text(ctx, 'ok'); });

function uuid(v: string | undefined, msg = 'Ongeldige verwijzing.') {
  if (!v || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw new HttpError(v ? 404 : 400, v ? 'Niet gevonden.' : msg);
  return v;
}

// ───────── Verwerking per verzoek ─────────
export async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '/', 'http://localhost');
  const ip = (process.env.TRUST_PROXY === 'true' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress || '?';
  const setCookies: string[] = [];
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'sha256-${INLINE_JS_HASH}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'`);
  if (config.secureCookies) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  if (url.pathname.startsWith('/static/')) {
    const name = url.pathname.slice('/static/'.length);
    const file = path.join(STATIC_DIR, name);
    if (!/^((fonts\/[\w-]+\.woff)|(img\/[\w@-]+\.png)|(img\/icons\/[\w-]+\.svg)|(img\/foto\/[\w-]+\.webp)|([\w-]+\.(css|js)))$/.test(name) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    const type = name.endsWith('.css') ? 'text/css; charset=utf-8' : name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.png') ? 'image/png' : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.webp') ? 'image/webp' : 'font/woff';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': /\.(woff|png|webp)$/.test(name) ? 'public, max-age=86400' : 'public, max-age=300' });
    return res.end(fs.readFileSync(file));
  }

  const cookies = parseCookies(req.headers.cookie);
  const ctx = { req, res, url, method: req.method || 'GET', ip, params: {}, query: url.searchParams, cookies, body: {}, bodyAll: new URLSearchParams(), files: [],
    user: null, actor: actorFor(null, ip), sessionId: null, csrfToken: cookies.rb_csrf || '', flash: null,
    setFlash(type, t, area) { setCookies.push(cookieHeader('rb_flash', Buffer.from(JSON.stringify({ type, text: t, area })).toString('base64url'), { maxAge: 60 })); },
    setCookie(n, v, o) { setCookies.push(cookieHeader(n, v, o)); },
  } as Ctx;
  const origWriteHead = res.writeHead.bind(res);
  (res as any).writeHead = (...args: any[]) => { if (setCookies.length) res.setHeader('Set-Cookie', setCookies); return (origWriteHead as any)(...args); };

  try {
    if (!ctx.csrfToken || ctx.csrfToken.length < 20) { ctx.csrfToken = newCsrf(); ctx.setCookie('rb_csrf', ctx.csrfToken); }
    if (cookies.rb_flash) { try { ctx.flash = JSON.parse(Buffer.from(cookies.rb_flash, 'base64url').toString()); } catch { /* */ } ctx.setCookie('rb_flash', '', { maxAge: 0 }); }
    const sess = await loadSession(cookies.rb_sess);
    if (sess) { ctx.user = sess.user; ctx.sessionId = sess.sessionId; ctx.actor = actorFor(sess.user, ip); }

    ctx.support = await supportInfo();
    mergeTimeFields(url.searchParams);
    // Demo: kleurversie kiezen (warm = standaard, blauw = logokleuren). Wordt een dag onthouden.
    const th = url.searchParams.get('thema');
    if (config.demoMode && th && ['warm', 'blauw'].includes(th)) { ctx.setCookie('pmr_thema', th, { maxAge: 86400 }); ctx.cookies.pmr_thema = th; }
    const m = router.match(ctx.method, url.pathname);
    if (!m) throw new HttpError(404, 'Deze pagina bestaat niet (meer).');
    ctx.params = m.params;
    if (ctx.method === 'POST') {
      const type = String(req.headers['content-type'] || '');
      const raw = await readBody(req);
      if (url.pathname === '/api/webhooks/betalingen' || url.pathname === '/api/webhooks/telefonie') (ctx as any).rawBody = raw;
      else {
        if (type.startsWith('multipart/form-data')) { const mp = parseMultipart(raw, type); ctx.bodyAll = mp.fields; ctx.files = mp.files; }
        else ctx.bodyAll = new URLSearchParams(raw.toString('utf8'));
        mergeTimeFields(ctx.bodyAll);
        ctx.body = Object.fromEntries(ctx.bodyAll);
        ensureCsrf(ctx);
      }
    }
    await m.handler(ctx);
  } catch (e) {
    if (res.headersSent) { res.end(); return; }
    const err = e as HttpError & { redirectTo?: string };
    if (err.redirectTo) return redirect(ctx, err.redirectTo);
    const status = err instanceof HttpError ? err.status : 500;
    if (status >= 500) await logError('Onverwachte fout', { path: url.pathname, method: ctx.method, error: (e as Error).message, stack: (e as Error).stack?.split('\n').slice(0, 5).join(' | ') });
    const message = err instanceof HttpError ? err.message : 'Er is een onverwachte fout opgetreden. De fout is vastgelegd; probeer het later opnieuw.';
    if (url.pathname.startsWith('/api/')) return text(ctx, message, status);
    html(ctx, h(PubP.ErrorPage, { ctx, status, message }), status, { noindex: true });
  }
}

export function createServer() { return http.createServer((req, res) => { handle(req, res).catch(e => { console.error(e); try { res.writeHead(500); res.end(); } catch { /* */ } }); }); }

/** Achtergrondwerk: verlopen biedingen afsluiten en wachtende berichten verwerken. */
export async function backgroundTick() { try { await K.sweepExpired(); await deliverPending(); } catch (e) { await logError('Achtergrondtaak mislukt', { error: (e as Error).message }); } }

export async function startServer() {
  assertConfig();
  const server = createServer();
  await new Promise<void>(res => server.listen(config.port, res));
  logInfo('PickMyRide gestart', { port: config.port, env: config.appEnv, demo: config.demoMode, payments: config.paymentProvider, geo: config.geoProvider, mail: config.mailMode });
  setInterval(backgroundTick, 30_000).unref(); backgroundTick();
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) startServer().catch(e => { console.error(e.message); process.exit(1); });
