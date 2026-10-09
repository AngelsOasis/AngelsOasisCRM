// Shared OSD (Open Source Data) helpers: Tavily web search plus the
// parsing used to turn search results and facility web pages into websites,
// contacts, and named people.
// Files under api/_lib are not exposed as routes by Vercel.

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

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Listing and review sites describe many facilities; never treat them as a
// facility's own website.
const DIRECTORY_HOSTS = [
  "yelp.com", "facebook.com", "linkedin.com", "instagram.com", "twitter.com", "x.com", "youtube.com",
  "healthgrades.com", "vitals.com", "webmd.com", "zocdoc.com", "medicare.gov", "cms.gov", "ca.gov",
  "caring.com", "aplaceformom.com", "seniorly.com", "seniorcare.com", "seniorhousingnet.com", "nursinghomes.com",
  "usnews.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "mapquest.com", "yellowpages.com",
  "bbb.org", "manta.com", "npiprofile.com", "npino.com", "npidb.org", "hipaaspace.com", "opennpi.com",
  "propublica.org", "wikipedia.org", "google.com", "bing.com", "apple.com", "nextdoor.com", "angi.com",
  "chamberofcommerce.com", "superpages.com", "findhelp.org", "carelistings.com", "hospicedirectory.org",
  "homehealthcareagencies.com", "skillednursingfacilities.org", "nursinghomedatabase.com", "medicaid.gov",
  "care.com", "rehabs.com", "recovery.com", "addictioncenter.com", "rehab.com", "psychologytoday.com",
  "healthline.com", "medicalnewstoday.com", "sharecare.com", "doctor.com", "agingcare.com",
  "payingforseniorcare.com", "seniorliving.org", "familyassets.com", "tripadvisor.com", "birdeye.com",
];

export function isDirectoryHost(host: string) {
  return DIRECTORY_HOSTS.some((directory) => host === directory || host.endsWith(`.${directory}`));
}

const STOP_WORDS = new Set([
  "the", "of", "and", "at", "inc", "llc", "lp", "ltd", "corp", "co", "a", "an", "dba", "center", "centre",
  "healthcare", "health", "care", "medical", "services", "service", "facility", "california", "ca",
]);

export function nameTokens(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

// Share of the facility name's distinctive words that appear in `text`.
export function nameMatch(name: string, text: string) {
  const tokens = nameTokens(name);
  if (!tokens.length) return 0;
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return tokens.filter((token) => haystack.includes(` ${token} `)).length / tokens.length;
}

// The facility's own website, picked from search results: not a directory,
// and the result's title or domain must carry most of the facility name.
export function pickWebsite(name: string, results: SearchResult[]) {
  for (const result of results) {
    const host = hostOf(result.url);
    if (!host || isDirectoryHost(host) || host.endsWith(".gov")) continue;
    // Domains usually run words together ("shermanoakshospital.org").
    const tokens = nameTokens(name);
    const squashed = host.replace(/[^a-z0-9]/g, "");
    const domainScore = tokens.length ? tokens.filter((token) => squashed.includes(token)).length / tokens.length : 0;
    const score = Math.max(nameMatch(name, result.title), domainScore);
    if (score >= 0.6) return new URL(result.url).origin + "/";
  }
  return null;
}

// Referral-relevant roles to look for on websites and in search results.
const ROLES = [
  "Case Manager", "Discharge Planner", "Director of Nursing", "Assistant Director of Nursing", "Administrator",
  "Executive Director", "Admissions Director", "Admissions Coordinator", "Director of Admissions",
  "Social Services Director", "Director of Social Services", "Social Worker", "Community Liaison",
  "Marketing Director", "Director of Marketing", "Clinical Liaison", "Medical Director", "Director of Rehab",
  "Director of Rehabilitation", "Utilization Review", "Care Coordinator", "Intake Coordinator",
  "Chief Nursing Officer", "Director of Case Management", "Clinical Case Manager", "Nurse Case Manager",
];
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
  return [...people.values()].slice(0, 8);
}

// LinkedIn search-result titles look like "Jane Doe - Case Manager - Facility | LinkedIn".
// Only the search result (title + snippet) is used; LinkedIn pages are never fetched.
export function peopleFromLinkedInResults(facilityName: string, results: SearchResult[]): Person[] {
  const people = new Map<string, Person>();
  const roleRegex = new RegExp(`\\b(${ROLE_PATTERN})\\b`, "i");
  for (const result of results) {
    if (!/linkedin\.com\/in\//i.test(result.url)) continue;
    const text = `${result.title} ${result.description} ${result.extraSnippets.join(" ")}`;
    if (nameMatch(facilityName, text) < 0.6) continue; // must clearly be about this facility
    const role = text.match(roleRegex);
    const name = result.title.split(/\s+[-–—|]\s+/)[0]?.replace(/,.*$/, "").trim();
    if (!role || !name || !new RegExp(`^${NAME_PATTERN}$`).test(name) || !plausibleName(name)) continue;
    if (!people.has(name)) people.set(name, { name, title: canonicalRole(role[1]), source: "linkedin", url: result.url });
  }
  return [...people.values()].slice(0, 5);
}
