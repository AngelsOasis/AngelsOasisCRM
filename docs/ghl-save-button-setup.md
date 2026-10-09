# "Save to GHL" Button: Setup Guide

A button on the Leads page, between **CSV Export** and **Add Lead**. It sends leads to a GoHighLevel (GHL)
workflow through an **Inbound Webhook**, and the workflow creates or updates them as GHL contacts.

**You change the GHL webhook URL inside the app**, under **Settings → GoHighLevel**. Moving to another GHL account
just means pasting a new URL. You don't need to edit `.env` files or redeploy.

How the data flows:

```
Settings → GoHighLevel (paste URL) ────────▶ Supabase table ghl_settings
                                                     │ read by the server with the user's login
Leads page ──"Save to GHL"──▶ /api/ghl-sync (Vercel) ┴──POST per lead──▶ GHL Inbound Webhook ──▶ Workflow: Create/Update Contact
```

- The URL is stored in Supabase. **Anyone signed in** can view or change it (no role restrictions).
- Users click **Save to GHL**, and the **server** fetches the URL through the `ghl_inbound_webhook_url()` database
  function.
- It sends the leads **currently shown** on the page, so the status filter applies.
- GHL matches on email or phone, so clicking it again updates existing contacts instead of creating duplicates.
- Fallback: if no URL is saved in Settings, the server uses the `GHL_INBOUND_WEBHOOK_URL` environment variable when it is set.

---

## Part A: Code changes

### Step 1. Database migrations (run both, in order)

**1a. `supabase/migrations/0007_ghl_settings.sql`.** This creates the single-row `ghl_settings` table and the
`ghl_inbound_webhook_url()` function the server route calls. Its first version was admin-only:

```sql
-- ---------------------------------------------------------------------------
-- GoHighLevel connection — the Inbound Webhook URL used by the Leads page's
-- "Save to GHL" button (api/ghl-sync.ts). Stored here instead of a server env
-- var so admins can point the app at a different GHL account from Settings.
-- Single row: id is always true.
-- ---------------------------------------------------------------------------
create table if not exists ghl_settings (
  id boolean primary key default true check (id),
  inbound_webhook_url text check (inbound_webhook_url is null or inbound_webhook_url ~ '^https://'),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

drop trigger if exists ghl_settings_set_updated_at on ghl_settings;
create trigger ghl_settings_set_updated_at before update on ghl_settings
  for each row execute function set_updated_at();

alter table ghl_settings enable row level security;

-- Only admins can see or change the URL directly.
drop policy if exists "admins read ghl settings" on ghl_settings;
create policy "admins read ghl settings" on ghl_settings
  for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "admins insert ghl settings" on ghl_settings;
create policy "admins insert ghl settings" on ghl_settings
  for insert with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "admins update ghl settings" on ghl_settings;
create policy "admins update ghl settings" on ghl_settings
  for update using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Whether a URL is saved — lets non-admins see the connection status on Settings.
create or replace function ghl_webhook_configured()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from ghl_settings where inbound_webhook_url is not null);
$$;

-- The URL itself, for api/ghl-sync.ts (called with the signed-in user's token).
-- Anyone signed in except read-only viewers may push leads to GHL.
create or replace function ghl_inbound_webhook_url()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select inbound_webhook_url from ghl_settings
  where auth.uid() is not null
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer');
$$;

revoke all on function ghl_webhook_configured() from public, anon;
revoke all on function ghl_inbound_webhook_url() from public, anon;
grant execute on function ghl_webhook_configured() to authenticated;
grant execute on function ghl_inbound_webhook_url() to authenticated;
```

**1b. `supabase/migrations/0008_ghl_settings_open_access.sql`.** This removes the role restrictions, so any signed-in
user can read or change the URL and use Save to GHL:

```sql
-- ---------------------------------------------------------------------------
-- GoHighLevel connection — drop the role restrictions from 0007. Anyone signed
-- in can view and change the Inbound Webhook URL in Settings → GoHighLevel and
-- use the Leads page's "Save to GHL" button.
-- ---------------------------------------------------------------------------
drop policy if exists "admins read ghl settings" on ghl_settings;
drop policy if exists "admins insert ghl settings" on ghl_settings;
drop policy if exists "admins update ghl settings" on ghl_settings;

drop policy if exists "authenticated read ghl settings" on ghl_settings;
create policy "authenticated read ghl settings" on ghl_settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated insert ghl settings" on ghl_settings;
create policy "authenticated insert ghl settings" on ghl_settings
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated update ghl settings" on ghl_settings;
create policy "authenticated update ghl settings" on ghl_settings
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Same function api/ghl-sync.ts calls, now for every signed-in user.
create or replace function ghl_inbound_webhook_url()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select inbound_webhook_url from ghl_settings where auth.uid() is not null;
$$;
```

Run them in the Supabase SQL editor, or with `supabase db push`. They depend on `profiles` and `set_updated_at()`
from `0001_init.sql`. If you're setting this up fresh, you can merge them into one file by writing 0007 with the
0008 policies and function directly.

### Step 2. Server route: `api/ghl-sync.ts`

This is a Vercel serverless function. Locally, `vite.config.ts` serves `api/*.ts` during `npm run dev`.
It does four things:

1. Checks the caller is signed in.
2. Reads the URL from Supabase, falling back to the env var.
3. Posts each lead to GHL, 5 at a time, up to 500 per click.
4. Supports `{ "test": true }`, which sends one sample lead.

```ts
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

// "skilled_nursing_facility" -> "Skilled Nursing Facility", for readable GHL fields and tags.
function label(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

// Extra variables for the GHL Create/Update Contact mapping, added to every lead:
// first/last name split from contact_person (so GHL doesn't show "SCP 1 1"),
// and readable labels. Only the Settings test lead carries `test: "true"`; real
// leads omit `test` entirely, so a GHL check on whether `test` exists or is
// "true" can't send them down the test branch.
function withGhlFields(payload: LeadPayload, test: boolean): LeadPayload {
  const fullName = typeof payload.contact_person === "string" ? payload.contact_person.trim().replace(/\s+/g, " ") : "";
  const [firstName = "", ...rest] = fullName ? fullName.split(" ") : [];
  return {
    ...payload,
    full_name: fullName || null,
    first_name: firstName || null,
    last_name: rest.join(" ") || null,
    category_label: label(payload.category),
    status_label: label(payload.status),
    source_label: label(payload.source),
    source_app: "angels_oasis",
    ...(test ? { test: "true" } : {}),
  };
}

function toPayload(lead: unknown): LeadPayload | null {
  if (!lead || typeof lead !== "object") return null;
  const payload: LeadPayload = {};
  for (const [key, value] of Object.entries(lead as Record<string, unknown>)) {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      payload[key] = value as string | number | boolean | null;
    }
  }
  return typeof payload.id === "string" ? withGhlFields(payload, false) : null;
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
    ? [withGhlFields(SAMPLE_LEAD, true)]
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
```

### Step 3. Settings page: `src/pages/app/Settings.tsx`

**3a.** Add this component above `export default function Settings()`:

```tsx
// The GoHighLevel Inbound Webhook URL used by the Leads page's "Save to GHL"
// button. Stored in the ghl_settings table (any signed-in user); api/ghl-sync.ts reads it.
function GhlSettings() {
  const [url, setUrl] = useState("");
  const [draftUrl, setDraftUrl] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) {
        setLoadError(authError.message);
        return;
      }
      if (!auth.user) {
        setLoadError("Sign in to view GHL settings.");
        return;
      }

      const { data, error } = await supabase.from("ghl_settings").select("inbound_webhook_url").maybeSingle();
      if (error) setLoadError(error.message);
      else {
        setUrl(data?.inbound_webhook_url ?? "");
        setConfigured(Boolean(data?.inbound_webhook_url));
      }
    })();
  }, []);

  useEffect(() => {
    if (!isEditOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && busy === null) setIsEditOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isEditOpen, busy]);

  function openEditor() {
    setDraftUrl(url);
    setMessage(null);
    setIsEditOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const newUrl = draftUrl.trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(newUrl);
    } catch {
      setMessage({ text: "Enter a valid HTTPS webhook URL.", isError: true });
      return;
    }
    if (parsedUrl.protocol !== "https:") {
      setMessage({ text: "The webhook URL must use HTTPS.", isError: true });
      return;
    }

    setBusy("save");
    setMessage(null);
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      setBusy(null);
      setMessage({ text: authError?.message ?? "Sign in again before changing the webhook URL.", isError: true });
      return;
    }
    const { error } = await supabase
      .from("ghl_settings")
      .upsert({ id: true, inbound_webhook_url: newUrl, updated_by: auth.user.id });
    setBusy(null);
    if (error) {
      setMessage({ text: error.message, isError: true });
      return;
    }
    setUrl(newUrl);
    setConfigured(true);
    setIsEditOpen(false);
    setMessage({ text: "GHL webhook link saved." });
  }

  async function sendTest() {
    setBusy("test");
    setMessage(null);
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/ghl-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ test: true }),
      });
      const result = (await response.json().catch(() => ({}))) as { sent?: number; failed?: Array<{ error: string }>; error?: string };
      if (result.error) setMessage({ text: result.error, isError: true });
      else if (result.failed?.length) setMessage({ text: `GHL rejected the test: ${result.failed[0].error}`, isError: true });
      else setMessage({ text: "Test lead sent. In GHL, open the Inbound Webhook trigger and click Fetch Sample Requests." });
    } catch {
      setMessage({ text: "Couldn't reach the server to send the test.", isError: true });
    }
    setBusy(null);
  }

  if (loadError) {
    return (
      <p className="mt-2 text-sm text-red-600">
        Couldn't load GHL settings ({loadError}). Run <code>supabase/migrations/0007_ghl_settings.sql</code> and{" "}
        <code>0008_ghl_settings_open_access.sql</code> in the Supabase SQL editor.
      </p>
    );
  }
  if (configured === null) return <p className="mt-2 text-sm text-plum/50">Loading…</p>;

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs">
        Status: {configured ? <span className="font-medium text-plum">Connected</span> : <span className="text-plum/50">not set</span>}
      </p>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary !px-4 !py-2 text-sm"
            onClick={openEditor}
          >
            {configured ? "Edit" : "Add webhook"}
          </button>
          <button
            type="button"
            disabled={busy !== null || !configured}
            className="rounded-full border border-plum/20 px-4 py-2 text-sm font-medium text-plum hover:bg-plum/5 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={sendTest}
          >
            {busy === "test" ? "Sending…" : "Send test lead"}
          </button>
        </div>
        {isEditOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && busy === null) setIsEditOpen(false);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="ghl-webhook-dialog-title"
              className="w-full max-w-lg rounded-[10px] border border-hairline bg-white p-6 shadow-xl sm:p-8"
            >
              <h3 id="ghl-webhook-dialog-title" className="font-serif text-xl text-plum-dark">
                Edit GHL Webhook Link
              </h3>
              <p className="mt-2 text-sm text-plum/60">
                Paste the Inbound Webhook URL from the GHL workflow you want to use.
              </p>
              <form onSubmit={save} className="mt-5 space-y-4">
                <label className="block text-sm">
                  <span className="font-medium text-plum-dark">GHL Webhook Link</span>
                  <input
                    type="url"
                    required
                    autoComplete="url"
                    inputMode="url"
                    placeholder="https://services.leadconnectorhq.com/hooks/…"
                    className="mt-1 w-full px-3 py-2 font-mono text-xs"
                    value={draftUrl}
                    onChange={(event) => setDraftUrl(event.target.value)}
                  />
                  <span className="mt-1 block text-xs text-plum/50">
                    The link must use HTTPS.
                  </span>
                </label>
                {message?.isError && <p role="alert" className="text-sm text-red-600">{message.text}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    className="rounded-full border border-plum/20 px-4 py-2 text-sm font-medium text-plum hover:bg-plum/5 disabled:opacity-50"
                    disabled={busy !== null}
                    onClick={() => setIsEditOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary !px-5 !py-2 text-sm" disabled={busy !== null}>
                    {busy === "save" ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
      {message && <p className={`text-xs ${message.isError ? "text-red-600" : "text-plum"}`}>{message.text}</p>}
    </div>
  );
}
```

**3b.** Add the card inside the Settings grid. Here it goes just before the "User roles" card:

```tsx
<div className="card">
  <h2 className="font-serif text-lg">GoHighLevel</h2>
  <p className="mt-2 text-sm text-plum/60">
    Where the Leads page's <strong>Save to GHL</strong> button sends leads. Each lead is posted to a GHL
    workflow's Inbound Webhook, which creates or updates the contact.
  </p>
  <GhlSettings />
</div>
```

### Step 4. Leads page: `src/pages/app/Leads.tsx`

**4a. Import the icon.** Add `Upload` to the lucide import:

```tsx
import { Download, Upload } from "lucide-react";
```

**4b. Add state.** Put these lines under the other `useState` lines inside `Leads()`:

```tsx
const [syncing, setSyncing] = useState(false);
const [syncMessage, setSyncMessage] = useState<string | null>(null);
```

**4c. Add the send function.** Put it just above `function exportLeadsCSV()`:

```tsx
// Sends the leads currently shown (respecting the status filter) to the GHL workflow.
async function saveLeadsToGhl() {
  if (!confirm(`Send ${visibleLeads.length} lead${visibleLeads.length === 1 ? "" : "s"} to GoHighLevel?`)) return;
  setSyncing(true);
  setSyncMessage(null);
  try {
    const { data } = await supabase.auth.getSession();
    const response = await fetch("/api/ghl-sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${data.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ leads: visibleLeads }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      sent?: number;
      failed?: Array<{ facility_name: string }>;
      error?: string;
    };
    if (result.error) setSyncMessage(result.error);
    else if (result.failed?.length)
      setSyncMessage(
        `Sent ${result.sent} to GHL; ${result.failed.length} failed: ${result.failed.map((f) => f.facility_name).join(", ")}`
      );
    else
      setSyncMessage(
        `Sent ${result.sent} lead${result.sent === 1 ? "" : "s"} to GHL. If contacts don't appear, check the workflow's Execution logs in GHL.`
      );
  } catch {
    setSyncMessage("Couldn't reach the server to save to GHL.");
  }
  setSyncing(false);
}
```

**4d. Add the button.** Put it between the CSV Export `</button>` and the Add Lead button:

```tsx
<button
  type="button"
  onClick={saveLeadsToGhl}
  disabled={loading || syncing || leads.length === 0}
  className="inline-flex items-center gap-2 rounded-lg border border-plum/20 px-4 py-2 text-sm font-medium text-plum transition-colors hover:bg-plum/5 disabled:cursor-not-allowed disabled:opacity-50"
>
  <Upload className="h-4 w-4" />
  {syncing ? "Saving…" : "Save to GHL"}
</button>
```

**4e. Add the result message.** Put it right after the header `</div>` and before `{showForm && (`:

```tsx
{syncMessage && <p className="mt-3 text-right text-sm text-plum/70">{syncMessage}</p>}
```

### Step 5. Type-check

```bash
npx tsc --noEmit
```

---

## Part B: Connect a GHL account (repeat for each new account)

### Step 6. Create the workflow and its webhook

1. In GHL, go to **Automation → Workflows → + Create Workflow → Start from scratch**.
2. Click **Add New Trigger** and choose **Inbound Webhook**. This is a premium trigger and is billed per run.
3. Copy the webhook URL it shows. It looks like
   `https://services.leadconnectorhq.com/hooks/<location-id>/webhook-trigger/<id>`.
4. Name the workflow something like "Angels Oasis → Save to GHL".

### Step 7. Paste the URL into the app

1. Sign in to the app with any user.
2. Go to **Settings → GoHighLevel**, click **Add webhook** (or **Edit**), paste the URL and click **Save changes**. The status changes to **Connected**.
3. Click **Send test lead**. This sends one sample lead that contains every field.

To **switch GHL accounts** later, click **Edit**, paste the new account's URL and click **Save changes**.

### Step 8. Capture the sample in GHL

1. Back in GHL, open the Inbound Webhook trigger and click **Fetch Sample Requests**.
2. Select the test request and click **Save Trigger**.

Each lead arrives as a flat JSON object with these fields:

| Field | Example |
|---|---|
| `id` | Supabase lead UUID |
| `facility_name` | Cedars-Sinai Medical Center |
| `contact_person`, `contact_title` | SCP 1 |
| `email` / `phone` | kam.team26@gmail.com / (877) 468-5973 |
| `address`, `county`, `website` | |
| `category` | hospital |
| `status` | active_partner |
| `source` | map_discovery |
| `department`, `notes`, `last_contacted_at`, `created_at` | |
| `source_app` | always `angels_oasis` |
| `full_name` / `first_name` / `last_name` | SCP 1 / SCP / 1 (split from `contact_person`) |
| `category_label` / `status_label` / `source_label` | Hospital / Active Partner / Map Discovery |
| `test` | `"true"` only on the Settings test lead; real leads don't include `test` at all |

### Step 9. Create the custom fields (once per GHL account)

Go to **Settings → Custom Fields → Add Field**, choose the Contact object, and create these text fields:
`Supabase Lead ID`, `County`, `Lead Category`, `Lead Status`, `Department`.

### Step 10. Add the Create/Update Contact action

Under the trigger, choose **+ → Create/Update Contact** and map these fields:

| GHL contact field | Value from the webhook |
|---|---|
| Email | `{{inboundWebhookRequest.email}}` |
| Phone | `{{inboundWebhookRequest.phone}}` |
| First Name | `{{inboundWebhookRequest.first_name}}` |
| Last Name | `{{inboundWebhookRequest.last_name}}` |
| Company Name | `{{inboundWebhookRequest.facility_name}}` |
| Address | `{{inboundWebhookRequest.address}}` |
| Website | `{{inboundWebhookRequest.website}}` |
| Supabase Lead ID | `{{inboundWebhookRequest.id}}` |
| County / Lead Category / Lead Status / Department | the matching fields |

Pick each value from the field picker. GHL shows the sample request's keys there, so you don't have to type them.

Optional actions:

- **If/Else** on `test` **is** `true` (lowercase) → **End**, so test leads don't become contacts.
- **Add Tag**: `angels-oasis`
- **Create/Update Opportunity**: put the contact into your referral pipeline
- **Add to Workflow**: start an email sequence

### Step 11. Publish and test

1. Switch the workflow from Draft to **Publish** and **Save**.
2. On the **Leads** page, click **Save to GHL** → OK. You should see "Saved N leads to GHL."
3. Check **Contacts** in GHL.

---

## Troubleshooting

| Message | Cause and fix |
|---|---|
| Settings: `Couldn't load GHL settings … Run 0007 … and 0008 …` | The migrations haven't been applied. Run Step 1's SQL. |
| Settings: `new row violates row-level security policy` | 0008 hasn't been run, so only admins can save. Run Step 1b. |
| `No GHL webhook URL is set…` | Nothing is saved in Settings and there is no env fallback. Paste the URL (Step 7). |
| `Sign in again to save to GHL.` | The session expired. Log out and back in. On Vercel, also check that the Supabase URL and publishable key env vars are set. |
| `You don't have permission to save leads to GHL.` | The database function failed. Re-run the Step 1 migrations. |
| `GHL rejected the test: GHL responded 404` | Wrong URL, or the workflow or trigger was deleted. Copy the URL again. |
| `Saved X to GHL; N failed: …` | GHL rejected some requests. Check the workflow is **Published**. |
| Contacts appear without a name or company | The fields aren't mapped in Step 10. |
| Duplicates | The lead has no email or phone, so GHL had nothing to match on. |

## Limits

- At most 500 leads per click. Requests go out 5 at a time.
- This only goes one way, from the app to GHL. Changes made in GHL don't come back to the app. For that, add a GHL
  **Webhook** action that posts to a new endpoint (e.g. `api/ghl-webhook.ts`).
