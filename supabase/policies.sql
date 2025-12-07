-- Row Level Security policies for community map
-- Apply after creating tables defined in schema.sql

-- Pins policies
-- Allow anonymous/public users to submit pins. They must remain pending and unapproved.
drop policy if exists "Public users can submit pending pins" on public.pins;
create policy "Public users can submit pending pins" on public.pins
  for insert to anon
  with check (
    status = 'pending'
    and approved = false
  );

-- Allow public users to read only approved pins for the public map.
drop policy if exists "Public users can read approved pins" on public.pins;
create policy "Public users can read approved pins" on public.pins
  for select to anon
  using (status = 'approved');

-- Moderators (using the service role key) can update pin status and details for review.
drop policy if exists "Moderators can manage pins" on public.pins;
create policy "Moderators can manage pins" on public.pins
  for all to service_role
  using (true)
  with check (true);

-- Bubble option policies
-- Public users can read available options to populate the form chips.
drop policy if exists "Public users can read bubble options" on public.bubble_options;
create policy "Public users can read bubble options" on public.bubble_options
  for select to anon
  using (true);

-- Moderators (service role) manage bubble options from the moderation page.
drop policy if exists "Moderators can manage bubble options" on public.bubble_options;
create policy "Moderators can manage bubble options" on public.bubble_options
  for all to service_role
  using (true)
  with check (true);

-- Message/report policies
drop policy if exists "Public users can submit messages" on public.messages;
create policy "Public users can submit messages" on public.messages
  for insert to anon
  with check (
    status = 'open'
    and kind in ('site_feedback', 'pin_report')
  );

drop policy if exists "Moderators can manage messages" on public.messages;
create policy "Moderators can manage messages" on public.messages
  for all to service_role
  using (true)
  with check (true);
