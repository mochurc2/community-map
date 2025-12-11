// Edge function: verifies Cloudflare Turnstile tokens, enforces a lightweight
// rate limit, and mints a short-lived JWT that carries the `turnstile_passed`
// claim used by the database policies in `turnstile_policies.sql`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.46.1";
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

// --- ENVIRONMENT VARIABLES ---

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TURNSTILE_SECRET_KEY = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";

// PRODUCTION SECRET: This is what your live site uses (the old secret)
// We check TURNSTILE_SUPABASE_JWT_SECRET first, then fall back to the system default.
const PROD_JWT_SECRET =
  Deno.env.get("TURNSTILE_SUPABASE_JWT_SECRET") ??
  Deno.env.get("SUPABASE_JWT_SECRET") ??
  "";

// DEV SECRET: This is what your new "sb_publishable" key uses
// You must set this in your Dashboard Secrets as 'DEV_JWT_SECRET'
const DEV_JWT_SECRET = Deno.env.get("DEV_JWT_SECRET") ?? "";

const JWT_KID = Deno.env.get("TURNSTILE_JWT_KID") ?? "";

const RATE_LIMIT_WINDOW = parseInt(
  Deno.env.get("TURNSTILE_RATE_WINDOW_SECONDS") ?? "60",
  10
) || 60;
const RATE_LIMIT_MAX = parseInt(
  Deno.env.get("TURNSTILE_RATE_LIMIT") ?? "5",
  10
) || 5;
const SESSION_TTL_SECONDS = parseInt(
  Deno.env.get("TURNSTILE_SESSION_TTL_SECONDS") ?? "900",
  10
) || 900;

// Validate that at least the Production secret is present
if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !PROD_JWT_SECRET || !TURNSTILE_SECRET_KEY) {
  throw new Error(
    "Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TURNSTILE_SUPABASE_JWT_SECRET, TURNSTILE_SECRET_KEY)"
  );
}

// Initialize Supabase Admin Client
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// CORS Headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

// Helper: JSON Response Builder
const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });

// Helper: Verify Turnstile Token with Cloudflare
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

// Helper: Generate Rate Limit Key
const hashKey = (fingerprint: string, ip: string | null) =>
  `${fingerprint || "anon"}:${ip || "unknown"}`;

// --- MAIN REQUEST HANDLER ---
Deno.serve(async (req) => {
  // 1. Handle CORS Preflight Requests
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  // 2. Allow only POST requests
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  // 3. SECRET SWITCHING LOGIC (The "Dual-Mode" Fix)
  // We check which API key the website sent to determine which secret to use.
  const incomingApiKey = req.headers.get("apikey") ?? "";
  let activeSecret = PROD_JWT_SECRET; // Default to Production

  // If the key starts with 'sb_publishable' or 'pk_', it's the new Supabase keys (Dev)
  if (incomingApiKey.startsWith("sb_publishable") || incomingApiKey.startsWith("pk_")) {
    if (DEV_JWT_SECRET) {
      activeSecret = DEV_JWT_SECRET;
      console.log("Environment: DEV detected (using DEV_JWT_SECRET)");
    } else {
      console.error("Critical: Dev key detected but DEV_JWT_SECRET is missing in secrets!");
      // We fall back to PROD_JWT_SECRET but log the error, or you could throw an error here.
    }
  } else {
    // console.log("Environment: PROD detected (using TURNSTILE_SUPABASE_JWT_SECRET)");
  }

  // 4. Parse Request Body
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

  // 5. Check Rate Limits (RPC call)
  const rateKey = hashKey(fingerprint, ip);
  const { data: allowed, error: rateError } = await supabaseAdmin.rpc(
    "bump_turnstile_limit",
    {
      p_key: rateKey,
      p_window_seconds: RATE_LIMIT_WINDOW,
      p_limit: RATE_LIMIT_MAX,
    }
  );

  if (rateError) {
    console.error("Rate limit RPC error:", rateError);
    return jsonResponse(500, { error: "Rate limit check failed" });
  }
  if (allowed === false) {
    return jsonResponse(429, { error: "Too many attempts, try again later" });
  }

  // 6. Verify Turnstile Token
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

  // 7. Prepare JWT Payload
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

  // 8. Sign JWT with the SELECTED Secret (Prod or Dev)
  let signedToken: string;
  try {
    // Import the secret we selected in Step 3
    const jwtKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(activeSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );

    const header: Record<string, unknown> = { alg: "HS256", typ: "JWT" };
    
    // BUG FIX: Only attach the Key ID if we are actually using the Production Secret.
    // If we are in Dev (using DEV_JWT_SECRET), we should NOT attach the Prod KID.
    if (JWT_KID && activeSecret === PROD_JWT_SECRET) {
      header.kid = JWT_KID;
    }

    signedToken = await create(header, payload, jwtKey);
  } catch (err) {
    console.error("JWT creation failed:", err);
    return jsonResponse(500, { error: "Internal token error" });
  }

  // 9. Log Session (RPC call)
  const { error: recordError } = await supabaseAdmin.rpc(
    "record_turnstile_session",
    {
      p_session_id: sessionId,
      p_fingerprint: fingerprint || null,
      p_ip: ip,
      p_ttl_seconds: SESSION_TTL_SECONDS,
    }
  );
  if (recordError) {
    console.error("Session logging failed:", recordError);
    // Continue anyway; logging failure should not block client.
  }

  // 10. Return Success
  return jsonResponse(200, {
    token: signedToken,
    expires_in: SESSION_TTL_SECONDS,
    session_id: sessionId,
  });
});