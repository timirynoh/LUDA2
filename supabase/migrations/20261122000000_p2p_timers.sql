-- P2P timers (v1.11.0, owner: 'Bybit standard: a countdown on every stage, and a warning if someone doesn't respond').
-- The Luda team can ask one or both people for something (a bank statement, a receipt) with a deadline.
-- A message from that person counts as their reply; when time runs out, the order chat gets a warning, once.
alter table public.p2p_orders add column if not exists ask_who text check (ask_who in ('payer', 'sender', 'both'));
alter table public.p2p_orders add column if not exists ask_at timestamptz;
alter table public.p2p_orders add column if not exists ask_due timestamptz;
alter table public.p2p_orders add column if not exists ask_payer_at timestamptz;
alter table public.p2p_orders add column if not exists ask_sender_at timestamptz;
alter table public.p2p_orders add column if not exists ask_warned boolean not null default false;

create or replace function public.luda_p2p_staff_ask(p_order uuid, p_staff text, p_body text, p_who text, p_minutes int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype; who text;
begin
  if p_who not in ('payer', 'sender', 'both') or p_minutes < 5 or p_minutes > 2880 then raise exception 'not_available'; end if;
  select * into o from p2p_orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if o.status in ('done', 'cancelled') then raise exception 'not_available'; end if;
  insert into p2p_messages (order_id, user_id, body, kind, staff_name) values (p_order, null, p_body, 'staff', p_staff);
  update p2p_orders set ask_who = p_who, ask_at = now(), ask_due = now() + make_interval(mins => p_minutes),
    ask_payer_at = null, ask_sender_at = null, ask_warned = false, updated_at = now() where id = o.id;
  who := case p_who when 'both' then '@' || luda_uname(o.ngn_payer) || ' and @' || luda_uname(o.try_sender)
                    when 'payer' then '@' || luda_uname(o.ngn_payer) else '@' || luda_uname(o.try_sender) end;
  perform luda_p2p_sys(o.id, '⏰ The Luda team needs a reply from ' || who || ' within ' ||
    case when p_minutes % 60 = 0 then (p_minutes / 60)::text || ' hour' || case when p_minutes = 60 then '' else 's' end else p_minutes::text || ' minutes' end ||
    '. No reply in time and the team may decide without your side.');
  return jsonb_build_object('ok', true);
end $$;

-- A message (or photo) from a person who was asked counts as their reply.
create or replace function public.luda_p2p_msg(p_order uuid, p_user uuid, p_body text, p_files text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_user is not null and not exists (select 1 from p2p_orders where id = p_order and (maker = p_user or taker = p_user)) then raise exception 'not_member'; end if;
  insert into p2p_messages (order_id, user_id, body, files) values (p_order, p_user, coalesce(p_body, ''), coalesce(p_files, '{}'));
  update p2p_orders set
    ask_payer_at = case when ask_at is not null and ask_payer_at is null and ngn_payer = p_user and ask_who in ('payer', 'both') then now() else ask_payer_at end,
    ask_sender_at = case when ask_at is not null and ask_sender_at is null and try_sender = p_user and ask_who in ('sender', 'both') then now() else ask_sender_at end
   where id = p_order and ask_at is not null;
  return jsonb_build_object('ok', true);
end $$;

-- Same as before, plus: a warning in the chat (once) when someone the team asked didn't reply in time.
create or replace function public.luda_p2p_expire() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; o p2p_orders%rowtype; late text;
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
  for o in select * from p2p_orders where status = 'appeal' and ask_due < now() and not ask_warned for update skip locked loop
    late := concat_ws(' and ',
      case when o.ask_who in ('payer', 'both') and o.ask_payer_at is null then '@' || luda_uname(o.ngn_payer) end,
      case when o.ask_who in ('sender', 'both') and o.ask_sender_at is null then '@' || luda_uname(o.try_sender) end);
    update p2p_orders set ask_warned = true where id = o.id;
    if late <> '' then perform luda_p2p_sys(o.id, '⚠️ ' || late || ' didn''t reply in time. The Luda team may now decide with what it has.'); end if;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.luda_p2p_staff_ask(uuid, text, text, text, int) from public, anon, authenticated;
revoke all on function public.luda_p2p_msg(uuid, uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.luda_p2p_expire() from public, anon, authenticated;

-- To do: 'The Luda team needs your reply' with the deadline.
create or replace function public.luda_todo(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'p2p', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'stage', o.appeal_stage, 'payer', o.ngn_payer = p_user,
              'amount', o.amount_try, 'asset', o.asset, 'ngn', o.amount_ngn, 'payBy', o.pay_by, 'sentAt', o.sent_at, 'updatedAt', o.updated_at, 'askDue', o.ask_due,
              'askMe', o.ask_at is not null and ((o.ngn_payer = p_user and o.ask_who in ('payer', 'both') and o.ask_payer_at is null) or (o.try_sender = p_user and o.ask_who in ('sender', 'both') and o.ask_sender_at is null)),
              'other', (select username from profiles where user_id = case when o.ngn_payer = p_user then o.try_sender else o.ngn_payer end)) order by o.updated_at desc), '[]'::jsonb)
            from p2p_orders o where (o.ngn_payer = p_user or o.try_sender = p_user) and o.status in ('waiting', 'sent', 'appeal')),
    'sold', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'price', l.price_minor,
              'buyer', (select username from profiles where user_id = l.buyer))), '[]'::jsonb)
            from listings l where l.seller = p_user and l.status = 'reserved'),
    'bought', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'price', l.price_minor,
              'seller', (select username from profiles where user_id = l.seller))), '[]'::jsonb)
            from listings l where l.buyer = p_user and l.status = 'reserved'),
    'flashPosted', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'reward', j.reward_minor,
              'helper', (select username from profiles where user_id = j.helper))), '[]'::jsonb)
            from flash_jobs j where j.poster = p_user and j.status = 'taken'),
    'flashHelping', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'reward', j.reward_minor,
              'poster', (select username from profiles where user_id = j.poster))), '[]'::jsonb)
            from flash_jobs j where j.helper = p_user and j.status = 'taken'),
    'cases', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'subject', c.subject)), '[]'::jsonb)
            from cases c where c.user_id = p_user and c.status = 'waiting_user'),
    'bills', (select count(*) from bills b where b.user_id = p_user and b.status = 'pending'),
    'withdrawals', (select count(*) from withdrawals w where w.user_id = p_user and w.status = 'processing'),
    'fees', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'title', f.title, 'due', f.due_date, 'amount', f.amount_minor, 'currency', f.currency) order by f.due_date), '[]'::jsonb)
            from uni_fee_plans f where f.user_id = p_user and f.paid_at is null and f.due_date <= current_date + 7))
$$;
revoke all on function public.luda_todo(uuid) from public, anon, authenticated;
