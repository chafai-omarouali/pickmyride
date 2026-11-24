/**
 * Klantenservice-gegevens (24/7 telefoon en WhatsApp) voor de hele site.
 * Komen uit beheer → instellingen. Zonder ingesteld nummer tonen we in productie niets:
 * we beloven geen bereikbaarheid of vervangend vervoer die niemand kan waarmaken.
 */
import { getSettings } from './services.ts';
import { config } from './config.ts';
import { toE164 } from '../integrations/calls/index.ts';

export interface SupportInfo {
  phone: string; phoneHref: string | null;
  whatsapp: string; whatsappNumber: string | null;
  hours: string;
  /** Er is minstens één echt nummer ingesteld. */
  configured: boolean;
  /** Belofte vervangend vervoer tonen. */
  guarantee: boolean;
  /** Blok tonen (ingesteld, of demo-omgeving met duidelijke markering). */
  visible: boolean;
  /** Minimaal aantal uur vooraf aanvragen (voor teksten in kop en footer). */
  minLeadHours: number;
}

let cache: { at: number; info: SupportInfo } | null = null;
export function invalidateSupportCache() { cache = null; }

export async function supportInfo(): Promise<SupportInfo> {
  if (cache && Date.now() - cache.at < 30_000) return cache.info;
  const s = (await getSettings()) as any;
  const phone = String(s.support_phone || '').trim(), whatsapp = String(s.support_whatsapp || '').trim();
  const phoneHref = phone ? toE164(phone) : null, whatsappNumber = whatsapp ? toE164(whatsapp) : null;
  const configured = !!(phoneHref || whatsappNumber);
  const info: SupportInfo = {
    phone, phoneHref: phoneHref ? `tel:${phoneHref}` : null,
    whatsapp, whatsappNumber: whatsappNumber ? whatsappNumber.slice(1) : null,
    hours: String(s.support_hours || '24 uur per dag, 7 dagen per week'),
    configured,
    guarantee: Number(s.replacement_guarantee ?? 1) === 1 && (configured || config.demoMode),
    visible: configured || config.demoMode,
    minLeadHours: Number(s.min_lead_hours ?? 24),
  };
  cache = { at: Date.now(), info };
  return info;
}

/** WhatsApp-link (wa.me) met optioneel voorgevuld bericht. Opent WhatsApp bij de klant; wij versturen zelf niets. */
export function whatsappLink(info: SupportInfo, text?: string) {
  if (!info.whatsappNumber) return null;
  return `https://wa.me/${info.whatsappNumber}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export const GUARANTEE_TITLE = 'Vervangend vervoer als je taxi niet komt';
export const GUARANTEE_TEXT = 'Komt het taxibedrijf om wat voor reden dan ook niet opdagen? Dan regelen wij direct vervangend vervoer, zodat je je reis altijd kunt vervolgen.';
