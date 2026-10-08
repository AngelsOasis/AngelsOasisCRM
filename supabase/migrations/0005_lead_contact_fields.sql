-- The Hospitals Map saves each discovered facility's website and its source
-- record key on the lead. Older databases created from 0001 lack both columns.
alter table leads add column if not exists website text;
alter table leads add column if not exists place_id text;
