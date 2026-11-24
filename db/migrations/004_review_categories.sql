-- PickMyRide — beoordelingen op vijf onderdelen
-- Communicatie, Klantvriendelijkheid, Comfort & hygiëne, Betrouwbaarheid, Rijgedrag & veiligheid (elk 1–5).
-- Het totaal is het rekenkundig gemiddelde en wordt door de database berekend (kan niet los worden aangepast).
set search_path = pickmyride, public;

drop view if exists company_public;

alter table reviews drop column score;
alter table reviews
  add column score_communicatie          int not null check (score_communicatie between 1 and 5),
  add column score_klantvriendelijkheid  int not null check (score_klantvriendelijkheid between 1 and 5),
  add column score_comfort_hygiene       int not null check (score_comfort_hygiene between 1 and 5),
  add column score_betrouwbaarheid       int not null check (score_betrouwbaarheid between 1 and 5),
  add column score_rijgedrag_veiligheid  int not null check (score_rijgedrag_veiligheid between 1 and 5),
  add column score numeric(3,2) generated always as (
    (score_communicatie + score_klantvriendelijkheid + score_comfort_hygiene + score_betrouwbaarheid + score_rijgedrag_veiligheid) / 5.0
  ) stored,
  add constraint reviews_body_length check (body is null or char_length(body) <= 1000);

-- Alleen gepubliceerde beoordelingen tellen mee. Gemiddelden per onderdeel en totaal.
create view company_public as
  select c.id, c.trade_name,
         s.rating_avg, coalesce(s.rating_count, 0) as rating_count,
         s.avg_communicatie, s.avg_klantvriendelijkheid, s.avg_comfort_hygiene, s.avg_betrouwbaarheid, s.avg_rijgedrag_veiligheid
  from companies c
  left join lateral (
    select round(avg(rv.score), 1) as rating_avg, count(*)::int as rating_count,
           round(avg(rv.score_communicatie), 1) as avg_communicatie,
           round(avg(rv.score_klantvriendelijkheid), 1) as avg_klantvriendelijkheid,
           round(avg(rv.score_comfort_hygiene), 1) as avg_comfort_hygiene,
           round(avg(rv.score_betrouwbaarheid), 1) as avg_betrouwbaarheid,
           round(avg(rv.score_rijgedrag_veiligheid), 1) as avg_rijgedrag_veiligheid
    from reviews rv where rv.company_id = c.id and rv.status = 'gepubliceerd'
  ) s on true;
grant select on company_public to pickmyride_app;

-- Mag deze klant deze boeking beoordelen? Eigen boeking, afgerond, nog geen beoordeling.
create or replace function customer_can_review(p_user uuid, p_booking uuid) returns boolean
language sql stable security definer set search_path = pickmyride, public as $$
  select exists (select 1 from bookings k where k.id = p_booking and k.customer_user_id = p_user and k.status = 'afgerond')
     and not exists (select 1 from reviews r where r.booking_id = p_booking)
$$;
grant execute on function customer_can_review(uuid, uuid) to pickmyride_app;

-- Klant: eigen beoordelingen lezen (ook als verborgen) en één keer plaatsen. Nooit wijzigen.
create policy customer_own on reviews for select using (app_role() = 'customer' and customer_user_id = app_user_id());
create policy customer_insert on reviews for insert
  with check (app_role() = 'customer' and customer_user_id = app_user_id() and status = 'gepubliceerd'
              and moderated_by is null and customer_can_review(app_user_id(), booking_id)
              and company_id = (select k.company_id from bookings k where k.id = booking_id));
-- Bedrijf: eigen beoordelingen lezen (ook verborgen, met moderatiereden). Geen insert/update.
create policy company_own on reviews for select using (app_role() = 'company' and company_id = app_company_id());

-- Moderatie: alleen status + reden + wie/wanneer; scores en tekst blijven onveranderd.
create or replace function reviews_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if (new.score_communicatie, new.score_klantvriendelijkheid, new.score_comfort_hygiene, new.score_betrouwbaarheid,
        new.score_rijgedrag_veiligheid, new.body, new.booking_id, new.company_id, new.customer_user_id, new.created_at)
       is distinct from
       (old.score_communicatie, old.score_klantvriendelijkheid, old.score_comfort_hygiene, old.score_betrouwbaarheid,
        old.score_rijgedrag_veiligheid, old.body, old.booking_id, old.company_id, old.customer_user_id, old.created_at)
    then raise exception 'De inhoud van een beoordeling kan niet worden gewijzigd' using errcode = '42501';
    end if;
    if new.status <> old.status and (new.moderation_reason is null or char_length(trim(new.moderation_reason)) < 3) then
      raise exception 'Moderatie vereist een reden' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger reviews_guard before update on reviews for each row execute function reviews_guard();
