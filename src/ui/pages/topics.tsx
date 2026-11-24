/**
 * Themapagina's voor zoekverkeer zonder plaatsnaam: kosten, taxibus, reserveren, goedkoop, kinderzitje.
 * Maximumtarieven 2026: Rijksoverheid, Regeling maximumtarief en bekendmaking tarieven taxivervoer (Stcrt. 2025, 41618).
 */
import type { ReactNode } from 'react';
import type { Ctx } from '../../lib/http.ts';
import { QuickRequestForm } from './public.tsx';
import { TopicPage, Figure, LinkBand } from './landing.tsx';
import { formatEuro } from '../../lib/money.ts';

/** Officiële maximumtarieven taxi (opstapmarkt), 2026, in centen. */
export const MAX_TARIFFS = {
  jaar: 2026,
  personenauto: { label: 'Personenauto (maximaal 4 personen)', start: 431, km: 317, min: 52 },
  busje: { label: 'Busje (5 tot 8 personen)', start: 877, km: 400, min: 59 },
} as const;
export type TariffKind = 'personenauto' | 'busje';
export function maxMeterPrice(kind: TariffKind, km: number, minutes: number) {
  const t = MAX_TARIFFS[kind];
  return Math.round(t.start + km * t.km + minutes * t.min);
}

type Price = { n: number; min_cents: number; median_cents: number } | null;

const eur = (c: number) => formatEuro(c);
const T = MAX_TARIFFS;

/** Kaarten-raster (Figma "verdieping"): titel, tekst, optioneel label. */
const Deep = ({ label, title, sub, children }: { label: string; title: string; sub?: string; children: ReactNode }) => (
  <section className="fg-sec fg-white" aria-labelledby="lp-deep"><div className="wrap">
    <p className="fg-eyebrow">{label}</p>
    <h2 id="lp-deep" className="fg-h2">{title}</h2>
    {sub && <p className="fg-lead">{sub}</p>}
    {children}
  </div></section>
);
const Note = ({ title, text, tone = 'sage' }: { title: string; text: string; tone?: 'sage' | 'line' }) =>
  <div className={`lp-note lp-note-${tone}`}><h3>{title}</h3><p>{text}</p></div>;
const crumb = (path: string, name: string): [string, string][] => [[path, name]];
const note = (h: number) => `Gratis aanvraag · Minimaal ${h} uur vooraf`;

// ───────── Wat kost een taxi? ─────────
export function CostPage({ ctx, minLeadHours, calc }: { ctx: Ctx; minLeadHours: number; calc: { kind: TariffKind; km: number; min: number; price: number } | null; schiphol?: Price }) {
  const c = calc;
  return (
    <TopicPage ctx={ctx} crumbs={crumb('/wat-kost-een-taxi', 'Wat kost een taxi?')} title={`Wat kost een taxi? Waar de prijs van afhangt en tarieven ${T.jaar}`}
      description={`Wat kost een taxi? Lees waar de ritprijs van afhangt, bekijk de officiële maximumtarieven ${T.jaar} en vergelijk vooraf de totaalprijs van gecontroleerde taxibedrijven.`}
      hero={{ label: 'Inzicht in je ritprijs', h1: 'Wat kost een taxi?', belofte: 'Een ritprijs die bij jouw reis past.', intro: 'De kosten hangen af van je route, het moment en wat je nodig hebt. Vraag voorstellen aan en vergelijk de totaalprijs vóór je kiest.', foto: 'onderwerp-kost-hero', alt: 'Reiziger met telefoon naast een geparkeerde taxi (illustratief)' }}
      form={<QuickRequestForm minLeadHours={minLeadHours} />} formNote="Vergelijk wat is inbegrepen. Er is niet één tarief voor iedere rit."
      deep={<Deep label="De prijs opgebouwd" title="Waar hangt de taxiprijs van af?" sub="Geen standaardbedrag, maar een voorstel voor jouw route en wensen.">
        <ul className="lp-factors">{([
          ['Afstand en route', 'Vertrek, bestemming en eventuele tussenstops bepalen hoe lang en ver de rit is.'],
          ['Moment en reistijd', 'De datum, vertrektijd en verwachte duur kunnen invloed hebben op het voorstel.'],
          ['Het juiste voertuig', 'Een personenauto of taxibus: kies vervoer dat past bij je gezelschap en bagage.'],
          ['Extra wensen', 'Denk aan wachten, een extra stop of een kinderzitje. Laat bevestigen wat is inbegrepen.']] as const).map(([t, d], i) =>
          <li key={t}><span className="zg-num">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></li>)}</ul>
      </Deep>}
      steps={{ label: 'Van aanvraag tot vertrek', title: 'Van route naar een helder voorstel.', items: [
        ['Vraag je rit aan', 'Vul route, datum, personen en extra wensen in.'], ['Vergelijk de totaalprijs', 'Bekijk per voorstel wat wel en niet is inbegrepen.'], ['Kies wat bij je past', 'Controleer de voorwaarden en bevestig je keuze.']] }}
      extra={<section className="fg-sec fg-cream" aria-labelledby="tarieven" id="rekenhulp"><div className="wrap lp-split lp-split-top">
        <div>
          <p className="fg-eyebrow">Ter vergelijking</p>
          <h2 id="tarieven" className="fg-h2">{`Maximumtarieven ${T.jaar} op de meter`}</h2>
          <p className="fg-lead">Voor taxi's die je op straat aanhoudt of bij een standplaats instapt, stelt de Rijksoverheid maximumtarieven vast. Spreek je vooraf een prijs af, dan geldt die afgesproken prijs.</p>
          <div className="table-wrap lp-table"><table>
            <thead><tr><th>Soort taxi</th><th>Start</th><th>Per km</th><th>Per minuut</th></tr></thead>
            <tbody>{(['personenauto', 'busje'] as const).map(k => <tr key={k}><td>{T[k].label}</td><td>{eur(T[k].start)}</td><td>{eur(T[k].km)}</td><td>{eur(T[k].min)}</td></tr>)}</tbody>
          </table></div>
          <p className="small muted">Bron: Rijksoverheid, Regeling maximumtarief en bekendmaking tarieven taxivervoer. Inclusief btw; taxibedrijven mogen lager zitten.</p>
        </div>
        <div className="lp-calc">
          <h3>Maximumprijs op de meter berekenen</h3>
          <form method="get" action="/wat-kost-een-taxi#rekenhulp" className="calc" data-tariffs={JSON.stringify(MAX_TARIFFS)}>
            <div className="row row-3">
              <div className="field"><label htmlFor="f-km">Afstand (km)</label><input id="f-km" name="km" type="number" inputMode="decimal" min="0.5" max="1000" step="0.1" defaultValue={c ? String(c.km) : '20'} required /></div>
              <div className="field"><label htmlFor="f-min">Rijtijd (min)</label><input id="f-min" name="min" type="number" inputMode="numeric" min="1" max="900" step="1" defaultValue={c ? String(c.min) : '25'} required /></div>
              <div className="field"><label htmlFor="f-soort">Soort taxi</label><select id="f-soort" name="soort" defaultValue={c?.kind || 'personenauto'}>
                <option value="personenauto">Personenauto (1–4)</option><option value="busje">Busje (5–8)</option></select></div>
            </div>
            <button className="btn btn-primary" type="submit">Bereken maximumprijs</button>
          </form>
          <div id="calc-live" role="status" aria-live="polite" />
          {c && <div className="calc-result">
            <p className="small muted" style={{ margin: 0 }}>{`Maximumprijs op de meter, ${c.km} km en ${c.min} minuten, ${c.kind === 'busje' ? 'busje' : 'personenauto'}:`}</p>
            <p className="calc-price">{eur(c.price)}</p>
            <p className="small" style={{ margin: 0 }}>{`${eur(T[c.kind].start)} start + ${c.km} × ${eur(T[c.kind].km)} + ${c.min} × ${eur(T[c.kind].min)}.`}</p>
          </div>}
        </div>
      </div></section>}
      faq={[
        ['Is er één vaste taxiprijs?', 'Nee. De route, het moment, het voertuig en je wensen verschillen per reis. Vraag een voorstel voor jouw rit aan.'],
        ['Hoe weet ik of extra kosten zijn inbegrepen?', 'Lees het voorstel en vraag de aanbieder om uitleg over wachten, bagage, tussenstops en andere extra’s.'],
        ['Wanneer kan ik een rit aanvragen?', `Vraag minimaal ${minLeadHours} uur voor vertrek aan. Je boekt pas nadat je een passend voorstel hebt gekozen.`]]}
      cta={{ title: 'Benieuwd naar jouw ritprijs?', text: 'Vraag voorstellen aan voor jouw route. Vergelijk de totaalprijs en kies zelf.', foto: 'onderwerp-kost-cta', alt: 'Taxi wacht in de avond bij een station (illustratief)', note: note(minLeadHours) }} />
  );
}

// ───────── Taxibus ─────────
export function MinibusPage({ ctx, minLeadHours }: { ctx: Ctx; minLeadHours: number; maxPax?: number; maxBags?: number }) {
  return (
    <TopicPage ctx={ctx} crumbs={crumb('/taxibus', 'Taxibus met chauffeur')} title="Taxibus met chauffeur: vervoer voor je groep vooraf geregeld"
      description="Taxibus met chauffeur nodig voor familie, vrienden of collega's? Geef personen en bagage door en vergelijk voorstellen van gecontroleerde taxibedrijven."
      hero={{ label: 'Samen op weg', h1: 'Taxibus met chauffeur', belofte: 'Eén vertrek. Samen onderweg.', intro: 'Met vrienden, familie of collega’s op pad? Vraag vervoer aan dat aansluit op je gezelschap, koffers en planning.', foto: 'onderwerp-taxibus-hero', alt: 'Groep reizigers met koffers bij een taxibus (illustratief)' }}
      form={<QuickRequestForm minLeadHours={minLeadHours} hidden={{ vehicle_category: 'taxibus' }} />} formNote="Geef het aantal personen en bagage door. Het taxibedrijf bevestigt welk voertuig past."
      deep={<Deep label="Ruimte voor jullie reis" title="Een taxibus die bij je groep past.">
        <div className="lp-deep-grid">
          <ol className="lp-numlist">{([
            ['Je gezelschap', 'Geef het aantal personen en bagage door. Vermeld ook kinderen en bijzondere wensen.'],
            ['Jullie bagage', 'Hoeveel koffers, tassen of grotere spullen gaan mee? Dat helpt bij de voertuigkeuze.'],
            ['Samen vertrekken', 'Kies een duidelijk ophaaladres en spreek af of er extra stops nodig zijn.']] as const).map(([t, d], i) =>
            <li key={t}><span className="zg-num">{String(i + 1).padStart(2, '0')}</span><div><h3>{t}</h3><p>{d}</p></div></li>)}</ol>
          <div><Figure k="onderwerp-taxibus-extra" alt="Kofferbak van een taxibus vol koffers (illustratief)" />
            <Note title="Niet iedere bus is hetzelfde." text="De beschikbare ruimte en indeling verschillen per aanbieder. Laat vóór het boeken bevestigen dat personen én bagage mee kunnen." /></div>
        </div>
      </Deep>}
      steps={{ label: 'Van aanvraag tot vertrek', title: 'Met de hele groep, in drie stappen.', items: [
        ['Geef jullie reis door', 'Vermeld route, aantal personen en alle bagage.'], ['Stem het voertuig af', 'Vraag de aanbieder of er voldoende plek is voor iedereen en alles.'], ['Kies en bevestig', 'Controleer de ophaalafspraken en boek het passende voorstel.']] }}
      faq={[
        ['Hoeveel personen passen in een taxibus?', 'Dat hangt af van het voertuig en de bagage. Geef jullie aantallen door; de aanbieder bevestigt welke oplossing past.'],
        ['Kunnen we op verschillende adressen instappen?', 'Vermeld alle gewenste ophaalpunten bij de aanvraag en laat extra stops meenemen in het voorstel.'],
        ['Kan er een kinderzitje mee?', 'Geef de leeftijd van ieder kind en het aantal zitjes door. Controleer type en beschikbaarheid vooraf bij de aanbieder.']]}
      cta={{ title: 'Jullie plannen. Jullie taxibus.', text: 'Geef het aantal personen en bagage door en vergelijk vervoer voor jullie groep.', foto: 'onderwerp-taxibus-cta', alt: 'Taxibus op een landweg langs een boerderij (illustratief)', note: note(minLeadHours) }} />
  );
}

// ───────── Taxi reserveren ─────────
export function ReservePage({ ctx, minLeadHours }: { ctx: Ctx; minLeadHours: number }) {
  return (
    <TopicPage ctx={ctx} crumbs={crumb('/taxi-reserveren', 'Taxi reserveren')} title="Taxi reserveren: vooruit plannen en zelf kiezen"
      description={`Taxi reserveren? Vraag je rit minimaal ${minLeadHours} uur vooraf aan, vergelijk de voorstellen van gecontroleerde taxibedrijven en kies zelf met wie je reist.`}
      hero={{ label: 'Vooruit plannen', h1: 'Taxi reserveren', belofte: 'Regel je rit. Laat je dag beginnen.', intro: `Vraag je taxi minimaal ${minLeadHours} uur vooraf aan. Vergelijk de voorstellen en kies zelf met welk taxibedrijf je reist.`, foto: 'onderwerp-reserveren-hero', alt: 'Reiziger met koffer wacht voor de deur op een taxi (illustratief)' }}
      form={<QuickRequestForm minLeadHours={minLeadHours} />} formNote="Aanvragen is nog geen reservering. Je kiest eerst een voorstel en controleert de bevestiging."
      deep={<Deep label="Voor je aanvraag" title="Een goede reservering begint met de details.">
        <ul className="lp-cards lp-cards-white">{([
          ['01 / Route', 'Van deur tot bestemming', 'Noteer het volledige vertrekadres, de bestemming en eventuele tussenstops.'],
          ['02 / Planning', 'Datum en vertrektijd', `Vraag minimaal ${minLeadHours} uur vooraf aan. Plan zelf voldoende tijd voor je afspraak of vlucht.`],
          ['03 / Reisgezelschap', 'Wie en wat gaat mee?', 'Vul personen en bagage in. Vermeld een kinderzitje of andere wensen meteen.']] as const).map(([l, t, d]) =>
          <li key={l}><p className="lp-card-label">{l}</p><h3>{t}</h3><p>{d}</p></li>)}</ul>
        <Note title="Een aanvraag is nog geen geboekte rit." text="Vergelijk eerst de voorstellen. Kies daarna een aanbieder en controleer de reserveringsbevestiging en ophaalafspraken." />
      </Deep>}
      steps={{ label: 'Van aanvraag tot vertrek', title: 'Taxi reserveren in drie stappen.', items: [
        ['Vraag aan', `Deel je reisgegevens minimaal ${minLeadHours} uur voor vertrek. Aanvragen is gratis en vrijblijvend.`], ['Vergelijk', 'Bekijk de totaalvoorstellen, het voertuig en de voorwaarden van de aanbieders.'], ['Kies', 'Kies een voorstel en controleer je bevestiging. Stem de laatste details af met het taxibedrijf.']] }}
      faq={[
        ['Kan ik voor vandaag reserveren?', `De aanvraag is bedoeld voor ritten minimaal ${minLeadHours} uur vooruit. Voor een directe rit is deze aanvraag niet geschikt.`],
        ['Wanneer is mijn taxi gereserveerd?', 'Een aanvraag alleen is geen reservering. Kies een voorstel en controleer de bevestiging en ophaalafspraken.'],
        ['Kan ik mijn reservering wijzigen?', 'Neem contact op met de gekozen aanbieder. De mogelijkheden en eventuele kosten staan in de voorwaarden.']]}
      cta={{ title: 'Een goed begin van je reis.', text: 'Plan vooruit, vergelijk de voorstellen en kies de taxi die past bij jouw dag.', foto: 'onderwerp-reserveren-cta', alt: 'Reiziger zet een tas in de kofferbak van een taxi (illustratief)', note: note(minLeadHours) }} />
  );
}

// ───────── Goedkope taxi ─────────
export function CheapPage({ ctx, minLeadHours }: { ctx: Ctx; minLeadHours: number }) {
  return (
    <TopicPage ctx={ctx} crumbs={crumb('/goedkope-taxi', 'Goedkope taxi')} title="Goedkope taxi: vergelijk de totale kosten, niet alleen het bedrag"
      description="Op zoek naar een betaalbare taxi? Vergelijk de totaalprijs, wat is inbegrepen en de voorwaarden van gecontroleerde taxibedrijven, en kies zelf."
      hero={{ label: 'Bewust vergelijken', h1: 'Goedkope taxi', belofte: 'Goed kiezen begint met vergelijken.', intro: 'Zoek je een betaalbare rit? Kijk verder dan het eerste bedrag en vergelijk de totale kosten, voorwaarden en wat bij je reis past.', foto: 'onderwerp-goedkoop-hero', alt: 'Twee reizigers vergelijken op de telefoon hun rit (illustratief)' }}
      form={<QuickRequestForm minLeadHours={minLeadHours} />} formNote="Geen belofte van de laagste prijs. Wel ruimte om voorstellen rustig te vergelijken."
      deep={<Deep label="Kijk naar het hele voorstel" title="Een lage prijs zegt niet alles.">
        <div className="lp-deep-grid">
          <ol className="lp-numlist">{([
            ['Totaalprijs', 'Wat betaal je voor de volledige rit? Kijk niet alleen naar een start- of kilometerbedrag.'],
            ['Wat is inbegrepen?', 'Controleer bagage, wachttijd, tussenstops en eventuele extra voorzieningen.'],
            ['Voorwaarden', 'Lees hoe wijzigen en annuleren werkt en stem het ophaalmoment af.']] as const).map(([t, d], i) =>
            <li key={t}><span className="zg-num">{String(i + 1).padStart(2, '0')}</span><div><h3>{t}</h3><p>{d}</p></div></li>)}</ol>
          <Note title="Maak voorstellen echt vergelijkbaar." text="Geef elke aanbieder dezelfde route, vertrektijd en wensen. Zo vergelijk je dezelfde reis, niet alleen verschillende bedragen." />
        </div>
      </Deep>}
      steps={{ label: 'Van aanvraag tot vertrek', title: 'Zo vergelijk je op waarde.', items: [
        ['Dezelfde reisgegevens', 'Vul je volledige route en alle wensen in.'], ['Hetzelfde totaalbeeld', 'Leg inbegrepen diensten en voorwaarden naast elkaar.'], ['Jouw afweging', 'Kies de verhouding tussen prijs, vervoer en afspraken die bij je past.']] }}
      faq={[
        ['Is de goedkoopste taxi altijd de beste keuze?', 'Niet per se. Kijk ook naar het passende voertuig, inbegrepen extra’s en de voorwaarden die voor jou belangrijk zijn.'],
        ['Garanderen jullie de laagste prijs?', 'Nee. Je vergelijkt voorstellen van aanbieders en bepaalt zelf welk aanbod bij jouw reis en budget past.'],
        ['Hoe voorkom ik onduidelijkheid over kosten?', 'Beschrijf je rit volledig en vraag om bevestiging van de totaalprijs en alle extra wensen vóór je kiest.']]}
      extra={<LinkBand title="Taxi per stad" links={[['rotterdam', 'Rotterdam'], ['den-haag', 'Den Haag'], ['utrecht', 'Utrecht'], ['amsterdam', 'Amsterdam'], ['eindhoven', 'Eindhoven'], ['groningen', 'Groningen']].map(([s, n]) => [`/taxi/${s}`, `Taxi ${n}`])} more={<a href="/taxi">Alle steden</a>} />}
      cta={{ title: 'Betaalbaar begint met overzicht.', text: `Vraag minimaal ${minLeadHours} uur vooraf aan en vergelijk wat je voor de totaalprijs krijgt.`, foto: 'onderwerp-goedkoop-cta', alt: 'Taxi in een dorpsstraat met fietsers (illustratief)', note: note(minLeadHours) }} />
  );
}

// ───────── Taxi met kinderzitje ─────────
export function ChildSeatPage({ ctx, minLeadHours }: { ctx: Ctx; minLeadHours: number }) {
  return (
    <TopicPage ctx={ctx} crumbs={crumb('/taxi-met-kinderzitje', 'Taxi met kinderzitje')} title="Taxi met kinderzitje: vooraf afstemmen wat je kind nodig heeft"
      description="Taxi met kinderzitje nodig? Vermeld de leeftijd per kind en het aantal zitjes bij je aanvraag en laat type en beschikbaarheid bevestigen vóór je boekt."
      hero={{ label: 'Met het gezin op reis', h1: 'Taxi met kinderzitje', belofte: 'Een kleine reiziger. Goed voorbereid.', intro: 'Reis je met kinderen? Vermeld de leeftijd en het aantal benodigde zitjes bij je aanvraag. Bespreek je wensen vooraf met het taxibedrijf.', foto: 'onderwerp-kinderzitje-hero', alt: 'Kinderzitje op de achterbank van een taxi (illustratief)' }}
      form={<QuickRequestForm minLeadHours={minLeadHours} />} formNote="Vermeld: leeftijd per kind + aantal zitjes. Controleer type en beschikbaarheid bij de aanbieder vóór je boekt."
      deep={<Deep label="Zitjes zijn maatwerk" title="Wat heeft jouw kind nodig?">
        <div className="lp-deep-grid">
          <Figure k="onderwerp-kinderzitje-extra" alt="Kinderzitje vastgezet op de achterbank (illustratief)" />
          <div>
            <h3 className="lp-deep-h3">Stem het vooraf af, niet bij vertrek.</h3>
            <div className="lp-check"><h4>Zet dit bij je aanvraag</h4><ul>
              {['Leeftijd van ieder kind', 'Aantal benodigde kinderzitjes', 'Totaal aantal reizigers en koffers', 'Eventueel: een eigen zitje meenemen'].map(x => <li key={x}>{x}</li>)}
            </ul></div>
            <p className="lp-text">Vraag de aanbieder welk type zitje beschikbaar is en of het bij jouw kind past. Beschikbaarheid is niet vanzelfsprekend: laat dit vóór het boeken bevestigen.</p>
          </div>
        </div>
      </Deep>}
      steps={{ label: 'Van aanvraag tot vertrek', title: 'Voorbereid met je gezin op weg.', items: [
        ['Vertel wat nodig is', 'Vermeld leeftijd per kind en het aantal benodigde zitjes.'], ['Controleer het voorstel', 'Vraag welk type zitje beschikbaar is en bespreek je wensen met de aanbieder.'], ['Bevestig de afspraken', 'Boek pas als voertuig, zitjes en ophaalmoment zijn afgestemd.']] }}
      faq={[
        ['Is een kinderzitje altijd beschikbaar?', 'Nee. Dit verschilt per aanbieder en rit. Laat type, aantal en beschikbaarheid vóór het boeken bevestigen.'],
        ['Welke informatie geef ik door?', 'Vermeld de leeftijd van ieder kind, het aantal zitjes en alle reizigers en bagage. Bespreek zo nodig aanvullende gegevens met de aanbieder.'],
        ['Mag ik mijn eigen kinderzitje meenemen?', 'Stem dit vooraf af met het taxibedrijf. Bespreek ook het plaatsen van het zitje en de beschikbare ruimte.']]}
      cta={{ title: 'Kleine reiziger, heldere afspraken.', text: 'Deel je wensen op tijd. Controleer de beschikbaarheid van zitjes vóór je boekt.', foto: 'onderwerp-kinderzitje-cta', alt: 'Gezin met kind stapt in een taxi (illustratief)', note: note(minLeadHours) }} />
  );
}

export const TOPIC_PAGES: [string, string][] = [
  ['/wat-kost-een-taxi', 'Wat kost een taxi?'], ['/taxibus', 'Taxibus met chauffeur'], ['/taxi-reserveren', 'Taxi reserveren'],
  ['/goedkope-taxi', 'Goedkope taxi'], ['/taxi-met-kinderzitje', 'Taxi met kinderzitje'],
];
