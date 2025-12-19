drop trigger if exists "magic-links" on "public"."pin_owner_secrets";

drop index if exists "public"."pins_owner_token_hash_idx";

alter table "public"."pins" drop column "contact_discord";

alter table "public"."pins" drop column "contact_instagram";

alter table "public"."pins" drop column "contact_reddit";

alter table "public"."pins" drop column "owner_email_hash";

alter table "public"."pins" drop column "owner_link_sent_at";

alter table "public"."pins" drop column "owner_token_expires_at";

alter table "public"."pins" drop column "owner_token_hash";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_pin_via_secret(p_pin_id uuid, p_secret_token uuid)
 RETURNS public.pins
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret public.pin_owner_secrets%rowtype;
  v_pin public.pins%rowtype;
begin
  if p_pin_id is null or p_secret_token is null then
    raise exception 'pin_id and secret_token are required';
  end if;

  select *
    into v_secret
    from public.pin_owner_secrets
   where pin_id = p_pin_id
     and secret_token = p_secret_token
   for share;

  if not found then
    raise exception 'invalid pin_id or secret_token';
  end if;

  select *
    into v_pin
    from public.pins
   where id = p_pin_id;

  if not found then
    raise exception 'pin not found';
  end if;

  return v_pin;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pins_capture_owner_secret()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.update_pin_via_secret(p_pin_id uuid, p_secret_token uuid, p_patch jsonb DEFAULT '{}'::jsonb, p_delete boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE TRIGGER "magic-links" AFTER INSERT ON public.pin_owner_secrets FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://ymdwxxcvhxcwjzecxhvb.supabase.co/functions/v1/send-magic-link', 'POST', '{"Content-type":"application/json","Authorization":"Bearer e678e4a8dedf463436102f2bf1a1aae9fe821826695420751821717265ef3bce"}', '{}', '5000');


