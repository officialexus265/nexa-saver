-- Platform-wide settings (e.g. support phone for large withdrawals).

create table if not exists platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
