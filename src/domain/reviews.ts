import { type Actor, withActor, one, many, isUniqueViolation, isRlsViolation } from '../lib/db.ts';
import { audit } from '../lib/services.ts';
import { queueEmail } from '../lib/notify.ts';
import { config } from '../lib/config.ts';
import { HttpError } from '../lib/http.ts';
import { asSystem } from './context.ts';

/** De vijf beoordelingsonderdelen. key = kolomnaam zonder 'score_'. */
export const REVIEW_CRITERIA = [
  ['communicatie', 'Communicatie', 'Bereikbaarheid, duidelijke afspraken en informatie vooraf en onderweg'],
  ['klantvriendelijkheid', 'Klantvriendelijkheid', 'Vriendelijkheid, behulpzaamheid en hulp met bagage'],
  ['comfort_hygiene', 'Comfort & hygiëne', 'Schoon, fris en comfortabel voertuig'],
  ['betrouwbaarheid', 'Betrouwbaarheid', 'Op tijd, afspraken nagekomen, prijs zoals geboekt'],
  ['rijgedrag_veiligheid', 'Rijgedrag & veiligheid', 'Rustig en veilig gereden, verkeersregels gerespecteerd'],
] as const;
export type CriterionKey = typeof REVIEW_CRITERIA[number][0];

export type ReviewErrors = Partial<Record<CriterionKey | 'body' | 'form', string>>;

export async function submitReview(actor: Actor, bookingId: string, input: Record<string, string>): Promise<{ errors?: ReviewErrors; reviewId?: string }> {
  if (actor.role !== 'customer' || !actor.userId) throw new HttpError(403, 'Alleen de klant van deze rit kan een beoordeling plaatsen.');
  const e: ReviewErrors = {};
  const scores: number[] = [];
  for (const [key, labelText] of REVIEW_CRITERIA) {
    const n = Number(input[`score_${key}`]);
    if (!Number.isInteger(n) || n < 1 || n > 5) e[key] = `Geef een score van 1 tot 5 voor ${labelText.toLowerCase()}.`;
    scores.push(n);
  }
  const body = String(input.body || '').trim();
  if (body.length > 1000) e.body = 'Je toelichting mag maximaal 1000 tekens zijn.';
  if (Object.keys(e).length) return { errors: e };

  try {
    return await withActor(actor, async tx => {
      const b = await one(tx, `select id, status, company_id, booking_number, customer_can_review($2, id) as allowed from bookings where id = $1`, [bookingId, actor.userId]);
      if (!b) throw new HttpError(404, 'Boeking niet gevonden.');
      if (b.status !== 'afgerond') return { errors: { form: 'Je kunt pas een beoordeling plaatsen nadat de rit is afgerond.' } };
      if (!b.allowed) return { errors: { form: 'Voor deze rit heb je al een beoordeling geplaatst.' } };
      const r = await one(tx, `insert into reviews (booking_id, company_id, customer_user_id, score_communicatie, score_klantvriendelijkheid,
          score_comfort_hygiene, score_betrouwbaarheid, score_rijgedrag_veiligheid, body) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, score`,
        [bookingId, b.company_id, actor.userId, ...scores, body || null]);
      await asSystem(tx, actor, async () => {
        const c = await one(tx, 'select email from companies where id = $1', [b.company_id]);
        await queueEmail(tx, `beoordeling:${r.id}`, c.email, 'nieuwe_beoordeling', `Nieuwe beoordeling voor rit ${b.booking_number}`,
          `U heeft een nieuwe beoordeling ontvangen (gemiddeld ${String(r.score).replace('.', ',')} van 5).\n\nBekijk: ${config.baseUrl}/bedrijf/beoordelingen`);
      });
      return { reviewId: r.id };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { errors: { form: 'Voor deze rit heb je al een beoordeling geplaatst.' } };
    if (isRlsViolation(err)) return { errors: { form: 'Je kunt deze rit niet beoordelen.' } };
    throw err;
  }
}

export async function getOwnReview(actor: Actor, bookingId: string) {
  return withActor(actor, tx => one(tx, 'select * from reviews where booking_id = $1', [bookingId]));
}

/** Overzicht voor het taxibedrijf: gemiddelden per onderdeel en alle eigen beoordelingen (ook verborgen, met reden). */
export async function companyReviews(actor: Actor) {
  if (actor.role !== 'company') throw new HttpError(403, 'Geen toegang.');
  return withActor(actor, async tx => ({
    summary: await one(tx, 'select * from company_public where id = $1', [actor.companyId]),
    reviews: await many(tx, `select r.*, k.booking_number, k.ride_request_id from reviews r join bookings k on k.id = r.booking_id order by r.created_at desc`),
  }));
}

export async function listReviewsAdmin(actor: Actor) {
  if (actor.role !== 'admin') throw new HttpError(403, 'Geen toegang.');
  return withActor(actor, tx => many(tx, `select r.*, c.trade_name, k.booking_number, m.full_name as moderator_name
    from reviews r join companies c on c.id = r.company_id join bookings k on k.id = r.booking_id left join users m on m.id = r.moderated_by
    order by (r.status = 'in_moderatie') desc, r.created_at desc limit 300`));
}

export async function moderateReview(actor: Actor, reviewId: string, to: 'gepubliceerd' | 'verborgen' | 'in_moderatie', reason: string) {
  if (actor.role !== 'admin') throw new HttpError(403, 'Alleen beheerders kunnen beoordelingen modereren.');
  if (reason.trim().length < 3) throw new HttpError(400, 'Geef een reden op voor de moderatie.');
  await withActor(actor, async tx => {
    const r = await one(tx, 'select status from reviews where id = $1 for update', [reviewId]);
    if (!r) throw new HttpError(404, 'Beoordeling niet gevonden.');
    if (r.status === to) throw new HttpError(409, 'De beoordeling heeft deze status al.');
    await tx.query(`update reviews set status = $2, moderation_reason = $3, moderated_by = $4, moderated_at = now() where id = $1`,
      [reviewId, to, reason.trim().slice(0, 500), actor.userId]);
    await audit(tx, actor, 'beoordeling.gemodereerd', 'review', reviewId, { van: r.status, naar: to, reden: reason.trim() });
  });
}
