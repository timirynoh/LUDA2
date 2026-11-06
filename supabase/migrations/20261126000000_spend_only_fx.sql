-- v1.15.0 Spend-only lira (owner's choice, 2026-11-04: stop the 'money glitch').
-- Lira bought with Instant conversion is tracked per user ('bought lira'). It can pay for things in Luda (bills,
-- tickets, Market, Flash, savings) but cannot be sent to other people, and converting it back to Naira gives at most
-- the Naira that was paid for it — so nobody profits from the Naira weakening at Luda's expense. Earned lira
-- (Market sales, Flash rewards, money received, foreign top-ups, prizes) is not affected.

create table if not exists public.fx_holdings (
  user_id        uuid primary key references public.profiles (user_id) on delete cascade,
  try_minor      bigint not null default 0 check (try_minor >= 0),       -- bought lira still unspent
  ngn_cost_minor bigint not null default 0 check (ngn_cost_minor >= 0),  -- Naira paid for it
  avg_rate       numeric not null default 0,                             -- Naira (minor) per kuruş, for refunds
  updated_at     timestamptz not null default now()
);
alter table public.fx_holdings enable row level security;

-- Spending lira uses bought lira first; money coming back from something it paid for (refunds, savings out)
-- becomes bought lira again. Sending is limited to earned lira by the API; converting is handled by luda_convert.
create or replace function public.luda_fx_track() returns trigger
language plpgsql security definer set search_path = public as $$
declare h fx_holdings%rowtype; take bigint;
begin
  if new.currency <> 'TRY' or new.kind in ('convert', 'send', 'receive') then return new; end if;
  select * into h from fx_holdings where user_id = new.user_id for update;
  if not found then
    if new.amount_minor > 0 then return new; end if;
    return new;
  end if;
  if new.amount_minor < 0 and h.try_minor > 0 then
    take := least(h.try_minor, -new.amount_minor);
    update fx_holdings set ngn_cost_minor = ngn_cost_minor - (ngn_cost_minor * take / try_minor), try_minor = try_minor - take, updated_at = now() where user_id = new.user_id;
  elsif new.amount_minor > 0 and (new.kind like '%\_refund' or new.kind in ('pot_out', 'ticket_refund')) and h.avg_rate > 0 then
    update fx_holdings set try_minor = try_minor + new.amount_minor, ngn_cost_minor = ngn_cost_minor + round(new.amount_minor * avg_rate), updated_at = now() where user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists ledger_fx_track on public.ledger;
create trigger ledger_fx_track after insert on public.ledger for each row execute function public.luda_fx_track();

create or replace function public.luda_fx(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('boughtTry', least(coalesce(h.try_minor, 0), coalesce(w.balance_minor, 0)), 'costNgn', coalesce(h.ngn_cost_minor, 0),
    'balanceTry', coalesce(w.balance_minor, 0), 'freeTry', greatest(0, coalesce(w.balance_minor, 0) - coalesce(h.try_minor, 0)),
    'boughtToday', (select coalesce(sum(amount_minor), 0) from ledger where user_id = p_user and currency = 'TRY' and kind = 'convert' and amount_minor > 0 and at > now() - interval '24 hours'))
  from (select 1) x left join fx_holdings h on h.user_id = p_user left join wallets w on w.user_id = p_user and w.currency = 'TRY'
$$;

-- One conversion, priced and booked by the server. p_quote = true only works it out (for the app's preview).
create or replace function public.luda_convert(p_user uuid, p_from text, p_amount bigint, p_mid numeric, p_margin numeric, p_ref text, p_try_day_cap bigint, p_min_out bigint, p_quote boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare h fx_holdings%rowtype; bal bigint; free bigint; from_free bigint; from_bought bigint; out_free bigint := 0; out_bought bigint := 0;
        market_bought bigint := 0; cost_part bigint := 0; outv bigint; today bigint;
begin
  if p_from not in ('NGN', 'TRY') or p_amount <= 0 then raise exception 'not_available'; end if;
  if not p_quote then
    insert into fx_holdings (user_id) values (p_user) on conflict do nothing;
    select * into h from fx_holdings where user_id = p_user for update;
  else
    select * into h from fx_holdings where user_id = p_user;
    if not found then h.try_minor := 0; h.ngn_cost_minor := 0; end if;
  end if;
  if p_from = 'NGN' then
    outv := floor(p_amount / p_mid * (1 - p_margin));
    if outv <= 0 then raise exception 'too_small'; end if;
    select coalesce(sum(amount_minor), 0) into today from ledger where user_id = p_user and currency = 'TRY' and kind = 'convert' and amount_minor > 0 and at > now() - interval '24 hours';
    if today + outv > p_try_day_cap then raise exception 'fx_daily_cap'; end if;
    if p_quote then return jsonb_build_object('out', outv, 'spendOnly', outv); end if;
    if outv < p_min_out then raise exception 'rate_moved'; end if;
    perform luda_post(jsonb_build_array(
      jsonb_build_object('user_id', p_user, 'currency', 'NGN', 'amount_minor', -p_amount, 'kind', 'convert', 'ref', p_ref, 'meta', jsonb_build_object('to', 'TRY', 'rate', p_mid, 'margin', p_margin)),
      jsonb_build_object('user_id', p_user, 'currency', 'TRY', 'amount_minor', outv, 'kind', 'convert', 'ref', p_ref, 'meta', jsonb_build_object('from', 'NGN', 'rate', p_mid, 'margin', p_margin, 'spendOnly', true))));
    update fx_holdings set try_minor = try_minor + outv, ngn_cost_minor = ngn_cost_minor + p_amount,
      avg_rate = (ngn_cost_minor + p_amount)::numeric / (try_minor + outv), updated_at = now() where user_id = p_user;
    return jsonb_build_object('out', outv, 'spendOnly', outv);
  end if;
  -- Lira → Naira: earned lira at today's rate; bought lira at most what was paid for it.
  select coalesce((select balance_minor from wallets where user_id = p_user and currency = 'TRY'), 0) into bal;
  if p_amount > bal then raise exception 'insufficient_funds'; end if;
  free := greatest(0, bal - least(h.try_minor, bal));
  from_free := least(p_amount, free); from_bought := p_amount - from_free;
  out_free := floor(from_free * p_mid * (1 - p_margin));
  if from_bought > 0 then
    market_bought := floor(from_bought * p_mid * (1 - p_margin));
    cost_part := case when h.try_minor > 0 then floor(h.ngn_cost_minor::numeric * from_bought / h.try_minor) else 0 end;
    out_bought := least(market_bought, cost_part);
  end if;
  outv := out_free + out_bought;
  if outv <= 0 then raise exception 'too_small'; end if;
  if p_quote then return jsonb_build_object('out', outv, 'fromBought', from_bought, 'capped', market_bought > cost_part and from_bought > 0); end if;
  if outv < p_min_out then raise exception 'rate_moved'; end if;
  perform luda_post(jsonb_build_array(
    jsonb_build_object('user_id', p_user, 'currency', 'TRY', 'amount_minor', -p_amount, 'kind', 'convert', 'ref', p_ref, 'meta', jsonb_build_object('to', 'NGN', 'rate', p_mid, 'margin', p_margin, 'fromBought', from_bought)),
    jsonb_build_object('user_id', p_user, 'currency', 'NGN', 'amount_minor', outv, 'kind', 'convert', 'ref', p_ref, 'meta', jsonb_build_object('from', 'TRY', 'rate', p_mid, 'margin', p_margin, 'capped', market_bought > cost_part))));
  if from_bought > 0 then
    update fx_holdings set ngn_cost_minor = greatest(0, ngn_cost_minor - (case when try_minor > 0 then floor(ngn_cost_minor::numeric * from_bought / try_minor) else 0 end)),
      try_minor = greatest(0, try_minor - from_bought), updated_at = now() where user_id = p_user;
  end if;
  return jsonb_build_object('out', outv, 'fromBought', from_bought, 'capped', market_bought > cost_part and from_bought > 0);
end $$;

insert into public.guides (slug, kind, title, intro) values ('tip-spend-only', 'tip', 'Spend-only lira',
 'Lira you buy with Instant is for spending inside Luda: bills, bus tickets, Market, Flash jobs and savings. It can''t be sent to other people, and if you change it back to Naira you get at most the Naira you paid for it. This stops anyone using Luda''s rate to make money from the exchange rate. Lira you earn or receive (Market sales, Flash rewards, money from friends, prizes) works as normal. Limit: ₺5,000 a day.')
on conflict (slug) do nothing;

revoke all on function public.luda_fx_track() from public, anon, authenticated;
revoke all on function public.luda_fx(uuid) from public, anon, authenticated;
revoke all on function public.luda_convert(uuid, text, bigint, numeric, numeric, text, bigint, bigint, boolean) from public, anon, authenticated;
