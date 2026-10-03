-- Withdrawal number must be proven via a successful deposit from that number.
alter table profiles
  add column if not exists phone_verified_at timestamptz;

comment on column profiles.phone_verified_at is
  'Set when a successful deposit is received from the registered phone; required before withdrawals.';
