/** Klantenservice (24/7) en vervangend vervoer: herbruikbare blokken voor openbare pagina's, klant en bedrijf. */
import type { Ctx } from '../lib/http.ts';
import { whatsappLink, GUARANTEE_TITLE, GUARANTEE_TEXT } from '../lib/support.ts';
import { formatDateTime, formatTime } from '../lib/time.ts';
import { Csrf, Notice } from './layout.tsx';

export function SupportContacts({ ctx, bookingNumber, size = 'normal' }: { ctx: Ctx; bookingNumber?: string; size?: 'normal' | 'small' }) {
  const s = ctx.support;
  if (!s?.visible) return null;
  const wa = whatsappLink(s, bookingNumber ? `Hallo PickMyRide, mijn boekingsnummer is ${bookingNumber}. ` : undefined);
  const cls = size === 'small' ? ' btn-small' : '';
  return (
    <div className="support-contacts">
      {s.configured ? <div className="btn-row">
        {s.phoneHref && <a className={'btn btn-primary' + cls} href={s.phoneHref}>{`Bel ${s.phone}`}</a>}
        {wa && <a className={'btn btn-secondary' + cls} href={wa} rel="noopener" target="_blank">WhatsApp de klantenservice</a>}
      </div> : <p className="small"><span className="badge badge-demo">DEMO</span> Klantenservicenummers zijn nog niet ingesteld. Vul ze in bij Beheer → Instellingen; dan verschijnen hier de bel- en WhatsApp-knop.</p>}
      <p className="small muted" style={{ margin: '.5rem 0 0' }}>{`Bereikbaar ${s.hours}.`}{bookingNumber ? ` Houd je boekingsnummer ${bookingNumber} bij de hand.` : ''}</p>
    </div>
  );
}

/** Belofte vervangend vervoer. Alleen zichtbaar als de klantenservice echt bereikbaar is (of in de demo). */
export function GuaranteeBlock({ ctx, heading = 'h2' }: { ctx: Ctx; heading?: 'h2' | 'h3' }) {
  const s = ctx.support;
  if (!s?.visible) return null;
  const H = heading;
  return (
    <section className="support-band">
      <div>
        <H>{s.guarantee ? GUARANTEE_TITLE : 'Klantenservice, dag en nacht'}</H>
        {s.guarantee && <p>{GUARANTEE_TEXT}</p>}
        <p>{`Onze klantenservice is ${s.hours} bereikbaar, telefonisch en via WhatsApp.`}</p>
      </div>
      <SupportContacts ctx={ctx} />
    </section>
  );
}

export function FooterSupport({ ctx }: { ctx: Ctx }) {
  const s = ctx.support;
  if (!s?.visible) return null;
  const wa = whatsappLink(s);
  return (
    <p className="small footer-support">
      <strong>Klantenservice 24/7</strong><br />
      {s.configured ? <>{s.phoneHref && <a href={s.phoneHref}>{s.phone}</a>}{s.phoneHref && wa && ' of '}{wa && <a href={wa} rel="noopener" target="_blank">WhatsApp</a>}</> : <span>Demo: nummer nog niet ingesteld</span>}
    </p>
  );
}

const STEPS: [string, string][] = [['gemeld', 'Gemeld'], ['in_behandeling', 'Klantenservice bezig'], ['vervanger_geregeld', 'Vervanger geregeld'], ['afgerond', 'Afgerond']];

/** Hulppaneel op de boekingspagina: status van een melding en het meldformulier. */
export function ReplacementPanel({ ctx, info, basePath, viewer, bookingNumber }: { ctx: Ctx; info: any; basePath: string; viewer: 'customer' | 'company'; bookingNumber: string }) {
  const c = info?.current;
  const open = c && ['gemeld', 'in_behandeling', 'vervanger_geregeld'].includes(c.status);
  const stepIdx = c ? STEPS.findIndex(([k]) => k === c.status) : -1;
  const notice = ctx.flash?.area === 'hulp' ? ctx.flash : null;
  return (
    <section className="card help-card" id="hulp">
      <h2>{viewer === 'customer' ? 'Hulp nodig met je rit?' : 'Kunt u deze rit niet uitvoeren?'}</h2>
      {notice && <Notice type={notice.type === 'fout' ? 'fout' : 'ok'}><p>{notice.text}</p></Notice>}
      {c && (
        <div className={'case-status' + (open ? ' is-open' : '')}>
          <p style={{ margin: 0 }}><strong>{`Melding ${c.case_number}`}</strong> <span className="small muted">{`gemeld ${formatDateTime(c.reported_at)}`}</span></p>
          {c.status === 'ongegrond'
            ? <p className="small" style={{ margin: '.4rem 0 0' }}>{`De klantenservice heeft deze melding gesloten zonder vervanging${c.resolution ? `: ${c.resolution}` : '.'}`}</p>
            : <ol className="case-steps" aria-label="Voortgang melding">{STEPS.map(([k, t], i) => <li key={k} className={i < stepIdx ? 'done' : i === stepIdx ? 'current' : ''} aria-current={i === stepIdx ? 'step' : undefined}>{t}</li>)}</ol>}
          {c.status === 'vervanger_geregeld' && (viewer === 'customer'
            ? <Notice type="ok"><p>{`Vervangend vervoer: ${c.replacement_name}.`}{c.replacement_eta ? ` Verwachte aankomst ${formatTime(c.replacement_eta)}.` : ''} Je betaalt hiervoor niets extra.</p></Notice>
            : <Notice type="info"><p>De klantenservice heeft vervangend vervoer geregeld. U hoeft deze rit niet meer uit te voeren.</p></Notice>)}
          {open && c.status !== 'vervanger_geregeld' && <p className="small" style={{ margin: '.4rem 0 0' }}>{viewer === 'customer' ? 'De klantenservice is ingeschakeld. Bel of app ons gerust als het snel moet.' : 'De klantenservice neemt contact met u op.'}</p>}
        </div>
      )}
      {!open && info?.options?.length > 0 && (
        <form method="post" action={`${basePath}/melding`} className="help-form">
          <Csrf ctx={ctx} />
          <fieldset><legend>{viewer === 'customer' ? 'Wat is er aan de hand?' : 'Reden'}</legend>
            {info.options.map((o: any, i: number) => <label key={o.code} className="radio"><input type="radio" name="reason" value={o.code} required defaultChecked={i === 0} /> {o.label}</label>)}
          </fieldset>
          <div className="field"><label htmlFor="f-details">Toelichting <span className="optional">(optioneel, bij "ander probleem" verplicht)</span></label>
            <textarea id="f-details" name="details" rows={2} maxLength={1000} /></div>
          <button className="btn btn-danger" type="submit">{viewer === 'customer' ? 'Melden en vervangend vervoer aanvragen' : 'Melden aan de klantenservice'}</button>
        </form>
      )}
      {!open && viewer === 'customer' && info && !info.options.some((o: any) => o.code === 'niet_verschenen') && !c && (
        <p className="small muted">{`"Taxi niet gekomen" kun je hier melden vanaf ${info.noShowMinutes} minuten na het ophaalmoment. Twijfel je eerder? Neem direct contact op.`}</p>
      )}
      {viewer === 'customer' ? <SupportContacts ctx={ctx} bookingNumber={bookingNumber} size="small" />
        : ctx.support?.visible && <SupportContacts ctx={ctx} bookingNumber={bookingNumber} size="small" />}
    </section>
  );
}
