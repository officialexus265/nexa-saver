-- Gender on profiles + known devices for new-login alerts.

alter table profiles
  add column if not exists gender text;

alter table profiles
  drop constraint if exists profiles_gender_check;

alter table profiles
  add constraint profiles_gender_check
  check (gender is null or gender in ('female', 'male', 'other', 'prefer_not_to_say'));

create table if not exists known_devices (
  id bigserial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  fingerprint text not null,
  user_agent text,
  last_ip text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create index if not exists known_devices_user_idx on known_devices (user_id, last_seen_at desc);
