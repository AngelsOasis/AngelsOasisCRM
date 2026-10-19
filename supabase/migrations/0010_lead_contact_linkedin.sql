-- LinkedIn profile of a lead's contact person, found by the Hospitals Map's
-- contact search; the CSV and PDF exports link the contact's name to it.
-- Run with: supabase db push   (or paste into the Supabase SQL editor)

alter table leads add column if not exists contact_linkedin_url text;
