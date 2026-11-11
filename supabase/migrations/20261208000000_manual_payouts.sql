-- v1.26.0 (owner: 'don't reject withdrawals; if Paystack/Flutterwave refuse, send it to Luda HQ to sort out').
-- A withdrawal the providers refuse is no longer refunded: it stays 'processing' with provider 'manual' and waits
-- in Luda HQ → Payouts, where one team member claims it, pays from the bank app and attaches the receipt.
alter table public.withdrawals add column if not exists receipt text[] not null default '{}';
alter table public.withdrawals add column if not exists claimed_by text;
alter table public.withdrawals add column if not exists claimed_at timestamptz;
alter table public.withdrawals add column if not exists paid_by text;

-- Claim a manual payout so two people never pay the same one (take-over after 30 minutes).
create or replace function public.luda_payout_claim(p_ref text, p_staff text, p_release boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w withdrawals%rowtype;
begin
  select * into w from withdrawals where reference = p_ref for update;
  if not found or w.status <> 'processing' or coalesce(w.provider, '') <> 'manual' then return jsonb_build_object('ok', false, 'why', 'done'); end if;
  if p_release then
    if w.claimed_by = p_staff then update withdrawals set claimed_by = null, claimed_at = null where reference = p_ref; end if;
    return jsonb_build_object('ok', true);
  end if;
  if w.claimed_by is not null and w.claimed_by <> p_staff and w.claimed_at > now() - interval '30 minutes' then
    return jsonb_build_object('ok', false, 'why', 'claimed', 'by', w.claimed_by);
  end if;
  update withdrawals set claimed_by = p_staff, claimed_at = now() where reference = p_ref;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.luda_payout_paid_info(p_ref text, p_staff text, p_receipt text[]) returns void
language sql security definer set search_path = public as $$
  update withdrawals set paid_by = p_staff, receipt = coalesce(p_receipt, '{}') where reference = p_ref
$$;

-- Health: manual payouts are watched separately (the team must pay them fast); 'stuck' now means a provider payout.
create or replace function public.luda_health_checks() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ledger_mismatch', (select count(*) from wallets w left join (select user_id, currency, sum(amount_minor) s from ledger group by 1, 2) l using (user_id, currency) where w.balance_minor <> coalesce(l.s, 0)),
    'escrow_missing', (select count(*) from escrows e where not exists (select 1 from ledger g where g.ref = e.id::text and g.kind = e.kind || '_pay')
                         or (e.status = 'refunded' and not exists (select 1 from ledger g where g.ref = e.id::text and g.kind = e.kind || '_refund'))),
    'withdrawals_stuck', (select count(*) from withdrawals where status = 'processing' and coalesce(provider, '') <> 'manual' and created_at < now() - interval '30 minutes'),
    'payouts_manual_late', (select count(*) from withdrawals where status = 'processing' and provider = 'manual' and created_at < now() - interval '15 minutes'),
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

do $$ declare f text; begin
  foreach f in array array['luda_payout_claim(text,text,boolean)', 'luda_payout_paid_info(text,text,text[])', 'luda_health_checks()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

create or replace function public.luda_withdraw_note(p_ref text, p_note text) returns void
language sql security definer set search_path = public as $$ update withdrawals set note = p_note, updated_at = now() where reference = p_ref $$;
revoke all on function public.luda_withdraw_note(text,text) from public, anon, authenticated;
