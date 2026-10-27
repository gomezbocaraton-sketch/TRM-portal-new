-- Time clock v3: pay & overtime rules per employee (used by reports). Safe to re-run.
create table if not exists public.time_pay_rules (
  id bigserial primary key,
  employee_id bigint not null references public.time_employees(id) on delete cascade,
  effective_date date not null,
  pay_type text not null default 'Employee (W-2)',
  pay_rate numeric(10,2),
  rate_unit text not null default 'hour',
  exemption text not null default 'Non-exempt',
  overtime_rule text not null default 'None',
  meal_break_policy text not null default 'Unpaid',
  created_at timestamptz not null default now()
);
create index if not exists time_pay_rules_emp_idx on public.time_pay_rules(employee_id, effective_date);
alter table public.time_pay_rules enable row level security;
drop policy if exists staff_all on public.time_pay_rules;
create policy staff_all on public.time_pay_rules for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid()))
  with check (exists (select 1 from public.users u where u.id = auth.uid()));
select 'timeclock_v3 = ok' as result;
