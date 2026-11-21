-- Rewards on the server (owner 2026-11-04: "make what is left real, nothing on the phone"): XP, points, daily
-- check-in streak, daily spin, monthly challenges, referral and ambassador bonuses, points redemption.
-- Every reward is one row in reward_events, unique per (user, kind, ref) so it can never be paid twice.
-- Cash prizes go into the real Lira wallet through luda_post (ledger kind 'reward'), inside a monthly budget:
-- once the month's budget is used, cash prizes turn into points of the same value (100 points = ₺1).

alter table public.profiles add column if not exists invited_by uuid references public.profiles (user_id);
alter table public.profiles add column if not exists streak int not null default 0;
alter table public.profiles add column if not exists last_checkin date;

create table if not exists public.reward_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (user_id),
  kind       text not null,  -- spin, checkin, challenge, referral, referral_welcome, ambassador, redeem
  ref        text not null,
  xp         int not null default 0,
  points     int not null default 0,  -- negative for redemptions
  cash_minor bigint not null default 0 check (cash_minor >= 0), -- kuruş paid into the Lira wallet
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists reward_events_user on public.reward_events (user_id, created_at desc);
create index if not exists reward_events_month on public.reward_events (created_at) where cash_minor > 0;
alter table public.reward_events enable row level security;

-- Give a reward once. p_cap = this month's cash budget for all users (kuruş).
create or replace function public.luda_reward(p_user uuid, p_kind text, p_ref text, p_xp int, p_points int, p_cash bigint, p_note text, p_cap bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid bigint; spent bigint; cash bigint := greatest(coalesce(p_cash, 0), 0); pts int := coalesce(p_points, 0); swapped boolean := false;
begin
  if exists (select 1 from reward_events where user_id = p_user and kind = p_kind and ref = p_ref) then
    return jsonb_build_object('ok', false, 'already', true);
  end if;
  if cash > 0 then
    perform pg_advisory_xact_lock(4242001); -- one budget check at a time
    select coalesce(sum(cash_minor), 0) into spent from reward_events where created_at >= date_trunc('month', now()) and cash_minor > 0;
    if spent + cash > p_cap then pts := pts + (cash / 100) * 100; cash := 0; swapped := true; end if;
  end if;
  insert into reward_events (user_id, kind, ref, xp, points, cash_minor, note) values (p_user, p_kind, p_ref, coalesce(p_xp, 0), pts, cash, p_note)
  on conflict (user_id, kind, ref) do nothing returning id into rid;
  if rid is null then return jsonb_build_object('ok', false, 'already', true); end if;
  if cash > 0 then
    perform luda_post(jsonb_build_array(jsonb_build_object('user_id', p_user, 'currency', 'TRY', 'amount_minor', cash, 'kind', 'reward', 'ref', 'rw' || rid,
      'meta', jsonb_build_object('reward', p_kind, 'note', p_note))));
  end if;
  return jsonb_build_object('ok', true, 'id', rid, 'xp', coalesce(p_xp, 0), 'points', pts, 'cash', cash, 'swapped', swapped);
end $$;

-- Points → wallet credit. Locks the user's profile row so two redemptions can't spend the same points.
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
  perform luda_post(jsonb_build_array(jsonb_build_object('user_id', p_user, 'currency', 'TRY', 'amount_minor', p_cash, 'kind', 'reward', 'ref', 'rw' || rid,
    'meta', jsonb_build_object('reward', 'redeem', 'points', p_pts))));
  return jsonb_build_object('ok', true, 'points', bal - p_pts, 'cash', p_cash);
end $$;

-- Daily check-in (Cyprus date passed in): keeps the streak. Returns the new streak, or already=true.
create or replace function public.luda_checkin(p_user uuid, p_day date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype; s int;
begin
  select * into p from profiles where user_id = p_user for update;
  if p.last_checkin = p_day then return jsonb_build_object('already', true, 'streak', p.streak); end if;
  s := case when p.last_checkin = p_day - 1 then p.streak + 1 else 1 end;
  update profiles set streak = s, last_checkin = p_day where user_id = p_user;
  return jsonb_build_object('already', false, 'streak', s);
end $$;

-- Everything the server knows the user really did (no numbers from the phone).
create or replace function public.luda_activity(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'verified', (select kyc_status = 'verified' from profiles where user_id = p_user),
    'phone', (select phone_verified_at is not null from profiles where user_id = p_user),
    'deposits', (select count(*) from payments where user_id = p_user and purpose = 'deposit' and status = 'paid'),
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

-- People this user invited (no private data: username, first name, how far they got).
create or replace function public.luda_invitees(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'name', split_part(p.full_name, ' ', 1), 'country', p.country, 'joined', p.created_at,
      'verified', p.kyc_status = 'verified', 'toppedUp', exists (select 1 from payments y where y.user_id = p.user_id and y.purpose = 'deposit' and y.status = 'paid'),
      'paid', exists (select 1 from reward_events r where r.user_id = p_user and r.kind = 'referral' and r.ref = p.user_id::text)) order by p.created_at desc), '[]'::jsonb)
    from profiles p where p.invited_by = p_user
$$;

create or replace function public.luda_set_inviter(p_user uuid, p_inviter text, p_days int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me profiles%rowtype; inv uuid;
begin
  select * into me from profiles where user_id = p_user for update;
  if me.invited_by is not null then raise exception 'already_invited'; end if;
  if me.created_at < now() - make_interval(days => p_days) then raise exception 'invite_too_late'; end if;
  select user_id into inv from profiles where username = lower(p_inviter);
  if inv is null or inv = p_user then raise exception 'not_found'; end if;
  update profiles set invited_by = inv where user_id = p_user;
  return jsonb_build_object('ok', true, 'inviter', lower(p_inviter));
end $$;

-- Country savings cup: Lira saved into pots this month, by the savers' country (real numbers).
create or replace function public.luda_country_cup() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('country', country, 'saved', saved, 'savers', savers) order by saved desc), '[]'::jsonb) from (
    select coalesce(p.country, '??') country, sum(-l.amount_minor) saved, count(distinct l.user_id) savers
      from ledger l join profiles p using (user_id)
     where l.kind = 'pot_in' and l.currency = 'TRY' and l.at >= date_trunc('month', now()) group by 1) s
$$;

-- Referral payouts that are due: invitee verified + first top-up done, not yet paid. (The api pays them.)
create or replace function public.luda_referrals_due(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('inviter', p.invited_by, 'invitee', p.user_id, 'name', p.username)), '[]'::jsonb)
    from profiles p
   where p.invited_by is not null and (p.user_id = p_user or p.invited_by = p_user) and p.kyc_status = 'verified'
     and exists (select 1 from payments y where y.user_id = p.user_id and y.purpose = 'deposit' and y.status = 'paid')
     and not exists (select 1 from reward_events r where r.user_id = p.invited_by and r.kind = 'referral' and r.ref = p.user_id::text)
$$;

create or replace function public.luda_referrals_month(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from reward_events where user_id = p_user and kind = 'referral' and created_at >= date_trunc('month', now())
$$;

do $$ declare f text; begin
  foreach f in array array['luda_reward(uuid,text,text,int,int,bigint,text,bigint)', 'luda_redeem(uuid,int,bigint,text,bigint)', 'luda_checkin(uuid,date)',
    'luda_activity(uuid)', 'luda_invitees(uuid)', 'luda_set_inviter(uuid,text,int)', 'luda_country_cup()', 'luda_referrals_due(uuid)', 'luda_referrals_month(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
