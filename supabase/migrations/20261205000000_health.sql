-- v1.24.0 (owner picked all four): the server checks itself every day and tells the owner only when something is wrong.
-- Old unpaid top-ups are closed, money integrity is checked, and missing provider webhooks are spotted.
create table if not exists public.health_runs (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  by       text not null default 'auto',
  problems jsonb not null default '[]'::jsonb,
  info     jsonb not null default '{}'::jsonb
);
alter table public.health_runs enable row level security;

-- Top-ups still "pending" long after the checkout (nobody paid, or a webhook was missed): oldest first.
create or replace function public.luda_stale_payments(p_hours int, p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(reference), '[]'::jsonb) from (
    select reference from payments where status = 'pending' and created_at < now() - make_interval(hours => p_hours)
    order by created_at limit p_limit) s
$$;

create or replace function public.luda_health_checks() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ledger_mismatch', (select count(*) from wallets w left join (select user_id, currency, sum(amount_minor) s from ledger group by 1, 2) l using (user_id, currency) where w.balance_minor <> coalesce(l.s, 0)),
    'escrow_missing', (select count(*) from escrows e where not exists (select 1 from ledger g where g.ref = e.id::text and g.kind = e.kind || '_pay')
                         or (e.status = 'refunded' and not exists (select 1 from ledger g where g.ref = e.id::text and g.kind = e.kind || '_refund'))),
    'withdrawals_stuck', (select count(*) from withdrawals where status = 'processing' and created_at < now() - interval '30 minutes'),
    'deposits_mismatch', (select count(*) from payments where status = 'mismatch'),
    'deposits_pending_1h', (select count(*) from payments where status = 'pending' and created_at < now() - interval '1 hour'),
    'bad_webhooks_24h', (select count(*) from payment_events where kind = 'webhook_bad_signature' and at > now() - interval '24 hours'),
    'webhooks', (select jsonb_object_agg(pr, jsonb_build_object(
        'paid', (select count(*) from payments where provider = pr and status = 'paid' and paid_at > now() - interval '14 days'),
        'received', (select count(*) from payment_events where kind = 'webhook' and payload->>'provider' = pr and at > now() - interval '14 days'),
        'last', (select max(at) from payment_events where kind = 'webhook' and payload->>'provider' = pr)))
      from unnest(array['paystack', 'flutterwave']) pr)
  )
$$;

create or replace function public.luda_health_save(p_by text, p_problems jsonb, p_info jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r health_runs%rowtype;
begin
  -- p_problems = {"items": [...]} (an object, so every caller passes it the same way)
  insert into health_runs (by, problems, info) values (p_by, coalesce(p_problems->'items', '[]'::jsonb), coalesce(p_info, '{}'::jsonb)) returning * into r;
  delete from health_runs where id < r.id - 90; -- keep about three months
  return to_jsonb(r);
end $$;

create or replace function public.luda_health_last() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(h) from health_runs h order by id desc limit 1
$$;

do $$ declare f text; begin
  foreach f in array array['luda_stale_payments(int,int)', 'luda_health_checks()', 'luda_health_save(text,jsonb,jsonb)', 'luda_health_last()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
