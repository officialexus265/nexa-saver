-- Admin TOTP 2FA (Phase B)
alter table profiles
  add column if not exists admin_totp_secret text,
  add column if not exists admin_totp_enabled boolean not null default false,
  add column if not exists admin_totp_pending_secret text,
  add column if not exists admin_totp_backup_hashes text;

create table if not exists admin_totp_ok (
  session_token text primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists admin_totp_ok_user_idx on admin_totp_ok (user_id);
create index if not exists admin_totp_ok_expires_idx on admin_totp_ok (expires_at);
