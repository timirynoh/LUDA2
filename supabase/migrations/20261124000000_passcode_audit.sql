-- v1.13.0 (owner, 2026-11-04): 6-digit sign-in code (separate from the 4-digit payment PIN), sign-in history,
-- live search and trader profiles — all on the server.

alter table public.profiles add column if not exists passcode_hash text;
alter table public.profiles add column if not exists passcode_salt text;
alter table public.profiles add column if not exists passcode_fails int not null default 0;
alter table public.profiles add column if not exists passcode_locked_until timestamptz;

create table if not exists public.sign_ins (
  id       bigserial primary key,
  user_id  uuid not null references public.profiles (user_id) on delete cascade,
  how      text not null,             -- password | google | code | fingerprint | new account
  device   text not null default '',
  at       timestamptz not null default now()
);
create index if not exists sign_ins_user on public.sign_ins (user_id, at desc);
alter table public.sign_ins enable row level security;

create or replace function public.luda_sign_in_log(p_user uuid, p_how text, p_device text) returns void
language sql security definer set search_path = public as $$
  insert into sign_ins (user_id, how, device) values (p_user, left(p_how, 20), left(coalesce(p_device, ''), 80))
$$;
create or replace function public.luda_sign_ins(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('how', how, 'device', device, 'at', at) order by at desc), '[]'::jsonb)
    from (select * from sign_ins where user_id = p_user order by at desc limit 15) s
$$;

-- Search across what is really live: posts, Flash jobs, Market items, groups, P2P traders.
create or replace function public.luda_search(p_q text) returns jsonb
language sql stable security definer set search_path = public as $$
  with q as (select '%' || replace(replace(lower(p_q), '%', ''), '_', '') || '%' as pat)
  select jsonb_build_object(
    'posts', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'kind', b.kind, 'title', b.title) order by b.created_at desc), '[]'::jsonb)
              from (select * from board_posts, q where status = 'live' and (expires_at is null or expires_at > now()) and lower(title) like q.pat order by created_at desc limit 12) b),
    'flash', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'reward', j.reward_minor)), '[]'::jsonb)
              from (select * from flash_jobs, q where status = 'open' and lower(title) like q.pat order by created_at desc limit 8) j),
    'market', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'price', l.price_minor)), '[]'::jsonb)
              from (select * from listings, q where status = 'active' and lower(title) like q.pat order by created_at desc limit 8) l),
    'groups', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'emoji', g.emoji)), '[]'::jsonb)
              from (select * from chat_groups, q where status = 'live' and lower(name) like q.pat order by created_at desc limit 8) g),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('username', p.username, 'name', p.full_name, 'verified', p.kyc_status = 'verified')), '[]'::jsonb)
              from (select p.* from profiles p, q where exists (select 1 from p2p_ads a where a.user_id = p.user_id and a.status = 'active')
                     and (lower(p.username) like q.pat or lower(p.full_name) like q.pat) limit 8) p))
$$;

-- Public trader profile (/u/:name): only what's safe to show, all from real orders and reviews.
create or replace function public.luda_trader(p_username text, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('username', p.username, 'name', split_part(p.full_name, ' ', 1), 'verified', p.kyc_status = 'verified',
      'country', p.country, 'since', p.created_at, 'stats', luda_p2p_stats(p.user_id), 'reviews', luda_p2p_reviews(p.username),
      'ads', (select count(*) from p2p_ads a where a.user_id = p.user_id and a.status = 'active'),
      'blocked', exists (select 1 from p2p_blocks b where b.user_id = p_viewer and b.blocked = p.user_id),
      'me', p.user_id = p_viewer)
    from profiles p where p.username = lower(p_username)
$$;

do $$
declare f text;
begin
  foreach f in array array['luda_sign_in_log(uuid,text,text)', 'luda_sign_ins(uuid)', 'luda_search(text)', 'luda_trader(text,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
