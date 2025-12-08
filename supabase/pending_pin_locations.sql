-- Pending pin locations table & triggers
-- Stores only non-sensitive fields; stays in sync with pins.status.

-- Table keeps lightweight data for public display
create table if not exists public.pending_pin_locations (
  pin_id uuid primary key references public.pins(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  submitted_at timestamptz default now()
);

-- Helper function to maintain the table when pins change
create or replace function public.sync_pending_pin_locations()
returns trigger
language plpgsql
security definer
as $$
begin
  if (tg_op = 'INSERT') or (tg_op = 'UPDATE') then
    if new.status = 'pending' then
      insert into public.pending_pin_locations (pin_id, lat, lng, submitted_at)
      values (new.id, new.lat, new.lng, coalesce(new.submitted_at, now()))
      on conflict (pin_id) do update
        set lat = excluded.lat,
            lng = excluded.lng,
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
after insert or update of status, lat, lng on public.pins
for each row
execute function public.sync_pending_pin_locations();

drop trigger if exists pins_pending_delete on public.pins;
create trigger pins_pending_delete
after delete on public.pins
for each row
execute function public.sync_pending_pin_locations();

-- Backfill existing pending pins
insert into public.pending_pin_locations (pin_id, lat, lng, submitted_at)
select id, lat, lng, coalesce(submitted_at, now())
from public.pins
where status = 'pending'
on conflict (pin_id) do update
  set lat = excluded.lat,
      lng = excluded.lng,
      submitted_at = excluded.submitted_at;

-- Allow anon clients to read coordinates
grant select on public.pending_pin_locations to anon;
