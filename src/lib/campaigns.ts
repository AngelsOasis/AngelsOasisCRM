import { LEAD_CATEGORIES } from "./types";
import type { CampaignAudience, LeadCategory } from "./types";

export const AUDIENCES: { value: CampaignAudience; label: string }[] = [
  { value: "all", label: "All leads" },
  ...LEAD_CATEGORIES.map(({ value, label }) => ({ value, label })),
];

export function categoryLabel(category: LeadCategory): string {
  return LEAD_CATEGORIES.find(({ value }) => value === category)?.label ?? category;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}