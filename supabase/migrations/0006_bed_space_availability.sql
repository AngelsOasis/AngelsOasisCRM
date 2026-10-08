-- ---------------------------------------------------------------------------
-- Bed space availability — one row per Angels Oasis facility, edited from the
-- Bed Space Availability page. Kept separate from `facilities` so editing bed
-- counts never grants write access to facility names or addresses.
-- ---------------------------------------------------------------------------
create table if not exists facility_bed_availability (
  facility_id uuid primary key references facilities (id) on delete cascade,
  total_beds integer not null default 0 check (total_beds >= 0),
  occupied_beds integer not null default 0 check (occupied_beds >= 0),
  shared_rooms_total integer not null default 0 check (shared_rooms_total >= 0),
  shared_rooms_occupied integer not null default 0 check (shared_rooms_occupied >= 0),
  private_rooms_total integer not null default 0 check (private_rooms_total >= 0),
  private_rooms_occupied integer not null default 0 check (private_rooms_occupied >= 0),
  availability_status text not null default 'open'
    check (availability_status in ('open', 'closing_soon', 'full')),
  accepting_referrals boolean not null default true,
  notes text,
  updated_by uuid references auth.users (id) default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint occupied_beds_within_total check (occupied_beds <= total_beds),
  constraint shared_rooms_within_total check (shared_rooms_occupied <= shared_rooms_total),
  constraint private_rooms_within_total check (private_rooms_occupied <= private_rooms_total)
);

drop trigger if exists facility_bed_availability_set_updated_at on facility_bed_availability;
create trigger facility_bed_availability_set_updated_at before update on facility_bed_availability
  for each row execute function set_updated_at();

alter table facility_bed_availability enable row level security;

drop policy if exists "authenticated read bed availability" on facility_bed_availability;
create policy "authenticated read bed availability" on facility_bed_availability
  for select using (auth.role() = 'authenticated');

-- Everyone signed in except read-only viewers may update bed counts.
drop policy if exists "non-viewers insert bed availability" on facility_bed_availability;
create policy "non-viewers insert bed availability" on facility_bed_availability
  for insert with check (
    auth.role() = 'authenticated'
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer')
  );

drop policy if exists "non-viewers update bed availability" on facility_bed_availability;
create policy "non-viewers update bed availability" on facility_bed_availability
  for update using (
    auth.role() = 'authenticated'
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer')
  ) with check (
    auth.role() = 'authenticated'
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer')
  );

-- ---------------------------------------------------------------------------
-- New locations — the "Add Location" form inserts into `facilities`, which the
-- Hospitals Map, Leads, and Facilities pages all read from. Same rule: anyone
-- signed in except read-only viewers. Existing locations stay read-only.
-- ---------------------------------------------------------------------------
drop policy if exists "non-viewers insert facilities" on facilities;
create policy "non-viewers insert facilities" on facilities
  for insert with check (
    auth.role() = 'authenticated'
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer')
  );

-- ---------------------------------------------------------------------------
-- Starting bed counts for the two original locations (the figures from the
-- Bed Space Availability mockup). Replace them from the page's Edit dialog.
-- `on conflict do nothing` keeps any counts already entered if this re-runs.
-- ---------------------------------------------------------------------------
insert into facility_bed_availability (
  facility_id, total_beds, occupied_beds,
  shared_rooms_total, shared_rooms_occupied, private_rooms_total, private_rooms_occupied,
  availability_status, accepting_referrals, notes, updated_by
)
select f.id, s.total_beds, s.occupied_beds,
       s.shared_rooms_total, s.shared_rooms_occupied, s.private_rooms_total, s.private_rooms_occupied,
       s.availability_status, s.accepting_referrals, null, null
from (values
  ('%Valley Village%', 120, 102, 60, 50, 20, 12, 'open', true),
  ('%San Jacinto%',     80,  20, 40, 10, 40, 10, 'open', true)
) as s (name_pattern, total_beds, occupied_beds,
        shared_rooms_total, shared_rooms_occupied, private_rooms_total, private_rooms_occupied,
        availability_status, accepting_referrals)
join lateral (
  select id from facilities where name ilike s.name_pattern order by created_at limit 1
) f on true
on conflict (facility_id) do nothing;
