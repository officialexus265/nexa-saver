-- Platform treasury: holds book profit available for admin cash-out (separate from saver wallets).
create table if not exists platform_treasury (
  id int primary key default 1 check (id = 1),
  balance_tambala bigint not null default 0,
  lifetime_in_tambala bigint not null default 0,
  lifetime_out_tambala bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into platform_treasury (id) values (1)
on conflict (id) do nothing;

-- Backfill from historical successful deposit profits minus nothing yet.
update platform_treasury t
set
  balance_tambala = coalesce((
    select sum(platform_profit_tambala)::bigint
    from transactions
    where kind = 'deposit' and status = 'success'
  ), 0),
  lifetime_in_tambala = coalesce((
    select sum(platform_profit_tambala)::bigint
    from transactions
    where kind = 'deposit' and status = 'success'
  ), 0),
  updated_at = now()
where t.id = 1
  and t.lifetime_in_tambala = 0
  and t.lifetime_out_tambala = 0;
