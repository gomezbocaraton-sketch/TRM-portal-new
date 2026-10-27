-- Closing a purchase order: items bought, invoice recorded, and the QuickBooks bill.
alter table public.purchases
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by_name text,
  add column if not exists invoice_number text,
  add column if not exists invoice_date date,
  add column if not exists invoice_amount numeric(12,2),
  add column if not exists cost_id text,
  add column if not exists qbo_bill_id text,
  add column if not exists qbo_synced_at timestamptz,
  add column if not exists qbo_error text;
select 'po_close = ok' as result;
