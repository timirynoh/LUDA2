-- P2P v2 (owner 2026-11-04): more currencies (lira, dollar, euro, pound; Luda still only holds Naira), people set
-- their own rate, Bybit-style disputes: appeal only after a waiting time, a negotiation stage, then a Luda review
-- handled by an assigned staff member who can message both sides; unreleased orders go to review after 1 hour.

alter table public.p2p_ads add column if not exists asset text not null default 'TRY';
alter table public.p2p_ads drop constraint if exists p2p_ads_asset_check;
alter table public.p2p_ads add constraint p2p_ads_asset_check check (asset in ('TRY', 'USD', 'EUR', 'GBP'));

alter table public.pay_methods add column if not exists currency text not null default 'TRY';
alter table public.pay_methods drop constraint if exists pay_methods_currency_check;
alter table public.pay_methods add constraint pay_methods_currency_check check (currency in ('TRY', 'USD', 'EUR', 'GBP'));
-- Any IBAN (TRNC/Turkish accounts in any currency use TR IBANs; UK/EU accounts their own). Checked again by the api.
alter table public.pay_methods drop constraint if exists pay_methods_iban_check;
alter table public.pay_methods add constraint pay_methods_iban_check check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$');

alter table public.p2p_orders add column if not exists asset text not null default 'TRY';
alter table public.p2p_orders add column if not exists appeal_by uuid;
alter table public.p2p_orders add column if not exists appeal_reason text;
alter table public.p2p_orders add column if not exists appeal_at timestamptz;
alter table public.p2p_orders add column if not exists appeal_stage text check (appeal_stage in ('negotiation', 'review', 'decided'));
alter table public.p2p_orders add column if not exists assigned_to text; -- staff username handling the dispute

alter table public.p2p_messages add column if not exists kind text not null default 'user' check (kind in ('user', 'system', 'staff'));
alter table public.p2p_messages add column if not exists staff_name text;
update public.p2p_messages set kind = 'system' where user_id is null and kind = 'user';

create or replace function public.luda_p2p_sys(p_order uuid, p_body text) returns void
language sql security definer set search_path = public as $$ insert into p2p_messages (order_id, user_id, body, kind) values (p_order, null, p_body, 'system') $$;

/* --------------------------------- ads ---------------------------------- */
create or replace function public.luda_p2p_ad_save(p_user uuid, p_id uuid, p jsonb, p_max_ads int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a p2p_ads%rowtype; cap bigint := (p->>'max_try')::bigint;
begin
  if p_id is null then
    if (select count(*) from p2p_ads where user_id = p_user and status in ('active', 'paused')) >= p_max_ads then raise exception 'too_many_ads'; end if;
    insert into p2p_ads (user_id, side, asset, price, min_try, max_try, available_try, methods, receive_method, city, area, terms)
    values (p_user, p->>'side', coalesce(p->>'asset', 'TRY'), (p->>'price')::numeric, (p->>'min_try')::bigint, cap, cap,
            array(select jsonb_array_elements_text(p->'methods')), nullif(p->>'receive_method', '')::uuid, coalesce(p->>'city', ''), coalesce(p->>'area', ''), coalesce(p->>'terms', ''))
    returning * into a;
  else
    update p2p_ads set price = (p->>'price')::numeric, min_try = (p->>'min_try')::bigint, max_try = cap, available_try = cap,
           methods = array(select jsonb_array_elements_text(p->'methods')), receive_method = nullif(p->>'receive_method', '')::uuid,
           city = coalesce(p->>'city', ''), area = coalesce(p->>'area', ''), terms = coalesce(p->>'terms', ''),
           status = coalesce(p->>'status', status), updated_at = now()
     where id = p_id and user_id = p_user and status <> 'removed' returning * into a;
    if not found then raise exception 'not_found'; end if;
  end if;
  return to_jsonb(a);
end $$;

create or replace function public.luda_p2p_ads2(p_side text, p_asset text, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(a) - 'receive_method' || jsonb_build_object(
      'maker', p.username, 'makerName', p.full_name, 'verified', p.kyc_status = 'verified', 'mine', a.user_id = p_viewer,
      'stats', luda_p2p_stats(a.user_id)) order by a.price), '[]'::jsonb)
    from p2p_ads a join profiles p on p.user_id = a.user_id
   where a.status = 'active' and a.side = p_side and a.asset = p_asset and a.available_try >= a.min_try and not p.frozen
$$;

create or replace function public.luda_p2p_ad_get(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'side', side, 'asset', asset, 'status', status) from p2p_ads where id = p_id and status = 'active'
$$;

create or replace function public.luda_pay_methods(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'bank', bank, 'iban', iban, 'holder', holder, 'currency', currency) order by created_at), '[]'::jsonb) from pay_methods where user_id = p_user and not removed
$$;
create or replace function public.luda_pay_method_add2(p_user uuid, p_bank text, p_iban text, p_holder text, p_currency text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m pay_methods%rowtype;
begin
  if (select count(*) from pay_methods where user_id = p_user and not removed) >= 6 then raise exception 'too_many_methods'; end if;
  insert into pay_methods (user_id, bank, iban, holder, currency) values (p_user, p_bank, p_iban, p_holder, p_currency) returning * into m;
  return jsonb_build_object('id', m.id, 'bank', m.bank, 'iban', m.iban, 'holder', m.holder, 'currency', m.currency);
end $$;

/* -------------------------------- orders -------------------------------- */
create or replace function public.luda_p2p_order_create(p_ad uuid, p_taker uuid, p_try bigint, p_fee_pct numeric, p_method text, p_try_to jsonb, p_window_min int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a p2p_ads%rowtype; o p2p_orders%rowtype; payer uuid; sender uuid; ngn bigint; fee bigint; eid uuid; oid uuid := gen_random_uuid(); dest jsonb := p_try_to;
begin
  select * into a from p2p_ads where id = p_ad and status = 'active' for update;
  if not found then raise exception 'not_available'; end if;
  if a.user_id = p_taker then raise exception 'own_listing'; end if;
  if p_try < a.min_try or p_try > a.max_try or p_try > a.available_try then raise exception 'p2p_limits'; end if;
  if not (p_method = any (a.methods)) then raise exception 'p2p_method'; end if;
  if a.side = 'sell' then payer := p_taker; sender := a.user_id; else payer := a.user_id; sender := p_taker; end if;
  if a.side = 'buy' and p_method = 'bank' then
    select jsonb_build_object('kind', 'bank', 'bank', m.bank, 'iban', m.iban, 'holder', m.holder, 'currency', m.currency) into dest from pay_methods m where m.id = a.receive_method and not m.removed;
    if dest is null then raise exception 'not_available'; end if;
  end if;
  ngn := round(p_try * a.price);
  fee := round(ngn * p_fee_pct);
  eid := luda_hold('p2p', payer, sender, 'NGN', ngn, fee, jsonb_build_object('order', oid, 'amount', p_try, 'asset', a.asset, 'price', a.price));
  update p2p_ads set available_try = available_try - p_try, updated_at = now() where id = a.id;
  insert into p2p_orders (id, ad_id, maker, taker, ngn_payer, try_sender, price, amount_try, amount_ngn, fee_ngn, method, try_to, escrow_id, pay_by, asset)
  values (oid, a.id, a.user_id, p_taker, payer, sender, a.price, p_try, ngn, fee, p_method, coalesce(dest, '{}'::jsonb), eid, now() + make_interval(mins => p_window_min), a.asset)
  returning * into o;
  perform luda_p2p_sys(o.id, 'Order opened. The Naira is held safely by Luda until the money arrives.');
  return to_jsonb(o) - 'escrow_id';
end $$;

-- Appeal: only after the sender marked it sent and the waiting time passed. Starts with a negotiation stage
-- (the two people can still sort it out: release, or the sender cancels) before the Luda team reviews it.
create or replace function public.luda_p2p_appeal2(p_order uuid, p_user uuid, p_reason text, p_wait_min int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and (ngn_payer = p_user or try_sender = p_user) for update;
  if not found or o.status <> 'sent' then raise exception 'not_available'; end if;
  if o.sent_at > now() - make_interval(mins => p_wait_min) then raise exception 'appeal_too_early'; end if;
  update p2p_orders set status = 'appeal', appeal_by = p_user, appeal_reason = p_reason, appeal_at = now(), appeal_stage = 'negotiation', updated_at = now() where id = o.id;
  insert into p2p_messages (order_id, user_id, body) values (o.id, p_user, 'Appeal: ' || p_reason);
  perform luda_p2p_sys(o.id, 'Appeal opened. Stage 1: try to sort it out here for 30 minutes (release, or cancel if the money was not sent). After that the Luda team reviews it. The Naira stays locked.');
  return jsonb_build_object('ok', true);
end $$;

-- The person who appealed can withdraw it while still negotiating.
create or replace function public.luda_p2p_appeal_cancel(p_order uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and appeal_by = p_user and status = 'appeal' and appeal_stage = 'negotiation' for update;
  if not found then raise exception 'not_available'; end if;
  update p2p_orders set status = 'sent', appeal_stage = null, appeal_by = null, appeal_reason = null, appeal_at = null, updated_at = now() where id = o.id;
  perform luda_p2p_sys(o.id, 'Appeal withdrawn.');
  return jsonb_build_object('ok', true);
end $$;

-- The sender may also cancel (refund the payer) during an appeal: "I didn't send it".
create or replace function public.luda_p2p_cancel(p_order uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and (
      (status = 'waiting' and (try_sender = p_user or (ngn_payer = p_user and pay_by < now())))
   or (status = 'appeal' and try_sender = p_user)) for update;
  if not found then raise exception 'not_available'; end if;
  perform luda_p2p_close(o, 'cancelled', 'payer', case when o.try_sender = p_user then 'Cancelled by the sender. Naira refunded.' else 'Cancelled: the money was not sent in time. Naira refunded.' end);
  update p2p_orders set appeal_stage = case when appeal_stage is not null then 'decided' end where id = o.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.luda_p2p_release(p_order uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and ngn_payer = p_user and status in ('waiting', 'sent', 'appeal') for update;
  if not found then raise exception 'not_available'; end if;
  perform luda_p2p_close(o, 'done', 'payee', 'Money received and confirmed. Naira released.');
  update p2p_orders set appeal_stage = case when appeal_stage is not null then 'decided' end where id = o.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.luda_p2p_finish(p_order uuid, p_to text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and status in ('waiting', 'sent', 'appeal') for update;
  if not found then return jsonb_build_object('ok', false); end if;
  if p_to = 'sender' then perform luda_p2p_close(o, 'done', 'payee', p_note); else perform luda_p2p_close(o, 'cancelled', 'payer', p_note); end if;
  update p2p_orders set appeal_stage = 'decided' where id = o.id;
  return jsonb_build_object('ok', true);
end $$;

-- Timers: unsent orders refund; 'sent' but not released after 1 hour → automatic appeal (straight to Luda review);
-- negotiation older than 30 minutes → Luda review. Nothing is ever released automatically.
create or replace function public.luda_p2p_expire() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; o p2p_orders%rowtype;
begin
  for o in select * from p2p_orders where status = 'waiting' and pay_by < now() - interval '5 minutes' for update skip locked loop
    perform luda_p2p_close(o, 'cancelled', 'payer', 'Cancelled automatically: the money was not marked as sent in time. Naira refunded.'); n := n + 1;
  end loop;
  for o in select * from p2p_orders where status = 'sent' and sent_at < now() - interval '1 hour' for update skip locked loop
    update p2p_orders set status = 'appeal', appeal_stage = 'review', appeal_by = null, appeal_at = now(), appeal_reason = 'Not released within 1 hour (automatic)', updated_at = now() where id = o.id;
    perform luda_p2p_sys(o.id, 'Not released within 1 hour, so the Luda team will review it. The Naira stays locked. Add any proof here.'); n := n + 1;
  end loop;
  for o in select * from p2p_orders where status = 'appeal' and appeal_stage = 'negotiation' and appeal_at < now() - interval '30 minutes' for update skip locked loop
    update p2p_orders set appeal_stage = 'review', updated_at = now() where id = o.id;
    perform luda_p2p_sys(o.id, 'Stage 2: the Luda team is now reviewing this order.'); n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.luda_p2p_view(o p2p_orders, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select (to_jsonb(o) - 'escrow_id' - 'maker' - 'taker' - 'ngn_payer' - 'try_sender' - 'receipt' - 'appeal_by') || jsonb_build_object(
    'role', case when o.ngn_payer = p_viewer then 'payer' when o.try_sender = p_viewer then 'sender' else 'staff' end,
    'iAmMaker', o.maker = p_viewer, 'iAppealed', o.appeal_by = p_viewer,
    'appealBy', case when o.appeal_by = o.ngn_payer then 'payer' when o.appeal_by = o.try_sender then 'sender' when o.appeal_reason is not null then 'auto' end,
    'payer', (select jsonb_build_object('username', p.username, 'name', p.full_name, 'verified', p.kyc_status = 'verified') from profiles p where p.user_id = o.ngn_payer),
    'sender', (select jsonb_build_object('username', p.username, 'name', p.full_name, 'verified', p.kyc_status = 'verified') from profiles p where p.user_id = o.try_sender),
    'receiptKeys', to_jsonb(o.receipt))
$$;

create or replace function public.luda_p2p_order(p_order uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select luda_p2p_view(o, p_user) || jsonb_build_object('messages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'kind', m.kind, 'by', case when m.kind = 'user' then luda_uname(m.user_id) when m.kind = 'staff' then coalesce(m.staff_name, 'Luda team') end,
      'mine', m.kind = 'user' and m.user_id = p_user, 'body', m.body, 'files', to_jsonb(m.files), 'at', m.at) order by m.id)
      from p2p_messages m where m.order_id = o.id), '[]'::jsonb))
    from p2p_orders o where o.id = p_order and (p_user is null or o.maker = p_user or o.taker = p_user)
$$;

create or replace function public.luda_p2p_staff_msg(p_order uuid, p_staff text, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from p2p_orders where id = p_order) then raise exception 'not_found'; end if;
  insert into p2p_messages (order_id, user_id, body, kind, staff_name) values (p_order, null, p_body, 'staff', p_staff);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.luda_p2p_claim(p_order uuid, p_staff text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  update p2p_orders set assigned_to = p_staff, appeal_stage = case when status = 'appeal' then 'review' else appeal_stage end, updated_at = now()
   where id = p_order returning * into o;
  if not found then raise exception 'not_found'; end if;
  perform luda_p2p_sys(o.id, 'A Luda team member (' || p_staff || ') is now handling this order.');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.luda_p2p_admin(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(luda_p2p_view(o, null) order by o.updated_at desc), '[]'::jsonb)
    from (select * from p2p_orders where p_status is null or status = p_status order by updated_at desc limit 100) o
$$;

do $$ declare f text; begin
  foreach f in array array[
    'luda_p2p_ads2(text,text,uuid)', 'luda_pay_method_add2(uuid,text,text,text,text)', 'luda_p2p_appeal2(uuid,uuid,text,int)',
    'luda_p2p_appeal_cancel(uuid,uuid)', 'luda_p2p_staff_msg(uuid,text,text)', 'luda_p2p_claim(uuid,text)',
    'luda_p2p_sys(uuid,text)', 'luda_p2p_ad_save(uuid,uuid,jsonb,int)', 'luda_p2p_ad_get(uuid)', 'luda_pay_methods(uuid)',
    'luda_p2p_order_create(uuid,uuid,bigint,numeric,text,jsonb,int)', 'luda_p2p_cancel(uuid,uuid)', 'luda_p2p_release(uuid,uuid)',
    'luda_p2p_finish(uuid,text,text)', 'luda_p2p_expire()', 'luda_p2p_view(p2p_orders,uuid)', 'luda_p2p_order(uuid,uuid)', 'luda_p2p_admin(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
