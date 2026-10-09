-- ---------------------------------------------------------------------------
-- GoHighLevel connection — the Inbound Webhook URL used by the Leads page's
-- "Save to GHL" button (api/ghl-sync.ts). Stored here instead of a server env
-- var so admins can point the app at a different GHL account from Settings.
-- Single row: id is always true.
-- ---------------------------------------------------------------------------
create table if not exists ghl_settings (
  id boolean primary key default true check (id),
  inbound_webhook_url text check (inbound_webhook_url is null or inbound_webhook_url ~ '^https://'),
  updated_by uuid references profiles (id),
  updated_at timestamptz not null default now()
);

drop trigger if exists ghl_settings_set_updated_at on ghl_settings;
create trigger ghl_settings_set_updated_at before update on ghl_settings
  for each row execute function set_updated_at();

alter table ghl_settings enable row level security;

-- Only admins can see or change the URL directly.
drop policy if exists "admins read ghl settings" on ghl_settings;
create policy "admins read ghl settings" on ghl_settings
  for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "admins insert ghl settings" on ghl_settings;
create policy "admins insert ghl settings" on ghl_settings
  for insert with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

drop policy if exists "admins update ghl settings" on ghl_settings;
create policy "admins update ghl settings" on ghl_settings
  for update using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Whether a URL is saved — lets non-admins see the connection status on Settings.
create or replace function ghl_webhook_configured()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from ghl_settings where inbound_webhook_url is not null);
$$;

-- The URL itself, for api/ghl-sync.ts (called with the signed-in user's token).
-- Anyone signed in except read-only viewers may push leads to GHL.
create or replace function ghl_inbound_webhook_url()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select inbound_webhook_url from ghl_settings
  where auth.uid() is not null
    and not exists (select 1 from profiles where id = auth.uid() and role = 'viewer');
$$;

revoke all on function ghl_webhook_configured() from public, anon;
revoke all on function ghl_inbound_webhook_url() from public, anon;
grant execute on function ghl_webhook_configured() to authenticated;
grant execute on function ghl_inbound_webhook_url() to authenticated;
