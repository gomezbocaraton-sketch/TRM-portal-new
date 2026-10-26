-- PURCHASING (Phase 1). Safe to run more than once.

-- 1) Settings: who approves, and the dollar amount above which approval is needed
create table if not exists public.purchase_settings (
  id int primary key default 1 check (id = 1),
  approver_email text not null,
  approval_threshold numeric(12,2) not null default 1000
);
insert into public.purchase_settings (id, approver_email, approval_threshold)
values (1, 'vgomez@codeconsultationnyc.com', 1000)
on conflict (id) do nothing;

-- 2) Purchases (project_id matches whatever type projects.id uses)
do $$
declare t text;
begin
  select format_type(a.atttypid, a.atttypmod) into t
  from pg_attribute a
  where a.attrelid = 'public.projects'::regclass and a.attname = 'id' and not a.attisdropped;

  if to_regclass('public.purchases') is null then
    execute format($f$
      create table public.purchases (
        id bigint generated always as identity primary key,
        project_id %s references public.projects(id) on delete set null,
        vendor text not null,
        notes text,
        total numeric(12,2) not null default 0,
        status text not null default 'pending' check (status in ('pending','approved','rejected')),
        auto_approved boolean not null default false,
        created_by uuid,
        created_by_name text,
        created_at timestamptz not null default now(),
        decided_by_name text,
        decided_at timestamptz,
        decision_note text
      )$f$, t);
  end if;
end $$;

create table if not exists public.purchase_items (
  id bigint generated always as identity primary key,
  purchase_id bigint not null references public.purchases(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text,
  unit_price numeric(12,2) not null default 0
);

create table if not exists public.purchase_files (
  id bigint generated always as identity primary key,
  purchase_id bigint not null references public.purchases(id) on delete cascade,
  file_name text not null,
  storage_key text not null,
  category text,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.purchase_events (
  id bigint generated always as identity primary key,
  purchase_id bigint not null references public.purchases(id) on delete cascade,
  event text not null,
  who text,
  note text,
  created_at timestamptz not null default now()
);

-- 3) The rule, enforced in the database itself so it cannot be bypassed:
--    * over the threshold: only the approver can approve or reject
--    * at or under the threshold: allowed to be auto-approved on creation
create or replace function public.purchases_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare s public.purchase_settings; who text;
begin
  select * into s from public.purchase_settings where id = 1;
  who := lower(coalesce(auth.jwt() ->> 'email', ''));

  if tg_op = 'INSERT' then
    if new.status = 'approved' then
      if new.total > s.approval_threshold then
        raise exception 'Orders over % need approval.', s.approval_threshold;
      end if;
      new.auto_approved := true;
    else
      new.status := 'pending';
      new.auto_approved := false;
    end if;
  else
    new.auto_approved := old.auto_approved;
    if new.status is distinct from old.status and who <> lower(s.approver_email) then
      raise exception 'Only % can approve or reject purchases.', s.approver_email;
    end if;
    if old.status <> 'pending' and new.total is distinct from old.total then
      raise exception 'An approved or rejected order cannot be changed.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists purchases_guard_trg on public.purchases;
create trigger purchases_guard_trg before insert or update on public.purchases
for each row execute function public.purchases_guard();

-- 4) Access: portal staff (anyone in the users table) can use purchasing
alter table public.purchase_settings enable row level security;
alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchase_files enable row level security;
alter table public.purchase_events enable row level security;

drop policy if exists staff_read on public.purchase_settings;
create policy staff_read on public.purchase_settings for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid()));

do $$
declare tbl text;
begin
  foreach tbl in array array['purchases','purchase_items','purchase_files','purchase_events'] loop
    execute format('drop policy if exists staff_all on public.%I', tbl);
    execute format($p$create policy staff_all on public.%I for all to authenticated
      using (exists (select 1 from public.users u where u.id = auth.uid()))
      with check (exists (select 1 from public.users u where u.id = auth.uid()))$p$, tbl);
  end loop;
end $$;

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
