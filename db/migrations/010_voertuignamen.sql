-- PickMyRide — voertuigkeuze zoals de klant hem ziet: Sedan, Stationwagen, Taxibus.
-- Codes blijven gelijk (bestaande aanvragen, biedingen en bedrijfsvoertuigen blijven geldig).
set search_path = pickmyride, public;

alter table vehicle_categories add column if not exists max_small_bags int check (max_small_bags is null or max_small_bags >= 0);

update vehicle_categories set name_nl = 'Sedan',        max_passengers = 4, max_large_bags = 2, max_small_bags = 2 where code = 'personenauto';
update vehicle_categories set name_nl = 'Stationwagen', max_passengers = 4, max_large_bags = 4                    where code = 'stationwagen';
update vehicle_categories set name_nl = 'Taxibus',      max_passengers = 8, max_large_bags = 8                    where code = 'taxibus';
