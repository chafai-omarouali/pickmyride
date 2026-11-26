import type { Ctx } from '../../lib/http.ts';
import { Page, Csrf, Notice, Status, Euro, Field, TextArea, Select, TimeSelect } from '../layout.tsx';
import { reasonLabel, COST_BEARERS } from '../../domain/replacement.ts';
import { formatTime } from '../../lib/time.ts';
import { formatDateTime, formatDate } from '../../lib/time.ts';
import { formatEuro } from '../../lib/money.ts';
import { label } from '../../domain/status.ts';
import { ReviewItem } from '../reviews.tsx';

export function AdminDashboardPage({ ctx, k }: { ctx: Ctx; k: any }) {
  const tiles: [string, number, string, boolean?][] = [
    ['Spoedmeldingen vervangend vervoer', k.spoedmeldingen, '/beheer/vervangend-vervoer', k.spoedmeldingen > 0],
    ['Nieuwe aanvragen (24 uur)', k.nieuwe_aanvragen, '/beheer/aanvragen'], ['Open aanvragen zonder aanbod', k.zonder_aanbod, '/beheer/aanvragen', k.zonder_aanbod > 0],
    ['Openstaande biedingen', k.open_biedingen, '/beheer/aanvragen'], ['Bevestigde boekingen', k.bevestigde_boekingen, '/beheer/aanvragen'],
    ['Komende ritten (48 uur)', k.komende_ritten, '/beheer/aanvragen'], ['Probleemritten', k.probleemritten, '/beheer/aanvragen', k.probleemritten > 0],
    ['Annuleringen', k.annuleringen, '/beheer/aanvragen'], ['Geslaagde betalingen', k.betalingen, '/beheer/aanvragen'],
    ['Betalingen die aandacht vragen', k.betalingen_aandacht, '/beheer/aanvragen', k.betalingen_aandacht > 0], ['Terugbetalingen open', k.terugbetalingen_open, '/beheer/aanvragen', k.terugbetalingen_open > 0],
    ['Te beoordelen taxibedrijven', k.te_beoordelen, '/beheer/bedrijven', k.te_beoordelen > 0], ['Documenten verlopen binnen 30 dagen', k.documenten_verlopen, '/beheer/bedrijven', k.documenten_verlopen > 0],
  ];
  return (
    <Page ctx={ctx} title="Beheer" area="admin">
      <div className="page-head"><h1>Beheeromgeving</h1>
        <div className="btn-row"><a className="btn btn-secondary btn-small" href="/beheer/export/boekingen.csv">Boekingen (CSV)</a><a className="btn btn-secondary btn-small" href="/beheer/export/aanvragen.csv">Aanvragen (CSV)</a></div></div>
      <div className="kpis">{tiles.map(([t, n, h, warn]) => <a key={t} className={'kpi' + (warn ? ' attention' : '')} href={h}><strong>{n}</strong><span>{t}</span></a>)}</div>
      <div style={{ marginTop: '1.4rem' }} /><Notice type="info"><p className="small">Annuleringen, terugbetalingen starten en klachten behandelen worden in fase 3 als schermen toegevoegd. Het datamodel en de statusregels daarvoor zijn al aanwezig.</p></Notice>
    </Page>
  );
}

export function AdminCompaniesPage({ ctx, rows }: { ctx: Ctx; rows: any[] }) {
  return (
    <Page ctx={ctx} title="Taxibedrijven" area="admin">
      <h1>Taxibedrijven</h1>
      <div className="table-wrap"><table><thead><tr><th>Bedrijf</th><th>KvK</th><th>Aangemeld</th><th>Documenten te controleren</th><th>Status</th></tr></thead>
        <tbody>{rows.map(c => <tr key={c.id}><td><a href={`/beheer/bedrijven/${c.id}`}>{c.trade_name}</a> {c.is_demo && <span className="badge badge-demo">fictief</span>}</td><td>{c.kvk_number}</td><td>{formatDate(c.created_at)}</td><td>{c.docs_open}</td><td><Status s={c.status} /></td></tr>)}</tbody></table></div>
    </Page>
  );
}

export function AdminCompanyPage({ ctx, company: c, docs, areas, cats, history, photos = [] }: { ctx: Ctx; company: any; docs: any[]; areas: any[]; cats: any[]; history: any[]; photos?: any[] }) {
  const actions: [string, string, string][] = c.status === 'in_beoordeling' ? [['actief', 'Goedkeuren en activeren', 'btn-primary'], ['afgewezen', 'Afwijzen', 'btn-danger']]
    : c.status === 'actief' ? [['geschorst', 'Schorsen', 'btn-danger']] : c.status === 'geschorst' ? [['actief', 'Schorsing opheffen', 'btn-primary']] : [['in_beoordeling', 'Opnieuw in beoordeling nemen', 'btn-secondary']];
  return (
    <Page ctx={ctx} title={c.trade_name} area="admin">
      <div className="page-head"><h1>{c.trade_name} {c.is_demo && <span className="badge badge-demo">fictief</span>}</h1><Status s={c.status} /></div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card"><h2>Gegevens</h2>
          <div className="summary"><dl>
            <dt>Statutaire naam</dt><dd>{c.legal_name}</dd><dt>KvK</dt><dd>{c.kvk_number}</dd><dt>Btw-id</dt><dd>{c.vat_number || '—'}</dd>
            <dt>Adres</dt><dd>{c.address_street}, {c.address_postcode} {c.address_city}</dd><dt>Contact</dt><dd>{c.contact_name} · {c.email} · {c.phone}</dd>
            <dt>Vergunning</dt><dd>{c.license_number || '—'}{c.license_expires_on ? ` (geldig tot ${formatDate(c.license_expires_on)})` : ''}</dd>
            <dt>Werkgebied</dt><dd>{areas.map(a => a.name).join(', ') || '—'}</dd>
            <dt>Buitenland</dt><dd>{c.serves_abroad ? 'Rijdt ook naar BE, DE, FR, LU' : 'Alleen Nederland'}{' '}
              <form method="post" action={`/beheer/bedrijven/${c.id}/buitenland`} style={{ display: 'inline' }}><Csrf ctx={ctx} /><input type="hidden" name="on" value={c.serves_abroad ? 'nee' : 'ja'} /><button className="linkbtn" type="submit">{c.serves_abroad ? 'Uitzetten' : 'Aanzetten'}</button></form></dd><dt>Voertuigen</dt><dd>{cats.map(x => `${x.name_nl}: ${x.max_passengers} pers., ${x.max_large_bags} koffers`).join('; ') || '—'}</dd>
            <dt>Partnerovereenkomst</dt><dd>{c.partner_agreement_version} — akkoord {c.partner_agreement_accepted_at ? formatDateTime(c.partner_agreement_accepted_at) : '—'}</dd>
            <dt>Laatste beoordeling</dt><dd>{c.reviewed_at ? `${formatDateTime(c.reviewed_at)} door ${c.reviewer_name}${c.review_note ? ` — "${c.review_note}"` : ''}` : 'Nog niet beoordeeld'}</dd>
          </dl></div>
        </section>
        <section className="stack">
          <div className="card"><h2>Status wijzigen</h2>
            <p className="small muted">Elke statuswijziging wordt in het auditlog vastgelegd. Bij schorsen worden lopende biedingen ingetrokken.</p>
            {actions.map(([to, t, cls]) => (
              <form key={to} method="post" action={`/beheer/bedrijven/${c.id}/status`} style={{ marginBottom: '.8rem' }}><Csrf ctx={ctx} /><input type="hidden" name="to" value={to} />
                {to !== 'actief' && <Field name="note" label={`Reden (${t.toLowerCase()})`} />}
                {to === 'actief' && docs.some(d => d.verification_status !== 'goedgekeurd') && <Notice type="warn"><p className="small">Niet alle documenten zijn goedgekeurd.</p></Notice>}
                <button className={'btn ' + cls} type="submit">{t}</button></form>))}
          </div>
          <div className="card"><h2>Documenten</h2>
            {!docs.length && <p>Geen documenten geüpload.</p>}
            {docs.map(d => (
              <div key={d.id} style={{ borderBottom: '1px solid var(--line)', padding: '.6rem 0' }}>
                <p style={{ margin: 0 }}><a href={`/documenten/${d.id}`}>{d.original_filename}</a> · {label(d.doc_type)} · {(d.size_bytes / 1024).toFixed(0)} kB{d.expires_on ? ` · verloopt ${formatDate(d.expires_on)}` : ''}</p>
                <p className="small" style={{ margin: '.2rem 0' }}><Status s={d.verification_status} />{d.verified_at && <> door {d.verifier_name} op {formatDateTime(d.verified_at)}{d.verification_note ? ` — ${d.verification_note}` : ''}</>}</p>
                <form method="post" action={`/beheer/documenten/${d.id}/controle`} className="btn-row"><Csrf ctx={ctx} />
                  <input type="text" name="note" placeholder="Notitie (optioneel)" aria-label="Notitie" style={{ flex: '1 1 160px', minHeight: 40 }} />
                  <button className="btn btn-secondary btn-small" name="verdict" value="goedgekeurd" type="submit">Goedkeuren</button>
                  <button className="btn btn-danger btn-small" name="verdict" value="afgekeurd" type="submit">Afkeuren</button></form>
              </div>))}
          </div>
          <div className="card" id="fotos"><h2>Foto's</h2>
            {!photos.length && <p>Dit bedrijf heeft nog geen foto's toegevoegd.</p>}
            <ul className="ph-admin">{photos.map(p => (
              <li key={p.id} className={p.hidden_by_staff ? 'is-hidden' : ''}>
                <a href={`/bedrijfsfoto/${p.id}`} target="_blank" rel="noopener"><img src={`/bedrijfsfoto/${p.id}`} alt={p.caption || 'Bedrijfsfoto'} loading="lazy" width={p.width || 800} height={p.height || 600} /></a>
                <div>
                  <p className="small" style={{ margin: 0 }}>{p.caption || <span className="muted">Geen omschrijving</span>} · {formatDateTime(p.created_at)}</p>
                  {p.hidden_by_staff && <p className="small" style={{ margin: '.2rem 0' }}><span className="badge badge-warn">Verborgen</span> {p.hidden_reason}</p>}
                  <form method="post" action={`/beheer/fotos/${p.id}/zichtbaarheid`} className="btn-row"><Csrf ctx={ctx} />
                    {p.hidden_by_staff
                      ? <><input type="hidden" name="hidden" value="nee" /><button className="btn btn-secondary btn-small" type="submit">Weer tonen</button></>
                      : <><input type="hidden" name="hidden" value="ja" /><input type="text" name="reason" placeholder="Reden (zichtbaar voor het bedrijf)" aria-label="Reden" style={{ flex: '1 1 160px', minHeight: 40 }} /><button className="btn btn-danger btn-small" type="submit">Verbergen</button></>}
                  </form>
                </div>
              </li>))}</ul>
          </div>
          <div className="card"><h2>Statusgeschiedenis</h2><ol className="timeline">{history.map(h => <li key={h.id}><Status s={h.to_status} /> <span className="small muted">{formatDateTime(h.created_at)} · {h.full_name || h.actor_role}</span>{h.note && <div className="small">{h.note}</div>}</li>)}</ol></div>
        </section>
      </div>
    </Page>
  );
}

export function AdminRequestsPage({ ctx, rows }: { ctx: Ctx; rows: any[] }) {
  return (
    <Page ctx={ctx} title="Ritten en biedingen" area="admin">
      <h1>Ritten en biedingen</h1>
      <div className="table-wrap"><table><thead><tr><th>Aanvraag</th><th>Ophalen</th><th>Route</th><th>Biedingen</th><th>Status</th><th>Boeking</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id}><td><a href={`/beheer/aanvragen/${r.id}`}>{r.public_ref}</a> · {r.leg}{r.is_demo && <> <span className="badge badge-demo">fictief</span></>}</td><td>{formatDateTime(r.pickup_at)}</td><td>{r.pickup_city} → {r.dropoff_city}</td><td>{r.bids}</td><td><Status s={r.status} /></td><td>{r.booking_id ? <a href={`/beheer/boekingen/${r.booking_id}`}>{r.booking_number}</a> : '—'}</td></tr>)}</tbody></table></div>
    </Page>
  );
}

export function AdminRequestPage({ ctx, ride: r, bids, history }: { ctx: Ctx; ride: any; bids: any[]; history: any[] }) {
  return (
    <Page ctx={ctx} title={`Aanvraag ${r.public_ref}`} area="admin">
      <div className="page-head"><h1>{r.public_ref} · {r.leg}</h1><Status s={r.status} /></div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card"><h2>Rit</h2><div className="summary"><dl>
          <dt>Ophalen</dt><dd>{formatDateTime(r.pickup_at)}</dd><dt>Van</dt><dd>{r.pickup_address}</dd><dt>Naar</dt><dd>{r.dropoff_address}</dd>
          <dt>Klant</dt><dd>{r.contact_name} · {r.contact_email} · {r.contact_phone}</dd><dt>Reizigers</dt><dd>{r.passengers} pers., {r.large_bags} koffers</dd>
          <dt>Biedtermijn tot</dt><dd>{formatDateTime(r.bidding_closes_at)}</dd><dt>Laatste boekingsmoment</dt><dd>{formatDateTime(r.booking_cutoff_at)}</dd></dl></div></section>
        <section className="card"><h2>Biedingen</h2>
          {!bids.length ? <p>Nog geen biedingen.</p> : <div className="table-wrap"><table><thead><tr><th>Bedrijf</th><th>Prijs</th><th>Commissie</th><th>Status</th></tr></thead>
            <tbody>{bids.map(b => <tr key={b.id}><td>{b.trade_name}</td><td><Euro c={b.total_price_cents} /></td><td><Euro c={b.commission_cents} /></td><td><Status s={b.status} /></td></tr>)}</tbody></table></div>}
        </section>
      </div>
      <section className="card" style={{ marginTop: '1rem' }}><h2>Geschiedenis</h2><ol className="timeline">{history.map(h => <li key={h.id}>{h.entity_type}: {h.from_status ? label(h.from_status) + ' → ' : ''}<strong>{label(h.to_status)}</strong> <span className="small muted">{formatDateTime(h.created_at)} · {h.actor_role}</span>{h.note && <div className="small">{h.note}</div>}</li>)}</ol></section>
    </Page>
  );
}

export function AdminSettingsPage({ ctx, settings, rules }: { ctx: Ctx; settings: any[]; rules: any[] }) {
  return (
    <Page ctx={ctx} title="Instellingen" area="admin">
      <h1>Platforminstellingen</h1>
      <p className="muted">Wijzigingen gelden voor nieuwe aanvragen en biedingen en worden in het auditlog vastgelegd.</p>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card"><h2>Termijnen en weergave</h2>
          {settings.map(s => (
            <form key={s.key} method="post" action="/beheer/instellingen" style={{ borderBottom: '1px solid var(--line)', padding: '.6rem 0' }}><Csrf ctx={ctx} /><input type="hidden" name="key" value={s.key} />
              <label className="label" htmlFor={'s-' + s.key}>{s.description}</label>
              <div className="btn-row"><input id={'s-' + s.key} name="value" type="text" defaultValue={typeof s.value === 'string' ? s.value : JSON.stringify(s.value)} style={{ flex: '1 1 140px' }} />
                <button className="btn btn-secondary btn-small" type="submit">Opslaan</button></div>
              <p className="small muted" style={{ margin: '.2rem 0 0' }}>Laatst gewijzigd {formatDateTime(s.updated_at)}</p>
            </form>))}
        </section>
        <section className="card"><h2>Commissie</h2>
          <ul>{rules.map(r => <li key={r.id}>{r.active ? <strong>Actief: </strong> : null}{r.name} — {(r.percent_bp / 100).toLocaleString('nl-NL')}%{r.fixed_cents ? ` + ${formatEuro(r.fixed_cents)}` : ''}{r.min_cents ? `, min. ${formatEuro(r.min_cents)}` : ''} {r.is_demo && <span className="badge badge-demo">DEMO</span>} <span className="small muted">({formatDate(r.created_at)})</span></li>)}</ul>
          <Notice type="warn"><p className="small">De huidige 12% is uitsluitend een demo-instelling. Leg de definitieve commissie en btw-behandeling vast met een boekhouder.</p></Notice>
          <form method="post" action="/beheer/commissie"><Csrf ctx={ctx} /><h3>Nieuwe commissieregel activeren</h3>
            <Field name="name" label="Naam" /><div className="row row-3"><Field name="percent" label="Percentage" inputMode="decimal" placeholder="12" /><Field name="fixed" label="Vast bedrag (€)" value="0" /><Field name="min" label="Minimum (€)" value="0" /></div>
            <div className="check"><input type="checkbox" id="is_demo" name="is_demo" value="ja" /><label htmlFor="is_demo">Markeren als demo-instelling</label></div>
            <button className="btn btn-primary" type="submit">Activeren</button>
            <p className="small muted">Bestaande biedingen en boekingen behouden de regel waarmee ze zijn ingediend.</p></form>
        </section>
      </div>
    </Page>
  );
}

export function AuditPage({ ctx, rows }: { ctx: Ctx; rows: any[] }) {
  return (
    <Page ctx={ctx} title="Auditlog" area="admin">
      <h1>Auditlog</h1>
      <div className="table-wrap"><table><thead><tr><th>Tijd</th><th>Actor</th><th>Actie</th><th>Object</th><th>Details</th></tr></thead>
        <tbody>{rows.map(a => <tr key={a.id}><td className="small">{formatDateTime(a.created_at)}</td><td>{a.full_name || a.actor_role}</td><td><code>{a.action}</code></td><td className="small">{a.entity_type} {a.entity_id?.slice(0, 8)}</td><td className="small"><code>{JSON.stringify(a.details).slice(0, 160)}</code></td></tr>)}</tbody></table></div>
    </Page>
  );
}

export function MailboxPage({ ctx, rows }: { ctx: Ctx; rows: any[] }) {
  return (
    <Page ctx={ctx} title="Ontwikkel-mailbox" noindex area={ctx.user?.role === 'admin' ? 'admin' : 'public'}>
      <h1>Ontwikkel-mailbox (demo)</h1>
      <Notice type="warn"><p>Deze berichten zijn <strong>niet verzonden</strong>. Ze staan alleen in de wachtrij (MAIL_MODE=outbox). Deze pagina bestaat uitsluitend in de demo-omgeving.</p></Notice>
      {rows.map(n => (
        <details key={n.id} className="card" style={{ marginBottom: '.6rem' }}>
          <summary><strong>{n.subject}</strong> <span className="small muted">→ {n.to_address} · {formatDateTime(n.created_at)} · {n.status}</span></summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '.92rem', marginTop: '.8rem' }} dangerouslySetInnerHTML={{ __html: escapeAndLink(n.body_text) }} />
        </details>
      ))}
    </Page>
  );
}
function escapeAndLink(s: string) {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
}

export function DemoCheckoutPage({ ctx, providerPaymentId, amountCents, status }: { ctx: Ctx; providerPaymentId: string; amountCents: number; status: string }) {
  return (
    <Page ctx={ctx} title="DEMO-betaalomgeving" noindex wide={false}>
      <div className="card" style={{ borderColor: '#f0d08f', borderWidth: 3 }}>
        <p><span className="badge badge-demo">DEMO — GEEN ECHTE BETALING</span></p>
        <h1>Gesimuleerde betaalomgeving</h1>
        <p>Deze pagina simuleert een externe betaalprovider. Er wordt <strong>geen geld</strong> afgeschreven en er worden geen betaalgegevens gevraagd of opgeslagen.</p>
        <p style={{ fontSize: '1.5rem', fontWeight: 800 }}>Te betalen: <Euro c={amountCents} /></p>
        <p className="small muted">Referentie: {providerPaymentId} · status bij provider: {status}</p>
        {status === 'open' ? (
          <div className="btn-row">
            <form method="post" action={`/demo-betaalomgeving/${providerPaymentId}`}><Csrf ctx={ctx} /><input type="hidden" name="outcome" value="paid" /><button className="btn btn-primary" type="submit">Simuleer geslaagde betaling</button></form>
            <form method="post" action={`/demo-betaalomgeving/${providerPaymentId}`}><Csrf ctx={ctx} /><input type="hidden" name="outcome" value="failed" /><button className="btn btn-danger" type="submit">Simuleer mislukte betaling</button></form>
          </div>
        ) : <Notice type="info"><p>Deze demo-betaling is al afgerond ({status}).</p></Notice>}
        <p className="small muted" style={{ marginTop: '1rem' }}>Na je keuze stuurt de demo-provider een ondertekende webhook naar het platform. Alleen die bevestiging leidt tot een boeking — niet deze pagina en niet de terugkeerpagina.</p>
      </div>
    </Page>
  );
}

export function AdminReviewsPage({ ctx, rows }: { ctx: Ctx; rows: any[] }) {
  return (
    <Page ctx={ctx} title="Beoordelingen" area="admin">
      <h1>Beoordelingen modereren</h1>
      <p className="muted">Scores en tekst kunnen niet worden gewijzigd. U kunt een beoordeling verbergen of terugzetten, altijd met reden. Elke actie staat in het auditlog.</p>
      {!rows.length && <div className="card"><p>Nog geen beoordelingen.</p></div>}
      {rows.map(r => (
        <div key={r.id} style={{ marginBottom: '1rem' }}>
          <p style={{ margin: '0 0 .3rem' }}><strong>{r.trade_name}</strong> <span className="small muted">· {r.moderator_name ? `laatst gemodereerd door ${r.moderator_name} op ${formatDateTime(r.moderated_at)}` : 'niet gemodereerd'}</span></p>
          <ReviewItem r={r} showStatus />
          <form method="post" action={`/beheer/beoordelingen/${r.id}`} className="btn-row" style={{ marginTop: '.5rem' }}><Csrf ctx={ctx} />
            <input type="text" name="reason" placeholder="Reden (verplicht)" aria-label="Reden voor moderatie" style={{ flex: '1 1 220px', minHeight: 42 }} required />
            {r.status !== 'verborgen' && <button className="btn btn-danger btn-small" name="to" value="verborgen" type="submit">Verbergen</button>}
            {r.status !== 'gepubliceerd' && <button className="btn btn-secondary btn-small" name="to" value="gepubliceerd" type="submit">Publiceren</button>}
          </form>
        </div>))}
    </Page>
  );
}

export function AdminBookingPage({ ctx, booking: b, messages, calls, history }: { ctx: Ctx; booking: any; messages: any[]; calls: any[]; history: any[] }) {
  const who = (r: string) => r === 'customer' ? `Klant (${b.contact_name})` : r === 'company' ? b.trade_name : 'PickMyRide';
  return (
    <Page ctx={ctx} title={`Boeking ${b.booking_number}`} area="admin">
      <div className="page-head"><h1>Boeking {b.booking_number}</h1><Status s={b.status} /></div>
      {b.case_id && <Notice type="warn"><p>{`Er is een melding vervangend vervoer bij deze boeking (${b.case_number}). `}<a href={`/beheer/vervangend-vervoer/${b.case_id}`}>Melding openen</a></p></Notice>}
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card"><h2>Rit</h2><div className="summary"><dl>
          <dt>Ophalen</dt><dd>{formatDateTime(b.pickup_at)}</dd><dt>Route</dt><dd>{b.pickup_city} → {b.dropoff_city}</dd>
          <dt>Vervoerder</dt><dd>{b.trade_name}</dd><dt>Klant</dt><dd>{b.contact_name} · {b.contact_email} · {b.contact_phone}</dd>
          <dt>Prijs</dt><dd><Euro c={b.total_price_cents} /> (commissie <Euro c={b.commission_cents} />)</dd>
          <dt>Contactvenster</dt><dd>{b.open ? 'Open' : 'Gesloten'}</dd></dl></div>
          <p className="small" style={{ marginTop: '1rem' }}><a href={`/beheer/aanvragen/${b.ride_id}`}>Aanvraag en biedingen bekijken</a></p>
          <h3 style={{ marginTop: '1rem' }}>Belgeschiedenis</h3>
          {!calls.length ? <p className="muted small">Geen gesprekken.</p> : <ul className="small">{calls.map(c => <li key={c.id}>{formatDateTime(c.created_at)} · door {c.initiated_by_role === 'customer' ? 'klant' : 'bedrijf'} · {c.status}{c.duration_s ? ` · ${c.duration_s} s` : ''}{c.is_simulated ? ' · demo' : ''}{c.failure_reason ? ` · ${c.failure_reason}` : ''}</li>)}</ul>}
          <h3 style={{ marginTop: '1rem' }}>Statusgeschiedenis</h3>
          <ol className="timeline">{history.map(h => <li key={h.id}><Status s={h.to_status} /> <span className="small muted">{formatDateTime(h.created_at)}</span></li>)}</ol>
        </section>
        <section className="card"><h2>Gesprek</h2>
          <p className="small muted">Alleen-lezen voor beheer. Verbergen kan bij misbruik of persoonsgegevens, altijd met reden; dit wordt vastgelegd in het auditlog.</p>
          {!messages.length && <p className="muted">Nog geen berichten.</p>}
          <ol className="chat">{messages.map(m => (
            <li key={m.id} className={'msg ' + (m.sender_role === 'system' ? 'msg-system' : m.sender_role === 'company' ? 'msg-mine' : 'msg-theirs')}>
              <span className="msg-meta">{who(m.sender_role)} · {formatDateTime(m.created_at)}</span>
              <span className="msg-body">{m.body}{m.hidden_at && <><br /><em className="small">{`Verborgen door ${m.hidden_by_name}: ${m.hidden_reason}`}</em></>}</span>
              {!m.hidden_at && m.sender_role !== 'system' && (
                <form method="post" action={`/beheer/berichten/${m.id}/verbergen`} className="btn-row" style={{ marginTop: '.3rem' }}><Csrf ctx={ctx} />
                  <input type="text" name="reason" placeholder="Reden" aria-label="Reden voor verbergen" style={{ minHeight: 36, flex: '1 1 140px' }} />
                  <button className="btn btn-danger btn-small" type="submit">Verbergen</button></form>
              )}
            </li>))}
          </ol>
        </section>
      </div>
    </Page>
  );
}

// ───────── Vervangend vervoer (24/7 klantenservice) ─────────
export function AdminCasesPage({ ctx, rows }: { ctx: Ctx; rows: any[] }) {
  const open = rows.filter(r => r.status === 'gemeld' || r.status === 'in_behandeling');
  return (
    <Page ctx={ctx} title="Vervangend vervoer" area="admin">
      <div className="page-head"><h1>Vervangend vervoer</h1>{open.length > 0 && <span className="badge badge-bad">{`${open.length} open`}</span>}</div>
      <p className="muted">Meldingen van klanten en taxibedrijven dat een rit niet (op tijd) doorgaat. Open meldingen staan bovenaan.</p>
      {rows.length === 0 ? <Notice type="info"><p>Er zijn nog geen meldingen.</p></Notice> :
      <div className="table-wrap"><table><thead><tr><th>Melding</th><th>Gemeld</th><th>Ophalen</th><th>Boeking</th><th>Reden</th><th>Oorspronkelijk</th><th>Vervanger</th><th>Status</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.id} className={r.status === 'gemeld' ? 'row-urgent' : undefined}>
          <td><a href={`/beheer/vervangend-vervoer/${r.id}`}>{r.case_number}</a> {r.is_demo && <span className="badge badge-demo">fictief</span>}</td>
          <td>{formatDateTime(r.reported_at)}<div className="small muted">{r.reported_by_role === 'customer' ? 'door klant' : r.reported_by_role === 'company' ? 'door bedrijf' : 'door beheer'}</div></td>
          <td>{formatDateTime(r.pickup_at)}<div className="small muted">{`${r.pickup_city} → ${r.dropoff_city}`}</div></td>
          <td><a href={`/beheer/boekingen/${r.booking_id}`}>{r.booking_number}</a></td>
          <td>{reasonLabel(r.reason)}</td><td>{r.original_name}</td><td>{r.replacement_name || '—'}</td><td><Status s={r.status} /></td></tr>)}</tbody></table></div>}
    </Page>
  );
}

export function AdminCasePage({ ctx, c, booking: b, candidates, history }: { ctx: Ctx; c: any; booking: any; candidates: any[]; history: any[] }) {
  const isOpen = ['gemeld', 'in_behandeling', 'vervanger_geregeld'].includes(c.status);
  return (
    <Page ctx={ctx} title={`Melding ${c.case_number}`} area="admin">
      <div className="page-head"><h1>{`Melding ${c.case_number}`} {c.is_demo && <span className="badge badge-demo">fictief</span>}</h1><Status s={c.status} /></div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <section className="card"><h2>Melding</h2><div className="summary"><dl>
          <dt>Reden</dt><dd>{reasonLabel(c.reason)}</dd>
          <dt>Gemeld door</dt><dd>{`${c.reported_by_role === 'customer' ? 'Klant' : c.reported_by_role === 'company' ? 'Taxibedrijf' : 'Beheer'}${c.reporter_name ? ` (${c.reporter_name})` : ''}, ${formatDateTime(c.reported_at)}`}</dd>
          {c.details && <><dt>Toelichting</dt><dd>{c.details}</dd></>}
          <dt>Behandelaar</dt><dd>{c.handler_name || '—'}</dd>
          {c.replacement_name && <><dt>Vervanger</dt><dd>{c.replacement_name}{c.replacement_external_name ? ' (extern)' : ''}{c.replacement_eta ? `, verwacht ${formatTime(c.replacement_eta)}` : ''}</dd></>}
          {c.status !== 'gemeld' && <><dt>Extra kosten</dt><dd>{c.extra_cost_cents ? `${formatEuro(c.extra_cost_cents)} voor rekening van: ${COST_BEARERS[c.cost_bearer]}` : 'Geen'}</dd></>}
          {c.resolution && <><dt>Afhandeling</dt><dd>{c.resolution}</dd></>}
        </dl></div></section>
        <section className="card"><h2>Rit en klant</h2><div className="summary"><dl>
          <dt>Boeking</dt><dd><a href={`/beheer/boekingen/${b.id}`}>{b.booking_number}</a> <Status s={b.status} /></dd>
          <dt>Ophalen</dt><dd>{formatDateTime(b.pickup_at)}</dd>
          <dt>Van</dt><dd>{b.pickup_address}</dd><dt>Naar</dt><dd>{b.dropoff_address}</dd>
          {b.flight_number && <><dt>Vlucht</dt><dd>{b.flight_number}</dd></>}
          <dt>Reizigers</dt><dd>{`${b.passengers} personen, ${b.large_bags} grote en ${b.small_bags} kleine koffers, ${label(b.vehicle_category)}`}</dd>
          <dt>Klant</dt><dd>{b.contact_name}<br />{b.contact_phone && <a href={`tel:${b.contact_phone}`}>{b.contact_phone}</a>}{b.contact_email && <> · {b.contact_email}</>}</dd>
          <dt>Oorspronkelijk bedrijf</dt><dd>{b.trade_name} · <a href={`tel:${b.company_phone}`}>{b.company_phone}</a></dd>
          <dt>Prijs klant</dt><dd><Euro c={b.total_price_cents} /></dd>
        </dl></div></section>
      </div>

      {isOpen && <section className="card" style={{ marginTop: '1rem' }}>
        <h2>Afhandelen</h2>
        {c.status === 'gemeld' && <form method="post" action={`/beheer/vervangend-vervoer/${c.id}/oppakken`} style={{ marginBottom: '1rem' }}><Csrf ctx={ctx} />
          <button className="btn btn-primary" type="submit">Ik pak deze melding op</button></form>}
        {c.status !== 'vervanger_geregeld' && <form method="post" action={`/beheer/vervangend-vervoer/${c.id}/vervanger`} className="case-form">
          <Csrf ctx={ctx} />
          <h3>Vervanger vastleggen</h3>
          <p className="small muted">Bel een passende vervoerder, spreek de rit af en geef de ritgegevens telefonisch door. Leg daarna hier vast wie rijdt. De klant krijgt direct bericht in de app en per e-mail.</p>
          <Select name="replacement_company_id" label="Vervoerder van het platform" options={[['', 'Kies een vervoerder…'], ...candidates.map(x => [x.id, `${x.trade_name}${x.in_area ? '' : ' (buiten werkgebied)'}${x.has_category ? '' : ' (andere voertuigcategorie)'} · ${x.phone}`] as [string, string])]} />
          <Field name="replacement_external_name" label="Of: externe vervoerder (naam)" optional maxLength={120} />
          <TimeSelect name="eta" label="Verwachte aankomst bij de klant (vandaag)" />
          <div className="grid grid-2">
            <Field name="extra_cost" label="Extra kosten vervanger" optional inputMode="decimal" placeholder="0,00" hint="Kosten bovenop wat de klant al betaalde. De klant betaalt dit niet." />
            <Select name="cost_bearer" label="Voor rekening van" options={Object.entries(COST_BEARERS) as [string, string][]} />
          </div>
          <button className="btn btn-primary" type="submit">Vervanger vastleggen en klant informeren</button>
        </form>}
        <form method="post" action={`/beheer/vervangend-vervoer/${c.id}/sluiten`} className="case-form" style={{ marginTop: '1.2rem' }}>
          <Csrf ctx={ctx} />
          <h3>{c.status === 'vervanger_geregeld' ? 'Melding afronden' : 'Sluiten zonder vervanging'}</h3>
          <input type="hidden" name="outcome" value={c.status === 'vervanger_geregeld' ? 'afgerond' : 'ongegrond'} />
          <TextArea name="resolution" label="Toelichting" maxLength={1000} hint={c.status === 'vervanger_geregeld' ? 'Bijvoorbeeld: klant door vervanger afgezet om 14:20.' : 'Bijvoorbeeld: taxi was er toch, 5 minuten later. De rit gaat door met het oorspronkelijke bedrijf en de uitbetaling wordt weer vrijgegeven.'} />
          <button className={'btn ' + (c.status === 'vervanger_geregeld' ? 'btn-primary' : 'btn-secondary')} type="submit">{c.status === 'vervanger_geregeld' ? 'Afronden' : 'Sluiten zonder vervanging'}</button>
        </form>
      </section>}

      <section className="card" style={{ marginTop: '1rem' }}><h2>Logboek</h2>
        <ol className="timeline">{history.map(h => <li key={h.id}><strong>{h.action.replace('vervangend_vervoer.', '').replace('_', ' ')}</strong> <span className="small muted">{`${formatDateTime(h.created_at)} · ${h.full_name || h.actor_role}`}</span></li>)}</ol>
      </section>
    </Page>
  );
}
