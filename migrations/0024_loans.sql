-- Loans against voluntary withdrawal time-lock (not admin lock)
create table if not exists loans (
  id bigserial primary key,
  reference text not null unique,
  user_id text not null references profiles(user_id),
  principal_tambala bigint not null check (principal_tambala > 0),
  balance_due_tambala bigint not null check (balance_due_tambala > 0),
  interest_rate_monthly numeric(8,6) not null default 0.03,
  ltv_rate numeric(8,6) not null default 0.90,
  collateral_tambala bigint not null,
  repayment_mode text not null check (repayment_mode in ('auto', 'manual')),
  status text not null default 'active'
    check (status in ('active', 'paid', 'closed_balance', 'cancelled')),
  started_at timestamptz not null default now(),
  next_period_at timestamptz not null,
  periods_elapsed integer not null default 0,
  last_notify_kind text,
  last_notified_at timestamptz,
  breakdown_json text,
  closed_at timestamptz,
  disbursement_tx_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loans_user_status_idx on loans (user_id, status);
create index if not exists loans_next_period_idx on loans (status, next_period_at)
  where status = 'active';

create table if not exists loan_events (
  id bigserial primary key,
  loan_id bigint not null references loans(id) on delete cascade,
  event_type text not null,
  detail text,
  balance_due_tambala bigint,
  created_at timestamptz not null default now()
);

insert into platform_settings (key, value, updated_at)
values ('loan_interest_monthly', '0.03', now())
on conflict (key) do nothing;

insert into platform_settings (key, value, updated_at)
values ('loan_ltv_rate', '0.90', now())
on conflict (key) do nothing;

insert into platform_settings (key, value, updated_at)
values ('loan_interest_earned_tambala', '0', now())
on conflict (key) do nothing;
