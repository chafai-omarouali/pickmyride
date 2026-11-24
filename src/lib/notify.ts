/**
 * E-mailmeldingen via een wachtrij (tabel notifications).
 * - dedupe_key is uniek: dezelfde melding wordt nooit twee keer aangemaakt.
 * - MAIL_MODE=outbox (standaard): berichten worden alleen opgeslagen, niet verzonden.
 *   In de demo-omgeving zijn ze zichtbaar via /ontwikkeling/mailbox.
 * - MAIL_MODE=smtp: aan te sluiten provider (zie docs/INTEGRATIES.md). Verstuurt pas na expliciete configuratie.
 */
import { type Tx, SYSTEM, withActor, many } from './db.ts';
import { config } from './config.ts';
import { logError } from './services.ts';

export type Template =
  | 'aanvraag_ontvangen' | 'toegangslink' | 'nieuw_aanbod' | 'biedtermijn_loopt_af' | 'nieuwe_aanvraag_bedrijf'
  | 'bod_geaccepteerd' | 'boeking_bevestigd' | 'chauffeur_toegewezen' | 'rit_binnenkort' | 'annulering'
  | 'terugbetaling' | 'probleemmelding' | 'bedrijf_aanmelding_ontvangen' | 'bedrijf_goedgekeurd' | 'bedrijf_afgewezen'
  | 'betaling_mislukt' | 'nieuwe_beoordeling' | 'nieuw_bericht' | 'vervangend_vervoer';

export async function queueEmail(tx: Tx, dedupeKey: string, to: string, template: Template, subject: string, body: string) {
  const footer = '\n\n—\nPickMyRide. Dit is een automatisch bericht.' + (config.demoMode ? '\n[DEMO-OMGEVING — fictieve gegevens, dit bericht is niet echt verzonden]' : '');
  await tx.query(`insert into notifications (dedupe_key, to_address, template, subject, body_text)
                  values ($1,$2,$3,$4,$5) on conflict (dedupe_key) do nothing`, [dedupeKey, to, template, subject, body + footer]);
}

export async function deliverPending(limit = 50) {
  const pending = await withActor(SYSTEM, tx => many(tx, `select id from notifications where status = 'wachtrij' and attempts < 5 order by created_at limit $1`, [limit]));
  for (const n of pending) {
    try {
      if (config.mailMode === 'outbox') {
        await withActor(SYSTEM, tx => tx.query(`update notifications set status = 'alleen_outbox', attempts = attempts + 1 where id = $1`, [n.id]));
      } else {
        throw new Error('SMTP/e-mailprovider is nog niet aangesloten (zie docs/INTEGRATIES.md).');
      }
    } catch (e) {
      const msg = (e as Error).message;
      await withActor(SYSTEM, tx => tx.query(`update notifications set attempts = attempts + 1, last_error = $2,
        status = case when attempts + 1 >= 5 then 'mislukt' else 'wachtrij' end where id = $1`, [n.id, msg]));
      await logError('E-mail verzenden mislukt', { notificationId: n.id, error: msg });
    }
  }
}
