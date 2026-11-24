/**
 * Openbare cijfers per stad voor de stadspagina's. Alleen samengevoegde, echte platformgegevens;
 * prijzen en beoordelingen worden pas getoond vanaf een minimum aantal, anders niets (geen verzonnen cijfers).
 */
import { SYSTEM, withActor, one } from '../lib/db.ts';
import type { City } from '../lib/cities.ts';

export const MIN_PRICE_SAMPLES = 3;
export const MIN_REVIEWS = 3;

export interface CityStats {
  companies: number;
  schiphol: { n: number; min_cents: number; median_cents: number } | null;
  rating: { avg: number; count: number } | null;
}

const cache = new Map<string, { at: number; stats: CityStats }>();

export async function cityStats(city: City): Promise<CityStats> {
  const hit = cache.get(city.slug);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.stats;
  const stats = await withActor(SYSTEM, async tx => {
    // Actieve bedrijven met een werkgebied dat deze postcode dekt, of die landelijk rijden.
    const serving = `select c.id from companies c where c.status = 'actief' and exists (
        select 1 from company_service_areas csa join service_areas sa on sa.id = csa.service_area_id and sa.active
        where csa.company_id = c.id and (sa.code = 'landelijk' or exists (
          select 1 from service_area_postcode_ranges r where r.service_area_id = sa.id and $1 between r.postcode_from and r.postcode_to)))`;
    const companies = (await one(tx, `select count(*)::int n from (${serving}) s`, [city.pc4])).n;
    // Geboekte ritten vanuit deze stad naar Schiphol (niet geannuleerd).
    const p = await one(tx, `select count(*)::int n, min(k.total_price_cents)::int min_cents,
        (percentile_cont(0.5) within group (order by k.total_price_cents))::int median_cents
      from bookings k join ride_requests r on r.id = k.ride_request_id
      where k.status <> 'geannuleerd' and lower(r.pickup_city) = lower($1) and r.dropoff_postcode4 between 1117 and 1119`, [city.name]);
    const rv = await one(tx, `select count(*)::int n, avg(v.score)::float avg from reviews v
      where v.status = 'gepubliceerd' and v.company_id in (${serving})`, [city.pc4]);
    return {
      companies,
      schiphol: p.n >= MIN_PRICE_SAMPLES ? { n: p.n, min_cents: p.min_cents, median_cents: p.median_cents } : null,
      rating: rv.n >= MIN_REVIEWS ? { avg: Math.round(rv.avg * 10) / 10, count: rv.n } : null,
    };
  });
  cache.set(city.slug, { at: Date.now(), stats });
  return stats;
}

// ───────── Routes, luchthavens en buitenland ─────────
const cache2 = new Map<string, { at: number; v: any }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache2.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;
  const v = await fn(); cache2.set(key, { at: Date.now(), v }); return v;
}
type PriceStats = { n: number; min_cents: number; median_cents: number } | null;
const priceSql = (where: string) => `select count(*)::int n, min(k.total_price_cents)::int min_cents,
    (percentile_cont(0.5) within group (order by k.total_price_cents))::int median_cents
  from bookings k join ride_requests r on r.id = k.ride_request_id where k.status <> 'geannuleerd' and (${where})`;
const asStats = (p: any): PriceStats => p.n >= MIN_PRICE_SAMPLES ? { n: p.n, min_cents: p.min_cents, median_cents: p.median_cents } : null;

/** Geboekte ritten tussen een stad en Schiphol (beide richtingen). */
export function routeStats(city: City): Promise<PriceStats> {
  return cached(`route:${city.slug}`, () => withActor(SYSTEM, async tx => asStats(await one(tx, priceSql(
    `(lower(r.pickup_city) = lower($1) and r.dropoff_postcode4 between 1117 and 1119) or (lower(r.dropoff_city) = lower($1) and r.pickup_postcode4 between 1117 and 1119)`), [city.name]))));
}
/** Geboekte ritten van of naar een Nederlandse luchthaven. */
export function airportStats(code: string, pc4: number[]): Promise<PriceStats> {
  return cached(`ap:${code}`, () => withActor(SYSTEM, async tx => asStats(await one(tx, priceSql(`r.pickup_postcode4 = any($1::int[]) or r.dropoff_postcode4 = any($1::int[])`), [pc4]))));
}
/** Buitenland: aantal actieve bedrijven dat naar het buitenland rijdt en geboekte ritten naar deze plaats. */
export function abroadStats(city: string, country: string): Promise<{ companies: number; prices: PriceStats }> {
  return cached(`ab:${country}:${city}`, () => withActor(SYSTEM, async tx => ({
    companies: (await one(tx, `select count(*)::int n from companies where status = 'actief' and serves_abroad`)).n,
    prices: asStats(await one(tx, priceSql(`(lower(r.dropoff_city) = lower($1) and r.dropoff_country = $2) or (lower(r.pickup_city) = lower($1) and r.pickup_country = $2)`), [city, country])),
  })));
}
