// Sends a magic link email to the pin owner when a new secret is created.
// Triggered by the Postgres webhook on insert into public.pin_owner_secrets.

import { Resend } from "https://esm.sh/resend@3.1.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL =
  Deno.env.get("MAGIC_LINK_FROM_EMAIL") ??
  Deno.env.get("MAIL_FROM") ??
  "Community Map <noreply@example.com>";
const SITE_URL = (Deno.env.get("SITE_URL") ?? Deno.env.get("MAGIC_LINK_SITE_URL") ?? "").replace(/\/$/, "");
const WEBHOOK_SHARED_SECRET = Deno.env.get("MAGIC_LINK_WEBHOOK_SECRET") ?? "";

if (!RESEND_API_KEY) {
  throw new Error("Missing RESEND_API_KEY");
}
if (!SITE_URL) {
  throw new Error("Missing SITE_URL or MAGIC_LINK_SITE_URL");
}
if (!WEBHOOK_SHARED_SECRET) {
  throw new Error("Missing MAGIC_LINK_WEBHOOK_SECRET for webhook auth");
}

const resend = new Resend(RESEND_API_KEY);

const jsonResponse = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${WEBHOOK_SHARED_SECRET}`) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse(400, { error: "Invalid JSON" });
  }

  const record =
    (payload.record as Record<string, unknown> | undefined) ??
    (payload.new as Record<string, unknown> | undefined) ??
    payload;

  const adminEmail = String(record?.admin_email ?? "").trim();
  const pinId = record?.pin_id as string | undefined;
  const secretToken = record?.secret_token as string | undefined;

  if (!adminEmail || !pinId || !secretToken) {
    return jsonResponse(400, { error: "admin_email, pin_id, and secret_token are required" });
  }

  const magicLink = `${SITE_URL}/edit-pin?id=${encodeURIComponent(pinId)}&token=${encodeURIComponent(secretToken)}`;

  const subject = "Edit or delete your Community Map pin";
  const text = [
    "Here is your private link to manage your pin:",
    magicLink,
    "",
    "Keep this link safe. Anyone with it can edit or delete your pin.",
  ].join("\n");

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [adminEmail],
      subject,
      text,
      html: `
        <p>Here is your private link to manage your pin:</p>
        <p><a href="${magicLink}">${magicLink}</a></p>
        <p style="margin-top:12px;color:#555;">Keep this link safe. Anyone with it can edit or delete your pin.</p>
      `,
    });
  } catch (err) {
    console.error("Resend error", err);
    return jsonResponse(502, { error: "Failed to send magic link email" });
  }

  return jsonResponse(200, { ok: true });
});
