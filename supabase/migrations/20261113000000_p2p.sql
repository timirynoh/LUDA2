-- P2P exchange (owner's request 2026-11-04, Bybit-style): Naira inside Luda ⇄ Turkish lira sent outside Luda.
-- The Naira side is ALWAYS held in escrow by Luda when an order opens; the lira is sent bank-to-bank (or cash) by the
-- other person, who then marks it sent with a receipt. The Naira payer checks their bank and releases. Disputes go to
-- the Luda team (appeal), who release or refund. Ads show the maker's area so people can trade with someone nearby.

alter table public.escrows drop constraint if exists escrows_kind_check;
alter table public.escrows add constraint escrows_kind_check check (kind in ('bill', 'market', 'flash', 'p2p'));

-- Where someone receives lira: their own TL bank account (holder must be their verified name; checked by the api).
create table if not exists public.pay_methods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (user_id),
  bank       text not null check (length(bank) between 2 and 60),
  iban       text not null check (iban ~ '^TR[0-9]{24}$'),
  holder     text not null check (length(holder) between 3 and 80),
  removed    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pay_methods_user on public.pay_methods (user_id) where not removed;
alter table public.pay_methods enable row level security;

-- side 'sell' = the maker SELLS lira (sends TL, receives Naira). side 'buy' = the maker BUYS lira (pays Naira).
create table if not exists public.p2p_ads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (user_id),
  side          text not null check (side in ('sell', 'buy')),
  price         numeric(12, 4) not null check (price > 0), -- Naira per 1 lira
  min_try       bigint not null check (min_try > 0),       -- kuruş per order
  max_try       bigint not null check (max_try >= min_try),
  available_try bigint not null check (available_try >= 0),
  methods       text[] not null default '{bank}',          -- bank | cash
  receive_method uuid references public.pay_methods (id),  -- 'buy' ads: the maker's TL account
  city          text not null default '',
  area          text not null default '',
  terms         text not null default '',
  status        text not null default 'active' check (status in ('active', 'paused', 'removed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists p2p_ads_feed on public.p2p_ads (side, status, price);
alter table public.p2p_ads enable row level security;

create table if not exists public.p2p_orders (
  id          uuid primary key default gen_random_uuid(),
  ad_id       uuid not null references public.p2p_ads (id),
  maker       uuid not null references public.profiles (user_id),
  taker       uuid not null references public.profiles (user_id),
  ngn_payer   uuid not null references public.profiles (user_id), -- pays Naira (held), receives lira outside Luda
  try_sender  uuid not null references public.profiles (user_id), -- sends lira outside Luda, receives Naira
  price       numeric(12, 4) not null,
  amount_try  bigint not null check (amount_try > 0),
  amount_ngn  bigint not null check (amount_ngn > 0),
  fee_ngn     bigint not null default 0,
  method      text not null check (method in ('bank', 'cash')),
  try_to      jsonb not null default '{}'::jsonb, -- snapshot of where the lira goes (bank, IBAN, holder) or the meeting area
  escrow_id   uuid not null references public.escrows (id),
  status      text not null default 'waiting' check (status in ('waiting', 'sent', 'done', 'cancelled', 'appeal')),
  receipt     text[] not null default '{}',
  pay_by      timestamptz not null,
  sent_at     timestamptz,
  done_at     timestamptz,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists p2p_orders_maker on public.p2p_orders (maker, created_at desc);
create index if not exists p2p_orders_taker on public.p2p_orders (taker, created_at desc);
create index if not exists p2p_orders_status on public.p2p_orders (status, pay_by);
alter table public.p2p_orders enable row level security;

create table if not exists public.p2p_messages (
  id       bigint generated always as identity primary key,
  order_id uuid not null references public.p2p_orders (id) on delete cascade,
  user_id  uuid, -- null = system / Luda team
  body     text not null default '',
  files    text[] not null default '{}',
  at       timestamptz not null default now()
);
create index if not exists p2p_messages_order on public.p2p_messages (order_id, id);
alter table public.p2p_messages enable row level security;

/* ------------------------------- helpers -------------------------------- */
create or replace function public.luda_p2p_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trades', count(*) filter (where status = 'done'),
    'rate', case when count(*) filter (where status in ('done', 'cancelled')) = 0 then null
                 else round(100.0 * count(*) filter (where status = 'done') / count(*) filter (where status in ('done', 'cancelled'))) end,
    'since', (select created_at from profiles where user_id = p_user))
  from p2p_orders where maker = p_user or taker = p_user
$$;

create or replace function public.luda_p2p_sys(p_order uuid, p_body text) returns void
language sql security definer set search_path = public as $$ insert into p2p_messages (order_id, user_id, body) values (p_order, null, p_body) $$;

/* --------------------------------- ads ---------------------------------- */
create or replace function public.luda_p2p_ad_save(p_user uuid, p_id uuid, p jsonb, p_max_ads int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a p2p_ads%rowtype; cap bigint := (p->>'max_try')::bigint;
begin
  if p_id is null then
    if (select count(*) from p2p_ads where user_id = p_user and status in ('active', 'paused')) >= p_max_ads then raise exception 'too_many_ads'; end if;
    insert into p2p_ads (user_id, side, price, min_try, max_try, available_try, methods, receive_method, city, area, terms)
    values (p_user, p->>'side', (p->>'price')::numeric, (p->>'min_try')::bigint, cap, cap,
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

-- Live ads for one side, with the maker's name, verification and track record. The api sorts them by area/city.
create or replace function public.luda_p2p_ads(p_side text, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(a) - 'receive_method' || jsonb_build_object(
      'maker', p.username, 'makerName', p.full_name, 'verified', p.kyc_status = 'verified', 'mine', a.user_id = p_viewer,
      'stats', luda_p2p_stats(a.user_id)) order by a.price), '[]'::jsonb)
    from p2p_ads a join profiles p on p.user_id = a.user_id
   where a.status = 'active' and a.side = p_side and a.available_try >= a.min_try and not p.frozen
$$;

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
  -- 'buy' ad paid by bank: the lira goes to the maker's own account saved on the ad.
  if a.side = 'buy' and p_method = 'bank' then
    select jsonb_build_object('kind', 'bank', 'bank', m.bank, 'iban', m.iban, 'holder', m.holder) into dest from pay_methods m where m.id = a.receive_method and not m.removed;
    if dest is null then raise exception 'not_available'; end if;
  end if;
  ngn := round(p_try * a.price);
  fee := round(ngn * p_fee_pct);
  eid := luda_hold('p2p', payer, sender, 'NGN', ngn, fee, jsonb_build_object('order', oid, 'try', p_try, 'price', a.price));
  update p2p_ads set available_try = available_try - p_try, updated_at = now() where id = a.id;
  insert into p2p_orders (id, ad_id, maker, taker, ngn_payer, try_sender, price, amount_try, amount_ngn, fee_ngn, method, try_to, escrow_id, pay_by)
  values (oid, a.id, a.user_id, p_taker, payer, sender, a.price, p_try, ngn, fee, p_method, coalesce(dest, '{}'::jsonb), eid, now() + make_interval(mins => p_window_min))
  returning * into o;
  perform luda_p2p_sys(o.id, 'Order opened. The Naira is held safely by Luda until the lira arrives.');
  return to_jsonb(o) - 'escrow_id';
end $$;

-- Undo an order: Naira back to the payer, lira amount back on the ad.
create or replace function public.luda_p2p_close(o p2p_orders, p_status text, p_to text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform luda_settle(o.escrow_id, p_to, p_note);
  update p2p_orders set status = p_status, note = p_note, done_at = now(), updated_at = now() where id = o.id;
  if p_to = 'payer' then update p2p_ads set available_try = least(max_try, available_try + o.amount_try), updated_at = now() where id = o.ad_id; end if;
  perform luda_p2p_sys(o.id, p_note);
end $$;

-- The lira sender says "I've sent it" (with receipt photos).
create or replace function public.luda_p2p_sent(p_order uuid, p_user uuid, p_receipt text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and try_sender = p_user and status = 'waiting' for update;
  if not found then raise exception 'not_available'; end if;
  update p2p_orders set status = 'sent', sent_at = now(), receipt = receipt || coalesce(p_receipt, '{}'), updated_at = now() where id = o.id;
  insert into p2p_messages (order_id, user_id, body, files) values (o.id, p_user, 'I have sent the lira. Please check and release.', coalesce(p_receipt, '{}'));
  return jsonb_build_object('ok', true);
end $$;

-- The Naira payer confirms the lira arrived: Naira (minus fee) goes to the sender.
create or replace function public.luda_p2p_release(p_order uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and ngn_payer = p_user and status in ('waiting', 'sent', 'appeal') for update;
  if not found then raise exception 'not_available'; end if;
  perform luda_p2p_close(o, 'done', 'payee', 'Lira received and confirmed. Naira released.');
  return jsonb_build_object('ok', true);
end $$;

-- Lira sender may cancel while waiting; the Naira payer may cancel only after the payment window passed unpaid.
create or replace function public.luda_p2p_cancel(p_order uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and status = 'waiting' and (try_sender = p_user or (ngn_payer = p_user and pay_by < now())) for update;
  if not found then raise exception 'not_available'; end if;
  perform luda_p2p_close(o, 'cancelled', 'payer', case when o.try_sender = p_user then 'Cancelled by the lira sender. Naira refunded.' else 'Cancelled: the lira was not sent in time. Naira refunded.' end);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.luda_p2p_appeal(p_order uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and (ngn_payer = p_user or try_sender = p_user) and status in ('waiting', 'sent') for update;
  if not found then raise exception 'not_available'; end if;
  update p2p_orders set status = 'appeal', updated_at = now() where id = o.id;
  perform luda_p2p_sys(o.id, 'Appeal opened. The Naira stays held until the Luda team decides. Share receipts and screenshots here.');
  return jsonb_build_object('ok', true);
end $$;

-- Luda team decision: 'sender' (lira was sent: release Naira) or 'payer' (refund the Naira).
create or replace function public.luda_p2p_finish(p_order uuid, p_to text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and status in ('waiting', 'sent', 'appeal') for update;
  if not found then return jsonb_build_object('ok', false); end if;
  if p_to = 'sender' then perform luda_p2p_close(o, 'done', 'payee', p_note); else perform luda_p2p_close(o, 'cancelled', 'payer', p_note); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Orders still 'waiting' after their payment window: refund the Naira (runs when people open P2P).
create or replace function public.luda_p2p_expire() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; o p2p_orders%rowtype;
begin
  for o in select * from p2p_orders where status = 'waiting' and pay_by < now() - interval '5 minutes' for update skip locked loop
    perform luda_p2p_close(o, 'cancelled', 'payer', 'Cancelled automatically: the lira was not marked as sent in time. Naira refunded.'); n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.luda_p2p_view(o p2p_orders, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select (to_jsonb(o) - 'escrow_id' - 'maker' - 'taker' - 'ngn_payer' - 'try_sender' - 'receipt') || jsonb_build_object(
    'role', case when o.ngn_payer = p_viewer then 'payer' when o.try_sender = p_viewer then 'sender' else 'staff' end,
    'iAmMaker', o.maker = p_viewer,
    'payer', (select jsonb_build_object('username', p.username, 'name', p.full_name, 'verified', p.kyc_status = 'verified') from profiles p where p.user_id = o.ngn_payer),
    'sender', (select jsonb_build_object('username', p.username, 'name', p.full_name, 'verified', p.kyc_status = 'verified') from profiles p where p.user_id = o.try_sender),
    'receiptKeys', to_jsonb(o.receipt))
$$;

create or replace function public.luda_p2p_orders(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(luda_p2p_view(o, p_user) order by o.created_at desc), '[]'::jsonb)
    from (select * from p2p_orders where maker = p_user or taker = p_user order by created_at desc limit 50) o
$$;

-- One order with its messages: only the two people in it, or staff (p_user null).
create or replace function public.luda_p2p_order(p_order uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select luda_p2p_view(o, p_user) || jsonb_build_object('messages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'by', case when m.user_id is null then null else luda_uname(m.user_id) end, 'mine', m.user_id = p_user, 'body', m.body, 'files', to_jsonb(m.files), 'at', m.at) order by m.id)
      from p2p_messages m where m.order_id = o.id), '[]'::jsonb))
    from p2p_orders o where o.id = p_order and (p_user is null or o.maker = p_user or o.taker = p_user)
$$;

create or replace function public.luda_p2p_msg(p_order uuid, p_user uuid, p_body text, p_files text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_user is not null and not exists (select 1 from p2p_orders where id = p_order and (maker = p_user or taker = p_user)) then raise exception 'not_member'; end if;
  insert into p2p_messages (order_id, user_id, body, files) values (p_order, p_user, coalesce(p_body, ''), coalesce(p_files, '{}'));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.luda_p2p_admin(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(luda_p2p_view(o, null) order by o.updated_at desc), '[]'::jsonb)
    from (select * from p2p_orders where p_status is null or status = p_status order by updated_at desc limit 100) o
$$;

-- Admin held-money list now also knows P2P orders.
create or replace function public.luda_admin_escrows(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select to_jsonb(e) || jsonb_build_object('payer_name', luda_uname(e.payer), 'payee_name', luda_uname(e.payee),
      'item', coalesce((select jsonb_build_object('type', 'market', 'id', l.id, 'title', l.title, 'status', l.status) from listings l where l.escrow_id = e.id),
                       (select jsonb_build_object('type', 'flash', 'id', j.id, 'title', j.title, 'status', j.status) from flash_jobs j where j.escrow_id = e.id),
                       (select jsonb_build_object('type', 'bill', 'id', b.id, 'title', b.provider, 'status', b.status) from bills b where b.escrow_id = e.id),
                       (select jsonb_build_object('type', 'p2p', 'id', o.id, 'title', 'P2P: ₺' || (o.amount_try / 100.0)::text || ' for ₦' || (o.amount_ngn / 100.0)::text, 'status', o.status) from p2p_orders o where o.escrow_id = e.id))) x
      from escrows e where p_status is null or e.status = p_status order by e.created_at desc limit 100) s
$$;


/* ------------------------------ small reads ------------------------------ */
create or replace function public.luda_pay_methods(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'bank', bank, 'iban', iban, 'holder', holder) order by created_at), '[]'::jsonb) from pay_methods where user_id = p_user and not removed
$$;
create or replace function public.luda_pay_method_add(p_user uuid, p_bank text, p_iban text, p_holder text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m pay_methods%rowtype;
begin
  if (select count(*) from pay_methods where user_id = p_user and not removed) >= 5 then raise exception 'too_many_methods'; end if;
  insert into pay_methods (user_id, bank, iban, holder) values (p_user, p_bank, p_iban, p_holder) returning * into m;
  return jsonb_build_object('id', m.id, 'bank', m.bank, 'iban', m.iban, 'holder', m.holder);
end $$;
create or replace function public.luda_pay_method_remove(p_user uuid, p_id uuid) returns boolean
language sql security definer set search_path = public as $$
  with u as (update pay_methods set removed = true where id = p_id and user_id = p_user returning 1) select exists (select 1 from u)
$$;
create or replace function public.luda_p2p_my_ads(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc), '[]'::jsonb) from p2p_ads a where a.user_id = p_user and a.status <> 'removed'
$$;
create or replace function public.luda_p2p_ad_get(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'side', side, 'status', status) from p2p_ads where id = p_id and status = 'active'
$$;

do $$ declare f text; begin
  foreach f in array array[
    'luda_p2p_stats(uuid)', 'luda_p2p_sys(uuid,text)', 'luda_p2p_ad_save(uuid,uuid,jsonb,int)', 'luda_p2p_ads(text,uuid)',
    'luda_p2p_order_create(uuid,uuid,bigint,numeric,text,jsonb,int)', 'luda_p2p_close(p2p_orders,text,text,text)', 'luda_p2p_sent(uuid,uuid,text[])',
    'luda_p2p_release(uuid,uuid)', 'luda_p2p_cancel(uuid,uuid)', 'luda_p2p_appeal(uuid,uuid)', 'luda_p2p_finish(uuid,text,text)', 'luda_p2p_expire()',
    'luda_p2p_view(p2p_orders,uuid)', 'luda_p2p_orders(uuid)', 'luda_p2p_order(uuid,uuid)', 'luda_p2p_msg(uuid,uuid,text,text[])', 'luda_p2p_admin(text)',
    'luda_admin_escrows(text)', 'luda_pay_methods(uuid)', 'luda_pay_method_add(uuid,text,text,text)', 'luda_pay_method_remove(uuid,uuid)', 'luda_p2p_my_ads(uuid)', 'luda_p2p_ad_get(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
