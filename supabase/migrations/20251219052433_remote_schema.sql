


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."bump_turnstile_limit"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_record public.turnstile_rate_limits%rowtype;
  v_reset boolean := false;
begin
  select *
    into v_record
    from public.turnstile_rate_limits
   where key = p_key
   for update;

  if not found then
    insert into public.turnstile_rate_limits (key, request_count)
    values (p_key, 1);
    return true;
  end if;

  if v_record.window_started < now() - make_interval(secs => greatest(p_window_seconds, 1)) then
    update public.turnstile_rate_limits
       set window_started = now(),
           request_count = 1,
           updated_at = now()
     where key = p_key;
    return true;
  end if;

  if v_record.request_count >= p_limit then
    return false;
  end if;

  update public.turnstile_rate_limits
     set request_count = v_record.request_count + 1,
         updated_at = now()
   where key = p_key;
  return true;
end;
$$;


ALTER FUNCTION "public"."bump_turnstile_limit"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."bump_turnstile_limit"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) IS 'Used by the verify-turnstile edge function to enforce per-IP/fingerprint rate limits.';



CREATE OR REPLACE FUNCTION "public"."debug_turnstile"() RETURNS json
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select json_build_object(
    'db_role', current_setting('role', true),      -- this is the role RLS uses
    'current_user', current_user,
    'session_user', session_user,
    'role_claim', current_setting('request.jwt.claim.role', true),
    'turnstile_passed', (auth.jwt()->>'turnstile_passed')::boolean
  );
$$;


ALTER FUNCTION "public"."debug_turnstile"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."pins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "city" "text",
    "state_province" "text",
    "country" "text",
    "gender_identity" "text" NOT NULL,
    "seeking" "text"[] NOT NULL,
    "interest_tags" "text"[],
    "note" "text",
    "contact_discord" "text",
    "contact_reddit" "text",
    "contact_instagram" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "approved" boolean DEFAULT false,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "approved_at" timestamp with time zone,
    "ip_hash" "text",
    "country_code" "text",
    "icon" "text",
    "nickname" "text",
    "age" integer,
    "genders" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "contact_methods" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expires_at" timestamp with time zone,
    "never_delete" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "owner_email_hash" "text",
    "owner_token_hash" "text",
    "owner_token_expires_at" timestamp with time zone,
    "owner_link_sent_at" timestamp with time zone,
    "owner_delete_requested" boolean DEFAULT false NOT NULL,
    CONSTRAINT "pins_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."pins" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pin_via_secret"("p_pin_id" "uuid", "p_secret_token" "uuid") RETURNS "public"."pins"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
$$;


ALTER FUNCTION "public"."get_pin_via_secret"("p_pin_id" "uuid", "p_secret_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_moderator"("uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.moderators m where m.user_id = uid);
$$;


ALTER FUNCTION "public"."is_moderator"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_request_owner"("owner" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select owner is not distinct from auth.uid();
$$;


ALTER FUNCTION "public"."is_request_owner"("owner" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pins_capture_owner_secret"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."pins_capture_owner_secret"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_turnstile_session"("p_session_id" "uuid", "p_fingerprint" "text", "p_ip" "inet", "p_ttl_seconds" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.turnstile_sessions (id, fingerprint, ip, expires_at)
  values (
    p_session_id,
    p_fingerprint,
    p_ip,
    now() + make_interval(secs => greatest(p_ttl_seconds, 60))
  )
  on conflict (id) do update
    set fingerprint = excluded.fingerprint,
        ip = excluded.ip,
        expires_at = excluded.expires_at,
        issued_at = now();
end;
$$;


ALTER FUNCTION "public"."record_turnstile_session"("p_session_id" "uuid", "p_fingerprint" "text", "p_ip" "inet", "p_ttl_seconds" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_turnstile_session"("p_session_id" "uuid", "p_fingerprint" "text", "p_ip" "inet", "p_ttl_seconds" integer) IS 'Edge function helper to persist short-lived sessions issued after a Turnstile check.';



CREATE OR REPLACE FUNCTION "public"."sync_pending_pin_locations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
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


ALTER FUNCTION "public"."sync_pending_pin_locations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."turnstile_verified"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce((auth.jwt()->>'turnstile_passed')::boolean, false);
$$;


ALTER FUNCTION "public"."turnstile_verified"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_pin_via_secret"("p_pin_id" "uuid", "p_secret_token" "uuid", "p_patch" "jsonb" DEFAULT '{}'::"jsonb", "p_delete" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."update_pin_via_secret"("p_pin_id" "uuid", "p_secret_token" "uuid", "p_patch" "jsonb", "p_delete" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bubble_options" (
    "id" bigint NOT NULL,
    "field" "text" NOT NULL,
    "label" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'approved'::"text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "bubble_options_field_check" CHECK (("field" = ANY (ARRAY['gender_identity'::"text", 'seeking'::"text", 'interest_tags'::"text", 'contact_methods'::"text"]))),
    CONSTRAINT "bubble_options_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."bubble_options" OWNER TO "postgres";


ALTER TABLE "public"."bubble_options" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."bubble_options_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" DEFAULT 'site_feedback'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "contact_info" "text",
    "pin_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "messages_kind_check" CHECK (("kind" = ANY (ARRAY['site_feedback'::"text", 'pin_report'::"text"]))),
    CONSTRAINT "messages_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'resolved'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."moderators" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."moderators" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_pin_locations" (
    "pin_id" "uuid" NOT NULL,
    "lat" double precision NOT NULL,
    "lng" double precision NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pending_pin_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pin_owner_secrets" (
    "pin_id" "uuid" NOT NULL,
    "secret_token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_email" "text" NOT NULL,
    "other_contacts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pin_owner_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turnstile_rate_limits" (
    "key" "text" NOT NULL,
    "window_started" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."turnstile_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turnstile_sessions" (
    "id" "uuid" NOT NULL,
    "fingerprint" "text" NOT NULL,
    "ip" "inet",
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    CONSTRAINT "turnstile_sessions_expiry" CHECK (("expires_at" > "issued_at"))
);


ALTER TABLE "public"."turnstile_sessions" OWNER TO "postgres";


ALTER TABLE ONLY "public"."bubble_options"
    ADD CONSTRAINT "bubble_options_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."moderators"
    ADD CONSTRAINT "moderators_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."pending_pin_locations"
    ADD CONSTRAINT "pending_pin_locations_pkey" PRIMARY KEY ("pin_id");



ALTER TABLE ONLY "public"."pin_owner_secrets"
    ADD CONSTRAINT "pin_owner_secrets_pkey" PRIMARY KEY ("pin_id");



ALTER TABLE ONLY "public"."pins"
    ADD CONSTRAINT "pins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turnstile_rate_limits"
    ADD CONSTRAINT "turnstile_rate_limits_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."turnstile_sessions"
    ADD CONSTRAINT "turnstile_sessions_pkey" PRIMARY KEY ("id");



CREATE INDEX "bubble_options_field_idx" ON "public"."bubble_options" USING "btree" ("field");



CREATE INDEX "bubble_options_status_idx" ON "public"."bubble_options" USING "btree" ("status");



CREATE INDEX "messages_created_idx" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "messages_pin_idx" ON "public"."messages" USING "btree" ("pin_id");



CREATE INDEX "messages_status_idx" ON "public"."messages" USING "btree" ("status");



CREATE UNIQUE INDEX "pin_owner_secrets_secret_token_idx" ON "public"."pin_owner_secrets" USING "btree" ("secret_token");



CREATE INDEX "pins_approved_idx" ON "public"."pins" USING "btree" ("approved");



CREATE INDEX "pins_owner_token_hash_idx" ON "public"."pins" USING "btree" ("owner_token_hash");



CREATE INDEX "pins_status_idx" ON "public"."pins" USING "btree" ("status");



CREATE INDEX "turnstile_sessions_fingerprint_idx" ON "public"."turnstile_sessions" USING "btree" ("fingerprint");



CREATE OR REPLACE TRIGGER "magic-links" AFTER INSERT ON "public"."pin_owner_secrets" FOR EACH ROW EXECUTE FUNCTION "supabase_functions"."http_request"('https://ymdwxxcvhxcwjzecxhvb.supabase.co/functions/v1/send-magic-link', 'POST', '{"Content-type":"application/json","Authorization":"Bearer <MAGIC_LINK_WEBHOOK_SECRET>"}', '{}', '5000');



CREATE OR REPLACE TRIGGER "pins_capture_owner_secret" BEFORE INSERT ON "public"."pins" FOR EACH ROW EXECUTE FUNCTION "public"."pins_capture_owner_secret"();



CREATE OR REPLACE TRIGGER "pins_pending_delete" AFTER DELETE ON "public"."pins" FOR EACH ROW EXECUTE FUNCTION "public"."sync_pending_pin_locations"();



CREATE OR REPLACE TRIGGER "pins_pending_sync" AFTER INSERT OR UPDATE OF "status", "lat", "lng" ON "public"."pins" FOR EACH ROW EXECUTE FUNCTION "public"."sync_pending_pin_locations"();



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pin_id_fkey" FOREIGN KEY ("pin_id") REFERENCES "public"."pins"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."moderators"
    ADD CONSTRAINT "moderators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_pin_locations"
    ADD CONSTRAINT "pending_pin_locations_pin_id_fkey" FOREIGN KEY ("pin_id") REFERENCES "public"."pins"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pin_owner_secrets"
    ADD CONSTRAINT "pin_owner_secrets_pin_id_fkey" FOREIGN KEY ("pin_id") REFERENCES "public"."pins"("id") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;



CREATE POLICY "Allow trigger to delete locations" ON "public"."pending_pin_locations" FOR DELETE USING (true);



CREATE POLICY "Allow trigger to insert locations" ON "public"."pending_pin_locations" FOR INSERT WITH CHECK (true);



CREATE POLICY "Allow trigger to update locations" ON "public"."pending_pin_locations" FOR UPDATE USING (true) WITH CHECK (true);



CREATE POLICY "Authenticated moderators can manage bubble options" ON "public"."bubble_options" TO "authenticated" USING ("public"."is_moderator"("auth"."uid"())) WITH CHECK ("public"."is_moderator"("auth"."uid"()));



CREATE POLICY "Authenticated moderators can manage messages" ON "public"."messages" TO "authenticated" USING ("public"."is_moderator"("auth"."uid"())) WITH CHECK ("public"."is_moderator"("auth"."uid"()));



CREATE POLICY "Authenticated moderators can manage pins" ON "public"."pins" TO "authenticated" USING ("public"."is_moderator"("auth"."uid"())) WITH CHECK ("public"."is_moderator"("auth"."uid"()));



CREATE POLICY "Enable read access for all users" ON "public"."pending_pin_locations" FOR SELECT USING (true);



CREATE POLICY "Turnstile clients add bubble options" ON "public"."bubble_options" FOR INSERT TO "authenticated" WITH CHECK (("public"."turnstile_verified"() AND ("status" = 'pending'::"text")));



CREATE POLICY "Turnstile clients can submit messages" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK (("public"."turnstile_verified"() AND ("status" = 'open'::"text") AND ("kind" = ANY (ARRAY['site_feedback'::"text", 'pin_report'::"text"]))));



CREATE POLICY "Turnstile clients edit their pending bubbles" ON "public"."bubble_options" FOR UPDATE TO "authenticated" USING (("public"."turnstile_verified"() AND ("status" = 'pending'::"text") AND "public"."is_request_owner"("created_by"))) WITH CHECK (("public"."turnstile_verified"() AND ("status" = 'pending'::"text") AND "public"."is_request_owner"("created_by")));



CREATE POLICY "Turnstile clients read approved pins" ON "public"."pins" FOR SELECT USING (("public"."turnstile_verified"() AND ("status" = 'approved'::"text")));



CREATE POLICY "Turnstile clients read bubble options" ON "public"."bubble_options" FOR SELECT TO "authenticated" USING (("public"."turnstile_verified"() AND (("status" = 'approved'::"text") OR "public"."is_request_owner"("created_by"))));



CREATE POLICY "Turnstile clients submit pending pins" ON "public"."pins" FOR INSERT WITH CHECK (("public"."turnstile_verified"() AND ("status" = 'pending'::"text") AND ("approved" = false)));



ALTER TABLE "public"."bubble_options" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."moderators" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pending_pin_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pin_owner_secrets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."turnstile_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."turnstile_sessions" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."pins";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


















































































































































































































GRANT ALL ON FUNCTION "public"."bump_turnstile_limit"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."bump_turnstile_limit"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."bump_turnstile_limit"("p_key" "text", "p_window_seconds" integer, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."debug_turnstile"() TO "anon";
GRANT ALL ON FUNCTION "public"."debug_turnstile"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."debug_turnstile"() TO "service_role";



GRANT ALL ON TABLE "public"."pins" TO "anon";
GRANT ALL ON TABLE "public"."pins" TO "authenticated";
GRANT ALL ON TABLE "public"."pins" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pin_via_secret"("p_pin_id" "uuid", "p_secret_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pin_via_secret"("p_pin_id" "uuid", "p_secret_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pin_via_secret"("p_pin_id" "uuid", "p_secret_token" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_moderator"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_moderator"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_moderator"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_request_owner"("owner" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_request_owner"("owner" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_request_owner"("owner" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."pins_capture_owner_secret"() TO "anon";
GRANT ALL ON FUNCTION "public"."pins_capture_owner_secret"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pins_capture_owner_secret"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_turnstile_session"("p_session_id" "uuid", "p_fingerprint" "text", "p_ip" "inet", "p_ttl_seconds" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."record_turnstile_session"("p_session_id" "uuid", "p_fingerprint" "text", "p_ip" "inet", "p_ttl_seconds" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_turnstile_session"("p_session_id" "uuid", "p_fingerprint" "text", "p_ip" "inet", "p_ttl_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_pending_pin_locations"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_pending_pin_locations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_pending_pin_locations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."turnstile_verified"() TO "anon";
GRANT ALL ON FUNCTION "public"."turnstile_verified"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."turnstile_verified"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_pin_via_secret"("p_pin_id" "uuid", "p_secret_token" "uuid", "p_patch" "jsonb", "p_delete" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_pin_via_secret"("p_pin_id" "uuid", "p_secret_token" "uuid", "p_patch" "jsonb", "p_delete" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_pin_via_secret"("p_pin_id" "uuid", "p_secret_token" "uuid", "p_patch" "jsonb", "p_delete" boolean) TO "service_role";


















GRANT ALL ON TABLE "public"."bubble_options" TO "anon";
GRANT ALL ON TABLE "public"."bubble_options" TO "authenticated";
GRANT ALL ON TABLE "public"."bubble_options" TO "service_role";



GRANT ALL ON SEQUENCE "public"."bubble_options_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."bubble_options_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."bubble_options_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."moderators" TO "anon";
GRANT ALL ON TABLE "public"."moderators" TO "authenticated";
GRANT ALL ON TABLE "public"."moderators" TO "service_role";



GRANT ALL ON TABLE "public"."pending_pin_locations" TO "anon";
GRANT ALL ON TABLE "public"."pending_pin_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_pin_locations" TO "service_role";



GRANT ALL ON TABLE "public"."pin_owner_secrets" TO "anon";
GRANT ALL ON TABLE "public"."pin_owner_secrets" TO "authenticated";
GRANT ALL ON TABLE "public"."pin_owner_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."turnstile_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."turnstile_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."turnstile_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."turnstile_sessions" TO "anon";
GRANT ALL ON TABLE "public"."turnstile_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."turnstile_sessions" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































