export type LeadCategory = 
  | 'Hospitals'
  | 'Skilled Nursing Facilities'
  | 'Rehab Centers'
  | 'Case Managers'
  | 'Discharge Planners'
  | 'Physicians'
  | 'Insurance Networks'
  | 'Healthcare Organizations';

export type PipelineStatus = 
  | 'New'
  | 'Researched'
  | 'Contacted'
  | 'Engaged'
  | 'Referral Received'
  | 'Active Partner'
  | 'Dormant'
  | 'Do Not Contact';

export type EmailSendStatus = 
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'failed';

export type CampaignCadenceDay = 'Monday' | 'Wednesday' | 'Friday';

export interface FacilityLocation {
  id: string;
  name: string;
  tagline: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  lat: number;
  lon: number;
  status: 'Open' | 'Coming Soon';
  beds: number;
  roomsDescription: string;
  careRatio: string;
  phone: string;
  fax: string;
  email: string;
  coverage: string;
  features: string[];
}

export interface ContactPerson {
  id: string;
  leadId: string;
  facilityName: string;
  fullName: string;
  title: string;
  department: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  notes?: string;
}

export interface OutreachEvent {
  id: string;
  leadId: string;
  campaignId?: string;
  campaignName: string;
  subject: string;
  sentAt: string;
  status: EmailSendStatus;
  openedAt?: string;
  clickedAt?: string;
  repliedAt?: string;
  recipientEmail: string;
  recipientName: string;
  previewText?: string;
}

export interface LeadRecord {
  id: string;
  hospitalName: string;
  address: string;
  city: string;
  county: string;
  lat: number;
  lon: number;
  distanceValleyVillage: number; // in miles
  distanceSanJacinto: number; // in miles
  contactPerson: string;
  contactTitle?: string;
  department: string;
  emailAddress: string;
  phoneNumber: string;
  referralType: LeadCategory;
  status: PipelineStatus;
  notes: string;
  lastContacted: string | null;
  qualificationScore?: number; // 0-100
  qualificationReason?: string;
  recommendedAction?: string;
  tags?: string[];
  outreachHistory: OutreachEvent[];
  source?: 'Overpass OSM' | 'Direct Intake' | 'Manual Research' | 'Inbound Referral';
}

export interface Campaign {
  id: string;
  day: CampaignCadenceDay;
  name: string;
  theme: string;
  audienceDescription: string;
  targetCategory: LeadCategory | 'All Leads';
  nextScheduledSend: string;
  status: 'Active' | 'Paused' | 'Draft';
  subjectTemplate: string;
  bodyTemplate: string;
  ctaText: string;
  ctaUrl: string;
  sentCount: number;
  openCount: number;
  clickCount: number;
  replyCount: number;
}

export interface AIContentGenerationRequest {
  campaignType: 'Monday Newsletter' | 'Wednesday Facility Education' | 'Friday Testimonials' | 'Custom Outreach';
  targetAudience?: string;
  specificTopic?: string;
  focusClinicalService?: string;
  tone?: 'Professional & Empathetic' | 'Clinical & Direct' | 'Warm Residential' | 'Executive Overview';
}

export interface AIContentGenerationResult {
  campaignType: string;
  subjectLine: string;
  emailBody: string;
  callToAction: {
    label: string;
    targetAction: string;
  };
  followUpEmail: {
    delayDays: number;
    subjectLine: string;
    body: string;
  };
  socialMediaVersion: {
    platform: 'LinkedIn' | 'Professional Network';
    content: string;
    hashtags: string[];
  };
  blogVersion: {
    title: string;
    excerpt: string;
    sections: { heading: string; content: string }[];
  };
  generatedAt: string;
}

export interface AILeadScoreResult {
  score: number;
  tier: 'High Priority' | 'Medium Priority' | 'Standard Lead';
  clinicalFitAnalysis: string;
  recommendedNextStep: string;
  suggestedTouchpointDay: 'Monday' | 'Wednesday' | 'Friday';
}
