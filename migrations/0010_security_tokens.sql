-- One-time tokens for "Secure your account" links in alert emails.

create table if not exists security_action_tokens (
  id bigserial primary key,
  token_hash text not null unique,
  user_id text not null references profiles (user_id) on delete cascade,
  action text not null check (action in ('new_device', 'phone_change', 'pin_change')),
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists security_action_tokens_user_idx
  on security_action_tokens (user_id, created_at desc);

-- Keep last registered withdraw number so a victim can restore after a hijacked change.
alter table profiles
  add column if not exists previous_phone text;
