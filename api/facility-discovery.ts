interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

type Category =
  | "hospital"
  | "skilled_nursing_facility"
  | "rehab_center"
  | "physician"
  | "healthcare_organization";

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
  provider: "cdph";
}

interface ArcGisFeature {
  attributes?: Record<string, string | number | null>;
  geometry?: { x?: number; y?: number };
}

interface ArcGisPayload {
  features?: ArcGisFeature[];
  count?: number;
  error?: { message?: string };
}

// CDPH Licensing & Certification publishes its facility listing as an ArcGIS
// feature service, refreshed weekly. Unlike the CSV download on data.chhs.ca.gov
// (Cloudflare-blocked for many networks), it filters by radius server-side.
const SERVICE_URL =
  "https://services2.arcgis.com/wi1yEacfYjH5viqb/arcgis/rest/services/CDPH_Licensing_and_Certification_Healthcare_Facilities/FeatureServer/0/query";
const OUT_FIELDS = [
  "FACID",
  "FACNAME",
  "Facility_Type_Description",
  "COUNTY_NAME",
  "FAC_ADDRESS1",
  "FAC_ADDRESS2",
  "FAC_CITY",
  "FAC_ST",
  "FAC_ZIP5",
  "CONTACT_PHONE_NUMBER",
].join(",");
const ACTIVE_LICENSES = "(License_Status IS NULL OR License_Status NOT LIKE 'Inactive%')";
const PAGE_SIZE = 1_000; // the service's maxRecordCount
const MAX_PAGES = 30;
const REQUEST_TIMEOUT_MS = 15_000;
const CACHE_MS = 60 * 60 * 1000;
const CACHE_LIMIT = 50;

const resultCache = new Map<string, { loadedAt: number; candidates: Candidate[] }>();

function respond(response: ApiResponse, status: number, body: unknown) {
  response.setHeader("Cache-Control", status === 200 ? "private, max-age=300" : "no-store");
  response.status(status).json(body);
}

function text(value: string | number | null | undefined) {
  const trimmed = value == null ? "" : String(value).trim();
  return trimmed || null;
}

function titleCase(value: string | null) {
  return value?.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) ?? null;
}

function categoryFor(type: string): Category {
  if (/rehabilitation|physical therapy/i.test(type)) return "rehab_center";
  if (/hospital|psychiatric unit/i.test(type)) return "hospital";
  if (/skilled nursing|intermediate care|congregate living/i.test(type)) return "skilled_nursing_facility";
  if (/clinic|health center|medical doctor/i.test(type)) return "physician";
  return "healthcare_organization";
}

function toCandidate(feature: ArcGisFeature): Candidate | null {
  const attributes = feature.attributes ?? {};
  const name = text(attributes.FACNAME);
  const longitude = feature.geometry?.x;
  const latitude = feature.geometry?.y;
  if (!name || typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const street = [text(attributes.FAC_ADDRESS1), text(attributes.FAC_ADDRESS2)].filter(Boolean).join(" ");
  const locality = [text(attributes.FAC_CITY), text(attributes.FAC_ST)].filter(Boolean).join(", ");
  const address = [street, locality, text(attributes.FAC_ZIP5)].filter(Boolean).join(", ") || null;
  const type = text(attributes.Facility_Type_Description);
  const id = text(attributes.FACID) ?? `${name.toLowerCase()}|${latitude},${longitude}`;

  return {
    key: `cdph:${id}`,
    name,
    address,
    county: titleCase(text(attributes.COUNTY_NAME)),
    latitude,
    longitude,
    phone: text(attributes.CONTACT_PHONE_NUMBER),
    website: null,
    category: categoryFor(type ?? name),
    detail: type,
    provider: "cdph",
  };
}

async function queryService(parameters: Record<string, string>, signal: AbortSignal): Promise<ArcGisPayload> {
  // POST keeps long where clauses out of the URL; ArcGIS accepts form bodies.
  const body = new URLSearchParams({ f: "json", ...parameters });
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(SERVICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal,
      });
      if (!response.ok) throw new Error(`CDPH map service returned ${response.status}`);
      const payload = (await response.json()) as ArcGisPayload;
      // ArcGIS reports query errors with HTTP 200 and an `error` object.
      if (payload.error) throw new Error(payload.error.message || "CDPH map service rejected the query");
      return payload;
    } catch (error) {
      lastError = error;
      if (signal.aborted) break;
    }
  }
  throw lastError;
}

async function searchFacilities(latitude: number, longitude: number, radiusMiles: number): Promise<Candidate[]> {
  const spatial = {
    where: ACTIVE_LICENSES,
    geometry: `${longitude},${latitude}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(radiusMiles),
    units: "esriSRUnit_StatuteMile",
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const { count } = await queryService({ ...spatial, returnCountOnly: "true" }, controller.signal);
    if (typeof count !== "number") throw new Error("CDPH map service returned an invalid count");

    const pages = Math.min(Math.ceil(count / PAGE_SIZE), MAX_PAGES);
    const results = await Promise.all(
      Array.from({ length: pages }, (_, page) =>
        queryService(
          {
            ...spatial,
            outFields: OUT_FIELDS,
            outSR: "4326",
            geometryPrecision: "6",
            returnGeometry: "true",
            orderByFields: "OBJECTID",
            resultOffset: String(page * PAGE_SIZE),
            resultRecordCount: String(PAGE_SIZE),
          },
          controller.signal
        )
      )
    );

    const candidates = new Map<string, Candidate>();
    for (const payload of results) {
      for (const feature of payload.features ?? []) {
        const candidate = toCandidate(feature);
        if (candidate && !candidates.has(candidate.key)) candidates.set(candidate.key, candidate);
      }
    }
    return [...candidates.values()];
  } catch (error) {
    if (controller.signal.aborted) throw new Error("the CDPH map service timed out");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    respond(response, 405, { error: "Use POST to search California licensed healthcare facilities." });
    return;
  }

  const body = request.body;
  if (!body || typeof body !== "object" || !("latitude" in body) || !("longitude" in body) || !("radiusMiles" in body)) {
    respond(response, 400, { error: "Latitude, longitude, and radius are required." });
    return;
  }

  const { latitude, longitude, radiusMiles } = body as {
    latitude: unknown;
    longitude: unknown;
    radiusMiles: unknown;
  };
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof radiusMiles !== "number" ||
    !Number.isFinite(radiusMiles) ||
    radiusMiles <= 0 ||
    radiusMiles > 100
  ) {
    respond(response, 400, { error: "The map location or search radius is invalid." });
    return;
  }

  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)},${radiusMiles}`;
  const cached = resultCache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < CACHE_MS) {
    respond(response, 200, cached.candidates);
    return;
  }

  try {
    const candidates = await searchFacilities(latitude, longitude, radiusMiles);
    if (resultCache.size >= CACHE_LIMIT) resultCache.delete(resultCache.keys().next().value!);
    resultCache.set(cacheKey, { loadedAt: Date.now(), candidates });
    respond(response, 200, candidates);
  } catch (error) {
    console.error("California licensed-facility search failed:", error);
    if (cached) {
      respond(response, 200, cached.candidates);
      return;
    }
    respond(response, 502, {
      error: `California licensed-facility search is temporarily unavailable${
        error instanceof Error ? ` (${error.message})` : ""
      }. Try Refresh shortly.`,
    });
  }
}
