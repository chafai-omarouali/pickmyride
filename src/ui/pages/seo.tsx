/**
 * Landingspagina's voor zoekverkeer: routes stad ↔ Schiphol, Nederlandse luchthavens en bestemmingen in het buitenland.
 * Alle cijfers komen uit echte platformgegevens of openbare afstanden; prijzen pas vanaf 3 boekingen.
 */
import type { ReactNode } from 'react';
import type { Ctx } from '../../lib/http.ts';
import { Page } from '../layout.tsx';
import { QuickRequestForm } from './public.tsx';
import { GuaranteeBlock } from '../support.tsx';
import { UspBar } from './public.tsx';
import { LocalPage, LinkBand, breadcrumbLd, faqLd, type QA } from './landing.tsx';
import { AIRPORT_COPY, ABROAD_COPY } from '../../content/airports.ts';
import { AIRPORTS } from '../../lib/airports.ts';
import { type City, airportsFor, citiesNear, airportCoords, routeCities, hasSchipholRoute, SCHIPHOL_ROUTES, AIRPORT_PAGES, distanceKm, roundKm, CITIES } from '../../lib/cities.ts';
import { type Destination, DESTINATIONS, FOREIGN_AIRPORTS, countryName } from '../../lib/abroad.ts';
import { formatEuro } from '../../lib/money.ts';
import { config } from '../../lib/config.ts';

type Price = { n: number; min_cents: number; median_cents: number } | null;
type Crumb = [string, string];

function Landing(p: { ctx: Ctx; title: string; description: string; crumbs: Crumb[]; h1: string; lead: string; points: string[]; form: ReactNode; faq: [string, string][]; children: ReactNode; extraLd?: object[] }) {
  const url = config.baseUrl + p.crumbs[p.crumbs.length - 1][0];
  const ld = [
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['/', 'Home'] as Crumb, ...p.crumbs].map(([h, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: config.baseUrl + h })) },
    { '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Taxivervoer vooraf boeken', name: p.h1, url, provider: { '@type': 'Organization', name: 'PickMyRide', url: config.baseUrl } },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    ...(p.extraLd || []),
  ];
  return (
    <Page ctx={p.ctx} title={p.title} description={p.description}
      hero={<section className="hero hero-city"><div className="wrap hero-grid">
        <div>
          <nav className="crumbs" aria-label="Kruimelpad"><a href="/">Home</a>{p.crumbs.map(([h, n], i) => i < p.crumbs.length - 1
            ? <span key={h}> <span aria-hidden="true">/</span> <a href={h}>{n}</a></span>
            : <span key={h}> <span aria-hidden="true">/</span> <span aria-current="page">{n}</span></span>)}</nav>
          <h1>{p.h1}</h1>
          <p className="lead">{p.lead}</p>
          <ul className="points">{p.points.map(x => <li key={x}>{x}</li>)}</ul>
        </div>
        {p.form}
      </div></section>}
      band={<><UspBar /><section className="band"><div className="wrap">
        {p.children}
        <GuaranteeBlock ctx={p.ctx} />
        <section className="split" aria-labelledby="faq">
          <div><h2 id="faq">Veelgestelde vragen</h2></div>
          <div className="faq">{p.faq.map(([q, a]) => <details key={q}><summary>{q}</summary><p style={{ marginTop: '.6rem' }}>{a}</p></details>)}</div>
        </section>
        {ld.map((x, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(x) }} />)}
      </div></section></>}>
      {null as any}
    </Page>
  );
}

const PriceFacts = ({ price, label }: { price: Price; label: string }) => price
  ? <div><dt>{`${label} (${price.n} geboekte ritten)`}</dt><dd>{`vanaf ${formatEuro(price.min_cents)}`}</dd><p className="small muted">{`Middelste prijs ${formatEuro(price.median_cents)}`}</p></div>
  : null;
const priceAnswer = (price: Price, what: string) => price
  ? `Via PickMyRide zijn ${price.n} ritten ${what} geboekt. De laagste prijs was ${formatEuro(price.min_cents)}, de middelste ${formatEuro(price.median_cents)}. Je eigen prijs hangt af van je adres, het tijdstip, het voertuig en je bagage.`
  : `Dat hangt af van je adres, het tijdstip, het voertuig en je bagage. Plaats je rit en je ontvangt vrijblijvend voorstellen met een vaste totaalprijs.`;
const AMS = AIRPORTS.find(a => a.code === 'AMS')!;

// ───────── Route stad ↔ Schiphol ─────────
export function RoutePage({ ctx, city, price, minLeadHours }: { ctx: Ctx; city: City; price: Price; minLeadHours: number }) {
  const km = airportsFor(city).find(a => a.code === 'AMS')!.km;
  const faq: [string, string][] = [
    [`Wat kost een taxi van ${city.name} naar Schiphol?`, priceAnswer(price, `tussen ${city.name} en Schiphol`)],
    [`Hoe ver is Schiphol van ${city.name}?`, `Hemelsbreed ongeveer ${km} km vanaf het centrum van ${city.name}. Over de weg is het verder; de rijtijd hangt af van het tijdstip en het verkeer.`],
    ['Wat als mijn vlucht vertraagd is?', 'Vul je vluchtnummer in. Elk aanbod vermeldt hoeveel wachttijd is inbegrepen en wat het taxibedrijf doet bij vertraging, zodat je dat vooraf kunt vergelijken.'],
    ['Waar word ik op Schiphol opgehaald?', 'Na de boeking spreek je de ophaalplek af met je vervoerder, via de chat of door te bellen in de app. Je telefoonnummer blijft daarbij afgeschermd.'],
    [`Kan ik ook een retour ${city.name} – Schiphol boeken?`, 'Ja. Kies "Retour" en vul de terugrit in. Heen- en terugrit zijn twee aparte ritten; je kiest per rit het aanbod dat je wilt.'],
    ['Hoe ver van tevoren moet ik boeken?', `Minimaal ${minLeadHours} uur van tevoren. Hoe eerder je aanvraagt, hoe meer tijd taxibedrijven hebben om een aanbod te doen.`],
  ];
  const others = routeCities().filter(c => c.slug !== city.slug).map(c => ({ c, km: distanceKm(city, c) })).sort((a, b) => a.km - b.km).slice(0, 6).map(x => x.c);
  return (
    <Landing ctx={ctx} title={`Taxi ${city.name} Schiphol: vaste prijs, vooraf geboekt`}
      description={`Taxi van ${city.name} naar Schiphol of terug? Vergelijk vaste prijzen van gecontroleerde taxibedrijven en boek vooraf. Hemelsbreed ca. ${km} km.`}
      crumbs={[['/taxi', 'Taxi per stad'], [`/taxi/${city.slug}`, city.name], [`/taxi/${city.slug}/schiphol`, 'Schiphol']]}
      h1={`Taxi ${city.name} – Schiphol`} lead={`Van ${city.name} naar Schiphol of van Schiphol terug naar huis? Plaats je rit en ontvang vaste prijzen van gecontroleerde taxibedrijven. Je kiest zelf.`}
      points={[`Hemelsbreed ca. ${km} km`, 'Vaste totaalprijs, inclusief afgesproken wachttijd', 'Beide richtingen en retour mogelijk']}
      form={<QuickRequestForm minLeadHours={minLeadHours} title={`${city.name} → Schiphol`} pickupPlaceholder={`Je adres in ${city.name}`} dropoff={AMS.name} />}
      faq={faq}>
      <section className="split" aria-labelledby="richting">
        <div><h2 id="richting">Kies je richting</h2><p className="muted">Beide richtingen gaan via hetzelfde aanvraagformulier. Bij "Retour" plan je heen en terug in één keer.</p></div>
        <ul className="ruled-list">
          <li><span><strong>{`${city.name} → Schiphol`}</strong><span className="small muted">Ophalen thuis, afzetten bij Vertrekpassage</span></span>
            <a className="btn btn-secondary btn-small" href={`/rit-aanvragen?dropoff_street=${encodeURIComponent(AMS.name)}`}>Prijzen aanvragen</a></li>
          <li><span><strong>{`Schiphol → ${city.name}`}</strong><span className="small muted">Ophalen na je vlucht</span></span>
            <a className="btn btn-secondary btn-small" href={`/rit-aanvragen?pickup_street=${encodeURIComponent(AMS.name)}`}>Prijzen aanvragen</a></li>
        </ul>
      </section>
      <section className="split" aria-labelledby="cijfers">
        <div><h2 id="cijfers">Deze route in cijfers</h2><p className="muted">Uit PickMyRide zelf, automatisch bijgewerkt.</p></div>
        <dl className="city-facts">
          <div><dt>Afstand hemelsbreed</dt><dd>{`ca. ${km} km`}</dd></div>
          <PriceFacts price={price} label="Prijs" />
          {!price && <div><dt>Prijzen</dt><dd>Op aanvraag</dd><p className="small muted">We tonen prijzen pas als er minimaal 3 ritten op deze route geboekt zijn.</p></div>}
        </dl>
      </section>
      <section aria-labelledby="meer" style={{ marginTop: '4.5rem' }}>
        <h2 id="meer">Andere routes naar Schiphol</h2>
        <ul className="city-links">{others.map(c => <li key={c.slug}><a href={`/taxi/${c.slug}/schiphol`}>{`Taxi ${c.name} – Schiphol`}</a></li>)}</ul>
        <p><a href={`/taxi/${city.slug}`}>{`Meer over taxi ${city.name}`}</a> · <a href="/luchthaven/schiphol">Taxi Schiphol</a></p>
      </section>
    </Landing>
  );
}

// ───────── Nederlandse luchthaven (Figma-sjabloon) ─────────
export function AirportPage({ ctx, slug, minLeadHours }: { ctx: Ctx; slug: string; price?: Price; minLeadHours: number }) {
  const page = AIRPORT_PAGES.find(a => a.slug === slug)!;
  const ap = AIRPORTS.find(a => a.code === page.code)!;
  const cp = AIRPORT_COPY[slug];
  const f = (t: string) => t.split('{AP}').join(page.short);
  const near = citiesNear(airportCoords(page.code), 12);
  const faq: QA[] = [
    [f('Wat kost een taxi naar {AP}?'), 'De totaalprijs hangt af van je route, het tijdstip en je reiswensen. Vraag gratis en vrijblijvend voorstellen aan. Vergelijk de totaalprijs en voorwaarden voordat je een voorstel kiest.'],
    [cp.faqQ, f(cp.faqA)],
    ['Hoe ver vooraf vraag ik mijn rit aan?', `Vraag minimaal ${minLeadHours} uur voor de gewenste ophaaltijd aan. Een aanvraag is gratis en vrijblijvend, geen boeking. Pas wanneer je een voorstel kiest, boek je de rit.`],
    ['Wat spreek ik af bij vertraging van mijn vlucht?', 'Deel je vluchtgegevens met het taxibedrijf. Spreek vooraf af wat er bij vertraging gebeurt en welke voorwaarden of extra kosten gelden. Neem bij wijzigingen contact op met de vervoerder.'],
    ['Kan mijn bagage mee en waar word ik opgehaald?', 'Geef koffers, bijzondere bagage en het aantal reizigers door. Laat het taxibedrijf bevestigen dat er voldoende ruimte is. Spreek ook een exact ophaalpunt af; ga niet uit van een vaste ontmoetingsplek.'],
  ];
  const crumbs: Crumb[] = [['/luchthavens', 'Luchthavens'], [`/luchthaven/${slug}`, page.short]];
  const links: [string, string][] = near.map(({ c }) => page.code === 'AMS' && hasSchipholRoute(c.slug) ? [`/taxi/${c.slug}/schiphol`, `Taxi ${c.name} – Schiphol`] : [`/taxi/${c.slug}`, `Taxi ${c.name}`]);
  return (
    <LocalPage ctx={ctx} title={`Taxi ${page.short}: vergelijk voorstellen en boek vooraf`}
      description={`Taxi naar of van ${ap.name}? Vergelijk de totaalprijs van gecontroleerde taxibedrijven en kies zelf. Gratis aanvragen, minimaal ${minLeadHours} uur vooraf.`}
      crumbs={crumbs}
      ld={[breadcrumbLd(crumbs), { '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Taxivervoer vooraf boeken', name: `Taxi ${page.short}`, url: `${config.baseUrl}/luchthaven/${slug}`, provider: { '@type': 'Organization', name: 'PickMyRide', url: config.baseUrl } }, faqLd(faq)]}
      hero={{ label: `Luchthaventaxi · ${cp.code}`, h1: `Taxi ${page.short}`, belofte: 'Op reis. Op jouw manier.', intro: f(cp.intro),
        foto: `luchthaven-${slug}-hero`, alt: `Sfeerbeeld van een luchthavenrit naar ${page.short} (illustratief)`, caption: 'Sfeerbeeld · luchthavenreis, geen specifieke terminal', trust: 'Gecontroleerde taxibedrijven · Jij kiest het voorstel' }}
      form={<QuickRequestForm minLeadHours={minLeadHours} subtitle="Jouw luchthavenrit begint hier." dropoff={ap.name} />}
      intro={{ label: 'Voor je naar de luchthaven gaat', title: cp.planTitle, texts: [f(cp.planText), 'Geef het aantal reizigers en je bagage door. Heb je extra ruimte of een kinderzitje nodig? Bespreek dit met het taxibedrijf voordat je een voorstel kiest.'],
        foto: `luchthaven-${slug}-intro`, alt: 'Sfeerbeeld van reizigers met bagage bij een taxi (illustratief)', caption: 'Sfeerbeeld · comfortabel onderweg' }}
      cards={{ label: 'Twee reisrichtingen · Eén duidelijk plan', title: 'Naar de vlucht. En weer naar huis.', cards: [
        { label: 'Heenreis', title: `Naar ${page.short}`, text: `Vul je volledige vertrekadres in en kies de luchthaven als bestemming. Vraag minimaal ${minLeadHours} uur vooraf aan en stem je ophaaltijd af op het incheckadvies.`, action: 'Plan je heenreis →', href: `/rit-aanvragen?dropoff_street=${encodeURIComponent(ap.name)}` },
        { label: 'Terugreis', title: `Vanaf ${page.short}`, text: f(cp.back), action: 'Bereid je terugreis voor →', href: `/rit-aanvragen?pickup_street=${encodeURIComponent(ap.name)}` }] }}
      steps={{ title: 'Van aanvraag naar luchthavenrit.', items: [
        ['Deel je reisplan', `Vul vertrek, bestemming, datum en tijd in. Vraag je rit minimaal ${minLeadHours} uur vooraf aan. Vermeld reizigers en bagage.`],
        ['Vergelijk de totaalprijs', 'Je aanvraag is gratis en vrijblijvend. Vergelijk de totaalprijs en voorwaarden van gecontroleerde taxibedrijven.'],
        ['Kies jouw voorstel', 'Je aanvraag is nog geen boeking. Je boekt pas als je een voorstel kiest. Stem je vluchtgegevens en ophaalpunt af met de vervoerder.']] }}
      faq={{ label: 'Goed om te weten', title: `Taxi ${page.short}: jouw vragen.`, items: faq }}
      cta={{ label: 'Jouw vlucht. Jouw voorstel.', title: `Klaar voor je reis via ${page.short}?`, text: 'Vergelijk de totaalprijs en kies zelf. Gratis aanvragen, zonder verplichting.', action: 'Vraag je rit aan →', note: `Minimaal ${minLeadHours} uur vooraf · Je boekt pas na je keuze` }}
      extra={<>
        <LinkBand title={`Steden dichtbij ${page.short}`} links={links} more={<>{`Adres: ${ap.street}, ${ap.postcode} ${ap.city}`} · <a href="/luchthavens">Alle luchthavens</a></>} />
        {page.code === 'AMS' && <LinkBand title="Populaire routes naar Schiphol" links={routeCities().map(c => [`/taxi/${c.slug}/schiphol`, `Taxi ${c.name} – Schiphol`])} />}
      </>} />
  );
}

export function AirportsHubPage({ ctx }: { ctx: Ctx }) {
  return (
    <Page ctx={ctx} title="Luchthavenvervoer: taxi naar de luchthaven" description="Luchthavenvervoer per taxi naar Schiphol, Rotterdam The Hague Airport, Eindhoven Airport en andere luchthavens in Nederland en net over de grens. Vergelijk vaste prijzen en boek vooraf.">
      <h1>Taxi naar de luchthaven</h1>
      <p className="muted" style={{ maxWidth: '60ch' }}>Kies je luchthaven voor het adres, steden in de buurt en om direct prijzen aan te vragen.</p>
      <div className="province-grid">
        <section aria-labelledby="nl"><h2 id="nl">Nederland</h2><ul>{AIRPORT_PAGES.map(a => <li key={a.slug}><a href={`/luchthaven/${a.slug}`}>{`Taxi ${a.short}`}</a></li>)}</ul></section>
        <section aria-labelledby="bl"><h2 id="bl">Buitenland</h2><ul>{DESTINATIONS.filter(d => d.kind === 'luchthaven').map(d => <li key={d.slug}><a href={`/buitenland/${d.slug}`}>{`Taxi naar ${d.name}`}</a></li>)}</ul></section>
        <section aria-labelledby="rt"><h2 id="rt">Routes naar Schiphol</h2><ul>{routeCities().slice(0, 12).map(c => <li key={c.slug}><a href={`/taxi/${c.slug}/schiphol`}>{`${c.name} – Schiphol`}</a></li>)}</ul></section>
      </div>
    </Page>
  );
}

// ───────── Buitenland (Figma-sjabloon) ─────────
export function AbroadPage({ ctx, dest, minLeadHours }: { ctx: Ctx; dest: Destination; companies?: number; price?: Price; minLeadHours: number }) {
  const ap = dest.airport ? FOREIGN_AIRPORTS.find(a => a.code === dest.airport)! : null;
  const land = countryName(dest.country);
  const cp = ABROAD_COPY[dest.slug];
  const f = (t: string) => t.split('{D}').join(dest.name);
  const near = citiesNear(dest, 8);
  const faq: QA[] = [
    ['Hoe vraag ik deze rit vanuit Nederland aan?', f('Vul je Nederlandse vertrekadres in en kies {D} als bestemming. Voeg datum, tijd en reiswensen toe. Of je een rit kunt kiezen, hangt af van de ontvangen voorstellen.')],
    [f(cp.faqQ), f(cp.faqA)],
    ['Wanneer aanvragen en is dat al een boeking?', `Vraag minimaal ${minLeadHours} uur voor vertrek aan. Je aanvraag is gratis en vrijblijvend, geen boeking. Je boekt pas wanneer je een prijsvoorstel kiest.`],
    ['Wat kost de rit en hoe loopt het contact?', 'De totaalprijs staat in het voorstel van het bedrijf. Vergelijk prijs en voorwaarden en kies zelf je aanbieder. Vragen over bagage, planning of ophaalpunt stel je via de app.'],
  ];
  const crumbs: Crumb[] = [['/buitenland', 'Buitenland'], [`/buitenland/${dest.slug}`, dest.name]];
  const form = ap
    ? <QuickRequestForm minLeadHours={minLeadHours} dropoff={ap.name} />
    : <QuickRequestForm minLeadHours={minLeadHours} dropoffPlaceholder={`Straat en huisnummer in ${dest.name}`} hidden={{ dropoff_city: dest.name, dropoff_country: dest.country }} />;
  return (
    <LocalPage ctx={ctx} title={`Taxi naar ${dest.name} vanuit Nederland: vergelijk voorstellen`}
      description={`Taxi vanuit Nederland naar ${dest.name} (${land})? Vergelijk de totaalprijs van taxibedrijven die over de grens rijden en kies zelf. Gratis aanvragen.`}
      crumbs={crumbs}
      ld={[breadcrumbLd(crumbs), { '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Taxivervoer vooraf boeken', name: `Taxi naar ${dest.name}`, url: `${config.baseUrl}/buitenland/${dest.slug}`, provider: { '@type': 'Organization', name: 'PickMyRide', url: config.baseUrl } }, faqLd(faq)]}
      hero={{ label: `Vanuit Nederland · Naar ${land}`, h1: `Taxi naar ${dest.name}`, belofte: 'Jouw route. Jouw keuze.', intro: f(cp.intro),
        foto: `buitenland-${dest.slug}-hero`, alt: `Sfeerbeeld van een taxirit naar ${dest.name} (illustratief)`, caption: f(cp.caption), trust: 'Gratis aanvraag · Contact via de app' }}
      form={form}
      intro={{ label: `Jouw route naar ${land}`, title: ap ? 'Goed voorbereid naar de terminal.' : 'Van jouw voordeur naar de stad.',
        texts: [f(cp.lokaal), `Vraag minimaal ${minLeadHours} uur vooraf aan. De aanvraag is gratis en vrijblijvend; je boekt pas wanneer je een voorstel kiest.`],
        foto: `buitenland-${dest.slug}-intro`, alt: 'Sfeerbeeld van een reiziger onderweg in een taxi (illustratief)', caption: 'Sfeerbeeld · comfortabel onderweg' }}
      cards={{ label: 'Voor je vertrekt', title: 'Drie dingen om vooraf te regelen.', plain: true, cards: [
        { label: '01 · Bestemming', title: f(cp.c0t), text: f(cp.c0), action: 'Maak je route compleet', href: '' },
        { label: '02 · Reisgezelschap', title: 'Wie en wat reist mee?', text: 'Geef het aantal reizigers en je bagage door. Bespreek bijzondere wensen vooraf met het bedrijf dat je kiest.', action: 'Deel je reiswensen', href: '' },
        { label: '03 · Vertrek en terugreis', title: cp.c2t || 'Ook de terugreis plannen?', text: f(cp.c2 || 'Geef voor een terugreis ook vertrekadres, datum en tijd door. Stem het ophaalpunt in {D} af via de app.'), action: 'Leg je afspraken vast', href: '' }] }}
      steps={{ title: 'Aanvragen. Vergelijken. Zelf kiezen.', items: [
        ['Vraag je rit aan', `Vul je vertrekadres in Nederland in en kies ${cp.stap || dest.name} als bestemming. Voeg datum en tijd toe; vraag minimaal ${minLeadHours} uur vooraf aan.`],
        ['Vergelijk totaalprijzen', 'Je aanvraag is gratis en vrijblijvend. Vergelijk de totaalprijs en voorwaarden van de voorstellen die je ontvangt.'],
        ['Kies het taxibedrijf', 'Een aanvraag is nog geen boeking. Je boekt pas als je een voorstel kiest. Stem je rit af met het bedrijf via de app.']] }}
      faq={{ label: 'Vragen over jouw route', title: 'Goed om te weten voor vertrek.', items: faq }}
      cta={{ label: 'Vanuit Nederland · Jouw volgende rit', title: 'Jouw reis begint met een aanvraag.', text: f('Vraag je rit naar {D} aan. Vergelijk de totaalprijs en kies zelf je taxibedrijf.'), action: 'Vraag je rit aan →', note: `Gratis en vrijblijvend · Minimaal ${minLeadHours} uur vooraf` }}
      extra={<>
        <LinkBand title={`Dichtstbij in Nederland`} links={near.map(({ c, km }) => [`/taxi/${c.slug}`, `Taxi ${c.name} (ca. ${km} km)`])} more={ap ? `Adres: ${ap.street}, ${ap.postcode} ${ap.city} (${land})` : undefined} />
        <LinkBand title="Andere bestemmingen in het buitenland" links={DESTINATIONS.filter(d => d.slug !== dest.slug).map(d => [`/buitenland/${d.slug}`, `Taxi naar ${d.name}`])} />
      </>} />
  );
}

export function AbroadHubPage({ ctx }: { ctx: Ctx }) {
  const byCountry = ['BE', 'DE', 'FR'] as const;
  return (
    <Page ctx={ctx} title="Taxi naar het buitenland: België, Duitsland en Frankrijk" description="Taxi vanuit Nederland naar België, Duitsland, Frankrijk of Luxemburg. Vergelijk vaste prijzen van taxibedrijven die over de grens rijden.">
      <h1>Taxi naar het buitenland</h1>
      <p className="muted" style={{ maxWidth: '62ch' }}>Vanuit Nederland naar België, Duitsland, Frankrijk of Luxemburg, of terug. Alleen taxibedrijven die over de grens rijden kunnen bieden. Staat je bestemming er niet bij? Kies het land in het <a href="/rit-aanvragen">aanvraagformulier</a> en vul het adres zelf in.</p>
      <div className="province-grid">
        {byCountry.map(c => <section key={c} aria-labelledby={`c-${c}`}><h2 id={`c-${c}`}>{countryName(c)}</h2>
          <ul>{DESTINATIONS.filter(d => d.country === c).map(d => <li key={d.slug}><a href={`/buitenland/${d.slug}`}>{`Taxi naar ${d.name}`}</a></li>)}</ul></section>)}
      </div>
    </Page>
  );
}

export const SEO_PATHS = () => [
  '/luchthavens', '/buitenland',
  ...routeCities().map(c => `/taxi/${c.slug}/schiphol`),
  ...AIRPORT_PAGES.map(a => `/luchthaven/${a.slug}`),
  ...DESTINATIONS.map(d => `/buitenland/${d.slug}`),
];
void CITIES; void roundKm; void SCHIPHOL_ROUTES;
