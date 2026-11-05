-- v1.20.0: in-app notifications (the 🔔 inbox) live on the server. Owner: 'any notification: if someone sends you
-- money, if you send someone money… it doesn't get updated'. Every money movement creates an inbox item automatically
-- (trigger on the ledger, so nothing can be missed), and the server adds other events (support replies, P2P steps,
-- ID results). The inbox follows the account to any phone.

create table if not exists public.inbox (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles (user_id) on delete cascade,
  emoji      text not null default '🔔',
  title      text not null,
  body       text,
  url        text,
  tag        text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists inbox_user on public.inbox (user_id, created_at desc);
create unique index if not exists inbox_tag on public.inbox (user_id, tag) where tag is not null;
alter table public.inbox enable row level security;
revoke all on public.inbox from anon, authenticated;

create or replace function public.luda_amt(p_minor bigint, p_cur text) returns text
language sql immutable as $$
  select case p_cur when 'TRY' then '₺' when 'NGN' then '₦' when 'USD' then '$' when 'EUR' then '€' when 'GBP' then '£' else p_cur || ' ' end
    || case when abs(p_minor) % 100 = 0 then to_char(abs(p_minor) / 100, 'FM999,999,999,990') else to_char(abs(p_minor) / 100.0, 'FM999,999,999,990.00') end
$$;

create or replace function public.luda_inbox_add(p_user uuid, p_emoji text, p_title text, p_body text, p_url text, p_tag text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into inbox (user_id, emoji, title, body, url, tag) values (p_user, coalesce(p_emoji, '🔔'), left(p_title, 160), left(p_body, 300), left(p_url, 200), p_tag)
  on conflict do nothing;
  -- keep the latest 300 per person
  if random() < 0.05 then
    delete from inbox where user_id = p_user and id < (select min(id) from (select id from inbox where user_id = p_user order by id desc limit 300) x);
  end if;
end $$;

-- Every ledger row → one clear inbox line (conversions only on the side you receive; savings moves and fees are skipped).
create or replace function public.luda_ledger_inbox() returns trigger
language plpgsql security definer set search_path = public as $$
declare a text := luda_amt(new.amount_minor, new.currency); m jsonb := coalesce(new.meta, '{}'::jsonb);
  e text; t text; u text := '/wallet';
begin
  case new.kind
    when 'deposit' then e := '💰'; t := 'Top-up received: ' || a;
    when 'receive' then e := '💸'; t := 'You received ' || a || coalesce(' from @' || (m->>'from'), '');
    when 'send' then e := '📤'; t := 'You sent ' || a || coalesce(' to @' || (m->>'to'), '');
    when 'convert' then if new.amount_minor > 0 then e := '🔁'; t := 'Converted: you got ' || a; end if;
    when 'ticket' then e := '🎫'; t := 'Bus ticket paid: ' || a; u := '/transport';
    when 'ticket_refund' then e := '↩️'; t := 'Ticket refunded: ' || a; u := '/transport';
    when 'withdraw' then e := '🏦'; t := 'Withdrawal started: ' || a;
    when 'withdraw_reversal' then if new.amount_minor > 0 then e := '↩️'; t := 'Withdrawal returned to your wallet: ' || a; end if;
    when 'reward' then e := '🎁'; t := 'Reward added: ' || a; u := '/rewards';
    when 'adjustment' then e := '🛠️'; t := case when new.amount_minor > 0 then 'The Luda team added ' else 'The Luda team removed ' end || a;
    when 'bill_pay' then e := '🧾'; t := 'Bill payment sent to the Luda team: ' || a; u := '/bills';
    when 'bill_refund' then e := '↩️'; t := 'Bill refunded: ' || a; u := '/bills';
    when 'market_pay' then e := '🛍️'; t := 'Market purchase, held safely: ' || a; u := '/market';
    when 'market_refund' then e := '↩️'; t := 'Market refund: ' || a; u := '/market';
    when 'market_earn' then e := '💰'; t := 'Market sale paid to you: ' || a; u := '/market';
    when 'flash_pay' then e := '⚡'; t := 'Flash reward held: ' || a; u := '/flash';
    when 'flash_refund' then e := '↩️'; t := 'Flash reward returned: ' || a; u := '/flash';
    when 'flash_earn' then e := '💪🏿'; t := 'Flash job paid to you: ' || a; u := '/flash';
    when 'p2p_pay' then e := '🤝'; t := 'P2P: Naira held safely: ' || a; u := '/exchange?tab=p2p';
    when 'p2p_refund' then e := '↩️'; t := 'P2P refund: ' || a; u := '/exchange?tab=p2p';
    when 'p2p_earn' then e := '🤝'; t := 'P2P: you received ' || a; u := '/exchange?tab=p2p';
    else null;
  end case;
  if t is not null then
    begin
      perform luda_inbox_add(new.user_id, e, t, null, u, 'ledger:' || new.id);
    exception when others then null; -- a notification must never stop a payment
    end;
  end if;
  return null;
end $$;
drop trigger if exists ledger_inbox on public.ledger;
create trigger ledger_inbox after insert on public.ledger for each row execute function public.luda_ledger_inbox();

create or replace function public.luda_inbox(p_user uuid, p_limit int) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'emoji', emoji, 'title', title, 'body', body, 'url', url, 'read', read_at is not null, 'at', created_at) order by id desc)
      from (select * from inbox where user_id = p_user order by id desc limit p_limit) x), '[]'::jsonb),
    'unread', (select count(*) from inbox where user_id = p_user and read_at is null))
$$;

create or replace function public.luda_inbox_unread(p_user uuid) returns int
language sql stable security definer set search_path = public as $$ select count(*)::int from inbox where user_id = p_user and read_at is null $$;

create or replace function public.luda_inbox_read(p_user uuid, p_ids jsonb) returns void
language sql security definer set search_path = public as $$
  update inbox set read_at = now() where user_id = p_user and read_at is null
    and (p_ids is null or id in (select (jsonb_array_elements_text(p_ids->'items'))::bigint))
$$;

revoke all on function public.luda_inbox_add(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.luda_ledger_inbox() from public, anon, authenticated;
revoke all on function public.luda_inbox(uuid, int) from public, anon, authenticated;
revoke all on function public.luda_inbox_unread(uuid) from public, anon, authenticated;
revoke all on function public.luda_inbox_read(uuid, jsonb) from public, anon, authenticated;

-- Who is on each side of a trade (so the server can tell the other person).
create or replace function public.luda_parties(p_kind text, p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case p_kind
    when 'p2p' then (select jsonb_build_object('payer', o.ngn_payer, 'sender', o.try_sender, 'amount', o.amount_try, 'asset', coalesce(a.asset, 'TRY'),
        'payerName', (select username from profiles where user_id = o.ngn_payer), 'senderName', (select username from profiles where user_id = o.try_sender))
      from p2p_orders o left join p2p_ads a on a.id = o.ad_id where o.id = p_id)
    when 'market' then (select jsonb_build_object('seller', seller, 'buyer', buyer, 'title', title, 'buyerName', (select username from profiles where user_id = buyer)) from listings where id = p_id)
    when 'flash' then (select jsonb_build_object('poster', poster, 'helper', helper, 'title', title, 'helperName', (select username from profiles where user_id = helper)) from flash_jobs where id = p_id)
  end
$$;
revoke all on function public.luda_parties(text, uuid) from public, anon, authenticated;
