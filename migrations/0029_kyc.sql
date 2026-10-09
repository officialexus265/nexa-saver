-- Light KYC: ID details + admin review. No document upload in E1.

alter table profiles
  add column if not exists kyc_status text not null default 'none',
  add column if not exists kyc_id_type text,
  add column if not exists kyc_id_number text,
  add column if not exists kyc_id_name text,
  add column if not exists kyc_submitted_at timestamptz,
  add column if not exists kyc_reviewed_at timestamptz,
  add column if not exists kyc_review_note text,
  add column if not exists kyc_reviewed_by text;

-- none | pending | verified | rejected
comment on column profiles.kyc_status is 'Light KYC review state';

create index if not exists profiles_kyc_status_idx on profiles (kyc_status)
  where kyc_status in ('pending', 'rejected');

-- Default: withdrawals at or above this amount (kwacha) need verified KYC
insert into platform_settings (key, value, updated_at)
values ('kyc_withdraw_threshold_kwacha', '100000', now())
on conflict (key) do nothing;
