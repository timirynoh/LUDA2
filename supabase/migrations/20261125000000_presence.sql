-- v1.14.0 (owner, 2026-11-04): show who is online, so buyers pick traders who will answer in time.
-- 'last_seen' is set by the server from real activity (any signed-in request, at most once a minute).
alter table public.profiles add column if not exists last_seen timestamptz;

create or replace function public.luda_seen(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen = now() where user_id = p_user and (last_seen is null or last_seen < now() - interval '1 minute')
$$;
create or replace function public.luda_presence(p_usernames text[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(username, last_seen), '{}'::jsonb) from profiles where username = any (p_usernames)
$$;

create or replace function public.luda_p2p_view(o p2p_orders, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select (to_jsonb(o) - 'escrow_id' - 'maker' - 'taker' - 'ngn_payer' - 'try_sender' - 'receipt' - 'appeal_by') || jsonb_build_object(
    'role', case when o.ngn_payer = p_viewer then 'payer' when o.try_sender = p_viewer then 'sender' else 'staff' end,
    'iAmMaker', o.maker = p_viewer, 'iAppealed', o.appeal_by = p_viewer,
    'appealBy', case when o.appeal_by = o.ngn_payer then 'payer' when o.appeal_by = o.try_sender then 'sender' when o.appeal_reason is not null then 'auto' end,
    'payer', (select jsonb_build_object('username', p.username, 'name', p.full_name, 'verified', p.kyc_status = 'verified', 'lastSeen', p.last_seen) from profiles p where p.user_id = o.ngn_payer),
    'sender', (select jsonb_build_object('username', p.username, 'name', p.full_name, 'verified', p.kyc_status = 'verified', 'lastSeen', p.last_seen) from profiles p where p.user_id = o.try_sender),
    'receiptKeys', to_jsonb(o.receipt))
$$;

create or replace function public.luda_trader(p_username text, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('username', p.username, 'name', split_part(p.full_name, ' ', 1), 'verified', p.kyc_status = 'verified',
      'country', p.country, 'since', p.created_at, 'stats', luda_p2p_stats(p.user_id), 'reviews', luda_p2p_reviews(p.username),
      'ads', (select count(*) from p2p_ads a where a.user_id = p.user_id and a.status = 'active'),
      'blocked', exists (select 1 from p2p_blocks b where b.user_id = p_viewer and b.blocked = p.user_id),
      'me', p.user_id = p_viewer, 'lastSeen', p.last_seen)
    from profiles p where p.username = lower(p_username)
$$;

revoke all on function public.luda_seen(uuid) from public, anon, authenticated;
revoke all on function public.luda_presence(text[]) from public, anon, authenticated;
revoke all on function public.luda_p2p_view(p2p_orders, uuid) from public, anon, authenticated;
revoke all on function public.luda_trader(text, uuid) from public, anon, authenticated;
