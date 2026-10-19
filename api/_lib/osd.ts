// Shared OSD (Open Source Data) helpers: Tavily web search plus the
// parsing used to turn search results and facility web pages into websites,
// contacts, and named people.
// Files under api/_lib are not exposed as routes by Vercel.

import { hostOf, isOwnWebsite, nameMatch } from "./website-match.js";
import { networkOf } from "./segments.js";
export { hostOf, isDirectoryHost, isOwnWebsite, nameMatch, nameTokens } from "./website-match.js";

declare const process: {
  env: Record<string, string | undefined>;
};

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  extraSnippets: string[];
}

export interface Person {
  name: string;
  title: string;
  source: "website" | "linkedin";
  url: string | null;
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const SEARCH_TIMEOUT_MS = 8_000;

export function tavilyKey() {
  return (process.env.TAVILY_API_KEY ?? process.env.TAVILY_KEY)?.trim() || null;
}

export function webSearchConfigured() {
  return tavilyKey() != null;
}

export const OSD_NOT_CONFIGURED =
  "Open Source Data (OSD) isn't set up yet. Add a TAVILY_API_KEY environment variable in Vercel and redeploy.";

async function tavilySearch(query: string, count: number, domain?: string): Promise<SearchResult[]> {
  const key = tavilyKey();
  if (!key) throw new Error(OSD_NOT_CONFIGURED);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS * 2);
  try {
    const response = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        query,
        max_results: Math.min(count, 20),
        search_depth: "basic",
        ...(domain ? { include_domains: [domain] } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { detail?: { error?: string } | string } | null;
      const detail = typeof body?.detail === "string" ? body.detail : body?.detail?.error;
      if (response.status === 401 || response.status === 403) {
        throw new Error("Tavily rejected the API key — check TAVILY_API_KEY in Vercel");
      }
      if (response.status === 429 || response.status === 432 || response.status === 433) {
        throw new Error("Tavily rate limit or plan credits reached");
      }
      throw new Error(`Tavily returned ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const payload = (await response.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (payload.results ?? []).flatMap((result) =>
      result.url
        ? [{ title: result.title ?? "", url: result.url, description: result.content ?? "", extraSnippets: [] }]
        : []
    );
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Tavily timed out");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Web search (Tavily) used by every OSD feature. Write queries in plain words
// (no OR/site: operators); `domain` limits results to one site, e.g. linkedin.com.
export function webSearch(query: string, options: { count?: number; domain?: string } = {}) {
  return tavilySearch(query, options.count ?? 10, options.domain);
}

// The facility's own website, picked from search results: not a directory,
// and its domain must carry the facility name (see isOwnWebsite).
export function pickWebsite(name: string, results: SearchResult[]) {
  for (const result of results) {
    if (isOwnWebsite(name, result.url, result.title)) return new URL(result.url).origin + "/";
  }
  return null;
}

// Referral-relevant roles to look for on websites and in search results.
// Case managers come first: they're the main referral source, and the longer
// titles must precede "Case Manager" so the most specific one is matched.
const CASE_MANAGER_ROLES = [
  "Inpatient Case Manager", "Acute Care Case Manager", "Hospital Case Manager", "RN Case Manager",
  "Registered Nurse Case Manager", "Nurse Case Manager", "Clinical Case Manager", "Case Manager RN",
  "Director of Case Management", "Manager of Case Management", "Case Management Manager",
  "Case Management Director", "Case Manager",
];
const ROLES = [
  ...CASE_MANAGER_ROLES,
  "Discharge Planner", "Director of Nursing", "Assistant Director of Nursing", "Administrator",
  "Executive Director", "Admissions Director", "Admissions Coordinator", "Director of Admissions",
  "Social Services Director", "Director of Social Services", "Social Worker", "Community Liaison",
  "Marketing Director", "Director of Marketing", "Clinical Liaison", "Medical Director", "Director of Rehab",
  "Director of Rehabilitation", "Utilization Review Nurse", "Utilization Review", "Care Transitions Coordinator",
  "Care Coordinator", "Intake Coordinator", "Chief Nursing Officer",
];

export function isCaseManager(title: string) {
  return /case manage/i.test(title);
}

// Case managers first, inpatient ones ahead of the rest, then discharge planners.
function personRank(person: Person) {
  if (/inpatient|acute|hospital/i.test(person.title) && isCaseManager(person.title)) return 0;
  if (isCaseManager(person.title)) return 1;
  if (/discharge|utilization|care transitions/i.test(person.title)) return 2;
  return 3;
}

export function rankPeople(people: Person[]) {
  return [...people].sort((a, b) => personRank(a) - personRank(b));
}
const ROLE_PATTERN = ROLES.map((role) => role.replace(/ /g, "\\s+")).join("|");
const NAME_PATTERN = "[A-Z][a-z'’-]+(?:\\s+[A-Z]\\.)?(?:\\s+[A-Z][a-z'’-]+){1,2}";
const CREDENTIALS = "(?:,?\\s*(?:RN|LVN|BSN|MSN|MSW|LCSW|MBA|NHA|MD|DO|PT|DPT|OTR|CCM|MHA)\\b)*";

function canonicalRole(text: string) {
  const normalized = text.replace(/\s+/g, " ").toLowerCase();
  return ROLES.find((role) => role.toLowerCase() === normalized) ?? text.replace(/\s+/g, " ");
}

const NOT_A_NAME = /\b(Contact|Our|Your|The|Meet|About|Call|Email|Phone|Team|Staff|Director|Manager|Nursing|Center|Hospital|Health|Care|Home|Rehab|Services?)\b/;

function plausibleName(name: string) {
  return !NOT_A_NAME.test(name) && name.length <= 40;
}

// "Jane Doe, RN – Director of Nursing" or "Administrator: John Smith"
export function peopleFromText(text: string): Person[] {
  const people = new Map<string, Person>();
  const nameThenRole = new RegExp(`(${NAME_PATTERN})${CREDENTIALS}\\s*[,|–—:-]?\\s*(${ROLE_PATTERN})\\b`, "g");
  const roleThenName = new RegExp(`\\b(${ROLE_PATTERN})\\s*[:–—-]\\s*(${NAME_PATTERN})`, "g");
  for (const match of text.matchAll(nameThenRole)) {
    if (plausibleName(match[1])) people.set(match[1], { name: match[1], title: canonicalRole(match[2]), source: "website", url: null });
  }
  for (const match of text.matchAll(roleThenName)) {
    if (plausibleName(match[2]) && !people.has(match[2])) {
      people.set(match[2], { name: match[2], title: canonicalRole(match[1]), source: "website", url: null });
    }
  }
  return rankPeople([...people.values()]).slice(0, 8);
}

// LinkedIn search-result titles look like "Jane Doe - Case Manager - Facility | LinkedIn".
// Only the search result (title + snippet) is used; LinkedIn pages are never fetched.
export function peopleFromLinkedInResults(facilityName: string, results: SearchResult[]): Person[] {
  const people = new Map<string, Person>();
  const roleRegex = new RegExp(`\\b(${ROLE_PATTERN})\\b`, "gi");
  const facilityNetwork = networkOf(facilityName);
  for (const result of results) {
    if (!/linkedin\.com\/in\//i.test(result.url)) continue;
    const text = `${result.title} ${result.description} ${result.extraSnippets.join(" ")}`;
    // Must clearly be about this facility. Health-system staff list the system
    // ("Kaiser Permanente") rather than the licensed hospital name.
    const match = nameMatch(facilityName, text);
    const sameSystem = facilityNetwork !== "other" && networkOf(text) === facilityNetwork;
    if (match < 0.6 && !(sameSystem && match >= 0.3)) continue;
    // The headline in the title is the person's own job; the snippet may
    // mention other roles. Prefer the highest-priority role in the title.
    const roles = [...result.title.matchAll(roleRegex)].map((m) => canonicalRole(m[1]));
    if (!roles.length) roles.push(...[...text.matchAll(roleRegex)].map((m) => canonicalRole(m[1])));
    const name = result.title.split(/\s+[-–—|]\s+/)[0]?.replace(/,.*$/, "").trim();
    if (!roles.length || !name || !new RegExp(`^${NAME_PATTERN}$`).test(name) || !plausibleName(name)) continue;
    const [person] = rankPeople(roles.map((role) => ({ name, title: role, source: "linkedin" as const, url: result.url })));
    if (!people.has(name)) people.set(name, person);
  }
  return rankPeople([...people.values()]).slice(0, 8);
}
