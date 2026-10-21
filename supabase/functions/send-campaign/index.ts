// Sends a Kettleers campaign email through Resend.
// Only Aaron's signed-in session, from the GitHub Pages site, may call this.
// The recipient is fixed here. The browser cannot choose who receives the mail.
//
// Expects a Supabase secret named RESEND_API_KEY. RESEND_KEY,
// RESEND_API_TOKEN, RESEND_TOKEN, or any other Resend-named re_ secret
// are also accepted. From address matches the app:
// Cotuit Kettleers <onboarding@resend.dev>.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://auscilla.github.io";
const ALLOWED_EMAIL = "aaron@uscilla.com";
const FROM_ADDRESS = "Cotuit Kettleers <onboarding@resend.dev>";

const MAX_SUBJECT_LENGTH = 500;
const MAX_HTML_LENGTH = 1_000_000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_SENDS = 8;

const recentSends = new Map<string, number[]>();

function supabaseApiKey(): string {
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (anon) return anon;

  const single = Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (single) return single;

  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const entry = parsed.default ?? Object.values(parsed)[0];
    if (!entry) return "";
    if (entry.startsWith("sb_") || entry.startsWith("eyJ")) return entry;
    return Deno.env.get(entry) ?? "";
  } catch {
    return "";
  }
}

function resendApiKey(): string {
  for (const name of ["RESEND_API_KEY", "RESEND_KEY", "RESEND_API_TOKEN", "RESEND_TOKEN"]) {
    const value = Deno.env.get(name);
    if (value) return value;
  }

  // The existing function already has a Resend secret. Accept a re_ key
  // stored under any name that mentions Resend, so a redeploy keeps working.
  for (const [name, value] of Object.entries(Deno.env.toObject())) {
    if (/resend/i.test(name) && value.startsWith("re_")) return value;
  }
  return "";
}

function corsHeaders(req: Request): Headers {
  const headers = new Headers();
  if (req.headers.get("Origin") !== ALLOWED_ORIGIN) return headers;

  headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Max-Age", "600");

  const requested = req.headers.get("Access-Control-Request-Headers") ?? "";
  const safeRequested = /^[A-Za-z0-9-, ]{1,300}$/.test(requested);
  headers.set(
    "Access-Control-Allow-Headers",
    safeRequested
      ? requested
      : "authorization, x-client-info, apikey, content-type",
  );
  return headers;
}

function json(req: Request, status: number, body: Record<string, unknown>): Response {
  const headers = corsHeaders(req);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

function tooManySends(userId: string): boolean {
  const now = Date.now();
  const recent = (recentSends.get(userId) ?? []).filter((at) => now - at < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_SENDS) {
    recentSends.set(userId, recent);
    return true;
  }
  recent.push(now);
  recentSends.set(userId, recent);
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    if (req.headers.get("Origin") !== ALLOWED_ORIGIN) {
      return new Response("Forbidden", { status: 403 });
    }
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.headers.get("Origin") !== ALLOWED_ORIGIN) {
    return new Response(JSON.stringify({ message: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return json(req, 405, { message: "Method not allowed." });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(authHeader)?.[1] ?? "";
  if (!token || token.startsWith("sb_")) {
    return json(req, 401, { message: "Sign in is required." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const apiKey = supabaseApiKey();
  if (!supabaseUrl || !apiKey) {
    console.error("Supabase URL or API key is missing in the function environment.");
    return json(req, 500, { message: "Email service is not configured." });
  }

  const supabase = createClient(supabaseUrl, apiKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user ?? null;
  const email = user?.email?.trim().toLowerCase() ?? "";
  if (userError || !user || email !== ALLOWED_EMAIL) {
    return json(req, 403, { message: "You are not allowed to send email." });
  }

  if (tooManySends(user.id)) {
    return json(req, 429, { message: "Too many send attempts. Wait a few minutes and try again." });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json(req, 400, { message: "Request body must be JSON." });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(req, 400, { message: "Request body must be a JSON object." });
  }

  const record = payload as Record<string, unknown>;
  const subject = typeof record.subject === "string"
    ? record.subject.replace(/[\r\n]/g, " ").trim()
    : "";
  const html = typeof record.html_content === "string" ? record.html_content : "";

  if (!subject || subject.length > MAX_SUBJECT_LENGTH) {
    return json(req, 400, { message: "A subject line is required." });
  }
  if (!html.trim() || html.length > MAX_HTML_LENGTH) {
    return json(req, 400, { message: "Email content is required." });
  }

  const resendKey = resendApiKey();
  if (!resendKey) {
    console.error("No Resend secret is set. Expected RESEND_API_KEY.");
    return json(req, 500, { message: "Email service is not configured." });
  }

  // Recipient, from address, and extra recipients are chosen here.
  // test_email, to, cc, and bcc in the request are ignored.
  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [ALLOWED_EMAIL],
      subject,
      html,
    }),
  });

  const resendText = await resendResponse.text();
  let resendBody: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(resendText) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      resendBody = parsed as Record<string, unknown>;
    }
  } catch {
    resendBody = {};
  }

  if (!resendResponse.ok) {
    const message = typeof resendBody.message === "string"
      ? resendBody.message
      : "The email service rejected the message.";
    console.error("Resend rejected the send.", resendResponse.status);
    return json(req, 502, { message });
  }

  return json(req, 200, { ok: true, id: resendBody.id ?? null });
});
