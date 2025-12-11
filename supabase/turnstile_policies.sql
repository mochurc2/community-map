-- Turnstile-aware policy refresh
-- Run in the Supabase SQL editor or via `supabase db push`
-- Ensures only visitors with a verified Turnstile token (see edge function)
-- can read/write public data, while moderators/service_role keep full access.

begin;

-- Helper predicates reused across policies
create or replace function public.turnstile_verified()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt()->>'turnstile_passed')::boolean, false);
$$;

create or replace function public.is_request_owner(owner uuid)
returns boolean
language sql
stable
as $$
  select owner is not distinct from auth.uid();
$$;

-- Ensure we can associate rows with the submitting session/user
alter table if exists public.pins
  add column if not exists created_by uuid;
alter table if exists public.pins
  alter column created_by set default auth.uid();

alter table if exists public.bubble_options
  add column if not exists created_by uuid;
alter table if exists public.bubble_options
  alter column created_by set default auth.uid();

alter table if exists public.messages
  add column if not exists created_by uuid;
alter table if exists public.messages
  alter column created_by set default auth.uid();

-- Pins -----------------------------------------------------------------------
drop policy if exists "Public users can read approved pins" on public.pins;
drop policy if exists "Public users can submit pending pins" on public.pins;

create policy "Turnstile clients read approved pins"
  on public.pins
  for select
  to authenticated
  using (
    public.turnstile_verified()
    and status = 'approved'
  );

create policy "Turnstile clients submit pending pins"
  on public.pins
  for insert
  to authenticated
  with check (
    public.turnstile_verified()
    and status = 'pending'
    and approved = false
  );

-- Bubble options -------------------------------------------------------------
drop policy if exists "Public users can read bubble options" on public.bubble_options;

create policy "Turnstile clients read bubble options"
  on public.bubble_options
  for select
  to authenticated
  using (
    public.turnstile_verified()
    and (
      status = 'approved'
      or public.is_request_owner(created_by)
    )
  );

drop policy if exists "Turnstile clients add bubble options" on public.bubble_options;
create policy "Turnstile clients add bubble options"
  on public.bubble_options
  for insert
  to authenticated
  with check (
    public.turnstile_verified()
    and status = 'pending'
  );

drop policy if exists "Turnstile clients edit their pending bubbles" on public.bubble_options;
create policy "Turnstile clients edit their pending bubbles"
  on public.bubble_options
  for update
  to authenticated
  using (
    public.turnstile_verified()
    and status = 'pending'
    and public.is_request_owner(created_by)
  )
  with check (
    public.turnstile_verified()
    and status = 'pending'
    and public.is_request_owner(created_by)
  );

-- Messages -------------------------------------------------------------------
drop policy if exists "Public users can submit messages" on public.messages;

create policy "Turnstile clients can submit messages"
  on public.messages
  for insert
  to authenticated
  with check (
    public.turnstile_verified()
    and status = 'open'
    and kind in ('site_feedback', 'pin_report')
  );

commit;
