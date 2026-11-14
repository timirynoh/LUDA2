-- v1.27.0: one Luda account per person (owner, 2026-11-11).
-- 1) Didit's face search declines a face already verified on another account (workflow setting); the server logs it
--    as 'kyc_duplicate_face' (reference = user id, payload.others = the other user ids) and documents used twice as
--    'kyc_doc_conflict' (payload.hash).
-- 2) Sign-in signals: a hashed phone id (random id kept by the app) and a hashed network, recorded at most once a
--    minute with presence. Only hashes are stored, never the IP or the raw id.
-- 3) Luda HQ duplicate finder: pairs of accounts that look like the same person, with the reasons, and a
--    'Not the same person' dismissal.
-- 4) Terms: section 2 spells out one account per person; version bumped so everyone accepts again.

create table if not exists public.account_signals (
  user_id  uuid not null references public.profiles (user_id) on delete cascade,
  kind     text not null check (kind in ('dev', 'net')),
  hash     text not null check (length(hash) between 8 and 64),
  first_at timestamptz not null default now(),
  last_at  timestamptz not null default now(),
  primary key (user_id, kind, hash)
);
create index if not exists account_signals_hash on public.account_signals (kind, hash);
alter table public.account_signals enable row level security;

create table if not exists public.dup_dismissed (
  a   uuid not null references public.profiles (user_id) on delete cascade,
  b   uuid not null references public.profiles (user_id) on delete cascade,
  by  text not null default '',
  at  timestamptz not null default now(),
  primary key (a, b),
  check (a < b)
);
alter table public.dup_dismissed enable row level security;

create or replace function public.luda_seen2(p_user uuid, p_net text, p_dev text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set last_seen = now() where user_id = p_user and (last_seen is null or last_seen < now() - interval '1 minute');
  if coalesce(p_net, '') <> '' then
    insert into account_signals (user_id, kind, hash) values (p_user, 'net', left(p_net, 64))
      on conflict (user_id, kind, hash) do update set last_at = now();
  end if;
  if coalesce(p_dev, '') <> '' then
    insert into account_signals (user_id, kind, hash) values (p_user, 'dev', left(p_dev, 64))
      on conflict (user_id, kind, hash) do update set last_at = now();
  end if;
end $$;

/* Pairs of accounts that look like one person. Strong reasons: same face (Didit), same ID document, same legal name +
   date of birth, same phone. Weaker: same full name, same home network (a network used by at most 3 accounts in
   30 days: university and dorm Wi-Fi is shared by many people, so it never counts). */
create or replace function public.luda_admin_duplicates() returns jsonb
language sql stable security definer set search_path = public as $$
  with uid as (select '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' as re),
  raw as (
    -- same face: Didit matched this person's face to an account we already verified
    select e.reference::uuid as x, o.v::uuid as y, 'face' as why, max(e.at) as at
      from payment_events e cross join uid
      cross join lateral jsonb_array_elements_text(coalesce(e.payload->'others', '[]'::jsonb)) o(v)
     where e.kind = 'kyc_duplicate_face' and e.reference ~ uid.re and o.v ~ uid.re
     group by 1, 2
    union all
    -- same ID document tried on a second account
    select e.reference::uuid, p.user_id, 'document', max(e.at)
      from payment_events e cross join uid join profiles p on p.kyc_doc_hash = e.payload->>'hash'
     where e.kind = 'kyc_doc_conflict' and e.reference ~ uid.re
     group by 1, 2
    union all
    -- same legal name and date of birth on two verified IDs
    select a.user_id, b.user_id, 'id_name_dob', greatest(a.kyc_at, b.kyc_at)
      from profiles a join profiles b on a.kyc_name = b.kyc_name and a.kyc_dob = b.kyc_dob and a.user_id < b.user_id
     where a.kyc_name is not null and a.kyc_dob is not null
    union all
    -- same phone (the app's own id on that phone)
    select a.user_id, b.user_id, 'device', greatest(a.last_at, b.last_at)
      from account_signals a join account_signals b on a.kind = 'dev' and b.kind = 'dev' and a.hash = b.hash and a.user_id < b.user_id
    union all
    -- same full name (weak)
    select a.user_id, b.user_id, 'name', greatest(a.created_at, b.created_at)
      from profiles a join profiles b
        on lower(regexp_replace(trim(a.full_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(b.full_name), '\s+', ' ', 'g')) and a.user_id < b.user_id
     where length(trim(a.full_name)) >= 5 and trim(a.full_name) like '% %'
    union all
    -- same small (home) network in the last 30 days (weak)
    select a.user_id, b.user_id, 'network', greatest(a.last_at, b.last_at)
      from account_signals a join account_signals b on a.kind = 'net' and b.kind = 'net' and a.hash = b.hash and a.user_id < b.user_id
     where a.last_at > now() - interval '30 days' and b.last_at > now() - interval '30 days'
       and (select count(distinct s.user_id) from account_signals s where s.kind = 'net' and s.hash = a.hash and s.last_at > now() - interval '30 days') <= 3
  ),
  pairs as (
    select least(x, y) as a, greatest(x, y) as b, array_agg(distinct why) as why, max(at) as at
      from raw where x <> y group by 1, 2
  ),
  scored as (
    select p.*, (select count(*) from unnest(p.why) w where w in ('face', 'document', 'id_name_dob', 'device'))::int as strong
      from pairs p
     where not exists (select 1 from dup_dismissed d where d.a = p.a and d.b = p.b)
       -- a pair with only weak reasons needs at least two of them
       and (p.why && array['face', 'document', 'id_name_dob', 'device'] or cardinality(p.why) >= 2)
  ),
  who as (
    select user_id, jsonb_build_object('userId', user_id, 'username', username, 'fullName', full_name, 'kyc', kyc_status,
             'frozen', frozen, 'createdAt', created_at, 'lastSeen', last_seen) as j
      from profiles
  )
  select jsonb_build_object('pairs', coalesce(jsonb_agg(jsonb_build_object('a', wa.j, 'b', wb.j, 'why', s.why, 'strong', s.strong, 'at', s.at)
           order by s.strong desc, cardinality(s.why) desc, s.at desc nulls last), '[]'::jsonb))
    from (select * from scored order by strong desc, cardinality(why) desc, at desc nulls last limit 100) s
    join who wa on wa.user_id = s.a join who wb on wb.user_id = s.b
$$;

create or replace function public.luda_dup_dismiss(p_a uuid, p_b uuid, p_by text) returns void
language sql security definer set search_path = public as $$
  insert into dup_dismissed (a, b, by) values (least(p_a, p_b), greatest(p_a, p_b), left(coalesce(p_by, ''), 40))
    on conflict (a, b) do nothing
$$;

/* Terms: one account per person, spelled out; everyone accepts the new version. */
update public.guides g
   set steps = (select jsonb_agg(case when s->>'title' like '2.%' then jsonb_build_object('title', '2. Your account', 'body',
                  'You must be at least 18 and give true details. One person may have only one Luda account. We check every verified ID document and face against all other accounts, so a second account can''t be verified. Extra accounts may be frozen or closed, and rewards, prizes and referral bonuses gained through them will be removed. Keep your password and PIN private; you are responsible for activity on your account. Tell us at once if you think someone else has used it. We may ask you to verify your identity (ID document and selfie) before you can withdraw, trade P2P, sell or take paid jobs.')
                  else s end order by n) from jsonb_array_elements(g.steps) with ordinality t(s, n)),
       version = version + 1
 where slug = 'terms' and kind = 'terms' and steps::text not like '%only one Luda account%';

do $$
declare f text;
begin
  foreach f in array array['luda_seen2(uuid,text,text)', 'luda_admin_duplicates()', 'luda_dup_dismiss(uuid,uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
