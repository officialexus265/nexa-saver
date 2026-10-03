-- Per-user daily withdraw cap that can rise after near-limit withdrawals.

alter table profiles
  add column if not exists daily_withdraw_cap_kwacha integer not null default 100000;

alter table profiles
  add column if not exists withdraw_cap_updated_at timestamptz not null default now();

comment on column profiles.daily_withdraw_cap_kwacha is
  'Current daily withdrawal limit in whole kwacha. Starts at 100000; auto 250000 after 14 days; higher tiers only after near-limit withdrawals.';
