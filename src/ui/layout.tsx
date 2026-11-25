import { FooterSupport } from './support.tsx';
import { FooterCities } from './footer-cities.tsx';
import type { ReactNode } from 'react';
import type { Ctx } from '../lib/http.ts';
import { config } from '../lib/config.ts';
import { label } from '../domain/status.ts';
import { formatEuro } from '../lib/money.ts';

type Area = 'public' | 'customer' | 'company' | 'admin';

const SUBNAV: Record<Exclude<Area, 'public'>, [string, string][]> = {
  customer: [['/mijn', 'Mijn aanvragen'], ['/rit-aanvragen', 'Nieuwe rit aanvragen']],
  company: [['/bedrijf', 'Overzicht'], ['/bedrijf/aanvragen', 'Aanvragen'], ['/bedrijf/biedingen', 'Mijn biedingen'], ['/bedrijf/ritten', 'Ritten & planning'],
    ['/bedrijf/wagenpark', 'Wagenpark'], ['/bedrijf/financieel', 'Financieel'], ['/bedrijf/beoordelingen', 'Beoordelingen'], ['/bedrijf/profiel', 'Profiel']],
  admin: [['/beheer', 'Dashboard'], ['/beheer/bedrijven', 'Taxibedrijven'], ['/beheer/aanvragen', 'Ritten & biedingen'], ['/beheer/vervangend-vervoer', 'Vervangend vervoer'], ['/beheer/beoordelingen', 'Beoordelingen'], ['/beheer/instellingen', 'Instellingen'],
    ['/beheer/audit', 'Auditlog'], ...(config.demoMode ? [['/ontwikkeling/mailbox', 'Mailbox (demo)'] as [string, string]] : [])],
};

export function Page(props: { ctx: Ctx; title: string; description?: string; noindex?: boolean; area?: Area; children: ReactNode; wide?: boolean; hero?: ReactNode; band?: ReactNode }) {
  const { ctx, area = 'public' } = props;
  const path = ctx.url.pathname;
  const blauw = false; // ontwerp uit Figma is de enige kleurversie
  const logoLight = blauw ? 'logo-blauw-licht' : 'logo-licht', logoDark = blauw ? 'logo-blauw' : 'logo-donker', icon = blauw ? 'icoon-blauw' : 'icoon';
  const u = ctx.user;
  const accountLink = !u ? ['/inloggen', 'Inloggen'] : u.role === 'admin' ? ['/beheer', 'Beheer'] : u.role === 'company' ? ['/bedrijf', 'Bedrijfsportaal'] : ['/mijn', 'Mijn ritten'];
  const links: [string, string][] = [['/rit-aanvragen', 'Rit aanvragen'], ['/hoe-werkt-het', 'Hoe werkt het?'], ['/voor-taxibedrijven', 'Voor taxibedrijven'], ['/veelgestelde-vragen', 'Vragen'], accountLink as [string, string]];
  const nav = (
    <nav className="nav" aria-label="Hoofdmenu">
      {links.map(([h, t], i) => <a key={h} href={h} className={i === links.length - 1 ? 'nav-pill' : undefined} aria-current={path === h || (h === '/rit-aanvragen' && path.startsWith('/rit-aanvragen/')) ? 'page' : undefined}>{t}</a>)}
      {u && <form method="post" action="/uitloggen"><input type="hidden" name="_csrf" value={ctx.csrfToken} /><button className="linkbtn" type="submit">Uitloggen</button></form>}
    </nav>
  );
  return (
    <html lang="nl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${props.title} | PickMyRide`}</title>
        {props.description && <meta name="description" content={props.description} />}
        {(props.noindex || area !== 'public') && <meta name="robots" content="noindex, nofollow" />}
        <meta name="theme-color" content={blauw ? '#032C58' : '#2A1B14'} />
        <link rel="preload" href="/static/fonts/gelasio.woff" as="font" type="font/woff" crossOrigin="anonymous" />
        <link rel="preload" href="/static/fonts/dmsans.woff" as="font" type="font/woff" crossOrigin="anonymous" />
        <link rel="stylesheet" href="/static/styles.css" />
        <link rel="icon" type="image/png" sizes="32x32" href="/static/img/pmr-icoon-32.png" />
        <link rel="apple-touch-icon" href="/static/img/pmr-icoon-180.png" />
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      <body className={[blauw ? 'theme-blauw' : '', `area-${area}`].filter(Boolean).join(' ')}>
        <a className="skip" href="#inhoud">Direct naar de inhoud</a>
        {config.demoMode && <div className="demo-banner" role="note"><strong>Demo-omgeving.</strong> Alle bedrijven, klanten en betalingen zijn fictief; er worden geen echte betalingen of berichten verwerkt.</div>}
        <header className={'site-header' + (u || area !== 'public' ? ' keep-menu' : '')}>
          <div className="wrap">
            <a className="logo logo-img" href="/" aria-label="PickMyRide, naar de homepage"><img src="/static/img/pmr-logo.png" srcSet="/static/img/pmr-logo.png 1x, /static/img/pmr-logo@2x.png 2x" alt="PickMyRide" width={193} height={48} /></a>
            <div className="nav-desktop">{nav}</div>
            <a className="nav-pill nav-pill-mobile" href={accountLink[0]}>{accountLink[1]}</a>
            <details className="menu"><summary>Menu</summary>{nav}</details>
          </div>
        </header>
        {area !== 'public' && (() => {
          const items = SUBNAV[area];
          const isCur = (h: string) => path === h || (h !== '/bedrijf' && h !== '/beheer' && h !== '/mijn' && path.startsWith(h));
          const cur = items.find(([h]) => isCur(h));
          const kicker = { company: 'Bedrijfsportaal', customer: 'Mijn PickMyRide', admin: 'Beheer' }[area];
          const who = area === 'company' ? u?.company_name : area === 'customer' ? u?.full_name : 'PickMyRide';
          return <>
            <div className="portal-bar"><div className="wrap">
              <div className="portal-id"><span>{kicker}</span><strong>{who}</strong></div>
              {area === 'company' && u?.company_status && <span className={'portal-status ' + (u.company_status === 'actief' ? 'is-ok' : 'is-warn')}>{u.company_status === 'actief' ? 'Actief · gecontroleerd' : label(u.company_status)}</span>}
            </div></div>
            <div className="subnav"><div className="wrap">
              <details className="subnav-mobile"><summary><span>{cur ? cur[1] : 'Menu'}</span></summary>
                <nav aria-label="Sectiemenu">{items.map(([h, t]) => <a key={h} href={h} aria-current={isCur(h) ? 'page' : undefined}>{t}</a>)}</nav>
              </details>
              <nav className="subnav-tabs" aria-label="Sectiemenu">{items.map(([h, t]) => <a key={h} href={h} aria-current={isCur(h) ? 'page' : undefined}>{t}</a>)}</nav>
            </div></div>
          </>;
        })()}
        <main id="inhoud">
          {props.hero}
          {(props.children || ctx.flash || !props.hero) && <div className={'page-body wrap' + (props.wide === false ? ' narrow' : '')}>
            {ctx.flash && !ctx.flash.area && <Notice type={ctx.flash.type}>{ctx.flash.text}</Notice>}
            {u?.role === 'company' && u.company_status !== 'actief' && area === 'company' && (
              <Notice type="warn">Uw bedrijf heeft de status <strong>{label(u.company_status || '')}</strong>. U kunt pas aanvragen bekijken en bieden nadat een beheerder uw bedrijf heeft geactiveerd.</Notice>
            )}
            {props.children}
          </div>}
          {props.band}
        </main>
        <footer className="site-footer">
          <div className="wrap ft-top">
            <div className="ft-brand"><p className="ft-logo"><img src="/static/img/pmr-logo-licht.png" srcSet="/static/img/pmr-logo-licht.png 1x, /static/img/pmr-logo-licht@2x.png 2x" alt="PickMyRide" width={193} height={48} /></p><p className="ft-tag">Jouw rit. Jouw keuze.</p><FooterSupport ctx={ctx} /></div>
            <nav className="ft-col" aria-label="Reis plannen"><p className="ft-head">Reis plannen</p><ul><li><a href="/rit-aanvragen">Rit aanvragen</a></li><li><a href="/hoe-werkt-het">Hoe werkt het?</a></li></ul></nav>
            <nav className="ft-col" aria-label="Meer informatie"><p className="ft-head">Meer informatie</p><ul><li><a href="/voor-taxibedrijven">Voor taxibedrijven</a></li><li><a href="/veelgestelde-vragen">Vragen?</a></li></ul></nav>
          </div>
          {area === 'public' && <div className="wrap"><FooterCities /></div>}
          <div className="wrap ft-bottom">
            <p>Vooraf geboekte ritten in Nederland.</p>
            <ul className="ft-legal"><li><a href="/contact">Contact</a></li><li><a href="/privacyverklaring">Privacy</a></li><li><a href="/algemene-voorwaarden">Voorwaarden</a></li><li><a href="/annuleringsvoorwaarden">Annuleren</a></li><li><a href="/aanmelden-taxibedrijf">Taxibedrijf aanmelden</a></li></ul>
            <p>{`Minimaal ${ctx.support?.minLeadHours ?? 24} uur vooraf · Gratis aanvraag`}</p>
          </div>
        </footer>
        <script src="/static/app.js" defer></script>
      </body>
    </html>
  );
}

export function Notice({ type, children }: { type: 'ok' | 'fout' | 'info' | 'warn'; children: ReactNode }) {
  return <div className={`notice notice-${type}`} role={type === 'fout' ? 'alert' : 'status'}>{children}</div>;
}

export function Csrf({ ctx }: { ctx: Ctx }) { return <input type="hidden" name="_csrf" value={ctx.csrfToken} />; }

export function Field(p: { name: string; label: string; type?: string; value?: string; error?: string; hint?: ReactNode; optional?: boolean; required?: boolean;
  id?: string; autoComplete?: string; inputMode?: 'numeric' | 'tel' | 'email' | 'text' | 'decimal'; min?: number | string; max?: number | string; placeholder?: string; maxLength?: number; list?: string }) {
  const id = p.id || 'f-' + p.name;
  const descr = [p.hint ? id + '-hint' : '', p.error ? id + '-err' : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={'field' + (p.error ? ' has-error' : '')}>
      <label htmlFor={id}>{p.label} {p.optional && <span className="optional">(optioneel)</span>}</label>
      <input id={id} name={p.name} type={p.type || 'text'} defaultValue={p.value ?? ''} required={p.required} autoComplete={p.autoComplete} inputMode={p.inputMode}
        min={p.min} max={p.max} placeholder={p.placeholder} maxLength={p.maxLength} aria-invalid={p.error ? true : undefined} aria-describedby={descr} list={p.list} />
      {p.hint && <p className="hint" id={id + '-hint'}>{p.hint}</p>}
      {p.error && <p className="error-text" id={id + '-err'}>{p.error}</p>}
    </div>
  );
}

export function Select(p: { name: string; label: string; options: [string, string][]; value?: string; error?: string; hint?: ReactNode; required?: boolean }) {
  const id = 'f-' + p.name;
  return (
    <div className={'field' + (p.error ? ' has-error' : '')}>
      <label htmlFor={id}>{p.label}</label>
      <select id={id} name={p.name} defaultValue={p.value ?? ''} required={p.required} aria-invalid={p.error ? true : undefined} aria-describedby={p.error ? id + '-err' : undefined}>
        {p.options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
      {p.hint && <p className="hint">{p.hint}</p>}
      {p.error && <p className="error-text" id={id + '-err'}>{p.error}</p>}
    </div>
  );
}

export function TextArea(p: { name: string; label: string; value?: string; error?: string; hint?: ReactNode; optional?: boolean; maxLength?: number }) {
  const id = 'f-' + p.name;
  return (
    <div className={'field' + (p.error ? ' has-error' : '')}>
      <label htmlFor={id}>{p.label} {p.optional && <span className="optional">(optioneel)</span>}</label>
      <textarea id={id} name={p.name} defaultValue={p.value ?? ''} maxLength={p.maxLength} aria-invalid={p.error ? true : undefined} aria-describedby={p.hint ? id + '-hint' : undefined} />
      {p.hint && <p className="hint" id={id + '-hint'}>{p.hint}</p>}
      {p.error && <p className="error-text">{p.error}</p>}
    </div>
  );
}

export function Check(p: { name: string; value?: string; checked?: boolean; children: ReactNode; error?: string }) {
  const id = 'f-' + p.name + (p.value && p.value !== 'ja' ? '-' + p.value : '');
  return (
    <div className={p.error ? 'has-error' : ''}>
      <div className="check"><input type="checkbox" id={id} name={p.name} value={p.value || 'ja'} defaultChecked={p.checked} /><label htmlFor={id}>{p.children}</label></div>
      {p.error && <p className="error-text" style={{ marginTop: '-.5rem', marginBottom: '.8rem' }}>{p.error}</p>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  open: 'ok', actief: 'ok', bevestigd: 'ok', geslaagd: 'ok', afgerond: 'ok', geaccepteerd: 'ok', goedgekeurd: 'ok', uitbetaald: 'ok', chauffeur_toegewezen: 'ok',
  concept: 'warn', gereserveerd: 'warn', in_behandeling: 'warn', in_beoordeling: 'warn', niet_gecontroleerd: 'warn', probleem_gemeld: 'bad', gepland: 'info', gemeld: 'bad', vervanger_geregeld: 'info', ongegrond: '',
  verlopen: '', gesloten: 'info', geannuleerd: 'bad', mislukt: 'bad', afgewezen: 'bad', geschorst: 'bad', afgekeurd: 'bad', ingetrokken: '', niet_gekozen: '', geblokkeerd: 'bad',
};
export function Status({ s }: { s: string }) { return <span className={'badge ' + (BADGE[s] ? 'badge-' + BADGE[s] : '')}>{label(s)}</span>; }
export const Euro = ({ c }: { c: number }) => <>{formatEuro(c)}</>;
export function ConceptLabel() { return <span className="concept-label">Concepttekst, nog juridisch te beoordelen</span>; }
export function PlaceholderNotice({ what }: { what: string }) {
  return <Notice type="info"><p><strong>{what}</strong> wordt in een volgende fase gebouwd. Deze pagina laat bewust nog geen invoer toe, zodat er geen knoppen zijn die niets doen.</p></Notice>;
}

/** 24-uurs tijdkiezer (uur 00–23 en minuten per 5). Verstuurt name__h en name__m; de server voegt ze samen tot "uu:mm". */
export function TimeSelect(p: { name: string; label: string; value?: string; error?: string; hint?: ReactNode; step?: number }) {
  const id = 'f-' + p.name;
  const [hh = '', mm = ''] = (p.value || '').split(':');
  const step = p.step || 5;
  const mins = Array.from({ length: 60 / step }, (_, i) => String(i * step).padStart(2, '0'));
  if (mm && !mins.includes(mm)) { mins.push(mm); mins.sort(); }
  return (
    <div className={'field' + (p.error ? ' has-error' : '')}>
      <span className="label" id={id + '-lbl'}>{p.label}</span>
      <div className="time-select" role="group" aria-labelledby={id + '-lbl'}>
        <select id={id} name={p.name + '__h'} defaultValue={hh} aria-label="Uur" aria-invalid={p.error ? true : undefined}>
          <option value="">uu</option>
          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <span aria-hidden="true">:</span>
        <select name={p.name + '__m'} defaultValue={mm} aria-label="Minuten" aria-invalid={p.error ? true : undefined}>
          <option value="">mm</option>
          {mins.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      {p.hint && <p className="hint">{p.hint}</p>}
      {p.error && <p className="error-text">{p.error}</p>}
    </div>
  );
}
