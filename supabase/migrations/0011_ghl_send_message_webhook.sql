-- ---------------------------------------------------------------------------
-- Second GHL webhook — used by the Leads page's "Send Message" modal
-- (api/ghl-send-message.ts). Stored separately so it can point at a different
-- GHL workflow from the "Save to GHL" button (inbound_webhook_url).
-- ---------------------------------------------------------------------------
alter table ghl_settings
  add column if not exists send_message_webhook_url text
    check (send_message_webhook_url is null or send_message_webhook_url ~ '^https://');

-- The URL itself, for api/ghl-send-message.ts.
create or replace function ghl_send_message_webhook_url()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select send_message_webhook_url from ghl_settings where auth.uid() is not null;
$$;

revoke all on function ghl_send_message_webhook_url() from public, anon;
grant execute on function ghl_send_message_webhook_url() to authenticated;
