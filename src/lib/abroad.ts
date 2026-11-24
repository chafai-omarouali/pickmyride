/**
 * Buitenland: landen, postcodecontrole, buitenlandse luchthavens en de bestemmingspagina's.
 * Adressen van luchthavens gecontroleerd op 23-11-2026 (websites van de luchthavens en officiële bronnen).
 * Zoekvolumes: Google Keyword Planner, NL, gemiddeld per maand (23-11-2026).
 */
export type Country = 'NL' | 'BE' | 'DE' | 'FR' | 'LU';
export const COUNTRIES: [Country, string][] = [['NL', 'Nederland'], ['BE', 'België'], ['DE', 'Duitsland'], ['FR', 'Frankrijk'], ['LU', 'Luxemburg']];
export const countryName = (c: string) => COUNTRIES.find(([k]) => k === c)?.[1] || c;
export const isCountry = (c: string): c is Country => COUNTRIES.some(([k]) => k === c);

const POSTAL: Record<Exclude<Country, 'NL'>, { re: RegExp; example: string }> = {
  BE: { re: /^(?:B-?)?([1-9]\d{3})$/i, example: '2000' },
  DE: { re: /^(?:D-?)?(\d{5})$/i, example: '40474' },
  FR: { re: /^(?:F-?)?(\d{5})$/i, example: '75001' },
  LU: { re: /^(?:L-?)?(\d{4})$/i, example: 'L-1009' },
};
/** Normaliseert een buitenlandse postcode, of null als die niet klopt. */
export function normForeignPostcode(country: Exclude<Country, 'NL'>, raw: string): string | null {
  const m = POSTAL[country].re.exec(raw.replace(/\s+/g, ''));
  return m ? (country === 'LU' ? `L-${m[1]}` : m[1]) : null;
}
export const postalExample = (c: Exclude<Country, 'NL'>) => POSTAL[c].example;

export interface ForeignAirport { code: string; name: string; street: string; postcode: string; city: string; country: Exclude<Country, 'NL'>; lat: number; lon: number }
export const FOREIGN_AIRPORTS: ForeignAirport[] = [
  { code: 'DUS', name: 'Düsseldorf Airport', street: 'Flughafenstraße 105', postcode: '40474', city: 'Düsseldorf', country: 'DE', lat: 51.2894, lon: 6.7667 },
  { code: 'BRU', name: 'Brussels Airport (Zaventem)', street: 'Leopoldlaan', postcode: '1930', city: 'Zaventem', country: 'BE', lat: 50.9010, lon: 4.4856 },
  { code: 'NRN', name: 'Weeze Airport', street: 'Flughafen-Ring 1', postcode: '47652', city: 'Weeze', country: 'DE', lat: 51.6025, lon: 6.1422 },
  { code: 'CRL', name: 'Brussels South Charleroi Airport', street: 'Rue des Frères Wright 8', postcode: '6041', city: 'Gosselies', country: 'BE', lat: 50.4592, lon: 4.4538 },
  { code: 'CGN', name: 'Köln Bonn Airport', street: 'Kennedystraße', postcode: '51147', city: 'Köln', country: 'DE', lat: 50.8659, lon: 7.1427 },
];
export const isForeignAirportPostcode = (country: string, postcode: string) => FOREIGN_AIRPORTS.some(a => a.country === country && a.postcode === postcode);

/** Herkent een buitenlandse luchthaven in vrije tekst (snelformulier, bestemmingspagina's). */
export function findForeignAirport(text: string): ForeignAirport | undefined {
  const t = text.toLowerCase();
  const keys: [string, string][] = [['düsseldorf airport', 'DUS'], ['dusseldorf airport', 'DUS'], ['flughafen düsseldorf', 'DUS'], ['brussels airport', 'BRU'], ['zaventem', 'BRU'],
    ['weeze', 'NRN'], ['charleroi', 'CRL'], ['köln bonn', 'CGN'], ['keulen bonn', 'CGN'], ['koln bonn', 'CGN']];
  const hit = keys.find(([k]) => t.includes(k));
  return hit ? FOREIGN_AIRPORTS.find(a => a.code === hit[1]) : undefined;
}

export interface Destination {
  slug: string; name: string; country: Exclude<Country, 'NL'>; kind: 'stad' | 'luchthaven'; airport?: string;
  lat: number; lon: number; volume: number; keywords: string[];
}
export const DESTINATIONS: Destination[] = [
  { slug: 'antwerpen', name: 'Antwerpen', country: 'BE', kind: 'stad', lat: 51.2194, lon: 4.4025, volume: 390, keywords: ['taxi antwerpen', 'taxi naar antwerpen'] },
  { slug: 'dusseldorf-airport', name: 'Düsseldorf Airport', country: 'DE', kind: 'luchthaven', airport: 'DUS', lat: 51.2894, lon: 6.7667, volume: 710, keywords: ['taxi dusseldorf airport', 'taxi naar dusseldorf airport'] },
  { slug: 'dusseldorf', name: 'Düsseldorf', country: 'DE', kind: 'stad', lat: 51.2277, lon: 6.7735, volume: 280, keywords: ['taxi dusseldorf', 'taxi naar dusseldorf'] },
  { slug: 'brussels-airport', name: 'Brussels Airport (Zaventem)', country: 'BE', kind: 'luchthaven', airport: 'BRU', lat: 50.9010, lon: 4.4856, volume: 450, keywords: ['taxi brussel airport', 'taxi naar brussel airport', 'taxi zaventem'] },
  { slug: 'parijs', name: 'Parijs', country: 'FR', kind: 'stad', lat: 48.8566, lon: 2.3522, volume: 210, keywords: ['taxi naar parijs'] },
  { slug: 'gent', name: 'Gent', country: 'BE', kind: 'stad', lat: 51.0543, lon: 3.7174, volume: 140, keywords: ['taxi naar gent'] },
  { slug: 'brussel', name: 'Brussel', country: 'BE', kind: 'stad', lat: 50.8467, lon: 4.3525, volume: 140, keywords: ['taxi brussel', 'taxi naar brussel'] },
  { slug: 'weeze-airport', name: 'Weeze Airport', country: 'DE', kind: 'luchthaven', airport: 'NRN', lat: 51.6025, lon: 6.1422, volume: 180, keywords: ['taxi weeze airport', 'taxi naar weeze airport'] },
  { slug: 'charleroi-airport', name: 'Brussels South Charleroi Airport', country: 'BE', kind: 'luchthaven', airport: 'CRL', lat: 50.4592, lon: 4.4538, volume: 130, keywords: ['taxi charleroi airport', 'taxi naar charleroi'] },
  { slug: 'keulen-bonn-airport', name: 'Köln Bonn Airport', country: 'DE', kind: 'luchthaven', airport: 'CGN', lat: 50.8659, lon: 7.1427, volume: 70, keywords: ['taxi keulen airport'] },
];
export const findDestination = (slug: string) => DESTINATIONS.find(d => d.slug === slug) || null;
