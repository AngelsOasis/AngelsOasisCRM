export type LeadCategory =
  | "hospital"
  | "skilled_nursing_facility"
  | "rehab_center"
  | "case_manager"
  | "discharge_planner"
  | "physician"
  | "insurance_network"
  | "healthcare_organization";

export const LEAD_CATEGORIES: { value: LeadCategory; label: string }[] = [
  { value: "hospital", label: "Hospital" },
  { value: "skilled_nursing_facility", label: "Skilled Nursing Facility" },
  { value: "rehab_center", label: "Rehab Center" },
  { value: "case_manager", label: "Case Manager" },
  { value: "discharge_planner", label: "Discharge Planner" },
  { value: "physician", label: "Physician" },
  { value: "insurance_network", label: "Insurance Network" },
  { value: "healthcare_organization", label: "Healthcare Organization" },
];

export type LeadStatus =
  | "new"
  | "researched"
  | "contacted"
  | "engaged"
  | "referral_received"
  | "active_partner"
  | "dormant"
  | "do_not_contact";

export const LEAD_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "researched", label: "Researched" },
  { value: "contacted", label: "Contacted" },
  { value: "engaged", label: "Engaged" },
  { value: "referral_received", label: "Referral Received" },
  { value: "active_partner", label: "Active Partner" },
  { value: "dormant", label: "Dormant" },
  { value: "do_not_contact", label: "Do Not Contact" },
];

export type LeadSource = "manual" | "csv_import" | "map_discovery";

export interface Lead {
  id: string;
  facility_name: string;
  address: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  nearest_facility_id: string | null;
  distance_miles: number | null;
  contact_person: string | null;
  contact_title: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  place_id: string | null;
  category: LeadCategory;
  status: LeadStatus;
  source: LeadSource;
  notes: string | null;
  unsubscribed: boolean;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Facility {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;
  coverage_area: string | null;
  features: string[] | null;
  status: "open" | "coming_soon";
}

export type ApprovalStatus = "pending_approval" | "approved" | "rejected" | "needs_edit";
export type SendStatus = "draft" | "scheduled" | "sent" | "delivered" | "opened" | "clicked" | "replied" | "failed";
export type CampaignSendStatus = "draft" | "scheduled" | "sending" | "sent" | "failed";
export type CampaignDay = "monday" | "wednesday" | "friday";
export type CampaignAudience = LeadCategory | "all";

export interface Campaign {
  id: string;
  day: CampaignDay;
  send_date: string;
  title: string;
  is_library_draft: boolean;
  category: LeadCategory;
  audience: CampaignAudience;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  send_status: CampaignSendStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  recipient_count: number | null;
  send_error: string | null;
  created_at: string;
}

export interface AppSettings {
  sender_name: string;
  sender_email: string;
  reply_to_email: string | null;
  physical_address: string;
  site_url: string;
}

export interface ContentDraft {
  id: string;
  campaign_id: string;
  subject: string | null;
  body: string | null;
  cta: string | null;
  follow_up_body: string | null;
  social_version: string | null;
  blog_version: string | null;
  testimonial_id: string | null;
  generated_by_model: string | null;
  created_at: string;
}
