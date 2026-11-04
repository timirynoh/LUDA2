-- "To do" on Home (v1.10.0, owner: 'always show what is pending and waiting for the user').
-- Worked out on the server from real state, so the list can't be faked or go stale on the phone.
create or replace function public.luda_todo(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'p2p', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'stage', o.appeal_stage, 'payer', o.ngn_payer = p_user,
              'amount', o.amount_try, 'asset', o.asset, 'ngn', o.amount_ngn, 'payBy', o.pay_by, 'sentAt', o.sent_at, 'updatedAt', o.updated_at,
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
