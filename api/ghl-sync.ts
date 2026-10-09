interface ApiRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

declare const process: {
  env: Record<string, string | undefined>;
};

// Posts leads to a GoHighLevel workflow's "Inbound Webhook" trigger, one
// request per lead. The webhook URL is saved by any signed-in user on the Settings page
// (ghl_settings table, migrations 0007–0008) and read here with the caller's
// session, so it never has to be shipped to the browser. The old
// GHL_INBOUND_WEBHOOK_URL server env var still works as a fallback.
export const config = { maxDuration: 60 };

const MAX_LEADS = 500;
const REQUEST_TIMEOUT_MS = 10_000;

type LeadPayload = Record<string, string | number | boolean | null>;

// Sent by Settings → "Send test lead" so GHL's "Fetch Sample Requests" sees every field.
const SAMPLE_LEAD: LeadPayload = {
  id: "00000000-0000-0000-0000-000000000000",
  facility_name: "Test Facility (Angels Oasis)",
  address: "123 Example St, Los Angeles, CA 90001",
  county: "Los Angeles",
  latitude: 34.05,
  longitude: -118.24,
  nearest_facility_id: null,
  distance_miles: 1.5,
  contact_person: "Test Contact",
  contact_title: "Discharge Planner",
  department: "Case Management",
  email: "test@example.com",
  phone: "(555) 555-0100",
  website: "https://example.com",
  place_id: null,
  category: "hospital",
  status: "new",
  source: "manual",
  notes: "Test lead sent from Angels Oasis Settings.",
  unsubscribed: false,
  last_contacted_at: null,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

function firstConfigured(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

function header(request: ApiRequest, name: string): string {
  const value = request.headers?.[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

type WebhookLookup = { url: string } | { status: number; error: string };

// Checks the caller's Supabase session and returns the GHL webhook URL they may use.
async function resolveWebhookUrl(request: ApiRequest): Promise<WebhookLookup> {
  const token = header(request, "authorization").replace(/^Bearer\s+/i, "");
  const supabaseUrl = firstConfigured(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_URL).replace(/\/+$/, "");
  const key = firstConfigured(
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY
  );
  if (!supabaseUrl || !key) return { status: 500, error: "Supabase URL and publishable key are not configured on the server." };
  if (!token) return { status: 401, error: "Sign in again to save to GHL." };

  const headers = { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const user = await fetch(`${supabaseUrl}/auth/v1/user`, { headers }).catch(() => null);
  if (!user?.ok) return { status: 401, error: "Sign in again to save to GHL." };

  const rpc = await fetch(`${supabaseUrl}/rest/v1/rpc/ghl_inbound_webhook_url`, {
    method: "POST",
    headers,
    body: "{}",
  }).catch(() => null);
  const saved = rpc?.ok ? ((await rpc.json().catch(() => null)) as unknown) : null;
  const url = (typeof saved === "string" && saved.trim()) || process.env.GHL_INBOUND_WEBHOOK_URL?.trim();
  if (!url) {
    return {
      status: 400,
      error: rpc && !rpc.ok && rpc.status !== 404
        ? "You don't have permission to save leads to GHL."
        : "No GHL webhook URL is set. Add it in Settings → GoHighLevel.",
    };
  }
  return { url };
}

function toPayload(lead: unknown): LeadPayload | null {
  if (!lead || typeof lead !== "object") return null;
  const payload: LeadPayload = { source_app: "angels_oasis" };
  for (const [key, value] of Object.entries(lead as Record<string, unknown>)) {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      payload[key] = value as string | number | boolean | null;
    }
  }
  return typeof payload.id === "string" ? payload : null;
}

async function postToGhl(webhookUrl: string, payload: LeadPayload): Promise<string | null> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.ok ? null : `GHL responded ${response.status}`;
  } catch (error) {
    return error instanceof Error ? error.message : "Request failed";
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST") {
    response.status(405).json({ error: "Use POST." });
    return;
  }

  const lookup = await resolveWebhookUrl(request);
  if ("error" in lookup) {
    response.status(lookup.status).json({ error: lookup.error });
    return;
  }
  const webhookUrl = lookup.url;

  let body: { leads?: unknown; test?: unknown } | undefined;
  try {
    body = (typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body) as typeof body;
  } catch {
    response.status(400).json({ error: "Invalid JSON body." });
    return;
  }
  const leads = body?.test === true
    ? [{ ...SAMPLE_LEAD, source_app: "angels_oasis", test: true }]
    : Array.isArray(body?.leads) ? body.leads.map(toPayload).filter((l): l is LeadPayload => !!l) : [];
  if (leads.length === 0) {
    response.status(400).json({ error: "No leads to send." });
    return;
  }
  if (leads.length > MAX_LEADS) {
    response.status(400).json({ error: `Send at most ${MAX_LEADS} leads at a time.` });
    return;
  }

  // Small batches keep GHL from rate-limiting a large push.
  const failed: Array<{ id: string; facility_name: unknown; error: string }> = [];
  for (let i = 0; i < leads.length; i += 5) {
    const batch = leads.slice(i, i + 5);
    const errors = await Promise.all(batch.map((lead) => postToGhl(webhookUrl, lead)));
    errors.forEach((error, index) => {
      if (error) failed.push({ id: String(batch[index].id), facility_name: batch[index].facility_name, error });
    });
  }

  response.status(failed.length === leads.length ? 502 : 200).json({
    sent: leads.length - failed.length,
    failed,
  });
}
