export const discovery = {};
export default discovery;
import { supabase } from "./supabaseClient";
import type { Lead, LeadCategory } from "./types";

export type DiscoveryProvider = "cdph" | "osm" | "google";

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
}

export interface IntegrationStatus {
  isAdmin: boolean;
  keys: Record<string, { configured: boolean; masked?: string }>;
}

export const PROVIDER_LABEL: Record<DiscoveryProvider, string> = {
  cdph: "California licensed facilities",
  osm: "OpenStreetMap",
  google: "Google Places",
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

export function searchCdph(latitude: number, longitude: number, radiusMiles: number): Promise<Candidate[]> {
  return searchEdgeProvider("cdph", { latitude, longitude, radiusMiles });
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