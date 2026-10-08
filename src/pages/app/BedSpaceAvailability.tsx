import { useEffect, useRef, useState } from "react";
import { Info, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AddLocationModal from "../../components/AddLocationModal";
import type { BedAvailabilityStatus, Facility, FacilityBedAvailability } from "../../lib/types";

const STATUS_OPTIONS: { value: BedAvailabilityStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closing_soon", label: "Closing Soon" },
  { value: "full", label: "Full" },
];

const STATUS_BADGE: Record<BedAvailabilityStatus, string> = {
  open: "bg-ink text-white",
  closing_soon: "bg-plum-50 text-plum",
  full: "bg-plum text-white",
};

const statusLabel = (status: BedAvailabilityStatus) => STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;

function facilityAddress(facility: Facility) {
  return [facility.address, facility.city, [facility.state, facility.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

// "Angels Oasis — Valley Village (Flagship)" → "Valley Village"
function shortName(name: string) {
  return (name.split("—").pop() ?? name).replace(/\(.*?\)/g, "").trim();
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-plum/10 px-4 py-3 sm:border-l">
      <p className="text-sm text-plum/70">{label}:</p>
      <p className="mt-1 text-2xl tabular-nums text-ink">{value}</p>
    </div>
  );
}

function FacilityCard({ facility, beds, onEdit }: {
  facility: Facility;
  beds: FacilityBedAvailability | undefined;
  onEdit: () => void;
}) {
  const openBeds = beds ? beds.total_beds - beds.occupied_beds : 0;
  const occupancy = beds && beds.total_beds > 0 ? Math.round((beds.occupied_beds / beds.total_beds) * 100) : 0;

  return (
    <div className="rounded-xl border border-plum/10 bg-white">
      <div className="flex flex-col gap-3 border-b border-plum/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-lg text-plum-dark">{facility.name}</h2>
          <p className="mt-0.5 text-sm text-plum/60">{facilityAddress(facility) || "Address not set"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {beds ? (
            <>
              <span className={`badge ${STATUS_BADGE[beds.availability_status]}`}>
                {statusLabel(beds.availability_status)}
              </span>
              <span className={`badge ${beds.accepting_referrals ? "bg-emerald-50 text-emerald-800" : "bg-plum/5 text-plum/70"}`}>
                {beds.accepting_referrals ? "Accepting Referrals" : "Not Accepting Referrals"}
              </span>
            </>
          ) : (
            <span className={`badge ${facility.status === "open" ? "bg-ink text-white" : "bg-plum-50 text-plum"}`}>
              {facility.status === "open" ? "Open" : "Coming soon"}
            </span>
          )}
          <button onClick={onEdit}
            className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-plum focus:outline-none focus:ring-2 focus:ring-plum focus:ring-offset-2">
            Edit
          </button>
        </div>
      </div>

      {beds ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5">
            <div className="col-span-2 px-4 py-3 sm:col-span-1">
              <div className="flex justify-between text-sm text-plum/70">
                <span>Total Beds: <span className="tabular-nums text-ink">{beds.total_beds}</span></span>
                <span className="tabular-nums">{occupancy}%</span>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-plum/10"
                role="progressbar" aria-label="Beds occupied" aria-valuenow={occupancy} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-plum" style={{ width: `${occupancy}%` }} />
              </div>
            </div>
            <Stat label="Occupied Beds" value={beds.occupied_beds} />
            <Stat label="Open Beds" value={openBeds} />
            <Stat label="Shared Rooms Open" value={beds.shared_rooms_total - beds.shared_rooms_occupied} />
            <Stat label="Private Rooms Open" value={beds.private_rooms_total - beds.private_rooms_occupied} />
          </div>
          {(beds.notes || beds.updated_at) && (
            <div className="flex flex-col gap-1 border-t border-plum/10 px-4 py-2 text-xs text-plum/60 sm:flex-row sm:justify-between">
              <span>{beds.notes}</span>
              <span>Updated {new Date(beds.updated_at).toLocaleString()}</span>
            </div>
          )}
        </>
      ) : (
        <p className="p-4 text-sm text-plum/60">Bed counts haven't been entered yet. Click Edit to add them.</p>
      )}
    </div>
  );
}

// Form values are strings so fields can be cleared while typing.
interface FormState {
  notes: string;
  total_beds: string;
  occupied_beds: string;
  shared_rooms_total: string;
  shared_rooms_occupied: string;
  private_rooms_total: string;
  private_rooms_occupied: string;
  availability_status: BedAvailabilityStatus;
  accepting_referrals: boolean;
}

type CountField = Exclude<keyof FormState, "notes" | "availability_status" | "accepting_referrals">;

function toForm(beds: FacilityBedAvailability | undefined): FormState {
  return {
    notes: beds?.notes ?? "",
    total_beds: String(beds?.total_beds ?? 0),
    occupied_beds: String(beds?.occupied_beds ?? 0),
    shared_rooms_total: String(beds?.shared_rooms_total ?? 0),
    shared_rooms_occupied: String(beds?.shared_rooms_occupied ?? 0),
    private_rooms_total: String(beds?.private_rooms_total ?? 0),
    private_rooms_occupied: String(beds?.private_rooms_occupied ?? 0),
    availability_status: beds?.availability_status ?? "open",
    accepting_referrals: beds?.accepting_referrals ?? true,
  };
}

const count = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value) : NaN);

function validate(form: FormState): Partial<Record<CountField, string>> {
  const errors: Partial<Record<CountField, string>> = {};
  const fields: CountField[] = [
    "total_beds", "occupied_beds", "shared_rooms_total", "shared_rooms_occupied", "private_rooms_total", "private_rooms_occupied",
  ];
  for (const field of fields) {
    if (Number.isNaN(count(form[field]))) errors[field] = "Enter a whole number (0 or more).";
  }
  const pairs: [CountField, CountField, string][] = [
    ["occupied_beds", "total_beds", "Occupied beds can't exceed total beds."],
    ["shared_rooms_occupied", "shared_rooms_total", "Can't exceed shared rooms total."],
    ["private_rooms_occupied", "private_rooms_total", "Can't exceed private rooms total."],
  ];
  for (const [occupied, total, message] of pairs) {
    if (!errors[occupied] && !errors[total] && count(form[occupied]) > count(form[total])) errors[occupied] = message;
  }
  return errors;
}

const inputClass =
  "w-full rounded-lg border border-plum/20 px-3 py-2 text-sm text-ink focus:border-plum focus:outline-none focus:ring-2 focus:ring-plum/20";

function EditBedSpaceModal({ facility, beds, onClose, onSaved }: {
  facility: Facility;
  beds: FacilityBedAvailability | undefined;
  onClose: () => void;
  onSaved: (beds: FacilityBedAvailability) => void;
}) {
  const [form, setForm] = useState<FormState>(() => toForm(beds));
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Text typed into an "Open" box while it has focus (may be mid-edit/blank).
  const [openDrafts, setOpenDrafts] = useState<Record<string, string>>({});
  const dialogRef = useRef<HTMLDivElement>(null);

  const errors = validate(form);
  const hasErrors = Object.keys(errors).length > 0;
  const openOf = (total: CountField, occupied: CountField) => {
    const value = count(form[total]) - count(form[occupied]);
    return Number.isFinite(value) && value >= 0 ? value : "—";
  };

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("textarea, input:not([readonly])")?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (hasErrors) return;
    setSaving(true);
    setSaveError(null);

    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("facility_bed_availability")
      .upsert({
        facility_id: facility.id,
        notes: form.notes.trim() || null,
        total_beds: count(form.total_beds),
        occupied_beds: count(form.occupied_beds),
        shared_rooms_total: count(form.shared_rooms_total),
        shared_rooms_occupied: count(form.shared_rooms_occupied),
        private_rooms_total: count(form.private_rooms_total),
        private_rooms_occupied: count(form.private_rooms_occupied),
        availability_status: form.availability_status,
        accepting_referrals: form.accepting_referrals,
        updated_by: auth.user?.id ?? null,
      })
      .select()
      .single();
    setSaving(false);

    if (error) {
      setSaveError(
        error.code === "42P01" || error.code === "PGRST205"
          ? "Bed availability isn't set up in the database yet. Run migration 0006_bed_space_availability.sql in Supabase."
          : error.code === "42501"
            ? "Your account doesn't have permission to edit bed availability."
            : error.message
      );
      return;
    }
    onSaved(data as FacilityBedAvailability);
  }

  const countInput = (field: CountField, label: string) => (
    <div>
      <label htmlFor={field} className="mb-1 block text-sm text-plum/80">{label}</label>
      <input id={field} type="number" min={0} step={1} inputMode="numeric"
        className={`${inputClass} ${touched && errors[field] ? "border-red-500" : ""}`}
        value={form[field]} onChange={(e) => set(field, e.target.value)} onBlur={() => setTouched(true)}
        aria-invalid={touched && !!errors[field]} aria-describedby={errors[field] ? `${field}-error` : undefined} />
      {touched && errors[field] && <p id={`${field}-error`} className="mt-1 text-xs text-red-600">{errors[field]}</p>}
    </div>
  );

  // "Open" is total − occupied. It can be typed too: entering how many are
  // open fills in Occupied, so staff can update whichever number they know.
  const openInput = (total: CountField, occupied: CountField, label: string) => {
    const id = `${occupied}-open`;
    const draft = openDrafts[id];
    const derived = openOf(total, occupied);
    const typed = draft !== undefined ? count(draft) : NaN;
    const tooMany = draft !== undefined && Number.isFinite(typed) && typed > count(form[total]);
    return (
      <div>
        <label htmlFor={id} className="mb-1 block text-sm text-plum/80">{label}</label>
        <input id={id} type="number" min={0} step={1} inputMode="numeric"
          className={`${inputClass} bg-emerald-50/60 ${tooMany ? "border-red-500" : ""}`}
          value={draft ?? (derived === "—" ? "" : String(derived))}
          onChange={(e) => {
            const text = e.target.value;
            setOpenDrafts((prev) => ({ ...prev, [id]: text }));
            const open = count(text);
            const totalValue = count(form[total]);
            if (Number.isFinite(open) && Number.isFinite(totalValue) && open <= totalValue) {
              set(occupied, String(totalValue - open));
            }
          }}
          onBlur={() => setOpenDrafts(({ [id]: _, ...rest }) => rest)}
          aria-invalid={tooMany} aria-describedby={tooMany ? `${id}-error` : undefined} />
        {tooMany && <p id={`${id}-error`} className="mt-1 text-xs text-red-600">Can't be more than the total.</p>}
      </div>
    );
  };

  const countRow = (title: string, total: CountField, occupied: CountField, labels: [string, string, string]) => (
    <div>
      <p className="mb-1.5 text-sm font-semibold text-ink">{title}</p>
      <div className="grid grid-cols-3 gap-3">
        {countInput(total, labels[0])}
        {countInput(occupied, labels[1])}
        {openInput(total, occupied, labels[2])}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="edit-beds-title"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-plum/10 px-6 py-4">
          <h2 id="edit-beds-title" className="font-sans text-lg font-semibold text-ink">
            Edit Bed Space Availability — {shortName(facility.name)}
          </h2>
          <button onClick={onClose} disabled={saving} aria-label="Close"
            className="rounded-lg border border-plum/20 p-1.5 text-ink transition hover:bg-plum/5 focus:outline-none focus:ring-2 focus:ring-plum">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-5 overflow-y-auto px-6 py-5">
            <div>
              <label htmlFor="facility-name" className="mb-1 block text-sm text-plum/80">Facility Name &amp; Address</label>
              <input id="facility-name" readOnly value={facility.name} className={`${inputClass} bg-plum/5 text-plum/80`} />
              <p className="mt-1 text-xs text-plum/60">{facilityAddress(facility) || "Address not set"}</p>
            </div>

            <div>
              <label htmlFor="notes" className="mb-1 block text-sm text-plum/80">Facility Notes</label>
              <textarea id="notes" rows={2} placeholder="e.g., specific facility rules" className={inputClass}
                value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>

            <fieldset>
              <legend className="font-sans text-base font-semibold text-ink">Bed Counts</legend>
              <p className="mb-3 text-xs text-plum/60">
                Type either Occupied or Open — the other fills in automatically.
              </p>
              <div className="space-y-4">
                {countRow("Beds", "total_beds", "occupied_beds", ["Total Beds", "Occupied Beds", "Open Beds"])}
                {countRow("Shared Rooms", "shared_rooms_total", "shared_rooms_occupied", ["Total", "Occupied", "Open"])}
                {countRow("Private Rooms", "private_rooms_total", "private_rooms_occupied", ["Total", "Occupied", "Open"])}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="status" className="mb-1 block text-sm text-plum/80">Facility Status</label>
                <select id="status" className={inputClass} value={form.availability_status}
                  onChange={(e) => set("availability_status", e.target.value as BedAvailabilityStatus)}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <p className="mb-1 flex items-center gap-1 text-sm text-plum/80">
                  Referral Status
                  <span title="Whether this facility is currently taking new referrals from hospitals and partners.">
                    <Info className="h-3.5 w-3.5 text-plum/50" aria-label="Whether this facility is currently taking new referrals." />
                  </span>
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink">Accepting Referrals</span>
                  <div role="radiogroup" aria-label="Accepting referrals" className="flex overflow-hidden rounded-full border border-plum/20">
                    {([true, false] as const).map((value) => (
                      <button key={String(value)} type="button" role="radio" aria-checked={form.accepting_referrals === value}
                        onClick={() => set("accepting_referrals", value)}
                        className={`px-4 py-1.5 text-sm ${form.accepting_referrals === value ? "bg-plum text-white" : "bg-white text-ink"}`}>
                        {value ? "Yes" : "No"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
          </div>

          <div className="flex justify-end gap-3 border-t border-plum/10 px-6 py-4">
            <button type="submit" disabled={saving || (touched && hasErrors)}
              className="rounded-full bg-plum px-5 py-2 text-sm font-semibold text-white transition hover:bg-plum-dark focus:outline-none focus:ring-2 focus:ring-plum focus:ring-offset-2 disabled:opacity-50">
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button type="button" onClick={onClose} disabled={saving}
              className="rounded-full border border-plum/20 px-5 py-2 text-sm text-ink transition hover:bg-plum/5">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BedSpaceAvailability() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [beds, setBeds] = useState<Record<string, FacilityBedAvailability>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Facility | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase.from("facilities").select("*"),
      supabase.from("facility_bed_availability").select("*"),
    ]).then(([facilityResult, bedResult]) => {
      const rows = ((facilityResult.data as Facility[]) ?? []).sort(
        (a, b) => Number(a.status !== "open") - Number(b.status !== "open")
      );
      setFacilities(rows);
      setBeds(Object.fromEntries(((bedResult.data as FacilityBedAvailability[]) ?? []).map((b) => [b.facility_id, b])));
      if (facilityResult.error) setLoadError(facilityResult.error.message);
      else if (bedResult.error) {
        setLoadError("Bed counts couldn't be loaded. If this is a new setup, run migration 0006_bed_space_availability.sql in Supabase.");
      }
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Bed Space Availability</h1>
          <p className="mt-1 text-plum/60">Bed availability by Angels Oasis facility.</p>
        </div>
        <button onClick={() => { setMessage(null); setAdding(true); }}
          className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white transition hover:bg-plum focus:outline-none focus:ring-2 focus:ring-plum focus:ring-offset-2">
          + Add Location
        </button>
      </div>

      {loadError && <p role="alert" className="mt-4 text-sm text-red-600">{loadError}</p>}
      {message && <p role="status" className="mt-4 text-sm text-plum">{message}</p>}

      <div className="mt-6 space-y-5">
        {loading ? (
          <p className="text-sm text-plum/60">Loading facilities…</p>
        ) : facilities.length === 0 ? (
          <p className="text-sm text-plum/60">No facilities found.</p>
        ) : (
          facilities.map((facility) => (
            <FacilityCard key={facility.id} facility={facility} beds={beds[facility.id]}
              onEdit={() => { setMessage(null); setEditing(facility); }} />
          ))
        )}
      </div>

      {adding && (
        <AddLocationModal
          existing={facilities}
          onClose={() => setAdding(false)}
          onAdded={(facility) => {
            setFacilities((prev) => [...prev, facility]);
            setAdding(false);
            setMessage(`Added ${facility.name}. It's now on the Hospitals Map — enter its bed counts below.`);
            setEditing(facility); // straight into bed counts for the new location
          }}
        />
      )}

      {editing && (
        <EditBedSpaceModal
          facility={editing}
          beds={beds[editing.id]}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setBeds((prev) => ({ ...prev, [saved.facility_id]: saved }));
            setMessage(`Saved bed availability for ${editing.name}.`);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}
