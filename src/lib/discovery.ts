export const discovery = {};
export default discovery;
import { supabase } from "./supabaseClient";
import { milesBetween } from "./geo";
import type { Lead, LeadCategory } from "./types";

export type DiscoveryProvider = "cdph" | "osm" | "osint" | "google";
// What the map's source dropdown can pick: one provider, or several combined.
export type SearchMode = DiscoveryProvider | "all";

export interface Candidate {
  key: string;
  name: string;
  address: string | null;
  county: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  category: LeadCategory;
  detail: string | null;
  provider: DiscoveryProvider;
  // Every source that reported this facility (set when results are merged).
  sources?: DiscoveryProvider[];
}

export interface IntegrationStatus {
  isAdmin: boolean;
  keys: Record<string, { configured: boolean; masked?: string }>;
}

export const PROVIDER_LABEL: Record<DiscoveryProvider, string> = {
  cdph: "California licensed facilities",
  osm: "OpenStreetMap",
  osint: "Web search (OSINT)",
  google: "Google Places",
};

export const SEARCH_MODE_LABEL: Record<SearchMode, string> = {
  ...PROVIDER_LABEL,
  all: "All sources combined",
};

export async function functionErrorMessage(error: unknown): Promise<string> {
  const message = error instanceof Error ? error.message : "The request failed.";
  const context = error && typeof error === "object" && "context" in error
    ? error.context
    : null;
  if (!(context instanceof Response)) return message;

  const responseText = await context.text();
  if (!responseText) return message;
  try {
    const body: unknown = JSON.parse(responseText);
    if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
      return body.message;
    }
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    return responseText;
  }
  return responseText;
}

export async function getIntegrationStatus(): Promise<IntegrationStatus | null> {
  const { data, error } = await supabase.functions.invoke("integration-keys", {
    body: { action: "status" },
  });
  if (error) return null;
  return data as IntegrationStatus;
}

function candidateCategory(tags: Record<string, string>): LeadCategory {
  const value = `${tags.amenity ?? ""} ${tags.healthcare ?? ""} ${tags.operator ?? ""}`.toLowerCase();
  if (value.includes("hospital")) return "hospital";
  if (value.includes("nursing") || value.includes("care_home")) return "skilled_nursing_facility";
  if (value.includes("rehab")) return "rehab_center";
  if (value.includes("doctor") || value.includes("physician")) return "physician";
  return "healthcare_organization";
}

function parseOverpassCandidates(payload: unknown): Candidate[] {
  if (!payload || typeof payload !== "object" || !("elements" in payload) || !Array.isArray(payload.elements)) {
    throw new Error("OpenStreetMap returned an invalid search response.");
  }

  return payload.elements.flatMap((item): Candidate[] => {
    if (!item || typeof item !== "object" || !("tags" in item) || !item.tags || typeof item.tags !== "object") return [];
    const tags = item.tags as Record<string, string>;
    const location = item as { type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number } };
    const lat = location.lat ?? location.center?.lat;
    const lon = location.lon ?? location.center?.lon;
    if (!tags.name || lat == null || lon == null || location.id == null) return [];

    const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
    const locality = [tags["addr:city"], tags["addr:state"]].filter(Boolean).join(", ");
    return [{
      key: `osm:${location.type ?? "item"}:${location.id}`,
      name: tags.name,
      address: [street, locality, tags["addr:postcode"]].filter(Boolean).join(", ") || null,
      county: tags["addr:county"] ?? null,
      latitude: lat,
      longitude: lon,
      phone: tags.phone ?? tags["contact:phone"] ?? null,
      website: tags.website ?? tags["contact:website"] ?? null,
      category: candidateCategory(tags),
      detail: tags.healthcare ?? tags.amenity ?? null,
      provider: "osm",
    }];
  });
}

export async function searchOverpass(
  latitude: number,
  longitude: number,
  radiusMiles: number
): Promise<Candidate[]> {
  let response: Response;
  try {
    response = await fetch("/api/overpass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude, radiusMiles }),
    });
  } catch {
    throw new Error("Could not reach the facility search service. Check your connection and try Refresh.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Facility search service returned an unexpected response (${response.status}).`;
    throw new Error(message);
  }
  return parseOverpassCandidates(payload);
}

async function searchEdgeProvider(
  provider: Exclude<DiscoveryProvider, "osm">,
  parameters: { facilityId: string; radiusMiles: number } | { latitude: number; longitude: number; radiusMiles: number }
): Promise<Candidate[]> {
  const { data, error } = await supabase.functions.invoke("facility-discovery", {
    body: { provider, ...parameters },
  });
  if (error) throw new Error(await functionErrorMessage(error));
  if (!Array.isArray(data)) throw new Error(`${PROVIDER_LABEL[provider]} returned an invalid response.`);
  return data as Candidate[];
}

export async function searchCdph(latitude: number, longitude: number, radiusMiles: number): Promise<Candidate[]> {
  let response: Response;
  try {
    response = await fetch("/api/facility-discovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude, radiusMiles }),
    });
  } catch {
    throw new Error("Could not reach the California licensed-facility search service. Check your connection and try Refresh.");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `California licensed-facility search returned an unexpected response (${response.status}).`;
    throw new Error(message);
  }
  if (!Array.isArray(payload)) {
    throw new Error("California licensed-facility search returned an invalid response.");
  }
  return payload as Candidate[];
}

export type ContactSource = "given" | "google" | "openstreetmap" | "website" | "web_search";

export interface FoundPerson {
  name: string;
  title: string;
  source: "website" | "linkedin";
  url: string | null;
}

export interface ContactInfo {
  website: string | null;
  phone: string | null;
  email: string | null;
  emails: string[];
  phones: string[];
  sources: { website: ContactSource | null; phone: ContactSource | null; email: ContactSource | null };
  scanned: boolean;
  scanError: string | null;
  people: FoundPerson[];
  webSearch: { ran: boolean; note: string | null };
}

export const CONTACT_SOURCE_LABEL: Record<ContactSource, string> = {
  given: "facility record",
  google: "Google Places",
  openstreetmap: "OpenStreetMap",
  website: "found on website",
  web_search: "found by web search",
};

// Finds a facility's website (if it has none) and scans it for email/phone.
export async function findContactInfo(facility: {
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
}): Promise<ContactInfo> {
  let response: Response;
  try {
    response = await fetch("/api/enrich-facility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(facility),
    });
  } catch {
    throw new Error("Could not reach the contact lookup service. Check your connection and try again.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Contact lookup returned an unexpected response (${response.status}).`
    );
  }
  if (!payload || typeof payload !== "object" || !("sources" in payload)) {
    throw new Error("Contact lookup returned an invalid response.");
  }
  return payload as ContactInfo;
}

// Web search (OSINT): finds facilities listed online near the map location.
export async function searchOsint(
  latitude: number,
  longitude: number,
  radiusMiles: number
): Promise<{ candidates: Candidate[]; notes: string[] }> {
  let response: Response;
  try {
    response = await fetch("/api/osint-discovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude, radiusMiles }),
    });
  } catch {
    throw new Error("Could not reach the web search (OSINT) service. Check your connection and try Refresh.");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Web search (OSINT) returned an unexpected response (${response.status}).`
    );
  }
  if (!payload || typeof payload !== "object" || !("candidates" in payload) || !Array.isArray(payload.candidates)) {
    throw new Error("Web search (OSINT) returned an invalid response.");
  }
  const notes = "notes" in payload && Array.isArray(payload.notes) ? (payload.notes as string[]) : [];
  return { candidates: payload.candidates as Candidate[], notes };
}

// Words that say what kind of place it is, not which one. Two hospices at the
// same address share "hospice care" but are different licensed facilities.
const GENERIC_WORDS = new Set([
  "the", "of", "and", "at", "inc", "llc", "lp", "ltd", "corp", "dba", "a", "an", "co",
  "hospital", "hospitals", "medical", "center", "centre", "health", "healthcare", "care", "home", "homes",
  "hospice", "nursing", "skilled", "rehabilitation", "rehab", "services", "service", "clinic", "agency",
  "facility", "community", "senior", "living", "residential", "convalescent", "wellness", "group", "california",
]);

function normalizedName(name: string) {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function distinctiveTokens(name: string) {
  return normalizedName(name).split(" ").filter((token) => token.length > 1 && !GENERIC_WORDS.has(token));
}

// How likely two records are the same facility: 0 = no, higher = better match.
function matchScore(a: Candidate, b: Candidate) {
  const miles = milesBetween(a.latitude, a.longitude, b.latitude, b.longitude);
  if (miles > 0.5) return 0;
  // One building can hold several licences under one name (a hospital and its
  // skilled-nursing unit); prefer the record of the same type.
  const sameType = a.category === b.category ? 0.5 : 0;
  if (normalizedName(a.name) === normalizedName(b.name)) return 3 + sameType - miles;
  const left = new Set(distinctiveTokens(a.name));
  const right = distinctiveTokens(b.name);
  if (!left.size || !right.length) return 0;
  const shared = right.filter((token) => left.has(token)).length;
  // Same building: most distinctive words match. Further apart: all of them.
  const overlap = shared / Math.min(left.size, right.length);
  if (overlap < (miles <= 0.1 ? 0.6 : 1)) return 0;
  // Prefer the record whose name has the fewest extra words (Jaccard), then the closest.
  return 1 + sameType + shared / (left.size + right.length - shared) - miles;
}

const cellOf = (latitude: number, longitude: number) => [Math.floor(latitude * 100), Math.floor(longitude * 100)];

// Combines results from several sources. Earlier lists win (pass the most
// authoritative first); a later source's duplicate only fills in missing
// details. Records from the same source are never merged with each other.
export function mergeCandidates(lists: Candidate[][]): Candidate[] {
  const merged: Candidate[] = [];
  const grid = new Map<string, Candidate[]>(); // ~0.7-mile cells for fast neighbor lookup
  for (const list of lists) {
    for (const candidate of list) {
      const [row, column] = cellOf(candidate.latitude, candidate.longitude);
      let match: Candidate | undefined;
      let best = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          for (const existing of grid.get(`${row + dr}:${column + dc}`) ?? []) {
            if (existing.sources?.includes(candidate.provider)) continue;
            const score = matchScore(existing, candidate);
            if (score > best) {
              best = score;
              match = existing;
            }
          }
        }
      }
      if (!match) {
        const entry = { ...candidate, sources: [candidate.provider] };
        merged.push(entry);
        const key = `${row}:${column}`;
        grid.set(key, [...(grid.get(key) ?? []), entry]);
        continue;
      }
      match.phone ??= candidate.phone;
      match.website ??= candidate.website;
      match.address ??= candidate.address;
      match.county ??= candidate.county;
      match.sources = [...(match.sources ?? []), candidate.provider];
    }
  }
  return merged;
}

export function searchGoogle(facilityId: string, radiusMiles: number): Promise<Candidate[]> {
  return searchEdgeProvider("google", { facilityId, radiusMiles });
}

export function findMatchingLead(candidate: Candidate, leads: Lead[]): Lead | undefined {
  return leads.find((lead) =>
    (lead.place_id != null && lead.place_id === candidate.key) ||
    lead.facility_name.trim().toLowerCase() === candidate.name.trim().toLowerCase()
  );
}