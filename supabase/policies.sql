-- Row Level Security policies for community map
-- Apply after creating tables defined in schema.sql

-- Pins policies
-- Allow anonymous/public users to submit pins. They must remain pending and unapproved.
create policy if not exists "Public users can submit pending pins" on public.pins
  for insert to anon
  with check (
    status = 'pending'
    and approved = false
  );

-- Allow public users to read only approved pins for the public map.
create policy if not exists "Public users can read approved pins" on public.pins
  for select to anon
  using (status = 'approved');

-- Moderators (using the service role key) can update pin status and details for review.
create policy if not exists "Moderators can manage pins" on public.pins
  for all to service_role
  using (true)
  with check (true);

-- Bubble option policies
-- Public users can read available options to populate the form chips.
create policy if not exists "Public users can read bubble options" on public.bubble_options
  for select to anon
  using (true);

-- Moderators (service role) manage bubble options from the moderation page.
create policy if not exists "Moderators can manage bubble options" on public.bubble_options
  for all to service_role
  using (true)
  with check (true);
