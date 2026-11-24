-- PickMyRide — communicatie tussen klant en taxibedrijf (chat en afgeschermd bellen)
-- Uitgangspunten (besloten 23-11-2026):
--  * Het taxibedrijf ziet NOOIT het telefoonnummer of e-mailadres van de klant; bellen loopt via een afgeschermd nummer.
--  * Contact is alleen mogelijk bij een bevestigde boeking, van bevestiging tot 24 uur na het ophaalmoment.
set search_path = pickmyride, public;

-- ───────── 1. Contactgegevens van de klant afschermen voor bedrijven ─────────
create table ride_request_contact (
  ride_request_id uuid primary key references ride_requests(id) on delete cascade,
  contact_email   text not null,
  contact_phone   text not null
);
insert into ride_request_contact select ride_request_id, contact_email, contact_phone from ride_request_private;
alter table ride_request_private drop column contact_email, drop column contact_phone;

alter table ride_request_contact enable row level security;
alter table ride_request_contact force row level security;
create policy staff_all on ride_request_contact for all using (app_is_staff()) with check (app_is_staff());
create policy customer_own on ride_request_contact for select
  using (app_role() = 'customer' and customer_owns_ride(app_user_id(), ride_request_id));
-- Bewust GEEN policy voor app_role() = 'company'.
grant select, insert, update on ride_request_contact to pickmyride_app;

-- ───────── 2. Contactvenster ─────────
create or replace function booking_contact_open(p_booking uuid) returns boolean
language sql stable security definer set search_path = pickmyride, public as $$
  select exists (select 1 from bookings k join ride_requests r on r.id = k.ride_request_id
                 where k.id = p_booking and k.status <> 'geannuleerd'
                   and now() >= k.confirmed_at
                   and now() <= r.pickup_at + make_interval(hours => coalesce((select (value #>> '{}')::int from platform_settings where key = 'contact_hours_after_ride'), 24)))
$$;

create or replace function booking_participant(p_booking uuid) returns boolean
language sql stable security definer set search_path = pickmyride, public as $$
  select exists (select 1 from bookings k where k.id = p_booking and (
           (app_role() = 'customer' and k.customer_user_id = app_user_id()) or
           (app_role() = 'company'  and k.company_id = app_company_id())))
$$;

-- ───────── 3. Berichten ─────────
create table messages (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references bookings(id) on delete cascade,
  sender_role      text not null check (sender_role in ('customer','company','system')),
  sender_user_id   uuid references users(id),
  body             text not null check (char_length(body) between 1 and 2000),
  created_at       timestamptz not null default now(),
  read_by_customer_at timestamptz,
  read_by_company_at  timestamptz,
  hidden_at        timestamptz,
  hidden_by        uuid references users(id),
  hidden_reason    text
);
create index messages_booking_idx on messages(booking_id, created_at);

alter table messages enable row level security;
alter table messages force row level security;
create policy staff_all on messages for all using (app_is_staff()) with check (app_is_staff());
create policy participant_read on messages for select using (booking_participant(booking_id));
create policy participant_send on messages for insert
  with check (sender_role = app_role() and sender_user_id = app_user_id() and hidden_at is null
              and read_by_customer_at is null and read_by_company_at is null
              and booking_participant(booking_id) and booking_contact_open(booking_id));
grant select, insert on messages to pickmyride_app;
grant update (read_by_customer_at, read_by_company_at, hidden_at, hidden_by, hidden_reason) on messages to pickmyride_app;

-- Berichten zijn onveranderbaar; alleen leesmarkering (deelnemers, via functie) en verbergen (beheer) zijn toegestaan.
create or replace function mark_messages_read(p_booking uuid) returns int
language plpgsql security definer set search_path = pickmyride, public as $$
declare n int;
begin
  if not booking_participant(p_booking) then return 0; end if;
  if app_role() = 'customer' then
    update messages set read_by_customer_at = now() where booking_id = p_booking and read_by_customer_at is null and sender_role <> 'customer';
  else
    update messages set read_by_company_at = now() where booking_id = p_booking and read_by_company_at is null and sender_role <> 'company';
  end if;
  get diagnostics n = row_count; return n;
end $$;
grant execute on function mark_messages_read(uuid) to pickmyride_app;

create or replace function messages_guard() returns trigger language plpgsql as $$
begin
  if (new.body, new.sender_role, new.sender_user_id, new.booking_id, new.created_at)
     is distinct from (old.body, old.sender_role, old.sender_user_id, old.booking_id, old.created_at)
  then raise exception 'Berichten kunnen niet worden gewijzigd' using errcode = '42501'; end if;
  if new.hidden_at is distinct from old.hidden_at and (new.hidden_reason is null or char_length(trim(new.hidden_reason)) < 3)
  then raise exception 'Verbergen vereist een reden' using errcode = '23514'; end if;
  return new;
end $$;
create trigger messages_guard before update on messages for each row execute function messages_guard();

-- ───────── 4. Belsessies (afgeschermd bellen) ─────────
-- Werking: het platform belt eerst de beller op zijn eigen nummer en verbindt daarna door met de ander.
-- Beide kanten zien alleen het platformnummer. Gesprekken worden niet opgenomen.
create table call_sessions (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references bookings(id) on delete cascade,
  initiated_by_role text not null check (initiated_by_role in ('customer','company')),
  initiated_by_user uuid references users(id),
  provider          text not null check (provider in ('geen','demo','twilio')),
  provider_call_id  text unique,
  status            text not null default 'aangevraagd'
                      check (status in ('aangevraagd','gaat_over','verbonden','afgerond','niet_beantwoord','mislukt','niet_beschikbaar')),
  is_simulated      boolean not null default false,
  duration_s        int,
  failure_reason    text,
  created_at        timestamptz not null default now(),
  ended_at          timestamptz
);
create index call_sessions_booking_idx on call_sessions(booking_id, created_at);

alter table call_sessions enable row level security;
alter table call_sessions force row level security;
create policy staff_all on call_sessions for all using (app_is_staff()) with check (app_is_staff());
create policy participant_read on call_sessions for select using (booking_participant(booking_id));
grant select, insert, update on call_sessions to pickmyride_app;

insert into platform_settings (key, value, description) values
  ('contact_hours_after_ride', '24', 'Hoe lang na het ophaalmoment klant en bedrijf nog kunnen chatten en bellen (uren)'),
  ('calls_per_hour_limit', '10', 'Maximaal aantal belpogingen per gebruiker per uur')
on conflict (key) do nothing;
