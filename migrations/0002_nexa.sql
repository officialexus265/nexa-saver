-- NEXA-SAVER app schema (profiles, wallets, ledger). Auth tables live in 0001.

create table if not exists profiles (
  user_id text primary key,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null unique,
  username text not null unique,
  date_of_birth date not null,
  pin_hash text not null,
  security_question text not null,
  security_answer_hash text not null,
  role text not null default 'user',
  must_change_password boolean not null default false,
  login_identifier_pref text not null default 'username',
  failed_pin_attempts integer not null default 0,
  pin_locked_until timestamptz,
  last_activity_at timestamptz not null default now(),
  pin_verified_at timestamptz,
  accepted_terms_at timestamptz not null default now(),
  accepted_privacy_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on profiles (email);
create index if not exists profiles_phone_idx on profiles (phone);
create index if not exists profiles_username_idx on profiles (username);
create index if not exists profiles_role_idx on profiles (role);

create table if not exists wallets (
  user_id text primary key references profiles (user_id) on delete cascade,
  balance_tambala bigint not null default 0,
  payout_reserve_tambala bigint not null default 0,
  lifetime_deposited_tambala bigint not null default 0,
  lifetime_withdrawn_tambala bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists transactions (
  id serial primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  kind text not null,
  status text not null,
  gross_tambala bigint not null default 0,
  credited_tambala bigint not null default 0,
  platform_profit_tambala bigint not null default 0,
  payout_reserve_tambala bigint not null default 0,
  phone text,
  reference text not null unique,
  provider_ref text,
  note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists transactions_user_id_idx on transactions (user_id, created_at desc);
create index if not exists transactions_status_idx on transactions (status);
create index if not exists transactions_kind_idx on transactions (kind);

create table if not exists platform_ledger (
  id serial primary key,
  transaction_id integer references transactions (id) on delete set null,
  entry_type text not null,
  amount_tambala bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists platform_ledger_type_idx on platform_ledger (entry_type);
