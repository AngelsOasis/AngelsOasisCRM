import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BarChart3, ChevronDown, ChevronRight, Pencil, RotateCcw, Table2, Trash2, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AddLocationModal from "../../components/AddLocationModal";
import type { BedStatus, Facility, FacilityBed, FacilityRoom } from "../../lib/types";

// ---------------------------------------------------------------------------
// Bed status rules (blueprint §4). `badge` is the short label shown in
// Availability columns; `label` is the full status name.
// ---------------------------------------------------------------------------
const STATUS: Record<BedStatus, { badge: string; label: string; color: string }> = {
  available: { badge: "Available", label: "Available for Placement", color: "#B47D12" },
  occupied: { badge: "Occupied", label: "Occupied", color: "#1670A0" },
  unavailable: { badge: "Under Maintenance", label: "Temporarily Unavailable", color: "#A65E3B" },
};
const STATUS_ORDER: BedStatus[] = ["available", "occupied", "unavailable"];

type Counts = Record<BedStatus, number> & { total: number };

function countBeds(beds: FacilityBed[]): Counts {
  const counts: Counts = { total: beds.length, available: 0, occupied: 0, unavailable: 0 };
  for (const bed of beds) counts[bed.status] += 1;
  return counts;
}

function facilityAddress(facility: Facility | undefined) {
  if (!facility) return "";
  return [facility.address, facility.city, [facility.state, facility.zip].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

// "Angels Oasis — Valley Village (Flagship)" → "Valley Village"
function shortName(name: string) {
  return (name.split("—").pop() ?? name).replace(/\(.*?\)/g, "").trim();
}

const MIGRATION_HINT = "Rooms and beds aren't set up in the database yet. Run migration 0012_rooms_and_beds.sql in Supabase.";

function friendlyError(error: { code?: string; message: string }) {
  if (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42883") {
    return MIGRATION_HINT;
  }
  if (error.code === "42501") return "Your account doesn't have permission to change rooms or beds.";
  if (error.code === "23505") return "That room ID already exists at this site.";
  return error.message;
}

const inputClass =
  "w-full rounded-lg border border-plum/20 px-3 py-2 text-sm text-ink focus:border-plum focus:outline-none focus:ring-2 focus:ring-plum/20";
const darkButton =
  "rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-plum focus:outline-none focus:ring-2 focus:ring-plum focus:ring-offset-2 disabled:opacity-50";
const lightButton =
  "rounded-full border border-plum/20 px-4 py-1.5 text-sm text-ink transition hover:bg-plum/5 focus:outline-none focus:ring-2 focus:ring-plum disabled:opacity-50";
const iconButton =
  "rounded-lg p-1.5 text-plum/70 transition hover:bg-plum/5 hover:text-ink focus:outline-none focus:ring-2 focus:ring-plum disabled:opacity-50";

function StatusBadge({ status }: { status: BedStatus }) {
  const { badge, color } = STATUS[status];
  return (
    <span className="badge whitespace-nowrap" style={{ color, backgroundColor: `${color}1A` }}>
      {badge}
    </span>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-full border border-plum/20 bg-white">
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm transition ${
            value === option.value ? "bg-plum text-white" : "text-ink hover:bg-plum/5"
          }`}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary tiles
// ---------------------------------------------------------------------------
function SummaryCard({ counts }: { counts: Counts }) {
  const tiles: { label: string; value: number; color: string | null }[] = [
    { label: "Total Beds", value: counts.total, color: null },
    { label: "Available", value: counts.available, color: STATUS.available.color },
    { label: "Occupied", value: counts.occupied, color: STATUS.occupied.color },
    { label: "Under Maintenance", value: counts.unavailable, color: STATUS.unavailable.color },
  ];
  return (
    <div className="rounded-xl border border-plum/10 bg-white">
      <div className="grid grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile, i) => (
          <div key={tile.label}
            className={`px-5 py-4 ${i % 2 === 1 ? "border-l border-plum/10" : ""} ${i >= 2 ? "border-t border-plum/10 lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
            <p className="flex items-center gap-2 text-sm text-plum/70">
              <span className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: tile.color ?? "#533841" }} aria-hidden="true" />
              {tile.label}
            </p>
            <p className="mt-1 text-3xl tabular-nums text-ink">{tile.value}</p>
          </div>
        ))}
      </div>
      {counts.total === 0 && (
        <p className="border-t border-plum/10 px-5 py-2 text-sm text-plum/60">No beds recorded yet.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Graph view — one stacked bar per branch or per room
// ---------------------------------------------------------------------------
interface ChartGroup { key: string; label: string; sublabel?: string; counts: Counts }

function BedChart({ groups }: { groups: ChartGroup[] }) {
  const max = Math.max(1, ...groups.map((g) => g.counts.total));
  if (groups.length === 0) return <p className="py-8 text-center text-sm text-plum/60">No beds to chart yet.</p>;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4 text-sm text-plum/80">
        {STATUS_ORDER.map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: STATUS[status].color }} aria-hidden="true" />
            {STATUS[status].badge}
          </span>
        ))}
      </div>
      <ul className="space-y-3">
        {groups.map((group) => (
          <li key={group.key} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[12rem_1fr] sm:gap-4">
            <div className="min-w-0">
              <p className="truncate text-sm text-ink" title={group.label}>{group.label}</p>
              {group.sublabel && <p className="truncate text-xs text-plum/60">{group.sublabel}</p>}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-7 flex-1 overflow-hidden rounded-md bg-plum/5"
                role="img"
                aria-label={`${group.label}: ${STATUS_ORDER.map((s) => `${group.counts[s]} ${STATUS[s].badge}`).join(", ")}`}>
                {STATUS_ORDER.map((status) => {
                  const value = group.counts[status];
                  if (!value) return null;
                  return (
                    <div key={status} title={`${STATUS[status].badge}: ${value}`}
                      className="flex items-center justify-center border-r border-white/60 text-xs font-semibold text-white last:border-r-0"
                      style={{ width: `${(value / max) * 100}%`, backgroundColor: STATUS[status].color }}>
                      {(value / max) * 100 >= 6 ? value : ""}
                    </div>
                  );
                })}
              </div>
              <span className="w-10 text-right text-sm tabular-nums text-plum/70">{group.counts.total}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog shell
// ---------------------------------------------------------------------------
function Dialog({ title, onClose, busy, children }: {
  title: string;
  onClose: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("select, input")?.focus();
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-plum/10 px-6 py-4">
          <h2 className="font-sans text-lg font-semibold text-ink">{title}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close"
            className="rounded-lg border border-plum/20 p-1.5 text-ink transition hover:bg-plum/5 focus:outline-none focus:ring-2 focus:ring-plum">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add / Edit Room
// ---------------------------------------------------------------------------
function RoomDialog({ room, initialFacilityId, facilities, rooms, onClose, onSaved }: {
  room: FacilityRoom | null; // null = add
  initialFacilityId: string;
  facilities: Facility[];
  rooms: FacilityRoom[]; // active rooms, for the duplicate check
  onClose: () => void;
  onSaved: (room: FacilityRoom, mode: "added" | "updated" | "unchanged") => void;
}) {
  const [facilityId, setFacilityId] = useState(room?.facility_id ?? initialFacilityId);
  const [code, setCode] = useState(room?.room_code ?? "");
  const [name, setName] = useState(room?.room_name ?? "");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const facility = facilities.find((f) => f.id === facilityId);
  const trimmedCode = code.trim();
  const trimmedName = name.trim();
  const duplicate = rooms.some((r) =>
    r.id !== room?.id && r.facility_id === facilityId && r.room_code.trim().toLowerCase() === trimmedCode.toLowerCase()
  );
  const errors = {
    facility: facilityId ? null : "Site / facility is required.",
    code: !trimmedCode || trimmedCode.length > 20
      ? "Room ID is required and must be 20 characters or fewer."
      : duplicate ? "That room ID already exists at this site." : null,
    name: !trimmedName || trimmedName.length > 20 ? "Room name is required and must be 20 characters or fewer." : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    setNotice(null);
    if (invalid) return;

    if (room && room.facility_id === facilityId && room.room_code === trimmedCode && room.room_name === trimmedName) {
      onSaved(room, "unchanged");
      return;
    }

    setSaving(true);
    setError(null);
    const values = { facility_id: facilityId, room_code: trimmedCode, room_name: trimmedName };
    const result = room
      ? await supabase.from("facility_rooms").update(values).eq("id", room.id).select().single()
      : await supabase.from("facility_rooms").insert(values).select().single();
    setSaving(false);
    if (result.error) {
      setError(friendlyError(result.error));
      return;
    }
    const saved = result.data as FacilityRoom;
    onSaved(saved, room ? "updated" : "added");
    if (!room) {
      // Stay open with the site kept so several rooms can be added quickly.
      setCode("");
      setName("");
      setTouched(false);
      setNotice(`Added ${saved.room_name} (Room ID ${saved.room_code}). Add another or close.`);
      codeRef.current?.focus();
    }
  }

  const fieldError = (message: string | null, id: string) =>
    touched && message ? <p id={id} className="mt-1 text-xs text-red-600">{message}</p> : null;

  return (
    <Dialog title={room ? `Edit Room — ${room.room_name}` : "Add Room"} onClose={onClose} busy={saving}>
      <form onSubmit={save} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label htmlFor="room-site" className="mb-1 block text-sm text-plum/80">Site / facility</label>
            <select id="room-site" className={inputClass} value={facilityId} onChange={(e) => setFacilityId(e.target.value)}>
              <option value="">Select a site…</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {fieldError(errors.facility, "room-site-error")}
          </div>
          <div>
            <p className="mb-1 block text-sm text-plum/80">Facility address</p>
            <p className="rounded-lg bg-plum/5 px-3 py-2 text-sm text-plum/80">
              {facility ? facilityAddress(facility) || "Address not set for this site" : "Choose a site to see its address"}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="room-code" className="mb-1 block text-sm text-plum/80">Room ID</label>
              <input id="room-code" ref={codeRef} maxLength={20} placeholder="e.g., 101" className={inputClass}
                value={code} onChange={(e) => setCode(e.target.value)} onBlur={() => setTouched(true)}
                aria-invalid={touched && !!errors.code} aria-describedby={errors.code ? "room-code-error" : undefined} />
              {fieldError(errors.code, "room-code-error")}
            </div>
            <div>
              <label htmlFor="room-name" className="mb-1 block text-sm text-plum/80">Room name</label>
              <input id="room-name" maxLength={20} placeholder="e.g., East Wing 1" className={inputClass}
                value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)}
                aria-invalid={touched && !!errors.name} aria-describedby={errors.name ? "room-name-error" : undefined} />
              {fieldError(errors.name, "room-name-error")}
            </div>
          </div>
          {notice && <p role="status" className="text-sm text-forest">{notice}</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-plum/10 px-6 py-4">
          <button type="submit" disabled={saving} className={darkButton}>
            {saving ? "Saving…" : room ? "Save Changes" : "Add Room"}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className={lightButton}>
            {room ? "Cancel" : "Close"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit Bed — status only (no occupier / staff in this CRM)
// ---------------------------------------------------------------------------
function BedDialog({ bed, onClose, onSaved }: {
  bed: FacilityBed;
  onClose: () => void;
  onSaved: (bed: FacilityBed, previous: BedStatus) => void;
}) {
  const [status, setStatus] = useState<BedStatus>(bed.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (status === bed.status) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    const { data: auth } = await supabase.auth.getUser();
    const { data, error: saveError } = await supabase.from("facility_beds")
      .update({ status, updated_by: auth.user?.id ?? null })
      .eq("id", bed.id).is("deleted_at", null)
      .select().single();
    setSaving(false);
    if (saveError) {
      setError(saveError.code === "PGRST116" ? "That bed no longer exists. Refresh the page." : friendlyError(saveError));
      return;
    }
    onSaved(data as FacilityBed, bed.status);
  }

  return (
    <Dialog title={`Edit Bed #${bed.bed_number}`} onClose={onClose} busy={saving}>
      <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-4 px-6 py-5">
          <div>
            <label htmlFor="bed-status" className="mb-1 block text-sm text-plum/80">Status</label>
            <select id="bed-status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as BedStatus)}>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-plum/10 px-6 py-4">
          <button type="submit" disabled={saving} className={darkButton}>{saving ? "Saving…" : "Save Changes"}</button>
          <button type="button" onClick={onClose} disabled={saving} className={lightButton}>Cancel</button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// One collapsible room in the Rooms section
// ---------------------------------------------------------------------------
function RoomRow({ room, facility, beds, expanded, busy, onToggle, onEdit, onDelete, onAddBed, onEditBed, onDeleteBed }: {
  room: FacilityRoom;
  facility: Facility | undefined;
  beds: FacilityBed[];
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddBed: (status: BedStatus) => Promise<boolean>;
  onEditBed: (bed: FacilityBed) => void;
  onDeleteBed: (bed: FacilityBed) => void;
}) {
  const [newStatus, setNewStatus] = useState<BedStatus>("available");
  const [adding, setAdding] = useState(false);
  const panelId = `room-panel-${room.id}`;

  return (
    <li className="border-t border-plum/10 first:border-t-0">
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={panelId}
          className="flex min-w-0 flex-1 items-start gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-plum">
          {expanded
            ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-plum/60" />
            : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-plum/60" />}
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-ink">{room.room_name}</span>
              <span className="badge bg-plum/5 text-plum/80">{beds.length} {beds.length === 1 ? "bed" : "beds"}</span>
            </span>
            <span className="mt-0.5 block text-sm text-plum/60">
              {facility ? shortName(facility.name) : "Unknown site"} · Room ID {room.room_code}
              {facilityAddress(facility) && <> · {facilityAddress(facility)}</>}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 gap-2 pl-6 sm:pl-0">
          <button type="button" onClick={onEdit} disabled={busy} className={darkButton}>Edit</button>
          <button type="button" onClick={onDelete} disabled={busy}
            className="rounded-full border border-red-200 px-4 py-1.5 text-sm text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:opacity-50">
            Delete Temporarily
          </button>
        </div>
      </div>

      {expanded && (
        <div id={panelId} className="border-t border-plum/10 bg-cream/60 px-4 py-3">
          {beds.length === 0 ? (
            <p className="py-2 text-sm text-plum/60">No beds in this room yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-plum/60">
                    <th className="py-2 pr-3 font-medium">Bed #</th>
                    <th className="py-2 pr-3 font-medium">Availability</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 text-right font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {beds.map((bed) => (
                    <tr key={bed.id} className="border-t border-plum/10">
                      <td className="py-2 pr-3 tabular-nums text-ink">{bed.bed_number}</td>
                      <td className="py-2 pr-3"><StatusBadge status={bed.status} /></td>
                      <td className="py-2 pr-3 text-plum/80">{STATUS[bed.status].label}</td>
                      <td className="py-2 text-right">
                        <button type="button" onClick={() => onEditBed(bed)} disabled={busy}
                          className={iconButton} aria-label={`Edit bed ${bed.bed_number}`} title="Edit bed">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => onDeleteBed(bed)} disabled={busy}
                          className={`${iconButton} hover:text-red-700`} aria-label={`Delete bed ${bed.bed_number}`} title="Delete bed">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form className="mt-3 flex flex-wrap items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setAdding(true);
              await onAddBed(newStatus);
              setAdding(false);
            }}>
            <label htmlFor={`new-bed-${room.id}`} className="text-sm text-plum/80">New bed status</label>
            <select id={`new-bed-${room.id}`} value={newStatus} onChange={(e) => setNewStatus(e.target.value as BedStatus)}
              className="rounded-lg border border-plum/20 bg-white px-3 py-1.5 text-sm text-ink focus:border-plum focus:outline-none focus:ring-2 focus:ring-plum/20">
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
            <button type="submit" disabled={adding || busy} className={darkButton}>{adding ? "Adding…" : "+ Add Bed"}</button>
          </form>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
type Message = { text: string; tone: "ok" | "error" };

export default function BedSpaceAvailability() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [rooms, setRooms] = useState<FacilityRoom[]>([]);
  const [beds, setBeds] = useState<FacilityBed[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);

  const [view, setView] = useState<"graph" | "table">("graph");
  const [groupBy, setGroupBy] = useState<"branch" | "rooms">("branch");
  const [branch, setBranch] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [addingLocation, setAddingLocation] = useState(false);
  const [roomDialog, setRoomDialog] = useState<{ room: FacilityRoom | null; facilityId: string } | null>(null);
  const [editingBed, setEditingBed] = useState<FacilityBed | null>(null);

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const [facilityResult, roomResult, bedResult, profileResult] = await Promise.all([
      supabase.from("facilities").select("*"),
      supabase.from("facility_rooms").select("*"),
      supabase.from("facility_beds").select("*").order("bed_number"),
      auth.user
        ? supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const facilityRows = ((facilityResult.data as Facility[]) ?? []).sort(
      (a, b) => Number(a.status !== "open") - Number(b.status !== "open") || a.name.localeCompare(b.name)
    );
    setFacilities(facilityRows);
    setRooms((roomResult.data as FacilityRoom[]) ?? []);
    setBeds((bedResult.data as FacilityBed[]) ?? []);
    // Matches the database rule: anyone signed in except read-only viewers.
    setCanEdit(!!auth.user && (profileResult.data as { role?: string } | null)?.role !== "viewer");

    const failed = facilityResult.error ?? roomResult.error ?? bedResult.error;
    setLoadError(failed ? friendlyError(failed) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // --- derived data -------------------------------------------------------
  const facilityById = useMemo(() => new Map(facilities.map((f) => [f.id, f])), [facilities]);
  const activeRooms = useMemo(
    () => rooms
      .filter((r) => !r.deleted_at)
      .sort((a, b) => {
        const fa = facilities.findIndex((f) => f.id === a.facility_id);
        const fb = facilities.findIndex((f) => f.id === b.facility_id);
        return fa - fb || a.room_name.localeCompare(b.room_name, undefined, { numeric: true });
      }),
    [rooms, facilities]
  );
  const roomById = useMemo(() => new Map(activeRooms.map((r) => [r.id, r])), [activeRooms]);
  const activeBeds = useMemo(() => beds.filter((b) => !b.deleted_at && roomById.has(b.room_id)), [beds, roomById]);
  const bedsByRoom = useMemo(() => {
    const map = new Map<string, FacilityBed[]>();
    for (const bed of activeBeds) map.set(bed.room_id, [...(map.get(bed.room_id) ?? []), bed]);
    return map;
  }, [activeBeds]);

  const visibleRooms = branch === "all" ? activeRooms : activeRooms.filter((r) => r.facility_id === branch);
  const visibleBeds = branch === "all" ? activeBeds : activeBeds.filter((b) => roomById.get(b.room_id)?.facility_id === branch);
  const summary = countBeds(visibleBeds);

  const chartGroups: ChartGroup[] = groupBy === "branch"
    ? facilities
        .filter((f) => branch === "all" || f.id === branch)
        .map((f) => ({
          key: f.id,
          label: shortName(f.name),
          counts: countBeds(visibleBeds.filter((b) => roomById.get(b.room_id)?.facility_id === f.id)),
        }))
        .filter((g) => g.counts.total > 0)
    : visibleRooms.map((r) => ({
        key: r.id,
        label: r.room_name,
        sublabel: `${shortName(facilityById.get(r.facility_id)?.name ?? "")} · Room ID ${r.room_code}`,
        counts: countBeds(bedsByRoom.get(r.id) ?? []),
      }));

  const tableRows = visibleRooms.flatMap((room) => (bedsByRoom.get(room.id) ?? []).map((bed) => ({ room, bed })));

  const deletedRooms = rooms.filter((r) => r.deleted_at)
    .sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
  const deletedBeds = beds.filter((b) => b.deleted_at && roomById.has(b.room_id))
    .sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));

  // --- actions ------------------------------------------------------------
  const notify = (text: string, tone: Message["tone"] = "ok") => setMessage({ text, tone });

  async function addBed(room: FacilityRoom, status: BedStatus) {
    const { data, error } = await supabase.from("facility_beds").insert({ room_id: room.id, status }).select().single();
    if (error) {
      notify(friendlyError(error), "error");
      return false;
    }
    const bed = data as FacilityBed;
    setBeds((prev) => [...prev, bed]);
    notify(`Added Bed #${bed.bed_number} to ${room.room_name} (${STATUS[bed.status].badge}).`);
    return true;
  }

  async function deleteBed(bed: FacilityBed) {
    if (!window.confirm(`Delete Bed #${bed.bed_number}? You can restore it from "Recently deleted".`)) return;
    setBusy(true);
    const { data, error } = await supabase.from("facility_beds")
      .update({ deleted_at: new Date().toISOString() }).eq("id", bed.id).select().single();
    setBusy(false);
    if (error) return notify(friendlyError(error), "error");
    setBeds((prev) => prev.map((b) => (b.id === bed.id ? (data as FacilityBed) : b)));
    notify(`Bed #${bed.bed_number} deleted temporarily.`);
  }

  async function restoreBed(bed: FacilityBed) {
    setBusy(true);
    const { data, error } = await supabase.from("facility_beds")
      .update({ deleted_at: null }).eq("id", bed.id).select().single();
    setBusy(false);
    if (error) return notify(friendlyError(error), "error");
    setBeds((prev) => prev.map((b) => (b.id === bed.id ? (data as FacilityBed) : b)));
    notify(`Bed #${bed.bed_number} restored.`);
  }

  async function deleteRoom(room: FacilityRoom) {
    const count = bedsByRoom.get(room.id)?.length ?? 0;
    if (!window.confirm(
      `Delete ${room.room_name} and its ${count} ${count === 1 ? "bed" : "beds"}? You can restore them from "Recently deleted".`
    )) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_room", { p_room_id: room.id });
    if (error) {
      setBusy(false);
      return notify(friendlyError(error), "error");
    }
    await load();
    setBusy(false);
    notify(`${room.room_name} and its beds were deleted temporarily.`);
  }

  async function restoreRoom(room: FacilityRoom) {
    setBusy(true);
    const { error } = await supabase.rpc("restore_room", { p_room_id: room.id });
    if (error) {
      setBusy(false);
      return notify(
        error.code === "23505"
          ? `Can't restore ${room.room_name}: another room at that site now uses Room ID ${room.room_code}. Change that room's ID first.`
          : friendlyError(error),
        "error"
      );
    }
    await load();
    setBusy(false);
    notify(`${room.room_name} and its beds were restored.`);
  }

  const toggleRoom = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openAddRoom = (facilityId?: string) => {
    setMessage(null);
    setRoomDialog({ room: null, facilityId: facilityId ?? (branch !== "all" ? branch : facilities[0]?.id ?? "") });
  };

  // --- render -------------------------------------------------------------
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Bed Space Availability</h1>
          <p className="mt-1 text-plum/60">Bed availability by Angels Oasis facility.</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setMessage(null); setAddingLocation(true); }} className={lightButton}>
              + Add Location
            </button>
            <button onClick={() => openAddRoom()} disabled={facilities.length === 0} className={darkButton}>
              + Add Room
            </button>
          </div>
        )}
      </div>

      {loadError && <p role="alert" className="mt-4 text-sm text-red-600">{loadError}</p>}
      {message && (
        <p role={message.tone === "error" ? "alert" : "status"}
          className={`mt-4 text-sm ${message.tone === "error" ? "text-red-600" : "text-forest"}`}>
          {message.text}
        </p>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-plum/60">Loading bed space…</p>
      ) : (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="branch-filter" className="text-sm text-plum/80">Branch</label>
            <select id="branch-filter" value={branch} onChange={(e) => setBranch(e.target.value)}
              className="rounded-full border border-plum/20 bg-white px-4 py-1.5 text-sm text-ink focus:border-plum focus:outline-none focus:ring-2 focus:ring-plum/20">
              <option value="all">All Branches</option>
              {facilities.map((f) => <option key={f.id} value={f.id}>{shortName(f.name)}</option>)}
            </select>
          </div>

          <SummaryCard counts={summary} />

          <section className="rounded-xl border border-plum/10 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-plum/10 px-4 py-3">
              <h2 className="font-serif text-lg text-plum-dark">{view === "graph" ? "Bed Availability" : "All Beds"}</h2>
              <div className="flex flex-wrap gap-2">
                {view === "graph" && (
                  <Segmented label="Group chart by" value={groupBy} onChange={setGroupBy}
                    options={[{ value: "branch", label: "Branch" }, { value: "rooms", label: "Rooms" }]} />
                )}
                <Segmented label="View" value={view} onChange={setView}
                  options={[
                    { value: "graph", label: <><BarChart3 className="h-4 w-4" /> Graph</> },
                    { value: "table", label: <><Table2 className="h-4 w-4" /> Table</> },
                  ]} />
              </div>
            </div>
            <div className="p-4">
              {view === "graph" ? (
                <BedChart groups={chartGroups} />
              ) : tableRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-plum/60">No beds recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-plum/60">
                        <th className="py-2 pr-3 font-medium">Site</th>
                        <th className="py-2 pr-3 font-medium">Room</th>
                        <th className="py-2 pr-3 font-medium">Bed #</th>
                        <th className="py-2 pr-3 font-medium">Address</th>
                        <th className="py-2 pr-3 font-medium">Availability</th>
                        <th className="py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map(({ room, bed }) => {
                        const facility = facilityById.get(room.facility_id);
                        return (
                          <tr key={bed.id} className="border-t border-plum/10">
                            <td className="py-2 pr-3 text-ink">{facility ? shortName(facility.name) : "—"}</td>
                            <td className="py-2 pr-3 text-ink">
                              {room.room_name} <span className="text-plum/60">({room.room_code})</span>
                            </td>
                            <td className="py-2 pr-3 tabular-nums text-ink">{bed.bed_number}</td>
                            <td className="py-2 pr-3 text-plum/70">{facilityAddress(facility) || "—"}</td>
                            <td className="py-2 pr-3"><StatusBadge status={bed.status} /></td>
                            <td className="py-2 text-plum/80">{STATUS[bed.status].label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {canEdit && (
            <section className="rounded-xl border border-plum/10 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-plum/10 px-4 py-3">
                <h2 className="font-serif text-lg text-plum-dark">Rooms</h2>
                <button onClick={() => openAddRoom()} disabled={facilities.length === 0} className={darkButton}>+ Add Room</button>
              </div>
              {visibleRooms.length === 0 ? (
                <p className="p-4 text-sm text-plum/60">No rooms yet. Click + Add Room to create one, then add its beds.</p>
              ) : (
                <ul>
                  {visibleRooms.map((room) => (
                    <RoomRow key={room.id} room={room} facility={facilityById.get(room.facility_id)}
                      beds={bedsByRoom.get(room.id) ?? []} expanded={expanded.has(room.id)} busy={busy}
                      onToggle={() => toggleRoom(room.id)}
                      onEdit={() => { setMessage(null); setRoomDialog({ room, facilityId: room.facility_id }); }}
                      onDelete={() => deleteRoom(room)}
                      onAddBed={(status) => addBed(room, status)}
                      onEditBed={(bed) => { setMessage(null); setEditingBed(bed); }}
                      onDeleteBed={deleteBed} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {canEdit && (deletedRooms.length > 0 || deletedBeds.length > 0) && (
            <details className="rounded-xl border border-plum/10 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm text-plum/80">
                Recently deleted ({deletedRooms.length + deletedBeds.length})
              </summary>
              <ul className="border-t border-plum/10">
                {deletedRooms.map((room) => (
                  <li key={room.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-plum/10 px-4 py-2 text-sm first:border-t-0">
                    <span>
                      <span className="text-ink">Room {room.room_name}</span>{" "}
                      <span className="text-plum/60">
                        ({room.room_code}) · {shortName(facilityById.get(room.facility_id)?.name ?? "")} · deleted{" "}
                        {new Date(room.deleted_at!).toLocaleString()}
                      </span>
                    </span>
                    <button onClick={() => restoreRoom(room)} disabled={busy} className={`${lightButton} flex items-center gap-1.5`}>
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </button>
                  </li>
                ))}
                {deletedBeds.map((bed) => (
                  <li key={bed.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-plum/10 px-4 py-2 text-sm first:border-t-0">
                    <span>
                      <span className="text-ink">Bed #{bed.bed_number}</span>{" "}
                      <span className="text-plum/60">
                        in {roomById.get(bed.room_id)?.room_name} · deleted {new Date(bed.deleted_at!).toLocaleString()}
                      </span>
                    </span>
                    <button onClick={() => restoreBed(bed)} disabled={busy} className={`${lightButton} flex items-center gap-1.5`}>
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {addingLocation && (
        <AddLocationModal
          existing={facilities}
          onClose={() => setAddingLocation(false)}
          onAdded={(facility) => {
            setFacilities((prev) => [...prev, facility]);
            setAddingLocation(false);
            notify(`Added ${facility.name}. It's now on the Hospitals Map — add its rooms next.`);
            openAddRoom(facility.id); // straight into rooms for the new location
          }}
        />
      )}

      {roomDialog && (
        <RoomDialog
          room={roomDialog.room}
          initialFacilityId={roomDialog.facilityId}
          facilities={facilities}
          rooms={activeRooms}
          onClose={() => setRoomDialog(null)}
          onSaved={(saved, mode) => {
            if (mode === "unchanged") {
              notify("Room details are unchanged.");
              setRoomDialog(null);
              return;
            }
            setRooms((prev) => (mode === "added" ? [...prev, saved] : prev.map((r) => (r.id === saved.id ? saved : r))));
            if (mode === "added") {
              setExpanded((prev) => new Set(prev).add(saved.id));
              notify(`Added ${saved.room_name}. Open it below to add beds.`);
            } else {
              notify("Room updated.");
              setRoomDialog(null);
            }
          }}
        />
      )}

      {editingBed && (
        <BedDialog
          bed={editingBed}
          onClose={() => setEditingBed(null)}
          onSaved={(saved, previous) => {
            setBeds((prev) => prev.map((b) => (b.id === saved.id ? saved : b)));
            notify(`Bed #${saved.bed_number}: ${STATUS[previous].badge} → ${STATUS[saved.status].badge}.`);
            setEditingBed(null);
          }}
        />
      )}
    </div>
  );
}
