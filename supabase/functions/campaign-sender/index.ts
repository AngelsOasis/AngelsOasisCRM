import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const brevoApiKey = Deno.env.get("BREVO_API_KEY");
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Recipient = { lead_id: string; contact_id: string | null; email: string };
type SenderSettings = {
  sender_name: string;
  sender_email: string;
  reply_to_email: string | null;
  physical_address: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizedEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() ?? "";
  return emailPattern.test(email) ? email : null;
}

async function sendEmail(input: {
  senderName: string;
  senderEmail: string;
  to: string;
  replyTo: string | null;
  subject: string;
  text: string;
}) {
  if (!brevoApiKey) throw new Error("Email sending is not configured: set the BREVO_API_KEY Edge Function secret.");

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: input.senderName, email: input.senderEmail },
      to: [{ email: input.to }],
      replyTo: input.replyTo ? { email: input.replyTo } : undefined,
      subject: input.subject,
      textContent: input.text,
    }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Email provider returned ${response.status}: ${responseText.slice(0, 500)}`);
  }
}

async function getRecipients(
  supabase: ReturnType<typeof createClient>,
  audience: string
): Promise<Recipient[]> {
  const recipients = new Map<string, Recipient>();
  for (let offset = 0; ; offset += 500) {
    let leadsQuery = supabase
      .from("leads")
      .select("id, email, unsubscribed, status, category")
      .eq("unsubscribed", false)
      .neq("status", "do_not_contact")
      .range(offset, offset + 499);
    if (audience !== "all") leadsQuery = leadsQuery.eq("category", audience);

    const { data: leads, error: leadsError } = await leadsQuery;
    if (leadsError) throw new Error(`Couldn't load eligible leads: ${leadsError.message}`);
    const rows = leads ?? [];
    if (!rows.length) break;

    const leadIds = rows.map((lead) => lead.id);
    for (const lead of rows) {
      const email = normalizedEmail(lead.email);
      if (email && !recipients.has(email)) {
        recipients.set(email, { lead_id: lead.id, contact_id: null, email });
      }
    }

    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id, lead_id, email")
      .in("lead_id", leadIds);
    if (contactsError) throw new Error(`Couldn't load additional contact emails: ${contactsError.message}`);
    for (const contact of contacts ?? []) {
      const email = normalizedEmail(contact.email);
      if (email && !recipients.has(email)) {
        recipients.set(email, { lead_id: contact.lead_id, contact_id: contact.id, email });
      }
    }

    if (rows.length < 500) break;
  }
  return [...recipients.values()];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    return json({ error: "Campaign sender is not configured." }, 500);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  const isScheduler = authorization === `Bearer ${serviceRoleKey}`;
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!isScheduler && !token) return json({ error: "Authentication required." }, 401);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (!isScheduler) {
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Invalid authentication." }, 401);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profileError) {
      console.error("Could not verify campaign sender role:", profileError.message);
      return json({ error: "Could not verify send permissions." }, 500);
    }
    if (!profile || profile.role === "viewer") return json({ error: "You don't have permission to send campaigns." }, 403);
  }

  let body: { action?: string; campaignId?: string; to?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }
  if (!body.campaignId || !/^[0-9a-f-]{36}$/i.test(body.campaignId)) {
    return json({ error: "A valid campaignId is required." }, 400);
  }
  if (body.action !== "send_now" && body.action !== "send_test") {
    return json({ error: "Action must be send_now or send_test." }, 400);
  }
  const testRecipient = body.action === "send_test" ? normalizedEmail(body.to) : null;
  if (body.action === "send_test" && !testRecipient) {
    return json({ error: "A valid test recipient email is required." }, 400);
  }

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, title, audience, approval_status")
    .eq("id", body.campaignId)
    .maybeSingle();
  if (campaignError) {
    console.error("Could not load campaign:", campaignError.message);
    return json({ error: "Could not load campaign." }, 500);
  }
  if (!campaign) return json({ error: "Campaign not found." }, 404);
  if (body.action === "send_now" && campaign.approval_status !== "approved") {
    return json({ error: "Only approved campaigns can be sent." }, 409);
  }

  const { data: draft, error: draftError } = await supabase
    .from("content_drafts")
    .select("subject, body")
    .eq("campaign_id", campaign.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (draftError) {
    console.error("Could not load campaign copy:", draftError.message);
    return json({ error: "Could not load campaign copy." }, 500);
  }
  if (!draft?.subject?.trim() || !draft.body?.trim()) {
    return json({ error: "Campaign must have an email subject and body before sending." }, 400);
  }

  const { data: settings, error: settingsError } = await supabase
    .from("app_settings")
    .select("sender_name, sender_email, reply_to_email, physical_address")
    .eq("id", true)
    .maybeSingle();
  if (settingsError) {
    console.error("Could not load sending settings:", settingsError.message);
    return json({ error: "Could not load sending settings." }, 500);
  }
  const senderSettings = settings as SenderSettings | null;
  const senderEmail = normalizedEmail(senderSettings?.sender_email);
  if (!senderSettings || !senderEmail) {
    return json({ error: "Set a valid From address in Settings before sending." }, 400);
  }
  if (senderSettings.reply_to_email && !normalizedEmail(senderSettings.reply_to_email)) {
    return json({ error: "The Reply-to address in Settings is invalid." }, 400);
  }
  if (!senderSettings.physical_address?.trim()) {
    return json({ error: "Add a physical mailing address in Settings before sending." }, 400);
  }
  if (!brevoApiKey) {
    return json({ error: "Email sending is not configured: set the BREVO_API_KEY Edge Function secret." }, 503);
  }

  let recipients: Recipient[];
  try {
    recipients = body.action === "send_test"
      ? [{ lead_id: "", contact_id: null, email: testRecipient! }]
      : await getRecipients(supabase, campaign.audience ?? "all");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't load eligible recipients.";
    console.error(message);
    return json({ error: message }, 500);
  }
  if (!recipients.length) return json({ error: "No eligible contacts have valid email addresses." }, 400);

  const senderName = senderSettings.sender_name.replace(/[\r\n<>"]/g, "").trim() || senderEmail;
  const replyTo = normalizedEmail(senderSettings.reply_to_email);
  const text = `${draft.body.trim()}\n\n${senderSettings.physical_address.trim()}\n\nTo stop receiving these emails, reply with UNSUBSCRIBE.`;

  if (body.action === "send_test") {
    try {
      await sendEmail({
        senderName,
        senderEmail,
        to: testRecipient!,
        replyTo,
        subject: draft.subject.trim(),
        text,
      });
      return json({ sent: 1, failed: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The test email failed.";
      console.error(`Test email failed for campaign ${campaign.id}:`, message);
      return json({ error: message }, 502);
    }
  }

  const { data: claimedCampaign, error: claimError } = await supabase
    .from("campaigns")
    .update({ send_status: "sending", send_error: null, is_library_draft: false })
    .eq("id", campaign.id)
    .neq("send_status", "sending")
    .select("id")
    .maybeSingle();
  if (claimError) {
    console.error("Could not mark campaign as sending:", claimError.message);
    return json({ error: "Could not start campaign send." }, 500);
  }
  if (!claimedCampaign) return json({ error: "This campaign is already being sent." }, 409);

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const recipient of recipients) {
    const { data: emailRow, error: insertError } = await supabase
      .from("emails")
      .insert({
        campaign_id: campaign.id,
        lead_id: recipient.lead_id,
        contact_id: recipient.contact_id,
        to_email: recipient.email,
        subject: draft.subject.trim(),
        body: text,
      })
      .select("id")
      .single();
    if (insertError || !emailRow) {
      failed += 1;
      errors.push(`${recipient.email}: couldn't create email record${insertError ? ` (${insertError.message})` : ""}`);
      continue;
    }

    try {
      await sendEmail({
        senderName,
        senderEmail,
        to: recipient.email,
        replyTo,
        subject: draft.subject.trim(),
        text,
      });
      sent += 1;
      const { error: updateError } = await supabase
        .from("emails")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", emailRow.id);
      if (updateError) errors.push(`${recipient.email}: message sent but email log update failed`);
    } catch (error) {
      failed += 1;
      const detail = error instanceof Error ? error.message : "Email provider request failed.";
      errors.push(`${recipient.email}: ${detail}`);
      const { error: updateError } = await supabase
        .from("emails")
        .update({ status: "failed" })
        .eq("id", emailRow.id);
      if (updateError) console.error(`Could not update failed email ${emailRow.id}:`, updateError.message);
    }
  }

  const sendError = errors.length ? errors.join("\n").slice(0, 1000) : null;
  const finalStatus = sent > 0 ? "sent" : "failed";
  const { error: finishError } = await supabase
    .from("campaigns")
    .update({
      send_status: finalStatus,
      recipient_count: sent,
      sent_at: sent > 0 ? new Date().toISOString() : null,
      send_error: sendError,
    })
    .eq("id", campaign.id);
  if (finishError) {
    console.error("Messages were processed but campaign status could not be saved:", finishError.message);
    return json({ sent, failed, error: "Messages were processed, but campaign status could not be saved." }, 500);
  }

  return json({ sent, failed, error: sendError });
});
