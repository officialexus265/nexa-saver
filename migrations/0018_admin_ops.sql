
-- Admin account lock + page visit analytics
alter table profiles
  add column if not exists admin_locked_at timestamptz,
  add column if not exists admin_lock_reason text;

create table if not exists page_visits (
  id bigserial primary key,
  user_id text,
  path text not null,
  visited_on date not null default (timezone('Africa/Blantyre', now())::date),
  hits int not null default 1,
  last_seen_at timestamptz not null default now(),
  unique (user_id, path, visited_on)
);

create index if not exists page_visits_day_idx on page_visits (visited_on);
create index if not exists page_visits_path_idx on page_visits (path, visited_on);
