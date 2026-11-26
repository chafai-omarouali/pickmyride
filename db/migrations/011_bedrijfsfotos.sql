-- PickMyRide — foto's van taxibedrijven (voertuigen, interieur, bedrijf).
-- Klanten zien de foto's bij de aanbiedingen. De afbeelding staat in de database (bytea), zodat ze ook
-- op een serverloze omgeving bewaard blijft. Alleen foto's van actieve bedrijven zijn publiek zichtbaar,
-- en beheer kan een foto verbergen.
set search_path = pickmyride, public;

create table company_photos (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  data             bytea not null,
  mime_type        text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes       int not null check (size_bytes > 0 and size_bytes <= 4194304),
  width            int check (width is null or width > 0),
  height           int check (height is null or height > 0),
  caption          text check (caption is null or char_length(caption) <= 120),
  sort_order       int not null default 0,
  hidden_by_staff  boolean not null default false,
  hidden_reason    text check (hidden_reason is null or char_length(hidden_reason) <= 300),
  uploaded_by      uuid references users(id),
  created_at       timestamptz not null default now()
);
create index company_photos_company_idx on company_photos (company_id, sort_order, created_at);

alter table company_photos enable row level security;
create policy staff_all on company_photos for all using (app_is_staff()) with check (app_is_staff());
create policy member_all on company_photos for all
  using (app_role() = 'company' and company_id = app_company_id())
  with check (app_role() = 'company' and company_id = app_company_id());

grant select, insert, update, delete on company_photos to pickmyride_app;

-- Een taxibedrijf mag een door beheer verborgen foto niet zelf weer zichtbaar maken.
create or replace function company_photos_guard() returns trigger language plpgsql as $$
begin
  if app_role() = 'company' then
    if tg_op = 'INSERT' then
      new.hidden_by_staff := false; new.hidden_reason := null;
    elsif (new.hidden_by_staff, new.hidden_reason, new.company_id, new.data) is distinct from (old.hidden_by_staff, old.hidden_reason, old.company_id, old.data) then
      raise exception 'Niet toegestaan' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger company_photos_guard before insert or update on company_photos for each row execute function company_photos_guard();

-- Maximaal 8 foto's per bedrijf.
create or replace function company_photos_limit() returns trigger language plpgsql security definer set search_path = pickmyride, public as $$
begin
  if (select count(*) from company_photos where company_id = new.company_id) >= 8 then
    raise exception 'Maximaal 8 foto''s per bedrijf' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger company_photos_limit before insert on company_photos for each row execute function company_photos_limit();

-- Publiek zichtbare foto's: alleen van actieve bedrijven en niet verborgen door beheer.
create view company_photo_public as
  select p.id, p.company_id, p.data, p.mime_type, p.width, p.height, p.caption, p.sort_order, p.created_at
  from company_photos p join companies c on c.id = p.company_id
  where c.status = 'actief' and not p.hidden_by_staff;
grant select on company_photo_public to pickmyride_app;
