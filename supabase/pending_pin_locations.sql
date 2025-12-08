-- Pending pin locations table & triggers
-- Stores sanitized metadata for public display and stays in sync with pins.status.

-- Table keeps lightweight data for public display
create table if not exists public.pending_pin_locations (
  pin_id uuid primary key references public.pins(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  city text,
  state_province text,
  country text,
  country_code text,
  icon text,
  nickname text,
  age smallint,
  genders text[],
  gender_identity text,
  seeking text[],
  interest_tags text[],
  note text,
  contact_methods jsonb,
  submitted_at timestamptz default now()
);

-- Ensure legacy databases pick up the rich metadata columns
alter table if exists public.pending_pin_locations add column if not exists city text;
alter table if exists public.pending_pin_locations add column if not exists state_province text;
alter table if exists public.pending_pin_locations add column if not exists country text;
alter table if exists public.pending_pin_locations add column if not exists country_code text;
alter table if exists public.pending_pin_locations add column if not exists icon text;
alter table if exists public.pending_pin_locations add column if not exists nickname text;
alter table if exists public.pending_pin_locations add column if not exists age smallint;
alter table if exists public.pending_pin_locations add column if not exists genders text[];
alter table if exists public.pending_pin_locations add column if not exists gender_identity text;
alter table if exists public.pending_pin_locations add column if not exists seeking text[];
alter table if exists public.pending_pin_locations add column if not exists interest_tags text[];
alter table if exists public.pending_pin_locations add column if not exists note text;
alter table if exists public.pending_pin_locations add column if not exists contact_methods jsonb;

-- Helper function to maintain the table when pins change
create or replace function public.sync_pending_pin_locations()
returns trigger
language plpgsql
security definer
as $$
begin
  if (tg_op = 'INSERT') or (tg_op = 'UPDATE') then
    if new.status = 'pending' then
      insert into public.pending_pin_locations (
        pin_id,
        lat,
        lng,
        city,
        state_province,
        country,
        country_code,
        icon,
        nickname,
        age,
        genders,
        gender_identity,
        seeking,
        interest_tags,
        note,
        contact_methods,
        submitted_at
      )
      values (
        new.id,
        new.lat,
        new.lng,
        new.city,
        new.state_province,
        new.country,
        new.country_code,
        new.icon,
        new.nickname,
        new.age,
        new.genders,
        new.gender_identity,
        new.seeking,
        new.interest_tags,
        new.note,
        new.contact_methods,
        coalesce(new.submitted_at, now())
      )
      on conflict (pin_id) do update
        set lat = excluded.lat,
            lng = excluded.lng,
            city = excluded.city,
            state_province = excluded.state_province,
            country = excluded.country,
            country_code = excluded.country_code,
            icon = excluded.icon,
            nickname = excluded.nickname,
            age = excluded.age,
            genders = excluded.genders,
            gender_identity = excluded.gender_identity,
            seeking = excluded.seeking,
            interest_tags = excluded.interest_tags,
            note = excluded.note,
            contact_methods = excluded.contact_methods,
            submitted_at = excluded.submitted_at;
    else
      delete from public.pending_pin_locations where pin_id = new.id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    delete from public.pending_pin_locations where pin_id = old.id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists pins_pending_sync on public.pins;
create trigger pins_pending_sync
after insert or update of status,
  lat,
  lng,
  city,
  state_province,
  country,
  country_code,
  icon,
  nickname,
  age,
  genders,
  gender_identity,
  seeking,
  interest_tags,
  note,
  contact_methods
on public.pins
for each row
execute function public.sync_pending_pin_locations();

drop trigger if exists pins_pending_delete on public.pins;
create trigger pins_pending_delete
after delete on public.pins
for each row
execute function public.sync_pending_pin_locations();

-- Backfill existing pending pins
insert into public.pending_pin_locations (
  pin_id,
  lat,
  lng,
  city,
  state_province,
  country,
  country_code,
  icon,
  nickname,
  age,
  genders,
  gender_identity,
  seeking,
  interest_tags,
  note,
  contact_methods,
  submitted_at
)
select
  id,
  lat,
  lng,
  city,
  state_province,
  country,
  country_code,
  icon,
  nickname,
  age,
  genders,
  gender_identity,
  seeking,
  interest_tags,
  note,
  contact_methods,
  coalesce(submitted_at, now())
from public.pins
where status = 'pending'
on conflict (pin_id) do update
  set lat = excluded.lat,
      lng = excluded.lng,
      city = excluded.city,
      state_province = excluded.state_province,
      country = excluded.country,
      country_code = excluded.country_code,
      icon = excluded.icon,
      nickname = excluded.nickname,
      age = excluded.age,
      genders = excluded.genders,
      gender_identity = excluded.gender_identity,
      seeking = excluded.seeking,
      interest_tags = excluded.interest_tags,
      note = excluded.note,
      contact_methods = excluded.contact_methods,
      submitted_at = excluded.submitted_at;

-- Allow anon clients to read sanitized pending pins
grant select on public.pending_pin_locations to anon;
