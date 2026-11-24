/** Stadspagina's ("Taxi [stad]") en het overzicht "Taxi per stad". Inhoud komt uit echte gegevens: afstanden, werkgebieden, boekingen. */
import type { Ctx } from '../../lib/http.ts';
import { Page } from '../layout.tsx';
import { QuickRequestForm } from './public.tsx';
import { LocalPage, LinkBand, breadcrumbLd, faqLd, type Crumb, type QA } from './landing.tsx';
import { CITY_COPY, type CityCopy } from '../../content/cities.ts';
import { CITIES, PROVINCES, airportsFor, nearbyCities, hasSchipholRoute, routeCities, type City } from '../../lib/cities.ts';
import { config } from '../../lib/config.ts';
import type { CityStats } from '../../domain/cities.ts';

const fill = (t: string, v: Record<string, string>) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

function cityFaq(c: CityCopy, v: Record<string, string>, texel: boolean): QA[] {
  if (texel) return [
    ['Kan ik vanaf Texel naar Schiphol reizen?', 'Beschrijf je vertrekpunt op Texel, je bestemming en de gewenste aansluiting op de veerboot. Controleer in een voorstel welk traject en welke afspraken zijn inbegrepen.'],
    ['Hoe plan ik ophalen bij de veerhaven op Texel?', 'Vermeld aan welke kant van de overtocht je wilt worden opgehaald en geef de gewenste tijd en plek door. Stem de aansluiting via de app af; beschikbaarheid volgt uit voorstellen.'],
    ['Wanneer vraag ik mijn taxi op Texel aan?', 'Plan je vertrek vanaf Texel minimaal 24 uur vooruit. Je aanvraag is gratis en vrijblijvend; pas als je zelf een voorstel kiest, wordt de rit een boeking.'],
    ['Wie reageert op mijn rit vanaf Texel?', 'Gecontroleerde taxibedrijven kunnen een voorstel doen voor jouw rit vanaf Texel. Vergelijk prijs en voorwaarden. Je contactgegevens blijven beschermd; contact loopt via de app.'],
  ];
  const t: [string, string][] = c.alt ? [
    ['Kan ik vanuit {C} naar {AP}?', 'Vraag een rit van {C} naar {AP} aan met je exacte vertrekadres, bagage en gewenste ophaaltijd. Of je kunt boeken, hangt af van de voorstellen die je ontvangt.'],
    ['Kan ik een ophaalplek bij {LM} opgeven?', 'Beschrijf je gewenste ophaalplek bij {LM} en voeg het volledige adres toe. Stem de precieze plek via de app af; een ontvangen voorstel bepaalt wat mogelijk is.'],
    ['Wanneer vraag ik mijn taxi in {C} aan?', 'Plan je vertrek uit {C} minimaal 24 uur vooruit. Je aanvraag is gratis en vrijblijvend; pas als je zelf een voorstel kiest, wordt de rit een boeking.'],
    ['Wie reageert op mijn rit vanuit {C}?', 'Gecontroleerde taxibedrijven kunnen een voorstel doen voor jouw rit uit {C}. Vergelijk prijs en voorwaarden. Je contactgegevens blijven beschermd; contact loopt via de app.'],
  ] : [
    ['Kan ik vanuit {C} naar {AP}?', 'Je kunt een rit van {C} naar {AP} aanvragen. Vul je exacte vertrekadres en de luchthaven als bestemming in. Beschikbare voorstellen bepalen welke rit je kunt kiezen.'],
    ['Kan ik ook een rit naar {N} aanvragen?', 'Ja, je kunt {N} als bestemming opgeven voor je vertrek uit {C}. Voeg het volledige adres toe; zo kan een bedrijf een voorstel doen voor jouw route.'],
    ['Hoe ver vooraf regel ik mijn taxi in {C}?', 'Vraag je rit vanuit {C} minimaal 24 uur voor vertrek aan. Een aanvraag is gratis en vrijblijvend. Je boekt pas wanneer je een voorstel kiest.'],
    ['Wie doet een voorstel en hoe loopt het contact?', 'Gecontroleerde taxibedrijven kunnen een voorstel doen voor je rit vanuit {C}. Je kiest zelf. Je contactgegevens blijven beschermd en het contact loopt via de app.'],
  ];
  return t.map(([q, a]) => [fill(q, v), fill(a, v)]);
}

export function CityPage({ ctx, city, minLeadHours }: { ctx: Ctx; city: City; stats?: CityStats; minLeadHours: number }) {
  const c = CITY_COPY[city.name];
  const texel = city.slug === 'texel';
  const v = { C: city.name, N: c.n, AP: c.ap, LM: c.lm };
  const van = texel ? 'vanaf' : 'vanuit';
  const faq = cityFaq(c, v, texel);
  const url = `${config.baseUrl}/taxi/${city.slug}`;
  const crumbs: Crumb[] = [['/taxi', 'Taxi per stad'], [`/taxi/${city.slug}`, city.name]];
  const ams = airportsFor(city).find(a => a.code === 'AMS')!;
  const ld = [breadcrumbLd(crumbs),
    { '@context': 'https://schema.org', '@type': 'Service', serviceType: 'Taxivervoer vooraf boeken', name: `Taxi ${city.name}`, url,
      areaServed: { '@type': 'City', name: city.name, containedInPlace: { '@type': 'AdministrativeArea', name: city.province } },
      provider: { '@type': 'Organization', name: 'PickMyRide', url: config.baseUrl } },
    faqLd(faq)];
  const links: [string, string][] = nearbyCities(city).map(n => [`/taxi/${n.slug}`, `Taxi ${n.name}`]);
  return (
    <LocalPage ctx={ctx} title={`Taxi ${city.name}: vergelijk voorstellen en boek vooraf`}
      description={`Taxi ${texel ? 'op' : 'in'} ${city.name} nodig? Vergelijk voorstellen van gecontroleerde taxibedrijven voor je rit naar ${c.ap}, ${c.n} of een andere bestemming. Gratis aanvragen, minimaal ${minLeadHours} uur vooraf.`}
      crumbs={crumbs} ld={ld}
      hero={{ label: 'Vooraf gepland · Zelf gekozen', h1: `Taxi ${texel ? 'op' : 'in'} ${city.name}`, belofte: 'Jouw rit. Jouw keuze.',
        intro: texel ? 'Een geplande rit op Texel of aansluitend op je overtocht. Beschrijf je route en vergelijk ontvangen voorstellen.' : fill('Van {C} naar {AP} of een afspraak in {N}. Vergelijk voorstellen voor jouw geplande rit.', v),
        foto: `stad-${city.slug}-hero`, alt: `Sfeerbeeld van een taxirit in ${city.name} (illustratief)`, caption: 'Reisimpressie · comfortabel onderweg', trust: 'Gecontroleerde bedrijven · Contact via de app' }}
      form={<QuickRequestForm minLeadHours={minLeadHours} pickupPlaceholder={`Straat 1, 1234 AB ${city.name}`} />}
      intro={{ label: `Onderweg in ${c.prov.toLowerCase().replace(/(^|-)\w/g, m => m.toUpperCase())}`, title: texel ? 'Op Texel, op jouw manier.' : `Vanuit ${city.name}, op jouw manier.`,
        texts: [`${c.lokaal} Vul je ophaaladres in en geef je bestemming en gewenste vertrektijd door.`, `Vraag minimaal ${minLeadHours} uur vooraf aan. Je aanvraag is gratis en vrijblijvend; pas wanneer je een voorstel kiest, wordt het een boeking.`],
        foto: `stad-${city.slug}-intro`, alt: `Sfeerbeeld van ${city.name} (illustratief)`, caption: city.slug === 'amsterdam' ? 'Amsterdam · stadsbeeld' : 'Reisimpressie · op weg naar je volgende bestemming' }}
      cards={{ label: 'Een rit die bij je plannen past', title: `Waarheen ${van} ${city.name}?`, cards: texel ? [
        { label: 'Luchthaven', title: 'Vanaf Texel naar Schiphol', text: 'Beschrijf je route en aansluiting op de veerboot. Stem af welk deel van je reis in het voorstel is inbegrepen.', action: 'Plan je rit →', href: `/rit-aanvragen?dropoff_street=${encodeURIComponent('Schiphol')}` },
        { label: 'Aansluiting op de veerboot', title: 'Texel en Den Helder', text: 'Geef aan aan welke kant van de overtocht je vervoer zoekt. Leg afspraken vast via de app voordat je kiest.', action: 'Plan je rit →', href: '#snel-titel' },
        { label: 'Bezoek en afspraken', title: 'Een rit vanaf Texel', text: 'Een geplande rit begint bij jouw adres. Je vergelijkt gecontroleerde bedrijven en kiest zelf een voorstel.', action: 'Plan je rit →', href: '#snel-titel' },
      ] : [
        { label: 'Luchthaven', title: `${city.name} → ${c.ap}`, text: 'Geef de luchthaven en je gewenste ophaaltijd door. Neem bagage en het aantal reizigers mee in je aanvraag.', action: 'Plan je rit →', href: `/rit-aanvragen?dropoff_street=${encodeURIComponent(c.ap)}` },
        { label: 'Andere stad', title: `${city.name} → ${c.n}`, text: 'Voor werk, familie of een afspraak buiten de stad. Vul het volledige aankomstadres in voor een passend voorstel.', action: 'Plan je rit →', href: '#snel-titel' },
        { label: 'Bezoek en afspraken', title: `Een rit vanuit ${city.name}`, text: 'Een geplande rit begint bij jouw adres. Je vergelijkt gecontroleerde bedrijven en kiest zelf een voorstel.', action: 'Plan je rit →', href: '#snel-titel' },
      ] }}
      steps={{ title: 'Van aanvraag naar vertrek.', items: [
        ['Vertel je reisplan', `Vul ${city.name} als vertrekplaats aan met je straat en huisnummer. Kies bestemming, datum en tijd; vraag minimaal ${minLeadHours} uur vooraf aan.`],
        ['Vergelijk voorstellen', 'Je aanvraag is gratis en vrijblijvend. Vergelijk voorstellen van gecontroleerde taxibedrijven op prijs en voorwaarden.'],
        ['Kies en boek', 'Zodra je een voorstel kiest, wordt je rit geboekt. Je contactgegevens blijven beschermd; contact loopt via de app.']] }}
      faq={{ label: 'Goed om te weten', title: `Taxi ${city.name}: jouw vragen.`, items: faq }}
      cta={{ label: 'Jouw volgende rit', title: `Klaar om ${texel ? 'vanaf' : 'uit'} ${city.name} te vertrekken?`, text: 'Vergelijk voorstellen en kies wat bij jouw reis past. Gratis aanvragen, zonder verplichting.', action: 'Vraag je rit aan →', note: `Minimaal ${minLeadHours} uur vooraf · Je boekt pas na je keuze` }}
      extra={<LinkBand title={`Taxi in de buurt van ${city.name}`} links={links}
        more={<>{hasSchipholRoute(city.slug) && <><a href={`/taxi/${city.slug}/schiphol`}>{`Taxi ${city.name} – Schiphol`}</a>{' · '}</>}<a href="/taxi">Alle steden</a>{` · Schiphol ligt hemelsbreed ca. ${ams.km} km van ${city.name}`}</>} />} />
  );
}

export function CitiesHubPage({ ctx }: { ctx: Ctx }) {
  return (
    <Page ctx={ctx} title="Taxi per stad" description={`Vraag een taxi aan in ${CITIES.length} Nederlandse steden en vergelijk vaste prijzen van gecontroleerde taxibedrijven. Voor ritten naar Schiphol, andere luchthavens en lange afstanden.`}>
      <h1>Taxi per stad</h1>
      <p className="muted" style={{ maxWidth: '60ch' }}>Kies je stad voor afstanden tot de luchthavens en om direct prijzen aan te vragen. Staat je plaats er niet bij? Je kunt vanaf elk adres in Nederland een rit <a href="/rit-aanvragen">aanvragen</a>.</p>
      <div className="province-grid">
        <section aria-labelledby="p-routes"><h2 id="p-routes">Naar Schiphol</h2>
          <ul>{routeCities().map(c => <li key={c.slug}><a href={`/taxi/${c.slug}/schiphol`}>{`${c.name} – Schiphol`}</a></li>)}</ul></section>
        {PROVINCES.map(p => <section key={p} aria-labelledby={`p-${p}`}>
          <h2 id={`p-${p}`}>{p}</h2>
          <ul>{CITIES.filter(c => c.province === p).sort((a, b) => a.name.localeCompare(b.name, 'nl')).map(c => <li key={c.slug}><a href={`/taxi/${c.slug}`}>{`Taxi ${c.name}`}</a></li>)}</ul>
        </section>)}
      </div>
    </Page>
  );
}

