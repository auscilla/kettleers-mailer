import { createClient } from "npm:@supabase/supabase-js@2";

// Helper to verify standard Svix webhook signature using native Web Crypto
async function verifyResendSignature(
  rawBody: string,
  headers: Headers,
  secret: string
): Promise<boolean> {
  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return false;
  }

  // Reject timestamps older than 5 minutes to prevent replay attacks
  const timestampSec = parseInt(svixTimestamp, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (isNaN(timestampSec) || Math.abs(nowSec - timestampSec) > 300) {
    return false;
  }

  // Extract base64 secret payload (removes the "whsec_" prefix)
  const secretKey = secret.startsWith("whsec_") ? secret.substring(6) : secret;
  const secretBytes = Uint8Array.from(atob(secretKey), (c) => c.charCodeAt(0));

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const encoder = new TextEncoder();

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(signedContent)
  );

  const computedSig = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  // svix-signature header format: "v1,sig1 v1,sig2"
  const passedSignatures = svixSignature.split(" ").map((s) => {
    const parts = s.split(",");
    return parts.length > 1 ? parts[1] : parts[0];
  });

  return passedSignatures.some((sig) => sig === computedSig);
}

Deno.serve(async (req) => {
  // 1. Allow Resend to POST data here
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 2. Read raw text body first for signature verification
  const rawBody = await req.text();

  // 3. Verify webhook authenticity
  const webhookSecret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("RESEND_WEBHOOK_SECRET is not configured in Supabase Secrets.");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const isValid = await verifyResendSignature(rawBody, req.headers, webhookSecret);
  if (!isValid) {
    console.warn("Unauthorized webhook attempt rejected: invalid signature.");
    return new Response("Unauthorized", { status: 401 });
  }

  // 4. Connect to Supabase using the Service Role Key
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  
  if (!supabaseUrl || !serviceKey) {
    return new Response("Database configuration missing", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const payload = JSON.parse(rawBody);
    
    // 5. Identify the event type (e.g., email.opened, email.clicked)
    const eventType = payload.type; 

    // Stop sending to addresses that bounced or complained
    if (eventType === "email.bounced" || eventType === "email.complained") {
      const newStatus = eventType === "email.bounced" ? "Bounced" : "Complained";
      const toRaw = payload.data?.to;
      const toList: string[] = (Array.isArray(toRaw) ? toRaw : toRaw ? [toRaw] : []).filter((a: unknown) => typeof a === "string");
      for (const raw of toList) {
        const addr = (/<([^>]+)>/.exec(raw)?.[1] ?? raw).trim();
        if (!addr) continue;
        const pattern = addr.replace(/[\\%_]/g, (c) => "\\" + c); // match the address literally, ignoring case
        const { error: statusError } = await supabase
          .from("subscribers")
          .update({ status: newStatus })
          .ilike("email", pattern)
          .ilike("status", "active");
        if (statusError) console.error("Could not update subscriber status:", statusError);
      }
    }
    
    // 6. Extract the campaign ID that we attach to outgoing emails
    const rawTags = payload.data?.tags;
    let cIdValue = null;
    
    if (Array.isArray(rawTags)) {
      const t = rawTags.find((t: any) => t.name === "campaign_id");
      if (t) cIdValue = t.value;
    } else if (rawTags && typeof rawTags === 'object') {
      cIdValue = rawTags.campaign_id;
    }
    
    if (!cIdValue) {
      return new Response("No campaign ID found in tags, ignoring.", { status: 200 });
    }

    const campaignId = parseInt(cIdValue, 10);

    // 7. Fetch current stats for this campaign
    const { data: campaign, error: fetchError } = await supabase
      .from("campaigns")
      .select("deliveries, opens, clicks, bounces")
      .eq("id", campaignId)
      .single();

    if (fetchError || !campaign) {
      return new Response("Campaign not found", { status: 404 });
    }

    // 8. Increment the appropriate counter and recalculate rates
    let newDeliveries = campaign.deliveries || 0;
    let newOpens = campaign.opens || 0;
    let newClicks = campaign.clicks || 0;
    let newBounces = campaign.bounces || 0;

    if (eventType === "email.delivered") newDeliveries += 1;
    if (eventType === "email.opened") newOpens += 1;
    if (eventType === "email.clicked") newClicks += 1;
    if (eventType === "email.bounced") newBounces += 1;

    const updates: any = {
      deliveries: newDeliveries,
      opens: newOpens,
      clicks: newClicks,
      bounces: newBounces
    };

    if (newDeliveries > 0) {
      updates.open_rate = ((newOpens / newDeliveries) * 100).toFixed(1);
      updates.click_rate = ((newClicks / newDeliveries) * 100).toFixed(1);
    }

    // 9. Save back to the database
    await supabase.from("campaigns").update(updates).eq("id", campaignId);

    return new Response("Success", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});