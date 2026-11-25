import { GuaranteeBlock, SupportContacts } from '../support.tsx';
import { GUARANTEE_TEXT, GUARANTEE_TITLE } from '../../lib/support.ts';
import type { Ctx } from '../../lib/http.ts';
import { Page, Field, Select, Csrf, Notice, ConceptLabel, TextArea, TimeSelect } from '../layout.tsx';
import { toLocalInput, hours } from '../../lib/time.ts';
import { AIRPORTS } from '../../lib/airports.ts';
import { CITIES, AIRPORT_PAGES } from '../../lib/cities.ts';
import type { ReactNode } from 'react';
import { InfoPage, type QA } from './landing.tsx';

const paxOptions: [string, string][] = Array.from({ length: 8 }, (_, i) => [String(i + 1), `${i + 1} ${i ? 'personen' : 'persoon'}`]);

/** Snel aanvraagformulier (ontwerp Figma "Rit aanvragen"). Stuurt door naar het volledige formulier. */
const ICON = (n: string, w = 20) => <img className="qf-icon" src={`/static/img/icons/${n}.svg`} alt="" width={w} height={w} />;
const TIMES = Array.from({ length: 288 }, (_, i) => `${String(Math.floor(i / 12)).padStart(2, '0')}:${String((i % 12) * 5).padStart(2, '0')}`);
export function QuickRequestForm({ minLeadHours, title = 'Waar gaat jouw reis naartoe?', subtitle = 'Je volgende rit begint hier.', pickupPlaceholder = 'Straat 1, 1234 AB Plaats', dropoff, dropoffPlaceholder = 'Luchthaven, adres of plaats', pickup, hidden = {} }:
  { minLeadHours: number; title?: string; subtitle?: string; pickupPlaceholder?: string; dropoff?: string; dropoffPlaceholder?: string; pickup?: string; hidden?: Record<string, string> }) {
  const earliest = toLocalInput(new Date(Date.now() + hours(minLeadHours) + hours(1)));
  return (
    <form className="card quick-form" method="get" action="/rit-aanvragen/gegevens" aria-labelledby="snel-titel">
      <h2 id="snel-titel">{title}</h2>
      <p className="qf-sub">{subtitle}</p>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className="segmented qf-trip" role="radiogroup" aria-label="Soort reis">
        <label><input type="radio" name="trip_type" value="enkel" defaultChecked /> Enkele reis</label>
        <label><input type="radio" name="trip_type" value="retour" /> Retour</label>
      </div>
      <div className="field"><label htmlFor="qf-pickup">Vertrekadres</label>
        <div className="qf-input">{ICON('adres')}<input id="qf-pickup" name="pickup_street" placeholder={pickupPlaceholder} defaultValue={pickup} autoComplete="street-address" required /></div></div>
      <details className="qf-stop">
        <summary>{ICON('tussenstop-plus', 22)}<span>Tussenstop toevoegen</span></summary>
        <div className="field"><label htmlFor="qf-stop">Tussenstop <span className="optional">(optioneel)</span></label>
          <div className="qf-input">{ICON('tussenstop')}<input id="qf-stop" name="stop_street" placeholder="Straat 1, 1234 AB Plaats" /></div></div>
      </details>
      <div className="field"><label htmlFor="qf-dropoff">Bestemming</label>
        <div className="qf-input">{ICON('pin')}<input id="qf-dropoff" name="dropoff_street" placeholder={dropoffPlaceholder} defaultValue={dropoff} required /></div></div>
      <div className="qf-row">
        <div className="field qf-date"><label htmlFor="qf-date">Datum</label>
          <div className="qf-input">{ICON('datum')}<input id="qf-date" name="date" type="date" data-date-picker="Kies je vertrekdatum." min={earliest.date} defaultValue={earliest.date} required /></div></div>
        <div className="field qf-time"><label htmlFor="qf-time">Tijd</label>
          <div className="qf-input qf-select"><select id="qf-time" name="time" defaultValue="09:00" data-time-picker="Vertrektijd kiezen">{TIMES.map(t => <option key={t} value={t}>{t}</option>)}</select></div></div>
        <div className="field qf-pax"><label htmlFor="qf-pax">Personen</label>
          <div className="qf-input qf-select">{ICON('personen')}<select id="qf-pax" name="passengers" defaultValue="2" aria-label="Aantal personen">{Array.from({ length: 8 }, (_, i) => <option key={i} value={String(i + 1)}>{String(i + 1)}</option>)}</select></div></div>
      </div>
      <div className="qf-row qf-return" id="qf-return">
        <div className="field qf-date"><label htmlFor="qf-rdate">Datum terugreis</label>
          <div className="qf-input">{ICON('datum')}<input id="qf-rdate" name="return_date" type="date" data-date-picker="Kies je retourdatum." min={earliest.date} /></div></div>
        <div className="field qf-time"><label htmlFor="qf-rtime">Tijd terug</label>
          <div className="qf-input qf-select"><select id="qf-rtime" name="return_time" defaultValue="" data-time-picker="Retourtijd kiezen"><option value="">--:--</option>{TIMES.map(t => <option key={t} value={t}>{t}</option>)}</select></div></div>
      </div>
      <button className="btn btn-primary btn-block qf-submit" type="submit"><span>Vergelijk prijsvoorstellen</span>{ICON('verder')}</button>
      <p className="qf-note">{`Gratis & vrijblijvend · Minimaal ${minLeadHours} uur vooraf`}</p>
      <p className="qf-privacy">{ICON('slot', 16)}Je boekt pas als je een voorstel kiest.</p>
    </form>
  );
}

/** Groene balk met de vier voordelen (homepage en alle landingspagina's). */
export const UspBar = () => (
  <section className="usp-bar" aria-label="Voordelen van PickMyRide"><div className="wrap"><ul>
    {([['nooit-te-veel', 'Vergelijk voorstellen', 'Kies zelf jouw rit'], ['vaste-prijs', 'Vooraf één vaste prijs', 'Weet waar je aan toe bent'],
      ['gecontroleerd', 'Gecontroleerde bedrijven', 'Ga met een gerust gevoel op weg'], ['gratis', 'Gratis & vrijblijvend', 'Jij kiest of je boekt']] as const).map(([i, t, d]) =>
      <li key={i}><span className="usp-icon"><img src={`/static/img/icons/${i}.svg`} alt="" width={24} height={24} /></span><span><strong>{t}</strong><span>{d}</span></span></li>)}
  </ul></div></section>
);

/** Foto uit het Figma-ontwerp, in twee formaten (640 en 1200 px breed). */
const FOTO = ({ n, alt, w, h, sizes }: { n: string; alt: string; w: number; h: number; sizes: string }) =>
  <img className="foto" src={`/static/img/foto/${n}.webp`} srcSet={`/static/img/foto/${n}-640.webp 640w, /static/img/foto/${n}.webp 1200w`} sizes={sizes} alt={alt} width={w} height={h} loading="lazy" decoding="async" />;

export function HomePage({ ctx, minLeadHours }: { ctx: Ctx; minLeadHours: number }) {
  const faq: [string, string][] = [
    ['Hoe werkt PickMyRide?', 'Vul je rit in, ontvang prijsvoorstellen en kies zelf een taxibedrijf. Je boekt pas als je een voorstel kiest.'],
    ['Is mijn aanvraag gratis?', 'Ja. Een rit aanvragen en de voorstellen vergelijken kost niets en verplicht je tot niets. Je betaalt pas als je zelf een voorstel kiest en boekt.'],
    ['Hoe ver vooraf vraag ik een rit aan?', `Minimaal ${minLeadHours} uur voor vertrek. Zo hebben taxibedrijven tijd om een voorstel te doen en kun jij rustig vergelijken.`],
    ['Wie kan een prijsvoorstel doen?', 'Alleen taxibedrijven die wij hebben gecontroleerd en toegelaten, en alleen voor ritten binnen hun eigen werkgebied. Bedrijven zien elkaars bedragen niet.'],
    ['Zijn mijn contactgegevens zichtbaar?', 'Nee. Vóór de boeking ziet een taxibedrijf geen naam of adres, alleen de plaats en de eerste cijfers van de postcode. Na de boeking krijgt het gekozen bedrijf je naam en het ophaaladres. Je telefoonnummer en e-mailadres blijven afgeschermd: contact loopt via de app.'],
  ];
  return (
    <Page ctx={ctx} title="Taxi vergelijken en vooraf boeken voor een vaste prijs" description="Vergelijk taxibedrijven en boek je taxi naar Schiphol, een andere luchthaven of voor een lange rit door Nederland. Ontvang prijsvoorstellen en kies zelf."
      hero={
        <section className="hero">
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <p className="hero-chip">Vooraf geboekt. Goed geregeld.</p>
              <h1><span className="h1-line">Jouw rit.</span><br /><span className="h1-line">Jouw keuze.</span><br /><span className="h1-line h1-accent">Eén vaste prijs.</span></h1>
              <p className="lead">Vergelijk gecontroleerde taxibedrijven en kies de rit die bij je past.</p>
              <ul className="hero-checks">
                <li>{ICON('vinkje', 19)}Totaalprijs vooraf</li>
                <li>{ICON('vinkje', 19)}Gecontroleerde bedrijven</li>
              </ul>
              <div className="route-card" aria-hidden="true">
                <div className="route-line">{ICON('vertrekpunt', 23)}<span className="rl-line" /><span className="rl-arrow">{ICON('rijrichting', 24)}</span><span className="rl-line" />{ICON('bestemming', 24)}</div>
                <div className="route-labels"><span>Jouw vertrek</span><span>Jouw bestemming</span></div>
              </div>
              <p className="hero-caption">Luchthaven of lange afstand. Overal in Nederland.</p>
            </div>
            <QuickRequestForm minLeadHours={minLeadHours} />
            <ul className="usp-mini" aria-label="Voordelen">
              <li><img src="/static/img/icons/vaste-prijs.svg" alt="" width={18} height={18} />Vaste prijs</li>
              <li><img src="/static/img/icons/gecontroleerd.svg" alt="" width={18} height={18} />Gecontroleerd</li>
              <li><img src="/static/img/icons/gratis.svg" alt="" width={18} height={18} />Gratis aanvraag</li>
            </ul>
          </div>
        </section>
      }
      band={<>
        <UspBar />
        <section className="fg-sec fg-white" aria-labelledby="stappen"><div className="wrap zo-geregeld">
          <div><h2 id="stappen">Zo geregeld.</h2><p className="muted">Van aanvraag naar een fijne rit.</p></div>
          <ol className="zg-steps">
            <li><span className="zg-num">01</span><h3>Vertel ons je route</h3><p>Vul je vertrek, bestemming en reistijd in.</p></li>
            <li><span className="zg-num">02</span><h3>Vergelijk de voorstellen</h3><p>Kies het taxibedrijf en de prijs die passen.</p></li>
            <li><span className="zg-num">03</span><h3>Boek en reis ontspannen</h3><p>Je weet vooraf precies wat je betaalt.</p></li>
          </ol>
        </div></section>

        <section className="fg-sec fg-cream" aria-labelledby="bestemmingen"><div className="wrap">
          <p className="fg-eyebrow">Voor elke bestemming</p>
          <h2 id="bestemmingen" className="fg-h2">Waar je ook naartoe gaat.</h2>
          <p className="fg-lead">Vooraf geboekte ritten, overal in Nederland.</p>
          <ul className="fg-dest">
            {([['luchthaven', 'Naar de luchthaven', 'Begin je reis ontspannen, vanaf je voordeur.', '/luchthavens', 'Taxi wacht bij de vertrekhal van een luchthaven'],
              ['stad', 'Naar de stad', 'Een afspraak, een avond uit of een weekend weg.', '/taxi', 'Taxi aan een Nederlandse gracht'],
              ['lange-rit', 'Een langere rit', 'Meer kilometers, dezelfde duidelijkheid vooraf.', '/rit-aanvragen', 'Taxi op een polderweg']] as const).map(([n, t, d, h, alt]) =>
              <li key={n}><FOTO n={n} alt={alt} w={1200} h={896} sizes="(min-width: 980px) 405px, 100vw" /><h3>{t}</h3><p>{d}</p><a href={h}>Plan je rit →</a></li>)}
          </ul>
        </div></section>

        <section className="fg-sec fg-white" aria-labelledby="begin"><div className="wrap fg-split">
          <FOTO n="onderweg" alt="Passagier op de achterbank kijkt naar het polderlandschap" w={1152} h={928} sizes="(min-width: 980px) 600px, 100vw" />
          <div className="fg-split-copy">
            <p className="fg-eyebrow">Wel zo eenvoudig</p>
            <h2 id="begin" className="fg-h2">Een goed begin<br />van je reis.</h2>
            <p className="fg-lead">Jij kiest de bestemming. Wij maken vergelijken overzichtelijk.</p>
            <ol className="fg-points">
              <li><span>01</span><div><h3>Je weet waar je aan toe bent</h3><p>Vergelijk de totaalprijs vóór je boekt.</p></div></li>
              <li><span>02</span><div><h3>Zelf kiezen voelt beter</h3><p>Kies uit gecontroleerde taxibedrijven.</p></div></li>
              <li><span>03</span><div><h3>Je gegevens blijven privé</h3><p>Contact loopt via de app.</p></div></li>
              {ctx.support?.visible && ctx.support.guarantee && <li><span>04</span><div><h3>{GUARANTEE_TITLE}</h3><p>{`Onze klantenservice is ${ctx.support.hours} bereikbaar en regelt direct een vervanger.`}</p></div></li>}
            </ol>
          </div>
        </div></section>

        <section className="fg-sec fg-cream fg-partner-sec" aria-labelledby="bedrijven"><div className="wrap">
          <div className="fg-partner">
            <div className="fg-partner-copy">
              <p className="fg-eyebrow">Voor taxibedrijven</p>
              <h2 id="bedrijven" className="fg-h2">Meer ritten.<br />Op jouw voorwaarden.</h2>
              <p className="fg-lead">Ontvang aanvragen voor geplande ritten en doe een prijsvoorstel dat bij jouw bedrijf past.</p>
              <p className="fg-small">Geplande ritten · Je eigen prijsvoorstel</p>
              <a className="fg-btn-light" href="/voor-taxibedrijven">Ontdek de mogelijkheden →</a>
            </div>
            <FOTO n="chauffeur" alt="Taxichauffeur met koffer naast zijn taxi" w={1152} h={928} sizes="(min-width: 980px) 504px, 100vw" />
          </div>
        </div></section>

        <section className="fg-sec fg-white" aria-labelledby="vragen"><div className="wrap fg-faq">
          <div>
            <p className="fg-eyebrow">Veelgestelde vragen</p>
            <h2 id="vragen" className="fg-h2">Even weten<br />voor je vertrekt.</h2>
            <p className="fg-lead fg-lead-sm">De belangrijkste antwoorden op een rij.</p>
            <p className="fg-more"><a href="/veelgestelde-vragen">Alle vragen en antwoorden</a></p>
          </div>
          <div className="fg-faq-list">{faq.map(([q, a], i) => <details key={q} open={i === 0}><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div></section>

        <section className="fg-sec fg-sage" aria-labelledby="vertrek"><div className="wrap fg-cta">
          <div>
            <p className="fg-eyebrow">Jouw volgende rit</p>
            <h2 id="vertrek" className="fg-h2 fg-h2-lg">Klaar voor vertrek?</h2>
            <p className="fg-lead">Vergelijk je mogelijkheden.<br />Kies de rit die bij je past.</p>
            <a className="fg-btn" href="/rit-aanvragen">Vraag je rit aan →</a>
            <p className="fg-note">{`Gratis & vrijblijvend · Minimaal ${minLeadHours} uur vooraf`}</p>
          </div>
          <FOTO n="lange-rit" alt="Taxi rijdt over een dijkweg in de ochtend" w={1200} h={896} sizes="(min-width: 980px) 592px, 100vw" />
        </div></section>
      </>}>
      {null as any}
    </Page>
  );
}

export function HowItWorksPage({ ctx }: { ctx: Ctx }) {
  return (
    <Page ctx={ctx} title="Hoe werkt het?" description="Zo werkt het aanvragen, vergelijken en boeken van een taxirit via PickMyRide." wide={false}>
      <h1>Hoe werkt het?</h1>
      <div className="stack">
        <section><h2>1. Je plaatst een ritaanvraag</h2><p>Je geeft je vertrekadres, bestemming, datum en tijd, het aantal personen en je bagage op. Bij een retourrit plan je de terugrit apart. Heen- en terugrit worden als twee afzonderlijke ritten behandeld en kunnen door verschillende taxibedrijven worden uitgevoerd.</p></section>
        <section><h2>2. Taxibedrijven doen een gesloten bod</h2><p>Alleen taxibedrijven die door de beheerder zijn beoordeeld en geactiveerd, kunnen bieden, en alleen op ritten binnen hun werkgebied en met een passend voertuig. Bedrijven zien elkaars bedragen niet. Vóór de boeking zien ze geen naam, e-mailadres of telefoonnummer van jou, en alleen de plaats en de eerste vier cijfers van de postcode.</p></section>
        <section><h2>3. Je vergelijkt en kiest</h2><p>Je ziet standaard de drie voordeligste aanbiedingen en kunt alle aanbiedingen openen. Op elk aanbod staat de totaalprijs. Vooraf bekende verplichte kosten moeten in die prijs zijn opgenomen.</p></section>
        <section><h2>4. Je betaalt en je rit is geboekt</h2><p>Na het kiezen reserveren we het aanbod even voor je, zodat je rustig kunt betalen. Je boeking is pas definitief als de betaalprovider de betaling heeft bevestigd. Je ontvangt dan een boekingsnummer per e-mail. Pas dan krijgt het gekozen taxibedrijf je naam en het exacte adres. Je telefoonnummer en e-mailadres blijven altijd afgeschermd: jullie chatten en bellen via PickMyRide.</p></section>
        <section><h2>5. Op de dag van de rit</h2><p>Het taxibedrijf wijst een chauffeur en voertuig toe. In je boeking zie je statussen die het bedrijf doorgeeft, zoals "onderweg" of "aangekomen". Dat zijn doorgegeven statussen, geen live GPS-tracking.</p></section>
        {ctx.support?.visible && <section><h2>6. Gaat er iets mis? Wij lossen het op</h2><p>{ctx.support.guarantee ? `${GUARANTEE_TEXT} ` : ''}Meld het in je boeking met één knop, of neem direct contact op met onze klantenservice. Die is ${ctx.support.hours} bereikbaar, telefonisch en via WhatsApp.</p><SupportContacts ctx={ctx} size="small" /></section>}
      </div>
      <p><a className="btn btn-primary" href="/rit-aanvragen">Rit aanvragen</a></p>
    </Page>
  );
}

export function ForCompaniesPage({ ctx, commissionText }: { ctx: Ctx; commissionText: string }) {
  return (
    <Page ctx={ctx} title="Voor taxibedrijven" description="Ontvang passende, vooraf geplande ritaanvragen binnen je werkgebied en bepaal zelf je prijs." wide={false}>
      <h1>Voor taxibedrijven</h1>
      <p>PickMyRide brengt klanten met een vooraf geplande rit in contact met aangesloten taxibedrijven. Je bepaalt zelf of en voor welke prijs je biedt.</p>
      <div className="grid grid-2">
        <div className="card"><h3>Passende aanvragen</h3><p className="muted">Je ziet alleen aanvragen binnen je ingestelde werkgebied en waarvoor je een geschikt voertuig hebt.</p></div>
        <div className="card"><h3>Gesloten biedingen</h3><p className="muted">Concurrenten zien jouw bedragen niet. Je hebt per rit maximaal één actief bod, dat je kunt aanpassen of intrekken tot de klant het kiest.</p></div>
        <div className="card"><h3>Transparante commissie</h3><p className="muted">Vóór het indienen zie je de klantprijs, de platformcommissie en je verwachte uitbetaling. Huidige regel: {commissionText}.</p></div>
        <div className="card"><h3>Betaald vooraf</h3><p className="muted">Een rit wordt pas aan jou toegewezen na een bevestigde betaling van de klant. Een ingediend bod is bindend gedurende de geldigheid.</p></div>
      </div>
      <h2 style={{ marginTop: '2rem' }}>Wat heb je nodig?</h2>
      <ul><li>Een inschrijving bij de KvK</li><li>Geldige vergunningen voor taxivervoer</li><li>Informatie over je voertuigen en capaciteit</li><li>Relevante documenten, zoals je KvK-uittreksel, vergunning en verzekering</li></ul>
      <p>Na aanmelding beoordeelt een beheerder je gegevens. Je kunt bieden zodra je bedrijf is geactiveerd.</p>
      <a className="btn btn-primary" href="/aanmelden-taxibedrijf">Meld je taxibedrijf aan</a>
    </Page>
  );
}

const FAQ: [string, string][] = [
  ['Is een aanvraag al een boeking?', 'Nee. Een aanvraag is vrijblijvend. Pas wanneer je een aanbod kiest en de betaalprovider je betaling heeft bevestigd, is je rit geboekt. Je ontvangt dan een boekingsnummer.'],
  ['Heb ik een account nodig?', 'Nee. Je kunt zonder account een aanvraag plaatsen. Je ontvangt een veilige link per e-mail waarmee je je aanvraag en de aanbiedingen bekijkt.'],
  ['Wie kunnen er bieden?', 'Alleen taxibedrijven die door de beheerder zijn beoordeeld en geactiveerd, en die in het werkgebied van je rit actief zijn met een passend voertuig.'],
  ['Zijn er nog extra kosten bovenop de prijs?', 'Taxibedrijven moeten vooraf bekende verplichte kosten in de totaalprijs opnemen. Wat precies is inbegrepen, zoals wachttijd en parkeerkosten, staat op elk aanbod. Wijzigingen na boeking, zoals een extra stop, kunnen een nieuw prijsvoorstel vereisen.'],
  ['Wat als mijn vlucht vertraagd is?', 'Elk aanbod vermeldt de inbegrepen wachttijd en wat het taxibedrijf doet bij vluchtvertraging. Vul je vluchtnummer in bij je aanvraag; het wordt na boeking gedeeld met de gekozen vervoerder.'],
  ['Kan ik bijzondere wensen opgeven?', 'Ja, zoals kinderzitjes of extra hulp. Het gekozen bedrijf moet de beschikbaarheid expliciet bevestigen. Niet elk voertuig is geschikt voor elke vervoersbehoefte.'],
  ['Kan ik ook een lange rit door Nederland boeken?', 'Ja. Je kunt elke rit tussen twee Nederlandse adressen aanvragen, ook over lange afstand. Taxibedrijven die door het hele land rijden of in je vertrek- of bestemmingsregio actief zijn, kunnen bieden. Ritten naar het buitenland zijn nog niet mogelijk.'],
  ['Van welke luchthavens kan ik vertrekken of aankomen?', 'Je kunt ritten aanvragen van en naar alle Nederlandse luchthavens, zoals Schiphol, Eindhoven, Rotterdam The Hague, Maastricht Aachen en Groningen Eelde. In het formulier kun je de luchthaven met één keuze invullen.'],
  ['Kunnen heen- en terugrit door verschillende bedrijven worden gereden?', 'Ja. Heen- en terugrit zijn afzonderlijke ritten met elk hun eigen aanbiedingen, boeking en betaling.'],
  ['Kan ik mijn rit volgen?', 'Je ziet statussen die het taxibedrijf doorgeeft, zoals "onderweg" en "aangekomen". Er is geen live GPS-tracking.'],
];
function faqFor(ctx: Ctx): [string, string][] {
  const s = ctx.support;
  if (!s?.configured) return FAQ;
  return [
    ...(s.guarantee ? [['Wat als mijn taxi niet komt opdagen?', `${GUARANTEE_TEXT} Meld het in je boeking met de knop "Melden en vervangend vervoer aanvragen", of bel of app onze klantenservice. Je betaalt voor het vervangende vervoer niets extra.`] as [string, string]] : []),
    ['Hoe bereik ik de klantenservice?', `Onze klantenservice is ${s.hours} bereikbaar${s.phone ? `, telefonisch via ${s.phone}` : ''}${s.whatsapp ? ` en via WhatsApp (${s.whatsapp})` : ''}. Houd je boekingsnummer bij de hand.`],
    ...FAQ,
  ];
}
export function FaqPage({ ctx }: { ctx: Ctx }) {
  return (
    <Page ctx={ctx} title="Veelgestelde vragen" description="Antwoorden op veelgestelde vragen over het aanvragen, vergelijken en boeken van taxiritten." wide={false}>
      <h1>Veelgestelde vragen</h1>
      <div className="faq">{faqFor(ctx).map(([q, a]) => <details key={q}><summary>{q}</summary><p style={{ marginTop: '.6rem' }}>{a}</p></details>)}</div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqFor(ctx).map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }) }} />
    </Page>
  );
}

export function ContactPage({ ctx, errors = {}, values = {}, sent }: { ctx: Ctx; errors?: Record<string, string>; values?: Record<string, string>; sent?: boolean }) {
  const subjects: [string, string][] = [['', 'Kies een onderwerp'], ['Aanvragen en vergelijken', 'Aanvragen en vergelijken'], ['Mijn account', 'Mijn account'], ['Voor taxibedrijven', 'Voor taxibedrijven'], ['Privacy', 'Privacy'], ['Algemene vraag', 'Algemene vraag']];
  return (
    <InfoPage ctx={ctx} title="Contact" description="Een vraag over PickMyRide? Kies het onderwerp dat bij je past. Voor contact over een bestaande rit gebruik je de app."
      crumbs={[['/contact', 'Contact']]}
      hero={{ label: 'Contact', lines: ['We helpen je', 'graag op weg.'], intro: 'Een vraag over PickMyRide? Kies het onderwerp dat bij je past. Voor contact over een bestaande rit gebruik je de app.',
        foto: 'info-contact-hero', alt: 'Reiziger op een bankje met telefoon, taxi op de achtergrond (illustratief)', caption: 'Persoonlijk geregeld, van aanvraag tot vertrek.' }}
      help={{ label: 'Goed om te weten', title: 'Snel naar het juiste onderwerp', items: [
        ['Aanvragen en vergelijken', 'Een aanvraag is gratis en vrijblijvend. Vraag je rit minimaal 24 uur vooraf aan; je boekt pas als je een voorstel kiest.'],
        ['Mijn bestaande rit', 'Gebruik de app voor contact over een geboekte rit. Je contactgegevens blijven afgeschermd.'],
        ['Wijzigen of annuleren', 'Bekijk eerst je boekingsstatus. Bij een geboekte rit zijn de geaccepteerde voorwaarden van de aanbieder het vertrekpunt.']],
        boxTitle: 'Vragen over je rit?', boxText: 'Ga naar je rit in de app voor de informatie die bij jouw aanvraag of boeking hoort.', action: 'Naar mijn rit in de app', href: '/mijn' }}>
      <div className="lp-form-grid">
        <div className="lp-form-card">
          <h2 className="lp-form-title">Waarmee kunnen we je helpen?</h2>
          <p className="muted">Stuur een algemene vraag. Deel hier geen gevoelige gegevens over een rit. Alle velden zijn verplicht.</p>
          <Notice type="warn"><p>De bedrijfsgegevens van de platformbeheerder (naam, adres, KvK, telefoon) zijn nog niet ingevuld. Vul ze in vóór livegang.</p></Notice>
          {sent ? <Notice type="ok"><p>Je bericht is ontvangen. We reageren per e-mail.</p></Notice> : (
            <form method="post" action="/contact" noValidate>
              <Csrf ctx={ctx} />
              <div className="row row-2">
                <Field name="name" label="Naam" value={values.name} error={errors.name} autoComplete="name" placeholder="Je voor- en achternaam" />
                <Field name="email" label="E-mailadres" type="email" value={values.email} error={errors.email} autoComplete="email" placeholder="Je e-mailadres" />
              </div>
              <Select name="subject" label="Onderwerp" value={values.subject || ''} error={errors.subject} options={subjects} />
              <TextArea name="body" label="Bericht" value={values.body} error={errors.body} maxLength={3000} hint="Een vraag over een bestaande rit? Gebruik de app, zodat je contact houdt bij de juiste rit. Deel geen betaalgegevens." />
              <button className="btn btn-primary" type="submit">Bericht versturen</button>
            </form>
          )}
        </div>
        <aside className="lp-aside">
          <h3>Gaat het over je rit?</h3>
          <p>Neem voor een bestaande rit contact op via de app. Zo blijft je communicatie gekoppeld aan de rit en blijven contactgegevens afgeschermd.</p>
          <h4>Alles op één plek</h4>
          <p>Open de app, ga naar je rit en bekijk de beschikbare contactmogelijkheden. Gebruik het algemene formulier niet om een rit te annuleren.</p>
          <p><a className="fg-btn" href="/mijn">Naar mijn rit in de app</a></p>
          <h4>Nog geen rit geboekt?</h4>
          <p>Een aanvraag is gratis en vrijblijvend. Je boekt pas als je een voorstel kiest. Vraag je rit minimaal 24 uur vooraf aan.</p>
          {ctx.support?.visible && <><h4>Klantenservice, dag en nacht</h4>
            <p>{`Voor vragen over een rit van vandaag of morgen: bel of app ons. We zijn ${ctx.support.hours} bereikbaar.`}</p><SupportContacts ctx={ctx} /></>}
        </aside>
      </div>
    </InfoPage>
  );
}

type Article = [string, ReactNode];
const PENDING = (t: string) => <p className="muted">{t}</p>;
const LEGAL: Record<'privacy' | 'voorwaarden' | 'annulering', Article[]> = {
  privacy: [
    ['Welke gegevens verwerken we?', <p>Bij een ritaanvraag: naam, e-mailadres, telefoonnummer, adressen, datum en tijd, aantal reizigers en bagage, eventueel vluchtnummer en opmerkingen. Voor taxibedrijven: bedrijfs- en contactgegevens, vergunningsgegevens en documenten.</p>],
    ['Met wie delen we gegevens?', <p>Vóór een boeking zien biedende taxibedrijven alleen gegevens die nodig zijn voor een prijsvoorstel: plaats, eerste vier cijfers van de postcode, tijdstip, reizigers, bagage en voertuigwens. Na een bevestigde boeking krijgt alleen het gekozen taxibedrijf je naam en exacte adressen. Je telefoonnummer en e-mailadres blijven afgeschermd. Betalingen verlopen via een betaalprovider; wij slaan geen kaartgegevens op.</p>],
    ['Chat en bellen', <p>Na een boeking kunnen jij en het taxibedrijf via PickMyRide chatten en bellen. Je telefoonnummer en e-mailadres worden niet met het taxibedrijf gedeeld; bellen loopt via een afgeschermd platformnummer en wordt niet opgenomen. PickMyRide kan berichten inzien bij vragen of klachten.</p>],
    ['Bewaartermijnen', PENDING('[Nog vast te stellen — juridisch en fiscaal te bepalen.]')],
    ['Je rechten', <p>Je kunt vragen om inzage, correctie of verwijdering van je gegevens via de contactpagina.</p>],
    ['Marketing', <p>We sturen alleen marketingberichten als je daar apart toestemming voor hebt gegeven. Die toestemming kun je altijd intrekken.</p>],
  ],
  voorwaarden: [
    ['Rol van het platform', PENDING('[Juridisch vast te stellen: treedt het platform op als bemiddelaar of als contractpartij voor de rit? Wie is de vervoerder in de zin van de wet? Wie is verantwoordelijk voor de facturatie?]')],
    ['Aanvraag en boeking', <p>Een aanvraag is gratis en vrijblijvend. Een boeking komt pas tot stand nadat de klant een aanbod heeft gekozen en de betaling door de betaalprovider is bevestigd.</p>],
    ['Prijzen', <p>Aanbiedingen worden als totaalprijs getoond. Vooraf bekende verplichte kosten zijn in die prijs opgenomen.</p>],
    ['Biedingen van taxibedrijven', <p>Een ingediend bod is bindend gedurende de opgegeven geldigheid.</p>],
    ['Aansprakelijkheid', PENDING('[Nog op te stellen door een jurist.]')],
  ],
  annulering: [
    ['Annuleren door de klant', <><p>Elk aanbod vermeldt de annuleringsvoorwaarden van het betreffende taxibedrijf. Die voorwaarden gelden voor de geboekte rit.</p>{PENDING('[Juridisch vast te stellen: standaardtermijnen, kosten bij late annulering, verhouding tot de voorwaarden van het taxibedrijf, herroepingsrecht voor vervoersdiensten.]')}</>],
    ['Annuleren door het taxibedrijf', <p>Als een taxibedrijf een bevestigde rit niet kan uitvoeren, probeert de beheerder een vervangende vervoerder te regelen. Lukt dat niet, dan volgt terugbetaling. Een eventueel prijsverschil wordt alleen met instemming van de klant verwerkt.</p>],
    ['Terugbetalingen', <p>Terugbetalingen lopen via de betaalprovider naar de oorspronkelijke betaalmethode.</p>],
  ],
};

export function LegalPage({ ctx, kind }: { ctx: Ctx; kind: 'privacy' | 'voorwaarden' | 'annulering' }) {
  const title = { privacy: 'Privacyverklaring', voorwaarden: 'Algemene voorwaarden', annulering: 'Annuleringsvoorwaarden' }[kind];
  const path = { privacy: '/privacyverklaring', voorwaarden: '/algemene-voorwaarden', annulering: '/annuleringsvoorwaarden' }[kind];
  const arts = LEGAL[kind];
  const hero = {
    privacy: { label: 'Privacy', lines: ['Jouw gegevens.', 'Helder uitgelegd.'] as [string, string], intro: 'Welke gegevens we gebruiken, met wie we ze delen en welke rechten je hebt.', foto: 'info-privacy-hero', alt: 'Reiziger met telefoon op de achterbank van een taxi (illustratief)', caption: 'Contactgegevens blijven afgeschermd via de app.' },
    voorwaarden: { label: 'Voorwaarden', lines: ['Duidelijke afspraken.', 'Prettig op weg.'] as [string, string], intro: 'Lees hoe aanvragen, voorstellen en boeken van elkaar verschillen.', foto: 'info-voorwaarden-hero', alt: 'Reiziger maakt aantekeningen in een café, taxi buiten (illustratief)', caption: 'Een gratis aanvraag is nog geen boeking.' },
    annulering: { label: 'Je plannen veranderen', lines: ['Een rit annuleren?', 'Begin bij je status.'] as [string, string], intro: 'Heb je alleen een aanvraag gedaan of al een voorstel geaccepteerd? Hieronder zie je waar je de juiste informatie vindt.', foto: 'info-annuleren-hero', alt: 'Reiziger met koffer en telefoon in een café (illustratief)', caption: 'Bekijk de afspraken bij jouw geboekte rit.' },
  }[kind];
  const help = {
    privacy: { label: 'Goed om te weten', title: 'Privacy begint bij duidelijkheid.', items: [['Contact via de app', 'Voor een bestaande rit houd je contact via de app. Contactgegevens blijven afgeschermd.'], ['Nog juridisch te controleren', 'Verantwoordelijke partij, grondslagen, bewaartermijnen en de route voor privacyverzoeken moeten vóór publicatie worden vastgesteld.']] as QA[], boxTitle: 'Een algemene vraag?', boxText: 'De contactpagina helpt je het juiste onderwerp te kiezen. Deel daar geen gevoelige ritgegevens.', action: 'Naar Contact', href: '/contact' },
    voorwaarden: { label: 'Goed om te weten', title: 'De kern, kort samengevat.', items: [['Gratis aanvragen is niet boeken', 'Je boekt pas als je een voorstel kiest. Plan je aanvraag minimaal 24 uur vóór vertrek.'], ['Afspraken per aanbieder', 'Controleer het gekozen voorstel en de geaccepteerde voorwaarden. Extra voorzieningen en beschikbaarheid zijn afhankelijk van de aanbieder.']] as QA[], boxTitle: 'Veranderen je plannen?', boxText: 'Op de pagina Annuleren zie je het verschil tussen een aanvraag en een geboekte rit.', action: 'Bekijk Annuleren', href: '/annuleringsvoorwaarden' },
    annulering: { label: 'Goed om te weten', title: 'Vragen over annuleren', items: [['Waar vind ik de afspraken voor mijn rit?', 'Bekijk je geboekte rit in de app en raadpleeg de voorwaarden die je bij de aanbieder hebt geaccepteerd.'], ['Kan ik via het contactformulier annuleren?', 'Gebruik voor een bestaande rit de app. Een algemeen bericht geeft geen bevestiging dat je rit is geannuleerd.'], ['Ik wil op een ander moment reizen. Wat nu?', 'Bekijk bij je rit welke mogelijkheden er zijn en stem een wijziging af via de app. Beschikbaarheid en extra wensen zijn afhankelijk van de aanbieder.']] as QA[], boxTitle: 'Alles over jouw rit op één plek.', boxText: 'Controleer je status en lees de afspraken voordat je een wijziging of annulering doorgeeft.', action: 'Open mijn rit in de app', href: '/mijn' },
  }[kind];
  return (
    <InfoPage ctx={ctx} title={title} description={`${title} van PickMyRide (concepttekst).`} crumbs={[[path, title]]} hero={hero} help={help} bodyClass="lp-body-white">
      {kind === 'annulering' && <section className="lp-status" aria-labelledby="status-titel">
        <h2 id="status-titel" className="fg-h2 lp-body-title">Wat is de status van je rit?</h2>
        <p className="fg-lead">Kies de situatie die bij jou past. Twijfel je? Bekijk eerst de status in de app.</p>
        <div className="lp-status-grid">
          <div className="lp-status-card"><p className="lp-card-label">01 · Nog niet geboekt</p><h3>Ik heb alleen een aanvraag.</h3>
            <p>Een gratis, vrijblijvende aanvraag is nog geen boeking. Je boekt pas wanneer je een voorstel kiest.</p>
            <ul><li>Controleer of je nog geen voorstel hebt gekozen.</li><li>Bekijk de aanvraag en de status in de app.</li><li>Gebruik de app voor hulp bij je aanvraag.</li></ul>
            <a className="btn btn-secondary" href="/mijn">Bekijk mijn aanvraag</a></div>
          <div className="lp-status-card"><p className="lp-card-label">02 · Voorstel gekozen</p><h3>Ik heb al geboekt.</h3>
            <p>Bekijk de geaccepteerde voorwaarden van het taxibedrijf. Daar vind je de afspraken die horen bij jouw geboekte rit.</p>
            <ul><li>Open de app en ga naar je geboekte rit.</li><li>Controleer de voorwaarden van de aanbieder.</li><li>Gebruik de contactmogelijkheden bij je rit.</li></ul>
            <a className="btn btn-primary" href="/mijn">Open mijn rit in de app</a></div>
        </div>
        <div className="lp-note lp-note-sage"><h3>Een bericht is geen annulering</h3><p>Een bericht via het algemene contactformulier is niet hetzelfde als een bevestigde annulering. Controleer altijd de status van je rit.</p></div>
      </section>}
      <div className="lp-legal">
        <nav className="lp-toc" aria-label="Op deze pagina"><h2>Op deze pagina</h2>
          <ol>{arts.map(([t], i) => <li key={t}><a href={`#art-${i + 1}`}><span>{String(i + 1).padStart(2, '0')}</span>{t}</a></li>)}</ol></nav>
        <div className="lp-articles">
          <p><ConceptLabel /></p>
          <Notice type="warn"><p>Dit is een <strong>concepttekst</strong>. Deze tekst is niet juridisch beoordeeld of goedgekeurd en mag niet als definitief worden beschouwd. Een jurist moet de inhoud beoordelen vóór livegang.</p></Notice>
          {arts.map(([t, body], i) => <article key={t} id={`art-${i + 1}`}><h2><span>{String(i + 1).padStart(2, '0')}</span>{t}</h2>{body}</article>)}
        </div>
      </div>
    </InfoPage>
  );
}

export function ErrorPage({ ctx, status, message }: { ctx: Ctx; status: number; message: string }) {
  const title = status === 404 ? 'Pagina niet gevonden' : status === 403 ? 'Geen toegang' : status === 429 ? 'Even geduld' : 'Er ging iets mis';
  return (
    <Page ctx={ctx} title={title} noindex wide={false}>
      <h1>{title}</h1>
      <Notice type={status >= 500 ? 'fout' : 'info'}><p>{message}</p></Notice>
      <p className="btn-row"><a className="btn btn-secondary" href="/">Naar de homepage</a>{!ctx.user && status === 403 && <a className="btn btn-primary" href={`/inloggen?terug=${encodeURIComponent(ctx.url.pathname)}`}>Inloggen</a>}</p>
    </Page>
  );
}
