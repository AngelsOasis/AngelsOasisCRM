-- ---------------------------------------------------------------------------
-- Rooms and beds — the physical inventory behind Bed Space Availability:
--   facilities (sites)  →  facility_rooms  →  facility_beds
-- Each bed has one status: available | occupied | unavailable (Under
-- Maintenance). Rooms and beds are soft-deleted (deleted_at) so they can be
-- restored from the page's "Recently deleted" list.
--
-- Facility totals in facility_bed_availability (read by the Hospitals Map)
-- are kept in sync from the beds by a trigger.
-- ---------------------------------------------------------------------------
create table if not exists facility_rooms (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities (id) on delete cascade,
  room_code text not null check (char_length(btrim(room_code)) between 1 and 20),
  room_name text not null check (char_length(btrim(room_name)) between 1 and 20),
  created_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- A Room ID is unique within its site (ignoring case and deleted rooms).
create unique index if not exists facility_rooms_code_per_site
  on facility_rooms (facility_id, lower(btrim(room_code))) where deleted_at is null;
create index if not exists facility_rooms_facility on facility_rooms (facility_id);

create table if not exists facility_beds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references facility_rooms (id) on delete cascade,
  bed_number bigint generated always as identity unique,
  status text not null default 'available' check (status in ('available', 'occupied', 'unavailable')),
  created_by uuid references auth.users (id) default auth.uid(),
  updated_by uuid references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists facility_beds_room on facility_beds (room_id);

drop trigger if exists facility_rooms_set_updated_at on facility_rooms;
create trigger facility_rooms_set_updated_at before update on facility_rooms
  for each row execute function set_updated_at();
drop trigger if exists facility_beds_set_updated_at on facility_beds;
create trigger facility_beds_set_updated_at before update on facility_beds
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Access: everyone signed in can read; everyone except read-only viewers can
-- add, edit, delete and restore (same rule as the rest of Bed Space). There is
-- no hard-delete policy — deleting sets deleted_at.
-- ---------------------------------------------------------------------------
alter table facility_rooms enable row level security;
alter table facility_beds enable row level security;

drop policy if exists "authenticated read rooms" on facility_rooms;
create policy "authenticated read rooms" on facility_rooms
  for select using (auth.role() = 'authenticated');
drop policy if exists "non-viewers insert rooms" on facility_rooms;
create policy "non-viewers insert rooms" on facility_rooms
  for insert with check (
    auth.role() = 'authenticated'
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer')
  );
drop policy if exists "non-viewers update rooms" on facility_rooms;
create policy "non-viewers update rooms" on facility_rooms
  for update using (
    auth.role() = 'authenticated'
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer')
  ) with check (
    auth.role() = 'authenticated'
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer')
  );

drop policy if exists "authenticated read beds" on facility_beds;
create policy "authenticated read beds" on facility_beds
  for select using (auth.role() = 'authenticated');
drop policy if exists "non-viewers insert beds" on facility_beds;
create policy "non-viewers insert beds" on facility_beds
  for insert with check (
    auth.role() = 'authenticated'
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer')
  );
drop policy if exists "non-viewers update beds" on facility_beds;
create policy "non-viewers update beds" on facility_beds
  for update using (
    auth.role() = 'authenticated'
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer')
  ) with check (
    auth.role() = 'authenticated'
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer')
  );

-- ---------------------------------------------------------------------------
-- Delete / restore a room together with its beds, in one transaction. Beds
-- deleted with the room share its deleted_at, so restoring the room brings
-- back exactly those beds (not ones deleted individually earlier).
-- Runs as the caller, so the RLS policies above still apply.
-- ---------------------------------------------------------------------------
create or replace function delete_room(p_room_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  stamp timestamptz := now();
begin
  update facility_rooms set deleted_at = stamp where id = p_room_id and deleted_at is null;
  if not found then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;
  update facility_beds set deleted_at = stamp where room_id = p_room_id and deleted_at is null;
end;
$$;

create or replace function restore_room(p_room_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  stamp timestamptz;
begin
  select deleted_at into stamp from facility_rooms where id = p_room_id and deleted_at is not null;
  if stamp is null then
    raise exception 'Room not found' using errcode = 'P0002';
  end if;
  update facility_rooms set deleted_at = null where id = p_room_id;
  update facility_beds set deleted_at = null where room_id = p_room_id and deleted_at = stamp;
end;
$$;

grant execute on function delete_room(uuid) to authenticated;
grant execute on function restore_room(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Keep facility_bed_availability.total_beds / occupied_beds in step with the
-- beds, so the Hospitals Map shows the same numbers as this page.
-- ---------------------------------------------------------------------------
create or replace function sync_facility_bed_totals(p_facility_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  total integer;
  occupied integer;
begin
  select count(*), count(*) filter (where b.status = 'occupied')
    into total, occupied
  from facility_beds b
  join facility_rooms r on r.id = b.room_id
  where r.facility_id = p_facility_id and b.deleted_at is null and r.deleted_at is null;

  insert into facility_bed_availability (facility_id, total_beds, occupied_beds, updated_by)
  values (p_facility_id, total, occupied, auth.uid())
  on conflict (facility_id) do update
    set total_beds = excluded.total_beds,
        occupied_beds = excluded.occupied_beds,
        updated_by = excluded.updated_by;
end;
$$;
revoke execute on function sync_facility_bed_totals(uuid) from public, anon, authenticated;

create or replace function facility_beds_sync_totals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then
    perform sync_facility_bed_totals(r.facility_id) from facility_rooms r where r.id = old.room_id;
  end if;
  if tg_op <> 'DELETE' then
    perform sync_facility_bed_totals(r.facility_id) from facility_rooms r where r.id = new.room_id;
  end if;
  return null;
end;
$$;

create or replace function facility_rooms_sync_totals()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then perform sync_facility_bed_totals(old.facility_id); end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.facility_id is distinct from old.facility_id) then
    perform sync_facility_bed_totals(new.facility_id);
  end if;
  return null;
end;
$$;

drop trigger if exists facility_beds_sync_totals on facility_beds;
create trigger facility_beds_sync_totals after insert or update or delete on facility_beds
  for each row execute function facility_beds_sync_totals();

drop trigger if exists facility_rooms_sync_totals on facility_rooms;
create trigger facility_rooms_sync_totals after update of facility_id, deleted_at or delete on facility_rooms
  for each row execute function facility_rooms_sync_totals();
