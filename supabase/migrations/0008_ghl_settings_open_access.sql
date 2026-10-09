-- ---------------------------------------------------------------------------
-- GoHighLevel connection — drop the role restrictions from 0007. Anyone signed
-- in can view and change the Inbound Webhook URL in Settings → GoHighLevel and
-- use the Leads page's "Save to GHL" button.
-- ---------------------------------------------------------------------------
drop policy if exists "admins read ghl settings" on ghl_settings;
drop policy if exists "admins insert ghl settings" on ghl_settings;
drop policy if exists "admins update ghl settings" on ghl_settings;

drop policy if exists "authenticated read ghl settings" on ghl_settings;
create policy "authenticated read ghl settings" on ghl_settings
  for select using (auth.role() = 'authenticated');

drop policy if exists "authenticated insert ghl settings" on ghl_settings;
create policy "authenticated insert ghl settings" on ghl_settings
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "authenticated update ghl settings" on ghl_settings;
create policy "authenticated update ghl settings" on ghl_settings
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Same function api/ghl-sync.ts calls, now for every signed-in user.
create or replace function ghl_inbound_webhook_url()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select inbound_webhook_url from ghl_settings where auth.uid() is not null;
$$;
