/**
 * De steden met de meeste zoekvraag naar "taxi [stad]" (eerst 50, op 23-11-2026 uitgebreid tot 73).
 * Bron: Google Keyword Planner, Nederland, Nederlandstalig, gemiddeld per maand over 12 maanden (opgevraagd 23-11-2026).
 * Coördinaten van het centrum (afgerond) en een postcode in het centrum; alleen gebruikt voor afstanden en werkgebied.
 */
import { AIRPORTS } from './airports.ts';

export interface City { slug: string; name: string; province: string; lat: number; lon: number; pc4: number; volume: number }

const C = (name: string, province: string, lat: number, lon: number, pc4: number, volume: number, slug?: string): City =>
  ({ name, province, lat, lon, pc4, volume, slug: slug || name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') });

export const CITIES: City[] = [
  C('Rotterdam', 'Zuid-Holland', 51.9225, 4.4792, 3011, 12100),
  C('Den Haag', 'Zuid-Holland', 52.0705, 4.3007, 2511, 12100),
  C('Amsterdam', 'Noord-Holland', 52.3728, 4.8936, 1012, 9900),
  C('Utrecht', 'Utrecht', 52.0907, 5.1214, 3511, 6600),
  C('Groningen', 'Groningen', 53.2194, 6.5665, 9711, 6600),
  C('Haarlem', 'Noord-Holland', 52.3874, 4.6462, 2011, 5400),
  C('Eindhoven', 'Noord-Brabant', 51.4416, 5.4697, 5611, 4400),
  C('Breda', 'Noord-Brabant', 51.5719, 4.7683, 4811, 4400),
  C('Enschede', 'Overijssel', 52.2215, 6.8937, 7511, 3600),
  C('Zwolle', 'Overijssel', 52.5168, 6.0830, 8011, 3600),
  C('Dordrecht', 'Zuid-Holland', 51.8133, 4.6901, 3311, 3600),
  C('Arnhem', 'Gelderland', 51.9851, 5.8987, 6811, 2900),
  C('Maastricht', 'Limburg', 50.8514, 5.6910, 6211, 2900),
  C('Almere', 'Flevoland', 52.3508, 5.2647, 1315, 2400),
  C('Nijmegen', 'Gelderland', 51.8126, 5.8372, 6511, 2400),
  C('Leeuwarden', 'Friesland', 53.2012, 5.7999, 8911, 2400),
  C('Delft', 'Zuid-Holland', 52.0116, 4.3571, 2611, 2400),
  C('Hengelo', 'Overijssel', 52.2658, 6.7931, 7551, 2400),
  C('Tilburg', 'Noord-Brabant', 51.5555, 5.0913, 5038, 1900),
  C('Apeldoorn', 'Gelderland', 52.2112, 5.9699, 7311, 1900),
  C('Den Bosch', 'Noord-Brabant', 51.6978, 5.3037, 5211, 1900),
  C('Leiden', 'Zuid-Holland', 52.1601, 4.4970, 2311, 1900),
  C('Hilversum', 'Noord-Holland', 52.2292, 5.1669, 1211, 1900),
  C('Lelystad', 'Flevoland', 52.5185, 5.4714, 8232, 1900),
  C('Roermond', 'Limburg', 51.1942, 5.9870, 6041, 1900),
  C('Doetinchem', 'Gelderland', 51.9654, 6.2886, 7001, 1900),
  C('Middelburg', 'Zeeland', 51.4988, 3.6136, 4331, 1900),
  C('Hellevoetsluis', 'Zuid-Holland', 51.8322, 4.1333, 3221, 1900),
  C('Amersfoort', 'Utrecht', 52.1561, 5.3878, 3811, 1600),
  C('Zaandam', 'Noord-Holland', 52.4420, 4.8292, 1506, 1600),
  C('Alkmaar', 'Noord-Holland', 52.6324, 4.7534, 1811, 1600),
  C('Venlo', 'Limburg', 51.3704, 6.1724, 5911, 1600),
  C('Deventer', 'Overijssel', 52.2550, 6.1639, 7411, 1600),
  C('Den Helder', 'Noord-Holland', 52.9563, 4.7600, 1781, 1600),
  C('Assen', 'Drenthe', 52.9925, 6.5649, 9401, 1600),
  C('Zoetermeer', 'Zuid-Holland', 52.0575, 4.4931, 2711, 1300),
  C('Emmen', 'Drenthe', 52.7792, 6.9069, 7811, 1300),
  C('Hoorn', 'Noord-Holland', 52.6425, 5.0597, 1621, 1300),
  C('Gouda', 'Zuid-Holland', 52.0115, 4.7105, 2801, 1300),
  C('Almelo', 'Overijssel', 52.3567, 6.6625, 7607, 1300),
  C('Harderwijk', 'Gelderland', 52.3417, 5.6206, 3841, 1300),
  C('Oldenzaal', 'Overijssel', 52.3133, 6.9292, 7571, 1300),
  C('Sittard', 'Limburg', 51.0016, 5.8689, 6131, 1000),
  C('Heerlen', 'Limburg', 50.8882, 5.9795, 6411, 1000),
  C('Schiedam', 'Zuid-Holland', 51.9192, 4.3989, 3111, 1000),
  C('Vlissingen', 'Zeeland', 51.4426, 3.5736, 4381, 1000),
  C('Drachten', 'Friesland', 53.1050, 6.0989, 9201, 1000),
  C('Sneek', 'Friesland', 53.0331, 5.6597, 8601, 1000),
  C('Heerenveen', 'Friesland', 52.9600, 5.9250, 8441, 1000),
  C('Helmond', 'Noord-Brabant', 51.4793, 5.6570, 5701, 880),
  // Uitbreiding 23-11-2026: alle overige plaatsen met minimaal ca. 500 zoekopdrachten per maand
  C('Texel', 'Noord-Holland', 53.0544, 4.7972, 1791, 1000),
  C('Bergen op Zoom', 'Noord-Brabant', 51.4949, 4.2911, 4611, 880),
  C('Meppel', 'Drenthe', 52.6956, 6.1944, 7941, 880),
  C('Amstelveen', 'Noord-Holland', 52.3114, 4.8701, 1181, 720),
  C('Ede', 'Gelderland', 52.0402, 5.6649, 6711, 720),
  C('Oss', 'Noord-Brabant', 51.7650, 5.5183, 5341, 720),
  C('Purmerend', 'Noord-Holland', 52.5050, 4.9597, 1441, 720),
  C('Spijkenisse', 'Zuid-Holland', 51.8450, 4.3297, 3201, 720),
  C('Vlaardingen', 'Zuid-Holland', 51.9122, 4.3419, 3131, 720),
  C('Zeist', 'Utrecht', 52.0894, 5.2333, 3701, 720),
  C('Zutphen', 'Gelderland', 52.1386, 6.2006, 7201, 720),
  C('Weert', 'Limburg', 51.2517, 5.7069, 6001, 720),
  C('Alphen aan den Rijn', 'Zuid-Holland', 52.1293, 4.6555, 2405, 590),
  C('Roosendaal', 'Noord-Brabant', 51.5308, 4.4653, 4701, 590),
  C('Veenendaal', 'Utrecht', 52.0287, 5.5589, 3901, 590),
  C('Hoogeveen', 'Drenthe', 52.7225, 6.4764, 7901, 590),
  C('Beverwijk', 'Noord-Holland', 52.4833, 4.6569, 1941, 590),
  C('Tiel', 'Gelderland', 51.8867, 5.4292, 4001, 590),
  C('Gorinchem', 'Zuid-Holland', 51.8306, 4.9742, 4201, 590),
  C('IJmuiden', 'Noord-Holland', 52.4583, 4.6153, 1971, 590, 'ijmuiden'),
  C('Rijswijk', 'Zuid-Holland', 52.0363, 4.3253, 2281, 590),
  C('Zandvoort', 'Noord-Holland', 52.3713, 4.5331, 2042, 480),
  C('Hoofddorp', 'Noord-Holland', 52.3061, 4.6907, 2131, 480),
];

export const PROVINCES = [...new Set(CITIES.map(c => c.province))].sort((a, b) => a.localeCompare(b, 'nl'));
export const findCity = (slug: string) => CITIES.find(c => c.slug === slug) || null;

/** Afstand hemelsbreed in km (haversine). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371, rad = (d: number) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Afgerond op 5 km; onder 10 km op hele km. */
export const roundKm = (km: number) => km < 10 ? Math.max(1, Math.round(km)) : Math.round(km / 5) * 5;

const AIRPORT_COORDS: Record<string, { lat: number; lon: number }> = {
  AMS: { lat: 52.3086, lon: 4.7639 }, EIN: { lat: 51.4500, lon: 5.3747 }, RTM: { lat: 51.9569, lon: 4.4372 },
  MST: { lat: 50.9117, lon: 5.7701 }, GRQ: { lat: 53.1197, lon: 6.5794 },
};

/** Luchthavens gesorteerd op afstand; Schiphol staat er altijd bij. */
export function airportsFor(city: City) {
  return AIRPORTS.filter(a => AIRPORT_COORDS[a.code])
    .map(a => ({ ...a, km: roundKm(distanceKm(city, AIRPORT_COORDS[a.code])) }))
    .sort((a, b) => a.km - b.km);
}

export function nearbyCities(city: City, n = 6) {
  return CITIES.filter(c => c.slug !== city.slug).map(c => ({ c, km: distanceKm(city, c) })).sort((a, b) => a.km - b.km).slice(0, n).map(x => x.c);
}

/** Steden met zoekvolume voor "taxi [stad] schiphol" (Keyword Planner, NL, 23-11-2026; minimaal 70 per maand). */
export const SCHIPHOL_ROUTES: Record<string, number> = {
  utrecht: 1300, haarlem: 1300, almere: 1000, 'den-haag': 880, amersfoort: 480, zoetermeer: 480, amsterdam: 480, leiden: 390,
  rotterdam: 320, hilversum: 320, groningen: 260, breda: 170, arnhem: 170, delft: 170, alkmaar: 140, dordrecht: 140, lelystad: 140,
  eindhoven: 110, zaandam: 110, nijmegen: 90, gouda: 90, apeldoorn: 90, leeuwarden: 70, tilburg: 70,
};
export const hasSchipholRoute = (slug: string) => slug in SCHIPHOL_ROUTES;
export const routeCities = () => CITIES.filter(c => hasSchipholRoute(c.slug)).sort((a, b) => SCHIPHOL_ROUTES[b.slug] - SCHIPHOL_ROUTES[a.slug]);

/** Nederlandse luchthavens met een eigen pagina. */
export const AIRPORT_PAGES: { slug: string; code: string; short: string; volume: number }[] = [
  { slug: 'schiphol', code: 'AMS', short: 'Schiphol', volume: 12600 },
  { slug: 'rotterdam-the-hague-airport', code: 'RTM', short: 'Rotterdam The Hague Airport', volume: 1900 },
  { slug: 'eindhoven-airport', code: 'EIN', short: 'Eindhoven Airport', volume: 1600 },
  { slug: 'groningen-airport-eelde', code: 'GRQ', short: 'Groningen Airport Eelde', volume: 140 },
  { slug: 'maastricht-aachen-airport', code: 'MST', short: 'Maastricht Aachen Airport', volume: 70 },
];
export const findAirportPage = (slug: string) => AIRPORT_PAGES.find(a => a.slug === slug) || null;
export const airportCoords = (code: string) => AIRPORT_COORDS[code];

/** Dichtstbijzijnde steden bij een punt, met afstand. */
export function citiesNear(point: { lat: number; lon: number }, n = 8) {
  return CITIES.map(c => ({ c, km: roundKm(distanceKm(point, c)) })).sort((a, b) => a.km - b.km).slice(0, n);
}
