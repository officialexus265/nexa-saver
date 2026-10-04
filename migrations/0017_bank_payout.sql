-- Bank payout destination (withdrawals only — not used for deposits).
alter table profiles
  add column if not exists bank_uuid text,
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_account_name text,
  add column if not exists bank_verified_at timestamptz,
  add column if not exists bank_hold_until timestamptz,
  add column if not exists bank_updated_at timestamptz,
  add column if not exists anchor_bank_uuid text,
  add column if not exists anchor_bank_name text,
  add column if not exists anchor_bank_account_number text,
  add column if not exists anchor_bank_account_name text;

-- Survey: track bank confirmation when details exist
alter table security_survey_completions
  add column if not exists bank_confirmed boolean,
  add column if not exists reverted_bank boolean not null default false;
