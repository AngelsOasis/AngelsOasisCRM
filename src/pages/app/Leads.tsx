import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Download, Search, Upload } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { leadLocationFields } from "../../lib/geo";
import { LEAD_CATEGORIES, LEAD_STATUSES, type Facility, type Lead, type LeadCategory, type LeadStatus } from "../../lib/types";

type SortOrder = "newest" | "oldest" | "az" | "za";

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "az", label: "Facility A–Z" },
  { value: "za", label: "Facility Z–A" },
];

const emptyForm = {
  facility_name: "",
  address: "",
  county: "",
  contact_person: "",
  contact_title: "",
  department: "",
  email: "",
  phone: "",
  category: "hospital" as LeadCategory,
  status: "new" as LeadStatus,
  notes: "",
};

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("facilities").select("*").then(({ data }) => setFacilities((data as Facility[]) ?? []));
  }, []);

  // Search and sort run in the browser on the loaded leads; CSV Export and
  // Save to GHL use this same list, so they act on exactly what's shown.
  const visibleLeads = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = terms.length
      ? leads.filter((lead) => {
          const text = [
            lead.facility_name, lead.contact_person, lead.email, lead.phone, lead.address,
            lead.county, lead.department, lead.notes, lead.category.replaceAll("_", " "),
          ].join(" ").toLowerCase();
          return terms.every((term) => text.includes(term));
        })
      : leads;
    return [...matches].sort((a, b) => {
      if (sortOrder === "az" || sortOrder === "za") {
        const byName = a.facility_name.localeCompare(b.facility_name, undefined, { sensitivity: "base", numeric: true });
        return sortOrder === "az" ? byName : -byName;
      }
      const byDate = a.created_at.localeCompare(b.created_at);
      return sortOrder === "oldest" ? byDate : -byDate;
    });
  }, [leads, search, sortOrder]);

  async function loadLeads() {
    setLoading(true);
    let query = supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    const { data, error } = await query;
    if (error) setError(error.message);
    else setLeads(data as Lead[]);
    setLoading(false);
  }

  useEffect(() => {
    loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    // Place the lead on the Hospitals Map; a failed lookup just saves it without coordinates.
    const location = await leadLocationFields(form.address, form.county, facilities).catch(() => null);
    // Leave contact_title out when blank so adding a lead works even before migration 0003 has run.
    const { contact_title, ...rest } = form;
    const { error } = await supabase
      .from("leads")
      .insert({ ...rest, ...(contact_title.trim() ? { contact_title } : {}), ...location, source: "manual" });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm(emptyForm);
    setShowForm(false);
    loadLeads();
  }

  async function updateStatus(id: string, status: LeadStatus) {
    await supabase.from("leads").update({ status }).eq("id", id);
    loadLeads();
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    await supabase.from("leads").delete().eq("id", id);
    loadLeads();
  }

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

  function exportLeadsCSV() {
    const headers = [
      "Facility",
      "Address",
      "County",
      "Category",
      "Contact Person",
      "Department",
      "Email",
      "Phone",
      "Status",
      "Source",
      "Notes",
      "Last Contacted",
      "Created At",
    ];
    const rows = visibleLeads.map((lead) => [
      lead.facility_name,
      lead.address,
      lead.county,
      LEAD_CATEGORIES.find((category) => category.value === lead.category)?.label ?? lead.category,
      lead.contact_person,
      lead.department,
      lead.email,
      lead.phone,
      LEAD_STATUSES.find((status) => status.value === lead.status)?.label ?? lead.status,
      lead.source.replaceAll("_", " "),
      lead.notes,
      lead.last_contacted_at,
      lead.created_at,
    ]);
    const escapeCell = (value: string | null) => `"${(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCell).join(","))
      .join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `angels-oasis-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Leads</h1>
          <p className="mt-1 text-plum/60">Hospitals, SNFs, case managers, and other referral partners.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportLeadsCSV}
            disabled={loading || visibleLeads.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-plum/20 px-4 py-2 text-sm font-medium text-plum transition-colors hover:bg-plum/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            CSV Export
          </button>
          <button
            type="button"
            onClick={saveLeadsToGhl}
            disabled={loading || syncing || visibleLeads.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-plum/20 px-4 py-2 text-sm font-medium text-plum transition-colors hover:bg-plum/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {syncing ? "Saving…" : "Save to GHL"}
          </button>
          <button className="btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add Lead"}
          </button>
        </div>
      </div>

      {syncMessage && <p className="mt-3 text-right text-sm text-plum/70">{syncMessage}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="card mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input required placeholder="Hospital / facility name" className="rounded-lg border border-plum/20 px-3 py-2"
            value={form.facility_name} onChange={(e) => setForm({ ...form, facility_name: e.target.value })} />
          <input placeholder="Address" className="rounded-lg border border-plum/20 px-3 py-2"
            value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input placeholder="County" className="rounded-lg border border-plum/20 px-3 py-2"
            value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} />
          <select className="rounded-lg border border-plum/20 px-3 py-2"
            value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as LeadCategory })}>
            {LEAD_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <input placeholder="Contact person" className="rounded-lg border border-plum/20 px-3 py-2"
            value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} />
          <input placeholder="Contact title (e.g. Discharge Planner)" className="rounded-lg border border-plum/20 px-3 py-2"
            value={form.contact_title} onChange={(e) => setForm({ ...form, contact_title: e.target.value })} />
          <input placeholder="Department" className="rounded-lg border border-plum/20 px-3 py-2"
            value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
          <input placeholder="Email" type="email" className="rounded-lg border border-plum/20 px-3 py-2"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Phone" className="rounded-lg border border-plum/20 px-3 py-2"
            value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <textarea placeholder="Notes" className="sm:col-span-2 rounded-lg border border-plum/20 px-3 py-2"
            value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {error && <p className="sm:col-span-2 text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={saving} className="btn-primary sm:col-span-2">
            {saving ? "Saving…" : "Save lead"}
          </button>
        </form>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search leads</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-plum/40" />
          <input
            type="search"
            placeholder="Search facility, contact, email, phone…"
            className="w-full rounded-lg border border-plum/20 py-1 pl-8 pr-2 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm text-plum/60">Filter:</span>
          <select className="rounded-lg border border-plum/20 px-2 py-1 text-sm"
            value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as LeadStatus | "all")}>
            <option value="all">All statuses</option>
            {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm text-plum/60">Sort:</span>
          <select className="rounded-lg border border-plum/20 px-2 py-1 text-sm"
            value={sortOrder} onChange={(e) => setSortOrder(e.target.value as SortOrder)}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {!loading && search.trim() && (
          <span className="text-xs text-plum/50">
            {visibleLeads.length} of {leads.length} lead{leads.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-plum/10 bg-white">
        <table className="min-w-full divide-y divide-plum/10 text-sm">
          <thead className="bg-plum/5 text-left text-xs uppercase tracking-wide text-plum/60">
            <tr>
              <th className="px-4 py-3">Facility</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-plum/5">
            {loading && <tr><td className="px-4 py-6 text-plum/50" colSpan={7}>Loading…</td></tr>}
            {!loading && leads.length === 0 && (
              <tr><td className="px-4 py-6 text-plum/50" colSpan={7}>No leads yet — add one, import a CSV, or discover some on the Hospitals Map.</td></tr>
            )}
            {!loading && leads.length > 0 && visibleLeads.length === 0 && (
              <tr><td className="px-4 py-6 text-plum/50" colSpan={7}>No leads match "{search.trim()}".</td></tr>
            )}
            {visibleLeads.map((lead) => (
              <tr key={lead.id}>
                <td className="px-4 py-3 font-medium">{lead.facility_name}</td>
                <td className="px-4 py-3 capitalize">{lead.category.replaceAll("_", " ")}</td>
                <td className="px-4 py-3">
                  {lead.contact_person || "—"}
                  {lead.email && <span className="block text-xs text-plum/50">{lead.email}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3">{lead.phone || "—"}</td>
                <td className="px-4 py-3">
                  <select className="rounded border border-plum/20 px-2 py-1 text-xs"
                    value={lead.status} onChange={(e) => updateStatus(lead.id, e.target.value as LeadStatus)}>
                    {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-plum/50 capitalize">{lead.source.replaceAll("_", " ")}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => deleteLead(lead.id)} className="text-xs text-red-500 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}