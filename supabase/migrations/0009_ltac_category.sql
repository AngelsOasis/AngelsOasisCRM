-- Long-Term Acute Care (LTAC) hospitals as their own lead category.
-- Run with: supabase db push   (or paste into the Supabase SQL editor)

alter type lead_category add value if not exists 'ltac' after 'skilled_nursing_facility';

alter table campaigns drop constraint if exists campaigns_audience_check;
alter table campaigns
  add constraint campaigns_audience_check
    check (audience = 'all' or audience in (
      'hospital',
      'skilled_nursing_facility',
      'ltac',
      'rehab_center',
      'case_manager',
      'discharge_planner',
      'physician',
      'insurance_network',
      'healthcare_organization'
    ));
