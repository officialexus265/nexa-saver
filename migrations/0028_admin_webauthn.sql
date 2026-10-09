-- Admin WebAuthn / passkeys (alongside TOTP)
create table if not exists admin_webauthn_credentials (
  id text primary key,
  user_id text not null references profiles (user_id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  device_type text,
  backed_up boolean not null default false,
  transports text,
  nickname text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists admin_webauthn_user_idx on admin_webauthn_credentials (user_id);

-- Short-lived WebAuthn challenges
create table if not exists admin_webauthn_challenges (
  user_id text primary key references profiles (user_id) on delete cascade,
  challenge text not null,
  purpose text not null,
  expires_at timestamptz not null
);
