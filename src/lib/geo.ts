import type { Facility } from "./types";

// Haversine distance in miles between two lat/lng points.
export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const NOMINATIM_DELAY_MS = 1100;

export function nearestFacility(
  facilities: Facility[],
  latitude: number,
  longitude: number
): { facility: Facility; miles: number } | null {
  let nearest: { facility: Facility; miles: number } | null = null;

  for (const facility of facilities) {
    if (facility.latitude == null || facility.longitude == null) continue;
    const miles = milesBetween(latitude, longitude, facility.latitude, facility.longitude);
    if (!nearest || miles < nearest.miles) nearest = { facility, miles };
  }

  return nearest;
}

interface GeocodingResult {
  lat: string;
  lon: string;
  address?: {
    county?: string;
    state_district?: string;
  };
  display_name?: string;
}

async function nominatim<T>(path: string, query: URLSearchParams): Promise<T> {
  const response = await fetch(`https://nominatim.openstreetmap.org/${path}?${query.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Address lookup failed (${response.status} ${response.statusText}).`);
  }
  return (await response.json()) as T;
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<{ address: string | null; county: string | null }> {
  const query = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    addressdetails: "1",
  });
  const result = await nominatim<GeocodingResult>("reverse", query);
  return {
    address: result.display_name ?? null,
    county: result.address?.county ?? result.address?.state_district ?? null,
  };
}

export async function leadLocationFields(
  address: string | null,
  county: string | null,
  facilities: Facility[]
): Promise<{
  latitude: number;
  longitude: number;
  nearest_facility_id: string | null;
  distance_miles: number | null;
} | null> {
  const cleanAddress = address?.trim();
  if (!cleanAddress) return null;

  const query = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    q: [cleanAddress, county?.trim(), "California"].filter(Boolean).join(", "),
  });
  const [result] = await nominatim<GeocodingResult[]>("search", query);
  if (!result) return null;

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Address lookup returned invalid coordinates.");
  }

  const nearest = nearestFacility(facilities, latitude, longitude);
  return {
    latitude,
    longitude,
    nearest_facility_id: nearest?.facility.id ?? null,
    distance_miles: nearest ? Math.round(nearest.miles * 100) / 100 : null,
  };
}

// Full-address geocode for an Angels Oasis location (any US address).
export async function geocodeAddress(
  address: string
): Promise<{ latitude: number; longitude: number; county: string | null } | null> {
  const query = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "us",
    addressdetails: "1",
    q: address,
  });
  const [result] = await nominatim<GeocodingResult[]>("search", query);
  if (!result) return null;

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Address lookup returned invalid coordinates.");
  }
  return { latitude, longitude, county: result.address?.county ?? result.address?.state_district ?? null };
}
