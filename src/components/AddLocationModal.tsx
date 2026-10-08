import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { geocodeAddress } from "../lib/geo";
import type { Facility } from "../lib/types";

const inputClass =
  "w-full rounded-lg border border-plum/20 px-3 py-2 text-sm text-ink focus:border-plum focus:outline-none focus:ring-2 focus:ring-plum/20";

interface FormState {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: Facility["status"];
  coverage_area: string;
  features: string;
  latitude: string;
  longitude: string;
}

const EMPTY: FormState = {
  name: "Angels Oasis — ",
  address: "",
  city: "",
  state: "CA",
  zip: "",
  status: "open",
  coverage_area: "",
  features: "",
  latitude: "",
  longitude: "",
};

// Adds an Angels Oasis location. Its address is placed on the map before
// saving, so the location immediately works as a Hospitals Map search center.
export default function AddLocationModal({ existing, onClose, onAdded }: {
  existing: Facility[];
  onClose: () => void;
  onAdded: (facility: Facility) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [manualPosition, setManualPosition] = useState(false);
  const [saving, setSaving] = useState<null | "locating" | "saving">(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const name = form.name.trim();
    if (!name || name === EMPTY.name.trim()) return setError("Enter the location's name.");
    if (existing.some((f) => f.name.trim().toLowerCase() === name.toLowerCase())) {
      return setError(`A location named "${name}" already exists.`);
    }
    if (!form.city.trim() || !form.state.trim()) return setError("City and state are required.");

    let latitude: number;
    let longitude: number;
    if (manualPosition) {
      latitude = Number(form.latitude);
      longitude = Number(form.longitude);
      if (!form.latitude.trim() || !form.longitude.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)
        || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return setError("Enter a valid latitude (−90 to 90) and longitude (−180 to 180).");
      }
    } else {
      setSaving("locating");
      const fullAddress = [form.address, form.city, `${form.state} ${form.zip}`.trim()]
        .map((part) => part.trim()).filter(Boolean).join(", ");
      const found = await geocodeAddress(fullAddress).catch(() => null);
      if (!found) {
        setSaving(null);
        setManualPosition(true);
        return setError(
          "Couldn't find this address on the map. Check the address, or enter the map position (latitude/longitude) below."
        );
      }
      ({ latitude, longitude } = found);
    }

    setSaving("saving");
    const { data, error: insertError } = await supabase
      .from("facilities")
      .insert({
        name,
        address: form.address.trim() || null,
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        zip: form.zip.trim() || null,
        latitude,
        longitude,
        coverage_area: form.coverage_area.trim() || null,
        features: form.features.split(",").map((f) => f.trim()).filter(Boolean),
        status: form.status,
      })
      .select()
      .single();
    setSaving(null);

    if (insertError) {
      return setError(
        insertError.code === "42501"
          ? "Your account doesn't have permission to add locations (or migration 0006 hasn't been run in Supabase yet)."
          : insertError.message
      );
    }
    onAdded(data as Facility);
  }

  const field = (key: keyof FormState, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`location-${key}`} className="mb-1 block text-sm text-plum/80">{label}</label>
      <input id={`location-${key}`} className={inputClass} value={form[key]}
        onChange={(e) => set(key, e.target.value as FormState[typeof key])} {...props} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-location-title"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-plum/10 px-6 py-4">
          <h2 id="add-location-title" className="font-sans text-lg font-semibold text-ink">Add Location</h2>
          <button onClick={onClose} disabled={!!saving} aria-label="Close"
            className="rounded-lg border border-plum/20 p-1.5 text-ink transition hover:bg-plum/5 focus:outline-none focus:ring-2 focus:ring-plum">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            <div>
              <label htmlFor="location-name" className="mb-1 block text-sm text-plum/80">Location Name</label>
              <input id="location-name" ref={nameRef} required className={inputClass} value={form.name}
                onChange={(e) => set("name", e.target.value)} />
            </div>
            {field("address", "Street Address", { placeholder: "e.g., 12018 Sarah St.", autoComplete: "street-address" })}
            <div className="grid grid-cols-[1fr_5rem_7rem] gap-3">
              {field("city", "City", { required: true, autoComplete: "address-level2" })}
              {field("state", "State", { required: true, maxLength: 2, autoComplete: "address-level1" })}
              {field("zip", "ZIP", { inputMode: "numeric", autoComplete: "postal-code" })}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="location-status" className="mb-1 block text-sm text-plum/80">Status</label>
                <select id="location-status" className={inputClass} value={form.status}
                  onChange={(e) => set("status", e.target.value as Facility["status"])}>
                  <option value="open">Open</option>
                  <option value="coming_soon">Coming soon</option>
                </select>
              </div>
              {field("coverage_area", "Coverage Area", { placeholder: "e.g., Riverside County, Inland Empire" })}
            </div>
            {field("features", "Features (comma-separated)", { placeholder: "e.g., 6 private rooms, 24-hour care" })}

            {manualPosition ? (
              <div className="grid grid-cols-2 gap-3">
                {field("latitude", "Latitude", { inputMode: "decimal", placeholder: "34.1614" })}
                {field("longitude", "Longitude", { inputMode: "decimal", placeholder: "-118.3942" })}
                <button type="button" className="col-span-2 justify-self-start text-xs text-plum underline"
                  onClick={() => { setManualPosition(false); setError(null); }}>
                  Find the map position from the address instead
                </button>
              </div>
            ) : (
              <p className="text-xs text-plum/60">
                The address is placed on the map automatically, so this location appears on the Hospitals Map as soon
                as it's saved.
              </p>
            )}

            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          </div>

          <div className="flex justify-end gap-3 border-t border-plum/10 px-6 py-4">
            <button type="submit" disabled={!!saving}
              className="rounded-full bg-plum px-5 py-2 text-sm font-semibold text-white transition hover:bg-plum-dark focus:outline-none focus:ring-2 focus:ring-plum focus:ring-offset-2 disabled:opacity-50">
              {saving === "locating" ? "Finding on map…" : saving === "saving" ? "Saving…" : "Add Location"}
            </button>
            <button type="button" onClick={onClose} disabled={!!saving}
              className="rounded-full border border-plum/20 px-5 py-2 text-sm text-ink transition hover:bg-plum/5">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
