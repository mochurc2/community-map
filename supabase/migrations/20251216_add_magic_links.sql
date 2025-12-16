-- Magic link / capability URL support for pin owners

-- Dependencies
create extension if not exists http with schema extensions;

--------------------------------------------------------------------------------
-- 1) Private sidecar table to hold owner secrets (RLS: deny all)
--------------------------------------------------------------------------------
create table if not exists public.pin_owner_secrets (
  pin_id uuid primary key,
  secret_token uuid not null default gen_random_uuid(),
  admin_email text not null,
  other_contacts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint pin_owner_secrets_pin_id_fkey
    foreign key (pin_id)
    references public.pins(id)
    on delete cascade
    deferrable initially deferred
);

create unique index if not exists pin_owner_secrets_secret_token_idx
  on public.pin_owner_secrets(secret_token);

alter table public.pin_owner_secrets enable row level security;

--------------------------------------------------------------------------------
-- 2) BEFORE INSERT trigger on pins: strip admin email into sidecar + sanitize
--------------------------------------------------------------------------------
set check_function_bodies = off;

create or replace function public.pins_capture_owner_secret()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_methods jsonb;
  v_admin_email text;
  v_secret uuid;
begin
  -- Ensure we always have an id available for the FK insert
  new.id := coalesce(new.id, gen_random_uuid());

  v_contact_methods := coalesce(new.contact_methods, '{}'::jsonb);
  v_admin_email := trim(both from v_contact_methods->>'__admin_email');

  if v_admin_email is null or v_admin_email = '' then
    raise exception 'admin email (__admin_email) is required to create a pin';
  end if;

  v_secret := gen_random_uuid();

  insert into public.pin_owner_secrets (pin_id, secret_token, admin_email, other_contacts)
  values (new.id, v_secret, v_admin_email, v_contact_methods - '__admin_email');

  -- Strip the admin email from the public pins payload
  new.contact_methods := v_contact_methods - '__admin_email';

  return new;
end;
$$;

create trigger pins_capture_owner_secret
before insert on public.pins
for each row
execute function public.pins_capture_owner_secret();

--------------------------------------------------------------------------------
-- 3) RPC: update or delete a pin via secret token (Security Definer)
--------------------------------------------------------------------------------
create or replace function public.update_pin_via_secret(
  p_pin_id uuid,
  p_secret_token uuid,
  p_patch jsonb default '{}'::jsonb,
  p_delete boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret public.pin_owner_secrets%rowtype;
  v_pin public.pins%rowtype;
  v_contacts jsonb;
  v_admin_email text;
  v_result public.pins%rowtype;
begin
  if p_pin_id is null or p_secret_token is null then
    raise exception 'pin_id and secret_token are required';
  end if;

  select *
    into v_secret
    from public.pin_owner_secrets
   where pin_id = p_pin_id
     and secret_token = p_secret_token
   for update;

  if not found then
    raise exception 'invalid pin_id or secret_token';
  end if;

  if p_delete then
    delete from public.pins where id = p_pin_id;
    return jsonb_build_object('deleted', true);
  end if;

  select *
    into v_pin
    from public.pins
   where id = p_pin_id
   for update;

  if not found then
    raise exception 'pin not found';
  end if;

  -- Merge JSON patch onto the in-memory record, whitelisting relevant fields
  if p_patch ? 'lat' then v_pin.lat := (p_patch->>'lat')::double precision; end if;
  if p_patch ? 'lng' then v_pin.lng := (p_patch->>'lng')::double precision; end if;
  if p_patch ? 'city' then v_pin.city := p_patch->>'city'; end if;
  if p_patch ? 'state_province' then v_pin.state_province := p_patch->>'state_province'; end if;
  if p_patch ? 'country' then v_pin.country := p_patch->>'country'; end if;
  if p_patch ? 'gender_identity' then v_pin.gender_identity := p_patch->>'gender_identity'; end if;

  if p_patch ? 'seeking' then
    if jsonb_typeof(p_patch->'seeking') = 'array' then
      v_pin.seeking := coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_patch->'seeking')),
        '{}'::text[]
      );
    else
      raise exception 'seeking must be an array';
    end if;
  end if;

  if p_patch ? 'interest_tags' then
    if jsonb_typeof(p_patch->'interest_tags') = 'array' then
      v_pin.interest_tags := coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_patch->'interest_tags')),
        null
      );
    else
      v_pin.interest_tags := null;
    end if;
  end if;

  if p_patch ? 'note' then v_pin.note := p_patch->>'note'; end if;
  if p_patch ? 'contact_discord' then v_pin.contact_discord := p_patch->>'contact_discord'; end if;
  if p_patch ? 'contact_reddit' then v_pin.contact_reddit := p_patch->>'contact_reddit'; end if;
  if p_patch ? 'contact_instagram' then v_pin.contact_instagram := p_patch->>'contact_instagram'; end if;
  if p_patch ? 'icon' then v_pin.icon := p_patch->>'icon'; end if;
  if p_patch ? 'nickname' then v_pin.nickname := p_patch->>'nickname'; end if;
  if p_patch ? 'age' then v_pin.age := (p_patch->>'age')::integer; end if;

  if p_patch ? 'genders' then
    if jsonb_typeof(p_patch->'genders') = 'array' then
      v_pin.genders := coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(p_patch->'genders')),
        '{}'::text[]
      );
    else
      raise exception 'genders must be an array';
    end if;
  end if;

  if p_patch ? 'expires_at' then
    v_pin.expires_at := (p_patch->>'expires_at')::timestamptz;
  end if;

  -- Admin email can be passed either as a top-level key or inside contact_methods
  v_admin_email := v_secret.admin_email;
  if p_patch ? '__admin_email' then
    v_admin_email := trim(both from p_patch->>'__admin_email');
  end if;

  if p_patch ? 'contact_methods' then
    if jsonb_typeof(p_patch->'contact_methods') in ('object', 'null') then
      v_contacts := coalesce(p_patch->'contact_methods', '{}'::jsonb);
    else
      raise exception 'contact_methods must be a JSON object';
    end if;
  else
    v_contacts := v_pin.contact_methods;
  end if;

  if v_contacts ? '__admin_email' then
    v_admin_email := trim(both from v_contacts->>'__admin_email');
  end if;

  if v_admin_email is null or v_admin_email = '' then
    raise exception 'admin email is required to update a pin';
  end if;

  -- Strip admin email from the public pins table and sync sidecar
  v_contacts := v_contacts - '__admin_email';
  v_pin.contact_methods := v_contacts;

  update public.pin_owner_secrets
     set admin_email = v_admin_email,
         other_contacts = v_contacts
   where pin_id = p_pin_id;

  -- Force moderation loop
  v_pin.status := 'pending';
  v_pin.approved := false;
  v_pin.approved_at := null;

  update public.pins
     set lat = v_pin.lat,
         lng = v_pin.lng,
         city = v_pin.city,
         state_province = v_pin.state_province,
         country = v_pin.country,
         gender_identity = v_pin.gender_identity,
         seeking = v_pin.seeking,
         interest_tags = v_pin.interest_tags,
         note = v_pin.note,
         contact_discord = v_pin.contact_discord,
         contact_reddit = v_pin.contact_reddit,
         contact_instagram = v_pin.contact_instagram,
         status = v_pin.status,
         approved = v_pin.approved,
         submitted_at = v_pin.submitted_at,
         approved_at = v_pin.approved_at,
         ip_hash = v_pin.ip_hash,
         country_code = v_pin.country_code,
         icon = v_pin.icon,
         nickname = v_pin.nickname,
         age = v_pin.age,
         genders = v_pin.genders,
         contact_methods = v_pin.contact_methods,
         expires_at = v_pin.expires_at,
         never_delete = v_pin.never_delete
   where id = p_pin_id
   returning * into v_result;

  return to_jsonb(v_result);
end;
$$;

grant execute on function public.update_pin_via_secret(uuid, uuid, jsonb, boolean) to anon, authenticated;

--------------------------------------------------------------------------------
-- 4) Webhook trigger -> Edge function (send-magic-link)
--------------------------------------------------------------------------------
create or replace function public.notify_magic_link()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url text := current_setting('app.settings.magic_link_webhook_url', true);
  v_service_key text := current_setting('app.settings.service_role_key', true);
  v_payload text;
begin
  if v_url is null or v_url = '' then
    raise notice 'magic_link_webhook_url is not configured; skipping webhook';
    return new;
  end if;

  v_payload := json_build_object(
    'type', TG_OP,
    'record', row_to_json(new)
  )::text;

  perform
    http_post(
      v_url,
      v_payload,
      'application/json',
      ARRAY[
        'Content-Type: application/json',
        'Authorization: Bearer ' || coalesce(v_service_key, '')
      ]
    );

  return new;
end;
$$;

create trigger pin_owner_secrets_magic_link_webhook
after insert on public.pin_owner_secrets
for each row
execute function public.notify_magic_link();
