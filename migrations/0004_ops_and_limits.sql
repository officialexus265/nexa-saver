-- Rate limits (serverless-friendly), reconciliation log, optional kill-switch is env-only.

create table if not exists rate_limits (
  bucket text primary key,
  hits integer not null default 0,
  window_start timestamptz not null default now()
);

create table if not exists reconciliation_runs (
  id serial primary key,
  ran_at timestamptz not null default now(),
  wallets_sum_tambala bigint not null,
  ledger_net_tambala bigint not null,
  deposits_success_tambala bigint not null,
  withdrawals_success_tambala bigint not null,
  platform_profit_tambala bigint not null,
  payout_reserve_tambala bigint not null,
  pending_stuck integer not null default 0,
  balanced boolean not null,
  notes text
);

create index if not exists reconciliation_runs_ran_at_idx on reconciliation_runs (ran_at desc);
