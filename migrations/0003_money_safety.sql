-- Phase 1 money safety: CHECK constraints, status rules, append-only ledger,
-- idempotency keys, and processing status for withdrawals.

-- ── Wallets: never go negative ──────────────────────────────────────────────
alter table wallets
  drop constraint if exists wallets_balance_nonneg;
alter table wallets
  add constraint wallets_balance_nonneg check (balance_tambala >= 0);

alter table wallets
  drop constraint if exists wallets_reserve_nonneg;
alter table wallets
  add constraint wallets_reserve_nonneg check (payout_reserve_tambala >= 0);

alter table wallets
  drop constraint if exists wallets_lifetime_dep_nonneg;
alter table wallets
  add constraint wallets_lifetime_dep_nonneg check (lifetime_deposited_tambala >= 0);

alter table wallets
  drop constraint if exists wallets_lifetime_wth_nonneg;
alter table wallets
  add constraint wallets_lifetime_wth_nonneg check (lifetime_withdrawn_tambala >= 0);

-- ── Transactions: positive amounts where meaningful, allowed statuses ───────
alter table transactions
  drop constraint if exists transactions_kind_check;
alter table transactions
  add constraint transactions_kind_check check (kind in ('deposit', 'withdrawal'));

alter table transactions
  drop constraint if exists transactions_status_check;
alter table transactions
  add constraint transactions_status_check
  check (status in ('pending', 'processing', 'success', 'failed'));

alter table transactions
  drop constraint if exists transactions_gross_nonneg;
alter table transactions
  add constraint transactions_gross_nonneg check (gross_tambala >= 0);

alter table transactions
  drop constraint if exists transactions_credited_nonneg;
alter table transactions
  add constraint transactions_credited_nonneg check (credited_tambala >= 0);

-- ── Platform ledger: append-only (no UPDATE / DELETE) ───────────────────────
create or replace function platform_ledger_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'platform_ledger is append-only';
end;
$$;

drop trigger if exists platform_ledger_no_update on platform_ledger;
create trigger platform_ledger_no_update
  before update or delete on platform_ledger
  for each row execute procedure platform_ledger_immutable();

-- ── Idempotency keys (client-supplied unique key per deposit/withdraw tap) ──
create table if not exists idempotency_keys (
  key text primary key,
  user_id text not null,
  action text not null,
  response_json text,
  created_at timestamptz not null default now()
);

create index if not exists idempotency_keys_user_idx on idempotency_keys (user_id, created_at desc);

-- Optional: prune keys older than 7 days in a later job; keep for now.
