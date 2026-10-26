-- PURCHASING v2: buy plan (order-by dates from the schedule), price quotes, proposal check. Safe to run more than once.
-- Run migration_purchasing.sql first.

create table if not exists public.buy_items (
  id bigint generated always as identity primary key,
  project_id text not null,
  name text not null,
  quantity numeric(12,2) not null default 1,
  unit text,
  unit_price numeric(12,2) not null default 0,
  vendor text,
  quote_url text,
  milestone_id text,
  needed_on date,
  lead_days int not null default 7,
  status text not null default 'planned' check (status in ('planned','ordered')),
  purchase_id bigint references public.purchases(id) on delete set null,
  proposal_item_id bigint,
  ack_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.price_quotes (
  id bigint generated always as identity primary key,
  buy_item_id bigint not null references public.buy_items(id) on delete cascade,
  category text not null default 'other' check (category in ('lowest','value','fast','other')),
  store text not null,
  title text,
  price numeric(12,2) not null,
  delivery text,
  rating numeric(3,1),
  url text,
  source text not null default 'web',
  checked_at timestamptz not null default now()
);

create table if not exists public.proposal_items (
  id bigint generated always as identity primary key,
  project_id text not null,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text,
  unit_price numeric(12,2) not null default 0,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

alter table public.buy_items enable row level security;
alter table public.price_quotes enable row level security;
alter table public.proposal_items enable row level security;

do $$
declare tbl text;
begin
  foreach tbl in array array['buy_items','price_quotes','proposal_items'] loop
    execute format('drop policy if exists staff_all on public.%I', tbl);
    execute format($p$create policy staff_all on public.%I for all to authenticated
      using (exists (select 1 from public.users u where u.id = auth.uid()))
      with check (exists (select 1 from public.users u where u.id = auth.uid()))$p$, tbl);
  end loop;
end $$;

select 'purchasing_v2 = ok' as result;
