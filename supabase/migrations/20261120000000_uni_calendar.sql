-- University calendars (v1.10.0). The Luda team enters each university's official dates in Luda HQ
-- (with the link they came from); students see their university's dates and get reminders.
-- Fee plans are personal: each student adds their own instalments (amount + due date). Luda doesn't take tuition.

alter table public.profiles add column if not exists university text;

create table if not exists public.uni_dates (
  id          uuid primary key default gen_random_uuid(),
  uni         text not null check (uni ~ '^[a-z0-9]{2,12}$'),
  title       text not null check (length(title) between 2 and 80),
  kind        text not null check (kind in ('term', 'deadline', 'exam', 'fee', 'holiday')),
  start_date  date not null,
  end_date    date check (end_date is null or end_date >= start_date),
  source_url  text check (source_url is null or source_url ~ '^https://'),
  note        text check (note is null or length(note) <= 200),
  created_by  uuid references public.profiles (user_id),
  updated_by  uuid references public.profiles (user_id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists uni_dates_uni on public.uni_dates (uni, start_date);
alter table public.uni_dates enable row level security;

create table if not exists public.uni_fee_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (user_id) on delete cascade,
  title         text not null check (length(title) between 2 and 60),
  due_date      date not null,
  amount_minor  bigint not null check (amount_minor > 0 and amount_minor <= 100000000),
  currency      text not null check (currency in ('TRY', 'USD', 'EUR', 'GBP')),
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists uni_fee_plans_user on public.uni_fee_plans (user_id, due_date);
alter table public.uni_fee_plans enable row level security;

-- Dates a student sees: from 30 days ago onwards (ongoing terms included).
create or replace function public.luda_uni_dates(p_uni text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'kind', kind, 'start', start_date, 'end', end_date, 'source', source_url, 'note', note, 'updatedAt', updated_at)
         order by start_date, title), '[]'::jsonb)
    from uni_dates where uni = p_uni and coalesce(end_date, start_date) >= current_date - 30
$$;

-- Everything for one university (staff), and how many upcoming dates each university has.
create or replace function public.luda_uni_admin(p_uni text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'dates', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'title', d.title, 'kind', d.kind, 'start', d.start_date, 'end', d.end_date, 'source', d.source_url, 'note', d.note,
                'updatedAt', d.updated_at, 'by', u.username) order by d.start_date), '[]'::jsonb)
              from uni_dates d left join profiles u on u.user_id = coalesce(d.updated_by, d.created_by) where d.uni = p_uni),
    'coverage', (select coalesce(jsonb_object_agg(uni, n), '{}'::jsonb) from (
        select uni, count(*) filter (where coalesce(end_date, start_date) >= current_date) n from uni_dates group by uni) c),
    'students', (select coalesce(jsonb_object_agg(university, n), '{}'::jsonb) from (
        select university, count(*) n from profiles where university is not null group by university) s))
$$;

create or replace function public.luda_uni_save(p_id uuid, p jsonb, p_by uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r uni_dates%rowtype;
begin
  if p_id is null then
    insert into uni_dates (uni, title, kind, start_date, end_date, source_url, note, created_by, updated_by)
    values (p->>'uni', p->>'title', p->>'kind', (p->>'start')::date, nullif(p->>'end', '')::date, nullif(p->>'source', ''), nullif(p->>'note', ''), p_by, p_by)
    returning * into r;
  else
    update uni_dates set title = p->>'title', kind = p->>'kind', start_date = (p->>'start')::date, end_date = nullif(p->>'end', '')::date,
      source_url = nullif(p->>'source', ''), note = nullif(p->>'note', ''), updated_by = p_by, updated_at = now()
    where id = p_id returning * into r;
    if not found then raise exception 'not_found'; end if;
  end if;
  return to_jsonb(r);
end $$;

create or replace function public.luda_uni_delete(p_id uuid) returns boolean
language sql security definer set search_path = public as $$
  with x as (delete from uni_dates where id = p_id returning 1) select exists (select 1 from x)
$$;

-- Copy a university's dates from one academic year to the next (+1 year), as a starting point to correct.
create or replace function public.luda_uni_copy_year(p_uni text, p_from date, p_to date, p_by uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into uni_dates (uni, title, kind, start_date, end_date, source_url, note, created_by, updated_by)
  select uni, title, kind, (start_date + interval '1 year')::date, (end_date + interval '1 year')::date, null, 'Copied from last year: check against the official calendar', p_by, p_by
    from uni_dates where uni = p_uni and start_date between p_from and p_to;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.luda_fee_plan(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'due', due_date, 'amountMinor', amount_minor, 'currency', currency, 'paidAt', paid_at) order by due_date), '[]'::jsonb)
    from uni_fee_plans where user_id = p_user
$$;

create or replace function public.luda_fee_plan_save(p_user uuid, p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r uni_fee_plans%rowtype;
begin
  if p_id is null then
    if (select count(*) from uni_fee_plans where user_id = p_user) >= 24 then raise exception 'too_many_fees'; end if;
    insert into uni_fee_plans (user_id, title, due_date, amount_minor, currency)
    values (p_user, p->>'title', (p->>'due')::date, (p->>'amountMinor')::bigint, p->>'currency') returning * into r;
  else
    update uni_fee_plans set title = p->>'title', due_date = (p->>'due')::date, amount_minor = (p->>'amountMinor')::bigint, currency = p->>'currency'
     where id = p_id and user_id = p_user returning * into r;
    if not found then raise exception 'not_found'; end if;
  end if;
  return to_jsonb(r);
end $$;

create or replace function public.luda_fee_plan_mark(p_user uuid, p_id uuid, p_paid boolean) returns boolean
language sql security definer set search_path = public as $$
  with x as (update uni_fee_plans set paid_at = case when p_paid then coalesce(paid_at, now()) else null end where id = p_id and user_id = p_user returning 1)
  select exists (select 1 from x)
$$;

create or replace function public.luda_fee_plan_remove(p_user uuid, p_id uuid) returns boolean
language sql security definer set search_path = public as $$
  with x as (delete from uni_fee_plans where id = p_id and user_id = p_user returning 1) select exists (select 1 from x)
$$;

create or replace function public.luda_set_university(p_user uuid, p_uni text) returns void
language sql security definer set search_path = public as $$
  update profiles set university = p_uni where user_id = p_user
$$;

do $$
declare f text;
begin
  foreach f in array array['luda_uni_dates(text)', 'luda_uni_admin(text)', 'luda_uni_save(uuid,jsonb,uuid)', 'luda_uni_delete(uuid)', 'luda_uni_copy_year(text,date,date,uuid)',
    'luda_fee_plan(uuid)', 'luda_fee_plan_save(uuid,uuid,jsonb)', 'luda_fee_plan_mark(uuid,uuid,boolean)', 'luda_fee_plan_remove(uuid,uuid)', 'luda_set_university(uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
