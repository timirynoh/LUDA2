-- Community on the server (2026-11-03): staff roles, Home banners, posts (housing, jobs, events, news, promos, places)
-- with reports, and group chats. Everything here is read/written only by the api Edge Function (service key).

/* ------------------------------- staff roles ------------------------------- */
-- The owner (profiles.is_admin or ADMIN_EMAILS) can do everything. Staff are added BY EMAIL with a level per area:
-- 'view' (see only) < 'edit' (act: reply, mark paid, approve) < 'full' (also refund, cancel, delete, freeze).
create table if not exists public.staff (
  email text primary key check (email = lower(email)),
  roles jsonb not null default '{}'::jsonb,
  note text,
  added_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff enable row level security;

create or replace function public.luda_staff_get(p_email text) returns jsonb
language sql stable security definer set search_path = public as $$
  select roles from staff where email = lower(p_email)
$$;
create or replace function public.luda_staff_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('username', (select p.username from profiles p where lower(p.email) = s.email limit 1)) order by s.created_at), '[]'::jsonb) from staff s
$$;
create or replace function public.luda_staff_set(p_email text, p_roles jsonb, p_note text, p_by uuid) returns jsonb
language sql security definer set search_path = public as $$
  insert into staff (email, roles, note, added_by) values (lower(p_email), p_roles, p_note, p_by)
  on conflict (email) do update set roles = excluded.roles, note = excluded.note, updated_at = now()
  returning to_jsonb(staff.*)
$$;
create or replace function public.luda_staff_remove(p_email text) returns boolean
language sql security definer set search_path = public as $$
  with d as (delete from staff where email = lower(p_email) returning 1) select exists (select 1 from d)
$$;

/* --------------------------------- banners --------------------------------- */
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 2 and 60),
  body text not null default '' check (length(body) <= 120),
  cta text not null default 'Open' check (length(cta) <= 24),
  link text not null default '/' check (link ~ '^/[a-z0-9/_?=&-]*$'),
  emoji text not null default '✨' check (length(emoji) <= 8),
  theme text not null default 'mint',
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  sort int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.banners enable row level security;

create or replace function public.luda_banners_live() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'cta', cta, 'link', link, 'emoji', emoji, 'theme', theme) order by sort, created_at desc), '[]'::jsonb)
    from banners where active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
$$;
create or replace function public.luda_banners_all() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(b) order by b.sort, b.created_at desc), '[]'::jsonb) from banners b
$$;
create or replace function public.luda_banner_save(p_id uuid, p jsonb, p_by uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b banners%rowtype;
begin
  if p_id is null then
    insert into banners (title, body, cta, link, emoji, theme, starts_at, ends_at, active, sort, created_by)
    values (p->>'title', coalesce(p->>'body', ''), coalesce(p->>'cta', 'Open'), coalesce(p->>'link', '/'), coalesce(p->>'emoji', '✨'), coalesce(p->>'theme', 'mint'),
            nullif(p->>'starts_at', '')::timestamptz, nullif(p->>'ends_at', '')::timestamptz, coalesce((p->>'active')::boolean, true), coalesce((p->>'sort')::int, 0), p_by)
    returning * into b;
  else
    update banners set title = p->>'title', body = coalesce(p->>'body', ''), cta = coalesce(p->>'cta', 'Open'), link = coalesce(p->>'link', '/'),
      emoji = coalesce(p->>'emoji', '✨'), theme = coalesce(p->>'theme', 'mint'), starts_at = nullif(p->>'starts_at', '')::timestamptz,
      ends_at = nullif(p->>'ends_at', '')::timestamptz, active = coalesce((p->>'active')::boolean, true), sort = coalesce((p->>'sort')::int, 0), updated_at = now()
    where id = p_id returning * into b;
    if not found then raise exception 'not_found'; end if;
  end if;
  return to_jsonb(b);
end $$;
create or replace function public.luda_banner_delete(p_id uuid) returns boolean
language sql security definer set search_path = public as $$
  with d as (delete from banners where id = p_id returning 1) select exists (select 1 from d)
$$;

/* ---------------------------------- posts ---------------------------------- */
-- One table for every kind of community post. `data` holds the kind's own fields (price, rooms, pay, date, place…).
create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('housing', 'job', 'event', 'news', 'promo', 'place')),
  user_id uuid not null,
  title text not null check (length(title) between 3 and 90),
  body text not null default '' check (length(body) <= 1500),
  data jsonb not null default '{}'::jsonb,
  photos text[] not null default '{}',
  city text not null default '',
  status text not null default 'live' check (status in ('live', 'review', 'removed')),
  official boolean not null default false,
  reports int not null default 0,
  review_note text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists board_posts_feed on public.board_posts (kind, status, created_at desc);
create index if not exists board_posts_user on public.board_posts (user_id, kind, created_at desc);
alter table public.board_posts enable row level security;

create table if not exists public.board_reports (
  post_id uuid not null references public.board_posts (id) on delete cascade,
  user_id uuid not null,
  reason text not null default '',
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.board_reports enable row level security;

create or replace function public.luda_board_view(b board_posts, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select (to_jsonb(b) - 'user_id' - 'reports' - 'photos') || jsonb_build_object(
    'author', luda_uname(b.user_id),
    'authorName', (select p.full_name from profiles p where p.user_id = b.user_id),
    'authorVerified', (select p.kyc_status = 'verified' from profiles p where p.user_id = b.user_id),
    'mine', b.user_id = p_viewer, 'photoKeys', to_jsonb(b.photos),
    'reported', exists (select 1 from board_reports r where r.post_id = b.id and r.user_id = p_viewer))
$$;

create or replace function public.luda_board_create(p_user uuid, p_kind text, p_title text, p_body text, p_data jsonb, p_photos text[], p_city text, p_status text, p_official boolean, p_days int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b board_posts%rowtype;
begin
  insert into board_posts (kind, user_id, title, body, data, photos, city, status, official, expires_at)
  values (p_kind, p_user, p_title, coalesce(p_body, ''), coalesce(p_data, '{}'::jsonb), coalesce(p_photos, '{}'), coalesce(p_city, ''), p_status, p_official,
          case when p_days > 0 then now() + make_interval(days => p_days) end)
  returning * into b;
  return luda_board_view(b, p_user);
end $$;

-- Live feed for one kind (newest first, official pinned), plus the viewer's own posts in any state.
create or replace function public.luda_board_list(p_kind text, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(luda_board_view(b, p_viewer) order by b.official desc, b.created_at desc) from (
      select * from board_posts where kind = p_kind and status = 'live' and (expires_at is null or expires_at > now()) order by official desc, created_at desc limit 100) b), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(luda_board_view(b, p_viewer) order by b.created_at desc) from (
      select * from board_posts where kind = p_kind and user_id = p_viewer and status <> 'removed' order by created_at desc limit 30) b), '[]'::jsonb))
$$;

create or replace function public.luda_board_count(p_user uuid, p_kind text, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'live', (select count(*) from board_posts where user_id = p_user and kind = p_kind and status in ('live', 'review') and (expires_at is null or expires_at > now())),
    'recent', (select count(*) from board_posts where user_id = p_user and kind = p_kind and created_at >= p_since))
$$;

-- Owner of the post (or staff) removes it.
create or replace function public.luda_board_remove(p_id uuid, p_user uuid, p_staff boolean, p_note text) returns boolean
language sql security definer set search_path = public as $$
  with u as (update board_posts set status = 'removed', review_note = p_note, updated_at = now()
              where id = p_id and status <> 'removed' and (p_staff or user_id = p_user) returning 1)
  select exists (select 1 from u)
$$;

-- One report per person per post. 3 different people → hidden until a staff member reviews it.
create or replace function public.luda_board_report(p_id uuid, p_user uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int; st text;
begin
  if not exists (select 1 from board_posts where id = p_id and status = 'live') then raise exception 'not_found'; end if;
  if exists (select 1 from board_posts where id = p_id and user_id = p_user) then raise exception 'own_post'; end if;
  insert into board_reports (post_id, user_id, reason) values (p_id, p_user, coalesce(p_reason, '')) on conflict do nothing;
  select count(*) into n from board_reports where post_id = p_id;
  update board_posts set reports = n, status = case when n >= 3 and not official then 'review' else status end, updated_at = now()
   where id = p_id returning status into st;
  return jsonb_build_object('reports', n, 'status', st);
end $$;

create or replace function public.luda_board_review(p_id uuid, p_approve boolean, p_note text) returns boolean
language sql security definer set search_path = public as $$
  with u as (update board_posts set status = case when p_approve then 'live' else 'removed' end, review_note = p_note,
                    reports = case when p_approve then 0 else reports end, updated_at = now()
              where id = p_id and status <> 'removed' returning id)
  , c as (delete from board_reports where p_approve and post_id in (select id from u))
  select exists (select 1 from u)
$$;

create or replace function public.luda_board_admin(p_status text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(luda_board_view(b, null) || jsonb_build_object('reports', b.reports,
      'reasons', (select coalesce(jsonb_agg(r.reason), '[]'::jsonb) from board_reports r where r.post_id = b.id)) order by b.created_at desc), '[]'::jsonb)
    from (select * from board_posts where p_status is null or status = p_status order by created_at desc limit 150) b
$$;

/* --------------------------------- groups ---------------------------------- */
create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 3 and 40),
  about text not null default '' check (length(about) <= 200),
  emoji text not null default '💬' check (length(emoji) <= 8),
  city text not null default '',
  owner_id uuid not null,
  official boolean not null default false,
  status text not null default 'live' check (status in ('live', 'removed')),
  created_at timestamptz not null default now()
);
create unique index if not exists chat_groups_name on public.chat_groups (lower(name)) where status = 'live';
alter table public.chat_groups enable row level security;

create table if not exists public.chat_members (
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  last_read bigint not null default 0,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists chat_members_user on public.chat_members (user_id);
alter table public.chat_members enable row level security;

create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.chat_groups (id) on delete cascade,
  user_id uuid not null,
  body text not null check (length(body) between 1 and 1000),
  deleted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_group on public.chat_messages (group_id, id desc);
alter table public.chat_messages enable row level security;

create or replace function public.luda_group_create(p_user uuid, p_name text, p_about text, p_emoji text, p_city text, p_official boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g chat_groups%rowtype;
begin
  if exists (select 1 from chat_groups where lower(name) = lower(p_name) and status = 'live') then raise exception 'name_taken'; end if;
  insert into chat_groups (name, about, emoji, city, owner_id, official) values (p_name, coalesce(p_about, ''), coalesce(p_emoji, '💬'), coalesce(p_city, ''), p_user, p_official) returning * into g;
  insert into chat_members (group_id, user_id, role) values (g.id, p_user, 'owner');
  return to_jsonb(g) - 'owner_id';
end $$;

create or replace function public.luda_groups(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'joined')::boolean desc, (x->>'official')::boolean desc, (x->>'lastAt') desc nulls last), '[]'::jsonb) from (
    select (to_jsonb(g) - 'owner_id') || jsonb_build_object(
      'owner', luda_uname(g.owner_id), 'mineOwner', g.owner_id = p_user,
      'members', (select count(*) from chat_members m where m.group_id = g.id),
      'joined', exists (select 1 from chat_members m where m.group_id = g.id and m.user_id = p_user),
      'unread', (select count(*) from chat_messages c, chat_members m where c.group_id = g.id and m.group_id = g.id and m.user_id = p_user and c.id > m.last_read and c.user_id <> p_user and not c.deleted),
      'last', (select jsonb_build_object('body', case when c.deleted then '' else left(c.body, 80) end, 'by', luda_uname(c.user_id), 'at', c.created_at) from chat_messages c where c.group_id = g.id order by c.id desc limit 1),
      'lastAt', (select max(c.created_at) from chat_messages c where c.group_id = g.id)) x
    from chat_groups g where g.status = 'live') s
$$;

create or replace function public.luda_group_join(p_group uuid, p_user uuid, p_join boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from chat_groups where id = p_group and status = 'live') then raise exception 'not_found'; end if;
  if p_join then
    insert into chat_members (group_id, user_id) values (p_group, p_user) on conflict do nothing;
  else
    if exists (select 1 from chat_members where group_id = p_group and user_id = p_user and role = 'owner') then raise exception 'owner_cannot_leave'; end if;
    delete from chat_members where group_id = p_group and user_id = p_user;
  end if;
  return true;
end $$;

-- Messages after `p_after` (or the latest 60). Only members can read.
create or replace function public.luda_group_messages(p_group uuid, p_user uuid, p_after bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare top bigint; res jsonb;
begin
  if not exists (select 1 from chat_members where group_id = p_group and user_id = p_user) then raise exception 'not_member'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'by', luda_uname(c.user_id), 'name', (select p.full_name from profiles p where p.user_id = c.user_id),
      'verified', (select p.kyc_status = 'verified' from profiles p where p.user_id = c.user_id), 'mine', c.user_id = p_user,
      'body', case when c.deleted then '' else c.body end, 'deleted', c.deleted, 'at', c.created_at) order by c.id), '[]'::jsonb), max(c.id)
    into res, top
    from (select * from chat_messages where group_id = p_group and id > coalesce(p_after, 0) order by id desc limit 60) c;
  if top is not null then update chat_members set last_read = greatest(last_read, top) where group_id = p_group and user_id = p_user; end if;
  return res;
end $$;

create or replace function public.luda_group_send(p_group uuid, p_user uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m chat_messages%rowtype;
begin
  if not exists (select 1 from chat_members cm join chat_groups g on g.id = cm.group_id where cm.group_id = p_group and cm.user_id = p_user and g.status = 'live') then raise exception 'not_member'; end if;
  insert into chat_messages (group_id, user_id, body) values (p_group, p_user, p_body) returning * into m;
  update chat_members set last_read = m.id where group_id = p_group and user_id = p_user;
  return jsonb_build_object('id', m.id, 'at', m.created_at);
end $$;

-- Author deletes their own message; group owner or staff can delete any.
create or replace function public.luda_group_delete_msg(p_msg bigint, p_user uuid, p_staff boolean) returns boolean
language sql security definer set search_path = public as $$
  with u as (update chat_messages c set deleted = true where c.id = p_msg and not c.deleted and (p_staff or c.user_id = p_user
             or exists (select 1 from chat_groups g where g.id = c.group_id and g.owner_id = p_user)) returning 1)
  select exists (select 1 from u)
$$;

create or replace function public.luda_group_remove(p_group uuid) returns boolean
language sql security definer set search_path = public as $$
  with u as (update chat_groups set status = 'removed' where id = p_group and status = 'live' returning 1) select exists (select 1 from u)
$$;

create or replace function public.luda_groups_owned(p_user uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from chat_groups where owner_id = p_user and status = 'live'
$$;

do $$ declare f text; begin
  foreach f in array array[
    'luda_staff_get(text)', 'luda_staff_list()', 'luda_staff_set(text,jsonb,text,uuid)', 'luda_staff_remove(text)',
    'luda_banners_live()', 'luda_banners_all()', 'luda_banner_save(uuid,jsonb,uuid)', 'luda_banner_delete(uuid)',
    'luda_board_view(board_posts,uuid)', 'luda_board_create(uuid,text,text,text,jsonb,text[],text,text,boolean,int)', 'luda_board_list(text,uuid)',
    'luda_board_count(uuid,text,timestamptz)', 'luda_board_remove(uuid,uuid,boolean,text)', 'luda_board_report(uuid,uuid,text)',
    'luda_board_review(uuid,boolean,text)', 'luda_board_admin(text)',
    'luda_group_create(uuid,text,text,text,text,boolean)', 'luda_groups(uuid)', 'luda_group_join(uuid,uuid,boolean)', 'luda_group_messages(uuid,uuid,bigint)',
    'luda_group_send(uuid,uuid,text)', 'luda_group_delete_msg(bigint,uuid,boolean)', 'luda_group_remove(uuid)', 'luda_groups_owned(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
