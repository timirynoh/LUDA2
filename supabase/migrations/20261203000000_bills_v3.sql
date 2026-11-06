-- Bills v3 (v1.22.0, owner picked all four): a faster team queue (claim a bill so two people never pay it twice,
-- sorted by the promised time), saved bills with a monthly reminder, rent by bank transfer, and automatic mobile
-- top-ups through a partner (the bill stays held until the partner or the team has paid it).

alter table public.bills add column if not exists claimed_by text;
alter table public.bills add column if not exists claimed_at timestamptz;
alter table public.bills add column if not exists auto jsonb; -- {partner, id, status: processing|paid|failed|refused, said, at}
alter table public.bills add column if not exists biller text;

/* ------------------------------ saved bills ------------------------------ */
create table if not exists public.saved_bills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (user_id),
  biller       text not null,                  -- app biller id: kibtek, water, turkcell, rent…
  type         text not null,
  provider     text not null,
  account      text not null,
  details      jsonb not null default '{}'::jsonb,
  label        text,
  amount_minor bigint,                          -- last amount paid (a suggestion, the user confirms each time)
  remind_day   int check (remind_day between 1 and 28),
  last_paid_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, biller, account)
);
alter table public.saved_bills enable row level security;

-- The Cyprus month start (UTC+3) for "paid this month".
create or replace function public.luda_cy_month_start() returns timestamptz
language sql stable as $$ select (date_trunc('month', now() + interval '3 hours') - interval '3 hours') $$;

create or replace function public.luda_saved_bills(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(s) - 'user_id' || jsonb_build_object(
      'paidThisMonth', s.last_paid_at is not null and s.last_paid_at >= luda_cy_month_start(),
      'due', s.remind_day is not null and extract(day from now() + interval '3 hours') >= s.remind_day
             and (s.last_paid_at is null or s.last_paid_at < luda_cy_month_start())
             and not exists (select 1 from bills b where b.user_id = s.user_id and b.status = 'pending' and b.account_ref = s.account and b.biller = s.biller))
    order by s.updated_at desc), '[]'::jsonb)
  from saved_bills s where s.user_id = p_user
$$;

create or replace function public.luda_saved_bill_save(p_user uuid, p_biller text, p_type text, p_provider text, p_account text, p_details jsonb, p_label text, p_amount bigint, p_remind int, p_paid boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s saved_bills%rowtype;
begin
  if not exists (select 1 from saved_bills where user_id = p_user and biller = p_biller and account = p_account)
     and (select count(*) from saved_bills where user_id = p_user) >= 12 then
    raise exception 'too_many_saved';
  end if;
  insert into saved_bills (user_id, biller, type, provider, account, details, label, amount_minor, remind_day, last_paid_at)
  values (p_user, p_biller, p_type, p_provider, p_account, coalesce(p_details, '{}'::jsonb), nullif(p_label, ''), p_amount, nullif(p_remind, 0), case when p_paid then now() end)
  on conflict (user_id, biller, account) do update set
    type = excluded.type, provider = excluded.provider, details = excluded.details,
    label = coalesce(excluded.label, saved_bills.label), amount_minor = coalesce(excluded.amount_minor, saved_bills.amount_minor),
    remind_day = case when p_remind = 0 then null else coalesce(excluded.remind_day, saved_bills.remind_day) end,
    last_paid_at = case when p_paid then now() else saved_bills.last_paid_at end, updated_at = now()
  returning * into s;
  if p_remind = 0 then update saved_bills set remind_day = null where id = s.id returning * into s; end if;
  return to_jsonb(s) - 'user_id';
end $$;

create or replace function public.luda_saved_bill_remove(p_user uuid, p_id uuid) returns boolean
language sql security definer set search_path = public as $$
  with d as (delete from saved_bills where id = p_id and user_id = p_user returning 1) select exists (select 1 from d)
$$;

/* ------------------------------ team queue ------------------------------ */
-- "I'm paying this one": a bill is claimed by one staff member, so nobody pays it twice. A claim older than
-- 45 minutes can be taken over (someone got stuck); bills with an automatic top-up still running can't be claimed.
create or replace function public.luda_bill_claim(p_bill uuid, p_staff text, p_release boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b bills%rowtype;
begin
  select * into b from bills where id = p_bill for update;
  if not found or b.status <> 'pending' then return jsonb_build_object('ok', false, 'why', 'done'); end if;
  if p_release then
    if b.claimed_by = p_staff then update bills set claimed_by = null, claimed_at = null where id = p_bill; end if;
    return jsonb_build_object('ok', true);
  end if;
  if b.auto is not null and b.auto->>'status' = 'processing' then return jsonb_build_object('ok', false, 'why', 'auto'); end if;
  if b.claimed_by is not null and b.claimed_by <> p_staff and b.claimed_at > now() - interval '45 minutes' then
    return jsonb_build_object('ok', false, 'why', 'claimed', 'by', b.claimed_by);
  end if;
  update bills set claimed_by = p_staff, claimed_at = now() where id = p_bill;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.luda_bill_auto(p_bill uuid, p_auto jsonb) returns void
language sql security definer set search_path = public as $$
  update bills set auto = coalesce(auto, '{}'::jsonb) || p_auto, updated_at = now() where id = p_bill
$$;

-- Bills whose automatic top-up is still running (checked again from GET features / the queue).
create or replace function public.luda_bills_auto_pending() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'user_id', user_id, 'auto', auto, 'amount_minor', amount_minor, 'provider', provider)), '[]'::jsonb)
    from bills where status = 'pending' and auto->>'status' = 'processing'
$$;

-- Pending bills soonest-promised first (the queue); other statuses newest first.
create or replace function public.luda_admin_bills(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(b) || jsonb_build_object('username', luda_uname(b.user_id))
      order by case when b.status = 'pending' then extract(epoch from coalesce(b.eta_at, b.created_at)) else -extract(epoch from b.created_at) end), '[]'::jsonb)
    from (select * from bills where p_status is null or status = p_status order by created_at desc limit 100) b
$$;

-- Users see who is paying (just "the Luda team" + when), not staff names.
create or replace function public.luda_features_mine(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'pots', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from pots t where t.user_id = p_user and not t.closed), '[]'::jsonb),
    'bills', coalesce((select jsonb_agg(to_jsonb(b) - 'escrow_id' - 'claimed_by' - 'handled_by' order by b.created_at desc) from (select * from bills where user_id = p_user order by created_at desc limit 30) b), '[]'::jsonb)
  )
$$;

create or replace function public.luda_bill_set_biller(p_bill uuid, p_biller text) returns void
language sql security definer set search_path = public as $$ update bills set biller = p_biller where id = p_bill $$;

do $$ declare f text; begin
  foreach f in array array[
    'luda_cy_month_start()', 'luda_saved_bills(uuid)', 'luda_saved_bill_save(uuid,text,text,text,text,jsonb,text,bigint,int,boolean)',
    'luda_saved_bill_remove(uuid,uuid)', 'luda_bill_claim(uuid,text,boolean)', 'luda_bill_auto(uuid,jsonb)', 'luda_bills_auto_pending()',
    'luda_admin_bills(text)', 'luda_features_mine(uuid)', 'luda_bill_set_biller(uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
