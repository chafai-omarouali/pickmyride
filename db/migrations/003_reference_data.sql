-- PickMyRide — referentiedata en standaardinstellingen (alles aanpasbaar in de beheeromgeving)
set search_path = pickmyride, public;

insert into vehicle_categories (code, name_nl, max_passengers, max_large_bags, sort_order) values
  ('personenauto',  'Personenauto',  4, 2, 1),
  ('stationwagen',  'Stationwagen',  4, 4, 2),
  ('taxibus',       'Taxibus',       8, 8, 3);

-- Werkgebieden op basis van postcodereeksen. LET OP: grove startindeling,
-- door de beheerder te controleren en aan te passen.
insert into service_areas (code, name, note) values
  ('schiphol',          'Schiphol',                         'Postcodes 1117–1119'),
  ('amsterdam',         'Amsterdam e.o.',                   'Startindeling — controleren'),
  ('noord-holland-nz',  'Noord-Holland (overig)',           'Startindeling — controleren'),
  ('zuid-holland',      'Zuid-Holland',                     'Startindeling — controleren'),
  ('utrecht',           'Utrecht',                          'Startindeling — controleren'),
  ('flevoland',         'Flevoland',                        'Startindeling — controleren');

insert into service_area_postcode_ranges (service_area_id, postcode_from, postcode_to)
select id, f, t from service_areas s join (values
  ('schiphol', 1117, 1119),
  ('amsterdam', 1000, 1116), ('amsterdam', 1120, 1199),
  ('noord-holland-nz', 1200, 1299), ('noord-holland-nz', 1400, 1999), ('noord-holland-nz', 2000, 2199),
  ('flevoland', 1300, 1399), ('flevoland', 8200, 8299),
  ('zuid-holland', 2200, 3399),
  ('utrecht', 3400, 3999)
) v(code, f, t) on v.code = s.code;

insert into platform_settings (key, value, description) values
  ('min_lead_hours',          '24',  'Minimale voorbereidingstijd (uren) tussen aanvraag en ophaalmoment'),
  ('bidding_window_hours',    '12',  'Standaard biedtermijn in uren na openstellen van de aanvraag'),
  ('booking_cutoff_hours',    '4',   'Laatst toegestane boekingsmoment: zoveel uur vóór ophalen'),
  ('min_bidding_window_hours','2',   'Een aanvraag wordt alleen geopend als er minstens zoveel uur biedtijd overblijft'),
  ('reservation_minutes',     '10',  'Hoe lang een gekozen aanbod tijdelijk gereserveerd blijft tijdens betalen'),
  ('max_offers_shown',        '3',   'Aantal aanbiedingen dat de klant standaard ziet'),
  ('terms_version',           '"concept-2026-11"', 'Versie van de voorwaarden waarmee de klant akkoord gaat'),
  ('partner_agreement_version','"concept-2026-11"', 'Versie van de partnerovereenkomst'),
  ('vat_note',                '"Btw-behandeling nog vast te stellen door boekhouder"', 'Btw-toelichting op boekingen (fiscaal te bevestigen)');

insert into commission_rules (name, percent_bp, fixed_cents, min_cents, is_demo, active)
values ('DEMO-instelling 12%', 1200, 0, 0, true, true);
