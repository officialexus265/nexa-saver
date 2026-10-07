-- User voluntary time-lock on withdrawals + admin withdraw-only lock
alter table profiles
  add column if not exists withdraw_lock_until timestamptz,
  add column if not exists withdraw_lock_started_at timestamptz,
  add column if not exists withdraw_lock_cooling_ends_at timestamptz,
  add column if not exists withdraw_lock_original_until timestamptz,
  add column if not exists admin_withdraw_locked_at timestamptz,
  add column if not exists admin_withdraw_lock_reason text;

create table if not exists withdraw_lock_events (
  id bigserial primary key,
  user_id text not null references profiles(user_id),
  event_type text not null,
  lock_until timestamptz,
  fee_tambala bigint not null default 0,
  detail text,
  actor_user_id text,
  created_at timestamptz not null default now()
);

create index if not exists withdraw_lock_events_user_idx on withdraw_lock_events (user_id, created_at desc);
