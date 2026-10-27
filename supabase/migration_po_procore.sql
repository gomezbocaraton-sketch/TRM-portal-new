-- Purchase order lifecycle (Submitted, Approved, Sent, Partially received, Received, Closed), invoices and receiving.
-- Safe to run more than once.

alter table public.purchases
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by_name text,
  add column if not exists invoice_number text,
  add column if not exists invoice_date date,
  add column if not exists invoice_amount numeric(12,2),
  add column if not exists cost_id text,
  add column if not exists qbo_bill_id text,
  add column if not exists qbo_synced_at timestamptz,
  add column if not exists qbo_error text,
  add column if not exists vendor_email text,
  add column if not exists sent_at timestamptz,
  add column if not exists sent_to text,
  add column if not exists receipt_status text not null default 'none';

alter table public.purchase_items
  add column if not exists received_qty numeric(12,2) not null default 0,
  add column if not exists received_at timestamptz;

alter table public.buy_items add column if not exists purchased_at timestamptz;
alter table public.buy_items add column if not exists client_buys boolean not null default false;

-- One order can have several vendor invoices (partial billing). Each becomes a project cost and a QuickBooks bill.
create table if not exists public.purchase_invoices (
  id bigint generated always as identity primary key,
  purchase_id bigint not null references public.purchases(id) on delete cascade,
  invoice_number text,
  invoice_date date,
  amount numeric(12,2) not null,
  category text,
  milestone_id text,
  file_name text,
  storage_key text,
  cost_id text,
  qbo_bill_id text,
  qbo_synced_at timestamptz,
  qbo_error text,
  created_by_name text,
  created_at timestamptz not null default now()
);

alter table public.purchase_invoices enable row level security;
drop policy if exists staff_all on public.purchase_invoices;
create policy staff_all on public.purchase_invoices for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid()))
  with check (exists (select 1 from public.users u where u.id = auth.uid()));

select 'po_procore = ok' as result;
