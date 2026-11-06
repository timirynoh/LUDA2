-- Owner admin page: who is an admin, a one-call overview, and an atomic ticket refund.
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Refund a ticket back to the wallet it was paid from, exactly once.
create or replace function public.luda_refund_ticket(p_ticket uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tickets%rowtype;
begin
  update tickets set status = 'refunded' where id = p_ticket and status = 'valid' returning * into t;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_refundable'); end if;
  return luda_post(jsonb_build_array(jsonb_build_object('user_id', t.user_id, 'currency', t.paid_currency, 'amount_minor', t.paid_minor,
         'kind', 'ticket_refund', 'ref', t.id::text, 'meta', jsonb_build_object('code', t.code, 'label', t.item->>'label'))));
end $$;

-- Everything the owner's dashboard shows, in one call.
create or replace function public.luda_admin_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'users', (select count(*) from profiles),
    'verified', (select count(*) from profiles where kyc_status = 'verified'),
    'kycPending', (select count(*) from profiles where kyc_status = 'pending'),
    'phoneVerified', (select count(*) from profiles where phone_verified_at is not null),
    'frozen', (select count(*) from profiles where frozen),
    'newUsers7d', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'balances', (select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) from (select currency, sum(balance_minor) as total from wallets group by currency) x),
    'deposits24h', (select jsonb_build_object('count', count(*), 'NGN', coalesce(sum(credit_minor) filter (where credit_currency = 'NGN'), 0), 'TRY', coalesce(sum(credit_minor) filter (where credit_currency = 'TRY'), 0))
                    from payments where purpose = 'deposit' and status = 'paid' and paid_at > now() - interval '24 hours'),
    'deposits7d', (select jsonb_build_object('count', count(*), 'NGN', coalesce(sum(credit_minor) filter (where credit_currency = 'NGN'), 0), 'TRY', coalesce(sum(credit_minor) filter (where credit_currency = 'TRY'), 0))
                   from payments where purpose = 'deposit' and status = 'paid' and paid_at > now() - interval '7 days'),
    'withdrawals24h', (select jsonb_build_object('count', count(*), 'NGN', coalesce(sum(amount_minor), 0)) from withdrawals where status in ('processing', 'paid') and created_at > now() - interval '24 hours'),
    'withdrawals7d', (select jsonb_build_object('count', count(*), 'NGN', coalesce(sum(amount_minor), 0)) from withdrawals where status in ('processing', 'paid') and created_at > now() - interval '7 days'),
    'fees7d', (select jsonb_build_object('withdrawNGN', coalesce(-sum(amount_minor) filter (where kind = 'withdraw_fee'), 0)) from ledger where at > now() - interval '7 days'),
    'tickets7d', (select count(*) from tickets where created_at > now() - interval '7 days'),
    'problems', jsonb_build_object(
      'mismatch', (select count(*) from payments where status = 'mismatch'),
      'pendingOld', (select count(*) from payments where status = 'pending' and created_at between now() - interval '2 days' and now() - interval '1 hour'),
      'withdrawalsStuck', (select count(*) from withdrawals where status = 'processing' and created_at < now() - interval '30 minutes'),
      'badWebhooks7d', (select count(*) from payment_events where kind = 'webhook_bad_signature' and at > now() - interval '7 days'),
      'ledgerMismatch', (select count(*) from wallets w left join (select user_id, currency, sum(amount_minor) s from ledger group by 1, 2) l using (user_id, currency) where w.balance_minor <> coalesce(l.s, 0))),
    'webhooks7d', (select coalesce(jsonb_object_agg(p, c), '{}'::jsonb) from (select coalesce(payload->>'provider', '?') as p, count(*) as c from payment_events where kind = 'webhook' and at > now() - interval '7 days' group by 1) x)
  )
$$;

revoke all on function public.luda_refund_ticket(uuid) from public, anon, authenticated;
revoke all on function public.luda_admin_overview() from public, anon, authenticated;
