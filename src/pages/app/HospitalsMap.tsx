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
  findContactInfo,
  findMatchingLead,
  getIntegrationStatus,
  searchCdph,
  searchGoogle,
  searchOsint,
  searchOverpass,
  mergeCandidates,
  CONTACT_SOURCE_LABEL,
  PROVIDER_LABEL,
  SEARCH_MODE_LABEL,
  type Candidate,
  type ContactInfo,
  type ContactSource,
  type SearchMode,
} from "../../lib/discovery";
import {
  LEAD_CATEGORIES,
  type Facility,
  type FacilityBedAvailability,
  type Lead,
  type LeadCategory,
} from "../../lib/types";

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

// Contact legend: each marker shows the best way to reach the facility.
type ContactLevel = "email" | "phone" | "website" | "none";
type ColorBy = "type" | "contact";

const CONTACT_GROUPS: { id: ContactLevel; label: string; color: string }[] = [
  { id: "email", label: "Has email", color: "#16A34A" },
  { id: "phone", label: "Contact number (no email)", color: "#2563EB" },
  { id: "website", label: "Website only", color: "#F59E0B" },
  { id: "none", label: "No contact info yet", color: "#9CA3AF" },
];

const CONTACT_COLOR = Object.fromEntries(CONTACT_GROUPS.map((g) => [g.id, g.color])) as Record<ContactLevel, string>;

function contactLevel(c: { email?: string | null; phone?: string | null; website?: string | null }): ContactLevel {
  if (c.email) return "email";
  if (c.phone) return "phone";
  if (c.website) return "website";
  return "none";
}

type ContactLookup =
  | { status: "loading" }
  | { status: "done"; info: ContactInfo }
  | { status: "error"; error: string };

// v2: results now include people and web-search status.
const CONTACT_CACHE_KEY = "hospitalsMap.contacts.v2";
const BATCH_SIZE = 50;

function loadContactCache(): Record<string, ContactLookup> {
  try {
    const saved = JSON.parse(localStorage.getItem(CONTACT_CACHE_KEY) ?? "{}") as Record<string, ContactInfo>;
    return Object.fromEntries(Object.entries(saved).map(([key, info]) => [key, { status: "done", info }]));
  } catch {
    return {};
  }
}

function saveContactCache(lookups: Record<string, ContactLookup>) {
  try {
    const done = Object.entries(lookups).flatMap(([key, lookup]) =>
      lookup.status === "done" && !key.startsWith("lead:") ? [[key, lookup.info] as const] : []
    );
    localStorage.setItem(CONTACT_CACHE_KEY, JSON.stringify(Object.fromEntries(done)));
  } catch {
    // Storage unavailable (private mode, quota) — results just won't persist.
  }
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

function ContactRow({ label, level, value, source, href }: {
  label: string;
  level: ContactLevel;
  value: string | null;
  source: string | null;
  href?: string;
}) {
  return (
    <p className="flex items-start gap-1.5">
      <span className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CONTACT_COLOR[level] }} />
      <span className="min-w-0">
        <span className="text-plum/50">{label}:</span>{" "}
        {value
          ? href
            ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="break-all underline">{value}</a>
            : value
          : "—"}
        {value && source && <span className="block text-xs text-plum/40">{source}</span>}
      </span>
    </p>
  );
}

function ContactDetails({ phone, email, website, lookup, givenSource, onRescan }: {
  phone: string | null;
  email: string | null;
  website: string | null;
  lookup: ContactLookup | undefined;
  givenSource: string;
  onRescan: () => void;
}) {
  const info = lookup?.status === "done" ? lookup.info : null;
  const sourceOf = (field: "phone" | "email" | "website", value: string | null) => {
    const source: ContactSource | null | undefined = info?.sources[field];
    if (!value) return null;
    if (info && value === info[field] && source && source !== "given") return CONTACT_SOURCE_LABEL[source];
    return `from ${givenSource}`;
  };
  const otherEmails = info?.emails.filter((e) => e !== email) ?? [];
  const otherPhones = info?.phones.filter((p) => p !== phone) ?? [];

  return (
    <div className="space-y-1.5">
      <ContactRow label="Contact number" level="phone" value={phone} source={sourceOf("phone", phone)}
        href={phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : undefined} />
      <ContactRow label="Email" level="email" value={email} source={sourceOf("email", email)}
        href={email ? `mailto:${email}` : undefined} />
      <ContactRow label="Website" level="website" value={website ? hostname(website) : null}
        source={sourceOf("website", website)} href={website ?? undefined} />

      {info && (info.people ?? []).length > 0 && (
        <div className="text-xs">
          <p className="text-plum/50">People found:</p>
          <ul className="mt-0.5 space-y-0.5">
            {info.people.map((person) => (
              <li key={person.name}>
                <span className="text-ink">{person.name}</span>
                <span className="text-plum/60"> — {person.title}</span>
                <span className="text-plum/40">
                  {" · "}
                  {person.url
                    ? <a href={person.url} target="_blank" rel="noreferrer" className="underline">LinkedIn search result</a>
                    : "on their website"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(otherEmails.length > 0 || otherPhones.length > 0) && (
        <details className="text-xs text-plum/60">
          <summary className="cursor-pointer">Other contacts found on the website</summary>
          <ul className="mt-1 space-y-0.5 pl-3">
            {otherEmails.map((e) => <li key={e}><a className="underline" href={`mailto:${e}`}>{e}</a></li>)}
            {otherPhones.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </details>
      )}

      <p className="text-xs text-plum/50">
        {lookup?.status === "loading" && "Finding website and scanning it for contact info…"}
        {lookup?.status === "error" && <span className="text-red-600">{lookup.error} </span>}
        {info && !info.website && "No website found for this facility. "}
        {info?.scanError && <span className="text-amber-700">{info.scanError} </span>}
        {info?.webSearch && !info.webSearch.ran && info.webSearch.note && (
          <span className="text-plum/40">{info.webSearch.note} </span>
        )}
        {info?.scanned && !info.email && !info.scanError && (info.emails.length
          ? "Only department addresses (billing, media, etc.) were found on its website. "
          : "No email address listed on its website. ")}
        {lookup && lookup.status !== "loading" && (
          <button className="underline" onClick={onRescan}>Scan again</button>
        )}
      </p>
    </div>
  );
}

function bedSummary(beds: FacilityBedAvailability | undefined, facility: Facility) {
  if (!beds) return facility.status === "coming_soon" ? "Coming soon · bed counts not set" : "Bed counts not set";
  const open = beds.total_beds - beds.occupied_beds;
  const status = { open: "Open", closing_soon: "Closing soon", full: "Full" }[beds.availability_status];
  return `${status} · ${open} of ${beds.total_beds} beds open · ${
    beds.accepting_referrals ? "Accepting referrals" : "Not accepting referrals"
  }`;
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
  const [bedAvailability, setBedAvailability] = useState<Record<string, FacilityBedAvailability>>({});
  const [selectedFacility, setSelectedFacility] = useState<string>("");
  const [radius, setRadius] = useState<number>(25);
  const [customRadius, setCustomRadius] = useState("");
  const [provider, setProvider] = useState<SearchMode>("all");
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
  const [colorBy, setColorBy] = useState<ColorBy>("type");
  const [visibleContacts, setVisibleContacts] = useState<Set<ContactLevel>>(
    new Set(["email", "phone", "website", "none"])
  );
  // Contact lookups by candidate key, or `lead:<id>` for existing leads.
  const [contacts, setContacts] = useState<Record<string, ContactLookup>>(loadContactCache);
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const contactRequests = useRef(new Map<string, Promise<ContactInfo | null>>());
  const cancelBatch = useRef(false);

  // Per facility+provider, the widest search done so far. A smaller radius is
  // served by filtering it instead of querying again.
  const searchCache = useRef(new Map<string, { radius: number; candidates: Candidate[]; notice: string | null }>());
  const lookedUp = useRef(new Set<string>());

  useEffect(() => saveContactCache(contacts), [contacts]);

  // Looks up a facility's website and scans it for email/phone. Concurrent
  // calls for the same key share one request.
  function lookupContacts(
    key: string,
    facility: Parameters<typeof findContactInfo>[0],
    force = false
  ): Promise<ContactInfo | null> {
    const pending = contactRequests.current.get(key);
    if (pending) return pending;
    const existing = contacts[key];
    if (!force && existing?.status === "done") return Promise.resolve(existing.info);

    setContacts((prev) => ({ ...prev, [key]: { status: "loading" } }));
    const request = findContactInfo(facility)
      .then((info) => {
        setContacts((prev) => ({ ...prev, [key]: { status: "done", info } }));
        return info;
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err.message : "Contact lookup failed.";
        setContacts((prev) => ({ ...prev, [key]: { status: "error", error } }));
        return null;
      })
      .finally(() => contactRequests.current.delete(key));
    contactRequests.current.set(key, request);
    return request;
  }

  function candidateContacts(c: Candidate) {
    const lookup = contacts[c.key];
    const info = lookup?.status === "done" ? lookup.info : null;
    return {
      phone: c.phone ?? info?.phone ?? null,
      email: info?.email ?? null,
      website: c.website ?? info?.website ?? null,
    };
  }

  // Saves newly found contact details onto a lead, never overwriting values
  // someone already entered.
  async function saveLeadContacts(lead: Lead, info: ContactInfo) {
    const updates: Partial<Pick<Lead, "phone" | "email" | "website" | "contact_person">> = {};
    if (!lead.phone && info.phone) updates.phone = info.phone;
    if (!lead.email && info.email) updates.email = info.email;
    if (!lead.website && info.website) updates.website = info.website;
    const people = info.people ?? [];
    if (!lead.contact_person && people[0]) updates.contact_person = `${people[0].name} (${people[0].title})`;

    let saved = 0;
    if (Object.keys(updates).length) {
      const { error } = await supabase.from("leads").update(updates).eq("id", lead.id);
      if (error) {
        setMessage({ text: `Couldn't save contact info for ${lead.facility_name}: ${error.message}`, isError: true });
        return 0;
      }
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, ...updates } : l)));
      saved += Object.keys(updates).length;
    }
    return saved + (await savePeople(lead.id, people));
  }

  // Adds people found online to the lead's Contacts, skipping names already there.
  async function savePeople(leadId: string, people: ContactInfo["people"]) {
    if (!people.length) return 0;
    const { data: existing } = await supabase.from("contacts").select("name").eq("lead_id", leadId);
    const known = new Set(((existing as { name: string }[]) ?? []).map((c) => c.name.trim().toLowerCase()));
    const rows = people
      .filter((person) => !known.has(person.name.toLowerCase()))
      .map((person) => ({ lead_id: leadId, name: person.name, title: person.title }));
    if (!rows.length) return 0;
    const { error } = await supabase.from("contacts").insert(rows);
    if (error) {
      setMessage({ text: `Couldn't save the people found to Contacts: ${error.message}`, isError: true });
      return 0;
    }
    return rows.length;
  }

  async function scanLead(lead: Lead, force = false) {
    if (lead.latitude == null || lead.longitude == null) return;
    const info = await lookupContacts(
      `lead:${lead.id}`,
      {
        name: lead.facility_name,
        address: lead.address,
        latitude: lead.latitude,
        longitude: lead.longitude,
        phone: lead.phone,
        website: lead.website,
      },
      force
    );
    if (!info) return;
    const saved = await saveLeadContacts(lead, info);
    if (saved) setMessage({ text: `Saved ${saved} new contact detail${saved === 1 ? "" : "s"} for ${lead.facility_name}.` });
  }

  async function loadLeads() {
    const { data } = await supabase.from("leads").select("*");
    setLeads((data as Lead[]) ?? []);
  }

  useEffect(() => {
    async function load() {
      const [{ data: facilityRows }, { data: bedRows }] = await Promise.all([
        supabase.from("facilities").select("*"),
        supabase.from("facility_bed_availability").select("*"),
      ]);
      // Open facilities first so the flagship is the default selection;
      // locations without a map position can't be a search center.
      const allFacilities = ((facilityRows as Facility[]) ?? []).sort(
        (a, b) =>
          Number(a.latitude == null) - Number(b.latitude == null) ||
          Number(a.status !== "open") - Number(b.status !== "open")
      );
      setFacilities(allFacilities);
      setSelectedFacility(allFacilities[0]?.id ?? "");
      setBedAvailability(
        Object.fromEntries(((bedRows as FacilityBedAvailability[]) ?? []).map((b) => [b.facility_id, b]))
      );
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
      setSearchNotice(cached.notice);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      setSearchNotice(null);
      setCandidates([]);
      let notice: string | null = null;
      try {
        let results: Candidate[];
        if (provider === "google") {
          results = await searchGoogle(selectedFacility, radius);
        } else if (provider === "osm") {
          results = await searchOverpass(center[0], center[1], radius);
        } else if (provider === "osint") {
          const found = await searchOsint(center[0], center[1], radius);
          results = found.candidates;
          notice = found.notes.length ? found.notes.join(" ") : null;
        } else if (provider === "cdph") {
          try {
            results = await searchCdph(center[0], center[1], radius);
          } catch {
            results = await searchOverpass(center[0], center[1], radius);
            notice = "California licensed-facility search is unavailable; showing OpenStreetMap results instead.";
          }
        } else {
          // All sources: show CDPH as soon as it's back, then merge in
          // OpenStreetMap and web search as each finishes. CDPH is passed
          // first so its official record wins when the same facility repeats.
          const parts: Partial<Record<"cdph" | "osm" | "osint", Candidate[]>> = {};
          const failures: string[] = [];
          const publish = () => {
            if (!cancelled) setCandidates(mergeCandidates([parts.cdph ?? [], parts.osm ?? [], parts.osint ?? []]));
          };
          const run = (source: "cdph" | "osm" | "osint", search: () => Promise<Candidate[]>) =>
            search().then(
              (found) => { parts[source] = found; publish(); },
              (err: unknown) => {
                failures.push(`${PROVIDER_LABEL[source]}: ${err instanceof Error ? err.message : "failed"}`);
              }
            );
          await Promise.all([
            run("cdph", () => searchCdph(center[0], center[1], radius)),
            run("osm", () => searchOverpass(center[0], center[1], radius)),
            run("osint", () => searchOsint(center[0], center[1], radius).then((found) => found.candidates)),
          ]);
          if (failures.length === 3) throw new Error(`Every source failed. ${failures.join(" · ")}`);
          results = mergeCandidates([parts.cdph ?? [], parts.osm ?? [], parts.osint ?? []]);
          notice = failures.length ? `Some sources were skipped — ${failures.join(" · ")}` : null;
        }
        searchCache.current.set(cacheKey, { radius, candidates: results, notice });
        if (!cancelled) {
          setCandidates(results);
          setSearchNotice(notice);
        }
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
          visibleGroups.has(groupOf(l.category)) &&
          visibleContacts.has(contactLevel(l))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, center, radius, visibleGroups, visibleContacts]
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

  const candidateLevels = useMemo(
    () => new Map(newCandidates.map((c) => [c.key, contactLevel(candidateContacts(c))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [newCandidates, contacts]
  );

  const shownCandidates = newCandidates.filter(
    (c) => visibleGroups.has(groupOf(c.category)) && visibleContacts.has(candidateLevels.get(c.key)!)
  );

  const groupCounts = useMemo(() => {
    const counts: Record<Group, number> = { hospital: 0, snf: 0, rehab: 0, partner: 0 };
    for (const c of newCandidates) counts[groupOf(c.category)]++;
    return counts;
  }, [newCandidates]);

  // Contact counts cover the facility types currently shown.
  const contactCounts = useMemo(() => {
    const counts: Record<ContactLevel, number> = { email: 0, phone: 0, website: 0, none: 0 };
    for (const c of newCandidates) {
      if (visibleGroups.has(groupOf(c.category))) counts[candidateLevels.get(c.key)!]++;
    }
    return counts;
  }, [newCandidates, candidateLevels, visibleGroups]);

  const unscannedShown = shownCandidates.filter((c) => !contacts[c.key]);

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

  // Find the website and scan it for email/phone as soon as a facility is opened.
  useEffect(() => {
    const c = selectedCandidateRaw;
    if (!c || contacts[c.key]) return;
    lookupContacts(c.key, c);
  }, [selectedCandidateRaw]); // eslint-disable-line react-hooks/exhaustive-deps

  // Existing leads missing a phone, email, or website get the same lookup once
  // per session; anything found is saved to the lead.
  const scannedLeads = useRef(new Set<string>());
  useEffect(() => {
    if (!selectedLead || scannedLeads.current.has(selectedLead.id)) return;
    if (selectedLead.phone && selectedLead.email && selectedLead.website) return;
    scannedLeads.current.add(selectedLead.id);
    scanLead(selectedLead);
  }, [selectedLead?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function findShownContacts() {
    const queue = unscannedShown.slice(0, BATCH_SIZE);
    const total = queue.length;
    cancelBatch.current = false;
    setBatch({ done: 0, total });
    setColorBy("contact");
    setMessage(null);
    let done = 0;
    // Two at a time: the OpenStreetMap lookup allows about one request per second.
    const worker = async () => {
      while (queue.length && !cancelBatch.current) {
        const c = queue.shift()!;
        await lookupContacts(c.key, c);
        setBatch({ done: ++done, total });
      }
    };
    await Promise.all([worker(), worker()]);
    setBatch(null);
  }

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

  function toggleContact(level: ContactLevel) {
    setVisibleContacts((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
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

    // Record the contact number, email, and website from the start: reuse the
    // lookup already made when the facility was opened, or run it now.
    const info = await lookupContacts(candidate.key, candidate);
    const nearest = nearestFacility(facilities, candidate.latitude, candidate.longitude);
    const { data, error } = await supabase
      .from("leads")
      .insert({
        facility_name: candidate.name,
        address: candidate.address,
        county: candidate.county,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
        phone: candidate.phone ?? info?.phone ?? null,
        email: info?.email ?? null,
        contact_person: info?.people?.[0] ? `${info.people[0].name} (${info.people[0].title})` : null,
        website: candidate.website ?? info?.website ?? null,
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
    scannedLeads.current.add(lead.id); // already looked up above
    setLeads((prev) => [lead, ...prev]);
    setSelection({ type: "lead", id: lead.id });
    const people = await savePeople(lead.id, info?.people ?? []);
    setMessage({
      text: `Added ${lead.facility_name} to Leads${people ? ` with ${people} contact${people === 1 ? "" : "s"} found online` : ""}.`,
    });
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
              <option key={f.id} value={f.id} disabled={f.latitude == null || f.longitude == null}>
                {f.name}{f.status === "coming_soon" ? " (coming soon)" : ""}
                {f.latitude == null || f.longitude == null ? " (no map location)" : ""}
              </option>
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
        <div className="flex items-center gap-2">
          <span className="text-plum/60">Color markers by</span>
          <div className="flex overflow-hidden rounded-lg border border-plum/20">
            {([["type", "Facility type"], ["contact", "Contact info"]] as const).map(([value, label]) => (
              <button key={value} onClick={() => setColorBy(value)}
                className={`px-3 py-1 text-sm ${colorBy === value ? "bg-plum text-white" : "bg-white text-plum"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-plum/60">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-black bg-plum/30" /> Already a lead
        </span>
        <span className="ml-auto flex items-center gap-2">
          <select className="rounded-lg border border-plum/20 px-2 py-1 text-sm"
            value={provider} onChange={(e) => setProvider(e.target.value as SearchMode)}>
            <option value="all">All sources combined (CDPH, OSM, OSINT)</option>
            <option value="cdph">California licensed facilities — free (CDPH)</option>
            <option value="osm">OpenStreetMap — free, slower (OSM)</option>
            <option value="osint">Web search — Tavily (OSINT)</option>
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

      <fieldset className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-plum/10 px-3 py-2 text-sm">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-plum/50">Facility type</legend>
        {GROUPS.map((g) => (
          <label key={g.id} className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={visibleGroups.has(g.id)} onChange={() => toggleGroup(g.id)} />
            <span className="inline-block h-3 w-3 rounded-full"
              style={{ background: colorBy === "type" ? g.color : "transparent", border: `2px solid ${g.color}` }} />
            {g.label} <span className="text-plum/40">({groupCounts[g.id]})</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-plum/10 px-3 py-2 text-sm">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-plum/50">Contact info</legend>
        {CONTACT_GROUPS.map((g) => (
          <label key={g.id} className="flex cursor-pointer items-center gap-1.5">
            <input type="checkbox" checked={visibleContacts.has(g.id)} onChange={() => toggleContact(g.id)} />
            <span className="inline-block h-3 w-3 rounded-full"
              style={{ background: colorBy === "contact" ? g.color : "transparent", border: `2px solid ${g.color}` }} />
            {g.label} <span className="text-plum/40">({contactCounts[g.id]})</span>
          </label>
        ))}
        <span className="ml-auto flex items-center gap-2">
          {batch ? (
            <>
              <span className="text-plum/70">Scanning websites… {batch.done} of {batch.total}</span>
              <button className="text-plum underline" onClick={() => { cancelBatch.current = true; }}>Stop</button>
            </>
          ) : unscannedShown.length > 0 && (
            <button className="text-plum underline" onClick={findShownContacts}
              title="Finds each facility's website and scans it for an email address and contact number">
              Find contact info for {Math.min(unscannedShown.length, BATCH_SIZE)}
              {unscannedShown.length > BATCH_SIZE ? ` of ${unscannedShown.length}` : ""} shown facilit
              {unscannedShown.length === 1 ? "y" : "ies"}
            </button>
          )}
        </span>
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        {searching && (
          <p className="text-plum/70">
            Searching {SEARCH_MODE_LABEL[provider]} within {radius} mi…
            {provider === "all" && newCandidates.length > 0 && ` ${newCandidates.length} found so far, still checking other sources.`}
            {provider === "osm" && " (public OpenStreetMap servers can take a minute or more)"}
            {(provider === "osint" || provider === "all") && " Web search can take up to a minute."}
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
            {shownCandidates.map((c) => (
              <CircleMarker
                key={c.key}
                center={[c.latitude, c.longitude]}
                radius={selection?.type === "candidate" && selection.key === c.key ? 9 : 6}
                pathOptions={{
                  color: "#fff",
                  weight: 1.5,
                  fillColor: colorBy === "contact"
                    ? CONTACT_COLOR[candidateLevels.get(c.key)!]
                    : GROUP_COLOR[groupOf(c.category)],
                  fillOpacity: 0.9,
                }}
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
                pathOptions={{
                  color: "#0A0A0A",
                  weight: 2.5,
                  fillColor: colorBy === "contact" ? CONTACT_COLOR[contactLevel(lead)] : GROUP_COLOR[groupOf(lead.category)],
                  fillOpacity: 1,
                }}
                eventHandlers={{ click: () => { setSelection({ type: "lead", id: lead.id }); setMessage(null); } }}
              >
                <Tooltip>{lead.facility_name} (lead)</Tooltip>
              </CircleMarker>
            ))}
            {/* Every Angels Oasis location; click another one to search around it. */}
            {facilities.map((f) => {
              if (f.latitude == null || f.longitude == null) return null;
              const isSelected = f.id === selectedFacility;
              return (
                <CircleMarker
                  key={`facility:${f.id}`}
                  center={[f.latitude, f.longitude]}
                  radius={isSelected ? 10 : 7}
                  pathOptions={{
                    color: "#fff",
                    weight: 3,
                    fillColor: isSelected ? "#4A1D3D" : "#6B2C56",
                    fillOpacity: isSelected ? 1 : 0.85,
                  }}
                  eventHandlers={{ click: () => { if (!isSelected) { setSelectedFacility(f.id); setSelection(null); } } }}
                >
                  <Tooltip>
                    <strong>{f.name}</strong>
                    <br />
                    {bedSummary(bedAvailability[f.id], f)}
                    {!isSelected && <><br /><em>Click to search around this location</em></>}
                  </Tooltip>
                </CircleMarker>
              );
            })}
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
              <ContactDetails
                {...candidateContacts(selectedCandidate)}
                lookup={contacts[selectedCandidate.key]}
                givenSource={PROVIDER_LABEL[selectedCandidate.provider]}
                onRescan={() => lookupContacts(selectedCandidate.key, selectedCandidateRaw!, true)}
              />
              <p className="text-xs text-plum/40">
                Source: {(selectedCandidate.sources ?? [selectedCandidate.provider]).map((p) => PROVIDER_LABEL[p]).join(", ")}
                {" "}· not yet a lead, so no outreach history.
              </p>
              <button className="btn-primary mt-2 w-full" disabled={adding} onClick={() => addAsLead(selectedCandidate)}>
                {adding
                  ? contacts[selectedCandidate.key]?.status === "loading" ? "Finding contact info…" : "Adding…"
                  : "+ Add as Lead"}
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
              <ContactDetails
                phone={selectedLead.phone}
                email={selectedLead.email}
                website={selectedLead.website}
                lookup={contacts[`lead:${selectedLead.id}`]}
                givenSource="lead record"
                onRescan={() => scanLead(selectedLead, true)}
              />
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