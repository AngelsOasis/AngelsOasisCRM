import { Fragment, useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import type { Lead } from "../../lib/types";

// Every row belongs to a lead (FK leads.id). A lead's primary contact lives on
// the lead itself (contact_person / contact_title / email / phone); extra
// people at the same facility are rows in `contacts` with lead_id -> leads.id.
type LeadContactFields = Pick<Lead, "id" | "facility_name" | "contact_person" | "contact_title" | "contact_linkedin_url" | "email" | "phone">;

interface ExtraContact {
  id: string;
  lead_id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
}

interface Row {
  key: string;
  kind: "lead" | "contact";
  id: string; // leads.id for primary rows, contacts.id for extra rows
  leadId: string;
  facility: string;
  person: string;
  title: string;
  email: string;
  phone: string;
  linkedinUrl: string | null;
}

type Draft = Pick<Row, "person" | "title" | "email" | "phone">;

const NEW_CONTACT_PREFIX = "new:";

function contactLinkedInUrl(person: string, facility: string, savedUrl?: string | null) {
  if (!person.trim()) return null;
  if (savedUrl) {
    try {
      const url = new URL(savedUrl);
      if (
        url.protocol === "https:" &&
        (url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com"))
      ) return url.toString();
    } catch {
      // Use a LinkedIn people search when the saved value is not a valid URL.
    }
  }
  const name = person.replace(/\s*\(.*\)\s*$/, "").trim();
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${name} ${facility}`)}`;
}

export default function Contacts() {
  const [leads, setLeads] = useState<LeadContactFields[]>([]);
  const [extras, setExtras] = useState<ExtraContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ person: "", title: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    const [leadRes, contactRes] = await Promise.all([
      supabase.from("leads").select("*").order("facility_name"),
      supabase.from("contacts").select("id, lead_id, name, title, email, phone").order("created_at"),
    ]);
    if (leadRes.error) setError(leadRes.error.message);
    setLeads((leadRes.data as LeadContactFields[]) ?? []);
    setExtras((contactRes.data as ExtraContact[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const byLead = new Map<string, ExtraContact[]>();
    for (const c of extras) byLead.set(c.lead_id, [...(byLead.get(c.lead_id) ?? []), c]);

    const all: Row[] = [];
    for (const lead of leads) {
      all.push({
        key: `lead:${lead.id}`,
        kind: "lead",
        id: lead.id,
        leadId: lead.id,
        facility: lead.facility_name,
        person: lead.contact_person ?? "",
        title: lead.contact_title ?? "",
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        linkedinUrl: contactLinkedInUrl(lead.contact_person ?? "", lead.facility_name, lead.contact_linkedin_url),
      });
      for (const c of byLead.get(lead.id) ?? []) {
        all.push({
          key: `contact:${c.id}`,
          kind: "contact",
          id: c.id,
          leadId: lead.id,
          facility: lead.facility_name,
          person: c.name,
          title: c.title ?? "",
          email: c.email ?? "",
          phone: c.phone ?? "",
          linkedinUrl: contactLinkedInUrl(c.name, lead.facility_name),
        });
      }
    }

    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => [r.facility, r.person, r.title, r.email, r.phone].some((v) => v.toLowerCase().includes(q)));
  }, [leads, extras, search]);

  function exportContactsCSV() {
    const headers = ["Facility", "Title", "Email", "Phone", "Contact Person", "Contact LinkedIn"];
    const hyperlink = (url: string, label: string) =>
      `=HYPERLINK("${url.replace(/"/g, '""')}","${label.replace(/"/g, '""')}")`;
    const escapeCell = (value: string | null) => `"${(value ?? "").replace(/"/g, '""')}"`;
    const exportRows = rows.map((row) => [
      row.facility,
      row.title,
      row.email,
      row.phone,
      row.person && row.linkedinUrl ? hyperlink(row.linkedinUrl, row.person) : row.person,
      row.linkedinUrl,
    ]);
    const csv = [headers, ...exportRows].map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `angels-oasis-contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function saveContactsAsPDF() {
    setError(null);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Allow pop-ups for this site to save the contact list as a PDF.");
      return;
    }

    const escapeHtml = (value: string | null | undefined) =>
      (value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character);
    const rowsHtml = rows.map((row) => {
      const person = row.person && row.linkedinUrl
        ? `<a href="${escapeHtml(row.linkedinUrl)}">${escapeHtml(row.person)}</a>`
        : escapeHtml(row.person);
      return `<tr>
        <td>${escapeHtml(row.facility)}</td>
        <td>${escapeHtml(row.title)}</td>
        <td>${escapeHtml(row.email)}</td>
        <td>${escapeHtml(row.phone)}</td>
        <td>${person}</td>
      </tr>`;
    }).join("");

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Angels Oasis Contacts</title>
          <style>
            @page { size: landscape; margin: 12mm; }
            body { color: #29212a; font: 10px Arial, sans-serif; }
            h1 { margin: 0 0 6px; font-size: 20px; }
            p { margin: 0 0 14px; color: #665b65; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #d8d1d6; padding: 5px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
            th { background: #f4eff2; font-size: 9px; }
            tr { break-inside: avoid; }
            a { color: #0a66c2; }
          </style>
        </head>
        <body>
          <h1>Angels Oasis Contacts</h1>
          <p>${rows.length} contact${rows.length === 1 ? "" : "s"} | Exported ${new Date().toLocaleDateString()}</p>
          <table>
            <thead><tr><th>Facility</th><th>Title</th><th>Email</th><th>Phone</th><th>Contact Person</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function startEdit(row: Row) {
    setError(null);
    setEditingKey(row.key);
    setDraft({ person: row.person, title: row.title, email: row.email, phone: row.phone });
  }

  function startAdd(leadId: string) {
    setError(null);
    setEditingKey(`${NEW_CONTACT_PREFIX}${leadId}`);
    setDraft({ person: "", title: "", email: "", phone: "" });
  }

  const clean = (v: string) => v.trim() || null;

  async function save(row: Row | null, leadId: string) {
    setSaving(true);
    setError(null);
    let result;
    if (row?.kind === "lead") {
      result = await supabase
        .from("leads")
        .update({
          contact_person: clean(draft.person),
          contact_title: clean(draft.title),
          email: clean(draft.email),
          phone: clean(draft.phone),
        })
        .eq("id", row.id);
    } else {
      if (!draft.person.trim()) {
        setSaving(false);
        setError("Contact person is required for an additional contact.");
        return;
      }
      const fields = { name: draft.person.trim(), title: clean(draft.title), email: clean(draft.email), phone: clean(draft.phone) };
      result = row
        ? await supabase.from("contacts").update(fields).eq("id", row.id)
        : await supabase.from("contacts").insert({ ...fields, lead_id: leadId });
    }
    setSaving(false);
    if (result.error) {
      setError(
        result.error.message.includes("contact_title")
          ? "The contact title column is missing — run supabase/migrations/0003_lead_contact_title.sql in the Supabase SQL editor."
          : result.error.message
      );
      return;
    }
    setEditingKey(null);
    load();
  }

  async function removeContact(row: Row) {
    if (!confirm(`Remove ${row.person} from ${row.facility}?`)) return;
    const { error } = await supabase.from("contacts").delete().eq("id", row.id);
    if (error) setError(error.message);
    else load();
  }

  const input = (field: keyof Draft, placeholder: string, type = "text") => (
    <input
      type={type}
      placeholder={placeholder}
      className="w-full rounded border border-plum/20 px-2 py-1 text-sm"
      value={draft[field]}
      onChange={(e) => setDraft({ ...draft, [field]: e.target.value })}
    />
  );

  function editCells(row: Row | null, leadId: string, facility: string) {
    return (
      <>
        <td className="px-4 py-2 font-medium">{facility}</td>
        <td className="px-4 py-2">{input("title", "Title")}</td>
        <td className="px-4 py-2">{input("email", "Email", "email")}</td>
        <td className="px-4 py-2">{input("phone", "Phone", "tel")}</td>
        <td className="px-4 py-2">{input("person", row?.kind === "lead" ? "Contact person" : "Contact person *")}</td>
        <td className="whitespace-nowrap px-4 py-2 text-right text-xs">
          <button className="font-semibold text-plum hover:underline disabled:opacity-50" disabled={saving} onClick={() => save(row, leadId)}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="ml-3 text-plum/60 hover:underline" onClick={() => setEditingKey(null)}>Cancel</button>
        </td>
      </>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Contacts</h1>
          <p className="mt-1 text-plum/60">Every lead's contact details, plus any additional people at each facility.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            placeholder="Search facility, name, email, phone…"
            className="w-72 rounded-lg border border-plum/20 px-3 py-2 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            onClick={exportContactsCSV}
            disabled={loading || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-plum/20 px-4 py-2 text-sm font-medium text-plum transition-colors hover:bg-plum/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            CSV Export
          </button>
          <button
            type="button"
            onClick={saveContactsAsPDF}
            disabled={loading || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-plum/20 px-4 py-2 text-sm font-medium text-plum transition-colors hover:bg-plum/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileText className="h-4 w-4" />
            Save as PDF
          </button>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-plum/10 bg-white">
        <table className="min-w-full divide-y divide-plum/10 text-sm">
          <thead className="bg-plum/5 text-left text-xs uppercase tracking-wide text-plum/60">
            <tr>
              <th className="px-4 py-3">Facility</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Contact Person</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-plum/5">
            {loading && <tr><td className="px-4 py-6 text-plum/50" colSpan={6}>Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td className="px-4 py-6 text-plum/50" colSpan={6}>
                {search ? "No contacts match your search." : "No leads yet — add one on the Leads page or the Hospitals Map."}
              </td></tr>
            )}
            {rows.map((row, i) => {
              const nextIsNewLead = rows[i + 1]?.leadId !== row.leadId;
              return (
                <Fragment key={row.key}>
                  <tr className={row.kind === "contact" ? "bg-plum/[0.02]" : ""}>
                    {editingKey === row.key ? (
                      editCells(row, row.leadId, row.facility)
                    ) : (
                      <>
                        <td className={`px-4 py-3 ${row.kind === "lead" ? "font-medium" : "pl-8 text-plum/50"}`}>
                          {row.kind === "lead" ? row.facility : `↳ ${row.facility}`}
                        </td>
                        <td className="px-4 py-3">{row.title || "—"}</td>
                        <td className="px-4 py-3">
                          {row.email ? <a href={`mailto:${row.email}`} className="hover:underline">{row.email}</a> : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {row.phone ? <a href={`tel:${row.phone}`} className="hover:underline">{row.phone}</a> : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {row.person
                            ? row.linkedinUrl
                              ? <a href={row.linkedinUrl} target="_blank" rel="noreferrer" className="text-plum hover:underline">{row.person}</a>
                              : row.person
                            : "—"}
                          {row.kind === "lead" && row.person && <span className="ml-2 badge bg-ink text-white">Primary</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                          <button className="text-plum hover:underline" onClick={() => startEdit(row)}>Edit</button>
                          {row.kind === "lead" ? (
                            <button className="ml-3 text-plum hover:underline" onClick={() => startAdd(row.leadId)}>+ Contact</button>
                          ) : (
                            <button className="ml-3 text-red-500 hover:underline" onClick={() => removeContact(row)}>Remove</button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                  {nextIsNewLead && editingKey === `${NEW_CONTACT_PREFIX}${row.leadId}` && (
                    <tr className="bg-plum/[0.02]">{editCells(null, row.leadId, `↳ ${row.facility}`)}</tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}