import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/auth";
import { functionErrorMessage } from "../../lib/discovery";
import { AUDIENCES, categoryLabel, formatDateTime } from "../../lib/campaigns";
import type { Campaign, CampaignAudience, CampaignDay, ContentDraft, ScheduleWeekday } from "../../lib/types";

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

const DAYS: { value: ScheduleWeekday; label: string }[] = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const GENRE_WEEKDAY: Record<CampaignDay, ScheduleWeekday> = {
  monday: 1,
  wednesday: 3,
  friday: 5,
};

interface CampaignEdit {
  title: string;
  subject: string;
  body: string;
  audience: CampaignAudience;
}

interface ScheduleEdit {
  enabled: boolean;
  weekday: ScheduleWeekday;
  time: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_ZONE = "America/Los_Angeles";

function initialSchedule(campaign: Campaign): ScheduleEdit {
  return {
    enabled: campaign.auto_send_enabled ?? false,
    weekday: campaign.schedule_weekday ?? GENRE_WEEKDAY[campaign.day],
    time: campaign.schedule_time?.slice(0, 5) ?? "09:00",
  };
}

async function eligibleRecipientCount(audience: CampaignAudience): Promise<number> {
  const eligibleLeads: {
    id: string;
    email: string | null;
    unsubscribed: boolean;
    status: string;
    category: string;
  }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, email, unsubscribed, status, category")
      .range(offset, offset + 999);
    if (error) throw new Error(`Couldn't check recipient email addresses: ${error.message}`);
    eligibleLeads.push(...(data ?? []).filter((lead) =>
      !lead.unsubscribed &&
      lead.status !== "do_not_contact" &&
      (audience === "all" || lead.category === audience)
    ));
    if ((data?.length ?? 0) < 1000) break;
  }

  const emails = new Set<string>();
  for (const lead of eligibleLeads) {
    const email = lead.email?.trim().toLowerCase();
    if (email && EMAIL_PATTERN.test(email)) emails.add(email);
  }

  for (let offset = 0; offset < eligibleLeads.length; offset += 500) {
    const leadIds = eligibleLeads.slice(offset, offset + 500).map((lead) => lead.id);
    const { data: contactRows, error: contactError } = await supabase
      .from("contacts")
      .select("lead_id, email")
      .in("lead_id", leadIds);
    if (contactError) throw new Error(`Couldn't check additional contact email addresses: ${contactError.message}`);

    for (const contact of contactRows ?? []) {
      const email = contact.email?.trim().toLowerCase();
      if (email && EMAIL_PATTERN.test(email)) emails.add(email);
    }
  }

  return emails.size;
}

export default function Campaigns() {
  const { session } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ContentDraft>>({});
  const [schedules, setSchedules] = useState<Record<string, ScheduleEdit>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<CampaignEdit>({ title: "", subject: "", body: "", audience: "all" });
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  async function load() {
    setLoading(true);
    const { data: campaignRows, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (campaignError) {
      setMessage({ text: `Couldn't load campaigns: ${campaignError.message}`, isError: true });
      setLoading(false);
      return;
    }

    const rows = (campaignRows as Campaign[]) ?? [];
    setCampaigns(rows);
    setSchedules(Object.fromEntries(rows.map((campaign) => [campaign.id, initialSchedule(campaign)])));

    if (!rows.length) {
      setDrafts({});
      setLoading(false);
      return;
    }

    const { data: draftRows, error: draftError } = await supabase
      .from("content_drafts")
      .select("*")
      .in("campaign_id", rows.map((campaign) => campaign.id))
      .order("created_at", { ascending: true });
    if (draftError) {
      setMessage({ text: `Couldn't load campaign copy: ${draftError.message}`, isError: true });
      setLoading(false);
      return;
    }

    const byCampaign: Record<string, ContentDraft> = {};
    (draftRows as ContentDraft[] | null)?.forEach((draft) => {
      byCampaign[draft.campaign_id] = draft;
    });
    setDrafts(byCampaign);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function setSchedule(campaignId: string, changes: Partial<ScheduleEdit>) {
    setSchedules((current) => ({
      ...current,
      [campaignId]: { ...current[campaignId], ...changes },
    }));
  }

  function startEdit(campaign: Campaign) {
    const draft = drafts[campaign.id];
    setEditing(campaign.id);
    setEdit({
      title: campaign.title,
      subject: draft?.subject ?? "",
      body: draft?.body ?? "",
      audience: campaign.audience ?? "all",
    });
  }

  async function saveEdit(campaign: Campaign) {
    const draft = drafts[campaign.id];
    if (!draft) return;

    setBusy(campaign.id);
    setMessage(null);
    const { error: copyError } = await supabase
      .from("content_drafts")
      .update({ subject: edit.subject.trim() || null, body: edit.body.trim() || null })
      .eq("id", draft.id);
    if (copyError) {
      setMessage({ text: `Couldn't save campaign copy: ${copyError.message}`, isError: true });
      setBusy(null);
      return;
    }

    const { error: campaignError } = await supabase
      .from("campaigns")
      .update({ title: edit.title.trim(), audience: edit.audience })
      .eq("id", campaign.id);
    setBusy(null);
    if (campaignError) {
      setMessage({ text: `Copy was saved, but campaign settings weren't: ${campaignError.message}`, isError: true });
      return;
    }

    setEditing(null);
    setMessage({ text: "Campaign changes saved." });
    await load();
  }

  async function saveSchedule(campaign: Campaign) {
    const schedule = schedules[campaign.id];
    const draft = drafts[campaign.id];
    if (!schedule || busy) return;

    setBusy(campaign.id);
    setMessage(null);
    if (schedule.enabled) {
      if (!draft?.subject?.trim() || !draft.body?.trim()) {
        setMessage({ text: "Add an email subject and body before enabling automatic sending.", isError: true });
        setBusy(null);
        return;
      }
      try {
        const count = await eligibleRecipientCount(campaign.audience ?? "all");
        if (!count) {
          setMessage({ text: "Automatic sending is not enabled: there are no eligible contacts with valid email addresses.", isError: true });
          setBusy(null);
          return;
        }
      } catch (error) {
        setMessage({ text: error instanceof Error ? error.message : "Couldn't check recipient email addresses.", isError: true });
        setBusy(null);
        return;
      }
    }

    const localNow = new Date();
    const localParts = new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(localNow);
    const weekdayNumber = new Map([
      ["Sun", 0], ["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6],
    ]).get(localParts.find((part) => part.type === "weekday")?.value ?? "");
    const hour = Number(localParts.find((part) => part.type === "hour")?.value ?? "0");
    const minute = Number(localParts.find((part) => part.type === "minute")?.value ?? "0");
    const scheduledMinutes = Number(schedule.time.slice(0, 2)) * 60 + Number(schedule.time.slice(3, 5));
    const currentMinutes = hour * 60 + minute;
    const currentLosAngelesDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(localNow);

    const { error } = await supabase
      .from("campaigns")
      .update({
        auto_send_enabled: schedule.enabled,
        schedule_weekday: schedule.weekday,
        schedule_time: schedule.time,
        schedule_timezone: TIME_ZONE,
        is_library_draft: schedule.enabled ? false : campaign.is_library_draft,
        send_status: schedule.enabled && campaign.send_status === "draft" ? "scheduled" : campaign.send_status,
        ...(schedule.enabled &&
        !campaign.auto_send_enabled &&
        weekdayNumber === schedule.weekday &&
        scheduledMinutes <= currentMinutes &&
        !campaign.last_auto_sent_date
          ? { last_auto_sent_date: currentLosAngelesDate }
          : {}),
      })
      .eq("id", campaign.id);
    setBusy(null);
    if (error) {
      setMessage({ text: `Couldn't save the schedule: ${error.message}`, isError: true });
      return;
    }

    setMessage({
      text: schedule.enabled
        ? "Automatic weekly sending is active. It will send only when eligible email addresses exist."
        : "Automatic sending is off.",
    });
    await load();
  }

  async function reject(campaign: Campaign) {
    const reason = prompt("Reason for rejecting (optional):");
    if (reason === null) return;
    setBusy(campaign.id);
    const { error } = await supabase
      .from("campaigns")
      .update({ approval_status: "rejected", rejection_reason: reason, auto_send_enabled: false })
      .eq("id", campaign.id);
    setBusy(null);
    if (error) setMessage({ text: error.message, isError: true });
    else await load();
  }

  async function sendNow(campaign: Campaign) {
    const draft = drafts[campaign.id];
    if (!draft?.subject?.trim() || !draft.body?.trim()) {
      setMessage({ text: "Add an email subject and body before sending.", isError: true });
      return;
    }

    setBusy(campaign.id);
    setMessage(null);
    let recipients: number;
    try {
      recipients = await eligibleRecipientCount(campaign.audience ?? "all");
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Couldn't check recipient email addresses.", isError: true });
      setBusy(null);
      return;
    }
    if (!recipients) {
      setMessage({ text: "Nothing was sent. No eligible contacts have a valid email address.", isError: true });
      setBusy(null);
      return;
    }

    const confirmed = confirm(
      `Send "${campaign.title}" now to up to ${recipients} unique eligible email address${recipients === 1 ? "" : "es"}? This can't be undone.`
    );
    if (!confirmed) {
      setBusy(null);
      return;
    }

    const { error: activateError } = await supabase
      .from("campaigns")
      .update({ is_library_draft: false })
      .eq("id", campaign.id);
    if (activateError) {
      setMessage({ text: `Couldn't move this draft into Campaigns: ${activateError.message}`, isError: true });
      setBusy(null);
      return;
    }

    const { data, error } = await supabase.functions.invoke("campaign-sender", {
      body: { action: "send_now", campaignId: campaign.id },
    });
    setBusy(null);
    if (error) {
      setMessage({ text: await functionErrorMessage(error), isError: true });
    } else {
      if (campaign.auto_send_enabled && (data.sent ?? 0) > 0) {
        const sentDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: TIME_ZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const { error: dateError } = await supabase
          .from("campaigns")
          .update({ last_auto_sent_date: sentDate })
          .eq("id", campaign.id);
        if (dateError) {
          setMessage({ text: `Sent successfully, but couldn't record today's schedule: ${dateError.message}`, isError: true });
          await load();
          return;
        }
      }
      setMessage({
        text: `Send completed: ${data.sent ?? 0} recipient${data.sent === 1 ? "" : "s"} sent.${data.failed ? ` ${data.failed} failed: ${data.error}` : ""}`,
        isError: data.failed > 0 && data.sent === 0,
      });
    }
    await load();
  }

  async function sendTest(campaign: Campaign) {
    const to = prompt("Send a test copy to:", session?.user.email ?? "");
    if (!to?.trim()) return;
    if (!EMAIL_PATTERN.test(to.trim())) {
      setMessage({ text: "Enter a valid email address for the test.", isError: true });
      return;
    }
    setBusy(campaign.id);
    setMessage(null);
    const { error } = await supabase.functions.invoke("campaign-sender", {
      body: { action: "send_test", campaignId: campaign.id, to: to.trim() },
    });
    setBusy(null);
    setMessage(error
      ? { text: await functionErrorMessage(error), isError: true }
      : { text: `Test sent to ${to.trim()}.` });
  }

  const ready = campaigns.filter((campaign) =>
    !campaign.is_library_draft &&
    (campaign.auto_send_enabled ||
      (campaign.send_status !== "sent" && campaign.send_status !== "sending")) &&
    campaign.approval_status !== "rejected"
  );
  const library = campaigns.filter((campaign) => campaign.is_library_draft);
  const history = campaigns.filter((campaign) =>
    !campaign.is_library_draft && !ready.includes(campaign)
  );

  function scheduleControls(campaign: Campaign) {
    const schedule = schedules[campaign.id];
    if (!schedule) return null;
    const isBusy = busy === campaign.id;
    return (
      <div className="mt-4 rounded-xl border border-plum/10 p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={schedule.enabled}
            disabled={isBusy || campaign.approval_status === "rejected"}
            onChange={(event) => setSchedule(campaign.id, { enabled: event.target.checked })}
          />
          Automatically send this campaign every week
        </label>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Send day
            <select
              className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2"
              value={schedule.weekday}
              disabled={isBusy}
              onChange={(event) => setSchedule(campaign.id, { weekday: Number(event.target.value) as ScheduleWeekday })}
            >
              {DAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            Send time (California)
            <input
              type="time"
              className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2"
              value={schedule.time}
              disabled={isBusy}
              onChange={(event) => setSchedule(campaign.id, { time: event.target.value })}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-plum/50">
          Time zone: America/Los_Angeles (PST/PDT; adjusts for daylight saving time).
        </p>
        <button
          type="button"
          className="mt-3 rounded-full border border-plum/30 px-3 py-1.5 text-xs font-semibold text-plum hover:bg-plum/5 disabled:opacity-50"
          disabled={isBusy}
          onClick={() => saveSchedule(campaign)}
        >
          {isBusy ? "Saving…" : "Save schedule"}
        </button>
      </div>
    );
  }

  function card(campaign: Campaign, isLibrary = false) {
    const draft = drafts[campaign.id];
    const isBusy = busy === campaign.id;
    return (
      <div key={campaign.id} className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`badge ${STATUS_COLOR[campaign.approval_status]}`}>{STATUS_LABEL[campaign.approval_status]}</span>
              {campaign.category && <span className="badge bg-plum/10 text-plum">{categoryLabel(campaign.category)}</span>}
              {campaign.send_status === "failed" && <span className="badge bg-red-100 text-red-700">Send failed</span>}
            </div>
            <h3 className="mt-2 font-serif text-lg">{campaign.title}</h3>
            <p className="text-xs text-plum/60">
              {campaign.auto_send_enabled
                ? `${DAYS.find((day) => day.value === campaign.schedule_weekday)?.label ?? "Weekly"} at ${campaign.schedule_time?.slice(0, 5) ?? "09:00"} California time`
                : campaign.scheduled_for
                  ? `Scheduled for ${formatDateTime(campaign.scheduled_for)}`
                  : "Manual send — use Send now when ready"}
              {" · "}
              {AUDIENCES.find((audience) => audience.value === campaign.audience)?.label ?? "All leads"}
            </p>
            {campaign.auto_send_enabled && (
              <p className="mt-1 text-xs font-medium text-emerald-700">Automatic weekly sending is active</p>
            )}
            {campaign.send_error && <p className="mt-1 text-xs text-red-600">{campaign.send_error}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => sendNow(campaign)}
              disabled={isBusy || !draft}
              className="rounded-full border border-plum px-3 py-1.5 text-xs font-semibold text-plum hover:bg-plum/5 disabled:opacity-50"
            >
              {isBusy ? "Working…" : "Send now"}
            </button>
            <button
              type="button"
              onClick={() => sendTest(campaign)}
              disabled={isBusy || !draft}
              className="rounded-full border border-plum/20 px-3 py-1.5 text-xs text-plum hover:bg-plum/5 disabled:opacity-50"
            >
              Send test
            </button>
            <button
              type="button"
              onClick={() => startEdit(campaign)}
              disabled={!draft || isBusy}
              className="rounded-full border border-plum/20 px-3 py-1.5 text-xs text-plum hover:bg-plum/5 disabled:opacity-50"
            >
              Edit campaign
            </button>
            {!isLibrary && campaign.approval_status !== "rejected" && (
              <button
                type="button"
                onClick={() => reject(campaign)}
                disabled={isBusy}
                className="rounded-full border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Cancel campaign
              </button>
            )}
          </div>
        </div>

        {editing === campaign.id ? (
          <form
            className="mt-4 space-y-3 rounded-xl bg-plum/5 p-4 text-sm"
            onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void saveEdit(campaign); }}
          >
            <label className="block font-medium">
              Campaign title
              <input
                required
                maxLength={160}
                className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 font-normal"
                value={edit.title}
                onChange={(event) => setEdit({ ...edit, title: event.target.value })}
              />
            </label>
            <label className="block font-medium">
              Recipient group
              <select
                className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 font-normal"
                value={edit.audience}
                onChange={(event) => setEdit({ ...edit, audience: event.target.value as CampaignAudience })}
              >
                {AUDIENCES.map((audience) => <option key={audience.value} value={audience.value}>{audience.label}</option>)}
              </select>
            </label>
            <label className="block font-medium">
              Email subject
              <input
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 font-normal"
                value={edit.subject}
                onChange={(event) => setEdit({ ...edit, subject: event.target.value })}
              />
            </label>
            <label className="block font-medium">
              Email body
              <textarea
                rows={10}
                className="mt-1 w-full rounded-lg border border-plum/20 px-3 py-2 font-normal"
                value={edit.body}
                onChange={(event) => setEdit({ ...edit, body: event.target.value })}
              />
            </label>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary !px-4 !py-1.5 text-xs" disabled={isBusy}>Save changes</button>
              <button type="button" className="text-xs text-plum/60 hover:underline" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        ) : draft ? (
          <div className="mt-4 rounded-xl bg-plum/5 p-4 text-sm">
            <p className="font-semibold">{draft.subject || "No subject yet"}</p>
            <p className="mt-2 whitespace-pre-wrap text-plum/80">{draft.body || "No email body yet."}</p>
            <p className="mt-3 text-xs text-plum/50">
              Recipient check excludes unsubscribed and do-not-contact leads, and requires a valid email.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-xs text-plum/40">No email copy saved for this campaign.</p>
        )}

        {scheduleControls(campaign)}
        {isLibrary && (
          <p className="mt-3 text-xs text-plum/50">
            Draft only until sent manually or automatic sending is enabled.
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-3xl">Campaigns</h1>
      <p className="mt-1 text-plum/60">
        Edit saved drafts, select recipients, schedule weekly sends in California time, or send manually.
      </p>

      {message && <p role={message.isError ? "alert" : "status"} className={`mt-4 text-sm ${message.isError ? "text-red-600" : "text-plum"}`}>{message.text}</p>}

      <h2 className="mt-8 font-serif text-xl">Draft library</h2>
      <p className="mt-1 text-sm text-plum/60">
        Drafts from the <Link to="/app/campaign-writer" className="underline">Campaign Writer</Link> can be edited and activated here.
      </p>
      {loading && <p className="mt-3 text-sm text-plum/50">Loading…</p>}
      {!loading && library.length === 0 && <p className="mt-3 text-sm text-plum/50">No saved library drafts.</p>}
      <div className="mt-3 space-y-4">{library.map((campaign) => card(campaign, true))}</div>

      <h2 className="mt-10 font-serif text-xl">Ready to send</h2>
      {!loading && ready.length === 0 && (
        <p className="mt-3 text-sm text-plum/50">No active campaigns waiting to go out.</p>
      )}
      <div className="mt-3 space-y-4">{ready.map((campaign) => card(campaign))}</div>

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
            {history.map((campaign) => (
              <tr key={campaign.id}>
                <td className="px-4 py-3">{campaign.title}</td>
                <td className="px-4 py-3">{categoryLabel(campaign.category)}</td>
                <td className="px-4 py-3">{campaign.sent_at ? formatDateTime(campaign.sent_at) : "—"}</td>
                <td className="px-4 py-3">{campaign.recipient_count ?? "—"}</td>
                <td className="px-4 py-3">
                  {campaign.approval_status === "rejected" ? (
                    <span className={`badge ${STATUS_COLOR.rejected}`}>Rejected</span>
                  ) : (
                    <span className="badge bg-ink text-white">{SEND_LABEL[campaign.send_status]}</span>
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
