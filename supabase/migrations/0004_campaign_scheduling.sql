alter type send_status add value if not exists 'sending';

alter table campaigns
  add column if not exists category lead_category not null default 'hospital',
  add column if not exists audience text not null default 'all',
  add column if not exists send_status send_status not null default 'draft',
  add column if not exists scheduled_for timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists recipient_count integer,
  add column if not exists send_error text,
  add column if not exists auto_send_enabled boolean not null default false,
  add column if not exists schedule_weekday smallint,
  add column if not exists schedule_time time,
  add column if not exists schedule_timezone text not null default 'America/Los_Angeles',
  add column if not exists last_auto_sent_date date;

update campaigns
   set audience = 'all'
 where audience not in (
   'all',
   'hospital',
   'skilled_nursing_facility',
   'rehab_center',
   'case_manager',
   'discharge_planner',
   'physician',
   'insurance_network',
   'healthcare_organization'
 );

alter table campaigns
  add constraint campaigns_audience_check
    check (audience = 'all' or audience in (
      'hospital',
      'skilled_nursing_facility',
      'rehab_center',
      'case_manager',
      'discharge_planner',
      'physician',
      'insurance_network',
      'healthcare_organization'
    )),
  add constraint campaigns_schedule_weekday_check
    check (schedule_weekday is null or schedule_weekday between 0 and 6),
  add constraint campaigns_schedule_settings_check
    check (
      (not auto_send_enabled)
      or (
        schedule_weekday is not null
        and schedule_time is not null
        and schedule_timezone = 'America/Los_Angeles'
      )
    );

create or replace function claim_due_campaign_sends()
returns table (campaign_id uuid)
language sql
security definer
set search_path = public
as $$
  with due as (
    select c.id
      from campaigns c
     where c.auto_send_enabled
       and not c.is_library_draft
       and c.approval_status = 'approved'
       and c.send_status::text <> 'sending'
       and exists (
         select 1
           from content_drafts d
          where d.campaign_id = c.id
            and nullif(trim(d.subject), '') is not null
            and nullif(trim(d.body), '') is not null
       )
       and c.schedule_timezone = 'America/Los_Angeles'
       and c.schedule_weekday = extract(dow from timezone(c.schedule_timezone, now()))::smallint
       and c.schedule_time <= timezone(c.schedule_timezone, now())::time
       and c.last_auto_sent_date is distinct from timezone(c.schedule_timezone, now())::date
       and exists (
         select 1
           from leads l
          where l.unsubscribed = false
            and l.status <> 'do_not_contact'
            and (c.audience = 'all' or l.category::text = c.audience)
            and (
              coalesce(trim(l.email), '') ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
              or exists (
                select 1
                  from contacts ct
                 where ct.lead_id = l.id
                   and coalesce(trim(ct.email), '') ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
              )
            )
       )
     order by c.schedule_time, c.created_at
     for update of c skip locked
  )
  update campaigns c
     set last_auto_sent_date = timezone(c.schedule_timezone, now())::date
    from due
   where c.id = due.id
  returning c.id;
$$;

revoke all on function claim_due_campaign_sends() from public, anon, authenticated;
grant execute on function claim_due_campaign_sends() to service_role;
