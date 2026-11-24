-- PickMyRide — ritten van en naar het buitenland (België, Duitsland, Frankrijk, Luxemburg).
-- Uitgangspunten:
--  * Eén kant van de rit ligt altijd in Nederland; daar wordt het werkgebied op bepaald.
--  * Alleen taxibedrijven die zelf aangeven naar het buitenland te rijden, kunnen op zulke ritten bieden.
--  * Bieders zien aan de buitenlandse kant alleen plaats en land, nooit het adres.
set search_path = pickmyride, public;

alter table ride_requests
  add column pickup_country  text not null default 'NL' check (pickup_country  in ('NL','BE','DE','FR','LU')),
  add column dropoff_country text not null default 'NL' check (dropoff_country in ('NL','BE','DE','FR','LU'));
alter table ride_requests alter column pickup_postcode4 drop not null, alter column dropoff_postcode4 drop not null;
alter table ride_requests
  add constraint ride_requests_pickup_pc_nl  check ((pickup_country  = 'NL') = (pickup_postcode4  is not null)),
  add constraint ride_requests_dropoff_pc_nl check ((dropoff_country = 'NL') = (dropoff_postcode4 is not null)),
  add constraint ride_requests_one_side_nl   check (pickup_country = 'NL' or dropoff_country = 'NL');

alter table companies add column serves_abroad boolean not null default false;
comment on column companies.serves_abroad is 'Bedrijf rijdt ook naar/van België, Duitsland, Frankrijk en Luxemburg';

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
      and (r.pickup_country = 'NL' and r.dropoff_country = 'NL' or c.serves_abroad)
      and exists (select 1 from company_service_areas csa join service_areas sa on sa.id = csa.service_area_id and sa.active
                  where csa.company_id = c.id
                    and (sa.code = 'landelijk' or csa.service_area_id in (r.pickup_area_id, r.dropoff_area_id)))
      and exists (select 1 from company_vehicle_categories cvc
                  join vehicle_categories vc on vc.code = cvc.category_code and vc.active
                  where cvc.company_id = c.id
                    and vc.sort_order >= req_cat.sort_order
                    and cvc.max_passengers >= r.passengers
                    and cvc.max_large_bags >= r.large_bags)
  )
$$;
