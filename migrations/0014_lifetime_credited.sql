-- Lifetime deposited should reflect what landed in the vault (94%), not gross (100%).
-- Recompute from successful deposits' credited_tambala.
update wallets w
set lifetime_deposited_tambala = coalesce((
  select sum(t.credited_tambala)::bigint
  from transactions t
  where t.user_id = w.user_id
    and t.kind = 'deposit'
    and t.status = 'success'
), 0),
updated_at = now();
