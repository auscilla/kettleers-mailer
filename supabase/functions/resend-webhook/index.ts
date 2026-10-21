import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // 1. Allow Resend to POST data here
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // 2. Connect to Supabase using the Service Role Key (bypasses RLS for automated backend tasks)
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  
  if (!supabaseUrl || !serviceKey) {
    return new Response("Database configuration missing", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const payload = await req.json();
    
    // 3. Identify the event type (e.g., email.opened, email.clicked)
    const eventType = payload.type; 
    
    // 4. Extract the campaign ID that we will attach to outgoing emails
    const tags = payload.data?.tags || [];
    const campaignTag = tags.find((t: any) => t.name === "campaign_id");
    
    if (!campaignTag || !campaignTag.value) {
      return new Response("No campaign ID found in tags, ignoring.", { status: 200 });
    }

    const campaignId = parseInt(campaignTag.value, 10);

    // 5. Fetch current stats for this campaign
    const { data: campaign, error: fetchError } = await supabase
      .from('campaigns')
      .select('deliveries, opens, clicks, bounces')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      return new Response("Campaign not found", { status: 404 });
    }

    // 6. Increment the appropriate counter
    const updates: any = {};
    if (eventType === 'email.delivered') updates.deliveries = (campaign.deliveries || 0) + 1;
    if (eventType === 'email.opened') updates.opens = (campaign.opens || 0) + 1;
    if (eventType === 'email.clicked') updates.clicks = (campaign.clicks || 0) + 1;
    if (eventType === 'email.bounced') updates.bounces = (campaign.bounces || 0) + 1;

    // 7. Save back to the database
    if (Object.keys(updates).length > 0) {
      await supabase.from('campaigns').update(updates).eq('id', campaignId);
    }

    return new Response("Success", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});
