-- Received transfer bag (separate from main vault balance)
alter table wallets
  add column if not exists received_balance_tambala bigint not null default 0;

alter table transfers
  add column if not exists cover_bank_flat boolean not null default false;

alter table transfers
  add column if not exists credit_tambala bigint;

comment on column wallets.received_balance_tambala is
  'Funds from peer transfers; not mixed into main balance until user moves them.';
comment on column transfers.cover_bank_flat is
  'Sender paid an extra 700 MWK so receiver total credit includes bank flat buffer.';
