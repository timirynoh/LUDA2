-- v1.23.0 (owner picked: a better free manual ID check + a low-credit warning for Didit).
-- Manual check: the details the person typed (legal name, document, country, date of birth) and the code they
-- held up in their selfie are kept on the support case, so Luda HQ can check and approve with one tap.
alter table public.cases add column if not exists meta jsonb;

-- Didit usage this Cyprus month (each started check is billed) and whether Didit refused for lack of credit lately.
create or replace function public.luda_kyc_usage() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'started_month', (select count(*) from payment_events where kind = 'kyc_started' and at >= luda_cy_month_start()),
    'no_credit_24h', (select count(*) from payment_events where kind = 'kyc_start_failed' and payload->>'reason' = 'no_credit' and at > now() - interval '24 hours'),
    'last_no_credit', (select max(at) from payment_events where kind = 'kyc_start_failed' and payload->>'reason' = 'no_credit'),
    'manual_open', (select count(*) from cases where reference = 'kyc-manual' and status in ('open', 'waiting_user'))
  )
$$;
revoke all on function public.luda_kyc_usage() from public, anon, authenticated;
