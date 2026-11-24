-- PickMyRide — autorisatie in de database (Row Level Security)
--
-- De applicatie verbindt als rol pickmyride_app (geen superuser, geen BYPASSRLS).
-- Per transactie zet de server de context:
--   app.user_id, app.role ('anon'|'customer'|'company'|'admin'|'system'), app.company_id
-- Supabase-variant: vervang de bodies van app_user_id()/app_role()/app_company_id()
-- door auth.uid() en JWT-claims; de policies zelf blijven gelijk.

set search_path = pickmyride, public;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'pickmyride_app') then
    create role pickmyride_app login;
  end if;
end $$;
alter role pickmyride_app set search_path = pickmyride, public;
alter role pickmyride_app set timezone = 'UTC';

create or replace function app_user_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
create or replace function app_role() returns text language sql stable as
$$ select coalesce(nullif(current_setting('app.role', true), ''), 'anon') $$;
create or replace function app_company_id() returns uuid language sql stable as
$$ select nullif(current_setting('app.company_id', true), '')::uuid $$;
create or replace function app_is_staff() returns boolean language sql stable as
$$ select app_role() in ('admin','system') $$;

-- Eén bron van waarheid voor "mag dit bedrijf op deze rit bieden?"
create or replace function company_can_bid(p_company uuid, p_ride uuid) returns boolean
language sql stable security definer set search_path = pickmyride, public as $$
  select exists (
    select 1
    from ride_requests r
    join companies c on c.id = p_company and c.status = 'actief'
    join vehicle_categories req_cat on req_cat.code = r.vehicle_category
    where r.id = p_ride
      and r.status = 'open'
      and now() < r.bidding_closes_at
      and exists (select 1 from company_service_areas csa
                  where csa.company_id = c.id
                    and csa.service_area_id in (r.pickup_area_id, r.dropoff_area_id))
      and exists (select 1 from company_vehicle_categories cvc
                  join vehicle_categories vc on vc.code = cvc.category_code and vc.active
                  where cvc.company_id = c.id
                    and vc.sort_order >= req_cat.sort_order
                    and cvc.max_passengers >= r.passengers
                    and cvc.max_large_bags >= r.large_bags)
  )
$$;

create or replace function company_is_involved(p_company uuid, p_ride uuid) returns boolean
language sql stable security definer set search_path = pickmyride, public as $$
  select exists (select 1 from bids b where b.ride_request_id = p_ride and b.company_id = p_company)
      or exists (select 1 from bookings k where k.ride_request_id = p_ride and k.company_id = p_company)
$$;

create or replace function customer_owns_ride(p_user uuid, p_ride uuid) returns boolean
language sql stable security definer set search_path = pickmyride, public as $$
  select exists (select 1 from ride_requests r join request_groups g on g.id = r.group_id
                 where r.id = p_ride and g.customer_user_id = p_user)
$$;

-- Alleen het toegewezen bedrijf van een niet-geannuleerde boeking ziet de uitvoeringsgegevens
create or replace function company_has_booking(p_company uuid, p_ride uuid) returns boolean
language sql stable security definer set search_path = pickmyride, public as $$
  select exists (select 1 from bookings k where k.ride_request_id = p_ride
                 and k.company_id = p_company and k.status <> 'geannuleerd')
$$;

-- Publieke bedrijfsgegevens voor aanbiedingskaarten (alleen naam + echte beoordelingen)
create or replace view company_public as
  select c.id, c.trade_name,
         (select round(avg(rv.score)::numeric, 1) from reviews rv where rv.company_id = c.id and rv.status = 'gepubliceerd') as rating_avg,
         (select count(*)::int from reviews rv where rv.company_id = c.id and rv.status = 'gepubliceerd') as rating_count
  from companies c;

-- ───────── RLS inschakelen ─────────
do $$ declare t text; begin
  foreach t in array array['users','customer_profiles','sessions','access_tokens','companies','company_memberships',
    'company_service_areas','company_vehicle_categories','company_documents','vehicles','drivers','request_groups',
    'ride_requests','ride_request_private','commission_rules','bids','reservations','bookings','payments',
    'payment_events','refunds','payouts','status_history','reviews','notifications','support_requests',
    'audit_logs','platform_settings','rate_limits','error_log','vehicle_categories','service_areas',
    'service_area_postcode_ranges']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('create policy staff_all on %I for all using (app_is_staff()) with check (app_is_staff())', t);
  end loop;
end $$;

-- Referentiedata: iedereen mag lezen
create policy read_all on vehicle_categories for select using (true);
create policy read_all on service_areas for select using (true);
create policy read_all on service_area_postcode_ranges for select using (true);
create policy read_all on platform_settings for select using (true);
create policy company_read on commission_rules for select using (app_role() = 'company' and active);

-- Gebruikers: alleen eigen rij
create policy own_row on users for select using (id = app_user_id());
create policy own_profile on customer_profiles for select using (user_id = app_user_id());

-- Bedrijven: leden zien eigen bedrijf
create policy member_read on companies for select using (app_role() = 'company' and id = app_company_id());
create policy member_read on company_memberships for select using (app_role() = 'company' and company_id = app_company_id());
create policy member_read on company_service_areas for select using (app_role() = 'company' and company_id = app_company_id());
create policy member_read on company_vehicle_categories for select using (app_role() = 'company' and company_id = app_company_id());
create policy member_read on company_documents for select using (app_role() = 'company' and company_id = app_company_id());
create policy member_all on vehicles for all using (app_role() = 'company' and company_id = app_company_id())
  with check (app_role() = 'company' and company_id = app_company_id());
create policy member_all on drivers for all using (app_role() = 'company' and company_id = app_company_id())
  with check (app_role() = 'company' and company_id = app_company_id());

-- Aanvragen
create policy customer_own on request_groups for select using (app_role() = 'customer' and customer_user_id = app_user_id());
create policy customer_own on ride_requests for select
  using (app_role() = 'customer' and customer_owns_ride(app_user_id(), id));
create policy company_visible on ride_requests for select
  using (app_role() = 'company' and (company_can_bid(app_company_id(), id) or company_is_involved(app_company_id(), id)));

create policy customer_own on ride_request_private for select
  using (app_role() = 'customer' and customer_owns_ride(app_user_id(), ride_request_id));
create policy assigned_company on ride_request_private for select
  using (app_role() = 'company' and company_has_booking(app_company_id(), ride_request_id));

-- Biedingen: bedrijf ziet uitsluitend eigen biedingen
create policy company_own on bids for select using (app_role() = 'company' and company_id = app_company_id());
create policy company_insert on bids for insert
  with check (app_role() = 'company' and company_id = app_company_id()
              and status = 'actief' and company_can_bid(app_company_id(), ride_request_id));
create policy company_update on bids for update
  using (app_role() = 'company' and company_id = app_company_id() and status = 'actief')
  with check (app_role() = 'company' and company_id = app_company_id() and status in ('actief','ingetrokken'));
create policy customer_offers on bids for select
  using (app_role() = 'customer' and status in ('actief','gereserveerd','geaccepteerd')
         and customer_owns_ride(app_user_id(), ride_request_id));

create policy customer_own on reservations for select using (app_role() = 'customer' and customer_user_id = app_user_id());
create policy customer_own on bookings for select using (app_role() = 'customer' and customer_user_id = app_user_id());
create policy company_own on bookings for select using (app_role() = 'company' and company_id = app_company_id());
create policy company_ops on bookings for update
  using (app_role() = 'company' and company_id = app_company_id())
  with check (app_role() = 'company' and company_id = app_company_id());
create policy customer_own on payments for select using (app_role() = 'customer' and customer_user_id = app_user_id());
create policy company_own on payouts for select using (app_role() = 'company' and company_id = app_company_id());
create policy customer_own on refunds for select
  using (app_role() = 'customer' and exists (select 1 from payments p where p.id = payment_id and p.customer_user_id = app_user_id()));

-- Statusgeschiedenis: iedere ingelogde rol mag alleen regels onder de eigen rol en het eigen account toevoegen (append-only)
create policy insert_own on status_history for insert
  with check (app_role() in ('customer','company') and actor_role = app_role() and actor_user_id is not distinct from app_user_id());

create policy read_published on reviews for select using (status = 'gepubliceerd');
create policy customer_own on support_requests for select using (user_id = app_user_id());

-- ───────── Rechten voor de applicatierol ─────────
grant usage on schema pickmyride to pickmyride_app;
grant select, insert, update on all tables in schema pickmyride to pickmyride_app;
grant delete on sessions, access_tokens, rate_limits, vehicles, drivers, company_service_areas,
                company_vehicle_categories, service_area_postcode_ranges to pickmyride_app;
revoke update on audit_logs, status_history, payment_events from pickmyride_app;  -- append-only (payment_events: processed_at via functie)
grant usage, select on all sequences in schema pickmyride to pickmyride_app;
grant execute on all functions in schema pickmyride to pickmyride_app;

-- Een taxibedrijf mag op een boeking alleen chauffeur, voertuig en operationele status wijzigen.
create or replace function bookings_company_guard() returns trigger language plpgsql as $$
begin
  if app_role() = 'company' then
    if (new.total_price_cents, new.commission_cents, new.payout_cents, new.company_id, new.customer_user_id, new.ride_request_id, new.bid_id, new.booking_number, new.commission_rule_snapshot)
       is distinct from
       (old.total_price_cents, old.commission_cents, old.payout_cents, old.company_id, old.customer_user_id, old.ride_request_id, old.bid_id, old.booking_number, old.commission_rule_snapshot)
    then raise exception 'Taxibedrijven mogen prijs, partijen en commissie van een boeking niet wijzigen' using errcode = '42501';
    end if;
    if new.status in ('geannuleerd') and old.status <> new.status then
      raise exception 'Annuleren loopt via de klant of de beheerder' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger bookings_company_guard before update on bookings for each row execute function bookings_company_guard();

-- Een taxibedrijf mag financiële velden van een bod niet buiten de applicatie om manipuleren
create or replace function bids_guard() returns trigger language plpgsql as $$
begin
  if app_role() = 'company' and tg_op = 'UPDATE' and (new.company_id, new.ride_request_id) is distinct from (old.company_id, old.ride_request_id) then
    raise exception 'Niet toegestaan' using errcode = '42501';
  end if;
  if new.commission_cents + new.payout_cents <> new.total_price_cents then
    raise exception 'Commissie en uitbetaling moeten samen de klantprijs zijn';
  end if;
  return new;
end $$;
create trigger bids_guard before insert or update on bids for each row execute function bids_guard();

-- payment_events mag alleen gemarkeerd worden als verwerkt
create or replace function mark_payment_event(p_id uuid, p_result text) returns void
language sql security definer set search_path = pickmyride, public as $$
  update payment_events set processed_at = now(), result = p_result where id = p_id
$$;
grant execute on function mark_payment_event(uuid, text) to pickmyride_app;
