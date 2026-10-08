interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassPayload {
  elements: OverpassElement[];
}

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const UPSTREAM_TIMEOUT_MS = 8_000;

function isValidCoordinates(latitude: unknown, longitude: unknown): latitude is number {
  return (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

async function requestOverpass(
  endpoint: string,
  query: string,
  signal: AbortSignal
): Promise<OverpassPayload> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "AngelsOasisCRM/1.0 (facility discovery)",
    },
    body: new URLSearchParams({ data: query }),
    signal,
  });
  if (!response.ok) throw new Error(`${new URL(endpoint).hostname} returned ${response.status}`);

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("elements" in payload) || !Array.isArray(payload.elements)) {
    throw new Error(`${new URL(endpoint).hostname} returned an invalid response`);
  }
  return payload as OverpassPayload;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    response.status(405).json({ error: "Use POST to search nearby facilities." });
    return;
  }

  const body = request.body;
  if (!body || typeof body !== "object" || !("latitude" in body) || !("longitude" in body) || !("radiusMiles" in body)) {
    response.status(400).json({ error: "Latitude, longitude, and radius are required." });
    return;
  }

  const { latitude, longitude, radiusMiles } = body as {
    latitude: unknown;
    longitude: unknown;
    radiusMiles: unknown;
  };
  if (
    !isValidCoordinates(latitude, longitude) ||
    typeof radiusMiles !== "number" ||
    !Number.isFinite(radiusMiles) ||
    radiusMiles <= 0 ||
    radiusMiles > 100
  ) {
    response.status(400).json({ error: "The map location or search radius is invalid." });
    return;
  }

  const radiusMeters = Math.round(radiusMiles * 1609.34);
  const around = `around:${radiusMeters},${latitude},${longitude}`;
  const query = `[out:json][timeout:7];(nwr(${around})["amenity"~"hospital|clinic|doctors|nursing_home|rehabilitation|hospice"]["name"];nwr(${around})["healthcare"~"hospital|clinic|doctor|nursing_home|rehabilitation|hospice|home_health|physiotherapist"]["name"];);out center tags;`;
  const controllers = ENDPOINTS.map(() => new AbortController());
  const errors: string[] = [];
  const requests = ENDPOINTS.map((endpoint, index) =>
    requestOverpass(endpoint, query, controllers[index].signal).catch((error: unknown) => {
      errors.push(
        error instanceof Error
          ? error.name === "AbortError"
            ? `${new URL(endpoint).hostname} timed out`
            : error.message
          : `${new URL(endpoint).hostname} request failed`
      );
      throw error;
    })
  );

  try {
    const timeout = setTimeout(
      () => controllers.forEach((controller) => controller.abort()),
      UPSTREAM_TIMEOUT_MS
    );
    try {
      const payload = await Promise.any(requests);
      controllers.forEach((controller) => controller.abort());
      response.status(200).json(payload);
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    response.status(502).json({
      error: `OpenStreetMap facility search is temporarily unavailable (${errors.join("; ")}). Please try Refresh again shortly.`,
    });
  }
}
