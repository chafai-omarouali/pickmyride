-- PickMyRide — kleine koffers en kinderzitjes per soort
set search_path = pickmyride, public;

alter table ride_requests rename column hand_bags to small_bags;

alter table ride_requests
  add column seat_maxicosi    int not null default 0 check (seat_maxicosi between 0 and 3),
  add column seat_kinderstoel int not null default 0 check (seat_kinderstoel between 0 and 3),
  add column seat_verhoger    int not null default 0 check (seat_verhoger between 0 and 3);

update ride_requests set seat_kinderstoel = least(child_seats, 3) where child_seats > 0;
alter table ride_requests drop column child_seats;

alter table ride_requests add constraint ride_requests_seats_le_passengers
  check (seat_maxicosi + seat_kinderstoel + seat_verhoger <= passengers);
