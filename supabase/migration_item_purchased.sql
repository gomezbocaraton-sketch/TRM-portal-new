-- Lets an ordered item be marked purchased, with the time it was bought.
alter table public.buy_items add column if not exists purchased_at timestamptz;
select 'purchased_at = ok' as result;
