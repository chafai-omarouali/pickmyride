-- PickMyRide — basisschema (PostgreSQL 15+/Supabase-compatibel)
-- Alle bedragen in gehele centen (integer). Alle tijden als timestamptz (UTC intern),
-- weergave in Europe/Amsterdam gebeurt in de applicatie.

create schema if not exists pickmyride;
set search_path = pickmyride, public;

-- ───────────────────────── Gebruikers en sessies ─────────────────────────
create table users (
  id               uuid primary key default gen_random_uuid(),
  email            text not null,
  password_hash    text,                       -- null = alleen e-maillink (gast)
  role             text not null check (role in ('customer','company','admin')),
  full_name        text not null,
  phone            text,
  email_verified_at timestamptz,
  disabled_at      timestamptz,
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now()
);
create unique index users_email_uq on users (lower(email));

create table customer_profiles (
  user_id               uuid primary key references users(id) on delete cascade,
  marketing_consent     boolean not null default false,
  marketing_consent_at  timestamptz,
  created_at            timestamptz not null default now()
);

create table sessions (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  ip          text,
  user_agent  text
);

-- Eenmalige links (aanvraagtoegang/e-mailverificatie)
create table access_tokens (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique,
  user_id     uuid not null references users(id) on delete cascade,
  purpose     text not null check (purpose in ('login_link','request_access')),
  request_group_id uuid,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ───────────────────────── Referentiedata (beheerbaar) ─────────────────────────
create table vehicle_categories (
  code             text primary key,
  name_nl          text not null,
  max_passengers   int  not null check (max_passengers between 1 and 20),
  max_large_bags   int  not null check (max_large_bags >= 0),
  sort_order       int  not null default 0,
  active           boolean not null default true
);

create table service_areas (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  active      boolean not null default true,
  note        text
);
-- Postcodereeksen (4 cijfers) per werkgebied; beheerder past aan.
create table service_area_postcode_ranges (
  id              uuid primary key default gen_random_uuid(),
  service_area_id uuid not null references service_areas(id) on delete cascade,
  postcode_from   int not null check (postcode_from between 1000 and 9999),
  postcode_to     int not null check (postcode_to between 1000 and 9999),
  check (postcode_to >= postcode_from)
);

-- ───────────────────────── Taxibedrijven ─────────────────────────
create table companies (
  id                 uuid primary key default gen_random_uuid(),
  legal_name         text not null,
  trade_name         text not null,
  kvk_number         text not null,
  vat_number         text,
  contact_name       text not null,
  email              text not null,
  phone              text not null,
  address_street     text not null,
  address_postcode   text not null,
  address_city       text not null,
  license_number     text,
  license_expires_on date,
  status             text not null default 'in_beoordeling'
                       check (status in ('in_beoordeling','actief','afgewezen','geschorst')),
  partner_agreement_version     text,
  partner_agreement_accepted_at timestamptz,
  reviewed_by        uuid references users(id),
  reviewed_at        timestamptz,
  review_note        text,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index companies_kvk_uq on companies (kvk_number);

create table company_memberships (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner','dispatcher')),
  created_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
create unique index company_memberships_user_uq on company_memberships(user_id);

create table company_service_areas (
  company_id      uuid not null references companies(id) on delete cascade,
  service_area_id uuid not null references service_areas(id) on delete cascade,
  primary key (company_id, service_area_id)
);

create table company_vehicle_categories (
  company_id     uuid not null references companies(id) on delete cascade,
  category_code  text not null references vehicle_categories(code),
  max_passengers int not null check (max_passengers between 1 and 20),
  max_large_bags int not null check (max_large_bags >= 0),
  primary key (company_id, category_code)
);

create table company_documents (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  doc_type            text not null check (doc_type in ('kvk_uittreksel','taxivergunning','verzekering','overig')),
  storage_key         text not null unique,     -- privé opslag, nooit publiek pad
  original_filename   text not null,
  mime_type           text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes          int  not null check (size_bytes > 0 and size_bytes <= 5242880),
  expires_on          date,
  uploaded_by         uuid references users(id),
  uploaded_at         timestamptz not null default now(),
  verification_status text not null default 'niet_gecontroleerd'
                        check (verification_status in ('niet_gecontroleerd','goedgekeurd','afgekeurd')),
  verified_by         uuid references users(id),
  verified_at         timestamptz,
  verification_note   text
);

create table vehicles (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  category_code  text not null references vehicle_categories(code),
  description    text not null,          -- merk/model/kleur
  license_plate  text not null,
  max_passengers int  not null check (max_passengers between 1 and 20),
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table drivers (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  full_name        text not null,
  phone            text not null,
  driver_pass_number text,
  pass_expires_on  date,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ───────────────────────── Aanvragen ─────────────────────────
create sequence request_ref_seq start 1001;

create table request_groups (
  id                 uuid primary key default gen_random_uuid(),
  public_ref         text not null unique,
  customer_user_id   uuid not null references users(id),
  trip_type          text not null check (trip_type in ('enkel','retour')),
  terms_version      text not null,
  terms_accepted_at  timestamptz not null,
  marketing_consent  boolean not null default false,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now()
);

-- Eén rij per afzonderlijke rit (heen / terug). Bevat alleen gegevens die
-- bieders mogen zien. Exacte adressen en contactgegevens staan in ride_request_private.
create table ride_requests (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references request_groups(id) on delete cascade,
  leg                text not null check (leg in ('heen','terug')),
  status             text not null default 'concept'
                       check (status in ('concept','open','verlopen','gesloten','geannuleerd')),
  pickup_at          timestamptz not null,
  pickup_city        text not null,
  pickup_postcode4   int  not null,
  pickup_area_id     uuid references service_areas(id),
  dropoff_city       text not null,
  dropoff_postcode4  int  not null,
  dropoff_area_id    uuid references service_areas(id),
  stop_city          text,
  passengers         int  not null check (passengers between 1 and 20),
  large_bags         int  not null default 0 check (large_bags between 0 and 30),
  hand_bags          int  not null default 0 check (hand_bags between 0 and 30),
  vehicle_category   text not null references vehicle_categories(code),
  child_seats        int  not null default 0 check (child_seats between 0 and 4),
  is_airport         boolean not null default false,
  notes_for_bidders  text,             -- automatisch geschoonde opmerking
  has_private_notes  boolean not null default false,
  distance_m         int,              -- null = niet berekend (geen routeprovider)
  duration_s         int,
  route_source       text not null default 'geen' check (route_source in ('provider','geen')),
  bidding_closes_at  timestamptz not null,
  booking_cutoff_at  timestamptz not null,  -- laatst toegestane boekingsmoment
  opened_at          timestamptz,
  closed_at          timestamptz,
  created_at         timestamptz not null default now(),
  unique (group_id, leg),
  check (bidding_closes_at <= booking_cutoff_at),
  check (booking_cutoff_at <= pickup_at)
);
create index ride_requests_status_idx on ride_requests(status, bidding_closes_at);

create table ride_request_private (
  ride_request_id  uuid primary key references ride_requests(id) on delete cascade,
  pickup_address   text not null,
  pickup_lat       double precision,
  pickup_lng       double precision,
  dropoff_address  text not null,
  dropoff_lat      double precision,
  dropoff_lng      double precision,
  stop_address     text,
  flight_number    text,
  customer_notes   text,
  contact_name     text not null,
  contact_email    text not null,
  contact_phone    text not null
);

-- ───────────────────────── Commissie ─────────────────────────
create table commission_rules (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  percent_bp   int  not null check (percent_bp between 0 and 10000),  -- 1200 = 12,00%
  fixed_cents  int  not null default 0 check (fixed_cents >= 0),
  min_cents    int  not null default 0 check (min_cents >= 0),
  is_demo      boolean not null default false,
  active       boolean not null default false,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now()
);
create unique index commission_rules_one_active on commission_rules(active) where active;

-- ───────────────────────── Biedingen ─────────────────────────
create table bids (
  id                   uuid primary key default gen_random_uuid(),
  ride_request_id      uuid not null references ride_requests(id) on delete cascade,
  company_id           uuid not null references companies(id),
  status               text not null default 'actief'
                         check (status in ('actief','gereserveerd','geaccepteerd','ingetrokken','verlopen','niet_gekozen')),
  total_price_cents    int  not null check (total_price_cents between 500 and 500000),
  vehicle_category     text not null references vehicle_categories(code),
  max_passengers       int  not null check (max_passengers between 1 and 20),
  max_large_bags       int  not null check (max_large_bags >= 0),
  included_services    text[] not null default '{}',
  included_wait_minutes int not null check (included_wait_minutes between 0 and 240),
  flight_delay_policy  text not null,
  cancellation_policy  text not null,
  valid_until          timestamptz not null,
  note                 text,
  commission_rule_id   uuid references commission_rules(id),
  commission_cents     int not null check (commission_cents >= 0),
  payout_cents         int not null check (payout_cents >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (commission_cents + payout_cents = total_price_cents)
);
-- Maximaal één lopend bod per bedrijf per rit
create unique index bids_one_live_per_company on bids(ride_request_id, company_id)
  where status in ('actief','gereserveerd','geaccepteerd');
-- Maximaal één gereserveerd óf geaccepteerd bod per rit (voorkomt dubbele toewijzing)
create unique index bids_one_taken_per_ride on bids(ride_request_id)
  where status in ('gereserveerd','geaccepteerd');

-- ───────────────────────── Reserveringen, betalingen, boekingen ─────────────────────────
create table reservations (
  id               uuid primary key default gen_random_uuid(),
  bid_id           uuid not null references bids(id),
  ride_request_id  uuid not null references ride_requests(id),
  customer_user_id uuid not null references users(id),
  status           text not null default 'actief' check (status in ('actief','omgezet','verlopen','vrijgegeven')),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  ended_at         timestamptz
);
create unique index reservations_one_active_per_ride on reservations(ride_request_id) where status = 'actief';

create sequence booking_number_seq start 100001;

create table bookings (
  id                 uuid primary key default gen_random_uuid(),
  booking_number     text not null unique,
  ride_request_id    uuid not null unique references ride_requests(id),
  bid_id             uuid not null unique references bids(id),
  company_id         uuid not null references companies(id),
  customer_user_id   uuid not null references users(id),
  status             text not null default 'bevestigd'
                       check (status in ('bevestigd','chauffeur_toegewezen','onderweg','aangekomen',
                                         'passagier_opgehaald','afgerond','geannuleerd','probleem_gemeld')),
  total_price_cents  int not null,
  commission_cents   int not null,
  payout_cents       int not null,
  commission_rule_snapshot jsonb not null,   -- vastgelegde regel; latere tariefwijziging verandert dit niet
  vat_note           text,
  driver_id          uuid references drivers(id),
  vehicle_id         uuid references vehicles(id),
  confirmed_at       timestamptz not null default now(),
  cancelled_at       timestamptz,
  cancellation_reason text,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  check (commission_cents + payout_cents = total_price_cents)
);

create table payments (
  id                  uuid primary key default gen_random_uuid(),
  reservation_id      uuid not null references reservations(id),
  ride_request_id     uuid not null references ride_requests(id),
  customer_user_id    uuid not null references users(id),
  booking_id          uuid references bookings(id),
  provider            text not null check (provider in ('demo','mollie','stripe')),
  provider_payment_id text unique,
  amount_cents        int not null check (amount_cents > 0),
  refunded_cents      int not null default 0 check (refunded_cents >= 0),
  currency            text not null default 'EUR',
  status              text not null default 'in_behandeling'
                        check (status in ('in_behandeling','geslaagd','mislukt','gedeeltelijk_terugbetaald','volledig_terugbetaald')),
  is_simulated        boolean not null,
  checkout_url        text,
  needs_attention     text,     -- bijv. betaald na verlopen reservering
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  paid_at             timestamptz,
  check (refunded_cents <= amount_cents)
);
-- Hoogstens één geslaagde betaling per rit
create unique index payments_one_success_per_ride on payments(ride_request_id)
  where status in ('geslaagd','gedeeltelijk_terugbetaald','volledig_terugbetaald') and needs_attention is null;

-- Idempotentie van betaalmeldingen
create table payment_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_event_id  text not null,
  provider_payment_id text,
  payload            jsonb not null,
  received_at        timestamptz not null default now(),
  processed_at       timestamptz,
  result             text,
  unique (provider, provider_event_id)
);

create table refunds (
  id                 uuid primary key default gen_random_uuid(),
  payment_id         uuid not null references payments(id),
  booking_id         uuid references bookings(id),
  amount_cents       int not null check (amount_cents > 0),
  reason             text not null,
  status             text not null default 'aangevraagd' check (status in ('aangevraagd','verwerkt','mislukt')),
  provider_refund_id text,
  is_simulated       boolean not null,
  initiated_by       uuid references users(id),
  created_at         timestamptz not null default now(),
  processed_at       timestamptz
);

create table payouts (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null unique references bookings(id),
  company_id    uuid not null references companies(id),
  amount_cents  int not null check (amount_cents >= 0),
  status        text not null default 'nog_niet_beschikbaar'
                  check (status in ('nog_niet_beschikbaar','gepland','uitbetaald','geblokkeerd','mislukt')),
  scheduled_for date,
  paid_at       timestamptz,
  provider_ref  text,
  created_at    timestamptz not null default now()
);

-- ───────────────────────── Geschiedenis, beoordelingen, meldingen, support, audit ─────────────────────────
create table status_history (
  id            bigserial primary key,
  entity_type   text not null check (entity_type in ('ride_request','bid','booking','payment','payout','company','reservation','refund')),
  entity_id     uuid not null,
  from_status   text,
  to_status     text not null,
  actor_user_id uuid,
  actor_role    text not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index status_history_entity_idx on status_history(entity_type, entity_id, created_at);

create table reviews (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null unique references bookings(id),
  company_id        uuid not null references companies(id),
  customer_user_id  uuid not null references users(id),
  score             int not null check (score between 1 and 5),
  body              text,
  status            text not null default 'gepubliceerd' check (status in ('gepubliceerd','verborgen','in_moderatie')),
  moderated_by      uuid references users(id),
  moderated_at      timestamptz,
  moderation_reason text,
  created_at        timestamptz not null default now()
);

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  dedupe_key    text not null unique,
  channel       text not null default 'email' check (channel in ('email')),
  to_address    text not null,
  template      text not null,
  subject       text not null,
  body_text     text not null,
  status        text not null default 'wachtrij' check (status in ('wachtrij','verzonden','mislukt','alleen_outbox')),
  attempts      int not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create table support_requests (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('contact','klacht','hulp','wijziging','annulering','bedrijf')),
  user_id          uuid references users(id),
  booking_id       uuid references bookings(id),
  request_group_id uuid references request_groups(id),
  company_id       uuid references companies(id),
  name             text,
  email            text,
  subject          text not null,
  body             text not null,
  status           text not null default 'open' check (status in ('open','in_behandeling','afgehandeld')),
  handled_by       uuid references users(id),
  resolution       text,
  created_at       timestamptz not null default now()
);

create table audit_logs (
  id             bigserial primary key,
  actor_user_id  uuid,
  actor_role     text not null,
  action         text not null,
  entity_type    text,
  entity_id      text,
  details        jsonb not null default '{}',
  ip             text,
  created_at     timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs(created_at desc);

create table platform_settings (
  key          text primary key,
  value        jsonb not null,
  description  text not null,
  updated_by   uuid references users(id),
  updated_at   timestamptz not null default now()
);

create table rate_limits (
  bucket        text not null,
  window_start  timestamptz not null,
  hits          int not null default 1,
  primary key (bucket, window_start)
);

create table error_log (
  id         bigserial primary key,
  level      text not null,
  message    text not null,
  context    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
