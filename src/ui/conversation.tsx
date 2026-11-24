import type { Ctx } from '../lib/http.ts';
import { Csrf, Notice } from './layout.tsx';
import { formatDateTime, formatTime } from '../lib/time.ts';
import { contactWindowText } from '../domain/communication.ts';

const CALL_LABEL: Record<string, string> = {
  aangevraagd: 'Gestart', gaat_over: 'Gaat over', verbonden: 'Verbonden', afgerond: 'Afgerond', niet_beantwoord: 'Niet beantwoord', mislukt: 'Mislukt', niet_beschikbaar: 'Niet beschikbaar',
};

/**
 * Chat en afgeschermd bellen voor één boeking. viewer = 'customer' of 'company'.
 * Zonder JavaScript werkt alles via gewone formulieren; met JavaScript ververst de chat elke 10 seconden.
 */
export function ConversationPanel({ ctx, conv, viewer, otherName, basePath, notice }:
  { ctx: Ctx; conv: any; viewer: 'customer' | 'company'; otherName: string; basePath: string; notice?: { type: 'ok' | 'fout' | 'info' | 'warn'; text: string } | null }) {
  const { booking: b, messages, calls } = conv;
  const who = (role: string) => role === viewer ? 'Jij' : role === 'system' ? 'PickMyRide' : otherName;
  return (
    <section className="card conversation" id="contact" aria-labelledby="contact-title" data-conversation={b.id} data-last={messages.length ? new Date(messages[messages.length - 1].created_at).toISOString() : ''} data-viewer={viewer} data-other={otherName}>
      <div className="conv-head">
        <div>
          <h2 id="contact-title" style={{ margin: 0 }}>{`Contact met ${otherName}`}</h2>
          <p className="small muted" style={{ margin: '.2rem 0 0' }}>{b.open ? contactWindowText(b.closes_at) : 'Het contactvenster is gesloten. Het gesprek blijft hier leesbaar.'}</p>
        </div>
        {b.open && (
          <form method="post" action={`${basePath}/bellen`}>
            <Csrf ctx={ctx} />
            <button className="btn btn-secondary call-btn" type="submit" aria-describedby="call-hint"><span aria-hidden="true">☏</span> Bellen via PickMyRide</button>
          </form>
        )}
      </div>
      <p className="small muted" id="call-hint" style={{ margin: '.6rem 0 1rem' }}>
        Nummers blijven afgeschermd: wij bellen jou en verbinden je door. {viewer === 'company' ? 'U ziet het nummer van de klant niet, en de klant ziet uw nummer niet.' : 'Het taxibedrijf ziet jouw nummer niet.'} Gesprekken worden niet opgenomen.
        {!conv.callAvailable && <> <strong>Bellen via de app is nog niet aangesloten;</strong> gebruik voorlopig de chat.</>}
        {conv.callSimulated && <> <span className="badge badge-demo">DEMO: bellen wordt gesimuleerd</span></>}
      </p>
      {notice && <Notice type={notice.type}><p>{notice.text}</p></Notice>}

      <ol className="chat" aria-live="polite" aria-label="Berichten">
        {!messages.length && <li className="chat-empty muted small">Nog geen berichten.</li>}
        {messages.map((m: any) => (
          <li key={m.id} data-id={m.id} className={'msg ' + (m.sender_role === 'system' ? 'msg-system' : m.sender_role === viewer ? 'msg-mine' : 'msg-theirs')}>
            <span className="msg-meta">{who(m.sender_role)} · <time dateTime={new Date(m.created_at).toISOString()} title={formatDateTime(m.created_at)}>{formatTime(m.created_at)}</time></span>
            <span className="msg-body">{m.hidden ? <em>Dit bericht is door PickMyRide verborgen.</em> : m.body}</span>
          </li>
        ))}
      </ol>

      {b.open ? (
        <form method="post" action={`${basePath}/bericht`} className="chat-form" data-chat-form>
          <Csrf ctx={ctx} />
          <label htmlFor="f-chat" className="sr">Bericht</label>
          <textarea id="f-chat" name="body" rows={2} maxLength={2000} placeholder={`Bericht aan ${otherName}…`} required />
          <button className="btn btn-primary" type="submit">Versturen</button>
        </form>
      ) : null}
      <p className="small muted" style={{ marginTop: '.6rem' }}>Deel geen telefoonnummers, e-mailadressen of betaalgegevens in de chat. PickMyRide kan berichten inzien bij vragen of klachten.</p>

      {calls.length > 0 && (
        <details className="more">
          <summary>Belgeschiedenis ({calls.length})</summary>
          <ul className="small" style={{ paddingLeft: '1.1rem' }}>
            {calls.map((c: any) => <li key={c.id}>{formatDateTime(c.created_at)}, {c.initiated_by_role === viewer ? 'door jou' : `door ${otherName}`}: {CALL_LABEL[c.status] || c.status}{c.duration_s ? ` (${Math.round(c.duration_s / 60)} min)` : ''}{c.is_simulated ? ' (demo)' : ''}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
