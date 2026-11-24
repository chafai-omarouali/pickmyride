import type { Ctx } from '../../lib/http.ts';
import { Page, Field, Select, Csrf, Notice, TextArea, Check, TimeSelect } from '../layout.tsx';
import { SEAT_TYPES } from '../../lib/seats.ts';
import type { FieldErrors, RequestInput } from '../../domain/requests.ts';
import type { Settings } from '../../lib/services.ts';
import { toLocalInput, hours } from '../../lib/time.ts';
import { AIRPORTS } from '../../lib/airports.ts';
import { COUNTRIES, FOREIGN_AIRPORTS } from '../../lib/abroad.ts';
import { QuickRequestForm } from './public.tsx';

const STEP_OF: Record<string, number> = {
  trip_type: 2, pickup_street: 2, pickup_postcode: 2, pickup_city: 2, pickup_country: 2, dropoff_street: 2, dropoff_postcode: 2, dropoff_city: 2, dropoff_country: 2, stop_street: 2, stop_postcode: 2, stop_city: 2,
  date: 2, time: 2, return_date: 2, return_time: 2, flight_number: 2, return_flight_number: 2,
  passengers: 2, large_bags: 2, small_bags: 2, vehicle_category: 2, seat_maxicosi: 2, seat_kinderstoel: 2, seat_verhoger: 2, notes: 2, name: 3, email: 3, phone: 3, accept_terms: 4, marketing: 4,
};

function AddressBlock({ prefix, title, v, e, optional }: { prefix: 'pickup' | 'dropoff' | 'stop'; title: string; v: Partial<RequestInput>; e: FieldErrors; optional?: boolean }) {
  const k = (s: string) => `${prefix}_${s}` as keyof RequestInput;
  return (
    <div className="address" data-address={prefix}>
      <div className="address-head">
        <h3>{title} {optional && <span className="optional">(optioneel)</span>}</h3>
        {!optional && (
          <select className="airport-pick" data-fill-airport={prefix} aria-label={`Luchthaven invullen als ${title.toLowerCase()}`} defaultValue="">
            <option value="">Luchthaven invullen…</option>
            <optgroup label="Nederland">{AIRPORTS.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>
            <optgroup label="Buitenland">{FOREIGN_AIRPORTS.map(a => <option key={a.code} value={a.code}>{a.name}</option>)}</optgroup>
          </select>
        )}
      </div>
      {prefix !== 'stop' && <div className="field field-country">
        <label htmlFor={`f-${k('country')}`}>Land</label>
        <select id={`f-${k('country')}`} name={k('country')} defaultValue={(v[k('country')] as string) || 'NL'} data-country-for={prefix} aria-invalid={e[k('country')] ? true : undefined}>
          {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
        </select>
        {e[k('country')] && <p className="error-text">{e[k('country')]}</p>}
      </div>}
      <div className="row row-pc">
        <Field name={k('street')} label="Straat en huisnummer" value={v[k('street')]} error={e[k('street')]} autoComplete={prefix === 'pickup' ? 'address-line1' : 'off'} />
        <Field name={k('postcode')} label="Postcode" value={v[k('postcode')]} error={e[k('postcode')]} placeholder="1234 AB" maxLength={7} autoComplete={prefix === 'pickup' ? 'postal-code' : 'off'} />
        <Field name={k('city')} label="Plaats" value={v[k('city')]} error={e[k('city')]} autoComplete={prefix === 'pickup' ? 'address-level2' : 'off'} />
      </div>
    </div>
  );
}

function ReqInfo({ ctx, minLead, geoConnected }: { ctx: Ctx; minLead: number; geoConnected: boolean }) {
  return (
    <aside className="req-info" aria-label="Uitleg bij je aanvraag">
      <h2>Zo gaat het verder</h2>
      <ol className="req-steps">
        <li><span>01</span><div><h3>Je plaatst je aanvraag</h3><p>{`Minimaal ${minLead} uur voor vertrek. Een account is niet nodig.`}</p></div></li>
        <li><span>02</span><div><h3>Taxibedrijven doen een voorstel</h3><p>Alleen gecontroleerde bedrijven uit je regio. Ze zien elkaars prijzen niet.</p></div></li>
        <li><span>03</span><div><h3>Jij vergelijkt en kiest</h3><p>Elk voorstel toont de totaalprijs. Je boekt pas als je er een kiest en betaalt.</p></div></li>
      </ol>
      <h2>Goed om te weten</h2>
      <ul className="hero-checks req-checks">
        <li><img className="qf-icon" src="/static/img/icons/vinkje.svg" alt="" width={19} height={19} />Een aanvraag is nog geen boeking</li>
        <li><img className="qf-icon" src="/static/img/icons/vinkje.svg" alt="" width={19} height={19} />Je naam en adres zien bedrijven pas na boeking</li>
        <li><img className="qf-icon" src="/static/img/icons/vinkje.svg" alt="" width={19} height={19} />Je telefoonnummer en e-mail blijven afgeschermd</li>
        <li><img className="qf-icon" src="/static/img/icons/vinkje.svg" alt="" width={19} height={19} />Vluchtnummer helpt bij ophalen op de luchthaven</li>
      </ul>
      {!geoConnected && <p className="req-note">Automatische adrescontrole en routeberekening zijn nog niet aangesloten. Controleer je adres zorgvuldig; het taxibedrijf ziet de exacte gegevens pas na boeking.</p>}
      {ctx.support?.visible && <p className="req-support">{`Vragen? Onze klantenservice is ${ctx.support.hours} bereikbaar.`} <a href="/contact">Contact</a></p>}
    </aside>
  );
}

/** Stap 1: dezelfde invoer als op de homepage. Daarna gaat de klant naar /rit-aanvragen/gegevens (stap 2). */
export function RequestStartPage({ ctx, settings, geoConnected }: { ctx: Ctx; settings: Settings; geoConnected: boolean }) {
  return (
    <Page ctx={ctx} title="Rit aanvragen" description="Vraag vrijblijvend prijsvoorstellen aan voor je taxirit naar de luchthaven of voor een lange afstand."
      hero={<section className="hero req-hero"><div className="wrap req-grid">
        <div className="req-intro">
          <p className="hero-chip">Gratis &amp; vrijblijvend</p>
          <h1>Rit aanvragen</h1>
          <p className="lead">Vul je rit in en ontvang prijsvoorstellen van gecontroleerde taxibedrijven. Je kiest zelf of en welk voorstel je boekt.</p>
        </div>
        <div className="req-form">
          <ol className="stepper" aria-hidden="true"><li className="current">1. Rit</li><li>2. Bagage</li><li>3. Contact</li><li>4. Controle</li></ol>
          <QuickRequestForm minLeadHours={settings.min_lead_hours} />
        </div>
        <ReqInfo ctx={ctx} minLead={settings.min_lead_hours} geoConnected={geoConnected} />
      </div></section>}>
      {null as any}
    </Page>
  );
}

export function RequestPage({ ctx, values = {}, errors = {}, settings, categories, geoConnected }:
  { ctx: Ctx; values?: Partial<RequestInput>; errors?: FieldErrors; settings: Settings; categories: any[]; geoConnected: boolean }) {
  const v = values, e = errors;
  const firstErr = Object.keys(e).filter(k => k !== 'form').map(k => STEP_OF[k] || 2).sort()[0] || 2;
  const earliest = toLocalInput(new Date(Date.now() + hours(settings.min_lead_hours)));
  const isRetour = v.trip_type === 'retour';
  const cfg = { minLead: settings.min_lead_hours, window: settings.bidding_window_hours, cutoff: settings.booking_cutoff_hours, startStep: firstErr,
    categories: Object.fromEntries(categories.map(c => [c.code, { name: c.name_nl, pax: c.max_passengers, bags: c.max_large_bags, small: c.max_small_bags }])) };
  const num = (n: number, from = 0): [string, string][] => Array.from({ length: n - from + 1 }, (_, i) => [String(i + from), String(i + from)]);
  return (
    <Page ctx={ctx} title="Rit aanvragen" noindex description="Vraag vrijblijvend prijsvoorstellen aan voor je taxirit naar de luchthaven of voor een lange afstand."
      hero={<section className="hero req-hero"><div className="wrap req-grid">
        <div className="req-intro">
          <p className="hero-chip">Gratis &amp; vrijblijvend</p>
          <h1>Rit aanvragen</h1>
          <p className="lead">Vul je rit in en ontvang prijsvoorstellen van gecontroleerde taxibedrijven. Je kiest zelf of en welk voorstel je boekt.</p>
        </div>
        <div className="req-form">
          {e.form && <Notice type="fout"><p>{e.form}</p></Notice>}
          {Object.keys(e).length > 0 && !e.form && <Notice type="fout"><p>Controleer de gemarkeerde velden.</p></Notice>}
          <form method="post" action="/rit-aanvragen" noValidate id="request-form" data-config={JSON.stringify({ ...cfg, airports: [...AIRPORTS.map(a => ({ ...a, country: 'NL' })), ...FOREIGN_AIRPORTS] })}>
            <Csrf ctx={ctx} />
            <ol className="stepper" aria-hidden="true" id="stepper"><li>1. Rit</li><li>2. Bagage</li><li>3. Contact</li><li>4. Controle</li></ol>

            <fieldset className="step card" data-step="2">
              <legend>Stap 2 van 4: Bagage en vlucht</legend>
              <div className="field"><span className="label" id="trip-lbl">Soort reis</span>
                <div className="segmented" role="radiogroup" aria-labelledby="trip-lbl">
                  <label><input type="radio" name="trip_type" value="enkel" defaultChecked={!isRetour} /> Enkele reis</label>
                  <label><input type="radio" name="trip_type" value="retour" defaultChecked={isRetour} /> Retour</label>
                </div>
                {e.trip_type && <p className="error-text">{e.trip_type}</p>}
              </div>
              <AddressBlock prefix="pickup" title="Vertrekadres" v={v} e={e} />
              <AddressBlock prefix="dropoff" title="Bestemming" v={v} e={e} />
              <div className="travel" data-travel>
                <h3>Bagage</h3>
                <div className="row row-3">
                  <Select name="passengers" label="Aantal personen" options={num(8, 1)} value={v.passengers || '2'} error={e.passengers} />
                  <Select name="large_bags" label="Grote koffers" options={num(8)} value={v.large_bags || '0'} error={e.large_bags} />
                  <Select name="small_bags" label="Kleine koffers" options={num(8)} value={v.small_bags || '0'} error={e.small_bags} />
                </div>
                <p className="hint bags-hint">Grote koffer: ruimbagage (bijv. 23 kg). Kleine koffer: handbagageformaat of trolley.</p>
              </div>
              <div className="seats-card" data-seats>
                <label className="seats-switch" htmlFor="f-need_seats">
                  <span className="seats-ico"><img src="/static/img/icons/kinderzitje.svg" alt="" width={24} height={24} /></span>
                  <span className="seats-txt"><strong>Kinderzitjes</strong><span>Reis je met kinderen? Geef aan welke zitjes je nodig hebt.</span></span>
                  <input type="checkbox" role="switch" className="switch" id="f-need_seats" name="need_seats" value="ja" defaultChecked={v.need_seats === 'ja'} />
                </label>
                <fieldset className="seats-panel">
                  <legend className="sr">Kies het aantal kinderzitjes per soort</legend>
                  <div className="seat-tiles">
                    {SEAT_TYPES.map(([k, name, hint]) => (
                      <div key={k} className="seat-row seat-tile">
                        <img className="seat-img" src={`/static/img/icons/${k.replace('seat_', '')}.svg`} alt="" width={28} height={28} />
                        <label htmlFor={'f-' + k}>{name}</label>
                        <p className="hint" id={'f-' + k + '-hint'}>{hint}</p>
                        <div className="num-step">
                          <button type="button" data-step-dec={'f-' + k} aria-label={`Eén ${name} minder`}>−</button>
                          <select id={'f-' + k} name={k} defaultValue={v[k] || '0'} aria-describedby={'f-' + k + '-hint'}>{num(3).map(([a2, t]) => <option key={a2} value={a2}>{t}</option>)}</select>
                          <button type="button" data-step-inc={'f-' + k} aria-label={`Eén ${name} meer`}>+</button>
                        </div>
                        {e[k] && <p className="error-text">{e[k]}</p>}
                      </div>
                    ))}
                  </div>
                  <p className="hint seats-note">Het gekozen taxibedrijf bevestigt de kinderzitjes in zijn aanbod. Leeftijden en gewichten zijn een indicatie.</p>
                </fieldset>
              </div>
              <details className="more" open={!!(v.stop_street || e.stop_street || e.stop_postcode || e.stop_city)} style={{ marginBottom: '1rem' }}>
                <summary>Tussenstop toevoegen</summary>
                <div style={{ marginTop: '.8rem' }}><AddressBlock prefix="stop" title="Tussenstop" v={v} e={e} optional /></div>
              </details>
              <div className="row row-2">
                <Field name="date" label="Datum heenrit" type="date" min={earliest.date} value={v.date} error={e.date} hint={`Minimaal ${settings.min_lead_hours} uur van tevoren. Tijden in Nederlandse tijd.`} />
                <TimeSelect name="time" label="Ophaaltijd" value={v.time || '09:00'} error={e.time} />
              </div>
              <Field name="flight_number" label="Vluchtnummer" optional value={v.flight_number} error={e.flight_number} placeholder="Bijv. KL1234" hint="Handig bij ophalen op de luchthaven. Wordt pas na boeking gedeeld." maxLength={10} />
              <div id="return-fields" hidden={!isRetour} data-retour>
                <h3>Terugrit</h3>
                <p className="small muted">De terugrit gaat van je bestemming naar je vertrekadres. Het is een aparte rit met eigen aanbiedingen; heen- en terugrit kunnen door verschillende bedrijven worden uitgevoerd.</p>
                <div className="row row-2">
                  <Field name="return_date" label="Datum terugrit" type="date" min={earliest.date} value={v.return_date} error={e.return_date} />
                  <TimeSelect name="return_time" label="Ophaaltijd terugrit" value={v.return_time} error={e.return_time} />
                </div>
                <Field name="return_flight_number" label="Vluchtnummer terugrit" optional value={v.return_flight_number} error={e.return_flight_number} maxLength={10} />
              </div>
              <fieldset className="veh-card" data-vehicles>
                <legend>Kies je voertuig</legend>
                <div className="veh-tiles">
                  {categories.map(c => {
                    const icon = c.code === 'taxibus' ? 'bus' : c.code === 'stationwagen' ? 'station' : 'sedan';
                    return (
                      <label key={c.code} className="veh-tile" data-pax={c.max_passengers} data-large={c.max_large_bags} data-small={c.max_small_bags ?? ''}>
                        <input type="radio" name="vehicle_category" value={c.code} defaultChecked={(v.vehicle_category || 'personenauto') === c.code} />
                        <img className="veh-img" src={`/static/img/icons/auto-${icon}.svg`} alt="" width={56} height={28} />
                        <strong>{c.name_nl}</strong>
                        <ul className="veh-cap">
                          <li><img src="/static/img/icons/personen.svg" alt="" width={14} height={14} />{`${c.max_passengers} personen`}</li>
                          <li><img src="/static/img/icons/koffer-groot.svg" alt="" width={14} height={14} />{`${c.max_large_bags} grote koffers`}</li>
                          {c.max_small_bags != null && <li><img src="/static/img/icons/koffer-klein.svg" alt="" width={14} height={14} />{`${c.max_small_bags} kleine koffers`}</li>}
                        </ul>
                        <span className="veh-nofit">Te klein voor je rit</span>
                      </label>
                    );
                  })}
                </div>
                {e.vehicle_category && <p className="error-text">{e.vehicle_category}</p>}
              </fieldset>
              <details className="more notes-more" open={!!(v.notes || e.notes)}>
                <summary>Opmerking of bijzondere wens toevoegen</summary>
                <TextArea name="notes" label="Opmerkingen of bijzondere wensen" optional value={v.notes} error={e.notes} maxLength={800}
                  hint="Bijzondere wensen (bijv. extra hulp of een rolstoel) moeten door het gekozen bedrijf expliciet worden bevestigd. Niet elk voertuig is geschikt voor elke vervoersbehoefte. Bieders zien vóór boeking een versie zonder telefoonnummers, e-mailadressen of adressen." />
              </details>
              <div className="step-actions"><a className="btn btn-secondary" href="/rit-aanvragen" data-back>Vorige</a><button type="button" className="btn btn-primary" data-next>Volgende: contact</button></div>
            </fieldset>

            <fieldset className="step card" data-step="3">
              <legend>Stap 3 van 4: Contactgegevens</legend>
              <p className="small muted">Een account is niet nodig. We sturen een veilige link naar je e-mailadres om je aanvraag te bekijken. Je gegevens worden pas na boeking gedeeld met het gekozen taxibedrijf.</p>
              <Field name="name" label="Naam" value={v.name ?? ctx.user?.full_name} error={e.name} autoComplete="name" />
              <Field name="email" label="E-mailadres" type="email" value={v.email ?? ctx.user?.email} error={e.email} autoComplete="email" inputMode="email" />
              <Field name="phone" label="Telefoonnummer" type="tel" value={v.phone} error={e.phone} autoComplete="tel" inputMode="tel" hint="Zodat de chauffeur je op de dag van de rit kan bereiken." />
              <div className="step-actions"><button type="button" className="btn btn-secondary" data-prev>Vorige</button><button type="button" className="btn btn-primary" data-next>Volgende: controleren</button></div>
            </fieldset>

            <fieldset className="step card" data-step="4">
              <legend>Stap 4 van 4: Controleren en verzenden</legend>
              <div className="summary" id="summary" aria-live="polite"><p className="muted small">Controleer je gegevens.</p></div>
              <div className="sum-notice"><img src="/static/img/icons/info.svg" alt="" width={22} height={22} /><p><strong>Dit is nog geen boeking.</strong> Taxibedrijven kunnen bieden tot uiterlijk <span id="bid-deadline">{settings.booking_cutoff_hours} uur vóór de ophaaltijd (maximaal {settings.bidding_window_hours} uur na plaatsing)</span>. Daarna kies je zelf een aanbod en betaal je online.</p></div>
              <div className="sum-checks">
              <Check name="accept_terms" checked={v.accept_terms === 'ja'} error={e.accept_terms}>Ik ga akkoord met de <a href="/algemene-voorwaarden" target="_blank">algemene voorwaarden</a>, de <a href="/annuleringsvoorwaarden" target="_blank">annuleringsvoorwaarden</a> en de <a href="/privacyverklaring" target="_blank">privacyverklaring</a>.</Check>
              <Check name="marketing" checked={v.marketing === 'ja'}>Ik wil af en toe aanbiedingen en nieuws per e-mail ontvangen <span className="optional">(optioneel, altijd op te zeggen)</span>.</Check>
              </div>
              <div className="step-actions"><button type="button" className="btn btn-secondary" data-prev>Vorige</button><button type="submit" className="btn btn-primary">Ontvang prijsvoorstellen</button></div>
            </fieldset>
          </form>
        </div>
        <ReqInfo ctx={ctx} minLead={settings.min_lead_hours} geoConnected={geoConnected} />
      </div></section>}>
      {null as any}
    </Page>
  );
}

export function RequestSubmittedPage({ ctx, publicRef, needsVerification }: { ctx: Ctx; publicRef: string; needsVerification: boolean }) {
  return (
    <Page ctx={ctx} title="Aanvraag ontvangen" noindex wide={false}>
      <h1>Je aanvraag is ontvangen</h1>
      <p>Aanvraagnummer: <strong>{publicRef}</strong></p>
      {needsVerification ? (
        <Notice type="info"><p><strong>Bevestig je e-mailadres.</strong> We hebben je een e-mail gestuurd met een veilige link. Pas na bevestiging wordt je aanvraag zichtbaar voor taxibedrijven en start de biedtermijn.</p></Notice>
      ) : (
        <Notice type="ok"><p>Je aanvraag staat open voor biedingen. We mailen je zodra er een aanbod is.</p></Notice>
      )}
      <p>Een aanvraag is nog geen boeking. Je kiest zelf of en welk aanbod je boekt.</p>
      <p className="btn-row">{ctx.user ? <a className="btn btn-primary" href="/mijn">Naar mijn aanvragen</a> : null}<a className="btn btn-secondary" href="/">Naar de homepage</a></p>
    </Page>
  );
}
