-- Ensure authenticated moderators (via auth.uid()) can manage privileged tables
-- Safe to re-run; drops old policies before recreating them.

-- Helper function: is the current user a moderator?
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

-- Pins: allow moderators full access via authenticated sessions
alter table public.pins enable row level security;
drop policy if exists "Authenticated moderators can manage pins" on public.pins;
create policy "Authenticated moderators can manage pins" on public.pins
  for all to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

-- Bubble options: allow moderators to add/update/delete
alter table public.bubble_options enable row level security;
drop policy if exists "Authenticated moderators can manage bubble options" on public.bubble_options;
create policy "Authenticated moderators can manage bubble options" on public.bubble_options
  for all to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

-- Messages: allow moderators to triage reports/feedback
alter table public.messages enable row level security;
drop policy if exists "Authenticated moderators can manage messages" on public.messages;
create policy "Authenticated moderators can manage messages" on public.messages
  for all to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));
