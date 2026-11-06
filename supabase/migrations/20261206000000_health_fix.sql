-- Health check fix: only count rejected webhooks that claim to be from a real provider (Paystack, Flutterwave, Didit).
-- Unsigned requests ('unknown': bots, scanners, or a test call) can't be a key mistake, so they no longer raise the alarm.
create or replace function public.luda_health_checks() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ledger_mismatch', (select count(*) from wallets w left join (select user_id, currency, sum(amount_minor) s from ledger group by 1, 2) l using (user_id, currency) where w.balance_minor <> coalesce(l.s, 0)),
    'escrow_missing', (select count(*) from escrows e where not exists (select 1 from ledger g where g.ref = e.id::text and g.kind = e.kind || '_pay')
                         or (e.status = 'refunded' and not exists (select 1 from ledger g where g.ref = e.id::text and g.kind = e.kind || '_refund'))),
    'withdrawals_stuck', (select count(*) from withdrawals where status = 'processing' and created_at < now() - interval '30 minutes'),
    'deposits_mismatch', (select count(*) from payments where status = 'mismatch'),
    'deposits_pending_1h', (select count(*) from payments where status = 'pending' and created_at < now() - interval '1 hour'),
    'bad_webhooks_24h', (select count(*) from payment_events where kind = 'webhook_bad_signature' and at > now() - interval '24 hours' and coalesce(payload->>'from', 'unknown') <> 'unknown'),
    'webhooks', (select jsonb_object_agg(pr, jsonb_build_object(
        'paid', (select count(*) from payments where provider = pr and status = 'paid' and paid_at > now() - interval '14 days'),
        'received', (select count(*) from payment_events where kind = 'webhook' and payload->>'provider' = pr and at > now() - interval '14 days'),
        'last', (select max(at) from payment_events where kind = 'webhook' and payload->>'provider' = pr)))
      from unnest(array['paystack', 'flutterwave']) pr)
  )
$$;
revoke all on function public.luda_health_checks() from public, anon, authenticated;
