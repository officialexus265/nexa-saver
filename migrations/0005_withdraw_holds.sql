-- Withdrawal holds (security / new-account). Daily caps are computed from transactions.

alter table profiles
  add column if not exists withdrawals_held_until timestamptz;

comment on column profiles.withdrawals_held_until is
  'When set and in the future, startWithdraw is rejected until this instant (PIN reset, phone change, etc.). New-account 24h hold is derived from created_at.';
