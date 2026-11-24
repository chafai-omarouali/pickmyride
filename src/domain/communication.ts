/**
 * Communicatie tussen klant en taxibedrijf per boeking: chat en afgeschermd bellen.
 * - Alleen deelnemers van de boeking (klant en uitvoerend bedrijf); afgedwongen door RLS (booking_participant).
 * - Alleen binnen het contactvenster: van bevestiging tot X uur na ophalen (booking_contact_open, instelbaar).
 * - Het bedrijf ziet nooit telefoonnummer of e-mail van de klant; bellen loopt via de belprovider.
 */
import { type Actor, type Tx, SYSTEM, withActor, one, many, isRlsViolation } from '../lib/db.ts';
import { audit, rateLimit, logError, getSettings } from '../lib/services.ts';
import { queueEmail } from '../lib/notify.ts';
import { config } from '../lib/config.ts';
import { HttpError } from '../lib/http.ts';
import { formatDateTime } from '../lib/time.ts';
import { callProvider, toE164, type CallStatus } from '../integrations/calls/index.ts';
import { asSystem } from './context.ts';

const PARTICIPANT_ROLES = ['customer', 'company'];
const CONTACT_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+|(\+|00)?\d[\d\s\-()]{7,}\d/;

function requireParticipantRole(actor: Actor) {
  if (!PARTICIPANT_ROLES.includes(actor.role)) throw new HttpError(403, 'Alleen de klant en het uitvoerende taxibedrijf kunnen hier communiceren.');
}

/** Systeembericht in het gesprek (bijv. boeking bevestigd, status gewijzigd). Aanroepen met systeemrechten. */
export async function addSystemMessage(tx: Tx, bookingId: string, body: string) {
  await tx.query(`insert into messages (booking_id, sender_role, body) values ($1, 'system', $2)`, [bookingId, body.slice(0, 2000)]);
}

export async function getConversation(actor: Actor, bookingId: string) {
  requireParticipantRole(actor);
  return withActor(actor, async tx => {
    // RLS: de boeking is alleen zichtbaar voor de eigen klant of het eigen bedrijf
    const b = await one(tx, `select k.id, k.booking_number, k.status, k.company_id, r.pickup_at, booking_contact_open(k.id) as open,
        r.pickup_at + make_interval(hours => coalesce((select (value #>> '{}')::int from platform_settings where key = 'contact_hours_after_ride'), 24)) as closes_at
      from bookings k join ride_requests r on r.id = k.ride_request_id where k.id = $1`, [bookingId]);
    if (!b) throw new HttpError(404, 'Boeking niet gevonden.');
    await tx.query('select mark_messages_read($1)', [bookingId]);
    const messages = await many(tx, `select id, sender_role, body, created_at, read_by_customer_at, read_by_company_at, hidden_at is not null as hidden
      from messages where booking_id = $1 order by created_at, id`, [bookingId]);
    for (const m of messages) if (m.hidden) m.body = '';
    const calls = await many(tx, `select id, initiated_by_role, status, is_simulated, duration_s, created_at from call_sessions where booking_id = $1 order by created_at desc limit 10`, [bookingId]);
    return { booking: b, messages, calls, callAvailable: callProvider().available, callSimulated: callProvider().isSimulated };
  });
}

/** Nieuwe berichten na een tijdstip (voor automatisch verversen). */
export async function messagesSince(actor: Actor, bookingId: string, since: Date) {
  requireParticipantRole(actor);
  return withActor(actor, async tx => {
    if (!(await one(tx, 'select 1 from bookings where id = $1', [bookingId]))) throw new HttpError(404, 'Boeking niet gevonden.');   // RLS: alleen deelnemers
    const rows = await many(tx, `select id, sender_role, case when hidden_at is null then body else '' end as body, created_at, hidden_at is not null as hidden
      from messages where booking_id = $1 and created_at > $2 order by created_at, id`, [bookingId, since]);
    if (rows.length) await tx.query('select mark_messages_read($1)', [bookingId]);
    return rows;
  });
}

export async function sendMessage(actor: Actor, bookingId: string, rawBody: string): Promise<{ error?: string }> {
  requireParticipantRole(actor);
  const body = String(rawBody || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!body) return { error: 'Typ een bericht.' };
  if (body.length > 2000) return { error: 'Een bericht mag maximaal 2000 tekens zijn.' };
  if (CONTACT_PATTERN.test(body)) return { error: 'Deel geen telefoonnummers of e-mailadressen in de chat. Gebruik de knop "Bellen via PickMyRide"; zo blijven ieders gegevens afgeschermd.' };
  if (!(await rateLimit(`chat:${actor.userId || actor.companyId}`, 30, 600))) return { error: 'Je stuurt veel berichten in korte tijd. Wacht even.' };
  try {
    return await withActor(actor, async tx => {
      const b = await one(tx, `select k.id, k.booking_number, k.company_id, k.ride_request_id, booking_contact_open(k.id) as open from bookings k where k.id = $1`, [bookingId]);
      if (!b) throw new HttpError(404, 'Boeking niet gevonden.');
      if (!b.open) return { error: 'Het contactvenster voor deze rit is gesloten. Neem bij vragen contact op met PickMyRide.' };
      await tx.query(`insert into messages (booking_id, sender_role, sender_user_id, body) values ($1,$2,$3,$4)`, [bookingId, actor.role, actor.userId, body]);
      // E-mail naar de andere partij, hooguit één per 10 minuten per gesprek
      await asSystem(tx, actor, async () => {
        const slot = Math.floor(Date.now() / 600_000);
        if (actor.role === 'customer') {
          const c = await one(tx, 'select email from companies where id = $1', [b.company_id]);
          await queueEmail(tx, `bericht:${bookingId}:company:${slot}`, c.email, 'nieuw_bericht', `Nieuw bericht van de klant — ${b.booking_number}`,
            `U heeft een nieuw bericht van de klant over boeking ${b.booking_number}.\n\nLees en beantwoord: ${config.baseUrl}/bedrijf/ritten/${bookingId}#contact`);
        } else {
          const c = await one(tx, `select cc.contact_email, p.contact_name from ride_request_contact cc join ride_request_private p using (ride_request_id) where ride_request_id = $1`, [b.ride_request_id]);
          await queueEmail(tx, `bericht:${bookingId}:customer:${slot}`, c.contact_email, 'nieuw_bericht', `Nieuw bericht van je vervoerder — ${b.booking_number}`,
            `Hallo ${c.contact_name},\n\nJe hebt een nieuw bericht over je rit ${b.booking_number}.\n\nLees en beantwoord: ${config.baseUrl}/mijn/boekingen/${bookingId}#contact`);
        }
      });
      return {};
    });
  } catch (e) {
    if (isRlsViolation(e)) return { error: 'Je kunt in dit gesprek geen bericht sturen.' };
    throw e;
  }
}

/** Afgeschermd bellen starten. Nummers worden alleen met systeemrechten opgehaald en nooit getoond. */
export async function startCall(actor: Actor, bookingId: string): Promise<{ status: CallStatus; simulated: boolean; message: string }> {
  requireParticipantRole(actor);
  const s = await getSettings() as any;
  if (!(await rateLimit(`bellen:${actor.userId || actor.companyId}`, Number(s.calls_per_hour_limit) || 10, 3600)))
    throw new HttpError(429, 'Je hebt het maximale aantal belpogingen voor dit uur bereikt.');
  const provider = callProvider();
  const prep = await withActor(actor, async tx => {
    const b = await one(tx, `select k.id, k.booking_number, k.company_id, k.ride_request_id, booking_contact_open(k.id) as open from bookings k where k.id = $1`, [bookingId]);
    if (!b) throw new HttpError(404, 'Boeking niet gevonden.');
    if (!b.open) throw new HttpError(409, 'Het contactvenster voor deze rit is gesloten.');
    return asSystem(tx, actor, async () => {
      const cust = await one(tx, 'select contact_phone from ride_request_contact where ride_request_id = $1', [b.ride_request_id]);
      const comp = await one(tx, 'select phone from companies where id = $1', [b.company_id]);
      const [mine, theirs] = actor.role === 'customer' ? [cust.contact_phone, comp.phone] : [comp.phone, cust.contact_phone];
      const status: CallStatus = provider.available ? 'aangevraagd' : 'niet_beschikbaar';
      const sess = await one(tx, `insert into call_sessions (booking_id, initiated_by_role, initiated_by_user, provider, status, is_simulated) values ($1,$2,$3,$4,$5,$6) returning id`,
        [bookingId, actor.role, actor.userId, provider.name, status, provider.isSimulated]);
      return { sessionId: sess.id, caller: toE164(mine), callee: toE164(theirs), booking: b };
    });
  });
  if (!provider.available) return { status: 'niet_beschikbaar', simulated: false, message: 'Bellen via de app is nog niet aangesloten. Stuur een bericht; de andere partij krijgt daarvan een e-mail.' };
  if (!prep.caller || !prep.callee) {
    await updateCall(prep.sessionId, 'mislukt', 'Ongeldig telefoonnummer');
    return { status: 'mislukt', simulated: provider.isSimulated, message: 'Het gesprek kon niet worden opgezet: een van de telefoonnummers is ongeldig. Neem contact op met PickMyRide.' };
  }
  try {
    const r = await provider.start({ sessionId: prep.sessionId, callerPhone: prep.caller, calleePhone: prep.callee, statusUrl: `${config.baseUrl}/api/webhooks/telefonie` });
    await withActor(SYSTEM, async tx => {
      await tx.query(`update call_sessions set provider_call_id = $2, status = $3, ended_at = case when $3 = 'afgerond' then now() end where id = $1`, [prep.sessionId, r.providerCallId, r.status]);
      await addSystemMessage(tx, bookingId, provider.isSimulated
        ? `DEMO: gesprek gesimuleerd, gestart door ${actor.role === 'customer' ? 'de klant' : 'het taxibedrijf'}. Er is niemand gebeld.`
        : `${actor.role === 'customer' ? 'De klant' : 'Het taxibedrijf'} belde via PickMyRide.`);
    });
    return provider.isSimulated
      ? { status: r.status, simulated: true, message: 'DEMO: in het echt belt PickMyRide nu eerst jouw telefoon en verbindt je daarna door. Geen van beiden ziet het nummer van de ander.' }
      : { status: r.status, simulated: false, message: 'We bellen je nu op je eigen telefoon. Neem op, dan verbinden we je door. Je ziet het platformnummer, niet het nummer van de ander.' };
  } catch (e) {
    await updateCall(prep.sessionId, 'mislukt', (e as Error).message);
    await logError('Bellen starten mislukt', { sessionId: prep.sessionId, error: (e as Error).message });
    return { status: 'mislukt', simulated: false, message: 'Het gesprek kon niet worden opgezet. Probeer het later opnieuw of stuur een bericht.' };
  }
}

async function updateCall(sessionId: string, status: CallStatus, reason?: string) {
  await withActor(SYSTEM, tx => tx.query(`update call_sessions set status = $2, failure_reason = $3, ended_at = now() where id = $1`, [sessionId, status, reason?.slice(0, 300) || null]));
}

export async function handleCallStatus(raw: string, headers: Record<string, string | string[] | undefined>, fullUrl: string) {
  const ev = callProvider().parseStatus(raw, headers, fullUrl);
  await withActor(SYSTEM, tx => tx.query(`update call_sessions set status = $2, duration_s = coalesce($3, duration_s),
      ended_at = case when $2 in ('afgerond','niet_beantwoord','mislukt') then now() else ended_at end where provider_call_id = $1`, [ev.providerCallId, ev.status, ev.durationS ?? null]));
}

/** Aantal ongelezen berichten per boeking voor de huidige gebruiker. */
export async function unreadCounts(actor: Actor): Promise<Record<string, number>> {
  if (!PARTICIPANT_ROLES.includes(actor.role)) return {};
  const col = actor.role === 'customer' ? 'read_by_customer_at' : 'read_by_company_at';
  const rows = await withActor(actor, tx => many(tx, `select booking_id, count(*)::int as n from messages where ${col} is null and sender_role not in ($1, 'system') and hidden_at is null group by booking_id`, [actor.role]));
  return Object.fromEntries(rows.map(r => [r.booking_id, r.n]));
}

// ───────── Beheer ─────────
export async function getBookingAdmin(actor: Actor, bookingId: string) {
  if (actor.role !== 'admin') throw new HttpError(403, 'Alleen beheerders hebben toegang.');
  return withActor(actor, async tx => {
    const b = await one(tx, `select k.*, c.trade_name, r.pickup_at, r.pickup_city, r.dropoff_city, r.id as ride_id, p.contact_name, cc.contact_email, cc.contact_phone, booking_contact_open(k.id) as open,
        (select rc.id from replacement_cases rc where rc.booking_id = k.id order by rc.reported_at desc limit 1) as case_id,
        (select rc.case_number from replacement_cases rc where rc.booking_id = k.id order by rc.reported_at desc limit 1) as case_number
      from bookings k join companies c on c.id = k.company_id join ride_requests r on r.id = k.ride_request_id
      join ride_request_private p on p.ride_request_id = r.id left join ride_request_contact cc on cc.ride_request_id = r.id where k.id = $1`, [bookingId]);
    if (!b) throw new HttpError(404, 'Boeking niet gevonden.');
    const messages = await many(tx, `select m.*, u.full_name as hidden_by_name from messages m left join users u on u.id = m.hidden_by where booking_id = $1 order by created_at, id`, [bookingId]);
    const calls = await many(tx, `select * from call_sessions where booking_id = $1 order by created_at desc`, [bookingId]);
    const history = await many(tx, `select * from status_history where entity_type = 'booking' and entity_id = $1 order by created_at`, [bookingId]);
    return { booking: b, messages, calls, history };
  });
}

export async function hideMessage(actor: Actor, messageId: string, reason: string) {
  if (actor.role !== 'admin') throw new HttpError(403, 'Alleen beheerders kunnen berichten verbergen.');
  if (reason.trim().length < 3) throw new HttpError(400, 'Geef een reden op.');
  return withActor(actor, async tx => {
    const m = await one(tx, `update messages set hidden_at = now(), hidden_by = $2, hidden_reason = $3 where id = $1 and hidden_at is null returning booking_id`, [messageId, actor.userId, reason.trim().slice(0, 300)]);
    if (!m) throw new HttpError(404, 'Bericht niet gevonden of al verborgen.');
    await audit(tx, actor, 'bericht.verborgen', 'message', messageId, { booking_id: m.booking_id, reden: reason.trim() });
    return m.booking_id as string;
  });
}

export const contactWindowText = (closesAt: Date | string) => `Chatten en bellen kan tot ${formatDateTime(closesAt)}.`;
