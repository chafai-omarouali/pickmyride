/**
 * Sjablonen uit het Figma-ontwerp (24-11-2026) voor stads-, luchthaven-, buitenland-, onderwerp- en infopagina's.
 * Elke pagina heeft direct onder de hero de groene voordelenbalk (UspBar).
 */
import type { ReactNode } from 'react';
import type { Ctx } from '../../lib/http.ts';
import { Page } from '../layout.tsx';
import { UspBar } from './public.tsx';
import { config } from '../../lib/config.ts';

export type Crumb = [string, string];
export type QA = [string, string];

/** Foto uit Figma (public/img/foto/<k>.webp en <k>-640.webp, verhouding 3:2). */
export const Foto = ({ k, alt, sizes = '(min-width: 980px) 620px, 100vw', eager }: { k: string; alt: string; sizes?: string; eager?: boolean }) =>
  <img className="foto" src={`/static/img/foto/${k}.webp`} srcSet={`/static/img/foto/${k}-640.webp 640w, /static/img/foto/${k}.webp 1000w`} sizes={sizes}
    alt={alt} width={1000} height={671} loading={eager ? 'eager' : 'lazy'} decoding="async" {...(eager ? { fetchPriority: 'high' } : {}) as any} />;

export const Figure = ({ k, alt, caption, className = '', eager, sizes }: { k: string; alt: string; caption?: string; className?: string; eager?: boolean; sizes?: string }) =>
  <figure className={`lp-figure ${className}`}><Foto k={k} alt={alt} eager={eager} sizes={sizes} />{caption && <figcaption>{caption}</figcaption>}</figure>;

export const Crumbs = ({ crumbs }: { crumbs: Crumb[] }) => (
  <nav className="crumbs" aria-label="Kruimelpad"><a href="/">Home</a>{crumbs.map(([h, n], i) => i < crumbs.length - 1
    ? <span key={h}> <span aria-hidden="true">/</span> <a href={h}>{n}</a></span>
    : <span key={h}> <span aria-hidden="true">/</span> <span aria-current="page">{n}</span></span>)}</nav>
);

export function breadcrumbLd(crumbs: Crumb[]) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['/', 'Home'] as Crumb, ...crumbs].map(([h, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: config.baseUrl + h })) };
}
export const faqLd = (faq: QA[]) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
const Ld = ({ items }: { items: object[] }) => <>{items.map((x, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(x) }} />)}</>;

/** Vraag-en-antwoordlijst met scheidingslijnen (antwoorden altijd zichtbaar, zoals in Figma). */
export const QaList = ({ items }: { items: QA[] }) => (
  <dl className="lp-qa">{items.map(([q, a]) => <div key={q}><dt>{q}</dt><dd>{a}</dd></div>)}</dl>
);

// ───────── Stad, luchthaven en buitenland ─────────
export interface LocalProps {
  ctx: Ctx; title: string; description: string; crumbs: Crumb[]; ld: object[];
  hero: { label: string; h1: string; belofte: string; intro: string; foto: string; alt: string; caption: string; trust: string };
  form: ReactNode;
  intro: { label: string; title: string; texts: string[]; foto: string; alt: string; caption: string };
  cards: { label: string; title: string; cards: { label: string; title: string; text: string; action: string; href: string }[]; plain?: boolean };
  steps: { title: string; items: [string, string][] };
  faq: { label: string; title: string; items: QA[] };
  cta: { label: string; title: string; text: string; action: string; href?: string; note: string };
  extra?: ReactNode;
}

export function LocalPage(p: LocalProps) {
  return (
    <Page ctx={p.ctx} title={p.title} description={p.description}
      hero={<section className="hero hero-city lp-hero"><div className="wrap hero-grid">
        <div className="lp-hero-copy">
          <Crumbs crumbs={p.crumbs} />
          <p className="fg-eyebrow">{p.hero.label}</p>
          <h1>{p.hero.h1}</h1>
          <p className="lp-belofte">{p.hero.belofte}</p>
          <p className="lp-intro">{p.hero.intro}</p>
          <Figure k={p.hero.foto} alt={p.hero.alt} caption={p.hero.caption} className="lp-hero-foto" eager sizes="(min-width: 980px) 624px, 100vw" />
          <p className="lp-trust">{p.hero.trust}</p>
        </div>
        {p.form}
      </div></section>}
      band={<>
        <UspBar />
        <section className="fg-sec fg-white" aria-labelledby="lp-intro"><div className="wrap lp-split">
          <div>
            <p className="fg-eyebrow">{p.intro.label}</p>
            <h2 id="lp-intro" className="fg-h2">{p.intro.title}</h2>
            {p.intro.texts.map((t, i) => <p key={i} className={i === 0 ? 'fg-lead' : 'lp-text'}>{t}</p>)}
          </div>
          <Figure k={p.intro.foto} alt={p.intro.alt} caption={p.intro.caption} className="lp-intro-foto" />
        </div></section>

        <section className="fg-sec fg-cream" aria-labelledby="lp-ritten"><div className="wrap">
          <p className="fg-eyebrow">{p.cards.label}</p>
          <h2 id="lp-ritten" className="fg-h2">{p.cards.title}</h2>
          <ul className="lp-cards">{p.cards.cards.map(c => <li key={c.label}>
            <p className="lp-card-label">{c.label}</p>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
            {p.cards.plain ? <p className="lp-card-action">{c.action}</p> : <a className="lp-card-action" href={c.href}>{c.action}</a>}
          </li>)}</ul>
        </div></section>

        <section className="fg-sec fg-sage" aria-labelledby="lp-stappen"><div className="wrap lp-steps-wrap">
          <h2 id="lp-stappen" className="fg-h2">{p.steps.title}</h2>
          <ol className="lp-steps">{p.steps.items.map(([t, d], i) => <li key={t}><span className="zg-num">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></li>)}</ol>
        </div></section>

        <section className="fg-sec fg-white" aria-labelledby="lp-faq"><div className="wrap lp-faq">
          <div><p className="fg-eyebrow">{p.faq.label}</p><h2 id="lp-faq" className="fg-h2">{p.faq.title}</h2></div>
          <QaList items={p.faq.items} />
        </div></section>

        {p.extra}

        <section className="lp-cta" aria-labelledby="lp-cta"><div className="wrap">
          <p className="fg-eyebrow">{p.cta.label}</p>
          <h2 id="lp-cta" className="fg-h2">{p.cta.title}</h2>
          <p className="fg-lead">{p.cta.text}</p>
          <a className="fg-btn-light" href={p.cta.href || '#snel-titel'}>{p.cta.action}</a>
          <p className="lp-cta-note">{p.cta.note}</p>
        </div></section>
        <Ld items={p.ld} />
      </>}>
      {null as any}
    </Page>
  );
}

/** Compacte lijst met interne links (steden in de buurt, andere routes). */
export const LinkBand = ({ title, links, more }: { title: string; links: [string, string][]; more?: ReactNode }) => (
  <section className="fg-sec fg-cream lp-links" aria-label={title}><div className="wrap">
    <h2 className="lp-links-title">{title}</h2>
    <ul className="city-links">{links.map(([h, t]) => <li key={h}><a href={h}>{t}</a></li>)}</ul>
    {more && <p className="fg-more">{more}</p>}
  </div></section>
);

// ───────── Onderwerppagina's ─────────
export interface TopicProps {
  ctx: Ctx; title: string; description: string; crumbs: Crumb[]; ld?: object[];
  hero: { label: string; h1: string; belofte: string; intro: string; foto: string; alt: string };
  form: ReactNode; formNote: string;
  deep: ReactNode;
  steps: { label: string; title: string; items: [string, string][] };
  faq: QA[];
  cta: { title: string; text: string; foto: string; alt: string; note: string };
  extra?: ReactNode;
}

export function TopicPage(p: TopicProps) {
  return (
    <Page ctx={p.ctx} title={p.title} description={p.description}
      hero={<section className="hero hero-city lp-hero"><div className="wrap hero-grid">
        <div className="lp-hero-copy">
          <Crumbs crumbs={p.crumbs} />
          <p className="fg-eyebrow">{p.hero.label}</p>
          <h1>{p.hero.h1}</h1>
          <p className="lp-belofte">{p.hero.belofte}</p>
          <p className="lp-intro">{p.hero.intro}</p>
          <Figure k={p.hero.foto} alt={p.hero.alt} className="lp-topic-foto" eager sizes="(min-width: 980px) 624px, 100vw" />
        </div>
        <div className="lp-form-col">{p.form}<p className="lp-form-note">{p.formNote}</p></div>
      </div></section>}
      band={<>
        <UspBar />
        {p.deep}
        <section className="fg-sec fg-sage" aria-labelledby="lp-stappen"><div className="wrap">
          <p className="fg-eyebrow">{p.steps.label}</p>
          <h2 id="lp-stappen" className="fg-h2">{p.steps.title}</h2>
          <ol className="lp-steps lp-steps-serif">{p.steps.items.map(([t, d], i) => <li key={t}><span className="zg-num">{String(i + 1).padStart(2, '0')}</span><h3>{t}</h3><p>{d}</p></li>)}</ol>
        </div></section>
        {p.extra}
        <section className="fg-sec fg-white" aria-labelledby="lp-faq"><div className="wrap lp-faq">
          <div><p className="fg-eyebrow">Even goed om te weten</p><h2 id="lp-faq" className="fg-h2">Vragen voor je vertrekt.</h2></div>
          <QaList items={p.faq} />
        </div></section>
        <section className="lp-cta lp-cta-foto" aria-labelledby="lp-cta"><div className="wrap">
          <div>
            <p className="fg-eyebrow">Jouw volgende rit</p>
            <h2 id="lp-cta" className="fg-h2">{p.cta.title}</h2>
            <p className="fg-lead">{p.cta.text}</p>
            <a className="fg-btn-light" href="#snel-titel">Vergelijk prijsvoorstellen</a>
            <p className="lp-cta-note">{p.cta.note}</p>
          </div>
          <Figure k={p.cta.foto} alt={p.cta.alt} sizes="(min-width: 980px) 608px, 100vw" />
        </div></section>
        <Ld items={[breadcrumbLd(p.crumbs), faqLd(p.faq), ...(p.ld || [])]} />
      </>}>
      {null as any}
    </Page>
  );
}

// ───────── Infopagina's (contact, juridisch, aanmelden) ─────────
export interface InfoProps {
  ctx: Ctx; title: string; description: string; crumbs: Crumb[]; noindex?: boolean;
  hero: { label: string; lines: [string, string]; intro: string; foto: string; alt: string; caption: string; extra?: ReactNode };
  children: ReactNode; bodyClass?: string;
  help: { label: string; title: string; items: QA[]; boxTitle: string; boxText: string; action: string; href: string };
}

export function InfoPage(p: InfoProps) {
  return (
    <Page ctx={p.ctx} title={p.title} description={p.description} noindex={p.noindex}
      hero={<section className="hero hero-city lp-hero lp-info-hero"><div className="wrap lp-info-grid">
        <div>
          <Crumbs crumbs={p.crumbs} />
          <p className="fg-eyebrow">{p.hero.label}</p>
          <h1><span>{p.hero.lines[0]}</span><br /><span>{p.hero.lines[1]}</span></h1>
          <p className="lp-intro lp-intro-lg">{p.hero.intro}</p>
          {p.hero.extra}
        </div>
        <Figure k={p.hero.foto} alt={p.hero.alt} caption={p.hero.caption} className="lp-info-foto" eager sizes="(min-width: 980px) 550px, 100vw" />
      </div></section>}
      band={<>
        <UspBar />
        <section className={`fg-sec lp-info-body ${p.bodyClass || 'lp-body-sand'}`}><div className="wrap">{p.children}</div></section>
        <section className="fg-sec fg-white" aria-labelledby="lp-help"><div className="wrap lp-faq">
          <div><p className="fg-eyebrow">{p.help.label}</p><h2 id="lp-help" className="fg-h2">{p.help.title}</h2></div>
          <div>
            <QaList items={p.help.items} />
            <div className="lp-next"><div><h3>{p.help.boxTitle}</h3><p>{p.help.boxText}</p></div><a className="fg-btn" href={p.help.href}>{p.help.action}</a></div>
          </div>
        </div></section>
      </>}>
      {null as any}
    </Page>
  );
}
