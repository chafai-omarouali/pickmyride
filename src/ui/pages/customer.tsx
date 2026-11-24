import { ReplacementPanel } from '../support.tsx';
import type { Ctx } from '../../lib/http.ts';
import { Page, Csrf, Notice, Status, Euro, Field } from '../layout.tsx';
import { formatDateTime, formatTime, formatRelative } from '../../lib/time.ts';
import { SERVICE_OPTIONS } from '../../domain/bids.ts';
import { describeSeats } from '../../lib/seats.ts';
import { ConversationPanel } from '../conversation.tsx';
import { RatingSummary, CriteriaBreakdown, ReviewForm, ReviewItem } from '../reviews.tsx';

const svc = (k: string) => SERVICE_OPTIONS.find(([key]) => key === k)?.[1] || k;

export function MyRequestsPage({ ctx, groups }: { ctx: Ctx; groups: any[] }) {
  return (
    <Page ctx={ctx} title="Mijn aanvragen" area="customer">
      <div className="page-head"><h1>Mijn aanvragen</h1><a className="btn btn-primary" href="/rit-aanvragen">Nieuwe rit aanvragen</a></div>
      {!groups.length && <div className="card"><p>Je hebt nog geen aanvragen.</p></div>}
      <div className="stack">{groups.map(g => (
        <a key={g.id} href={`/mijn/aanvragen/${g.id}`} className="card" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
          <div className="page-head" style={{ marginBottom: '.5rem' }}><h2 style={{ fontSize: '1.1rem', margin: 0 }}>{g.public_ref} · {g.trip_type === 'retour' ? 'Retour' : 'Enkele reis'}</h2><span className="small muted">Geplaatst {formatDateTime(g.created_at)}</span></div>
          {g.legs.map((l: any) => (
            <p key={l.id} style={{ margin: '.3rem 0' }}><strong>{l.leg === 'heen' ? 'Heenrit' : 'Terugrit'}:</strong> {formatDateTime(l.pickup_at)}, {l.pickup_city} → {l.dropoff_city} · <Status s={l.status} />
              {l.booking_number ? <> · Boeking <strong>{l.booking_number}</strong></> : l.status === 'open' ? <> · {l.offers} {l.offers === 1 ? 'aanbod' : 'aanbiedingen'}</> : null}</p>
          ))}
        </a>
      ))}</div>
    </Page>
  );
}

function OfferCard({ ctx, o, leg, reserved, hidden }: { ctx: Ctx; o: any; leg: any; reserved: boolean; hidden?: boolean }) {
  return (
    <li hidden={hidden} className="offer offer-item" data-price={o.total_price_cents} data-rating={o.rating_count ? o.rating_avg : ''}>
      <div>
        <h3 style={{ marginBottom: '.2rem' }}>{o.trade_name}</h3>
        <p className="small" style={{ margin: 0 }}><RatingSummary s={o} /></p>
        <ul className="facts">
          <li><strong>{o.category_name}</strong></li>
          <li>Tot <strong>{o.max_passengers}</strong> personen, <strong>{o.max_large_bags}</strong> grote koffers</li>
          <li>Wachttijd inbegrepen: <strong>{o.included_wait_minutes} min</strong></li>
          <li>Geldig tot <strong>{formatDateTime(o.valid_until)}</strong></li>
        </ul>
        <details className="more" style={{ marginTop: '.5rem' }}>
          <summary>Voorwaarden en inbegrepen diensten</summary>
          <div className="small" style={{ marginTop: '.5rem' }}>
            {o.included_services?.length > 0 && <p><strong>Inbegrepen:</strong> {o.included_services.map(svc).join(', ')}</p>}
            <p><strong>Bij vluchtvertraging:</strong> {o.flight_delay_policy}</p>
            <p><strong>Annuleringsvoorwaarden:</strong> {o.cancellation_policy}</p>
            {o.note && <p><strong>Toelichting van het bedrijf:</strong> {o.note}</p>}
            {o.rating_count > 0 && <><p style={{ marginBottom: '.2rem' }}><strong>Beoordelingen per onderdeel</strong> <span className="muted">(gemiddelde van {o.rating_count})</span></p><CriteriaBreakdown source={o} prefix="avg_" /></>}
          </div>
        </details>
      </div>
      <div className="offer-side">
        <div className="price">{<Euro c={o.total_price_cents} />}<small>Totaalprijs, inclusief vooraf bekende kosten</small></div>
        {o.status === 'actief' && leg.status === 'open' && !reserved && (
          <form method="post" action={`/mijn/aanbod/${o.id}/kiezen`}><Csrf ctx={ctx} /><button className="btn btn-primary btn-block" type="submit">Kies dit aanbod</button></form>
        )}
        {o.status === 'gereserveerd' && <span className="badge badge-warn">Gereserveerd voor jou</span>}
      </div>
    </li>
  );
}

export function RequestDetailPage({ ctx, group, legs, maxShown, sort, showAll, unread }: { ctx: Ctx; group: any; legs: any[]; maxShown: number; sort: string; showAll: boolean; unread?: Record<string, number> }) {
  return (
    <Page ctx={ctx} title={`Aanvraag ${group.public_ref}`} area="customer">
      <div className="page-head"><h1>Aanvraag {group.public_ref}</h1><span className="muted">{group.trip_type === 'retour' ? 'Retour — twee afzonderlijke ritten' : 'Enkele reis'}</span></div>
      {group.trip_type === 'retour' && <Notice type="info"><p>Heen- en terugrit zijn aparte ritten met eigen aanbiedingen, boeking en betaling. Ze kunnen door verschillende taxibedrijven worden uitgevoerd.</p></Notice>}
      {legs.map(l => {
        const hasRatings = l.offers.some((o: any) => o.rating_count > 0);
        let offers = [...l.offers];
        if (sort === 'beoordeling' && hasRatings) offers.sort((a, b) => (b.rating_count ? Number(b.rating_avg) : -1) - (a.rating_count ? Number(a.rating_avg) : -1) || a.total_price_cents - b.total_price_cents);
        return (
          <section key={l.id} className="leg" aria-labelledby={`leg-${l.id}`}>
            <div className="leg-head"><h2 id={`leg-${l.id}`}>{l.leg === 'heen' ? 'Heenrit' : 'Terugrit'}</h2><Status s={l.status} /></div>
            <p className="trip-when">{formatDateTime(l.pickup_at)}</p>
            <p className="trip-route"><span>{l.pickup_address}</span><span className="line" aria-hidden="true" /><span className="sr">naar</span><span>{l.dropoff_address}</span></p>
            {l.stop_address && <p className="small muted" style={{ margin: '.2rem 0 0' }}>Via {l.stop_address}</p>}
            <ul className="trip-meta" style={{ marginBottom: '1.2rem' }}>
              <li>{l.passengers} personen</li><li>{l.large_bags} grote koffers</li><li>{l.small_bags} kleine koffers</li><li>{l.category_name}</li>
              {describeSeats(l) && <li>{describeSeats(l)}</li>}{l.flight_number && <li>Vlucht {l.flight_number}</li>}
            </ul>
            {l.status === 'concept' && <Notice type="warn"><p>Bevestig je e-mailadres via de link in je e-mail. Daarna wordt deze rit zichtbaar voor taxibedrijven.</p></Notice>}
            {l.booking && l.booking.status === 'geannuleerd' && <Notice type="warn"><p>De boeking <strong>{l.booking.booking_number}</strong> bij {l.booking.trade_name} is <strong>geannuleerd</strong>. <a href={`/mijn/boekingen/${l.booking.id}`}>Bekijk details en terugbetaling</a></p></Notice>}
            {l.booking && l.booking.status !== 'geannuleerd' && <Notice type="ok"><p>Geboekt bij <strong>{l.booking.trade_name}</strong> voor <Euro c={l.booking.total_price_cents} />. Boekingsnummer <strong>{l.booking.booking_number}</strong>. <a href={`/mijn/boekingen/${l.booking.id}`}>Bekijk boeking</a>{unread?.[l.booking.id] ? <> · <a href={`/mijn/boekingen/${l.booking.id}#contact`}><strong>{`${unread[l.booking.id]} nieuw${unread[l.booking.id] === 1 ? ' bericht' : 'e berichten'}`}</strong></a></> : null}</p></Notice>}
            {l.reservation && !l.booking && (
              <Notice type="warn">
                <p>Je hebt een aanbod gereserveerd tot <strong>{formatTime(l.reservation.expires_at)}</strong> ({formatRelative(l.reservation.expires_at)}). Je boeking is pas definitief na een bevestigde betaling.</p>
                <div className="btn-row">
                  {l.reservation.checkout_url && <a className="btn btn-primary btn-small" href={l.reservation.checkout_url}>Verder met betalen</a>}
                  <form method="post" action={`/mijn/reservering/${l.reservation.id}/annuleren`}><Csrf ctx={ctx} /><button className="btn btn-secondary btn-small" type="submit">Reservering annuleren</button></form>
                </div>
              </Notice>
            )}
            {l.status === 'open' && !l.booking && (<>
              <p className="small muted">Taxibedrijven kunnen bieden tot {formatDateTime(l.bidding_closes_at)}. Boeken kan tot {formatDateTime(l.booking_cutoff_at)}.</p>
              {!l.offers.length ? <p>Er zijn nog geen aanbiedingen. We mailen je zodra er een aanbod binnenkomt.</p> : (
                <div data-offers data-limit={maxShown} data-all={showAll ? '1' : '0'}>
                  <form method="get" className="btn-row" style={{ marginBottom: '.8rem' }}>
                    <label htmlFor={`sort-${l.id}`} className="small">Sorteren op</label>
                    <select id={`sort-${l.id}`} name="sorteer" data-sort defaultValue={sort} style={{ width: 'auto', minHeight: 42 }}>
                      <option value="prijs">Laagste prijs</option>
                      {hasRatings && <option value="beoordeling">Beoordeling</option>}
                    </select>
                    <noscript><button className="btn btn-secondary btn-small" type="submit">Toepassen</button></noscript>
                    <span className="small muted">{l.offers.length} {l.offers.length === 1 ? 'aanbod' : 'aanbiedingen'}</span>
                  </form>
                  <ul className="offers">
                    {offers.map((o: any, i: number) => <OfferCard key={o.id} hidden={!showAll && i >= maxShown} ctx={ctx} o={o} leg={l} reserved={!!l.reservation} />)}
                  </ul>
                  {offers.length > maxShown && !showAll && <p style={{ marginTop: '1rem' }}><a className="btn btn-secondary" data-show-all href={`?alle=1&sorteer=${sort}`}>{`Toon alle ${offers.length} aanbiedingen`}</a></p>}
                </div>
              )}
            </>)}
          </section>
        );
      })}
    </Page>
  );
}
export function PaymentStatusPage({ ctx, payment, groupId }: { ctx: Ctx; payment: any; groupId: string }) {
  const pending = payment.status === 'in_behandeling';
  return (
    <Page ctx={ctx} title="Betaling" area="customer" wide={false}>
      {pending && <meta httpEquiv="refresh" content="3" />}
      <h1>Status van je betaling</h1>
      {payment.is_simulated && <Notice type="warn"><p><strong>DEMO:</strong> dit is een gesimuleerde betaling. Er is geen geld afgeschreven.</p></Notice>}
      {pending && <Notice type="info"><p>We wachten op de bevestiging van de betaalprovider. Deze pagina ververst automatisch. Je boeking is pas definitief na deze bevestiging.</p></Notice>}
      {payment.status === 'geslaagd' && payment.booking_id && <Notice type="ok"><p>Je betaling is bevestigd en je rit is geboekt. Boekingsnummer: <strong>{payment.booking_number}</strong>.</p><p><a className="btn btn-primary" href={`/mijn/boekingen/${payment.booking_id}`}>Bekijk je boeking</a></p></Notice>}
      {payment.status === 'geslaagd' && !payment.booking_id && <Notice type="warn"><p>Je betaling is ontvangen, maar het aanbod was inmiddels niet meer beschikbaar. Er is <strong>geen boeking</strong> gemaakt. Je krijgt het volledige bedrag terug; de beheerder neemt contact met je op.</p></Notice>}
      {payment.status === 'mislukt' && <Notice type="fout"><p>De betaling is niet gelukt. Er is geen boeking gemaakt. Als het aanbod nog geldig is, kun je het opnieuw kiezen.</p></Notice>}
      <p><a href={`/mijn/aanvragen/${groupId}`}>Terug naar je aanvraag</a></p>
    </Page>
  );
}

export function BookingDetailPage({ ctx, booking: b, history, payment, review, reviewErrors, reviewValues, conv, help }: { ctx: Ctx; booking: any; history: any[]; payment: any; review?: any; reviewErrors?: any; reviewValues?: any; conv?: any; help?: any }) {
  return (
    <Page ctx={ctx} title={`Boeking ${b.booking_number}`} area="customer">
      <div className="page-head"><h1>Boeking {b.booking_number}</h1><Status s={b.status} /></div>
      <div className="grid grid-2">
        <section className="card">
          <h2>Rit</h2>
          <div className="summary"><dl>
            <dt>Wanneer</dt><dd>{formatDateTime(b.pickup_at)}</dd>
            <dt>Van</dt><dd>{b.pickup_address}</dd>
            {b.stop_address && <><dt>Via</dt><dd>{b.stop_address}</dd></>}
            <dt>Naar</dt><dd>{b.dropoff_address}</dd>
            {b.flight_number && <><dt>Vlucht</dt><dd>{b.flight_number}</dd></>}
            <dt>Reizigers</dt><dd>{`${b.passengers} ${b.passengers === 1 ? 'persoon' : 'personen'}, ${b.large_bags} grote en ${b.small_bags} kleine koffers`}</dd>
            {describeSeats(b) && <><dt>Kinderzitjes</dt><dd>{describeSeats(b)}</dd></>}
            <dt>Vervoerder</dt><dd>{b.trade_name}</dd>
            <dt>Voertuig</dt><dd>{b.category_name}</dd>
            <dt>Wachttijd</dt><dd>{b.included_wait_minutes} minuten inbegrepen</dd>
          </dl></div>
        </section>
        <section className="card">
          <h2>Betaling</h2>
          <p className="price" style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--navy-900)', margin: 0 }}><Euro c={b.total_price_cents} /></p>
          <p className="small muted">Totaalprijs</p>
          {b.status === 'geannuleerd' && <Notice type="warn"><p>Deze boeking is geannuleerd{b.cancellation_reason ? `: ${b.cancellation_reason}` : ''}.</p></Notice>}
          {payment && payment.refunded_cents > 0 && <p>Terugbetaald: <Euro c={payment.refunded_cents} /></p>}
          {payment && <p>Status: <Status s={payment.status} />{payment.is_simulated && <> <span className="badge badge-demo">DEMO — gesimuleerd</span></>}</p>}
          <h3 style={{ marginTop: '1rem' }}>Voorwaarden</h3>
          <p className="small"><strong>Bij vluchtvertraging:</strong> {b.flight_delay_policy}</p>
          <p className="small"><strong>Annulering:</strong> {b.cancellation_policy}</p>
        </section>
      </div>
      {help && b.status !== 'geannuleerd' && <div style={{ marginTop: '1rem' }}><ReplacementPanel ctx={ctx} info={help} basePath={`/mijn/boekingen/${b.id}`} viewer="customer" bookingNumber={b.booking_number} /></div>}
      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Status van je rit</h2>
        <p className="small muted">Dit zijn statussen die het taxibedrijf doorgeeft. Er is geen live GPS-tracking.</p>
        <ol className="timeline">{history.map((h, i) => <li key={i}><Status s={h.to_status} /> <span className="small muted">{formatDateTime(h.created_at)}</span>{h.note && h.to_status !== 'chauffeur_toegewezen' ? <div className="small muted">{h.note}</div> : null}</li>)}</ol>
      </section>
      {conv && <div style={{ marginTop: '1rem' }}><ConversationPanel ctx={ctx} conv={conv} viewer="customer" otherName={b.trade_name} basePath={`/mijn/boekingen/${b.id}`} notice={ctx.flash?.area === 'contact' ? ctx.flash : null} /></div>}
      <section className="card" style={{ marginTop: '1rem' }} id="beoordeling">
        <h2>Beoordeling</h2>
        {reviewErrors?.form && (review || b.status !== 'afgerond') && <Notice type="fout"><p>{reviewErrors.form}</p></Notice>}
        {review ? <><p className="small muted">Je beoordeling van {b.trade_name}:</p><ReviewItem r={review} showStatus /></>
          : b.status === 'afgerond' ? <><p>Hoe was je rit met <strong>{b.trade_name}</strong>?</p><ReviewForm ctx={ctx} bookingId={b.id} errors={reviewErrors} values={reviewValues} /></>
          : <p className="muted">Na afloop van de rit kun je {b.trade_name} beoordelen op communicatie, klantvriendelijkheid, comfort & hygiëne, betrouwbaarheid en rijgedrag & veiligheid.</p>}
      </section>
      <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Wijzigen of annuleren</h2>
        <p>{`Online wijzigen en annuleren worden in de volgende fase gebouwd. Neem tot die tijd contact op met de klantenservice en vermeld je boekingsnummer ${b.booking_number}.`}</p>
        <p className="small muted">Een bevestigde rit wordt nooit stilzwijgend gewijzigd. Een wijziging kan een nieuw prijsvoorstel vereisen.</p>
      </section>
    </Page>
  );
}

export function LoginPage({ ctx, error, email, linkSent, next }: { ctx: Ctx; error?: string; email?: string; linkSent?: boolean; next?: string }) {
  return (
    <Page ctx={ctx} title="Inloggen" noindex wide={false}>
      <h1>Inloggen</h1>
      {error && <Notice type="fout"><p>{error}</p></Notice>}
      {linkSent && <Notice type="ok"><p>Als er een klantaccount bij dit e-mailadres hoort, hebben we een inloglink gestuurd. De link is 48 uur geldig.</p></Notice>}
      <div className="grid grid-2">
        <form method="post" action="/inloggen" className="card" noValidate>
          <Csrf ctx={ctx} /><input type="hidden" name="terug" value={next || ''} />
          <h2 style={{ fontSize: '1.2rem' }}>Met wachtwoord</h2>
          <p className="small muted">Voor taxibedrijven, beheerders en klanten met een wachtwoord.</p>
          <Field name="email" label="E-mailadres" type="email" value={email} autoComplete="username" />
          <Field name="password" label="Wachtwoord" type="password" autoComplete="current-password" />
          <button className="btn btn-primary btn-block" type="submit">Inloggen</button>
        </form>
        <form method="post" action="/inloglink" className="card" noValidate>
          <Csrf ctx={ctx} />
          <h2 style={{ fontSize: '1.2rem' }}>Inloglink per e-mail</h2>
          <p className="small muted">Heb je een rit aangevraagd zonder wachtwoord? Vraag een nieuwe veilige link aan.</p>
          <Field id="f-link-email" name="email" label="E-mailadres" type="email" autoComplete="email" />
          <button className="btn btn-secondary btn-block" type="submit">Stuur mij een inloglink</button>
        </form>
      </div>
    </Page>
  );
}
