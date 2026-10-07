import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { supabase } from "../../lib/supabaseClient";
import {
  milesBetween,
  leadLocationFields,
  nearestFacility,
  reverseGeocode,
  NOMINATIM_DELAY_MS,
} from "../../lib/geo";
import {
  findMatchingLead,
  getIntegrationStatus,
  searchCdph,
  searchGoogle,
  searchOverpass,
  PROVIDER_LABEL,
  type Candidate,
  type DiscoveryProvider,
} from "../../lib/discovery";
import { LEAD_CATEGORIES, type Facility, type Lead, type LeadCategory } from "../../lib/types";

const RADII = [5, 10, 25, 50] as const;
const MAX_RADIUS = 100;
const DEFAULT_CENTER: [number, number] = [34.1614, -118.3942];

// Marker groups: red hospitals, purple SNFs, teal rehab centers / partners.
type Group = "hospital" | "snf" | "rehab" | "partner";

const GROUPS: { id: Group; label: string; color: string }[] = [
  { id: "hospital", label: "Hospitals", color: "#DC2626" },
  { id: "snf", label: "Skilled Nursing", color: "#7C3AED" },
  { id: "rehab", label: "Rehab Centers", color: "#0D9488" },
  { id: "partner", label: "Hospice, Home Health & Clinics", color: "#2DD4BF" },
];

const GROUP_COLOR = Object.fromEntries(GROUPS.map((g) => [g.id, g.color])) as Record<Group, string>;

function groupOf(category: LeadCategory): Group {
  if (category === "hospital") return "hospital";
  if (category === "skilled_nursing_facility") return "snf";
  if (category === "rehab_center") return "rehab";
  return "partner";
}

const categoryLabel = (c: LeadCategory) => LEAD_CATEGORIES.find((x) => x.value === c)?.label ?? c;

// MapContainer only reads `center` on first render, so pan/zoom imperatively
// whenever the selected facility or radius changes.
function FitToRadius({ center, radiusMiles }: { center: [number, number]; radiusMiles: number }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(L.latLng(center).toBounds(radiusMiles * 1609.34 * 2), { padding: [16, 16] });
  }, [map, center, radiusMiles]);
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function hostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

interface OutreachEmail {
  id: string;
  subject: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  campaigns: { title: string } | null;
}

type Selection = { type: "lead"; id: string } | { type: "candidate"; key: string } | null;

export default function HospitalsMap() {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<string>("");
  const [radius, setRadius] = useState<number>(25);
  const [customRadius, setCustomRadius] = useState("");
  const [provider, setProvider] = useState<DiscoveryProvider>("cdph");
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  // Partners (thousands of hospices/home health agencies at larger radii) start hidden.
  const [visibleGroups, setVisibleGroups] = useState<Set<Group>>(new Set(["hospital", "snf", "rehab"]));
  const [selection, setSelection] = useState<Selection>(null);
  const [enriched, setEnriched] = useState<Record<string, { address: string | null; county: string | null }>>({});
  const [outreach, setOutreach] = useState<OutreachEmail[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  // Per facility+provider, the widest search done so far. A smaller radius is
  // served by filtering it instead of querying again.
  const searchCache = useRef(new Map<string, { radius: number; candidates: Candidate[]; usedFallback: boolean }>());
  const lookedUp = useRef(new Set<string>());

  async function loadLeads() {
    const { data } = await supabase.from("leads").select("*");
    setLeads((data as Lead[]) ?? []);
  }

  useEffect(() => {
    async function load() {
      const { data: facilityRows } = await supabase.from("facilities").select("*");
      // Open facilities first so the flagship is the default selection.
      const allFacilities = ((facilityRows as Facility[]) ?? []).sort(
        (a, b) => Number(a.status !== "open") - Number(b.status !== "open")
      );
      setFacilities(allFacilities);
      setSelectedFacility(allFacilities[0]?.id ?? "");
    }
    load();
    loadLeads();
    getIntegrationStatus().then((status) => setGoogleAvailable(Boolean(status?.keys.google_places_api_key?.configured)));
  }, []);

  const center = useMemo<[number, number]>(() => {
    const f = facilities.find((f) => f.id === selectedFacility);
    return f && f.latitude != null && f.longitude != null ? [f.latitude, f.longitude] : DEFAULT_CENTER;
  }, [facilities, selectedFacility]);

  // Search whenever the facility, radius, or provider changes (debounced so
  // clicking through radius buttons doesn't fire a query per click).
  useEffect(() => {
    if (!selectedFacility) return;
    const cacheKey = `${provider}:${selectedFacility}`;
    const cached = searchCache.current.get(cacheKey);
    if (cached && cached.radius >= radius) {
      setCandidates(cached.candidates);
      setSearchError(null);
      setSearchNotice(cached.usedFallback
        ? "California licensed-facility search is unavailable; showing OpenStreetMap results instead."
        : null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      setSearchNotice(null);
      let usedFallback = false;
      try {
        let results: Candidate[];
        if (provider === "google") {
          results = await searchGoogle(selectedFacility, radius);
        } else if (provider === "osm") {
          results = await searchOverpass(center[0], center[1], radius);
        } else {
          try {
            results = await searchCdph(center[0], center[1], radius);
          } catch {
            results = await searchOverpass(center[0], center[1], radius);
            usedFallback = true;
            if (!cancelled) {
              setSearchNotice(
                "California licensed-facility search is unavailable; showing OpenStreetMap results instead."
              );
            }
          }
        }
        searchCache.current.set(cacheKey, { radius, candidates: results, usedFallback });
        if (!cancelled) setCandidates(results);
      } catch (err) {
        if (!cancelled) {
          setCandidates([]);
          setSearchError(
            err instanceof Error
              ? err.message
              : "Facility search failed unexpectedly. Please try Refresh."
          );
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedFacility, radius, provider, center, refreshToken]);

  const inRadius = (lat: number, lng: number) => milesBetween(center[0], center[1], lat, lng) <= radius;

  const visibleLeads = useMemo(
    () =>
      leads.filter(
        (l) =>
          l.latitude != null &&
          l.longitude != null &&
          inRadius(l.latitude, l.longitude) &&
          visibleGroups.has(groupOf(l.category))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, center, radius, visibleGroups]
  );

  // Candidates that aren't already leads (those show as lead markers instead).
  const newCandidates = useMemo(
    () =>
      candidates.filter(
        (c) => inRadius(c.latitude, c.longitude) && !findMatchingLead(c, leads)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [candidates, leads, center, radius]
  );

  const shownCandidates = newCandidates.filter((c) => visibleGroups.has(groupOf(c.category)));

  const groupCounts = useMemo(() => {
    const counts: Record<Group, number> = { hospital: 0, snf: 0, rehab: 0, partner: 0 };
    for (const c of newCandidates) counts[groupOf(c.category)]++;
    return counts;
  }, [newCandidates]);

  const unlocatedLeads = useMemo(
    () => leads.filter((l) => (l.latitude == null || l.longitude == null) && l.address?.trim()),
    [leads]
  );

  const selectedLead = selection?.type === "lead" ? leads.find((l) => l.id === selection.id) ?? null : null;
  const selectedCandidateRaw =
    selection?.type === "candidate" ? candidates.find((c) => c.key === selection.key) ?? null : null;
  const selectedCandidate = selectedCandidateRaw
    ? {
        ...selectedCandidateRaw,
        address: selectedCandidateRaw.address ?? enriched[selectedCandidateRaw.key]?.address ?? null,
        county: selectedCandidateRaw.county ?? enriched[selectedCandidateRaw.key]?.county ?? null,
      }
    : null;

  // Fill in address/county for an opened candidate (OSM rarely has county).
  useEffect(() => {
    const c = selectedCandidateRaw;
    if (!c || (c.address && c.county) || lookedUp.current.has(c.key)) return;
    lookedUp.current.add(c.key);
    reverseGeocode(c.latitude, c.longitude)
      .catch(() => null)
      .then((result) => setEnriched((prev) => ({ ...prev, [c.key]: result ?? { address: null, county: null } })));
  }, [selectedCandidateRaw]);

  // Outreach history for an opened lead.
  useEffect(() => {
    if (!selectedLead) return;
    setOutreach(null);
    supabase
      .from("emails")
      .select("id, subject, status, sent_at, created_at, campaigns(title)")
      .eq("lead_id", selectedLead.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setOutreach((data as unknown as OutreachEmail[]) ?? []));
  }, [selectedLead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyCustomRadius() {
    const value = Number(customRadius);
    if (value > 0) setRadius(Math.min(Math.round(value * 10) / 10, MAX_RADIUS));
  }

  function toggleGroup(group: Group) {
    setVisibleGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  async function addAsLead(candidate: Candidate) {
    setAdding(true);
    setMessage(null);

    const existing = findMatchingLead(candidate, leads);
    if (existing) {
      setAdding(false);
      setSelection({ type: "lead", id: existing.id });
      setMessage({ text: `${existing.facility_name} is already in Leads.` });
      return;
    }

    const nearest = nearestFacility(facilities, candidate.latitude, candidate.longitude);
    const { data, error } = await supabase
      .from("leads")
      .insert({
        facility_name: candidate.name,
        address: candidate.address,
        county: candidate.county,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        phone: candidate.phone,
        website: candidate.website,
        category: candidate.category,
        place_id: candidate.key,
        nearest_facility_id: nearest?.facility.id ?? null,
        distance_miles: nearest ? Math.round(nearest.miles * 100) / 100 : null,
        status: "new",
        source: "map_discovery",
      })
      .select()
      .single();
    setAdding(false);

    if (error) {
      setMessage({
        text: error.code === "23505" ? `${candidate.name} is already in Leads.` : error.message,
        isError: error.code !== "23505",
      });
      if (error.code === "23505") loadLeads();
      return;
    }
    const lead = data as Lead;
    setLeads((prev) => [lead, ...prev]);
    setSelection({ type: "lead", id: lead.id });
    setMessage({ text: `Added ${lead.facility_name} to Leads.` });
  }

  async function locateLeads() {
    setLocating(true);
    setMessage(null);
    let located = 0;
    for (const [i, lead] of unlocatedLeads.entries()) {
      setMessage({ text: `Locating ${i + 1} of ${unlocatedLeads.length}…` });
      const fields = await leadLocationFields(lead.address, lead.county, facilities).catch(() => null);
      if (fields) {
        await supabase.from("leads").update(fields).eq("id", lead.id);
        located++;
      }
      if (i < unlocatedLeads.length - 1) await sleep(NOMINATIM_DELAY_MS);
    }
    setLocating(false);
    const missed = unlocatedLeads.length - located;
    setMessage({
      text: `Located ${located} lead${located === 1 ? "" : "s"}.${missed ? ` ${missed} address${missed === 1 ? "" : "es"} couldn't be found — check them on the Leads page.` : ""}`,
      isError: missed > 0 && located === 0,
    });
    loadLeads();
  }

  const isPreset = (RADII as readonly number[]).includes(radius);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Hospitals Map</h1>
          <p className="mt-1 text-plum/60">Nearby hospitals, SNFs, rehab centers, and healthcare partners.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select className="rounded-lg border border-plum/20 px-3 py-2 text-sm"
            value={selectedFacility} onChange={(e) => { setSelectedFacility(e.target.value); setSelection(null); }}>
            {facilities.map((f) => (
              <option key={f.id} value={f.id}>{f.name}{f.status === "coming_soon" ? " (coming soon)" : ""}</option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-lg border border-plum/20">
            {RADII.map((r) => (
              <button key={r} onClick={() => { setRadius(r); setCustomRadius(""); }}
                className={`px-3 py-2 text-sm ${radius === r ? "bg-plum text-white" : "bg-white text-plum"}`}>
                {r} mi
              </button>
            ))}
            <input
              type="number" min={1} max={MAX_RADIUS} step="any" placeholder="Custom"
              aria-label="Custom radius in miles"
              className={`w-20 border-l border-plum/20 px-2 py-2 text-sm outline-none ${!isPreset ? "bg-plum text-white placeholder:text-white/70" : ""}`}
              value={customRadius}
              onChange={(e) => setCustomRadius(e.target.value)}
              onBlur={applyCustomRadius}
              onKeyDown={(e) => e.key === "Enter" && applyCustomRadius()}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        {GROUPS.map((g) => (
          <label key={g.id} className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={visibleGroups.has(g.id)} onChange={() => toggleGroup(g.id)} />
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: g.color }} />
            {g.label} <span className="text-plum/40">({groupCounts[g.id]})</span>
          </label>
        ))}
        <span className="flex items-center gap-1.5 text-plum/60">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-black bg-plum/30" /> Already a lead
        </span>
        <span className="ml-auto flex items-center gap-2">
          <select className="rounded-lg border border-plum/20 px-2 py-1 text-sm"
            value={provider} onChange={(e) => setProvider(e.target.value as DiscoveryProvider)}>
            <option value="cdph">{PROVIDER_LABEL.cdph} — free</option>
            <option value="osm">{PROVIDER_LABEL.osm} — free, slower</option>
            <option value="google" disabled={!googleAvailable}>
              Google Places{googleAvailable ? "" : " — add key in Settings"}
            </option>
          </select>
          <button className="text-plum underline disabled:opacity-50" disabled={searching}
            onClick={() => { searchCache.current.delete(`${provider}:${selectedFacility}`); setRefreshToken((t) => t + 1); }}>
            Refresh
          </button>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {searching && (
          <p className="text-plum/70">
            Searching {PROVIDER_LABEL[provider]} within {radius} mi…
            {provider === "osm" && " (public OpenStreetMap servers can take a minute or more)"}
          </p>
        )}
        {!searching && searchError && <p className="text-red-600">{searchError}</p>}
        {!searching && !searchError && (
          <p className="text-plum/70">
            {newCandidates.length} new facilit{newCandidates.length === 1 ? "y" : "ies"} found · {visibleLeads.length} existing
            lead{visibleLeads.length === 1 ? "" : "s"} within {radius} mi
          </p>
        )}
        {!searching && !searchError && searchNotice && (
          <p role="status" className="text-amber-700">{searchNotice}</p>
        )}
        {message && <p className={message.isError ? "text-red-600" : "text-plum"}>{message.text}</p>}
        {unlocatedLeads.length > 0 && !locating && (
          <button className="text-plum underline" onClick={locateLeads}>
            {unlocatedLeads.length} lead{unlocatedLeads.length === 1 ? " has" : "s have"} an address but no map
            location — locate {unlocatedLeads.length === 1 ? "it" : "them"}
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 h-[560px] overflow-hidden rounded-2xl border border-plum/10">
          <MapContainer center={center} zoom={9} preferCanvas style={{ height: "100%", width: "100%" }}>
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitToRadius center={center} radiusMiles={radius} />
            <Circle center={center} radius={radius * 1609.34}
              pathOptions={{ color: "#4A1D3D", fillOpacity: 0.05 }} />
            <CircleMarker center={center} radius={9}
              pathOptions={{ color: "#fff", weight: 3, fillColor: "#4A1D3D", fillOpacity: 1 }}>
              <Tooltip>{facilities.find((f) => f.id === selectedFacility)?.name ?? "Angels Oasis"}</Tooltip>
            </CircleMarker>
            {shownCandidates.map((c) => (
              <CircleMarker
                key={c.key}
                center={[c.latitude, c.longitude]}
                radius={selection?.type === "candidate" && selection.key === c.key ? 9 : 6}
                pathOptions={{ color: "#fff", weight: 1.5, fillColor: GROUP_COLOR[groupOf(c.category)], fillOpacity: 0.9 }}
                eventHandlers={{ click: () => { setSelection({ type: "candidate", key: c.key }); setMessage(null); } }}
              >
                <Tooltip>{c.name}</Tooltip>
              </CircleMarker>
            ))}
            {visibleLeads.map((lead) => (
              <CircleMarker
                key={lead.id}
                center={[lead.latitude!, lead.longitude!]}
                radius={selection?.type === "lead" && selection.id === lead.id ? 10 : 8}
                pathOptions={{ color: "#0A0A0A", weight: 2.5, fillColor: GROUP_COLOR[groupOf(lead.category)], fillOpacity: 1 }}
                eventHandlers={{ click: () => { setSelection({ type: "lead", id: lead.id }); setMessage(null); } }}
              >
                <Tooltip>{lead.facility_name} (lead)</Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <div className="card">
          <h2 className="font-serif text-xl">Facility details</h2>
          {!selection && (
            <p className="mt-3 text-sm text-plum/60">
              Click a marker to see facility details. Facilities that aren't leads yet can be added with one click.
            </p>
          )}

          {selectedCandidate && (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-semibold">{selectedCandidate.name}</p>
              <p className="text-plum/60">
                {selectedCandidate.address ?? (enriched[selectedCandidate.key] ? "Address unknown" : "Looking up address…")}
              </p>
              <p className="text-plum/60">
                {categoryLabel(selectedCandidate.category)}
                {selectedCandidate.county ? ` · ${selectedCandidate.county}` : ""}
              </p>
              {selectedCandidate.detail && <p className="text-plum/60">{selectedCandidate.detail}</p>}
              <p className="text-plum/60">
                {milesBetween(center[0], center[1], selectedCandidate.latitude, selectedCandidate.longitude).toFixed(1)} mi
                from selected facility
              </p>
              <hr className="my-2 border-plum/10" />
              <p><span className="text-plum/50">Phone:</span> {selectedCandidate.phone || "—"}</p>
              <p>
                <span className="text-plum/50">Website:</span>{" "}
                {selectedCandidate.website
                  ? <a href={selectedCandidate.website} target="_blank" rel="noreferrer" className="underline">{hostname(selectedCandidate.website)}</a>
                  : "—"}
              </p>
              <p className="text-xs text-plum/40">
                Source: {PROVIDER_LABEL[selectedCandidate.provider]} · not yet a lead, so no
                contact or outreach history.
              </p>
              <button className="btn-primary mt-2 w-full" disabled={adding} onClick={() => addAsLead(selectedCandidate)}>
                {adding ? "Adding…" : "+ Add as Lead"}
              </button>
            </div>
          )}

          {selectedLead && (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-semibold">{selectedLead.facility_name}</p>
              <p className="text-plum/60">{selectedLead.address}</p>
              <p className="text-plum/60">
                {categoryLabel(selectedLead.category)}
                {selectedLead.county ? ` · ${selectedLead.county}` : ""}
              </p>
              {selectedLead.latitude != null && selectedLead.longitude != null && (
                <p className="text-plum/60">
                  {milesBetween(center[0], center[1], selectedLead.latitude, selectedLead.longitude).toFixed(1)} mi from
                  selected facility
                </p>
              )}
              <hr className="my-2 border-plum/10" />
              <p><span className="text-plum/50">Contact:</span> {selectedLead.contact_person || "—"}</p>
              <p><span className="text-plum/50">Email:</span> {selectedLead.email || "—"}</p>
              <p><span className="text-plum/50">Phone:</span> {selectedLead.phone || "—"}</p>
              <p>
                <span className="text-plum/50">Website:</span>{" "}
                {selectedLead.website
                  ? <a href={selectedLead.website} target="_blank" rel="noreferrer" className="underline">{hostname(selectedLead.website)}</a>
                  : "—"}
              </p>
              <p className="capitalize"><span className="text-plum/50">Status:</span> {selectedLead.status.replaceAll("_", " ")}</p>
              <p className="capitalize"><span className="text-plum/50">Source:</span> {selectedLead.source.replaceAll("_", " ")}</p>

              <hr className="my-2 border-plum/10" />
              <p className="font-semibold">Outreach history</p>
              {outreach === null && <p className="text-plum/50">Loading…</p>}
              {outreach?.length === 0 && <p className="text-plum/50">No emails sent to this lead yet.</p>}
              {outreach && outreach.length > 0 && (
                <ul className="space-y-1.5">
                  {outreach.map((e) => (
                    <li key={e.id} className="flex items-start justify-between gap-2">
                      <span>
                        {e.campaigns?.title ?? e.subject ?? "Email"}
                        <span className="block text-xs text-plum/50">
                          {new Date(e.sent_at ?? e.created_at).toLocaleDateString()}
                        </span>
                      </span>
                      <span className="rounded-full bg-plum/10 px-2 py-0.5 text-xs capitalize">{e.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}