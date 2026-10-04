-- Admin-managed help contacts shown on the user dashboard FAB.
create table if not exists help_lines (
  id serial primary key,
  channel text not null check (channel in ('whatsapp', 'call', 'sms', 'facebook', 'other')),
  label text not null,
  value text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists help_lines_active_sort_idx on help_lines (active, sort_order);
