import {
  webSearch,
  webSearchConfigured,
  hostOf,
  isDirectoryHost,
  OSD_NOT_CONFIGURED,
  type SearchResult,
} from "./_lib/osd.js";

interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

type Category = "hospital" | "skilled_nursing_facility" | "rehab_center" | "healthcare_organization" | "physician";

interface Candidate {
  key: string;
  name: string;
  address: string | null;
  county: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
  category: Category;
  detail: string | null;
  provider: "osd";
}

// Five searches plus rate-limited geocoding can take ~40 seconds.
export const config = { maxDuration: 60 };

const USER_AGENT = "AngelsOasisCRM/1.0 (facility discovery)";
const NOMINATIM_GAP_MS = 1_100; // Nominatim's usage policy: at most 1 request/second
const MAX_GEOCODES = 30;
const DEADLINE_MS = 50_000;
const CACHE_MS = 6 * 60 * 60 * 1000;
const CACHE_LIMIT = 50;

// One web search per facility type; results are listings for the area.
const SEARCHES: { category: Category; query: string; detail: string }[] = [
  { category: "hospital", query: "hospital", detail: "Hospital (OSD)" },
  { category: "skilled_nursing_facility", query: "skilled nursing facility", detail: "Skilled nursing (OSD)" },
  { category: "rehab_center", query: "rehabilitation center", detail: "Rehab center (OSD)" },
  { category: "healthcare_organization", query: "hospice", detail: "Hospice (OSD)" },
  { category: "healthcare_organization", query: "home health agency", detail: "Home health (OSD)" },
];

const cache = new Map<string, { loadedAt: number; candidates: Candidate[] }>();

function respond(response: ApiResponse, status: number, body: unknown) {
  response.setHeader("Cache-Control", "no-store");
  response.status(status).json(body);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function milesBetween(latitude: number, longitude: number, otherLatitude: number, otherLongitude: number) {
  const radians = Math.PI / 180;
  const deltaLatitude = (otherLatitude - latitude) * radians;
  const deltaLongitude = (otherLongitude - longitude) * radians;
  const arc =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude * radians) * Math.cos(otherLatitude * radians) * Math.sin(deltaLongitude / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

async function nominatim<T>(path: string, query: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/${path}?${new URLSearchParams(query)}`, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`OpenStreetMap geocoding returned ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// The city/county name to search around.
async function placeName(latitude: number, longitude: number) {
  const result = await nominatim<{ address?: Record<string, string> }>("reverse", {
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    zoom: "10",
    addressdetails: "1",
  });
  const address = result.address ?? {};
  const city = address.city ?? address.town ?? address.village ?? address.suburb ?? address.county ?? null;
  return { city, county: address.county ?? null, state: address["ISO3166-2-lvl4"]?.split("-")[1] ?? "CA" };
}

const STREET = "(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Way|Ln|Lane|Pl|Place|Ct|Court|Pkwy|Parkway|Hwy|Highway|Cir|Circle|Ter|Terrace)";
const ADDRESS_PATTERN = new RegExp(
  `\\b\\d{2,6}\\s+(?:[NSEW]\\.?\\s+)?[A-Za-z0-9.' -]{2,40}?\\s${STREET}\\.?(?:,?\\s*(?:Suite|Ste\\.?|Unit|#)\\s*[\\w-]+)?,?\\s+[A-Za-z .'-]{2,30},?\\s+(?:CA|California),?\\s+9\\d{4}\\b`
);
const PHONE_PATTERN = /\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : null;
}

// "Valley Village Healthcare Center | Skilled Nursing in ..." → "Valley Village Healthcare Center"
// Page titles like "Home", "About Us", or a department name don't name a facility.
const GENERIC_TITLE = /^(home(\s*page)?|welcome|about(\s+us)?|contact(\s+us)?|services|our services|locations?|careers|palliative care|hospice care|home health( care)?|skilled nursing( facilit(y|ies))?|rehabilitation|nursing homes?|hospitals?)$/i;
// A title segment that's only a place: "Los Angeles, CA".
const PLACE_ONLY = /^[A-Za-z .'-]+,\s*(CA|California)$/i;

// "Home | Alcott Rehabilitation" → "Alcott Rehabilitation"; null if no part names a place.
function facilityName(title: string) {
  const parts = title.split(/\s+[|–—:]\s+|\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const named = parts.find((part) => part.length >= 4 && !GENERIC_TITLE.test(part) && !PLACE_ONLY.test(part));
  return named ? named.slice(0, 120) : null;
}

// Pages that list many facilities ("Top 10 nursing homes near…") aren't one facility.
// Pages that list many facilities ("Top 10…", "Rehab Centers near…", "Hospice Agencies in…").
const LISTING_TITLE = /\b(best|top|near(\s+me)?|list of|directory|compare|reviews? of|ranking|find a|search|\d+ (?:best|top|hospitals|facilities|nursing homes|agencies|centers|hospices))\b|\b(hospitals|facilities|centers|centres|agencies|companies|homes|clinics|providers|rehabs)(\s+(in|near|around)\b|$)/i;

const STREET_ABBREVIATIONS: Record<string, string> = {
  street: "st", avenue: "ave", boulevard: "blvd", road: "rd", drive: "dr", lane: "ln", place: "pl",
  court: "ct", parkway: "pkwy", highway: "hwy", circle: "cir", terrace: "ter", suite: "ste",
  north: "n", south: "s", east: "e", west: "w", california: "ca",
};

// "2741 S Robertson Boulevard, Los Angeles, CA, 90034" and "2741 S Robertson Blvd …" → same key.
function normalizedAddress(address: string) {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word) => STREET_ABBREVIATIONS[word] ?? word)
    .join(" ");
}

interface Lead {
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  category: Category;
  detail: string;
  url: string;
}

export function leadsFrom(results: SearchResult[], category: Category, detail: string): Lead[] {
  const leads: Lead[] = [];
  for (const result of results) {
    if (LISTING_TITLE.test(result.title)) continue;
    const text = [result.description, ...result.extraSnippets].join(" ");
    const address = text.match(ADDRESS_PATTERN)?.[0];
    const name = facilityName(result.title);
    if (!address || !name) continue;
    const host = hostOf(result.url);
    const phone = text.match(PHONE_PATTERN)?.[0];
    leads.push({
      name,
      address: address.replace(/\s+/g, " ").trim(),
      phone: phone ? formatPhone(phone) : null,
      website: host && !isDirectoryHost(host) ? new URL(result.url).origin + "/" : null,
      category,
      detail,
      url: result.url,
    });
  }
  return leads;
}

async function discover(latitude: number, longitude: number, radiusMiles: number) {
  const started = Date.now();
  const place = await placeName(latitude, longitude);
  const area = [place.city, place.state].filter(Boolean).join(", ");
  if (!place.city) throw new Error("couldn't determine the city for this map location");

  const notes: string[] = [];
  const leads: Lead[] = [];
  let succeeded = 0;
  let firstError: Error | null = null;
  // The five searches run in parallel.
  const outcomes = await Promise.allSettled(
    SEARCHES.map((search) => webSearch(`${search.query} ${area}`, { count: 20 }))
  );
  outcomes.forEach((outcome, index) => {
    const search = SEARCHES[index];
    if (outcome.status === "fulfilled") {
      leads.push(...leadsFrom(outcome.value, search.category, search.detail));
      succeeded++;
    } else {
      const error = outcome.reason instanceof Error ? outcome.reason : new Error("search failed");
      firstError ??= error;
      notes.push(`${search.query}: ${error.message}`);
    }
  });
  if (!succeeded && firstError) throw firstError;

  // De-duplicate by address before geocoding (the slow, rate-limited step).
  const unique = new Map<string, Lead>();
  for (const lead of leads) {
    const key = normalizedAddress(lead.address);
    if (!unique.has(key)) unique.set(key, lead);
  }

  const candidates: Candidate[] = [];
  let geocoded = 0;
  for (const lead of unique.values()) {
    if (geocoded >= MAX_GEOCODES || Date.now() - started > DEADLINE_MS) {
      notes.push("Stopped placing web results on the map early to keep the search fast.");
      break;
    }
    if (geocoded > 0) await sleep(NOMINATIM_GAP_MS);
    geocoded++;
    const [hit] = await nominatim<{ lat: string; lon: string; address?: Record<string, string> }[]>("search", {
      q: lead.address,
      format: "jsonv2",
      limit: "1",
      countrycodes: "us",
      addressdetails: "1",
    }).catch(() => []);
    const lat = Number(hit?.lat);
    const lon = Number(hit?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (milesBetween(latitude, longitude, lat, lon) > radiusMiles) continue;
    candidates.push({
      key: `osd:${normalizedAddress(lead.address).replace(/ /g, "-")}`,
      name: lead.name,
      address: lead.address,
      county: hit?.address?.county ?? null,
      latitude: lat,
      longitude: lon,
      phone: lead.phone,
      website: lead.website,
      category: lead.category,
      detail: lead.detail,
      provider: "osd",
    });
  }
  return { candidates, notes };
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    respond(response, 405, { error: "Use POST to search the web for nearby facilities." });
    return;
  }
  if (!webSearchConfigured()) {
    respond(response, 503, { error: OSD_NOT_CONFIGURED });
    return;
  }

  const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
  const { latitude, longitude, radiusMiles } = body;
  if (
    typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
    typeof radiusMiles !== "number" || !Number.isFinite(radiusMiles) || radiusMiles <= 0 || radiusMiles > 100
  ) {
    respond(response, 400, { error: "The map location or search radius is invalid." });
    return;
  }

  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)},${radiusMiles}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < CACHE_MS) {
    respond(response, 200, { candidates: cached.candidates, notes: [] });
    return;
  }

  try {
    const { candidates, notes } = await discover(latitude, longitude, radiusMiles);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { loadedAt: Date.now(), candidates });
    respond(response, 200, { candidates, notes });
  } catch (error) {
    console.error("OSD discovery failed:", error);
    respond(response, 502, {
      error: `Open Source Data (OSD) failed: ${error instanceof Error ? error.message : "unexpected error"}.`,
    });
  }
}
