-- Audit log + soft-delete support for profiles (keep financial history).

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id text,
  actor_user_id text,
  action text not null,
  detail text,
  ip text,
  user_agent text
);

create index if not exists audit_log_at_idx on audit_log (at desc);
create index if not exists audit_log_user_idx on audit_log (user_id, at desc);
create index if not exists audit_log_action_idx on audit_log (action, at desc);

alter table profiles
  add column if not exists deleted_at timestamptz;

-- Stop cascade-erasing money history when a profile row would be removed.
-- Soft-delete keeps the profile row; this is defence in depth if a hard delete slips through.
alter table wallets drop constraint if exists wallets_user_id_fkey;
alter table wallets
  add constraint wallets_user_id_fkey
  foreign key (user_id) references profiles (user_id) on delete restrict;

alter table transactions drop constraint if exists transactions_user_id_fkey;
alter table transactions
  add constraint transactions_user_id_fkey
  foreign key (user_id) references profiles (user_id) on delete restrict;
