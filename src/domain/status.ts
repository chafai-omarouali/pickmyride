/**
 * Expliciet statusmodel: welke overgangen zijn toegestaan en welke rol mag ze uitvoeren.
 * 'system' = automatische processen (verloop, betaalbevestiging).
 */
import { HttpError } from '../lib/http.ts';
import type { Role } from '../lib/db.ts';

type Rule = { to: string; roles: Role[] };
type Model = Record<string, Rule[]>;

export const REQUEST_STATUS: Model = {
  concept:     [{ to: 'open', roles: ['system', 'customer'] }, { to: 'geannuleerd', roles: ['customer', 'admin'] }, { to: 'verlopen', roles: ['system'] }],
  open:        [{ to: 'gesloten', roles: ['system'] }, { to: 'verlopen', roles: ['system'] }, { to: 'geannuleerd', roles: ['customer', 'admin'] }],
  verlopen:    [],
  gesloten:    [{ to: 'geannuleerd', roles: ['admin', 'system'] }],
  geannuleerd: [],
};

export const BID_STATUS: Model = {
  actief:       [{ to: 'gereserveerd', roles: ['system', 'customer'] }, { to: 'ingetrokken', roles: ['company'] }, { to: 'verlopen', roles: ['system'] }, { to: 'niet_gekozen', roles: ['system'] }],
  gereserveerd: [{ to: 'geaccepteerd', roles: ['system'] }, { to: 'actief', roles: ['system'] }, { to: 'verlopen', roles: ['system'] }],
  geaccepteerd: [],
  ingetrokken:  [],
  verlopen:     [],
  niet_gekozen: [],
};

export const BOOKING_STATUS: Model = {
  bevestigd:            [{ to: 'chauffeur_toegewezen', roles: ['company', 'admin'] }, { to: 'geannuleerd', roles: ['customer', 'admin'] }, { to: 'probleem_gemeld', roles: ['admin'] }],
  chauffeur_toegewezen: [{ to: 'onderweg', roles: ['company', 'admin'] }, { to: 'geannuleerd', roles: ['customer', 'admin'] }, { to: 'probleem_gemeld', roles: ['admin'] }],
  onderweg:             [{ to: 'aangekomen', roles: ['company', 'admin'] }, { to: 'probleem_gemeld', roles: ['admin'] }],
  aangekomen:           [{ to: 'passagier_opgehaald', roles: ['company', 'admin'] }, { to: 'probleem_gemeld', roles: ['admin'] }],
  passagier_opgehaald:  [{ to: 'afgerond', roles: ['company', 'admin'] }, { to: 'probleem_gemeld', roles: ['admin'] }],
  probleem_gemeld:      [{ to: 'bevestigd', roles: ['admin'] }, { to: 'onderweg', roles: ['admin'] }, { to: 'aangekomen', roles: ['admin'] }, { to: 'passagier_opgehaald', roles: ['admin'] }, { to: 'chauffeur_toegewezen', roles: ['admin'] }, { to: 'afgerond', roles: ['admin'] }, { to: 'geannuleerd', roles: ['admin'] }],
  afgerond:             [],
  geannuleerd:          [],
};

export const PAYMENT_STATUS: Model = {
  in_behandeling:            [{ to: 'geslaagd', roles: ['system'] }, { to: 'mislukt', roles: ['system'] }],
  geslaagd:                  [{ to: 'gedeeltelijk_terugbetaald', roles: ['system', 'admin'] }, { to: 'volledig_terugbetaald', roles: ['system', 'admin'] }],
  gedeeltelijk_terugbetaald: [{ to: 'gedeeltelijk_terugbetaald', roles: ['system', 'admin'] }, { to: 'volledig_terugbetaald', roles: ['system', 'admin'] }],
  mislukt:                   [],
  volledig_terugbetaald:     [],
};

export const PAYOUT_STATUS: Model = {
  nog_niet_beschikbaar: [{ to: 'gepland', roles: ['system', 'admin'] }, { to: 'geblokkeerd', roles: ['admin', 'system'] }],
  gepland:              [{ to: 'uitbetaald', roles: ['system'] }, { to: 'mislukt', roles: ['system'] }, { to: 'geblokkeerd', roles: ['admin'] }],
  geblokkeerd:          [{ to: 'gepland', roles: ['admin'] }, { to: 'nog_niet_beschikbaar', roles: ['admin'] }],
  mislukt:              [{ to: 'gepland', roles: ['admin'] }],
  uitbetaald:           [],
};

export function canTransition(model: Model, from: string, to: string, role: Role) {
  return (model[from] || []).some(r => r.to === to && (r.roles.includes(role) || role === 'system'));
}
export function assertTransition(model: Model, from: string, to: string, role: Role) {
  if (!canTransition(model, from, to, role)) throw new HttpError(409, `Deze statuswijziging is niet toegestaan (${label(from)} → ${label(to)}).`);
}

const LABELS: Record<string, string> = {
  concept: 'Concept (e-mail nog niet bevestigd)', open: 'Open voor biedingen', verlopen: 'Verlopen', gesloten: 'Gesloten', geannuleerd: 'Geannuleerd',
  actief: 'Actief', gereserveerd: 'Tijdelijk gereserveerd', geaccepteerd: 'Geaccepteerd', ingetrokken: 'Ingetrokken', niet_gekozen: 'Niet gekozen',
  bevestigd: 'Bevestigd', chauffeur_toegewezen: 'Chauffeur toegewezen', onderweg: 'Onderweg naar ophaallocatie', aangekomen: 'Aangekomen',
  passagier_opgehaald: 'Passagier opgehaald', afgerond: 'Afgerond', probleem_gemeld: 'Probleem gemeld',
  in_behandeling: 'In behandeling', geslaagd: 'Geslaagd', mislukt: 'Mislukt', gedeeltelijk_terugbetaald: 'Gedeeltelijk terugbetaald', volledig_terugbetaald: 'Volledig terugbetaald',
  nog_niet_beschikbaar: 'Nog niet beschikbaar', gepland: 'Gepland', uitbetaald: 'Uitbetaald', geblokkeerd: 'Geblokkeerd',
  in_beoordeling: 'In beoordeling', afgewezen: 'Afgewezen', geschorst: 'Geschorst',
  niet_gecontroleerd: 'Niet gecontroleerd', goedgekeurd: 'Goedgekeurd', afgekeurd: 'Afgekeurd',
  kvk_uittreksel: 'KvK-uittreksel', taxivergunning: 'Vergunning taxivervoer', verzekering: 'Verzekeringsbewijs', overig: 'Overig document',
  omgezet: 'Omgezet in boeking', gemeld: 'Gemeld', vervanger_geregeld: 'Vervanger geregeld', ongegrond: 'Gesloten zonder vervanging', vrijgegeven: 'Vrijgegeven', in_beoordeling_bedrijf: 'In beoordeling',
};
export const label = (s: string) => LABELS[s] || s;
