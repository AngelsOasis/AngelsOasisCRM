-- ---------------------------------------------------------------------------
-- Auto-approve campaigns — no manual approval step.
--
-- New campaigns are created as 'approved', and anything that tries to put a
-- campaign back into 'pending_approval' / 'needs_edit' (including Edge
-- Functions that set it explicitly) is approved instead. 'rejected' is left
-- alone so a campaign can still be cancelled.
--
-- Existing rows are NOT touched here, because approving an overdue scheduled
-- campaign makes it send right away. To approve them too, run:
--   update campaigns set approval_status = 'approved'
--   where approval_status in ('pending_approval', 'needs_edit');
-- ---------------------------------------------------------------------------
alter table campaigns alter column approval_status set default 'approved';

create or replace function auto_approve_campaign()
returns trigger as $$
begin
  if new.approval_status in ('pending_approval', 'needs_edit') then
    new.approval_status = 'approved';
  end if;
  if new.approval_status = 'approved' and new.approved_at is null then
    new.approved_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger campaigns_auto_approve before insert or update on campaigns
  for each row execute function auto_approve_campaign();
