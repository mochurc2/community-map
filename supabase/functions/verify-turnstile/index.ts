// Edge function: verifies Cloudflare Turnstile tokens, enforces a lightweight
// rate limit, and mints a short-lived JWT that carries the `turnstile_passed`
// claim used by the database policies in `turnstile_policies.sql`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_JWT_SECRET =
  Deno.env.get("SUPABASE_JWT_SECRET") ??
  Deno.env.get("TURNSTILE_SUPABASE_JWT_SECRET") ??
  "";
const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";

const RATE_LIMIT_WINDOW = parseInt(
  Deno.env.get("TURNSTILE_RATE_WINDOW_SECONDS") ?? "60",
  10,
) || 60;
const RATE_LIMIT_MAX = parseInt(
  Deno.env.get("TURNSTILE_RATE_LIMIT") ?? "5",
  10,
) || 5;
const SESSION_TTL_SECONDS = parseInt(
  Deno.env.get("TURNSTILE_SESSION_TTL_SECONDS") ?? "900",
  10,
) || 900;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !SUPABASE_JWT_SECRET || !TURNSTILE_SECRET_KEY) {
  throw new Error(
    "Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TURNSTILE_SUPABASE_JWT_SECRET/SUPABASE_JWT_SECRET, TURNSTILE_SECRET_KEY)",
  );
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const jwtKeyPromise = crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(SUPABASE_JWT_SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

async function verifyTurnstileToken(token: string, ip: string | null) {
  const body = new URLSearchParams({
    secret: TURNSTILE_SECRET_KEY,
    response: token,
  });
  if (ip) body.append("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });

  if (!res.ok) {
    throw new Error(`Turnstile verification failed with status ${res.status}`);
  }
  return (await res.json()) as {
    success: boolean;
    "error-codes"?: string[];
    challenge_ts?: string;
    hostname?: string;
  };
}

const hashKey = (fingerprint: string, ip: string | null) =>
  `${fingerprint || "anon"}:${ip || "unknown"}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let body: { token?: string; fingerprint?: string } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const token = body.token?.trim();
  if (!token) {
    return jsonResponse(400, { error: "token is required" });
  }

  const fingerprint = (body.fingerprint || "").slice(0, 128);
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for") ??
    null;

  const rateKey = hashKey(fingerprint, ip);
  const { data: allowed, error: rateError } = await supabaseAdmin.rpc(
    "bump_turnstile_limit",
    {
      p_key: rateKey,
      p_window_seconds: RATE_LIMIT_WINDOW,
      p_limit: RATE_LIMIT_MAX,
    },
  );

  if (rateError) {
    console.error("Rate limit RPC error:", rateError);
    return jsonResponse(500, { error: "Rate limit check failed" });
  }
  if (allowed === false) {
    return jsonResponse(429, { error: "Too many attempts, try again later" });
  }

  try {
    const result = await verifyTurnstileToken(token, ip);
    if (!result.success) {
      return jsonResponse(401, {
        error: "Turnstile verification failed",
        codes: result["error-codes"] ?? [],
      });
    }
  } catch (err) {
    console.error(err);
    return jsonResponse(502, { error: "Unable to verify Turnstile token" });
  }

  const sessionId = crypto.randomUUID();
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_TTL_SECONDS;

  const payload = {
    aud: "authenticated",
    sub: sessionId,
    role: "authenticated",
    turnstile_passed: true,
    exp: expiresAt,
    iat: issuedAt,
    session_id: sessionId,
    fingerprint,
  };

  let signedToken: string;
  try {
    const jwtKey = await jwtKeyPromise;
    signedToken = await create({ alg: "HS256", typ: "JWT" }, payload, jwtKey);
  } catch (err) {
    console.error("JWT creation failed:", err);
    return jsonResponse(500, { error: "Internal token error" });
  }

  const { error: recordError } = await supabaseAdmin.rpc(
    "record_turnstile_session",
    {
      p_session_id: sessionId,
      p_fingerprint: fingerprint || null,
      p_ip: ip,
      p_ttl_seconds: SESSION_TTL_SECONDS,
    },
  );
  if (recordError) {
    console.error("Session logging failed:", recordError);
    // Continue anyway; logging failure should not block client.
  }

  return jsonResponse(200, {
    token: signedToken,
    expires_in: SESSION_TTL_SECONDS,
    session_id: sessionId,
  });
});
