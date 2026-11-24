import type { Ctx } from '../lib/http.ts';
import { Csrf, Notice, TextArea } from './layout.tsx';
import { REVIEW_CRITERIA, type ReviewErrors } from '../domain/reviews.ts';
import { formatDate } from '../lib/time.ts';

const nl = (n: number | string | null | undefined) => (n === null || n === undefined ? '—' : Number(n).toFixed(1).replace('.', ','));

/** Statische sterren (bijv. 4,3 → 4 volle sterren), met tekst voor schermlezers. */
export function Stars({ value }: { value: number | string }) {
  const v = Number(value);
  return (
    <span className="stars" aria-label={`${nl(v)} van 5 sterren`} role="img">
      {[1, 2, 3, 4, 5].map(i => <span key={i} aria-hidden="true" className={v >= i - 0.25 ? 'on' : ''}>★</span>)}
    </span>
  );
}

/** Gemiddelden per onderdeel (uit company_public) of scores van één beoordeling. */
export function CriteriaBreakdown({ source, prefix }: { source: any; prefix: 'avg_' | 'score_' }) {
  return (
    <dl className="criteria">
      {REVIEW_CRITERIA.map(([key, labelText]) => {
        const v = source[`${prefix}${key}`];
        return (
          <div key={key} className="criterion">
            <dt>{labelText}</dt>
            <dd><span className="bar" aria-hidden="true"><span style={{ width: `${(Number(v) / 5) * 100}%` }} /></span><strong>{nl(v)}</strong></dd>
          </div>
        );
      })}
    </dl>
  );
}

export function RatingSummary({ s }: { s: any }) {
  if (!s || !s.rating_count) return <span className="muted">Nog geen beoordelingen</span>;
  return <span><Stars value={s.rating_avg} /> <strong>{nl(s.rating_avg)}</strong> uit 5 <span className="muted">({s.rating_count} {s.rating_count === 1 ? 'beoordeling' : 'beoordelingen'})</span></span>;
}

export function ReviewForm({ ctx, bookingId, errors = {}, values = {} }: { ctx: Ctx; bookingId: string; errors?: ReviewErrors; values?: Record<string, string> }) {
  return (
    <form method="post" action={`/mijn/boekingen/${bookingId}/beoordeling`} noValidate>
      <Csrf ctx={ctx} />
      {errors.form && <Notice type="fout"><p>{errors.form}</p></Notice>}
      <p className="small muted">Geef per onderdeel 1 (slecht) tot 5 (uitstekend) sterren. Je beoordeling is zichtbaar voor andere klanten en voor het taxibedrijf, zonder je achternaam of contactgegevens. Na plaatsen kun je haar niet meer wijzigen.</p>
      {REVIEW_CRITERIA.map(([key, labelText, hint]) => (
        <fieldset key={key} className={'rating-field' + (errors[key] ? ' has-error' : '')}>
          <legend>{labelText}<span className="hint">{hint}</span></legend>
          <div className="stars-input">
            {[5, 4, 3, 2, 1].map(n => (
              <span key={n}>
                <input type="radio" id={`r-${key}-${n}`} name={`score_${key}`} value={n} defaultChecked={values[`score_${key}`] === String(n)} required />
                <label htmlFor={`r-${key}-${n}`} title={`${n} van 5`}><span aria-hidden="true">★</span><span className="sr">{n} van 5 sterren</span></label>
              </span>
            ))}
          </div>
          {errors[key] && <p className="error-text">{errors[key]}</p>}
        </fieldset>
      ))}
      <TextArea name="body" label="Toelichting" optional value={values.body} error={errors.body} maxLength={1000} hint="Wat ging goed, wat kan beter? Noem geen namen of contactgegevens." />
      <button className="btn btn-primary" type="submit">Beoordeling plaatsen</button>
    </form>
  );
}

export function ReviewItem({ r, showStatus }: { r: any; showStatus?: boolean }) {
  return (
    <article className="card review">
      <div className="page-head" style={{ marginBottom: '.4rem' }}>
        <div><Stars value={r.score} /> <strong>{nl(r.score)}</strong> <span className="small muted">· {formatDate(r.created_at)}{r.booking_number ? ` · ${r.booking_number}` : ''}</span></div>
        {showStatus && r.status !== 'gepubliceerd' && <span className="badge badge-warn">{r.status === 'verborgen' ? 'Verborgen' : 'In moderatie'}</span>}
      </div>
      <CriteriaBreakdown source={r} prefix="score_" />
      {r.body && <p style={{ marginTop: '.7rem' }}>{r.body}</p>}
      {showStatus && r.moderation_reason && <p className="small muted">Moderatie: {r.moderation_reason}</p>}
    </article>
  );
}
