import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "../../lib/supabaseClient";
import { functionErrorMessage, getIntegrationStatus, type IntegrationStatus } from "../../lib/discovery";
import type { AppSettings } from "../../lib/types";

// One admin-managed key stored in Supabase Vault via the integration-keys
// Edge Function. The browser only ever sees a masked preview.
function IntegrationKey({
  name,
  label,
  description,
  status,
  onStatus,
}: {
  name: string;
  label: ReactNode;
  description: ReactNode;
  status: IntegrationStatus | null | undefined;
  onStatus: (s: IntegrationStatus) => void;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  async function save(newValue: string) {
    setSaving(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke("integration-keys", {
      body: { action: "set", name, value: newValue },
    });
    setSaving(false);
    if (error) {
      setMessage({ text: await functionErrorMessage(error), isError: true });
      return;
    }
    onStatus(data as IntegrationStatus);
    setValue("");
    setMessage({ text: newValue ? "Key saved." : "Key removed." });
  }

  const key = status?.keys[name];

  return (
    <div className="mt-4 rounded-lg border border-plum/10 p-3">
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs text-plum/60">{description}</p>
      {status === undefined && <p className="mt-2 text-xs text-plum/50">Loading…</p>}
      {status === null && (
        <p className="mt-2 text-xs text-red-600">
          Couldn't reach the integration-keys Edge Function — deploy it with{" "}
          <code>supabase functions deploy integration-keys</code>.
        </p>
      )}
      {status && (
        <>
          <p className="mt-2 text-xs">
            Status:{" "}
            {key?.configured ? <span className="font-mono">{key.masked ?? "configured"}</span> : <span className="text-plum/50">not set</span>}
          </p>
          {status.isAdmin ? (
            <form
              className="mt-2 flex flex-wrap gap-2"
              onSubmit={(e: FormEvent) => { e.preventDefault(); if (value.trim()) save(value.trim()); }}
            >
              <input
                type="password" autoComplete="off" placeholder={key?.configured ? "Paste a new key to replace" : "Paste key"}
                className="min-w-0 flex-1 rounded-lg border border-plum/20 px-3 py-1.5 text-sm"
                value={value} onChange={(e) => setValue(e.target.value)}
              />
              <button type="submit" className="btn-primary !px-3 !py-1.5 text-sm" disabled={saving || !value.trim()}>
                {saving ? "Saving…" : "Save"}
              </button>
              {key?.configured && (
                <button type="button" className="text-xs text-red-500 hover:underline" disabled={saving}
                  onClick={() => confirm("Remove this key?") && save("")}>
                  Remove
                </button>
              )}
            </form>
          ) : (
            <p className="mt-2 text-xs text-plum/50">Only admins can change this key.</p>
          )}
        </>
      )}
      {message && <p className={`mt-2 text-xs ${message.isError ? "text-red-600" : "text-plum"}`}>{message.text}</p>}
    </div>
  );
}

function SendingSettings({ isAdmin }: { isAdmin: boolean }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    supabase.from("app_settings").select("*").single().then(({ data, error }) => {
      if (error) setLoadError(error.message);
      else setSettings(data as AppSettings);
    });
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    const { data, error } = await supabase
      .from("app_settings")
      .update({ ...settings, reply_to_email: settings.reply_to_email || null, updated_at: new Date().toISOString() })
      .eq("id", true)
      .select();
    setSaving(false);
    if (error) setMessage({ text: error.message, isError: true });
    else if (!data?.length) setMessage({ text: "Only admins can change sending settings.", isError: true });
    else setMessage({ text: "Saved." });
  }

  if (loadError) {
    return (
      <p className="mt-2 text-sm text-red-600">
        Couldn't load sending settings ({loadError}). Run <code>supabase/migrations/0004_campaign_writer.sql</code> in the
        Supabase SQL editor.
      </p>
    );
  }
  if (!settings) return <p className="mt-2 text-sm text-plum/50">Loading…</p>;

  const field = (key: keyof AppSettings, label: string, type = "text", hint?: string) => (
    <label className="block text-sm">
      <span className="font-medium text-plum-dark">{label}</span>
      <input type={type} disabled={!isAdmin} required={key !== "reply_to_email"}
        className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-1.5 disabled:bg-plum/5"
        value={settings[key] ?? ""} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} />
      {hint && <span className="mt-0.5 block text-xs text-plum/50">{hint}</span>}
    </label>
  );

  return (
    <form onSubmit={save} className="mt-3 space-y-3">
      {field("sender_name", "From name")}
      {field("sender_email", "From address", "email", "With Google: the Google Workspace account the App Password belongs to (or one of its aliases).")}
      {field("reply_to_email", "Reply-to address", "email", "Where replies go. Can be any inbox, e.g. angelsoasis@proton.me.")}
      {field("physical_address", "Physical mailing address", "text", "Printed in every email footer — required by CAN-SPAM.")}
      {field("site_url", "Website address", "url", "Used to build each email's unsubscribe link.")}
      {isAdmin ? (
        <button type="submit" className="btn-primary !px-4 !py-1.5 text-sm" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      ) : (
        <p className="text-xs text-plum/50">Only admins can change sending settings.</p>
      )}
      {message && <p className={`text-xs ${message.isError ? "text-red-600" : "text-plum"}`}>{message.text}</p>}
    </form>
  );
}

// The GoHighLevel Inbound Webhook URL used by the Leads page's "Save to GHL"
// button. Stored in the ghl_settings table (admins only); api/ghl-sync.ts reads it.
function GhlSettings() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
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
        setIsAdmin(false);
        return;
      }
      if (!auth.user) {
        setLoadError("Sign in to view GHL settings.");
        setIsAdmin(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (profileError) {
        setLoadError(profileError.message);
        setIsAdmin(false);
        return;
      }

      const admin = profile?.role === "admin";
      setIsAdmin(admin);
      if (admin) {
        const { data, error } = await supabase.from("ghl_settings").select("inbound_webhook_url").maybeSingle();
        if (error) setLoadError(error.message);
        else {
          setUrl(data?.inbound_webhook_url ?? "");
          setConfigured(Boolean(data?.inbound_webhook_url));
        }
      } else {
        const { data, error } = await supabase.rpc("ghl_webhook_configured");
        if (error) setLoadError(error.message);
        else setConfigured(Boolean(data));
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
        Couldn't load GHL settings ({loadError}). Run <code>supabase/migrations/0007_ghl_settings.sql</code> in the
        Supabase SQL editor.
      </p>
    );
  }
  if (isAdmin === null || configured === null) return <p className="mt-2 text-sm text-plum/50">Loading…</p>;

  return (
    <div className="mt-3 space-y-3">
      <p className="text-xs">
        Status: {configured ? <span className="font-medium text-plum">Connected</span> : <span className="text-plum/50">not set</span>}
      </p>
      {isAdmin ? (
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
                      The link must use HTTPS. Only admins can change this connection.
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
      ) : (
        <p className="text-xs text-plum/50">Only admins can change the GHL connection.</p>
      )}
      {message && <p className={`text-xs ${message.isError ? "text-red-600" : "text-plum"}`}>{message.text}</p>}
    </div>
  );
}

export default function Settings() {
  const [status, setStatus] = useState<IntegrationStatus | null | undefined>(undefined);

  useEffect(() => {
    getIntegrationStatus().then(setStatus);
  }, []);

  return (
    <div>
      <h1 className="font-serif text-3xl">Settings</h1>
      <p className="mt-1 text-plum/60">API keys, sending, roles, and notifications.</p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="font-serif text-lg">API Keys & Integrations</h2>
          <p className="mt-2 text-sm text-plum/60">
            Keys entered here are stored encrypted in Supabase Vault and only ever shown masked — they never reach the
            browser.
          </p>
          <p className="mt-4 text-sm text-plum/60">
            Campaign sending uses Brevo. Verify your sending domain and sender in Brevo, then add
            <code> BREVO_API_KEY</code> in Supabase Dashboard under Project Settings → Edge Functions → Secrets
            and deploy the <code>campaign-sender</code> function. The From address and mailing address are
            configured in Sending below.
          </p>
          <IntegrationKey
            name="google_places_api_key"
            label={<>Google Places API key <span className="font-normal text-plum/50">(optional)</span></>}
            description="The Hospitals Map works without any key — it searches California's licensed-facility list (CDPH) and OpenStreetMap for free. Saving a Google Places key adds Google as another search provider there."
            status={status}
            onStatus={setStatus}
          />
          <p className="mt-4 text-sm text-plum/60">Campaign Writer does not require an AI provider key.</p>
          <p className="mt-3 text-xs text-plum/40">
            The Supabase URL and publishable key are the only values that belong in <code>.env.local</code> /
            your hosting provider's frontend env vars — see the README.
          </p>
        </div>

        <div className="card">
          <h2 className="font-serif text-lg">Sending</h2>
          <p className="mt-2 text-sm text-plum/60">Used on every campaign email.</p>
          <SendingSettings isAdmin={Boolean(status?.isAdmin)} />
        </div>

        <div className="card">
          <h2 className="font-serif text-lg">GoHighLevel</h2>
          <p className="mt-2 text-sm text-plum/60">
            Where the Leads page's <strong>Save to GHL</strong> button sends leads. Each lead is posted to a GHL
            workflow's Inbound Webhook, which creates or updates the contact.
          </p>
          <GhlSettings />
        </div>

        <div className="card">
          <h2 className="font-serif text-lg">User roles</h2>
          <p className="mt-2 text-sm text-plum/60">
            Roles live on the <code>profiles</code> table (<code>admin</code>, <code>approver</code>,{" "}
            <code>staff</code>, <code>viewer</code>). Only <code>admin</code>/<code>approver</code> should be
            able to approve campaigns — enforce this with a Row Level Security policy on{" "}
            <code>campaigns</code> once your roles are finalized. Users can't change their own role; promote someone
            from the Supabase SQL editor.
          </p>
        </div>

        <div className="card">
          <h2 className="font-serif text-lg">Notifications</h2>
          <p className="mt-2 text-sm text-plum/60">
            Each profile has a <code>notify_on_pending_approval</code> flag. Hook it up to your email
            provider or a Slack webhook from the same Edge Function that creates a new draft.
          </p>
        </div>
      </div>
    </div>
  );
}