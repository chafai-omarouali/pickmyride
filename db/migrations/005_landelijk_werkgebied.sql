-- PickMyRide — landelijk werkgebied voor lange afstandsritten
-- Een bedrijf met werkgebied 'landelijk' mag bieden op elke rit in Nederland,
-- ongeacht in welk regionaal werkgebied vertrek of bestemming valt.
set search_path = pickmyride, public;

insert into service_areas (code, name, note) values ('landelijk', 'Heel Nederland (lange afstand)', 'Alle postcodes; voor bedrijven die door het hele land rijden')
on conflict (code) do nothing;
insert into service_area_postcode_ranges (service_area_id, postcode_from, postcode_to)
select id, 1000, 9999 from service_areas where code = 'landelijk'
  and not exists (select 1 from service_area_postcode_ranges r join service_areas a on a.id = r.service_area_id where a.code = 'landelijk');

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
