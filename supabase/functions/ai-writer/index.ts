// Supabase Edge Function: ai-writer
//
// Runs server-side only. This is the one place Deepseek's API key is ever
// read — it never reaches the frontend. Deploy with:
//   supabase functions deploy ai-writer
// and set its secrets with:
//   supabase secrets set DEEPSEEK_API_KEY=sk-...
//   supabase secrets set DEEPSEEK_API_KEY_FALLBACK=sk-...
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
//
// Input (POST JSON body):
//   { campaignType: "monday_newsletter" | "wednesday_education" | "friday_testimonial",
//     campaignId?: string,   // existing campaign to attach the draft to
//     topicHint?: string }   // optional extra context from the requester
//
// Output: the created content_drafts row (subject/body/cta/follow_up_body/
// social_version/blog_version). New campaigns are created already approved;
// the AI Writer itself never sends anything.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CAMPAIGN_PROMPTS: Record<string, { title: string; system: string }> = {
  monday_newsletter: {
    title: "Weekly Newsletter",
    system:
      "You write Angels Oasis's Monday newsletter for hospital and referral-partner leads. " +
      "Cover: facility updates, healthcare industry information, CLHF education, patient-transition " +
      "information, community updates. Angels Oasis is a licensed Congregate Living Health Facility " +
      "(CLHF) — tagline 'Home-Like Care. Hospital-Level Expertise.', 24-hour skilled nursing and " +
      "medically complex care, 3:1 caregiver-to-resident ratio. Warm, professional, trustworthy tone.",
  },
  wednesday_education: {
    title: "Facility Education",
    system:
      "You write Angels Oasis's Wednesday facility-education email for hospitals and referral partners. " +
      "Explain what a CLHF is, when patients need specialized residential care, ventilator care, " +
      "skilled nursing services, hospice support, medical complexity care, and why referral sources " +
      "choose Angels Oasis. Warm, professional, trustworthy tone.",
  },
  friday_testimonial: {
    title: "Testimonials / Blog",
    system:
      "You write Angels Oasis's Friday testimonials/blog email. Use ONLY the real testimonial text " +
      "provided in the prompt context — never invent a quote or a person's story. If no testimonial " +
      "text is provided, write a short educational blog piece instead (no fabricated stories).",
  },
};

async function callDeepseek(system: string, userPrompt: string): Promise<string> {
  const primary = Deno.env.get("DEEPSEEK_API_KEY");
  const fallback = Deno.env.get("DEEPSEEK_API_KEY_FALLBACK");
  const keys = [primary, fallback].filter(Boolean) as string[];

  if (keys.length === 0) {
    throw new Error("No Deepseek API key configured (DEEPSEEK_API_KEY / DEEPSEEK_API_KEY_FALLBACK).");
  }

  let lastError: unknown;
  for (const key of keys) {
    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.6,
        }),
      });
      if (!res.ok) throw new Error(`Deepseek responded ${res.status}: ${await res.text()}`);
      const json = await res.json();
      return json.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      lastError = err;
      // try the next key (primary failed / rate-limited -> fallback)
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Deepseek call failed on all keys.");
}

function parseSections(raw: string) {
  // Expects the model to return labeled sections; falls back gracefully if not.
  const pick = (label: string) => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`, "i");
    return raw.match(re)?.[1]?.trim() ?? "";
  };
  return {
    subject: pick("SUBJECT") || raw.split("\n")[0]?.slice(0, 120) || "Angels Oasis Update",
    body: pick("BODY") || raw,
    cta: pick("CTA") || "Schedule a visit or refer a patient — call (323) 213-2831.",
    follow_up_body: pick("FOLLOW_UP"),
    social_version: pick("SOCIAL"),
    blog_version: pick("BLOG"),
  };
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { campaignType, campaignId, topicHint } = await req.json();
    const config = CAMPAIGN_PROMPTS[campaignType];
    if (!config) return new Response(JSON.stringify({ error: "Unknown campaignType" }), { status: 400 });

    const userPrompt =
      `Write the ${config.title} email.${topicHint ? ` Extra context: ${topicHint}.` : ""}\n\n` +
      "Return your answer in this exact labeled format:\n" +
      "SUBJECT: ...\nBODY: ...\nCTA: ...\nFOLLOW_UP: ...\nSOCIAL: ...\nBLOG: ...";

    const raw = await callDeepseek(config.system, userPrompt);
    const sections = parseSections(raw);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let finalCampaignId = campaignId;
    if (!finalCampaignId) {
      const { data: campaign, error: campaignError } = await supabaseAdmin
        .from("campaigns")
        .insert({
          day: campaignType === "monday_newsletter" ? "monday" : campaignType === "wednesday_education" ? "wednesday" : "friday",
          send_date: new Date().toISOString().slice(0, 10),
          title: config.title,
          approval_status: "approved", // campaigns are auto-approved — no manual review step
        })
        .select()
        .single();
      if (campaignError) throw campaignError;
      finalCampaignId = campaign.id;
    }

    const { data: draft, error: draftError } = await supabaseAdmin
      .from("content_drafts")
      .insert({ campaign_id: finalCampaignId, generated_by_model: "deepseek", ...sections })
      .select()
      .single();
    if (draftError) throw draftError;

    return new Response(JSON.stringify({ campaignId: finalCampaignId, draft }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
