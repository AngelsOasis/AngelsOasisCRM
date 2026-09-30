-- Angels Oasis Referral Outreach AI — initial schema
-- Run with: supabase db push   (or paste into the Supabase SQL editor)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type lead_category as enum (
  'hospital',
  'skilled_nursing_facility',
  'rehab_center',
  'case_manager',
  'discharge_planner',
  'physician',
  'insurance_network',
  'healthcare_organization'
);

create type lead_status as enum (
  'new',
  'researched',
  'contacted',
  'engaged',
  'referral_received',
  'active_partner',
  'dormant',
  'do_not_contact'
);

create type lead_source as enum (
  'manual',
  'csv_import',
  'map_discovery'
);

create type campaign_day as enum ('monday', 'wednesday', 'friday');

-- content lifecycle vs. delivery lifecycle are tracked separately on purpose —
-- see the spec doc's Human-in-the-Loop section
create type approval_status as enum (
  'pending_approval',
  'approved',
  'rejected',
  'needs_edit'
);

create type send_status as enum (
  'draft',
  'scheduled',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'replied',
  'failed'
);

create type email_event_type as enum (
  'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'unsubscribed', 'failed'
);

create type user_role as enum ('admin', 'approver', 'staff', 'viewer');

-- ---------------------------------------------------------------------------
-- Profiles (roles) — one row per Supabase auth user
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role user_role not null default 'staff',
  notify_on_pending_approval boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Facilities — the two Angels Oasis locations
-- ---------------------------------------------------------------------------
create table facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  state text,
  zip text,
  latitude double precision,
  longitude double precision,
  coverage_area text,
  features text[],
  status text not null default 'open', -- 'open' | 'coming_soon'
  created_at timestamptz not null default now()
);

insert into facilities (name, address, city, state, zip, latitude, longitude, coverage_area, features, status)
values
  ('Angels Oasis — Valley Village (Flagship)', '12018 Sarah St.', 'Valley Village', 'CA', '91607',
   34.1614, -118.3942, 'Greater Los Angeles, San Fernando Valley',
   array['6 private rooms', 'Ensuite bathrooms', '3:1 staffing ratio', '24-hour care'], 'open'),
  ('Angels Oasis — San Jacinto', null, 'San Jacinto', 'CA', null,
   33.7839, -116.9581, 'Riverside County, Inland Empire',
   array['6 beds', '3:1 staffing ratio', '24-hour care'], 'coming_soon');

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  facility_name text not null,
  address text,
  county text,
  latitude double precision,
  longitude double precision,
  nearest_facility_id uuid references facilities (id),
  distance_miles numeric(6, 2),
  contact_person text,
  department text,
  email text,
  phone text,
  category lead_category not null,
  status lead_status not null default 'new',
  source lead_source not null default 'manual',
  notes text,
  unsubscribed boolean not null default false,
  last_contacted_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_status_idx on leads (status);
create index leads_category_idx on leads (category);
create index leads_nearest_facility_idx on leads (nearest_facility_id);

-- ---------------------------------------------------------------------------
-- Contacts — a lead can have more than one contact
-- ---------------------------------------------------------------------------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index contacts_lead_idx on contacts (lead_id);

-- ---------------------------------------------------------------------------
-- Testimonials — consent-gated, used by the Friday campaign / public site
-- ---------------------------------------------------------------------------
create table testimonials (
  id uuid primary key default gen_random_uuid(),
  author_name text not null,
  author_relationship text, -- 'resident' | 'family' | 'caregiver' | 'partner'
  quote text not null,
  consent_on_file boolean not null default false,
  consent_notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Campaigns — one row per scheduled send (e.g. "2026-09-28 Monday Newsletter")
-- ---------------------------------------------------------------------------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  day campaign_day not null,
  send_date date not null,
  title text not null,
  approval_status approval_status not null default 'pending_approval',
  approved_by uuid references profiles (id),
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_send_date_idx on campaigns (send_date);
create index campaigns_approval_status_idx on campaigns (approval_status);

-- ---------------------------------------------------------------------------
-- Content drafts — the AI Writer's output for a campaign, before it's split
-- into per-recipient emails
-- ---------------------------------------------------------------------------
create table content_drafts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  subject text,
  body text,
  cta text,
  follow_up_body text,
  social_version text,
  blog_version text,
  testimonial_id uuid references testimonials (id),
  generated_by_model text default 'deepseek',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Emails — one row per recipient per campaign send
-- ---------------------------------------------------------------------------
create table emails (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  contact_id uuid references contacts (id),
  to_email text not null,
  subject text,
  body text,
  status send_status not null default 'draft',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index emails_campaign_idx on emails (campaign_id);
create index emails_lead_idx on emails (lead_id);
create index emails_status_idx on emails (status);

-- ---------------------------------------------------------------------------
-- Email events — opens/clicks/replies/bounces per email
-- ---------------------------------------------------------------------------
create table email_events (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references emails (id) on delete cascade,
  event_type email_event_type not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb
);

create index email_events_email_idx on email_events (email_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_set_updated_at before update on leads
  for each row execute function set_updated_at();

create trigger campaigns_set_updated_at before update on campaigns
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — internal app data, authenticated staff only.
-- Tighten further with role checks (profiles.role) once your role list is final.
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table facilities enable row level security;
alter table leads enable row level security;
alter table contacts enable row level security;
alter table testimonials enable row level security;
alter table campaigns enable row level security;
alter table content_drafts enable row level security;
alter table emails enable row level security;
alter table email_events enable row level security;

create policy "authenticated read profiles" on profiles for select using (auth.role() = 'authenticated');
create policy "self update profile" on profiles for update using (auth.uid() = id);

create policy "authenticated read facilities" on facilities for select using (auth.role() = 'authenticated');

create policy "authenticated full access leads" on leads for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access contacts" on contacts for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access testimonials" on testimonials for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access campaigns" on campaigns for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access content_drafts" on content_drafts for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access emails" on emails for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access email_events" on email_events for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- NOTE: the send-trigger Edge Function must only move emails from
-- 'scheduled' -> 'sent' when the parent campaign's approval_status = 'approved'.
-- Enforce this in the function itself (see supabase/functions/ai-writer and the
-- README's "send job" section) since RLS alone can't express that cross-table rule.
