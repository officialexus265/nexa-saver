-- Track admin treasury payouts (platform profit cash-outs). Separate from saver wallets.
create table if not exists treasury_payouts (
  id bigserial primary key,
  admin_user_id text not null references profiles(user_id),
  gross_tambala bigint not null check (gross_tambala > 0),
  fee_tambala bigint not null default 0 check (fee_tambala >= 0),
  net_tambala bigint not null check (net_tambala > 0),
  phone text,
  reference text not null unique,
  status text not null default 'processing',
  note text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists treasury_payouts_created_idx on treasury_payouts (created_at desc);
