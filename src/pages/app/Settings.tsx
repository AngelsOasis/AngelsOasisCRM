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