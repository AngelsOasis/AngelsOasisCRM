import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    return json({ error: "Campaign scheduler is not configured." }, 500);
  }
  if (request.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return json({ error: "Unauthorized." }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: campaignIds, error: claimError } = await supabase.rpc("claim_due_campaign_sends");
  if (claimError) {
    console.error("Could not claim due campaigns:", claimError.message);
    return json({ error: "Could not claim due campaigns." }, 500);
  }

  const results: { campaignId: string; ok: boolean; detail: string }[] = [];
  for (const { campaign_id: campaignId } of campaignIds ?? []) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/campaign-sender`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ action: "send_now", campaignId }),
      });
      const responseText = await response.text();
      let payload: unknown = null;
      try {
        payload = responseText ? JSON.parse(responseText) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(`campaign-sender returned ${response.status}: ${responseText}`);
      }
      if (!payload || typeof payload !== "object" || !("sent" in payload)) {
        throw new Error("campaign-sender returned an unexpected response.");
      }
      results.push({ campaignId, ok: true, detail: "Send request completed." });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown send error.";
      console.error(`Automatic send failed for campaign ${campaignId}:`, detail);
      const { error: updateError } = await supabase
        .from("campaigns")
        .update({ send_error: detail.slice(0, 1000) })
        .eq("id", campaignId);
      if (updateError) console.error(`Could not save send error for ${campaignId}:`, updateError.message);
      results.push({ campaignId, ok: false, detail });
    }
  }

  return json({ processed: results.length, results });
});
