-- Support objects for the verify-turnstile edge function.
-- Provides lightweight rate limiting + session logging the edge runtime uses
-- via the service-role Supabase client.

begin;

create table if not exists public.turnstile_rate_limits (
  key text primary key,
  window_started timestamptz not null default now(),
  request_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.turnstile_sessions (
  id uuid primary key,
  fingerprint text not null,
  ip inet,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint turnstile_sessions_expiry check (expires_at > issued_at)
);

create index if not exists turnstile_sessions_fingerprint_idx
  on public.turnstile_sessions (fingerprint);

create or replace function public.bump_turnstile_limit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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

comment on function public.bump_turnstile_limit is
  'Used by the verify-turnstile edge function to enforce per-IP/fingerprint rate limits.';

create or replace function public.record_turnstile_session(
  p_session_id uuid,
  p_fingerprint text,
  p_ip inet,
  p_ttl_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

comment on function public.record_turnstile_session is
  'Edge function helper to persist short-lived sessions issued after a Turnstile check.';

commit;
