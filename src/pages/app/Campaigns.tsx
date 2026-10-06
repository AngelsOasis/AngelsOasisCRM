import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth";
import { functionErrorMessage } from "../../lib/discovery";
import { AUDIENCES, categoryLabel, formatDateTime } from "../../lib/campaigns";
import type { Campaign, ContentDraft } from "../../lib/types";

const STATUS_LABEL: Record<Campaign["approval_status"], string> = {
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  needs_edit: "Needs Edit",
};

const STATUS_COLOR: Record<Campaign["approval_status"], string> = {
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-ink text-white",
  rejected: "bg-red-100 text-red-700",
  needs_edit: "bg-plum/10 text-plum",
};

const SEND_LABEL: Record<Campaign["send_status"], string> = {
  draft: "Not scheduled",
  scheduled: "Scheduled",
  sending: "Sending…",
  sent: "Sent",
  failed: "Failed",
};

interface DraftEdit {
  subject: string;
  body: string;
  cta: string;
}

export default function Campaigns() {
  const { session } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ContentDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<DraftEdit>({ subject: "", body: "", cta: "" });
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  async function load() {
    const { data: campaignRows } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (campaignRows as Campaign[]) ?? [];
    setCampaigns(rows);

    if (rows.length) {
      const { data: draftRows } = await supabase
        .from("content_drafts")
        .select("*")
        .in("campaign_id", rows.map((c) => c.id))
        .order("created_at", { ascending: true });
      const byCampaign: Record<string, ContentDraft> = {};
      // Ascending order, so the newest draft per campaign wins.
      (draftRows as ContentDraft[] | null)?.forEach((d) => (byCampaign[d.campaign_id] = d));
      setDrafts(byCampaign);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function update(id: string, fields: Partial<Campaign>) {
    setMessage(null);
    const { error } = await supabase.from("campaigns").update(fields).eq("id", id);
    if (error) setMessage({ text: error.message, isError: true });
    load();
  }

  function reject(c: Campaign) {
    const reason = prompt("Reason for rejecting (optional):");
    if (reason === null) return;
    update(c.id, { approval_status: "rejected", rejection_reason: reason });
  }

  async function sendNow(c: Campaign) {
    const audience = AUDIENCES.find((a) => a.value === c.audience)?.label.toLowerCase() ?? "all leads";
    if (!confirm(`Send "${c.title}" now to ${audience} with an email address? This can't be undone.`)) return;
    setBusy(c.id);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke("campaign-sender", {
      body: { action: "send_now", campaignId: c.id },
    });
    setBusy(null);
    if (error) setMessage({ text: await functionErrorMessage(error), isError: true });
    else
      setMessage({
        text: `Sent to ${data.sent} recipient${data.sent === 1 ? "" : "s"}.${data.failed ? ` ${data.failed} failed: ${data.error}` : ""}`,
        isError: data.failed > 0 && data.sent === 0,
      });
    load();
  }

  async function sendTest(c: Campaign) {
    const to = prompt("Send a test copy to:", session?.user.email ?? "");
    if (!to?.trim()) return;
    setBusy(c.id);
    setMessage(null);
    const { error } = await supabase.functions.invoke("campaign-sender", {
      body: { action: "send_test", campaignId: c.id, to: to.trim() },
    });
    setBusy(null);
    setMessage(error ? { text: await functionErrorMessage(error), isError: true } : { text: `Test sent to ${to.trim()}.` });
  }

  function startEdit(c: Campaign) {
    const d = drafts[c.id];
    setEditing(c.id);
    setEdit({ subject: d?.subject ?? "", body: d?.body ?? "", cta: d?.cta ?? "" });
  }

  async function saveEdit(c: Campaign) {
    const d = drafts[c.id];
    if (!d) return;
    setBusy(c.id);
    const { error } = await supabase.from("content_drafts").update(edit).eq("id", d.id);
    setBusy(null);
    if (error) {
      setMessage({ text: error.message, isError: true });
      return;
    }
    setEditing(null);
    load();
  }

  const unsent = (c: Campaign) => c.send_status !== "sent" && c.send_status !== "sending" && c.approval_status !== "rejected";
  const ready = campaigns.filter(unsent);
  const history = campaigns.filter((c) => !unsent(c));

  function card(c: Campaign) {
    const draft = drafts[c.id];
    const isBusy = busy === c.id;
    return (
      <div key={c.id} className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${STATUS_COLOR[c.approval_status]}`}>{STATUS_LABEL[c.approval_status]}</span>
              <span className="badge bg-plum/10 text-plum">{categoryLabel(c.category)}</span>
              {c.send_status === "failed" && <span className="badge bg-red-100 text-red-700">Send failed</span>}
            </div>
            <h3 className="mt-2 font-serif text-lg">{c.title}</h3>
            <p className="text-xs text-plum/60">
              {c.scheduled_for
                ? `Scheduled for ${formatDateTime(c.scheduled_for)}`
                : "Manual send — use Send now when ready"}
              {" · "}
              {AUDIENCES.find((a) => a.value === c.audience)?.label}
            </p>
            {c.send_error && <p className="mt-1 text-xs text-red-600">{c.send_error}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => sendNow(c)} disabled={isBusy || !draft}
              className="rounded-full border border-plum px-3 py-1.5 text-xs font-semibold text-plum hover:bg-plum/5 disabled:opacity-50">
              {isBusy ? "Working…" : "Send now"}
            </button>
            <button onClick={() => sendTest(c)} disabled={isBusy || !draft}
              className="rounded-full border border-plum/20 px-3 py-1.5 text-xs text-plum hover:bg-plum/5 disabled:opacity-50">
              Send test
            </button>
            <button onClick={() => startEdit(c)} disabled={!draft}
              className="rounded-full border border-plum/20 px-3 py-1.5 text-xs text-plum hover:bg-plum/5 disabled:opacity-50">
              Edit
            </button>
            <button onClick={() => reject(c)}
              className="rounded-full border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
              Reject
            </button>
          </div>
        </div>

        {editing === c.id ? (
          <div className="mt-4 space-y-3 rounded-xl bg-plum/5 p-4 text-sm">
            <input className="w-full rounded-lg border border-plum/20 px-3 py-2 font-semibold" placeholder="Subject"
              value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} />
            <textarea rows={10} className="w-full rounded-lg border border-plum/20 px-3 py-2" placeholder="Body"
              value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} />
            <input className="w-full rounded-lg border border-plum/20 px-3 py-2" placeholder="Call to action"
              value={edit.cta} onChange={(e) => setEdit({ ...edit, cta: e.target.value })} />
            <div className="flex gap-3">
              <button className="btn-primary !px-4 !py-1.5 text-xs" disabled={isBusy} onClick={() => saveEdit(c)}>Save changes</button>
              <button className="text-xs text-plum/60 hover:underline" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        ) : draft ? (
          <div className="mt-4 rounded-xl bg-plum/5 p-4 text-sm">
            <p className="font-semibold">{draft.subject}</p>
            <p className="mt-2 whitespace-pre-wrap text-plum/80">{draft.body}</p>
            {draft.cta && <p className="mt-2 font-medium text-plum">{draft.cta}</p>}
            <p className="mt-3 text-xs text-plum/40">
              Every email automatically includes your address and an unsubscribe link at the bottom.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-plum/40">No draft yet.</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl">Campaigns</h1>
      <p className="mt-1 text-plum/60">
        Drafts from the <Link to="/app/campaign-writer" className="underline">Campaign Writer</Link> land here.
        Campaigns are approved automatically and send at their scheduled time.
      </p>

      {message && <p className={`mt-4 text-sm ${message.isError ? "text-red-600" : "text-plum"}`}>{message.text}</p>}

      <h2 className="mt-8 font-serif text-xl">Ready to send</h2>
      {loading && <p className="mt-3 text-sm text-plum/50">Loading…</p>}
      {!loading && ready.length === 0 && (
        <p className="mt-3 text-sm text-plum/50">No campaigns waiting to go out.</p>
      )}
      <div className="mt-3 space-y-4">{ready.map(card)}</div>

      <h2 className="mt-10 font-serif text-xl">History</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-plum/10 bg-white">
        <table className="min-w-full divide-y divide-plum/10 text-sm">
          <thead className="bg-plum/5 text-left text-xs uppercase tracking-wide text-plum/60">
            <tr>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Sent</th>
              <th className="px-4 py-3">Recipients</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-plum/5">
            {!loading && history.length === 0 && (
              <tr><td className="px-4 py-6 text-plum/50" colSpan={5}>Nothing sent yet.</td></tr>
            )}
            {history.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">{c.title}</td>
                <td className="px-4 py-3">{categoryLabel(c.category)}</td>
                <td className="px-4 py-3">{c.sent_at ? formatDateTime(c.sent_at) : "—"}</td>
                <td className="px-4 py-3">{c.recipient_count ?? "—"}</td>
                <td className="px-4 py-3">
                  {c.approval_status === "rejected" ? (
                    <span className={`badge ${STATUS_COLOR.rejected}`}>Rejected</span>
                  ) : (
                    <span className="badge bg-ink text-white">{SEND_LABEL[c.send_status]}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}