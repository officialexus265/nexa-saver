-- Referral / affiliate program
alter table profiles
  add column if not exists affiliate_code text,
  add column if not exists affiliate_joined_at timestamptz,
  add column if not exists referred_by_user_id text references profiles(user_id),
  add column if not exists referral_code_used text,
  add column if not exists first_deposit_referral_paid boolean not null default false;

create unique index if not exists profiles_affiliate_code_uidx
  on profiles (affiliate_code) where affiliate_code is not null;

create table if not exists affiliate_wallets (
  user_id text primary key references profiles(user_id) on delete cascade,
  balance_tambala bigint not null default 0 check (balance_tambala >= 0),
  lifetime_earned_tambala bigint not null default 0,
  lifetime_withdrawn_tambala bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists affiliate_earnings (
  id bigserial primary key,
  affiliate_user_id text not null references profiles(user_id),
  from_user_id text not null references profiles(user_id),
  deposit_reference text not null,
  gross_deposit_tambala bigint not null,
  commission_tambala bigint not null,
  created_at timestamptz not null default now(),
  unique (from_user_id) -- only first deposit ever pays commission
);

create index if not exists affiliate_earnings_aff_idx
  on affiliate_earnings (affiliate_user_id, created_at desc);

insert into platform_settings (key, value, updated_at) values
  ('referral_program_enabled', 'true', now()),
  ('referral_commission_rate', '0.01', now()),
  ('referral_withdraw_min_kwacha', '500', now()),
  ('referral_withdraw_fee_rate', '0.03', now()),
  ('og_share_title', 'NEXA-SAVER — save with confidence', now()),
  ('og_share_description', 'A simple vault for Malawi. Deposit, lock, and withdraw on your terms.', now()),
  ('og_share_image', '/og.jpg', now()),
  ('og_referral_title', 'Join me on NEXA-SAVER', now()),
  ('og_referral_description', 'Open your vault with my invite. First deposit supports both of us.', now()),
  ('og_referral_image', '/og.jpg', now())
on conflict (key) do nothing;

insert into platform_settings (key, value, updated_at)
values ('signup_intro_youtube', '', now())
on conflict (key) do nothing;
