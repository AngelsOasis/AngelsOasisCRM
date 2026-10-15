// Deciding whether a web address is a facility's own website or a directory
// page about it. No dependencies, so the browser app uses the same rules.

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
  "recovered.org", "callongtermcarecompare.org", "carechanges.com", "senioradvisor.com", "assistedliving.org",
  "caredash.com", "careindex.com", "rehabpath.com", "medicarelist.com", "hospitalsafetygrade.org",
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

// Whether `url` is the facility's own site rather than a page about it.
// Directory and review sites title their pages with the facility's name, so a
// matching title alone isn't enough: the domain must carry the name too
// ("shermanoakshospital.org"; domains usually run words together).
export function isOwnWebsite(name: string, url: string, title = "") {
  const host = hostOf(url);
  if (!host || isDirectoryHost(host) || host.endsWith(".gov")) return false;
  const tokens = nameTokens(name).filter((token) => token.length >= 3);
  if (!tokens.length) return false;
  const squashed = host.replace(/[^a-z0-9]/g, "");
  const domainScore = tokens.filter((token) => squashed.includes(token)).length / tokens.length;
  return domainScore >= 0.5 || (domainScore > 0 && nameMatch(name, title) >= 0.6);
}

