-- Date on each plan (plans get amended). Safe to run more than once.
alter table public.documents add column if not exists plan_date date;
select 'plan_date = ok' as result;
