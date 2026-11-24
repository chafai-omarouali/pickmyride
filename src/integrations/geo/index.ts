/**
 * Verwisselbare adres- en routeprovider.
 * - 'geen' (standaard): geen automatische validatie of routeberekening. De interface meldt dit duidelijk;
 *   adressen worden handmatig ingevoerd en afstand/reistijd blijven leeg. Er worden NOOIT verzonnen waarden getoond.
 * - 'pdok': adresaanvulling via de PDOK Locatieserver (gratis, Nederlandse overheid, geen sleutel nodig).
 *   Voorbereid maar niet getest in deze omgeving (geen netwerktoegang). Routeafstand vereist een aparte routeprovider
 *   (bijv. Google Routes API of OpenRouteService) — zie docs/INTEGRATIES.md.
 */
import { config } from '../../lib/config.ts';

export interface AddressSuggestion { label: string; street: string; postcode: string; city: string; lat: number | null; lng: number | null }
export interface RouteInfo { distanceM: number; durationS: number }

export interface GeoProvider {
  readonly name: 'geen' | 'pdok';
  readonly supportsAutocomplete: boolean;
  readonly supportsRoutes: boolean;
  suggest(query: string): Promise<AddressSuggestion[]>;
  route(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteInfo | null>;
}

const none: GeoProvider = {
  name: 'geen', supportsAutocomplete: false, supportsRoutes: false,
  async suggest() { return []; },
  async route() { return null; },
};

const pdok: GeoProvider = {
  name: 'pdok', supportsAutocomplete: true, supportsRoutes: false,
  async suggest(q) {
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?fq=type:adres&rows=6&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data: any = await res.json();
    return (data.response?.docs || []).map((d: any) => {
      const m = /POINT\(([\d.]+) ([\d.]+)\)/.exec(d.centroide_ll || '');
      return { label: d.weergavenaam, street: `${d.straatnaam} ${d.huis_nlt}`, postcode: d.postcode, city: d.woonplaatsnaam,
               lng: m ? Number(m[1]) : null, lat: m ? Number(m[2]) : null };
    });
  },
  async route() { return null; },
};

export const geoProvider = (): GeoProvider => (config.geoProvider === 'pdok' ? pdok : none);
