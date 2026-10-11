-- Allow send/transfer and fee rows (original constraint only allowed deposit + withdrawal).
alter table transactions drop constraint if exists transactions_kind_check;

alter table transactions
  add constraint transactions_kind_check
  check (kind in (
    'deposit',
    'withdrawal',
    'transfer_out',
    'transfer_in',
    'fee'
  ));
