-- Lets an item in the buy plan be marked "client buying" (the client purchases it, we send an estimate instead of a purchase order).
alter table public.buy_items add column if not exists client_buys boolean not null default false;
select 'client_buys = ok' as result;
