-- Rotate pin owner secret when admin email changes and expose edit state
set check_function_bodies = off;

create or replace function public.get_pin_edit_state(p_pin_id uuid, p_secret_token uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  return jsonb_build_object(
    'pin', to_jsonb(v_pin),
    'admin_email', v_secret.admin_email,
    'has_admin_email', coalesce(nullif(v_secret.admin_email, ''), '') <> ''
  );
end;
$function$
;

create or replace function public.update_pin_via_secret(
  p_pin_id uuid,
  p_secret_token uuid,
  p_patch jsonb default '{}'::jsonb,
  p_delete boolean default false
) returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_secret public.pin_owner_secrets%rowtype;
  v_pin public.pins%rowtype;
  v_contacts jsonb;
  v_admin_email text;
  v_result public.pins%rowtype;
  v_secret_rotated boolean := false;
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

  if p_patch ? 'never_delete' then
    v_pin.never_delete := coalesce((p_patch->>'never_delete')::boolean, false);
  end if;

  if p_patch ? 'country_code' then
    v_pin.country_code := p_patch->>'country_code';
  end if;

  -- Admin email can be passed either as a top-level key or inside contact_methods
  v_admin_email := v_secret.admin_email;
  if p_patch ? '__admin_email' then
    v_admin_email := trim(both from p_patch->>'__admin_email');
  elsif p_patch ? 'admin_email' then
    v_admin_email := trim(both from p_patch->>'admin_email');
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

  v_secret_rotated :=
    (v_secret.admin_email is null or v_secret.admin_email = '') or
    (v_admin_email is distinct from v_secret.admin_email);

  if v_secret_rotated then
    delete from public.pin_owner_secrets where pin_id = p_pin_id;
    insert into public.pin_owner_secrets (pin_id, secret_token, admin_email, other_contacts)
    values (p_pin_id, gen_random_uuid(), v_admin_email, v_contacts);
  else
    update public.pin_owner_secrets
       set admin_email = v_admin_email,
           other_contacts = v_contacts
     where pin_id = p_pin_id;
  end if;

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
         country_code = v_pin.country_code,
         gender_identity = v_pin.gender_identity,
         seeking = v_pin.seeking,
         interest_tags = v_pin.interest_tags,
         note = v_pin.note,
         icon = v_pin.icon,
         nickname = v_pin.nickname,
         age = v_pin.age,
         genders = v_pin.genders,
         contact_methods = v_pin.contact_methods,
         status = v_pin.status,
         approved = v_pin.approved,
         submitted_at = v_pin.submitted_at,
         approved_at = v_pin.approved_at,
         ip_hash = v_pin.ip_hash,
         expires_at = v_pin.expires_at,
         never_delete = v_pin.never_delete
   where id = p_pin_id
   returning * into v_result;

  return jsonb_build_object(
    'pin', to_jsonb(v_result),
    'secret_rotated', v_secret_rotated,
    'admin_email', v_admin_email
  );
end;
$function$
;

grant all on function public.get_pin_edit_state(uuid, uuid) to anon, authenticated, service_role;
grant all on function public.update_pin_via_secret(uuid, uuid, jsonb, boolean) to anon, authenticated, service_role;
