-- Multi-use receive-payment links (external payers → owner vault via PayChangu)
create table if not exists receive_links (
  id bigserial primary key,
  token text not null unique,
  user_id text not null references profiles(user_id),
  label text,
  default_amount_kwacha integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists receive_links_user_idx on receive_links (user_id, active);
