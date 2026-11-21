-- v1.21.0 (owner picked all four): alerts in my language, Luda HQ daily money report, statements & insights,
-- Verified Exchanger program.

-- 1) The app language each person uses, so phone notifications arrive in it (en, fr, tr, sw, ar).
alter table public.profiles add column if not exists lang text not null default 'en';
alter table public.profiles drop constraint if exists profiles_lang_check;
alter table public.profiles add constraint profiles_lang_check check (lang in ('en', 'fr', 'tr', 'sw', 'ar'));

-- 2) Luda HQ → Money report: each day's money in/out, fees earned, money held, and checks that the payment
--    provider records match Luda's ledger (Cyprus days).
create or replace function public.luda_admin_money(p_days int) returns jsonb
language sql stable security definer set search_path = public as $$
  with days as (select (now() at time zone 'Europe/Nicosia')::date - g as day from generate_series(0, greatest(p_days, 1) - 1) g),
  dep as (select (paid_at at time zone 'Europe/Nicosia')::date as day, provider, coalesce(credit_currency, currency) cur, count(*) n, sum(coalesce(credit_minor, amount_minor)) amt
          from payments where status = 'paid' and paid_at > now() - make_interval(days => p_days + 1) group by 1, 2, 3),
  wdr as (select (created_at at time zone 'Europe/Nicosia')::date as day, currency cur, status, count(*) n, sum(amount_minor) amt,
            sum(case when status = 'paid' then fee_minor else 0 end) fee, max(coalesce(fee_currency, currency)) fee_cur
          from withdrawals where created_at > now() - make_interval(days => p_days + 1) group by 1, 2, 3),
  esc as (select (settled_at at time zone 'Europe/Nicosia')::date as day, kind, currency cur, count(*) n, sum(amount_minor) amt, sum(fee_minor) fee
          from escrows where status = 'released' and settled_at > now() - make_interval(days => p_days + 1) group by 1, 2, 3),
  conv as (select (at at time zone 'Europe/Nicosia')::date as day, currency cur, count(*) n, sum(-amount_minor) amt
           from ledger where kind = 'convert' and amount_minor < 0 and at > now() - make_interval(days => p_days + 1) group by 1, 2),
  tix as (select (at at time zone 'Europe/Nicosia')::date as day, currency cur, count(*) n, sum(-amount_minor) amt
          from ledger where kind = 'ticket' and at > now() - make_interval(days => p_days + 1) group by 1, 2)
  select jsonb_build_object(
    'days', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'topups', (select coalesce(jsonb_agg(jsonb_build_object('provider', provider, 'cur', cur, 'n', n, 'amount', amt)), '[]') from dep where dep.day = d.day),
        'withdrawals', (select coalesce(jsonb_agg(jsonb_build_object('cur', cur, 'status', status, 'n', n, 'amount', amt)), '[]') from wdr where wdr.day = d.day),
        'fees', jsonb_build_object(
          'withdraw', (select coalesce(jsonb_agg(jsonb_build_object('cur', fee_cur, 'amount', s)), '[]') from (select fee_cur, sum(fee) s from wdr where wdr.day = d.day and fee > 0 group by fee_cur) x),
          'escrow', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'cur', cur, 'amount', fee)), '[]') from esc where esc.day = d.day and fee > 0)),
        'escrowReleased', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'cur', cur, 'n', n, 'amount', amt)), '[]') from esc where esc.day = d.day),
        'conversions', (select coalesce(jsonb_agg(jsonb_build_object('cur', cur, 'n', n, 'amount', amt)), '[]') from conv where conv.day = d.day),
        'tickets', (select coalesce(jsonb_agg(jsonb_build_object('cur', cur, 'n', n, 'amount', amt)), '[]') from tix where tix.day = d.day)
      ) order by d.day desc), '[]') from days d),
    'now', jsonb_build_object(
      'wallets', (select coalesce(jsonb_object_agg(currency, s), '{}') from (select currency, sum(balance_minor) s from wallets group by 1) x),
      'held', (select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'cur', currency, 'n', n, 'amount', s)), '[]') from (select kind, currency, count(*) n, sum(amount_minor) s from escrows where status = 'held' group by 1, 2) x),
      'withdrawalsProcessing', (select coalesce(jsonb_agg(jsonb_build_object('cur', currency, 'n', n, 'amount', s)), '[]') from (select currency, count(*) n, sum(amount_minor) s from withdrawals where status = 'processing' group by 1) x),
      'ledgerVsWallets', (select coalesce(jsonb_agg(jsonb_build_object('cur', l.currency, 'ledger', l.s, 'wallets', w.s)), '[]')
        from (select currency, sum(amount_minor) s from ledger group by 1) l join (select currency, sum(balance_minor) s from wallets group by 1) w using (currency) where l.s <> w.s)),
    'checks', jsonb_build_object(
      -- paid at the provider but not in anyone's wallet (should be empty)
      'paidNotCredited', (select coalesce(jsonb_agg(jsonb_build_object('ref', p.reference, 'provider', p.provider, 'amount', coalesce(p.credit_minor, p.amount_minor), 'cur', coalesce(p.credit_currency, p.currency), 'paidAt', p.paid_at)), '[]')
        from payments p where p.status = 'paid' and p.purpose = 'deposit' and not exists (select 1 from ledger g where g.ref = p.reference and g.kind = 'deposit') and p.paid_at > now() - interval '90 days'),
      -- credited in Luda without a confirmed payment (should be empty)
      'creditedNotPaid', (select coalesce(jsonb_agg(jsonb_build_object('ref', g.ref, 'amount', g.amount_minor, 'cur', g.currency, 'at', g.at)), '[]')
        from ledger g where g.kind = 'deposit' and g.at > now() - interval '90 days' and not exists (select 1 from payments p where p.reference = g.ref and p.status = 'paid')),
      'mismatches', (select count(*) from payments where status = 'mismatch'),
      'stuckWithdrawals', (select count(*) from withdrawals where status = 'processing' and created_at < now() - interval '1 hour'))
  )
$$;
revoke all on function public.luda_admin_money(int) from public, anon, authenticated;

-- 3) Statements & insights: one month of a person's wallet, built from the server ledger (Cyprus months).
create or replace function public.luda_cat(p_kind text) returns text language sql immutable as $$
  select case
    when p_kind = 'deposit' then 'topups'
    when p_kind in ('send', 'receive') then 'transfers'
    when p_kind = 'convert' then 'conversions'
    when p_kind like 'ticket%' then 'transport'
    when p_kind like 'withdraw%' then 'withdrawals'
    when p_kind like 'bill%' then 'bills'
    when p_kind like 'market%' then 'market'
    when p_kind like 'flash%' then 'flash'
    when p_kind like 'p2p%' then 'p2p'
    when p_kind like 'pot%' then 'savings'
    when p_kind like 'bond%' then 'exchanger'
    else 'other' end $$;

create or replace function public.luda_statement(p_user uuid, p_month date) returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select (date_trunc('month', p_month)::date::timestamp at time zone 'Europe/Nicosia') s,
                    ((date_trunc('month', p_month) + interval '1 month')::date::timestamp at time zone 'Europe/Nicosia') e),
  rows as (select g.* from ledger g, b where g.user_id = p_user and g.at >= b.s and g.at < b.e),
  curs as (select distinct currency from ledger where user_id = p_user)
  select jsonb_build_object(
    'month', to_char(p_month, 'YYYY-MM'),
    'currencies', (select coalesce(jsonb_object_agg(c.currency, jsonb_build_object(
        'opening', coalesce((select g.balance_after from ledger g, b where g.user_id = p_user and g.currency = c.currency and g.at < b.s order by g.at desc, g.id desc limit 1), 0),
        'closing', coalesce((select g.balance_after from ledger g, b where g.user_id = p_user and g.currency = c.currency and g.at < b.e order by g.at desc, g.id desc limit 1), 0),
        'in', coalesce((select sum(amount_minor) from rows r where r.currency = c.currency and r.amount_minor > 0), 0),
        'out', coalesce((select -sum(amount_minor) from rows r where r.currency = c.currency and r.amount_minor < 0), 0))), '{}') from curs c),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('cat', cat, 'cur', currency, 'in', i, 'out', o, 'n', n) order by o desc), '[]') from (
        select luda_cat(kind) cat, currency, sum(greatest(amount_minor, 0)) i, -sum(least(amount_minor, 0)) o, count(*) n from rows group by 1, 2) x),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('at', at, 'cur', currency, 'amount', amount_minor, 'balance', balance_after, 'kind', kind, 'cat', luda_cat(kind), 'ref', ref,
        'who', coalesce(meta->>'to', meta->>'from'), 'note', meta->>'note') order by at, id), '[]') from rows),
    'months', (select coalesce(jsonb_agg(m order by m desc), '[]') from (select distinct to_char(at at time zone 'Europe/Nicosia', 'YYYY-MM') m from ledger where user_id = p_user) x))
$$;
revoke all on function public.luda_cat(text) from public, anon, authenticated;
revoke all on function public.luda_statement(uuid, date) from public, anon, authenticated;

-- 4) Verified Exchanger: trusted P2P traders get 5 ads up to ₺50,000 each and a ✓ badge, after paying a ₺2,000 bond
--    (held by Luda, refunded when they leave in good standing). The Luda team approves.
alter table public.escrows drop constraint if exists escrows_kind_check;
alter table public.escrows add constraint escrows_kind_check check (kind in ('bill', 'market', 'flash', 'p2p', 'bond'));

create table if not exists public.exchangers (
  user_id     uuid primary key references public.profiles (user_id) on delete cascade,
  status      text not null check (status in ('pending', 'approved', 'rejected', 'removed', 'left')),
  escrow_id   uuid references public.escrows (id),
  note        text,
  applied_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  text
);
alter table public.exchangers enable row level security;
revoke all on public.exchangers from anon, authenticated;

create or replace function public.luda_exchanger(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(x) - 'user_id' from exchangers x where user_id = p_user $$;

create or replace function public.luda_exchanger_names() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(p.username), '[]') from exchangers x join profiles p using (user_id) where x.status = 'approved' $$;

-- Apply: holds the bond from the Lira wallet (one application at a time; reapplying after a rejection is allowed).
create or replace function public.luda_exchanger_apply(p_user uuid, p_bond bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x exchangers; eid uuid;
begin
  select * into x from exchangers where user_id = p_user for update;
  if found and x.status in ('pending', 'approved') then raise exception 'already_applied'; end if;
  eid := luda_hold('bond', p_user, null, 'TRY', p_bond, 0, jsonb_build_object('item', 'Verified Exchanger bond'));
  insert into exchangers (user_id, status, escrow_id, applied_at) values (p_user, 'pending', eid, now())
  on conflict (user_id) do update set status = 'pending', escrow_id = eid, applied_at = now(), decided_at = null, decided_by = null, note = null;
  return luda_exchanger(p_user);
end $$;

-- Decide / leave. 'approved' keeps the bond held; 'rejected' and 'left' refund it; 'removed' refunds it, or Luda keeps it
-- (p_keep, e.g. to cover a loss caused by the trader).
create or replace function public.luda_exchanger_set(p_user uuid, p_status text, p_by text, p_note text, p_keep boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x exchangers;
begin
  select * into x from exchangers where user_id = p_user for update;
  if not found then raise exception 'not_found'; end if;
  if p_status = 'approved' and x.status <> 'pending' then raise exception 'not_pending'; end if;
  if p_status = 'rejected' and x.status <> 'pending' then raise exception 'not_pending'; end if;
  if p_status in ('removed', 'left') and x.status not in ('approved', 'pending') then raise exception 'not_active'; end if;
  if p_status in ('rejected', 'left', 'removed') and x.escrow_id is not null then
    perform luda_settle(x.escrow_id, case when p_keep then 'luda' else 'payer' end, p_note);
  end if;
  update exchangers set status = p_status, decided_at = now(), decided_by = p_by, note = p_note where user_id = p_user;
  -- back to member limits: keep the newest active ad, pause the others
  if p_status in ('removed', 'left') then
    update p2p_ads set status = 'paused' where user_id = p_user and status = 'active'
      and id not in (select id from p2p_ads where user_id = p_user and status = 'active' order by created_at desc limit 1);
  end if;
  return luda_exchanger(p_user);
end $$;

create or replace function public.luda_admin_exchangers() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'name', p.full_name, 'status', x.status, 'note', x.note, 'appliedAt', x.applied_at,
      'decidedAt', x.decided_at, 'decidedBy', x.decided_by, 'stats', luda_p2p_stats(p.user_id), 'kyc', p.kyc_status,
      'bond', (select jsonb_build_object('amount', e.amount_minor, 'status', e.status) from escrows e where e.id = x.escrow_id),
      'ads', (select count(*) from p2p_ads a where a.user_id = p.user_id and a.status = 'active'))
    order by case x.status when 'pending' then 0 when 'approved' then 1 else 2 end, x.applied_at desc), '[]')
  from exchangers x join profiles p using (user_id) $$;

revoke all on function public.luda_exchanger(uuid) from public, anon, authenticated;
revoke all on function public.luda_exchanger_names() from public, anon, authenticated;
revoke all on function public.luda_exchanger_apply(uuid, bigint) from public, anon, authenticated;
revoke all on function public.luda_exchanger_set(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.luda_admin_exchangers() from public, anon, authenticated;

-- The inbox line for the bond (ledger kinds bond_pay / bond_refund).
create or replace function public.luda_ledger_inbox_bond() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'bond_pay' then perform luda_inbox_add(new.user_id, '🛡️', 'Exchanger bond held: ' || luda_amt(new.amount_minor, new.currency), null, '/exchange?tab=p2p', 'ledger:' || new.id);
  elsif new.kind = 'bond_refund' then perform luda_inbox_add(new.user_id, '↩️', 'Exchanger bond returned: ' || luda_amt(new.amount_minor, new.currency), null, '/exchange?tab=p2p', 'ledger:' || new.id);
  end if;
  return null;
exception when others then return null;
end $$;
drop trigger if exists ledger_inbox_bond on public.ledger;
create trigger ledger_inbox_bond after insert on public.ledger for each row when (new.kind like 'bond%') execute function public.luda_ledger_inbox_bond();
revoke all on function public.luda_ledger_inbox_bond() from public, anon, authenticated;
