-- Policies and helpers to allow authenticated moderators to use the moderation page
-- Run after schema.sql and moderators.sql so the referenced tables exist.

-- Helper function to check whether the current user is a moderator
create or replace function public.is_moderator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.moderators m where m.user_id = uid
  );
$$;

-- Allow authenticated moderators to manage pins for review
alter table public.pins enable row level security;

drop policy if exists "Authenticated moderators can manage pins" on public.pins;
create policy "Authenticated moderators can manage pins" on public.pins
  for all to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

-- Allow authenticated moderators to manage bubble options
alter table public.bubble_options enable row level security;

drop policy if exists "Authenticated moderators can manage bubble options" on public.bubble_options;
create policy "Authenticated moderators can manage bubble options" on public.bubble_options
  for all to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

-- Allow authenticated moderators to manage visitor messages
alter table public.messages enable row level security;

drop policy if exists "Authenticated moderators can manage messages" on public.messages;
create policy "Authenticated moderators can manage messages" on public.messages
  for all to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));
