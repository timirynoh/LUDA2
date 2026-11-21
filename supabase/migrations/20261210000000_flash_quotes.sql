-- v1.29.0: Flash requests with chat, the helper's own price, and cash (owner, 2026-11-14).
-- 1) Posting holds NOTHING. The poster gives a starting budget, photos and an optional video of the problem, and
--    chooses how they'll pay: 'luda' (held by Luda) or 'cash' (paid in hand when the job is done).
-- 2) Verified helpers open a chat with the poster about the job and send their own price (a 'quote' message).
-- 3) The poster accepts one price: for 'luda' THAT amount is held in escrow (not the starting budget); a short
--    wallet fails with insufficient_funds (the app says how much to top up). For 'cash' nothing is held.
-- 4) The helper marks the job finished with photos; the poster confirms (escrow released minus the fee, or the cash
--    job closes). Without a reply it completes 3 days after the finish photos, unless a problem case is open.
-- Jobs posted before this change already have their reward held: they are marked legacy and keep that money
-- until a price is accepted (then the old hold is returned and the accepted price is held instead).

alter table public.flash_jobs alter column escrow_id drop not null;
alter table public.flash_jobs add column if not exists pay text not null default 'luda' check (pay in ('luda', 'cash'));
alter table public.flash_jobs add column if not exists photos text[] not null default '{}';
alter table public.flash_jobs add column if not exists video text;
alter table public.flash_jobs add column if not exists agreed_minor bigint check (agreed_minor is null or agreed_minor > 0);
alter table public.flash_jobs add column if not exists done_at timestamptz;
alter table public.flash_jobs add column if not exists done_photos text[] not null default '{}';
alter table public.flash_jobs add column if not exists done_note text not null default '';
alter table public.flash_jobs add column if not exists legacy boolean not null default false;
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'flash_jobs' and column_name = 'legacy_marked') then
    alter table public.flash_jobs add column legacy_marked boolean not null default true;
    update public.flash_jobs set legacy = (escrow_id is not null);
  end if;
end $$;

create table if not exists public.flash_msgs (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references public.flash_jobs (id) on delete cascade,
  helper       uuid not null references public.profiles (user_id),   -- the thread: one per helper per job
  author       uuid references public.profiles (user_id),            -- null = Luda (system line)
  kind         text not null default 'text' check (kind in ('text', 'quote', 'system')),
  body         text not null default '' check (length(body) <= 600),
  amount_minor bigint check (amount_minor is null or amount_minor > 0),
  quote_status text check (quote_status in ('pending', 'accepted', 'declined', 'replaced')),
  files        text[] not null default '{}',
  video        text,
  created_at   timestamptz not null default now()
);
create index if not exists flash_msgs_thread on public.flash_msgs (job_id, helper, created_at);
create index if not exists flash_msgs_helper on public.flash_msgs (helper, created_at desc);
alter table public.flash_msgs enable row level security;

create or replace function public.luda_flash_post2(p_poster uuid, p_title text, p_details text, p_city text, p_budget bigint, p_pay text,
  p_photos text[], p_video text, p_emoji text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j flash_jobs%rowtype;
begin
  if p_pay not in ('luda', 'cash') then raise exception 'not_available'; end if;
  insert into flash_jobs (poster, title, details, city, reward_minor, pay, photos, video, emoji)
  values (p_poster, p_title, p_details, p_city, p_budget, p_pay, coalesce(p_photos, '{}'), p_video, coalesce(p_emoji, '⚡'))
  returning * into j;
  return to_jsonb(j) - 'escrow_id';
end $$;

-- A message in the thread between the poster and one helper.
create or replace function public.luda_flash_msg(p_job uuid, p_helper uuid, p_author uuid, p_kind text, p_body text, p_amount bigint,
  p_files text[], p_video text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j flash_jobs%rowtype; m flash_msgs%rowtype; has_thread boolean;
begin
  select * into j from flash_jobs where id = p_job;
  if not found then raise exception 'not_found'; end if;
  if p_helper = j.poster then raise exception 'own_listing'; end if;
  has_thread := exists (select 1 from flash_msgs where job_id = p_job and helper = p_helper);
  if p_author = j.poster then
    if not has_thread and j.helper is distinct from p_helper then raise exception 'not_available'; end if;
  elsif p_author = p_helper then
    -- new conversations and prices only while the job is open; the chosen helper can keep talking
    if j.status <> 'open' and j.helper is distinct from p_helper then raise exception 'not_available'; end if;
    if p_kind = 'quote' and j.status <> 'open' then raise exception 'not_available'; end if;
  else
    raise exception 'not_available';
  end if;
  if j.status in ('done', 'cancelled') then raise exception 'not_available'; end if;
  if p_kind = 'quote' then
    update flash_msgs set quote_status = 'replaced' where job_id = p_job and helper = p_helper and kind = 'quote' and quote_status = 'pending';
  end if;
  insert into flash_msgs (job_id, helper, author, kind, body, amount_minor, quote_status, files, video)
  values (p_job, p_helper, p_author, p_kind, coalesce(p_body, ''), case when p_kind = 'quote' then p_amount end,
          case when p_kind = 'quote' then 'pending' end, coalesce(p_files, '{}'), p_video)
  returning * into m;
  return to_jsonb(m) || jsonb_build_object('poster', j.poster, 'title', j.title);
end $$;

create or replace function public.luda_flash_sys(p_job uuid, p_helper uuid, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into flash_msgs (job_id, helper, author, kind, body) values (p_job, p_helper, null, 'system', left(p_body, 600))
$$;

create or replace function public.luda_flash_decline(p_job uuid, p_msg uuid, p_poster uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m flash_msgs%rowtype;
begin
  update flash_msgs f set quote_status = 'declined' from flash_jobs j
   where f.id = p_msg and f.job_id = p_job and j.id = f.job_id and j.poster = p_poster and f.kind = 'quote' and f.quote_status = 'pending'
  returning f.* into m;
  if not found then raise exception 'not_available'; end if;
  return to_jsonb(m);
end $$;

-- The poster accepts a helper's price. Luda pay: the ACCEPTED amount is held now (fails if the wallet is short).
create or replace function public.luda_flash_accept(p_job uuid, p_msg uuid, p_poster uuid, p_fee_pct numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j flash_jobs%rowtype; m flash_msgs%rowtype; eid uuid; fee bigint;
begin
  select * into j from flash_jobs where id = p_job for update;
  if not found or j.poster <> p_poster or j.status <> 'open' then raise exception 'not_available'; end if;
  select * into m from flash_msgs where id = p_msg and job_id = p_job and kind = 'quote' and quote_status = 'pending' for update;
  if not found then raise exception 'not_available'; end if;
  if j.escrow_id is not null then perform luda_settle(j.escrow_id, 'payer', 'Replaced by the accepted price'); end if; -- legacy hold back
  eid := null;
  if j.pay = 'luda' then
    fee := least(round(m.amount_minor * coalesce(p_fee_pct, 0))::bigint, m.amount_minor);
    eid := luda_hold('flash', p_poster, m.helper, 'TRY', m.amount_minor, fee, jsonb_build_object('job', j.title));
  end if;
  update flash_jobs set status = 'taken', helper = m.helper, agreed_minor = m.amount_minor, escrow_id = eid, taken_at = now(),
         done_at = null, done_photos = '{}', updated_at = now(), legacy = false
   where id = p_job returning * into j;
  update flash_msgs set quote_status = 'accepted' where id = p_msg;
  update flash_msgs set quote_status = 'declined' where job_id = p_job and kind = 'quote' and quote_status = 'pending';
  insert into flash_msgs (job_id, helper, author, kind, body) values (p_job, m.helper, null, 'system',
    case when j.pay = 'luda' then 'Price accepted. The money is held safely by Luda until the job is done.' else 'Price accepted. Payment is in cash when the job is done.' end);
  return to_jsonb(j) - 'escrow_id';
end $$;

-- The helper says the job is finished, with photos.
create or replace function public.luda_flash_finished(p_job uuid, p_helper uuid, p_photos text[], p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j flash_jobs%rowtype;
begin
  update flash_jobs set done_at = now(), done_photos = coalesce(p_photos, '{}'), done_note = left(coalesce(p_note, ''), 300), updated_at = now()
   where id = p_job and helper = p_helper and status = 'taken' returning * into j;
  if not found then raise exception 'not_available'; end if;
  insert into flash_msgs (job_id, helper, author, kind, body, files) values (p_job, p_helper, null, 'system', 'Job finished. Photos of the work are attached.', coalesce(p_photos, '{}'));
  return to_jsonb(j) - 'escrow_id';
end $$;

-- 'helper': job done (escrow released, or a cash job closes). 'poster': cancelled (any hold returned).
create or replace function public.luda_flash_finish(p_job uuid, p_to text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j flash_jobs%rowtype;
begin
  select * into j from flash_jobs where id = p_job and status in ('open', 'taken') for update;
  if not found or (p_to = 'helper' and j.status <> 'taken') then return jsonb_build_object('ok', false, 'already', true); end if;
  if j.escrow_id is not null then perform luda_settle(j.escrow_id, case when p_to = 'helper' then 'payee' else 'payer' end, p_note); end if;
  update flash_jobs set status = case when p_to = 'helper' then 'done' else 'cancelled' end, updated_at = now() where id = p_job returning * into j;
  if j.helper is not null then perform luda_flash_sys(p_job, j.helper, p_note); end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(j) - 'escrow_id');
end $$;

-- The chosen helper can't do it: the job goes back on the board. The held price is returned to the poster
-- (an old-style job keeps its original reward held).
create or replace function public.luda_flash_drop(p_job uuid, p_helper uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare j flash_jobs%rowtype;
begin
  select * into j from flash_jobs where id = p_job and helper = p_helper and status = 'taken' for update;
  if not found then raise exception 'not_available'; end if;
  if j.legacy then
    update escrows set payee = null where id = j.escrow_id and status = 'held';
  elsif j.escrow_id is not null then
    perform luda_settle(j.escrow_id, 'payer', 'The helper could not do the job');
    j.escrow_id := null;
  end if;
  update flash_jobs set status = 'open', helper = null, taken_at = null, agreed_minor = null, done_at = null, done_photos = '{}',
         escrow_id = j.escrow_id, updated_at = now() where id = p_job returning * into j;
  perform luda_flash_sys(p_job, p_helper, 'The helper gave the job back. It is open again.');
  return to_jsonb(j) - 'escrow_id';
end $$;

create or replace function public.luda_auto_release(p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; x record;
begin
  for x in select id from listings where seller = p_user and status = 'reserved' and reserved_at < now() - interval '7 days'
            and not exists (select 1 from cases c where c.reference = listings.id::text and c.status in ('open', 'waiting_user')) loop
    perform luda_market_finish(x.id, 'seller', 'Released automatically after 7 days'); n := n + 1;
  end loop;
  -- Flash: 3 days after the helper's finish photos (old-style jobs: 3 days after they were taken).
  for x in select id from flash_jobs where helper = p_user and status = 'taken'
              and ((done_at is not null and done_at < now() - interval '3 days') or (legacy and done_at is null and taken_at < now() - interval '3 days'))
              and not exists (select 1 from cases c where c.reference = flash_jobs.id::text and c.status in ('open', 'waiting_user')) loop
    perform luda_flash_finish(x.id, 'helper', 'Completed automatically 3 days after the job was finished'); n := n + 1;
  end loop;
  return n;
end $$;

/* ------------------------------ reads ------------------------------ */
create or replace function public.luda_flash_card(j flash_jobs, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(j) - 'escrow_id' - 'poster' - 'helper' - 'legacy_marked' || jsonb_build_object(
    'poster_name', luda_uname(j.poster), 'helper_name', luda_uname(j.helper), 'mine', j.poster = p_user, 'is_helper', j.helper = p_user,
    'photo_count', cardinality(j.photos), 'has_video', j.video is not null,
    'quotes', (select count(*) from flash_msgs m where m.job_id = j.id and m.kind = 'quote' and m.quote_status = 'pending'),
    'threads', (select count(distinct helper) from flash_msgs m where m.job_id = j.id),
    'my_quote', (select m.amount_minor from flash_msgs m where m.job_id = j.id and m.helper = p_user and m.kind = 'quote' and m.quote_status = 'pending' order by m.created_at desc limit 1))
$$;

create or replace function public.luda_flash_list(p_user uuid, p_city text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'open', coalesce((select jsonb_agg(luda_flash_card(j, p_user) order by j.created_at desc)
        from (select * from flash_jobs where status = 'open' and (p_city is null or p_city = '' or city = p_city) order by created_at desc limit 60) j), '[]'::jsonb),
    'mine', coalesce((select jsonb_agg(luda_flash_card(j, p_user) order by j.created_at desc)
        from (select * from flash_jobs where poster = p_user order by created_at desc limit 30) j), '[]'::jsonb),
    'helping', coalesce((select jsonb_agg(luda_flash_card(j, p_user) order by j.updated_at desc)
        from (select * from flash_jobs where helper = p_user order by updated_at desc limit 30) j), '[]'::jsonb),
    'talking', coalesce((select jsonb_agg(luda_flash_card(j, p_user) order by j.updated_at desc)
        from (select * from flash_jobs fj where fj.status = 'open' and fj.poster <> p_user
                 and exists (select 1 from flash_msgs m where m.job_id = fj.id and m.helper = p_user) order by updated_at desc limit 30) j), '[]'::jsonb)
  )
$$;

-- One job with the conversations the caller may see: the poster sees every helper's thread, a helper only their own.
create or replace function public.luda_flash_job(p_job uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when j.id is null then null
    when j.status not in ('open') and p_user not in (j.poster, coalesce(j.helper, '00000000-0000-0000-0000-000000000000'::uuid))
         and not exists (select 1 from flash_msgs m where m.job_id = j.id and m.helper = p_user) then null
    else luda_flash_card(j, p_user) || jsonb_build_object(
      'threads', coalesce((select jsonb_agg(t order by t->>'last_at' desc) from (
          select jsonb_build_object('helper_id', h.helper, 'helper_name', luda_uname(h.helper),
                   'last_at', max(m.created_at),
                   'messages', jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'body', m.body, 'amount_minor', m.amount_minor,
                       'quote_status', m.quote_status, 'files', m.files, 'video', m.video, 'created_at', m.created_at,
                       'from', case when m.author is null then 'luda' when m.author = j.poster then 'poster' else 'helper' end) order by m.created_at)) t
            from (select distinct helper from flash_msgs where job_id = j.id) h
            join flash_msgs m on m.job_id = j.id and m.helper = h.helper
           where p_user = j.poster or h.helper = p_user
           group by h.helper) x), '[]'::jsonb))
  end
  from (select 1) one left join flash_jobs j on j.id = p_job
$$;

-- To do (built on the server): new prices to look at, finished jobs to confirm, jobs to do.
create or replace function public.luda_flash_todo(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'quotes', coalesce((select jsonb_agg(jsonb_build_object('job', j.id, 'msg', m.id, 'title', j.title, 'from', luda_uname(m.helper), 'amount', m.amount_minor))
        from flash_msgs m join flash_jobs j on j.id = m.job_id where j.poster = p_user and j.status = 'open' and m.kind = 'quote' and m.quote_status = 'pending'), '[]'::jsonb),
    'toConfirm', coalesce((select jsonb_agg(jsonb_build_object('job', j.id, 'title', j.title, 'helper', luda_uname(j.helper), 'pay', j.pay, 'amount', j.agreed_minor))
        from flash_jobs j where j.poster = p_user and j.status = 'taken' and j.done_at is not null), '[]'::jsonb),
    'inProgress', coalesce((select jsonb_agg(jsonb_build_object('job', j.id, 'title', j.title, 'helper', luda_uname(j.helper)))
        from flash_jobs j where j.poster = p_user and j.status = 'taken' and j.done_at is null), '[]'::jsonb),
    'toDo', coalesce((select jsonb_agg(jsonb_build_object('job', j.id, 'title', j.title, 'poster', luda_uname(j.poster), 'pay', j.pay, 'amount', coalesce(j.agreed_minor, j.reward_minor)))
        from flash_jobs j where j.helper = p_user and j.status = 'taken' and j.done_at is null), '[]'::jsonb)
  )
$$;

do $$
declare f text;
begin
  foreach f in array array['luda_flash_post2(uuid,text,text,text,bigint,text,text[],text,text)', 'luda_flash_msg(uuid,uuid,uuid,text,text,bigint,text[],text)',
    'luda_flash_sys(uuid,uuid,text)', 'luda_flash_decline(uuid,uuid,uuid)', 'luda_flash_accept(uuid,uuid,uuid,numeric)', 'luda_flash_finished(uuid,uuid,text[],text)',
    'luda_flash_finish(uuid,text,text)', 'luda_flash_drop(uuid,uuid)', 'luda_auto_release(uuid)', 'luda_flash_card(flash_jobs,uuid)', 'luda_flash_list(uuid,text)',
    'luda_flash_job(uuid,uuid)', 'luda_flash_todo(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- The 'How Flash jobs are paid' tip, updated for prices and cash.
update public.guides set intro = 'Post what you need with your starting budget, and choose to pay through Luda or in cash. Helpers chat with you and send their own price. When you accept a price, that amount is held by Luda (nothing is taken when you post). The helper finishes the job and adds photos; you confirm and they are paid (minus Luda''s fee). If you don''t reply, it completes 3 days after the photos unless you report a problem. Cash jobs are paid in hand.'
 where slug = 'tip-flash';

update public.guides set intro = 'Post what you need with a starting budget, photos or a video, and choose to pay through Luda or in cash. Verified helpers chat with you and send their own price. When you accept a price, that amount is held by Luda (nothing is taken when you post). The helper finishes and adds photos; tap ''Job done'' and they''re paid (minus 5%). If you don''t confirm, it completes 3 days after the photos unless you report a problem.'
 where slug = 'help-market-flash';
