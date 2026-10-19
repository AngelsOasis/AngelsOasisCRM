// Map segments: the level of care a facility offers and the health system it
// belongs to. No dependencies, so the browser app uses the same rules.
// Files under api/_lib are not exposed as routes by Vercel.

export type Segment = "acute" | "subacute" | "ltac" | "va" | "snf" | "rehab" | "partner";
export type Network = "kaiser" | "providence" | "dignity" | "other";

// LTAC hospitals are licensed as general acute care hospitals, so only the
// name or a speciality tag tells them apart.
export const LTAC_PATTERN = /long[- ]?term acute|\bltach?\b|kindred hospital|vibra hospital|select specialty hospital/i;

// VA hospitals are federal, so they never appear in California's license data.
const VA_PATTERN = /\bva\b|\bv\.a\.|veteran|department of veterans affairs|\bvha\b|\bvamc\b/i;
const SUBACUTE_PATTERN = /sub[- ]?acute/i;

const NETWORK_PATTERNS: { network: Exclude<Network, "other">; pattern: RegExp }[] = [
  { network: "kaiser", pattern: /kaiser|permanente/i },
  { network: "providence", pattern: /providence|little company of mary/i },
  {
    network: "dignity",
    // Dignity Health hospitals mostly don't carry the brand in their licensed name.
    pattern: new RegExp(
      [
        "dignity health", "commonspirit", "california hospital medical center", "northridge hospital medical center",
        "glendale memorial", "st\\.? mary medical center[\\s,-]+long beach", "community hospital of san bernardino",
        "st\\.? bernardine", "marian regional", "french hospital", "arroyo grande community",
        "st\\.? john'?s regional", "st\\.? john'?s pleasant valley", "bakersfield memorial", "mercy hospital",
        "mercy medical center", "mercy general", "mercy san juan", "methodist hospital of sacramento",
        "woodland memorial", "sierra nevada memorial", "mark twain medical", "st\\.? joseph'?s medical center",
        "dominican hospital", "sequoia hospital", "saint francis memorial", "st\\.? mary'?s medical center",
      ].join("|"),
      "i"
    ),
  },
];

export function networkOf(...texts: (string | null | undefined)[]): Network {
  const text = texts.filter(Boolean).join(" ");
  return NETWORK_PATTERNS.find(({ pattern }) => pattern.test(text))?.network ?? "other";
}

// `category` is the stored lead category; `text` is the facility name plus any
// operator tag. Facility-type descriptions aren't used: OSD's search labels
// would mark every result of the VA or subacute search as such.
export function segmentOf(category: string, ...texts: (string | null | undefined)[]): Segment {
  const text = texts.filter(Boolean).join(" ");
  const clinical = category !== "case_manager" && category !== "discharge_planner" && category !== "insurance_network";
  if (clinical && VA_PATTERN.test(text)) return "va";
  if (category === "ltac" || LTAC_PATTERN.test(text)) return "ltac";
  if (SUBACUTE_PATTERN.test(text) && (category === "hospital" || category === "skilled_nursing_facility")) {
    return "subacute";
  }
  if (category === "hospital") return "acute";
  if (category === "skilled_nursing_facility") return "snf";
  if (category === "rehab_center") return "rehab";
  return "partner";
}
