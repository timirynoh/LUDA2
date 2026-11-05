-- v1.18.0: ratings. Support cases and bills paid by Luda get 1–5 stars + tags + comment; Market and Flash get
-- 👍/👎 + a short review of the other person (shown on their profile, like P2P). A closed case can be reopened
-- within 7 days (twice at most). Luda HQ sees averages, low ratings and which team member handled each one.

alter table public.cases add column if not exists handled_by text;
alter table public.cases add column if not exists closed_at timestamptz;
alter table public.cases add column if not exists reopens int not null default 0;
alter table public.bills add column if not exists handled_by text;

-- closed_at follows the status (set when the team closes it, cleared when it's open again)
create or replace function public.luda_case_closed_at() returns trigger language plpgsql as $$
begin
  if new.status in ('resolved', 'rejected') and (old.status is distinct from new.status or old.closed_at is null) then new.closed_at := now();
  elsif new.status in ('open', 'waiting_user') then new.closed_at := null;
  end if;
  return new;
end $$;
drop trigger if exists cases_closed_at on public.cases;
create trigger cases_closed_at before update on public.cases for each row execute function public.luda_case_closed_at();
update public.cases set closed_at = updated_at where status in ('resolved', 'rejected') and closed_at is null;

create table if not exists public.ratings (
  id         bigserial primary key,
  kind       text not null check (kind in ('case', 'bill', 'market', 'flash')),
  ref        uuid not null,
  author     uuid not null references public.profiles (user_id) on delete cascade,
  target     uuid references public.profiles (user_id) on delete set null, -- the person rated (Market/Flash)
  staff      text,                                                         -- team member who handled it (case/bill)
  stars      int check (stars between 1 and 5),                             -- case / bill
  good       boolean,                                                       -- Market / Flash
  tags       text[] not null default '{}',
  body       text not null default '' check (length(body) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, ref, author)
);
create index if not exists ratings_target on public.ratings (target, created_at desc);
create index if not exists ratings_kind on public.ratings (kind, created_at desc);
alter table public.ratings enable row level security;
revoke all on public.ratings from anon, authenticated;

create or replace function public.luda_mark_handled(p_kind text, p_id uuid, p_staff text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'case' then update cases set handled_by = p_staff where id = p_id;
  elsif p_kind = 'bill' then update bills set handled_by = p_staff where id = p_id;
  end if;
end $$;

-- Saves (or updates) a rating after checking the person really took part and the thing is finished.
create or replace function public.luda_rate(p_user uuid, p_kind text, p_ref uuid, p_stars int, p_good boolean, p_tags text[], p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_target uuid; v_staff text; c cases; b bills; l listings; j flash_jobs;
begin
  if p_kind = 'case' then
    select * into c from cases where id = p_ref and user_id = p_user;
    if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    if c.status not in ('resolved', 'rejected') then return jsonb_build_object('ok', false, 'reason', 'not_finished'); end if;
    v_staff := c.handled_by;
  elsif p_kind = 'bill' then
    select * into b from bills where id = p_ref and user_id = p_user;
    if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    if b.status not in ('paid', 'refunded') then return jsonb_build_object('ok', false, 'reason', 'not_finished'); end if;
    v_staff := b.handled_by;
  elsif p_kind = 'market' then
    select * into l from listings where id = p_ref and p_user in (seller, buyer);
    if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    if l.status <> 'sold' or l.buyer is null then return jsonb_build_object('ok', false, 'reason', 'not_finished'); end if;
    v_target := case when p_user = l.seller then l.buyer else l.seller end;
  elsif p_kind = 'flash' then
    select * into j from flash_jobs where id = p_ref and p_user in (poster, helper);
    if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
    if j.status <> 'done' or j.helper is null then return jsonb_build_object('ok', false, 'reason', 'not_finished'); end if;
    v_target := case when p_user = j.poster then j.helper else j.poster end;
  else return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into ratings (kind, ref, author, target, staff, stars, good, tags, body)
  values (p_kind, p_ref, p_user, v_target, v_staff, p_stars, p_good, coalesce(p_tags, '{}'), coalesce(p_body, ''))
  on conflict (kind, ref, author) do update set stars = excluded.stars, good = excluded.good, tags = excluded.tags,
    body = excluded.body, staff = excluded.staff, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- Reopen a closed case (owner's request): within 7 days of closing, at most twice.
create or replace function public.luda_case_reopen(p_user uuid, p_case uuid, p_reason text, p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c cases;
begin
  select * into c from cases where id = p_case and user_id = p_user for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if c.status not in ('resolved', 'rejected') then return jsonb_build_object('ok', false, 'reason', 'open'); end if;
  if c.reopens >= 2 then return jsonb_build_object('ok', false, 'reason', 'too_many'); end if;
  if coalesce(c.closed_at, c.updated_at) < now() - interval '7 days' then return jsonb_build_object('ok', false, 'reason', 'too_late'); end if;
  update cases set status = 'open', reopens = reopens + 1, updated_at = now() where id = p_case;
  insert into case_messages (case_id, author, author_name, body, files) values (p_case, 'user', p_name, '🔁 Reopened: ' || p_reason, '{}');
  return jsonb_build_object('ok', true);
end $$;

-- The person's own ratings (to show "You rated ★4 · Edit").
create or replace function public.luda_ratings_mine(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'ref', ref, 'stars', stars, 'good', good, 'tags', tags, 'body', body, 'at', updated_at) order by updated_at desc), '[]'::jsonb)
  from (select * from ratings where author = p_user order by updated_at desc limit 300) r
$$;

-- What is finished and not yet rated (for the To do list): last 7 days for cases/bills, 14 for Market/Flash.
create or replace function public.luda_rate_pending(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cases', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'subject', c.subject)), '[]'::jsonb) from cases c
      where c.user_id = p_user and c.status in ('resolved', 'rejected') and c.closed_at > now() - interval '7 days'
        and not exists (select 1 from ratings r where r.kind = 'case' and r.ref = c.id and r.author = p_user)),
    'bills', (select coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'provider', b.provider)), '[]'::jsonb) from bills b
      where b.user_id = p_user and b.status in ('paid', 'refunded') and b.updated_at > now() - interval '7 days'
        and not exists (select 1 from ratings r where r.kind = 'bill' and r.ref = b.id and r.author = p_user)),
    'market', (select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title, 'other', (select username from profiles where user_id = case when l.seller = p_user then l.buyer else l.seller end))), '[]'::jsonb) from listings l
      where p_user in (l.seller, l.buyer) and l.status = 'sold' and l.buyer is not null and l.updated_at > now() - interval '14 days'
        and not exists (select 1 from ratings r where r.kind = 'market' and r.ref = l.id and r.author = p_user)),
    'flash', (select coalesce(jsonb_agg(jsonb_build_object('id', j.id, 'title', j.title, 'other', (select username from profiles where user_id = case when j.poster = p_user then j.helper else j.poster end))), '[]'::jsonb) from flash_jobs j
      where p_user in (j.poster, j.helper) and j.status = 'done' and j.helper is not null and j.updated_at > now() - interval '14 days'
        and not exists (select 1 from ratings r where r.kind = 'flash' and r.ref = j.id and r.author = p_user)))
$$;

-- Market & Flash reviews of a person (their public profile).
create or replace function public.luda_community_reviews(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'good', (select count(*) from ratings where target = p_user and good),
    'bad', (select count(*) from ratings where target = p_user and good = false),
    'reviews', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
      select jsonb_build_object('kind', r.kind, 'good', r.good, 'tags', r.tags, 'body', r.body, 'by', p.username, 'at', r.updated_at) x
      from ratings r join profiles p on p.user_id = r.author
      where r.target = p_user and r.kind in ('market', 'flash') order by r.updated_at desc limit 20) y))
$$;

-- Trader profile now also carries Market & Flash reviews.
create or replace function public.luda_trader(p_username text, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('username', p.username, 'name', split_part(p.full_name, ' ', 1), 'verified', p.kyc_status = 'verified',
      'country', p.country, 'since', p.created_at, 'stats', luda_p2p_stats(p.user_id), 'reviews', luda_p2p_reviews(p.username),
      'community', luda_community_reviews(p.user_id),
      'ads', (select count(*) from p2p_ads a where a.user_id = p.user_id and a.status = 'active'),
      'blocked', exists (select 1 from p2p_blocks b where b.user_id = p_viewer and b.blocked = p.user_id),
      'me', p.user_id = p_viewer, 'lastSeen', p.last_seen)
    from profiles p where p.username = lower(p_username)
$$;

-- Luda HQ → Ratings.
create or replace function public.luda_admin_ratings(p_days int) returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (select * from ratings where updated_at > now() - make_interval(days => p_days))
  select jsonb_build_object(
    'summary', (select coalesce(jsonb_object_agg(kind, s), '{}'::jsonb) from (
      select kind, jsonb_build_object('n', count(*), 'avg', round(avg(stars)::numeric, 2), 'good', count(*) filter (where good), 'bad', count(*) filter (where good = false),
        'low', count(*) filter (where stars <= 2 or good = false)) s from r group by kind) k),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('staff', staff, 'n', n, 'avg', a) order by n desc), '[]'::jsonb) from (
      select staff, count(*) n, round(avg(stars)::numeric, 2) a from r where staff is not null and stars is not null group by staff) s),
    'reopened', (select count(*) from cases where reopens > 0 and updated_at > now() - make_interval(days => p_days)),
    'items', (select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) from (
      select jsonb_build_object('id', r.id, 'kind', r.kind, 'ref', r.ref, 'stars', r.stars, 'good', r.good, 'tags', r.tags, 'body', r.body,
        'staff', r.staff, 'by', a.username, 'target', t.username, 'at', r.updated_at,
        'low', coalesce(r.stars <= 2, false) or r.good = false,
        'title', case r.kind when 'case' then (select subject from cases where id = r.ref) when 'bill' then (select provider from bills where id = r.ref)
          when 'market' then (select title from listings where id = r.ref) else (select title from flash_jobs where id = r.ref) end,
        'caseStatus', case when r.kind = 'case' then (select status from cases where id = r.ref) end) x
      from r join profiles a on a.user_id = r.author left join profiles t on t.user_id = r.target
      order by r.updated_at desc limit 150) y))
$$;

revoke all on function public.luda_mark_handled(text, uuid, text) from public, anon, authenticated;
revoke all on function public.luda_rate(uuid, text, uuid, int, boolean, text[], text) from public, anon, authenticated;
revoke all on function public.luda_case_reopen(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.luda_ratings_mine(uuid) from public, anon, authenticated;
revoke all on function public.luda_rate_pending(uuid) from public, anon, authenticated;
revoke all on function public.luda_community_reviews(uuid) from public, anon, authenticated;
revoke all on function public.luda_trader(text, uuid) from public, anon, authenticated;
revoke all on function public.luda_admin_ratings(int) from public, anon, authenticated;
