-- v1.34.0: Luda does not hold money (owner, 2026-11-20, after registering the business: "I can't hold money …
-- when a user wants to pay for a service, they pay directly"). No wallet: every service (bus ticket, bill, rent,
-- mobile top-up) is paid at checkout through Paystack/Flutterwave as ONE order. When the provider confirms the
-- payment, the order is fulfilled in the same request (the money passes straight to the service, nothing is kept);
-- if a service can't be delivered, the money goes back to the card/bank through the provider's refund.
-- Nothing old is deleted: wallet tables stay (closed), so history and statements still work.

-- 1. Orders are payments with purpose 'order'. Refund tracking for orders.
alter table public.payments add column if not exists refund_status text check (refund_status in ('pending', 'refunded', 'failed'));
alter table public.payments add column if not exists refund_note text;
alter table public.payments add column if not exists refunded_at timestamptz;
alter table public.payments add column if not exists done_at timestamptz;      -- order delivered (ticket issued / bill queued)
alter table public.tickets add column if not exists order_ref text;
alter table public.bills add column if not exists order_ref text;
create index if not exists payments_orders on public.payments (user_id, created_at desc) where purpose = 'order';

-- Provider confirmed the payment: the order's amount passes through for the service (ledger kind 'order_pay').
-- The same request spends it on the service, so no balance is ever left behind.
create or replace function public.luda_order_paid(p_reference text, p_tx text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p payments%rowtype;
begin
  update payments set status = 'paid', provider_tx_id = p_tx, paid_at = now()
   where reference = p_reference and status in ('pending', 'failed', 'mismatch') and purpose = 'order'
  returning * into p;
  if not found then return jsonb_build_object('ok', true, 'already', true); end if;
  perform luda_post(jsonb_build_array(jsonb_build_object(
    'user_id', p.user_id, 'currency', p.credit_currency, 'amount_minor', p.credit_minor, 'kind', 'order_pay', 'ref', p.reference,
    'meta', jsonb_build_object('provider', p.provider, 'charged', p.amount_minor, 'charged_currency', p.currency, 'fee', p.fee_minor))));
  return jsonb_build_object('ok', true);
end $$;

-- Order delivered: remember what it became (ticket/bill id) so it's never delivered twice.
create or replace function public.luda_order_done(p_reference text, p_result jsonb) returns void
language sql security definer set search_path = public as $$
  update payments set done_at = now(), item = item || jsonb_build_object('result', p_result) where reference = p_reference and done_at is null;
$$;

-- Money for an order that can't be delivered leaves the pass-through again (it goes back to the card/bank).
create or replace function public.luda_order_refund_out(p_reference text, p_user uuid, p_amount bigint, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_amount > 0 then
    perform luda_post(jsonb_build_array(jsonb_build_object('user_id', p_user, 'currency', 'TRY', 'amount_minor', -p_amount, 'kind', 'order_refund', 'ref', p_reference,
      'meta', jsonb_build_object('note', p_note))));
  end if;
  update payments set refund_status = 'pending', refund_note = left(coalesce(p_note, ''), 300) where reference = p_reference and refund_status is null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.luda_order_refund_set(p_reference text, p_status text, p_note text) returns void
language sql security definer set search_path = public as $$
  update payments set refund_status = p_status, refund_note = coalesce(nullif(p_note, ''), refund_note),
         refunded_at = case when p_status = 'refunded' then now() else refunded_at end
   where reference = p_reference;
$$;

create or replace function public.luda_bill_order(p_bill uuid, p_ref text) returns void
language sql security definer set search_path = public as $$ update bills set order_ref = p_ref where id = p_bill $$;
create or replace function public.luda_ticket_order(p_ticket uuid, p_ref text) returns void
language sql security definer set search_path = public as $$ update tickets set order_ref = p_ref where id = p_ticket $$;

create or replace function public.luda_bill_order_ref(p_bill uuid) returns text
language sql stable security definer set search_path = public as $$ select order_ref from bills where id = p_bill $$;
create or replace function public.luda_ticket_order_ref(p_ticket text) returns text
language sql stable security definer set search_path = public as $$ select order_ref from tickets where id::text = p_ticket $$;

-- A person's orders, newest first (for 'My payments').
create or replace function public.luda_orders_mine(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('reference', reference, 'provider', provider, 'status', status, 'charge', amount_minor, 'currency', currency,
    'item', item - 'files', 'createdAt', created_at, 'paidAt', paid_at, 'doneAt', done_at, 'refund', refund_status, 'refundNote', refund_note, 'refundedAt', refunded_at)
    order by created_at desc), '[]'::jsonb)
  from (select * from payments where user_id = p_user and purpose = 'order' and (status = 'paid' or created_at > now() - interval '2 days') order by created_at desc limit 100) x
$$;

-- Refunds the team must send by hand (the provider refused or the refund API is unavailable).
create or replace function public.luda_refunds_waiting() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('reference', p.reference, 'provider', p.provider, 'charge', p.amount_minor, 'currency', p.currency,
    'username', pr.username, 'label', p.item->>'label', 'note', p.refund_note, 'at', p.created_at) order by p.created_at), '[]'::jsonb)
  from payments p join profiles pr on pr.user_id = p.user_id
  where p.purpose = 'order' and p.refund_status in ('pending', 'failed')
$$;

-- 2. Discounts (rewards are no longer cash): Luda-funded lira off the next service. One row per change; the sum is
--    what a person can use. A checkout reserves its discount at once ('hold:<order>') and gives it back if the payment fails.
create table if not exists public.discount_events (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (user_id),
  amount_minor bigint not null,  -- + earned / released, - used (TRY kuruş)
  ref        text not null,
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, ref)
);
alter table public.discount_events enable row level security;

create or replace function public.luda_discount(p_user uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select greatest(coalesce(sum(amount_minor), 0), 0)::bigint from discount_events where user_id = p_user
$$;

-- Reserve up to p_max for an order (locks the profile so two checkouts can't spend the same discount).
create or replace function public.luda_discount_hold(p_user uuid, p_max bigint, p_ref text) returns bigint
language plpgsql security definer set search_path = public as $$
declare have bigint; take bigint;
begin
  perform 1 from profiles where user_id = p_user for update;
  have := luda_discount(p_user);
  take := least(have, greatest(p_max, 0));
  if take > 0 then insert into discount_events (user_id, amount_minor, ref, note) values (p_user, -take, 'hold:' || p_ref, 'Used on an order') on conflict do nothing; end if;
  return take;
end $$;

-- Give a held discount back (payment failed, or the order was refunded).
create or replace function public.luda_discount_release(p_user uuid, p_ref text) returns void
language sql security definer set search_path = public as $$
  insert into discount_events (user_id, amount_minor, ref, note)
  select p_user, -amount_minor, 'release:' || p_ref, 'Discount returned' from discount_events where user_id = p_user and ref = 'hold:' || p_ref
  on conflict do nothing;
$$;

-- Rewards: cash prizes become discounts on services (same monthly budget). Points → discount too.
create or replace function public.luda_reward(p_user uuid, p_kind text, p_ref text, p_xp int, p_points int, p_cash bigint, p_note text, p_cap bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid bigint; spent bigint; cash bigint := greatest(coalesce(p_cash, 0), 0); pts int := coalesce(p_points, 0); swapped boolean := false;
begin
  if exists (select 1 from reward_events where user_id = p_user and kind = p_kind and ref = p_ref) then
    return jsonb_build_object('ok', false, 'already', true);
  end if;
  if cash > 0 then
    perform pg_advisory_xact_lock(4242001);
    select coalesce(sum(cash_minor), 0) into spent from reward_events where created_at >= date_trunc('month', now()) and cash_minor > 0;
    if spent + cash > p_cap then pts := pts + (cash / 100) * 100; cash := 0; swapped := true; end if;
  end if;
  insert into reward_events (user_id, kind, ref, xp, points, cash_minor, note) values (p_user, p_kind, p_ref, coalesce(p_xp, 0), pts, cash, p_note)
  on conflict (user_id, kind, ref) do nothing returning id into rid;
  if rid is null then return jsonb_build_object('ok', false, 'already', true); end if;
  if cash > 0 then
    insert into discount_events (user_id, amount_minor, ref, note) values (p_user, cash, 'rw' || rid, coalesce(p_note, 'Reward')) on conflict do nothing;
  end if;
  return jsonb_build_object('ok', true, 'id', rid, 'xp', coalesce(p_xp, 0), 'points', pts, 'cash', cash, 'swapped', swapped);
end $$;

create or replace function public.luda_redeem(p_user uuid, p_pts int, p_cash bigint, p_ref text, p_cap bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bal int; spent bigint; rid bigint;
begin
  perform 1 from profiles where user_id = p_user for update;
  select coalesce(sum(points), 0) into bal from reward_events where user_id = p_user;
  if bal < p_pts then raise exception 'not_enough_points'; end if;
  perform pg_advisory_xact_lock(4242001);
  select coalesce(sum(cash_minor), 0) into spent from reward_events where created_at >= date_trunc('month', now()) and cash_minor > 0;
  if spent + p_cash > p_cap then raise exception 'rewards_budget'; end if;
  insert into reward_events (user_id, kind, ref, points, cash_minor, note) values (p_user, 'redeem', p_ref, -p_pts, p_cash, 'Points redeemed') returning id into rid;
  insert into discount_events (user_id, amount_minor, ref, note) values (p_user, p_cash, 'rw' || rid, 'Points redeemed') on conflict do nothing;
  return jsonb_build_object('ok', true, 'points', bal - p_pts, 'cash', p_cash);
end $$;

-- Rewards that needed a 'first top-up' now count a person's first paid service (a ticket, bill, rent or top-up).
create or replace function public.luda_activity(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'verified', (select kyc_status = 'verified' from profiles where user_id = p_user),
    'phone', (select phone_verified_at is not null from profiles where user_id = p_user),
    'deposits', (select count(*) from payments where user_id = p_user and purpose in ('deposit', 'order') and status = 'paid'),
    'converts', (select count(*) from ledger where user_id = p_user and kind = 'convert' and amount_minor < 0),
    'tickets', (select count(*) from tickets where user_id = p_user),
    'bills', (select count(*) from bills where user_id = p_user and status = 'paid'),
    'billsMonth', (select count(*) from bills where user_id = p_user and status = 'paid' and created_at >= date_trunc('month', now())),
    'p2p', (select count(*) from p2p_orders where (maker = p_user or taker = p_user) and status = 'done'),
    'p2pMonth', (select count(*) from p2p_orders where (maker = p_user or taker = p_user) and status = 'done' and done_at >= date_trunc('month', now())),
    'flashPosted', (select count(*) from flash_jobs where poster = p_user),
    'flashHelped', (select count(*) from flash_jobs where helper = p_user and status = 'done'),
    'potSavedMonth', (select coalesce(sum(-amount_minor), 0) from ledger where user_id = p_user and kind = 'pot_in' and currency = 'TRY' and at >= date_trunc('month', now())),
    'pots', (select count(*) from pots where user_id = p_user),
    'sold', (select count(*) from listings where seller = p_user and status = 'sold'),
    'posts', (select count(*) from board_posts where user_id = p_user and status = 'live'),
    'groupsOwned', (select count(*) from chat_groups where owner_id = p_user and status = 'live'),
    'groupsJoined', (select count(*) from chat_members where user_id = p_user),
    'sent', (select count(*) from ledger where user_id = p_user and kind = 'send' and amount_minor < 0),
    'referralsVerified', (select count(*) from profiles where invited_by = p_user and kyc_status = 'verified'),
    'streak', (select case when last_checkin >= (now() at time zone 'Europe/Nicosia')::date - 1 then streak else 0 end from profiles where user_id = p_user),
    'lastCheckin', (select last_checkin from profiles where user_id = p_user),
    'points', (select coalesce(sum(points), 0) from reward_events where user_id = p_user),
    'eventXp', (select coalesce(sum(xp), 0) from reward_events where user_id = p_user),
    'spinCashWins', (select count(*) from reward_events where user_id = p_user and kind = 'spin' and cash_minor > 0),
    'challengesDone', (select count(*) from reward_events where user_id = p_user and kind = 'challenge'),
    'cashEarned', (select coalesce(sum(cash_minor), 0) from reward_events where user_id = p_user and kind <> 'redeem'),
    'claimed', (select coalesce(jsonb_agg(kind || ':' || ref), '[]'::jsonb) from reward_events where user_id = p_user and kind in ('challenge', 'ambassador', 'spin') and created_at >= date_trunc('month', now()) - interval '1 day'),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'xp', xp, 'points', points, 'cash', cash_minor, 'note', note, 'at', created_at) order by created_at desc), '[]'::jsonb)
                 from (select * from reward_events where user_id = p_user order by created_at desc limit 20) r))
$$;


create or replace function public.luda_invitees(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'name', split_part(p.full_name, ' ', 1), 'country', p.country, 'joined', p.created_at,
      'verified', p.kyc_status = 'verified', 'toppedUp', exists (select 1 from payments y where y.user_id = p.user_id and y.purpose in ('deposit', 'order') and y.status = 'paid'),
      'paid', exists (select 1 from reward_events r where r.user_id = p_user and r.kind = 'referral' and r.ref = p.user_id::text)) order by p.created_at desc), '[]'::jsonb)
    from profiles p where p.invited_by = p_user
$$;

create or replace function public.luda_referrals_due(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('inviter', p.invited_by, 'invitee', p.user_id, 'name', p.username)), '[]'::jsonb)
    from profiles p
   where p.invited_by is not null and (p.user_id = p_user or p.invited_by = p_user) and p.kyc_status = 'verified'
     and exists (select 1 from payments y where y.user_id = p.user_id and y.purpose in ('deposit', 'order') and y.status = 'paid')
     and not exists (select 1 from reward_events r where r.user_id = p.invited_by and r.kind = 'referral' and r.ref = p.user_id::text)
$$;

-- 3. Close every wallet. The owner already paid the remaining balances (₦2,272 and ₺77.54 in total, 2 people) to
--    their bank accounts by hand; each balance is booked out with a clear record so the ledger still adds up.
do $$
declare w record;
begin
  for w in select user_id, currency, balance_minor from public.wallets where balance_minor > 0 loop
    perform public.luda_post(jsonb_build_array(jsonb_build_object('user_id', w.user_id, 'currency', w.currency, 'amount_minor', -w.balance_minor,
      'kind', 'wallet_closed', 'ref', 'wallet-closed:' || w.currency,
      'meta', jsonb_build_object('reason', 'Wallet closed: your balance was paid to your bank account by the Luda team', 'by', 'luda'))));
    perform public.luda_inbox_add(w.user_id, '🏦', 'Your Luda balance of ' || public.luda_amt(w.balance_minor, w.currency) || ' was paid to your bank account',
      'Luda no longer keeps balances: you now pay for each service directly.', '/payments', 'wallet-closed:' || w.currency);
  end loop;
end $$;

do $$
declare f text;
begin
  foreach f in array array['luda_order_paid(text,text)', 'luda_order_done(text,jsonb)', 'luda_order_refund_out(text,uuid,bigint,text)', 'luda_order_refund_set(text,text,text)',
    'luda_orders_mine(uuid)', 'luda_refunds_waiting()', 'luda_bill_order(uuid,text)', 'luda_ticket_order(uuid,text)', 'luda_bill_order_ref(uuid)', 'luda_ticket_order_ref(text)', 'luda_discount(uuid)', 'luda_discount_hold(uuid,bigint,text)', 'luda_discount_release(uuid,text)',
    'luda_reward(uuid,text,text,int,int,bigint,text,bigint)', 'luda_redeem(uuid,int,bigint,text,bigint)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
