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
// request per lead. The webhook URL is server-side only (GHL_INBOUND_WEBHOOK_URL)
// so it never reaches the browser.
export const config = { maxDuration: 60 };

const MAX_LEADS = 500;
const REQUEST_TIMEOUT_MS = 10_000;

type LeadPayload = Record<string, string | number | boolean | null>;

function firstConfigured(...values: Array<string | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

function header(request: ApiRequest, name: string): string {
  const value = request.headers?.[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Only signed-in staff can push to GHL: check the caller's Supabase session.
async function isSignedIn(request: ApiRequest): Promise<boolean> {
  const token = header(request, "authorization").replace(/^Bearer\s+/i, "");
  const url = firstConfigured(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_URL);
  const key = firstConfigured(
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    process.env.VITE_SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY
  );
  if (!token || !url || !key) return false;
  const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  }).catch(() => null);
  return response?.ok ?? false;
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

  const webhookUrl = process.env.GHL_INBOUND_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    response.status(500).json({ error: "GHL_INBOUND_WEBHOOK_URL is not configured on the server." });
    return;
  }

  if (!(await isSignedIn(request))) {
    response.status(401).json({ error: "Sign in again to save to GHL." });
    return;
  }

  const body = (typeof request.body === "string" ? JSON.parse(request.body || "{}") : request.body) as
    | { leads?: unknown }
    | undefined;
  const leads = Array.isArray(body?.leads) ? body.leads.map(toPayload).filter((l): l is LeadPayload => !!l) : [];
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
