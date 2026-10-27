-- Time clock v2: breaks, shift notes, submit-for-approval, approval. Safe to re-run.

alter table public.time_punches add column if not exists notes text;
alter table public.time_punches add column if not exists status text not null default 'open';
alter table public.time_punches add column if not exists submitted_at timestamptz;
alter table public.time_punches add column if not exists approved_at timestamptz;
alter table public.time_punches add column if not exists approved_by text;

create table if not exists public.time_breaks (
  id bigserial primary key,
  punch_id bigint not null references public.time_punches(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists time_breaks_punch_idx on public.time_breaks(punch_id);
alter table public.time_breaks enable row level security;
drop policy if exists staff_all on public.time_breaks;
create policy staff_all on public.time_breaks for all to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid()))
  with check (exists (select 1 from public.users u where u.id = auth.uid()));

-- Finds the employee for a clock session token (works whether the table stores the token or a hash of it).
create or replace function public.time_emp_from_token(p_token text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare v bigint; has_tok boolean; has_hash boolean; has_exp boolean; sql text;
begin
  if p_token is null or p_token = '' then return null; end if;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='time_sessions' and column_name='token') into has_tok;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='time_sessions' and column_name='token_hash') into has_hash;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='time_sessions' and column_name='expires_at') into has_exp;
  if has_tok then
    sql := 'select employee_id::bigint from public.time_sessions where token::text = $1';
  elsif has_hash then
    sql := 'select employee_id::bigint from public.time_sessions where token_hash::text = encode(extensions.digest($1, ''sha256''), ''hex'')';
  else
    raise exception 'time_sessions has an unexpected shape';
  end if;
  if has_exp then sql := sql || ' and (expires_at is null or expires_at > now())'; end if;
  execute sql || ' limit 1' into v using p_token;
  if v is null then return null; end if;
  perform 1 from public.time_employees where id = v and active;
  if not found then return null; end if;
  return v;
end $$;

create or replace function public.time_break_minutes(p_punch bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(extract(epoch from (coalesce(end_at, now()) - start_at)) / 60.0), 0) from public.time_breaks where punch_id = p_punch;
$$;

-- Everything the employee screen needs in one call.
create or replace function public.clock_shift(p_token text, p_from timestamptz, p_to timestamptz) returns json
language plpgsql security definer set search_path = public as $$
declare emp bigint; o record; open_json json; week_min numeric := 0; rec json;
begin
  emp := public.time_emp_from_token(p_token);
  if emp is null then return json_build_object('error', 'invalid'); end if;

  select p.* into o from public.time_punches p where p.employee_id = emp and p.clock_out is null order by p.clock_in desc limit 1;
  if found then
    open_json := json_build_object(
      'id', o.id, 'since', o.clock_in, 'notes', o.notes, 'status', o.status,
      'location', (select name from public.time_locations where id = o.location_id),
      'breaks', coalesce((select json_agg(json_build_object('id', b.id, 'start', b.start_at, 'end', b.end_at) order by b.start_at) from public.time_breaks b where b.punch_id = o.id), '[]'::json)
    );
  end if;

  select coalesce(sum(extract(epoch from (coalesce(p.clock_out, now()) - p.clock_in)) / 60.0 - public.time_break_minutes(p.id)), 0)
    into week_min from public.time_punches p where p.employee_id = emp and p.clock_in >= p_from and p.clock_in < p_to;

  select coalesce(json_agg(r order by r.clock_in desc), '[]'::json) into rec from (
    select p.id, p.clock_in, p.clock_out, p.status, p.notes,
           (select name from public.time_locations where id = p.location_id) as location_name,
           round(public.time_break_minutes(p.id))::int as break_min,
           case when p.clock_out is null then null else round(extract(epoch from (p.clock_out - p.clock_in)) / 60.0 - public.time_break_minutes(p.id))::int end as net_min,
           coalesce((select json_agg(json_build_object('id', b.id, 'start', b.start_at, 'end', b.end_at) order by b.start_at) from public.time_breaks b where b.punch_id = p.id), '[]'::json) as breaks
    from public.time_punches p
    where p.employee_id = emp and p.clock_in >= now() - interval '21 days'
    order by p.clock_in desc limit 40
  ) r;

  return json_build_object('open', open_json, 'week_min', round(week_min)::int, 'recent', rec);
end $$;

create or replace function public.clock_break_start(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare emp bigint; pid bigint;
begin
  emp := public.time_emp_from_token(p_token);
  if emp is null then return json_build_object('ok', false, 'error', 'Please sign in again.'); end if;
  select id into pid from public.time_punches where employee_id = emp and clock_out is null order by clock_in desc limit 1;
  if pid is null then return json_build_object('ok', false, 'error', 'Clock in before taking a break.'); end if;
  if exists (select 1 from public.time_breaks where punch_id = pid and end_at is null) then
    return json_build_object('ok', false, 'error', 'You are already on a break.');
  end if;
  insert into public.time_breaks(punch_id, start_at) values (pid, now());
  return json_build_object('ok', true);
end $$;

create or replace function public.clock_break_end(p_token text) returns json
language plpgsql security definer set search_path = public as $$
declare emp bigint; pid bigint;
begin
  emp := public.time_emp_from_token(p_token);
  if emp is null then return json_build_object('ok', false, 'error', 'Please sign in again.'); end if;
  select id into pid from public.time_punches where employee_id = emp and clock_out is null order by clock_in desc limit 1;
  if pid is null then return json_build_object('ok', true); end if;
  update public.time_breaks set end_at = now() where punch_id = pid and end_at is null;
  return json_build_object('ok', true);
end $$;

-- Add a break after the fact (times typed by the employee). Not allowed once approved.
create or replace function public.clock_break_add(p_token text, p_punch bigint, p_start timestamptz, p_end timestamptz) returns json
language plpgsql security definer set search_path = public as $$
declare emp bigint; pu record;
begin
  emp := public.time_emp_from_token(p_token);
  if emp is null then return json_build_object('ok', false, 'error', 'Please sign in again.'); end if;
  select * into pu from public.time_punches where id = p_punch and employee_id = emp;
  if not found then return json_build_object('ok', false, 'error', 'Shift not found.'); end if;
  if pu.status = 'approved' then return json_build_object('ok', false, 'error', 'This shift is already approved.'); end if;
  if p_end <= p_start then return json_build_object('ok', false, 'error', 'The break must end after it starts.'); end if;
  if p_start < pu.clock_in or (pu.clock_out is not null and p_end > pu.clock_out) then
    return json_build_object('ok', false, 'error', 'The break must be inside your shift.');
  end if;
  insert into public.time_breaks(punch_id, start_at, end_at) values (p_punch, p_start, p_end);
  return json_build_object('ok', true);
end $$;

create or replace function public.clock_break_delete(p_token text, p_break bigint) returns json
language plpgsql security definer set search_path = public as $$
declare emp bigint; st text;
begin
  emp := public.time_emp_from_token(p_token);
  if emp is null then return json_build_object('ok', false, 'error', 'Please sign in again.'); end if;
  select p.status into st from public.time_breaks b join public.time_punches p on p.id = b.punch_id where b.id = p_break and p.employee_id = emp;
  if st is null then return json_build_object('ok', false, 'error', 'Break not found.'); end if;
  if st = 'approved' then return json_build_object('ok', false, 'error', 'This shift is already approved.'); end if;
  delete from public.time_breaks where id = p_break;
  return json_build_object('ok', true);
end $$;

create or replace function public.clock_set_note(p_token text, p_punch bigint, p_note text) returns json
language plpgsql security definer set search_path = public as $$
declare emp bigint;
begin
  emp := public.time_emp_from_token(p_token);
  if emp is null then return json_build_object('ok', false, 'error', 'Please sign in again.'); end if;
  update public.time_punches set notes = nullif(trim(p_note), '') where id = p_punch and employee_id = emp and status <> 'approved';
  return json_build_object('ok', true);
end $$;

-- "Submit time for approval": locks the employee's edits until the office approves or reopens it.
create or replace function public.clock_submit(p_token text, p_punch bigint, p_note text) returns json
language plpgsql security definer set search_path = public as $$
declare emp bigint; pu record;
begin
  emp := public.time_emp_from_token(p_token);
  if emp is null then return json_build_object('ok', false, 'error', 'Please sign in again.'); end if;
  select * into pu from public.time_punches where id = p_punch and employee_id = emp;
  if not found then return json_build_object('ok', false, 'error', 'Shift not found.'); end if;
  if pu.clock_out is null then return json_build_object('ok', false, 'error', 'Finish your shift first.'); end if;
  if pu.status = 'approved' then return json_build_object('ok', false, 'error', 'Already approved.'); end if;
  update public.time_punches set status = 'submitted', submitted_at = now(), notes = coalesce(nullif(trim(p_note), ''), notes) where id = p_punch;
  return json_build_object('ok', true);
end $$;

grant execute on function public.clock_shift(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.clock_break_start(text) to anon, authenticated;
grant execute on function public.clock_break_end(text) to anon, authenticated;
grant execute on function public.clock_break_add(text, bigint, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.clock_break_delete(text, bigint) to anon, authenticated;
grant execute on function public.clock_set_note(text, bigint, text) to anon, authenticated;
grant execute on function public.clock_submit(text, bigint, text) to anon, authenticated;
revoke execute on function public.time_emp_from_token(text) from anon, authenticated;
revoke execute on function public.time_break_minutes(bigint) from anon, authenticated;

-- Quick self-test: should return the number of active employees (proves the session lookup works).
select 'timeclock_v2 = ok' as result, (select count(*) from public.time_employees) as employees;
