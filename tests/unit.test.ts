import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { amsterdamToUtc, formatDateTime } from '../src/lib/time.ts';
import { parseEuroToCents, calculateCommission } from '../src/lib/money.ts';
import { scrubPersonalData, hashPassword, verifyPassword } from '../src/lib/security.ts';
import { canTransition, BOOKING_STATUS, BID_STATUS } from '../src/domain/status.ts';
import { splitSql } from '../scripts/migrate.ts';

describe('Tijdzone Europe/Amsterdam', () => {
  it('wintertijd (UTC+1) en zomertijd (UTC+2)', () => {
    const w = amsterdamToUtc('2026-01-15', '09:00'); assert.ok(w.ok); assert.equal(w.ok && w.date.toISOString(), '2026-01-15T08:00:00.000Z');
    const s = amsterdamToUtc('2026-07-15', '09:00'); assert.ok(s.ok); assert.equal(s.ok && s.date.toISOString(), '2026-07-15T07:00:00.000Z');
  });
  it('niet-bestaand tijdstip bij overgang naar zomertijd wordt geweigerd', () => {
    const r = amsterdamToUtc('2026-03-29', '02:30'); assert.equal(r.ok, false);
  });
  it('dubbel tijdstip bij overgang naar wintertijd wordt eenduidig gekozen', () => {
    const r = amsterdamToUtc('2026-10-25', '02:30'); assert.ok(r.ok); assert.match(formatDateTime((r as any).date), /02:30/);
  });
  it('ongeldige datum', () => { assert.equal(amsterdamToUtc('2026-02-30', '10:00').ok, false); });
});

describe('Geld in centen', () => {
  it('parset Nederlandse notaties', () => {
    assert.equal(parseEuroToCents('65'), 6500); assert.equal(parseEuroToCents('65,5'), 6550); assert.equal(parseEuroToCents('€ 1.065,50'), 106550);
    assert.equal(parseEuroToCents('65.50'), 6550); assert.equal(parseEuroToCents('1.000'), 100000); assert.equal(parseEuroToCents('abc'), null); assert.equal(parseEuroToCents('-5'), null);
  });
  it('commissie: percentage, vast bedrag, minimum, afronding, som klopt altijd', () => {
    assert.deepEqual(calculateCommission(5500, { percent_bp: 1200, fixed_cents: 0, min_cents: 0 }), { commissionCents: 660, payoutCents: 4840 });
    assert.deepEqual(calculateCommission(4999, { percent_bp: 1200, fixed_cents: 0, min_cents: 0 }), { commissionCents: 600, payoutCents: 4399 });
    assert.deepEqual(calculateCommission(1000, { percent_bp: 500, fixed_cents: 100, min_cents: 300 }), { commissionCents: 300, payoutCents: 700 });
    for (let c = 500; c < 20000; c += 37) { const r = calculateCommission(c, { percent_bp: 1234, fixed_cents: 25, min_cents: 0 }); assert.equal(r.commissionCents + r.payoutCents, c); }
  });
});

describe('Privacy en beveiliging', () => {
  it('schoont contactgegevens uit vrije tekst', () => {
    const s = scrubPersonalData('Bel 06-12345678 of +31 6 1234 5678, mail jan@voorbeeld.nl, adres 1012 AB 12');
    assert.doesNotMatch(s, /12345678|jan@|1012 AB/);
  });
  it('wachtwoord-hash', () => { const h = hashPassword('geheim-wachtwoord'); assert.ok(verifyPassword('geheim-wachtwoord', h)); assert.ok(!verifyPassword('fout', h)); assert.ok(!verifyPassword('x', null)); });
});

describe('Statusmodel', () => {
  it('rollen en overgangen', () => {
    assert.ok(canTransition(BOOKING_STATUS, 'bevestigd', 'chauffeur_toegewezen', 'company'));
    assert.ok(!canTransition(BOOKING_STATUS, 'bevestigd', 'geannuleerd', 'company'));
    assert.ok(!canTransition(BOOKING_STATUS, 'bevestigd', 'afgerond', 'company'));
    assert.ok(!canTransition(BID_STATUS, 'gereserveerd', 'ingetrokken', 'company'));
    assert.ok(canTransition(BID_STATUS, 'actief', 'ingetrokken', 'company'));
  });
});

describe('Migraties', () => {
  it('splitst SQL met $$-blokken correct', () => {
    assert.equal(splitSql(`create table a(x int); do $$ begin perform 1; end $$; select ';';`).length, 3);
  });
});
