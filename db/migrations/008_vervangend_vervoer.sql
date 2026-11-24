-- 008: 24-uurs klantenservice en vervangend vervoer.
-- Een klant of het taxibedrijf meldt dat de rit niet (op tijd) door kan gaan; de klantenservice regelt een vervanger.
-- De klant betaalt nooit automatisch iets extra: extra kosten worden alleen vastgelegd, met wie ze draagt.
set search_path = pickmyride, public;

create sequence replacement_case_seq start 5001;

create table replacement_cases (
  id                        uuid primary key default gen_random_uuid(),
  case_number               text not null unique default ('VV-' || nextval('replacement_case_seq')),
  booking_id                uuid not null references bookings(id),
  original_company_id       uuid not null references companies(id),
  reported_by_user_id       uuid references users(id),
  reported_by_role          text not null check (reported_by_role in ('customer','company','admin')),
  booking_status_before     text,
  reason                    text not null check (reason in ('niet_verschenen','te_laat','bedrijf_kan_niet','voertuig_defect','overig')),
  details                   text check (char_length(details) <= 1000),
  status                    text not null default 'gemeld'
                              check (status in ('gemeld','in_behandeling','vervanger_geregeld','afgerond','ongegrond')),
  handled_by                uuid references users(id),
  replacement_company_id    uuid references companies(id),
  replacement_external_name text check (char_length(replacement_external_name) <= 120),
  replacement_eta           timestamptz,
  extra_cost_cents          int not null default 0 check (extra_cost_cents >= 0),
  cost_bearer               text not null default 'nog_te_bepalen'
                              check (cost_bearer in ('nog_te_bepalen','platform','oorspronkelijk_bedrijf')),
  resolution                text check (char_length(resolution) <= 1000),
  reported_at               timestamptz not null default now(),
  taken_at                  timestamptz,
  arranged_at               timestamptz,
  closed_at                 timestamptz,
  is_demo                   boolean not null default false,
  check (replacement_company_id is null or replacement_company_id <> original_company_id),
  check (status <> 'vervanger_geregeld' or replacement_company_id is not null or replacement_external_name is not null)
);
-- Per boeking maximaal één lopende melding.
create unique index replacement_cases_one_open on replacement_cases(booking_id) where status in ('gemeld','in_behandeling','vervanger_geregeld');
create index replacement_cases_open_idx on replacement_cases(reported_at) where status in ('gemeld','in_behandeling');

alter table replacement_cases enable row level security;
alter table replacement_cases force row level security;
grant select, insert, update on replacement_cases to pickmyride_app;
grant usage on sequence replacement_case_seq to pickmyride_app;

create policy staff_all on replacement_cases for all using (app_is_staff()) with check (app_is_staff());
create policy customer_read on replacement_cases for select
  using (app_role() = 'customer' and exists (select 1 from bookings k where k.id = booking_id and k.customer_user_id = app_user_id()));
create policy company_read on replacement_cases for select
  using (app_role() = 'company' and original_company_id = app_company_id());
-- Melden mag de klant of het oorspronkelijke bedrijf, alleen voor de eigen boeking, alleen als nieuwe melding.
create policy participant_report on replacement_cases for insert
  with check (status = 'gemeld' and reported_by_user_id = app_user_id() and handled_by is null
              and replacement_company_id is null and replacement_external_name is null and extra_cost_cents = 0
              and booking_participant(booking_id)
              and original_company_id = (select k.company_id from bookings k where k.id = booking_id)
              and ((app_role() = 'customer' and reported_by_role = 'customer')
                or (app_role() = 'company' and reported_by_role = 'company' and original_company_id = app_company_id())));

-- Melding, reden en melder zijn na aanmaken onveranderbaar; status loopt alleen vooruit.
create or replace function replacement_cases_guard() returns trigger language plpgsql as $$
begin
  if new.booking_id <> old.booking_id or new.reason <> old.reason or new.reported_by_role <> old.reported_by_role
     or new.reported_at <> old.reported_at or new.original_company_id <> old.original_company_id
     or coalesce(new.details,'') <> coalesce(old.details,'') or new.case_number <> old.case_number
     or (old.booking_status_before is not null and new.booking_status_before is distinct from old.booking_status_before) then
    raise exception 'Een melding kan na indienen niet worden aangepast.';
  end if;
  if old.status in ('afgerond','ongegrond') then
    raise exception 'Deze melding is al gesloten.';
  end if;
  if not (
       (old.status = new.status)
    or (old.status = 'gemeld'              and new.status in ('in_behandeling','vervanger_geregeld','ongegrond'))
    or (old.status = 'in_behandeling'      and new.status in ('vervanger_geregeld','ongegrond'))
    or (old.status = 'vervanger_geregeld'  and new.status in ('afgerond'))
  ) then
    raise exception 'Statuswijziging van % naar % is niet toegestaan.', old.status, new.status;
  end if;
  if new.status in ('afgerond','ongegrond') and coalesce(trim(new.resolution),'') = '' then
    raise exception 'Geef een toelichting bij het sluiten van de melding.';
  end if;
  return new;
end $$;
create trigger replacement_cases_guard before update on replacement_cases for each row execute function replacement_cases_guard();

-- Statusgeschiedenis ook voor meldingen bijhouden.
alter table status_history drop constraint status_history_entity_type_check;
alter table status_history add constraint status_history_entity_type_check
  check (entity_type in ('ride_request','bid','booking','payment','payout','company','reservation','refund','replacement_case'));

-- Klantenservice-instellingen. Lege nummers = niet tonen (in productie). Teksten zijn bewust instelbaar.
insert into platform_settings (key, value, description) values
  ('support_phone', '""', 'Telefoonnummer klantenservice (24/7), bijv. +31 20 123 4567. Leeg = niet tonen'),
  ('support_whatsapp', '""', 'WhatsApp-nummer klantenservice in internationaal formaat, bijv. +31 6 1234 5678. Leeg = niet tonen'),
  ('support_hours', '"24 uur per dag, 7 dagen per week"', 'Bereikbaarheid klantenservice zoals getoond op de website'),
  ('replacement_guarantee', '1', 'Belofte vervangend vervoer tonen (1 = aan, 0 = uit). Alleen zichtbaar als er een klantenservicenummer is ingesteld'),
  ('no_show_report_minutes', '10', 'Vanaf hoeveel minuten na het ophaalmoment de klant "taxi niet verschenen" kan melden')
on conflict (key) do nothing;
