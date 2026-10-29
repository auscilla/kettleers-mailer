// Sends a Kettleers campaign email through Resend.
// Supports both test sends (to Aaron only) and live batch distributions to subscriber segments.
// Only Aaron's signed-in session, from the GitHub Pages site, may call this.

import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = "https://auscilla.github.io";
const ALLOWED_EMAIL = ["aaron", "uscilla.com"].join("@"); // joined so the address is not mangled by tooling
const FROM_ADDRESS = "Cotuit Kettleers <onboarding@resend.dev>";

const MAX_SUBJECT_LENGTH = 500;
const MAX_HTML_LENGTH = 1_000_000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX_SENDS = 12;

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
    safeRequested ? requested : "authorization, x-client-info, apikey, content-type",
  );
  return headers;
}

function json(req: Request, status: number, body: Record<string, unknown>): Response {
  const headers = corsHeaders(req);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

// ---- Unsubscribe link signing (HMAC-SHA256 with a key this function already has) ----
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function unsubscribeToken(email: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode("unsubscribe:v1:" + email));
  return b64url(new Uint8Array(sig));
}

async function personalizeHtml(html: string, email: string, supabaseUrl: string, secret: string): Promise<string> {
  const token = await unsubscribeToken(email, secret);
  const url = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/unsubscribe?email=${encodeURIComponent(email)}&amp;token=${token}`;
  // Footer block link that carried the {{email}} placeholder
  let out = html.replace(/https:\/\/[a-z0-9]+\.supabase\.co\/functions\/v1\/unsubscribe\?email=\{\{email\}\}/gi, () => url);
  // Default footer link that was href="#"
  out = out.replace(/<a\s+href="#"([^>]*)>(\s*Unsubscribe[^<]*)<\/a>/gi, (_m, rest, text) => `<a href="${url}"${rest}>${text}</a>`);
  return out;
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
    return json(req, 403, { message: "Forbidden" });
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
    return json(req, 500, { message: "Email service is not configured." });
  }

  const supabase = createClient(supabaseUrl, apiKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const user = userData?.user ?? null;
  const email = user?.email?.trim().toLowerCase() ?? "";
  
  if (userError || !user || email !== ALLOWED_EMAIL.toLowerCase()) {
    return json(req, 403, { message: "You are not allowed to send email." });
  }

  if (tooManySends(user.id)) {
    return json(req, 429, { message: "Too many send attempts. Wait a few minutes." });
  }

  let payload: unknown;
  try { payload = await req.json(); } catch { return json(req, 400, { message: "Request body must be JSON." }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) { return json(req, 400, { message: "Invalid payload." }); }

  const record = payload as Record<string, unknown>;
  const subject = typeof record.subject === "string" ? record.subject.replace(/[\r\n]/g, " ").trim() : "";
  const html = typeof record.html_content === "string" ? record.html_content : "";
  const isTest = record.is_test === true;
  
  const rawSegments = Array.isArray(record.segments)
    ? (record.segments as string[])
    : (typeof record.segment === "string" ? record.segment.split(",").map(s => s.trim()) : ["all"]);

  if (!subject || subject.length > MAX_SUBJECT_LENGTH) return json(req, 400, { message: "A subject line is required." });
  if (!html.trim() || html.length > MAX_HTML_LENGTH) return json(req, 400, { message: "Email content is required." });

  const resendKey = resendApiKey();
  if (!resendKey) return json(req, 500, { message: "Email service is not configured." });
  const signingKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!signingKey) return json(req, 500, { message: "Email service is not configured." });

  let recipients: string[] = [];

  if (isTest) {
    recipients = [ALLOWED_EMAIL];
  } else {
    // 1. Fetch all active subscribers first so we are immune to exact segment plural/singular bugs
    const { data: subData, error: subError } = await supabase
      .from('subscribers')
      .select('email, segment, status')
      .ilike('status', 'active');

    if (subError) {
      console.error("DB Error querying subscribers:", subError);
      return json(req, 500, { message: "Failed to retrieve subscriber list: " + subError.message });
    }

    console.log("Raw active subscribers in DB:", JSON.stringify(subData));
    console.log("Requested segments:", JSON.stringify(rawSegments));

    if (!subData || subData.length === 0) {
      return json(req, 400, { message: "No active subscribers found in database." });
    }

    const isAll = rawSegments.some(s => s.toLowerCase() === 'all' || s.toLowerCase() === 'all active subscribers');

    let matched = subData;
    if (!isAll) {
      const normalizedTargets = rawSegments.map(s => s.toLowerCase().trim().replace(/s$/, '')); // strips trailing 's'
      matched = subData.filter(s => {
        const seg = (s.segment || '').toLowerCase().trim().replace(/s$/, '');
        return normalizedTargets.some(target => target.includes(seg) || seg.includes(target));
      });
    }

    console.log("Subscribers after segment match:", JSON.stringify(matched));

    recipients = matched.map(s => s.email?.trim()).filter(Boolean);

    // Sandbox safeguard: filter strictly for allowed addresses
    if (FROM_ADDRESS.includes('onboarding@resend.dev')) {
      recipients = recipients.filter(email => {
        const lower = email.toLowerCase();
        return lower === ALLOWED_EMAIL.toLowerCase() || lower === 'delivered@resend.dev';
      });
    }

    console.log("Final dispatch recipients list:", JSON.stringify(recipients));

    if (recipients.length === 0) {
      return json(req, 400, { 
        message: "No permitted recipients found. Make sure your active subscriber email matches " + ALLOWED_EMAIL 
      });
    }
  }

  // Dispatch via Resend
  let successfulDispatches = 0;
  for (const recipientEmail of recipients) {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [recipientEmail],
        subject: subject,
        html: await personalizeHtml(html, recipientEmail, supabaseUrl, signingKey),
        tags: record.campaign_id ? [{ name: "campaign_id", value: String(record.campaign_id) }] : undefined
      }),
    });

    const resendResult = await resendResponse.text();
    console.log(`Resend response for ${recipientEmail}: status ${resendResponse.status}\n${resendResult}`);

    if (resendResponse.ok) {
      successfulDispatches++;
    } else {
      console.error(`Resend failed for ${recipientEmail}:`, resendResult);
    }
  }

  if (successfulDispatches === 0) {
    return json(req, 502, { message: "Resend failed to deliver to any recipients. Check function logs for details." });
  }

  return json(req, 200, { 
    ok: true, 
    message: `Dispatched successfully to ${successfulDispatches} recipients.` 
  });
});