do $$
begin
  if exists (
    select 1
      from content_drafts d
      join campaigns c on c.id = d.campaign_id
     group by c.day
    having count(*) > 100
  ) then
    raise exception 'At least one campaign genre already has more than 100 drafts; clean up drafts before applying this limit.';
  end if;
end;
$$;

alter table campaigns
  add column if not exists is_library_draft boolean not null default false;

create table campaign_draft_genre_counts (
  genre campaign_day primary key,
  draft_count integer not null default 0 check (draft_count between 0 and 100)
);
alter table campaign_draft_genre_counts enable row level security;

insert into campaign_draft_genre_counts (genre, draft_count)
select genres.genre, count(d.id)::integer
  from unnest(enum_range(null::campaign_day)) as genres(genre)
  left join campaigns c on c.day = genres.genre
  left join content_drafts d on d.campaign_id = c.id
 group by genres.genre;

create or replace function maintain_campaign_draft_genre_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  draft_genre campaign_day;
  next_count integer;
begin
  if tg_op = 'DELETE' then
    select day into draft_genre from campaigns where id = old.campaign_id;
    if found then
      update campaign_draft_genre_counts
         set draft_count = greatest(draft_count - 1, 0)
       where genre = draft_genre;
    end if;
    return old;
  end if;

  select day into draft_genre from campaigns where id = new.campaign_id;
  if not found then
    raise exception 'Campaign % does not exist.', new.campaign_id using errcode = '23503';
  end if;

  insert into campaign_draft_genre_counts (genre, draft_count)
  values (draft_genre, 1)
  on conflict (genre) do update
     set draft_count = campaign_draft_genre_counts.draft_count + 1
   where campaign_draft_genre_counts.draft_count < 100
  returning draft_count into next_count;

  if not found then
    raise exception 'The maximum of 100 saved drafts for % has been reached.', draft_genre
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function release_campaign_draft_genre_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_count integer;
begin
  select count(*)::integer
    into removed_count
    from content_drafts
   where campaign_id = old.id;

  if removed_count > 0 then
    update campaign_draft_genre_counts
       set draft_count = greatest(draft_count - removed_count, 0)
     where genre = old.day;
  end if;

  return old;
end;
$$;

create trigger campaigns_release_draft_genre_counts
  before delete on campaigns
  for each row execute function release_campaign_draft_genre_counts();

create trigger content_drafts_genre_limit
  before insert or delete on content_drafts
  for each row execute function maintain_campaign_draft_genre_count();
