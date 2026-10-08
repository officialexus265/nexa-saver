-- Peer-to-peer send (transfer) + reversal freeze workflow
create table if not exists transfers (
  id bigserial primary key,
  reference text not null unique,
  from_user_id text not null references profiles(user_id),
  to_user_id text not null references profiles(user_id),
  amount_tambala bigint not null check (amount_tambala > 0),
  fee_tambala bigint not null default 0 check (fee_tambala >= 0),
  from_phone text,
  to_phone text not null,
  to_display_name text,
  status text not null default 'completed'
    check (status in ('completed', 'reversal_requested', 'frozen', 'reversed', 'released')),
  frozen_at timestamptz,
  frozen_until timestamptz,
  reversed_at timestamptz,
  released_at timestamptz,
  out_tx_id integer,
  in_tx_id integer,
  fee_tx_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transfers_from_idx on transfers (from_user_id, created_at desc);
create index if not exists transfers_to_idx on transfers (to_user_id, created_at desc);
create index if not exists transfers_status_idx on transfers (status);
create index if not exists transfers_ref_idx on transfers (reference);

create table if not exists transfer_reversal_requests (
  id bigserial primary key,
  transfer_id bigint not null references transfers(id) on delete cascade,
  requested_by text not null references profiles(user_id),
  status text not null default 'pending'
    check (status in ('pending', 'frozen', 'reversed', 'released', 'cancelled')),
  user_note text,
  admin_note text,
  handled_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transfer_reversal_req_status_idx
  on transfer_reversal_requests (status, created_at desc);

-- Default send fee tiers (kwacha): 100–14999→10, 15000–49999→30, 50000–99999→50, 100000+→100
insert into platform_settings (key, value, updated_at)
values (
  'send_fee_tiers',
  '[{"minKwacha":100,"maxKwacha":14999,"feeKwacha":10},{"minKwacha":15000,"maxKwacha":49999,"feeKwacha":30},{"minKwacha":50000,"maxKwacha":99999,"feeKwacha":50},{"minKwacha":100000,"maxKwacha":null,"feeKwacha":100}]',
  now()
)
on conflict (key) do nothing;
