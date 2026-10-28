import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Search, Send, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { LEAD_CATEGORIES, LEAD_STATUSES, type Lead, type LeadCategory, type LeadStatus } from "../lib/types";

type ContactFilter = "any" | "email" | "phone";

interface Props {
  leads: Lead[];
  onClose: () => void;
}

// Pick leads, write a message, and post them to the GHL Inbound Webhook
// (same endpoint as "Save to GHL") with action "send_message", so the GHL
// workflow can send the email to each checked lead.
export default function SendMessageModal({ leads, onClose }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<LeadCategory | "all">("all");
  const [contactFilter, setContactFilter] = useState<ContactFilter>("email");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  const filtered = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return leads
      .filter((lead) => !lead.unsubscribed && lead.status !== "do_not_contact")
      .filter((lead) => statusFilter === "all" || lead.status === statusFilter)
      .filter((lead) => categoryFilter === "all" || lead.category === categoryFilter)
      .filter((lead) => contactFilter === "any" || (contactFilter === "email" ? !!lead.email?.trim() : !!lead.phone?.trim()))
      .filter((lead) => {
        const text = [lead.facility_name, lead.contact_person, lead.email, lead.phone, lead.county]
          .join(" ").toLowerCase();
        return terms.every((term) => text.includes(term));
      })
      .sort((a, b) => a.facility_name.localeCompare(b.facility_name, undefined, { sensitivity: "base", numeric: true }));
  }, [leads, search, statusFilter, categoryFilter, contactFilter]);

  const selectedLeads = leads.filter((lead) => selected.has(lead.id));
  const allShownChecked = filtered.length > 0 && filtered.every((lead) => selected.has(lead.id));
  const someShownChecked = filtered.some((lead) => selected.has(lead.id));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((current) => {
      const next = new Set(current);
      filtered.forEach((lead) => (allShownChecked ? next.delete(lead.id) : next.add(lead.id)));
      return next;
    });
  }

  const categoryLabel = (value: LeadCategory) => LEAD_CATEGORIES.find((c) => c.value === value)?.label ?? value;
  const statusLabel = (value: LeadStatus) => LEAD_STATUSES.find((s) => s.value === value)?.label ?? value;

  async function send() {
    if (selectedLeads.length === 0) return;
    if (!confirm(`Send ${selectedLeads.length} lead${selectedLeads.length === 1 ? "" : "s"} to GHL?`)) return;
    setSending(true);
    setResult(null);
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch("/api/ghl-send-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ leads: selectedLeads }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        sent?: number;
        failed?: Array<{ facility_name: string }>;
        error?: string;
      };
      if (json.error) setResult({ text: json.error, isError: true });
      else if (json.failed?.length)
        setResult({
          text: `Sent ${json.sent}; ${json.failed.length} failed: ${json.failed.map((f) => f.facility_name).join(", ")}`,
          isError: true,
        });
      else {
        setResult({ text: `Sent ${json.sent} message${json.sent === 1 ? "" : "s"} to the GHL webhook.`, isError: false });
        setSelected(new Set());
      }
    } catch {
      setResult({ text: "Couldn't reach the server to send the message.", isError: true });
    }
    setSending(false);
  }

  const selectClass = "rounded-lg border border-plum/20 px-2 py-1 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !sending && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="send-message-title"
        className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-plum/10 px-6 py-4">
          <div>
            <h2 id="send-message-title" className="flex items-center gap-2 font-sans text-lg font-semibold text-ink">
              <MessageSquare className="h-5 w-5 text-forest" /> Send message
            </h2>
            <p className="text-xs text-plum/60">Check the leads to contact. The message is sent through your GHL webhook.</p>
          </div>
          <button onClick={onClose} disabled={sending} aria-label="Close"
            className="rounded-lg border border-plum/20 p-1.5 text-ink transition hover:bg-plum/5 focus:outline-none focus:ring-2 focus:ring-plum disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-plum/10 px-6 py-3">
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Search leads</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-plum/40" />
            <input type="search" placeholder="Search facility, contact, email…"
              className="w-full rounded-lg border border-plum/20 py-1 pl-8 pr-2 text-sm"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-plum/60">Status:</span>
            <select className={selectClass} value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}>
              <option value="all">All statuses</option>
              {LEAD_STATUSES.filter((s) => s.value !== "do_not_contact").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-plum/60">Category:</span>
            <select className={selectClass} value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as LeadCategory | "all")}>
              <option value="all">All categories</option>
              {LEAD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-plum/60">Has:</span>
            <select className={selectClass} value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value as ContactFilter)}>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
              <option value="any">Any</option>
            </select>
          </label>
          <span className="ml-auto text-xs text-plum/60">
            {filtered.length} shown · <strong className="text-ink">{selected.size} selected</strong>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="min-w-full divide-y divide-plum/10 text-sm">
            <thead className="sticky top-0 bg-[#f7f3f5] text-left text-xs uppercase tracking-wide text-plum/60">
              <tr>
                <th className="px-4 py-3">Facility</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">
                  <input type="checkbox" aria-label="Select all shown leads"
                    className="h-4 w-4 accent-forest"
                    checked={allShownChecked}
                    ref={(el) => { if (el) el.indeterminate = someShownChecked && !allShownChecked; }}
                    onChange={toggleAllShown} disabled={filtered.length === 0} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-plum/5">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-plum/50">No leads match these filters.</td></tr>
              )}
              {filtered.map((lead) => (
                <tr key={lead.id} onClick={() => toggle(lead.id)}
                  className={`cursor-pointer ${selected.has(lead.id) ? "bg-forest/5" : "hover:bg-plum/5"}`}>
                  <td className="px-4 py-2.5 font-medium">{lead.facility_name}</td>
                  <td className="px-4 py-2.5">{categoryLabel(lead.category)}</td>
                  <td className="px-4 py-2.5">
                    {lead.contact_person || "—"}
                    {lead.email && <span className="block text-xs text-plum/50">{lead.email}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">{lead.phone || "—"}</td>
                  <td className="px-4 py-2.5 text-xs">{statusLabel(lead.status)}</td>
                  <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" aria-label={`Select ${lead.facility_name}`}
                      className="h-4 w-4 accent-forest"
                      checked={selected.has(lead.id)} onChange={() => toggle(lead.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-plum/10 bg-cream/40 px-6 py-4">
          {result && (
            <p role={result.isError ? "alert" : "status"}
              className={`mr-auto text-sm ${result.isError ? "text-red-600" : "text-forest"}`}>{result.text}</p>
          )}
          <button type="button" onClick={send}
            disabled={sending || selectedLeads.length === 0}
            className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
            <Send className="h-4 w-4" />
            {sending ? "Sending…" : `Send to ${selectedLeads.length} lead${selectedLeads.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
