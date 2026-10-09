interface ApiRequest {
  method?: string;
  body?: unknown;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ApiResponse;
  json(body: unknown): void;
}

import {
  webSearch,
  webSearchConfigured,
  hostOf,
  peopleFromLinkedInResults,
  peopleFromText,
  pickWebsite,
  type Person,
} from "./_lib/osd.js";

declare const process: {
  env: Record<string, string | undefined>;
};

type Source = "given" | "google" | "openstreetmap" | "website" | "web_search";

interface Enrichment {
  website: string | null;
  phone: string | null;
  email: string | null;
  emails: string[];
  phones: string[];
  sources: { website: Source | null; phone: Source | null; email: Source | null };
  scanned: boolean;
  scanError: string | null;
  people: Person[];
  // Whether the Open Source Data (OSD) step ran, and why not if it didn't.
  webSearch: { ran: boolean; note: string | null };
}

interface FacilityInput {
  name: string;
  address: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  phone: string | null;
  website: string | null;
}

// Website scan plus up to three web searches.
export const config = { maxDuration: 60 };

const USER_AGENT = "AngelsOasisCRM/1.0 (facility contact lookup)";
const PAGE_TIMEOUT_MS = 7_000;
const LOOKUP_TIMEOUT_MS = 6_000;
const MAX_PAGE_BYTES = 1_500_000;
const MAX_EXTRA_PAGES = 3;
const MAX_MATCH_MILES = 0.75;
const NOMINATIM_GAP_MS = 1_100; // Nominatim's usage policy: at most 1 request/second
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 500;

const cache = new Map<string, { loadedAt: number; result: Enrichment }>();
let nominatimQueue: Promise<unknown> = Promise.resolve();

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

function normalizeWebsite(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10 || /^[01]/.test(digits) || /^\d{3}55501/.test(digits)) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// Refuse hosts that would let this endpoint reach private infrastructure.
function isPublicHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || /\.(local|internal|localhost|home|lan)$/.test(host)) return false;
  if (host.includes(":")) return false; // IPv6 literals
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return host.includes(".");
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Website lookup
// ---------------------------------------------------------------------------

async function lookupGoogle(facility: FacilityInput): Promise<{ website: string | null; phone: string | null } | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) return null;
  return withTimeout(LOOKUP_TIMEOUT_MS, async (signal) => {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.location,places.websiteUri,places.nationalPhoneNumber",
      },
      body: JSON.stringify({
        textQuery: [facility.name, facility.address].filter(Boolean).join(", "),
        maxResultCount: 3,
        locationBias: {
          circle: { center: { latitude: facility.latitude, longitude: facility.longitude }, radius: 2000 },
        },
      }),
      signal,
    });
    if (!response.ok) throw new Error(`Google Places returned ${response.status}`);
    const payload = (await response.json()) as {
      places?: { location?: { latitude?: number; longitude?: number }; websiteUri?: string; nationalPhoneNumber?: string }[];
    };
    const match = payload.places?.find(
      (place) =>
        place.location?.latitude != null &&
        place.location.longitude != null &&
        milesBetween(facility.latitude, facility.longitude, place.location.latitude, place.location.longitude) <=
          MAX_MATCH_MILES
    );
    return match
      ? { website: normalizeWebsite(match.websiteUri), phone: match.nationalPhoneNumber ? formatPhone(match.nationalPhoneNumber) : null }
      : null;
  });
}

function nominatimTurn<T>(run: () => Promise<T>): Promise<T> {
  const turn = nominatimQueue.then(run, run);
  nominatimQueue = turn.then(() => sleep(NOMINATIM_GAP_MS), () => sleep(NOMINATIM_GAP_MS));
  return turn;
}

async function lookupOpenStreetMap(facility: FacilityInput): Promise<{ website: string | null; phone: string | null } | null> {
  const delta = 0.02; // ~1.4 miles each way
  const query = new URLSearchParams({
    q: facility.name,
    format: "jsonv2",
    extratags: "1",
    limit: "5",
    countrycodes: "us",
    bounded: "1",
    viewbox: [
      facility.longitude - delta,
      facility.latitude + delta,
      facility.longitude + delta,
      facility.latitude - delta,
    ].join(","),
  });
  return nominatimTurn(() =>
    withTimeout(LOOKUP_TIMEOUT_MS, async (signal) => {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal,
      });
      if (!response.ok) throw new Error(`OpenStreetMap lookup returned ${response.status}`);
      const results = (await response.json()) as { lat?: string; lon?: string; extratags?: Record<string, string> }[];
      for (const result of results) {
        const tags = result.extratags ?? {};
        const website = normalizeWebsite(tags.website ?? tags["contact:website"] ?? tags.url);
        const phoneTag = tags.phone ?? tags["contact:phone"];
        const close =
          milesBetween(facility.latitude, facility.longitude, Number(result.lat), Number(result.lon)) <= MAX_MATCH_MILES;
        if (close && (website || phoneTag)) {
          return { website, phone: phoneTag ? formatPhone(phoneTag.split(";")[0]) : null };
        }
      }
      return null;
    })
  );
}

// ---------------------------------------------------------------------------
// Website scan
// ---------------------------------------------------------------------------

async function fetchPage(url: string, signal: AbortSignal): Promise<{ url: string; html: string }> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const parsed = new URL(current);
    if (!/^https?:$/.test(parsed.protocol) || !isPublicHost(parsed.hostname)) {
      throw new Error("the website address isn't a public web address");
    }
    const response = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": `Mozilla/5.0 (compatible; ${USER_AGENT})`, Accept: "text/html,application/xhtml+xml" },
      signal,
    });
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) throw new Error(`the website returned ${response.status}`);
    if (!/html|xml|text/i.test(response.headers.get("content-type") ?? "text/html")) {
      throw new Error("the website didn't return a web page");
    }

    // Read at most MAX_PAGE_BYTES so a huge page can't exhaust memory.
    const reader = response.body?.getReader();
    if (!reader) return { url: current, html: await response.text() };
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    while (bytes < MAX_PAGE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
    }
    reader.cancel().catch(() => undefined);
    return { url: current, html };
  }
  throw new Error("the website redirected too many times");
}

function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&(amp|nbsp);/g, (_, name) => (name === "amp" ? "&" : " "));
}

// Cloudflare's email obfuscation: hex string XOR-ed with its first byte.
function decodeCloudflareEmail(hex: string) {
  const key = parseInt(hex.slice(0, 2), 16);
  let email = "";
  for (let index = 2; index < hex.length; index += 2) {
    email += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16) ^ key);
  }
  return email;
}

const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;
const PHONE_PATTERN = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const IGNORED_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js)$|@(example|domain|email|sentry|wixpress|sentry-next)\.|^(user|name|your|you)@/i;

function extractContacts(html: string) {
  const decoded = decodeEntities(html);
  const emails: string[] = [];
  const phones: string[] = [];

  for (const match of decoded.matchAll(/data-cfemail="([0-9a-f]+)"/gi)) emails.push(decodeCloudflareEmail(match[1]));
  for (const match of decoded.matchAll(/mailto:([^"'?>\s]+)/gi)) emails.push(decodeURIComponent(match[1]));
  for (const match of decoded.matchAll(/tel:([^"'>]+)/gi)) phones.push(decodeURIComponent(match[1]));

  const text = decoded
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  emails.push(...(text.match(EMAIL_PATTERN) ?? []));
  phones.push(...(text.match(PHONE_PATTERN) ?? []));

  return {
    emails: emails.map((email) => email.trim().toLowerCase()).filter((email) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(email) && !IGNORED_EMAIL.test(email)),
    phones: phones.map(formatPhone).filter((phone): phone is string => phone != null),
  };
}

function contactLinks(html: string, pageUrl: string) {
  const base = new URL(pageUrl);
  const links = new Map<string, number>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = `${match[1]} ${match[2].replace(/<[^>]+>/g, " ")}`.toLowerCase();
    const score = /contact/.test(label) ? 3 : /referral|admission|location|about/.test(label) ? 1 : 0;
    if (!score) continue;
    try {
      const url = new URL(match[1], base);
      url.hash = "";
      if (url.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
      if (/\.(pdf|jpe?g|png|docx?)$/i.test(url.pathname)) continue;
      const key = url.toString();
      if (key !== pageUrl) links.set(key, Math.max(links.get(key) ?? 0, score));
    } catch {
      // ignore malformed links
    }
  }
  return [...links.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_EXTRA_PAGES).map(([url]) => url);
}

function rankByFrequency(values: string[], score: (value: string) => number = () => 0) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.keys()].sort((a, b) => score(b) - score(a) || counts.get(b)! - counts.get(a)!);
}

async function scanWebsite(website: string) {
  return withTimeout(PAGE_TIMEOUT_MS * 2, async (signal) => {
    const home = await fetchPage(website, signal);
    const pages = [home.html];
    const extra = await Promise.allSettled(contactLinks(home.html, home.url).map((url) => fetchPage(url, signal)));
    for (const page of extra) if (page.status === "fulfilled") pages.push(page.value.html);

    const found = pages.map(extractContacts);
    const people = peopleFromText(
      pages.map((page) => decodeEntities(page).replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).join(" ")
    );
    const siteDomain = new URL(home.url).hostname.replace(/^www\./, "");
    // Addresses for other departments are listed, but never used as the
    // facility's outreach email.
    const notForOutreach = (email: string) =>
      /noreply|no-reply|donotreply|privacy|webmaster|jobs|career|recruit|^hr$|billing|invoice|payable|vendor|media|press|compliance/
        .test(email.split("@")[0]);
    const emailScore = (email: string) => {
      const [local, domain] = email.split("@");
      let score = domain === siteDomain || domain.endsWith(`.${siteDomain}`) ? 4 : 0;
      if (/^(info|contact|admissions?|intake|referrals?|office|hello)$/.test(local)) score += 2;
      if (notForOutreach(email)) score -= 10;
      return score;
    };
    const emails = rankByFrequency(found.flatMap((page) => page.emails), emailScore).slice(0, 5);
    return {
      website: home.url,
      email: emails.find((email) => !notForOutreach(email)) ?? null,
      emails,
      phones: rankByFrequency(found.flatMap((page) => page.phones)).slice(0, 5),
      people,
    };
  });
}

// Open Source Data (OSD, Tavily web search): find the facility's own site when no directory had
// one, pick up contacts quoted in search snippets from that site, and find
// referral-relevant staff from LinkedIn search results (never LinkedIn pages).
async function searchWeb(facility: FacilityInput, result: Enrichment) {
  const place = [facility.city, "CA"].filter(Boolean).join(" ");
  const quotedName = `"${facility.name.replace(/"/g, "")}"`;

  if (!result.website) {
    const found = pickWebsite(facility.name, await webSearch(`${quotedName} ${place}`));
    if (found) {
      result.website = found;
      result.sources.website = "web_search";
    }
  }

  if (!result.email || !result.phone) {
    const siteHost = result.website ? hostOf(result.website) : null;
    const results = await webSearch(`${quotedName} ${place} contact email phone`);
    for (const item of results) {
      const text = `${item.description} ${item.extraSnippets.join(" ")}`;
      const contacts = extractContacts(text);
      const onOwnSite = siteHost != null && hostOf(item.url) === siteHost;
      // Only trust snippet emails on the facility's own domain, and snippet
      // phones that appear on the facility's own site.
      for (const email of contacts.emails) {
        if (siteHost && email.endsWith(`@${siteHost}`) && !result.emails.includes(email)) result.emails.push(email);
      }
      if (onOwnSite) for (const phone of contacts.phones) if (!result.phones.includes(phone)) result.phones.push(phone);
    }
    if (!result.email) {
      const email = result.emails.find((e) => !/noreply|no-reply|billing|vendor|media|press|privacy|jobs|career/.test(e));
      if (email) {
        result.email = email;
        result.sources.email = "web_search";
      }
    }
    if (!result.phone && result.phones[0]) {
      result.phone = result.phones[0];
      result.sources.phone = "web_search";
    }
  }

  const linkedIn = await webSearch(
    `${facility.name} case manager discharge planner director of nursing administrator`,
    { domain: "linkedin.com" }
  );
  for (const person of peopleFromLinkedInResults(facility.name, linkedIn)) {
    if (!result.people.some((p) => p.name === person.name)) result.people.push(person);
  }
}

// ---------------------------------------------------------------------------

function errorText(error: unknown) {
  if (error instanceof Error) return error.name === "AbortError" ? "the website took too long to respond" : error.message;
  return "the website couldn't be read";
}

async function enrich(facility: FacilityInput): Promise<Enrichment> {
  const result: Enrichment = {
    website: normalizeWebsite(facility.website),
    phone: facility.phone ? formatPhone(facility.phone) ?? facility.phone : null,
    email: null,
    emails: [],
    phones: [],
    sources: { website: null, phone: null, email: null },
    scanned: false,
    scanError: null,
    people: [],
    webSearch: { ran: false, note: null },
  };
  if (result.website) result.sources.website = "given";
  if (result.phone) result.sources.phone = "given";

  if (!result.website) {
    for (const [source, lookup] of [["google", lookupGoogle], ["openstreetmap", lookupOpenStreetMap]] as const) {
      const found = await lookup(facility).catch((error: unknown) => {
        console.warn(`${source} website lookup failed:`, error);
        return null;
      });
      if (!found) continue;
      if (!result.phone && found.phone) {
        result.phone = found.phone;
        result.sources.phone = source;
      }
      if (found.website) {
        result.website = found.website;
        result.sources.website = source;
        break;
      }
    }
  }

  // Without a website from the record or a directory, try web search first so
  // the site it finds can be scanned below.
  const searchEnabled = webSearchConfigured();
  let searchedEarly = false;
  if (!result.website && searchEnabled) {
    searchedEarly = true;
    await searchWeb(facility, result).then(
      () => { result.webSearch.ran = true; },
      (error: unknown) => { result.webSearch.note = error instanceof Error ? error.message : "OSD search failed."; }
    );
  }

  if (result.website) {
    try {
      const scan = await scanWebsite(result.website);
      result.scanned = true;
      result.emails = [...new Set([...scan.emails, ...result.emails])];
      result.phones = [...new Set([...scan.phones, ...result.phones])];
      for (const person of scan.people) {
        if (!result.people.some((p) => p.name === person.name)) result.people.push(person);
      }
      if (scan.email) {
        result.email = scan.email;
        result.sources.email = "website";
      }
      if (!result.phone && scan.phones[0]) {
        result.phone = scan.phones[0];
        result.sources.phone = "website";
      }
    } catch (error) {
      result.scanError = `Couldn't scan the website: ${errorText(error)}.`;
    }
  }

  if (searchEnabled && !searchedEarly) {
    await searchWeb(facility, result).then(
      () => { result.webSearch.ran = true; },
      (error: unknown) => { result.webSearch.note = error instanceof Error ? error.message : "OSD search failed."; }
    );
  } else if (!searchEnabled) {
    result.webSearch.note = "Open Source Data (OSD) isn't set up — add TAVILY_API_KEY in Vercel to also search the web.";
  }
  return result;
}

// "4929 Van Nuys Blvd, Sherman Oaks, CA, 91403" → "Sherman Oaks"
function cityFromAddress(address: string | null) {
  const parts = address?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  const stateIndex = parts.findIndex((part) => /^[A-Z]{2}(\s+\d{5})?$/.test(part));
  return stateIndex > 0 ? parts[stateIndex - 1] : null;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    respond(response, 405, { error: "Use POST to look up a facility's contact details." });
    return;
  }

  const body = (request.body && typeof request.body === "object" ? request.body : {}) as Record<string, unknown>;
  const name = nullableString(body.name);
  const { latitude, longitude } = body;
  if (
    !name ||
    typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
    typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180
  ) {
    respond(response, 400, { error: "A facility name and map location are required." });
    return;
  }

  const facility: FacilityInput = {
    name,
    address: nullableString(body.address),
    city: nullableString(body.city) ?? cityFromAddress(nullableString(body.address)),
    latitude,
    longitude,
    phone: nullableString(body.phone),
    website: nullableString(body.website),
  };
  const cacheKey = JSON.stringify(facility);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.loadedAt < CACHE_MS) {
    respond(response, 200, cached.result);
    return;
  }

  try {
    const result = await enrich(facility);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, { loadedAt: Date.now(), result });
    respond(response, 200, result);
  } catch (error) {
    console.error("Facility contact lookup failed:", error);
    respond(response, 502, { error: "Contact lookup failed unexpectedly. Please try again." });
  }
}
