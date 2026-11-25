import { countryName } from '../../lib/abroad.ts';
import { ReplacementPanel } from '../support.tsx';
import type { Ctx } from '../../lib/http.ts';
import { Page, Csrf, Notice, Status, Euro, Field, Select, TextArea, Check, PlaceholderNotice, TimeSelect } from '../layout.tsx';
import { describeSeats } from '../../lib/seats.ts';
import { ConversationPanel } from '../conversation.tsx';
import { formatDateTime, formatRelative, toLocalInput, formatDate } from '../../lib/time.ts';
import { describeRule, formatEuro, calculateCommission, type CommissionRule } from '../../lib/money.ts';
import { SERVICE_OPTIONS } from '../../domain/bids.ts';
import { BOOKING_STATUS, label } from '../../domain/status.ts';
import { RatingSummary, CriteriaBreakdown, ReviewItem } from '../reviews.tsx';
import { InfoPage } from './landing.tsx';

// ───────── Aanmelden ─────────
export function CompanySignupPage({ ctx, errors = {}, values, areas, categories, done }: { ctx: Ctx; errors?: Record<string, string>; values?: URLSearchParams; areas: any[]; categories: any[]; done?: boolean }) {
  const v = (k: string) => values?.get(k) || '';
  if (done) return (
    <Page ctx={ctx} title="Aanmelding ontvangen" noindex wide={false}>
      <h1>Bedankt voor uw aanmelding</h1>
      <Notice type="ok"><p>Uw bedrijf heeft de status <strong>In beoordeling</strong>. Een beheerder controleert uw gegevens en documenten. U ontvangt een e-mail zodra uw bedrijf is geactiveerd.</p></Notice>
      <p>U kunt al inloggen om uw profiel te bekijken. Bieden kan pas na activering.</p>
      <a className="btn btn-primary" href="/inloggen">Inloggen</a>
    </Page>
  );
  const docField = (name: string, lbl: string) => (
    <div className="row row-2">
      <div className={'field' + (errors[name] ? ' has-error' : '')}><label htmlFor={'f-' + name}>{lbl} <span className="optional">(PDF, JPG of PNG, max. 5 MB)</span></label>
        <input id={'f-' + name} type="file" name={name} accept="application/pdf,image/jpeg,image/png" style={{ minHeight: 50 }} />{errors[name] && <p className="error-text">{errors[name]}</p>}</div>
      <Field name={name + '_expires'} label="Vervaldatum" type="date" optional value={v(name + '_expires')} />
    </div>
  );
  return (
    <InfoPage ctx={ctx} title="Meld je taxibedrijf aan" description="Meld je taxibedrijf aan voor beoordeling. Alleen gecontroleerde taxibedrijven komen op PickMyRide."
      crumbs={[['/aanmelden-taxibedrijf', 'Taxibedrijf aanmelden']]}
      hero={{ label: 'Voor taxibedrijven', lines: ['Jouw bedrijf.', 'Een nieuwe route.'], intro: 'Meld je taxibedrijf aan voor beoordeling. Presenteer je werkgebied en dienstverlening aan reizigers die hun rit vooraf plannen.',
        foto: 'info-aanmelden-hero', alt: 'Taxiondernemer voor zijn taxibus in een grachtenstraat (illustratief)', caption: 'Alleen gecontroleerde taxibedrijven op het platform.',
        extra: <p><a className="fg-btn" href="#aanmelden">Naar het aanmeldformulier ↓</a></p> }}
      help={{ label: 'Goed om te weten', title: 'Goed om vooraf te weten', items: [
        ['Is mijn bedrijf direct aangesloten?', 'Nee. Een aanmelding is bedoeld voor beoordeling. Alleen gecontroleerde taxibedrijven komen op het platform.'],
        ['Welke reizigers gebruiken PickMyRide?', 'Reizigers vragen een rit minimaal 24 uur vooraf aan. Een aanvraag is gratis en nog geen boeking; de reiziger kiest eerst een voorstel.'],
        ['Kan ik extra voorzieningen aanbieden?', 'Beschrijf je dienstverlening en werkgebied zorgvuldig. Beschikbaarheid en extra voorzieningen blijven afhankelijk van wat jouw bedrijf kan leveren.']],
        boxTitle: 'Een vraag over aanmelden?', boxText: 'Gebruik de contactpagina voor algemene vragen over het aanmelden van je taxibedrijf.', action: 'Naar Contact', href: '/contact' }}>
      <h2 className="fg-h2 lp-body-title">Zo meld je je aan</h2>
      <ol className="lp-cards lp-cards-white lp-steps-cards">{([
        ['Vertel over je bedrijf', 'Vul je bedrijfsgegevens, contactpersoon en werkgebied in.'],
        ['Laat je gegevens beoordelen', 'PickMyRide controleert taxibedrijven voordat zij op het platform komen.'],
        ['Stem de vervolgstappen af', 'Na beoordeling wordt duidelijk welke informatie nog nodig is voor aansluiting.']] as const).map(([t, d], i) =>
        <li key={t}><span className="zg-num">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></li>)}</ol>
      <div className="lp-form-grid" id="aanmelden">
      <div className="lp-form-card">
      <h2 className="lp-form-title">Meld je taxibedrijf aan</h2>
      <p className="muted">Vul de gegevens van je bedrijf in. Een aanmelding is nog geen bevestiging van aansluiting. Na aanmelding krijgt je bedrijf de status "In beoordeling"; alleen een beheerder kan het activeren. Geüploade documenten worden privé opgeslagen.</p>
      {Object.keys(errors).length > 0 && <Notice type="fout"><p>Controleer de gemarkeerde velden.{errors.form ? ' ' + errors.form : ''}</p></Notice>}
      <form method="post" action="/aanmelden-taxibedrijf" encType="multipart/form-data" noValidate>
        <Csrf ctx={ctx} />
        <fieldset className="card"><legend>Bedrijfsgegevens</legend>
          <Field name="legal_name" label="Statutaire bedrijfsnaam" value={v('legal_name')} error={errors.legal_name} autoComplete="organization" />
          <Field name="trade_name" label="Handelsnaam (zichtbaar voor klanten)" value={v('trade_name')} error={errors.trade_name} />
          <div className="row row-2">
            <Field name="kvk_number" label="KvK-nummer" value={v('kvk_number')} error={errors.kvk_number} inputMode="numeric" maxLength={8} />
            <Field name="vat_number" label="Btw-id" optional value={v('vat_number')} error={errors.vat_number} placeholder="NL123456789B01" />
          </div>
          <Field name="address_street" label="Vestigingsadres: straat en huisnummer" value={v('address_street')} error={errors.address_street} />
          <div className="row row-2">
            <Field name="address_postcode" label="Postcode" value={v('address_postcode')} error={errors.address_postcode} maxLength={7} />
            <Field name="address_city" label="Plaats" value={v('address_city')} error={errors.address_city} />
          </div>
        </fieldset>
        <fieldset className="card"><legend>Contactpersoon en account</legend>
          <Field name="contact_name" label="Naam contactpersoon" value={v('contact_name')} error={errors.contact_name} autoComplete="name" />
          <div className="row row-2">
            <Field name="email" label="E-mailadres (ook uw inlognaam)" type="email" value={v('email')} error={errors.email} autoComplete="email" />
            <Field name="phone" label="Telefoonnummer" type="tel" value={v('phone')} error={errors.phone} autoComplete="tel" />
          </div>
          <div className="row row-2">
            <Field name="password" label="Wachtwoord" type="password" error={errors.password} autoComplete="new-password" hint="Minimaal 10 tekens." />
            <Field name="password2" label="Herhaal wachtwoord" type="password" error={errors.password2} autoComplete="new-password" />
          </div>
        </fieldset>
        <fieldset className="card"><legend>Werkgebied</legend>
          <p className="small muted">U ontvangt aanvragen waarvan het vertrek- of bestemmingsadres in een gekozen werkgebied ligt.</p>
          {areas.map(a => <Check key={a.code} name="areas" value={a.code} checked={values?.getAll('areas').includes(a.code)}>{a.name}</Check>)}
          {errors.areas && <p className="error-text">{errors.areas}</p>}
          <Check name="serves_abroad" value="ja" checked={values?.get('serves_abroad') === 'ja'}>Wij rijden ook naar en van België, Duitsland, Frankrijk en Luxemburg</Check>
        </fieldset>
        <fieldset className="card"><legend>Voertuigcategorieën en capaciteit</legend>
          {categories.map(c => (
            <div key={c.code} style={{ borderBottom: '1px solid var(--line)', paddingBottom: '.6rem', marginBottom: '.8rem' }}>
              <Check name={`cat_${c.code}`} checked={v(`cat_${c.code}`) === 'ja'} error={errors[`cat_${c.code}`]}>{c.name_nl}</Check>
              <div className="row row-2">
                <Field name={`cat_${c.code}_pax`} label="Max. personen" type="number" min={1} max={20} value={v(`cat_${c.code}_pax`) || String(c.max_passengers)} />
                <Field name={`cat_${c.code}_bags`} label="Max. grote koffers" type="number" min={0} max={30} value={v(`cat_${c.code}_bags`) || String(c.max_large_bags)} />
              </div>
            </div>
          ))}
          {errors.categories && <p className="error-text">{errors.categories}</p>}
        </fieldset>
        <fieldset className="card"><legend>Vergunning en documenten</legend>
          <div className="row row-2">
            <Field name="license_number" label="Vergunningsnummer taxivervoer" optional value={v('license_number')} />
            <Field name="license_expires_on" label="Vervaldatum vergunning" type="date" optional value={v('license_expires_on')} error={errors.license_expires_on} />
          </div>
          {docField('doc_kvk', 'KvK-uittreksel')}
          {docField('doc_vergunning', 'Vergunning taxivervoer')}
          {docField('doc_verzekering', 'Verzekeringsbewijs')}
        </fieldset>
        <div className="card">
          <Check name="accept_agreement" checked={v('accept_agreement') === 'ja'} error={errors.accept_agreement}>Ik ga akkoord met de partnerovereenkomst <span className="concept-label">CONCEPT</span> en bevestig dat de opgegeven gegevens juist zijn.</Check>
          <p className="small muted">Met verzenden vraag je om beoordeling van je bedrijf. Dit formulier bevat geen toezegging over ritten.</p>
          <button className="btn btn-primary" type="submit">Aanmelding versturen</button>
        </div>
      </form>
      </div>
      <aside className="lp-aside">
        <h3>Eerst gecontroleerd. Dan onderweg.</h3>
        <p>Op PickMyRide vind je alleen gecontroleerde taxibedrijven. Geef daarom volledige en juiste informatie op.</p>
        <h4>Houd je gegevens bij de hand</h4>
        <p>Zorg dat de contactpersoon bereikbaar is en bedrijfsregistratie, werkgebied en voertuiggegevens actueel zijn. Welke aanvullende informatie nodig is, wordt bij de beoordeling afgestemd.</p>
        <h4>Geen automatische toelating</h4>
        <p>Verzenden betekent niet dat je bedrijf direct zichtbaar is op het platform. Er worden hier geen tarieven, opbrengsten of aantallen ritten toegezegd.</p>
      </aside>
      </div>
    </InfoPage>
  );
}

// ───────── Portaal ─────────
export function CompanyDashboardPage({ ctx, available, bids, bookings, unread = {} }: { ctx: Ctx; available: number; bids: any[]; bookings: any[]; unread?: Record<string, number> }) {
  const activeBids = bids.filter(b => b.status === 'actief').length;
  const upcoming = bookings.filter(b => !['afgerond', 'geannuleerd'].includes(b.status));
  const noDriver = upcoming.filter(b => b.status === 'bevestigd').length;
  const unreadTotal = Object.values(unread).reduce((x, y) => x + y, 0);
  const kpis: [string, number, string, string, boolean][] = [
    ['/bedrijf/aanvragen', available, 'Open aanvragen', 'Bekijk en bied', false],
    ['/bedrijf/biedingen', activeBids, 'Lopende biedingen', 'Wacht op keuze klant', false],
    ['/bedrijf/ritten', upcoming.length, 'Komende ritten', 'Bekijk de planning', false],
    ['/bedrijf/ritten', noDriver, 'Zonder chauffeur', noDriver ? 'Wijs nu een chauffeur toe' : 'Alles toegewezen', noDriver > 0],
  ];
  return (
    <Page ctx={ctx} title="Overzicht" area="company">
      <div className="pd-head">
        <div><p className="fg-eyebrow">Overzicht</p><h1>Welkom terug.</h1>
          <p className="pd-lead">{available ? `Er ${available === 1 ? 'staat 1 aanvraag' : `staan ${available} aanvragen`} klaar in jouw werkgebied.` : 'Er staan nu geen nieuwe aanvragen in jouw werkgebied.'}{unreadTotal ? ` Je hebt ${unreadTotal} ongelezen ${unreadTotal === 1 ? 'bericht' : 'berichten'}.` : ''}</p></div>
        <a className="btn btn-primary" href="/bedrijf/aanvragen">Bekijk aanvragen</a>
      </div>
      <div className="kpis pd-kpis">{kpis.map(([h, n, t, sub, warn]) =>
        <a key={t} className={'kpi' + (warn ? ' attention' : '')} href={h}><strong>{n}</strong><span>{t}</span><em>{sub} →</em></a>)}</div>
      <div className="pd-grid">
        <section className="pd-panel" aria-labelledby="pd-ritten">
          <div className="pd-panel-head"><h2 id="pd-ritten">Eerstvolgende ritten</h2><a href="/bedrijf/ritten">Alle ritten</a></div>
          {upcoming.length ? <BookingTable rows={upcoming.slice(0, 5)} unread={unread} /> : <p className="muted">Nog geen geboekte ritten. Zodra een klant jouw voorstel kiest, staat de rit hier.</p>}
        </section>
        <aside className="pd-side">
          <div className="pd-tip"><h3>Zo werkt bieden</h3><ol>
            <li>Kies een open aanvraag in jouw werkgebied.</li>
            <li>Doe één totaalprijs, inclusief alle vaste kosten.</li>
            <li>Kiest de klant jouw voorstel, dan krijg je naam en adres en plan je de rit.</li></ol></div>
          <div className="pd-links"><h3>Snel naar</h3><ul>
            <li><a href="/bedrijf/wagenpark">Chauffeur of voertuig toevoegen</a></li>
            <li><a href="/bedrijf/profiel">Bedrijfsgegevens en documenten</a></li>
            <li><a href="/bedrijf/meldingen">Meldingsinstellingen</a></li>
            <li><a href="/bedrijf/ondersteuning">Ondersteuning</a></li></ul></div>
        </aside>
      </div>
    </Page>
  );
}

export function AvailablePage({ ctx, rows }: { ctx: Ctx; rows: any[] }) {
  return (
    <Page ctx={ctx} title="Beschikbare aanvragen" area="company">
      <h1>Beschikbare aanvragen</h1>
      <p className="muted">Aanvragen binnen uw werkgebied waarvoor u een passend voertuig heeft. Persoonsgegevens en exacte adressen worden pas na een bevestigde boeking gedeeld.</p>
      {!rows.length ? <div className="card"><p>Er zijn op dit moment geen passende aanvragen.</p></div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Ophalen</th><th>Route</th><th>Reizigers</th><th>Voertuig</th><th>Bieden tot</th><th></th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}>
              <td>{formatDateTime(r.pickup_at)}{r.leg === 'terug' && <div className="small muted">terugrit van een retour</div>}</td>
              <td>{placeShort(r, 'pickup')} → {placeShort(r, 'dropoff')}{(r.pickup_country !== 'NL' || r.dropoff_country !== 'NL') && <> <span className="badge badge-info">Buitenland</span></>}{r.stop_city ? <div className="small muted">via {r.stop_city}</div> : null}{r.is_airport && <div><span className="badge badge-info">Luchthaven</span></div>}</td>
              <td>{r.passengers} pers.<div className="small muted">{r.large_bags} groot, {r.small_bags} klein</div>{describeSeats(r) && <div className="small">{describeSeats(r)}</div>}</td>
              <td>{r.category_name}</td>
              <td>{formatRelative(r.bidding_closes_at)}</td>
              <td><a className="btn btn-primary btn-small" href={`/bedrijf/aanvragen/${r.id}`}>Bekijk en bied</a></td>
            </tr>))}
          </tbody></table></div>
      )}
    </Page>
  );
}

export function RideBidPage({ ctx, ride, bid, categories, rule, errors = {}, values }: { ctx: Ctx; ride: any; bid: any; categories: any[]; rule: CommissionRule; errors?: Record<string, string>; values?: any }) {
  const live = bid && ['actief', 'gereserveerd', 'geaccepteerd'].includes(bid.status);
  const editable = ride.can_bid && (!bid || bid.status === 'actief' || !live);
  const src = values || (bid && bid.status === 'actief' ? {
    price: (bid.total_price_cents / 100).toFixed(2).replace('.', ','), vehicle_category: bid.vehicle_category, max_passengers: String(bid.max_passengers), max_large_bags: String(bid.max_large_bags),
    services: bid.included_services, wait_minutes: String(bid.included_wait_minutes), flight_delay_policy: bid.flight_delay_policy, cancellation_policy: bid.cancellation_policy,
    ...(() => { const l = toLocalInput(bid.valid_until); return { valid_date: l.date, valid_time: l.time }; })(), note: bid.note || '',
  } : (() => { const l = toLocalInput(ride.bidding_closes_at); return { valid_date: l.date, valid_time: l.time, max_passengers: String(ride.passengers), max_large_bags: String(ride.large_bags), wait_minutes: ride.is_airport ? '60' : '15', vehicle_category: ride.vehicle_category, services: [] }; })());
  const example = calculateCommission(10000, rule);
  return (
    <Page ctx={ctx} title="Aanvraag en bod" area="company">
      <div className="page-head"><h1>{ride.pickup_city} → {ride.dropoff_city}</h1><Status s={ride.status} /></div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card" style={{ position: 'sticky', top: '1rem' }}>
          <h2>Ritgegevens</h2>
          <div className="summary"><dl>
            <dt>Ophalen</dt><dd>{formatDateTime(ride.pickup_at)}</dd>
            <dt>Van</dt><dd>{placeLong(ride, 'pickup')}</dd>
            {ride.stop_city && <><dt>Tussenstop</dt><dd>{ride.stop_city}</dd></>}
            <dt>Naar</dt><dd>{placeLong(ride, 'dropoff')}</dd>
            <dt>Reizigers</dt><dd>{ride.passengers} personen</dd>
            <dt>Bagage</dt><dd>{`${ride.large_bags} grote koffers, ${ride.small_bags} kleine koffers`}</dd>
            <dt>Gevraagd voertuig</dt><dd>{ride.category_name} (of groter)</dd>
            {describeSeats(ride) && <><dt>Kinderzitjes</dt><dd><strong>{describeSeats(ride)}</strong></dd></>}
            {ride.is_airport && <><dt>Luchthaven</dt><dd>Ja (vluchtnummer wordt na boeking gedeeld)</dd></>}
            <dt>Afstand / reistijd</dt><dd>{ride.distance_m ? `${(ride.distance_m / 1000).toFixed(1)} km` : <span className="muted">Niet beschikbaar — routeprovider nog niet aangesloten</span>}</dd>
            <dt>Bieden tot</dt><dd>{formatDateTime(ride.bidding_closes_at)} ({formatRelative(ride.bidding_closes_at)})</dd>
          </dl></div>
          {ride.notes_for_bidders && <><h3 style={{ marginTop: '1rem' }}>Opmerking van de klant</h3><p className="small">{ride.notes_for_bidders}</p><p className="small muted">Automatisch ontdaan van contactgegevens en adressen. Bijzondere wensen moet u na boeking expliciet bevestigen.</p></>}
          <Notice type="info"><p className="small">Naam, telefoonnummer, e-mailadres en exacte adressen ziet u pas als uw aanbod is gekozen en betaald.</p></Notice>
        </section>

        <section className="card">
          <h2>{bid && bid.status === 'actief' ? 'Uw bod aanpassen' : 'Uw bod'}</h2>
          {bid && bid.status !== 'actief' && <Notice type={bid.status === 'geaccepteerd' ? 'ok' : 'info'}><p>{live ? 'Status van uw bod' : 'Uw vorige bod'}: <Status s={bid.status} /> — <Euro c={bid.total_price_cents} />{!live && ride.can_bid ? '. U kunt een nieuw bod uitbrengen.' : ''}</p></Notice>}
          {!ride.can_bid && (!bid || bid.status === 'actief') && <Notice type="warn"><p>De biedtermijn is verstreken of de aanvraag is gesloten. U kunt niet (meer) bieden of aanpassen.</p></Notice>}
          {errors.form && <Notice type="fout"><p>{errors.form}</p></Notice>}
          {editable && (
            <form method="post" action={`/bedrijf/aanvragen/${ride.id}/bod`} id="bid-form" data-rule={JSON.stringify(rule)} noValidate>
              <Csrf ctx={ctx} />
              <Field name="price" label="Totaalprijs voor de klant (€)" value={src.price} error={errors.price} inputMode="decimal" placeholder="65,00"
                hint="Inclusief alle vooraf bekende verplichte kosten (zoals parkeer- en tolkosten). Verborgen verplichte toeslagen zijn niet toegestaan." />
              <div className="card" style={{ background: '#f8fafc', boxShadow: 'none', marginBottom: '1rem' }} id="calc" aria-live="polite">
                <dl className="breakdown">
                  <dt>Klantprijs</dt><dd id="calc-price">—</dd>
                  <dt>Platformcommissie</dt><dd id="calc-com">—</dd>
                  <dt className="total"><strong>Verwachte uitbetaling</strong></dt><dd className="total" id="calc-pay">—</dd>
                </dl>
                <p className="small muted" style={{ margin: '.6rem 0 0' }}>Berekening: {describeRule(rule)}. Afgerond op hele centen. Voorbeeld: bij {formatEuro(10000)} klantprijs is de commissie {formatEuro(example.commissionCents)} en de uitbetaling {formatEuro(example.payoutCents)}. De regel die geldt op het moment van indienen wordt bij de boeking vastgelegd. Btw-behandeling: nog door een boekhouder te bevestigen.</p>
              </div>
              <Select name="vehicle_category" label="Voertuigcategorie" value={src.vehicle_category} error={errors.vehicle_category}
                options={categories.filter(c => c.sort_order >= ride.category_sort).map(c => [c.code, `${c.name_nl} (uw max.: ${c.max_passengers} pers., ${c.max_large_bags} koffers)`])} />
              <div className="row row-2">
                <Field name="max_passengers" label="Max. personen" type="number" min={ride.passengers} max={20} value={src.max_passengers} error={errors.max_passengers} />
                <Field name="max_large_bags" label="Max. grote koffers" type="number" min={ride.large_bags} max={30} value={src.max_large_bags} error={errors.max_large_bags} />
              </div>
              <Field name="wait_minutes" label="Inbegrepen wachttijd (minuten)" type="number" min={0} max={240} value={src.wait_minutes} error={errors.wait_minutes} />
              <div className="field"><span className="label">Inbegrepen diensten</span>
                {SERVICE_OPTIONS.map(([k, t]) => <Check key={k} name="services" value={k} checked={(src.services || []).includes(k)}>{t}</Check>)}</div>
              <TextArea name="flight_delay_policy" label="Voorwaarden bij vluchtvertraging" value={src.flight_delay_policy} error={errors.flight_delay_policy} maxLength={400}
                hint='Bijv. "Wij volgen de vlucht; de wachttijd start bij de werkelijke landing. Geen meerkosten bij vertraging."' />
              <TextArea name="cancellation_policy" label="Annuleringsvoorwaarden" value={src.cancellation_policy} error={errors.cancellation_policy} maxLength={400}
                hint='Bijv. "Kosteloos annuleren tot 24 uur voor ophalen; daarna 50%."' />
              <div className="row row-2">
                <Field name="valid_date" label="Bod geldig tot (datum)" type="date" value={src.valid_date} error={errors.valid_date} />
                <TimeSelect name="valid_time" label="Tijd" value={src.valid_time} step={5} />
              </div>
              <p className="small muted" style={{ marginTop: '-.6rem' }}>Uiterlijk tot het laatste boekingsmoment: {formatDateTime(ride.booking_cutoff_at)}.</p>
              <TextArea name="note" label="Toelichting voor de klant" optional value={src.note} error={errors.note} maxLength={500} hint="Geen contactgegevens: contact verloopt via het platform." />
              <Notice type="warn"><p className="small">Met het indienen committeert uw bedrijf zich aan dit aanbod tot de geldigheid verloopt. Kiest en betaalt de klant, dan is de rit direct aan u toegewezen; er volgt geen aparte acceptatie.</p></Notice>
              <button className="btn btn-primary btn-block" type="submit">{bid && bid.status === 'actief' ? 'Bod bijwerken' : 'Bod indienen'}</button>
            </form>
          )}
          {bid && bid.status === 'actief' && (
            <form method="post" action={`/bedrijf/biedingen/${bid.id}/intrekken`} style={{ marginTop: '.8rem' }} data-confirm="Weet u zeker dat u dit bod wilt intrekken?">
              <Csrf ctx={ctx} /><button className="btn btn-danger btn-block" type="submit">Bod intrekken</button>
            </form>
          )}
        </section>
      </div>
    </Page>
  );
}

export function MyBidsPage({ ctx, rows }: { ctx: Ctx; rows: any[] }) {
  return (
    <Page ctx={ctx} title="Mijn biedingen" area="company">
      <h1>Mijn biedingen</h1>
      {!rows.length ? <div className="card"><p>U heeft nog geen biedingen gedaan.</p></div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Rit</th><th>Klantprijs</th><th>Uitbetaling</th><th>Geldig tot</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map(b => (
            <tr key={b.id}><td>{formatDateTime(b.pickup_at)}<div className="small muted">{b.pickup_city} → {b.dropoff_city}</div></td>
              <td><Euro c={b.total_price_cents} /></td><td><Euro c={b.payout_cents} /></td><td>{formatDateTime(b.valid_until)}</td><td><Status s={b.status} /></td>
              <td><a href={`/bedrijf/aanvragen/${b.ride_id}`}>Bekijk</a></td></tr>))}
          </tbody></table></div>
      )}
    </Page>
  );
}

function BookingTable({ rows, unread = {} }: { rows: any[]; unread?: Record<string, number> }) {
  if (!rows.length) return <div className="card"><p>Geen ritten.</p></div>;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Boeking</th><th>Ophalen</th><th>Route</th><th>Chauffeur / voertuig</th><th>Status</th><th>Berichten</th></tr></thead>
      <tbody>{rows.map(b => (
        <tr key={b.id}><td><a href={`/bedrijf/ritten/${b.id}`}>{b.booking_number}</a></td><td>{formatDateTime(b.pickup_at)}</td><td>{b.pickup_city} → {b.dropoff_city}</td>
          <td>{b.driver_name ? `${b.driver_name} · ${b.license_plate}` : <span className="badge badge-warn">Nog toewijzen</span>}</td><td><Status s={b.status} /></td><td>{unread[b.id] ? <a className="badge badge-info" href={`/bedrijf/ritten/${b.id}#contact`}>{`${unread[b.id]} nieuw`}</a> : <span className="muted small">—</span>}</td></tr>))}
      </tbody></table></div>
  );
}

export function CompanyBookingsPage({ ctx, rows, unread }: { ctx: Ctx; rows: any[]; unread?: Record<string, number> }) {
  return <Page ctx={ctx} title="Gewonnen ritten" area="company"><h1>Gewonnen ritten en planning</h1><BookingTable rows={rows} unread={unread} /></Page>;
}

export function CompanyBookingPage({ ctx, booking: b, drivers, vehicles, conv, help }: { ctx: Ctx; booking: any; drivers: any[]; vehicles: any[]; conv?: any; help?: any }) {
  const next = (BOOKING_STATUS[b.status] || []).filter(r => r.roles.includes('company') && r.to !== 'chauffeur_toegewezen');
  return (
    <Page ctx={ctx} title={`Boeking ${b.booking_number}`} area="company">
      <div className="page-head"><h1>Boeking {b.booking_number}</h1><Status s={b.status} /></div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card">
          <h2>Uitvoeringsgegevens</h2>
          <div className="summary"><dl>
            <dt>Ophalen</dt><dd>{formatDateTime(b.pickup_at)}</dd>
            <dt>Ophaaladres</dt><dd>{b.pickup_address}</dd>
            {b.stop_address && <><dt>Tussenstop</dt><dd>{b.stop_address}</dd></>}
            <dt>Bestemming</dt><dd>{b.dropoff_address}</dd>
            {b.flight_number && <><dt>Vlucht</dt><dd>{b.flight_number}</dd></>}
            <dt>Klant</dt><dd>{b.contact_name}</dd>
            <dt>Contact</dt><dd>Via chat en <strong>Bellen via PickMyRide</strong> hieronder (nummers afgeschermd)</dd>
            <dt>Reizigers</dt><dd>{`${b.passengers} ${b.passengers === 1 ? 'persoon' : 'personen'}, ${b.large_bags} grote en ${b.small_bags} kleine koffers`}</dd>
            {describeSeats(b) && <><dt>Kinderzitjes</dt><dd><strong>{describeSeats(b)}</strong></dd></>}
            <dt>Wachttijd</dt><dd>{b.included_wait_minutes} min inbegrepen</dd>
          </dl></div>
          {b.customer_notes && <><h3 style={{ marginTop: '1rem' }}>Opmerkingen en bijzondere wensen</h3><p>{b.customer_notes}</p><Notice type="warn"><p className="small">Bevestig bijzondere wensen expliciet met de klant.</p></Notice></>}
          <h3 style={{ marginTop: '1rem' }}>Financieel</h3>
          <dl className="breakdown"><dt>Klantprijs</dt><dd><Euro c={b.total_price_cents} /></dd><dt>Commissie</dt><dd>− <Euro c={b.commission_cents} /></dd><dt className="total"><strong>Uitbetaling</strong></dt><dd className="total"><Euro c={b.payout_cents} /></dd></dl>
        </section>
        <section className="stack">
          <div className="card">
            <h2>Chauffeur en voertuig</h2>
            {(!drivers.length || !vehicles.length) && <Notice type="info"><p>Voeg eerst een chauffeur en voertuig toe bij <a href="/bedrijf/wagenpark">Chauffeurs en voertuigen</a>.</p></Notice>}
            {['bevestigd', 'chauffeur_toegewezen'].includes(b.status) && drivers.length > 0 && vehicles.length > 0 ? (
              <form method="post" action={`/bedrijf/ritten/${b.id}/toewijzen`}><Csrf ctx={ctx} />
                <Select name="driver_id" label="Chauffeur" value={b.driver_id || ''} options={[['', 'Kies een chauffeur'], ...drivers.map(d => [d.id, d.full_name] as [string, string])]} />
                <Select name="vehicle_id" label="Voertuig" value={b.vehicle_id || ''} options={[['', 'Kies een voertuig'], ...vehicles.map(v => [v.id, `${v.description} · ${v.license_plate} (${v.max_passengers} pl.)`] as [string, string])]} />
                <button className="btn btn-primary" type="submit">{b.driver_id ? 'Toewijzing wijzigen' : 'Toewijzen'}</button>
              </form>
            ) : b.driver_id ? <p className="muted">Toegewezen.</p> : null}
          </div>
          <div className="card">
            <h2>Operationele status doorgeven</h2>
            <p className="small muted">De klant ziet deze statussen als doorgegeven statussen, niet als live tracking.</p>
            {!next.length ? <p className="muted">Geen vervolgstatus mogelijk.</p> : next.map(r => (
              <form key={r.to} method="post" action={`/bedrijf/ritten/${b.id}/status`} style={{ marginBottom: '.6rem' }}><Csrf ctx={ctx} />
                <input type="hidden" name="to" value={r.to} />
                {r.to === 'probleem_gemeld' && <TextArea name="note" label="Omschrijving van het probleem" maxLength={300} />}
                <button className={'btn btn-block ' + (r.to === 'probleem_gemeld' ? 'btn-danger' : 'btn-secondary')} type="submit">{r.to === 'probleem_gemeld' ? 'Probleem melden' : label(r.to)}</button>
              </form>
            ))}
          </div>
        </section>
      </div>
      {help && (help.current || help.options.length > 0) && <div style={{ marginTop: '1rem' }}><ReplacementPanel ctx={ctx} info={help} basePath={`/bedrijf/ritten/${b.id}`} viewer="company" bookingNumber={b.booking_number} /></div>}
      {conv && <div style={{ marginTop: '1rem' }}><ConversationPanel ctx={ctx} conv={conv} viewer="company" otherName={`de klant (${b.contact_name.split(' ')[0]})`} basePath={`/bedrijf/ritten/${b.id}`} notice={ctx.flash?.area === 'contact' ? ctx.flash : null} /></div>}
    </Page>
  );
}

export function FleetPage({ ctx, drivers, vehicles, categories }: { ctx: Ctx; drivers: any[]; vehicles: any[]; categories: any[] }) {
  return (
    <Page ctx={ctx} title="Chauffeurs en voertuigen" area="company">
      <h1>Chauffeurs en voertuigen</h1>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card"><h2>Chauffeurs</h2>
          <ul>{drivers.map(d => <li key={d.id}>{d.full_name} · {d.phone}{d.pass_expires_on ? ` · chauffeurspas geldig tot ${formatDate(d.pass_expires_on)}` : ''}</li>)}</ul>
          <form method="post" action="/bedrijf/wagenpark/chauffeur"><Csrf ctx={ctx} /><h3>Chauffeur toevoegen</h3>
            <Field name="full_name" label="Naam" /><Field name="phone" label="Telefoon" type="tel" />
            <div className="row row-2"><Field name="driver_pass_number" label="Chauffeurspasnummer" optional /><Field name="pass_expires_on" label="Geldig tot" type="date" optional /></div>
            <button className="btn btn-primary" type="submit">Toevoegen</button></form>
        </section>
        <section className="card"><h2>Voertuigen</h2>
          <ul>{vehicles.map(v => <li key={v.id}>{v.description} · {v.license_plate} · {v.name_nl}, {v.max_passengers} plaatsen</li>)}</ul>
          <form method="post" action="/bedrijf/wagenpark/voertuig"><Csrf ctx={ctx} /><h3>Voertuig toevoegen</h3>
            <Field name="description" label="Merk, model en kleur" /><div className="row row-2"><Field name="license_plate" label="Kenteken" /><Field name="max_passengers" label="Zitplaatsen (passagiers)" type="number" min={1} max={20} value="4" /></div>
            <Select name="category_code" label="Categorie" options={categories.map(c => [c.code, c.name_nl])} />
            <button className="btn btn-primary" type="submit">Toevoegen</button></form>
        </section>
      </div>
    </Page>
  );
}

export function FinancePage({ ctx, rows }: { ctx: Ctx; rows: any[] }) {
  const sum = (k: string) => rows.filter(r => r.status !== 'geannuleerd').reduce((s, r) => s + r[k], 0);
  return (
    <Page ctx={ctx} title="Financieel overzicht" area="company">
      <h1>Financieel overzicht</h1>
      <Notice type="info"><p className="small">Uitbetalingen via de betaalprovider zijn nog niet aangesloten. Statussen hieronder zijn registraties in het platform. Btw- en facturatieregels moeten nog door een boekhouder worden bevestigd.</p></Notice>
      <div className="kpis"><div className="kpi"><strong><Euro c={sum('total_price_cents')} /></strong><span>Omzet klantprijzen</span></div><div className="kpi"><strong><Euro c={sum('commission_cents')} /></strong><span>Commissie</span></div><div className="kpi"><strong><Euro c={sum('payout_cents')} /></strong><span>Uitbetaling (verwacht)</span></div></div>
      <div className="table-wrap" style={{ marginTop: '1rem' }}><table><thead><tr><th>Boeking</th><th>Rit</th><th>Klantprijs</th><th>Commissie</th><th>Uitbetaling</th><th>Uitbetalingsstatus</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}><td>{r.booking_number}</td><td>{formatDateTime(r.pickup_at)}</td><td><Euro c={r.total_price_cents} /></td><td><Euro c={r.commission_cents} /></td><td><Euro c={r.payout_cents} /></td><td>{r.payout_status ? <Status s={r.payout_status} /> : '—'}</td></tr>)}</tbody></table></div>
    </Page>
  );
}

export function ProfilePage({ ctx, company: c, docs, areas, cats }: { ctx: Ctx; company: any; docs: any[]; areas: any[]; cats: any[] }) {
  return (
    <Page ctx={ctx} title="Bedrijfsprofiel" area="company">
      <h1>Bedrijfsprofiel en documenten</h1>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card"><h2>{c.trade_name}</h2><p>Status: <Status s={c.status} /></p>
          <div className="summary"><dl><dt>Statutaire naam</dt><dd>{c.legal_name}</dd><dt>KvK</dt><dd>{c.kvk_number}</dd><dt>Btw-id</dt><dd>{c.vat_number || '—'}</dd><dt>Adres</dt><dd>{c.address_street}, {c.address_postcode} {c.address_city}</dd>
            <dt>Contact</dt><dd>{c.contact_name}, {c.email}, {c.phone}</dd><dt>Werkgebied</dt><dd>{areas.map(a => a.name).join(', ')}{c.serves_abroad ? '; ook buitenland (BE, DE, FR, LU)' : ''}</dd><dt>Voertuigen</dt><dd>{cats.map(x => `${x.name_nl} (${x.max_passengers} pers., ${x.max_large_bags} koffers)`).join('; ')}</dd></dl></div>
          <p className="small muted" style={{ marginTop: '1rem' }}>Gegevens wijzigen kan nu via ondersteuning; zelf bewerken volgt in een volgende fase.</p></section>
        <section className="card"><h2>Documenten</h2>
          {!docs.length ? <p>Geen documenten geüpload.</p> : <ul>{docs.map(d => <li key={d.id}><a href={`/documenten/${d.id}`}>{d.original_filename}</a> · {label(d.doc_type)}{d.expires_on ? ` · verloopt ${formatDate(d.expires_on)}` : ''} · <Status s={d.verification_status} /></li>)}</ul>}
          <p className="small muted">Documenten zijn privé opgeslagen en alleen zichtbaar voor uw bedrijf en de beheerder.</p></section>
      </div>
    </Page>
  );
}

export function CompanyPlaceholderPage({ ctx, title, what }: { ctx: Ctx; title: string; what: string }) {
  return <Page ctx={ctx} title={title} area="company"><h1>{title}</h1><PlaceholderNotice what={what} /></Page>;
}

export function CompanyReviewsPage({ ctx, summary, reviews }: { ctx: Ctx; summary: any; reviews: any[] }) {
  const hidden = reviews.filter(r => r.status !== 'gepubliceerd').length;
  return (
    <Page ctx={ctx} title="Beoordelingen" area="company">
      <h1>Beoordelingen</h1>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card"><h2>Gemiddelde</h2><p style={{ fontSize: '1.1rem' }}><RatingSummary s={summary} /></p>
          {summary?.rating_count > 0 && <CriteriaBreakdown source={summary} prefix="avg_" />}
          <p className="small muted" style={{ marginTop: '.8rem' }}>Alleen gepubliceerde beoordelingen tellen mee. Klanten kunnen alleen na een afgeronde rit één keer beoordelen. Scores kunnen door niemand worden aangepast; de beheerder kan een beoordeling alleen verbergen, met vastgelegde reden.</p></section>
        <section className="card"><h2>Hoe wordt u beoordeeld?</h2><ul className="small">
          <li><strong>Communicatie</strong> — bereikbaarheid, duidelijke afspraken, informatie vooraf en onderweg</li>
          <li><strong>Klantvriendelijkheid</strong> — vriendelijkheid, behulpzaamheid, hulp met bagage</li>
          <li><strong>Comfort &amp; hygiëne</strong> — schoon, fris en comfortabel voertuig</li>
          <li><strong>Betrouwbaarheid</strong> — op tijd, afspraken nagekomen, prijs zoals geboekt</li>
          <li><strong>Rijgedrag &amp; veiligheid</strong> — rustig en veilig gereden</li></ul></section>
      </div>
      <h2 style={{ marginTop: '1.5rem' }}>Alle beoordelingen ({reviews.length}{hidden ? `, waarvan ${hidden} niet zichtbaar` : ''})</h2>
      {!reviews.length ? <div className="card"><p>U heeft nog geen beoordelingen ontvangen.</p></div> : reviews.map(r => <ReviewItem key={r.id} r={r} showStatus />)}
    </Page>
  );
}

/** Plaats voor bieders: in Nederland met postcodegebied, in het buitenland alleen plaats en land. */
function placeShort(r: any, side: 'pickup' | 'dropoff') {
  return r[`${side}_country`] && r[`${side}_country`] !== 'NL' ? `${r[`${side}_city`]} (${countryName(r[`${side}_country`])})` : `${r[`${side}_city`]} (${r[`${side}_postcode4`]})`;
}
function placeLong(r: any, side: 'pickup' | 'dropoff') {
  return r[`${side}_country`] && r[`${side}_country`] !== 'NL' ? `${r[`${side}_city`]}, ${countryName(r[`${side}_country`])}` : `${r[`${side}_city`]}, postcodegebied ${r[`${side}_postcode4`]}`;
}
