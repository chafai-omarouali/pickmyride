import { CITIES, AIRPORT_PAGES } from '../lib/cities.ts';
import { DESTINATIONS } from '../lib/abroad.ts';
import { TOPIC_PAGES } from './pages/topics.tsx';

/** Footerblok met alle steden, luchthavens, buitenland en diensten. */
export function FooterCities() {
  return (
    <nav className="footer-cities" aria-label="Taxi per stad">
      <p className="footer-cities-title"><a href="/taxi">Taxi per stad</a></p>
      <ul>{[...CITIES].sort((a, b) => a.name.localeCompare(b.name, 'nl')).map(c => <li key={c.slug}><a href={`/taxi/${c.slug}`}>{`Taxi ${c.name}`}</a></li>)}</ul>
      <div className="footer-cities-extra">
        <div><p className="footer-cities-title">Diensten</p>
          <ul>{TOPIC_PAGES.map(([h, t]) => <li key={h}><a href={h}>{t}</a></li>)}</ul></div>
        <div><p className="footer-cities-title"><a href="/luchthavens">Luchthavens</a></p>
          <ul>{AIRPORT_PAGES.map(a => <li key={a.slug}><a href={`/luchthaven/${a.slug}`}>{`Taxi ${a.short}`}</a></li>)}</ul></div>
        <div><p className="footer-cities-title"><a href="/buitenland">Buitenland</a></p>
          <ul>{DESTINATIONS.map(d => <li key={d.slug}><a href={`/buitenland/${d.slug}`}>{`Taxi naar ${d.name}`}</a></li>)}</ul></div>
      </div>
    </nav>
  );
}
