-- v1.12.0 (owner, 2026-11-04): guides + terms on the server, private appeal messages, P2P reviews / remind /
-- release-time stats / blocking, and server-checked bus ticket QR codes. Everything here lives on the server.

/* ---------------- guides: proof-video guide, terms & conditions, ⓘ info tips (editable in Luda HQ) ---------------- */
create table if not exists public.guides (
  slug        text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  kind        text not null check (kind in ('guide', 'terms', 'tip')),
  title       text not null,
  intro       text not null default '',
  steps       jsonb not null default '[]'::jsonb,   -- [{ "title": "...", "body": "..." }]
  version     int not null default 1,
  updated_by  text,
  updated_at  timestamptz not null default now()
);
alter table public.guides enable row level security;

alter table public.profiles add column if not exists terms_version int not null default 0;
alter table public.profiles add column if not exists terms_at timestamptz;

create or replace function public.luda_guide(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$ select to_jsonb(g) from guides g where slug = p_slug $$;
create or replace function public.luda_guides(p_kind text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(g) order by g.slug), '[]'::jsonb) from guides g where p_kind is null or g.kind = p_kind $$;
create or replace function public.luda_guide_save(p_slug text, p_title text, p_intro text, p_steps jsonb, p_by text, p_bump boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g guides%rowtype;
begin
  update guides set title = p_title, intro = p_intro, steps = coalesce(p_steps->'items', '[]'::jsonb), updated_by = p_by, updated_at = now(),
    version = version + case when p_bump then 1 else 0 end where slug = p_slug returning * into g;
  if not found then raise exception 'not_found'; end if;
  return to_jsonb(g);
end $$;
create or replace function public.luda_terms_accept(p_user uuid, p_version int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v int;
begin
  select version into v from guides where slug = 'terms';
  if v is null or p_version <> v then raise exception 'not_available'; end if;
  update profiles set terms_version = v, terms_at = now() where user_id = p_user;
  return jsonb_build_object('ok', true, 'version', v);
end $$;

insert into public.guides (slug, kind, title, intro, steps) values
('p2p-proof', 'guide', 'How to record proof of a payment',
 'In a P2P dispute the Luda team needs a screen RECORDING, not a screenshot (screenshots are easy to fake). One unedited video from your phone, start to finish, usually settles a case in minutes.',
 $j$[
  {"title": "Start screen recording", "body": "Android: swipe down twice and tap Screen record. iPhone: open Control Centre and tap the record button. Keep recording until the very end, don't pause or cut."},
  {"title": "Show today's date and time", "body": "Swipe down so the phone's clock and date are visible, or open the Clock app for a second. This proves the video is new."},
  {"title": "Open your bank app from the Play Store or App Store", "body": "Open the Play Store (Android) or App Store (iPhone), search for your bank, and tap Open from there. This proves it's the real bank app, not a fake copy."},
  {"title": "Log in and show your account", "body": "Log in (it's fine to start at the 2-step / code screen). Show the page with your full name and account number or IBAN, so we can see the account is yours."},
  {"title": "Open the transaction history", "body": "Go to the list of transactions and scroll to the time of the order. If the money arrived, open that transaction. If it did NOT arrive, scroll slowly through the whole period from the order time until now."},
  {"title": "Open the transaction details", "body": "Tap the transaction and show the amount, the sender or receiver name, the date and time, and the reference. Hold each screen still for 2 to 3 seconds."},
  {"title": "Stop and upload in the order chat", "body": "Stop recording, then open the P2P order in Luda and add the video in the chat (choose 'Luda team only' if you don't want the other person to see your statement). Files over the size limit: send it in parts or ask the Luda team for a link."},
  {"title": "Don'ts", "body": "Don't edit, crop or speed up the video. Don't send screenshots instead. Never share your PIN, card number or passwords: blur nothing, just don't type them on camera. Luda will never ask you to pay outside an order."}
 ]$j$::jsonb),
('terms', 'terms', 'Luda Terms & Conditions',
 'Please read these terms. By creating an account or using Luda you agree to them. If we change them, we will ask you to agree again before you continue.',
 $j$[
  {"title": "1. Who we are", "body": "Luda is an app for students and people from Africa living in North Cyprus. It offers a wallet in Naira and Turkish lira, currency conversion, P2P exchange between users, bill payment help, bus tickets, a marketplace, Flash help jobs, community posts and university tools."},
  {"title": "2. Your account", "body": "You must be at least 18, give true details, and keep one account per person. Keep your password and PIN private; you are responsible for activity on your account. Tell us at once if you think someone else has used it. We may ask you to verify your identity (ID document and selfie) before you can withdraw, trade P2P, sell or take paid jobs."},
  {"title": "3. Your wallet and money", "body": "Money in your Luda wallet is recorded by Luda's server ledger. Top-ups are processed by our payment partners (such as Paystack and Flutterwave) and withdrawals go only to a bank account in your verified name. Balances, fees and exchange rates shown in the app are set by our server at the moment of each action. We may delay or hold a transaction to check it for fraud, errors or legal reasons, and we may correct mistakes in the ledger."},
  {"title": "4. Fees", "body": "Fees are shown in the app (Wallet, Fees) and on every confirmation screen before you approve. Payment partners may add their own fees. We may change fees for future transactions; the fee shown when you confirm is the one that applies."},
  {"title": "5. P2P exchange and escrow", "body": "In a P2P trade Luda holds the Naira (escrow) until the person paying Naira confirms they received the other currency, or the Luda team decides an appeal. The other currency is paid outside Luda (bank transfer or cash) directly between users, at your own risk. Only release when the money is in your own account. Follow the order timers. In an appeal you must give honest evidence when asked (see How to record proof); if you don't reply in time the team may decide with what it has. The team's decision on held money is final within Luda. Never trade outside an order."},
  {"title": "6. Market, Flash jobs and bills", "body": "Payments for Market items and Flash jobs are held by Luda and released when the buyer or poster confirms, or automatically after the stated time unless a problem is reported. Bill payments are made by the Luda team on the official site and a receipt is added; if we can't pay a bill we refund it. Sellers and helpers are responsible for what they offer."},
  {"title": "7. Rules everyone follows", "body": "No fraud, fake accounts, money laundering, scams, harassment, hate, adult content, or asking people to pay outside Luda. Posts and messages are checked and limited to keep Luda safe. We may remove content, limit features, freeze or close accounts that break these rules, and report illegal activity to the authorities."},
  {"title": "8. Rewards", "body": "XP, points, prizes and referral bonuses are worked out by Luda's server from real activity and may have monthly limits. Cash prizes need a verified identity. Rewards gained by cheating, multiple accounts or fake referrals will be removed."},
  {"title": "9. Privacy", "body": "We keep the data needed to run Luda and keep it safe: your profile, identity check results, transactions, messages in orders and support cases. Identity checks are done by our partner Didit. We don't sell your data. Support photos and P2P evidence are visible only to the people allowed to see them and the Luda team."},
  {"title": "10. Information in the app", "body": "University dates, bus times, places and guides are provided to help you and may change; always confirm important dates with the official source. Luda is not your university, bank, landlord or bus company."},
  {"title": "11. Limits of our responsibility", "body": "We work hard to keep Luda available and correct, but we can't promise it will never be interrupted. We are not responsible for losses caused by other users outside Luda's escrow, by your bank or payment partner, or by you sharing your PIN or password. Nothing in these terms removes rights you have by law."},
  {"title": "12. Closing your account", "body": "You can ask the Luda team to close your account at any time; we will help you withdraw your balance first. We may close or freeze accounts that break these terms."},
  {"title": "13. Changes and contact", "body": "We may update these terms; the version and date are shown here, and you will be asked to agree to important changes. Questions or complaints: Help, then New appeal in the app."}
 ]$j$::jsonb),
('tip-escrow', 'tip', 'Held safely by Luda (escrow)', 'When money is "held", it has left your available balance but nobody can spend it. Luda keeps it until the deal is finished: then it goes to the other person, or comes back to you if the deal is cancelled or the Luda team decides so. Held money is still counted on Luda''s server ledger at every moment.', '[]'),
('tip-p2p-release', 'tip', 'When to release', 'Release only after you see the money in YOUR bank app (or cash in your hand). A screenshot, a "pending" message or someone pressuring you is not proof. Once released, the Naira goes to the other person and can''t be pulled back.', '[]'),
('tip-p2p-appeal', 'tip', 'How an appeal works', 'Stage 1: you both have 30 minutes to sort it out in the chat. Stage 2: the Luda team reviews and may ask each of you for proof within a time limit. Stage 3: the team decides who gets the held Naira. Record a proof video if asked (see the guide).', '[]'),
('tip-fees', 'tip', 'About fees', 'Every Luda fee is set by our server and shown in lira before you confirm. Payment partners may add their own small fee at checkout. There are no monthly fees.', '[]'),
('tip-kyc', 'tip', 'Why we check your ID', 'One real person, one account. Checking your ID (document + selfie) keeps scammers out, and unlocks withdrawals, P2P, selling, paid Flash jobs and cash prizes. Your ID is checked by our partner Didit; you get 2 tries a day.', '[]'),
('tip-points', 'tip', 'Points, XP and prizes', 'XP and points come from what you really do in Luda, worked out on our server. Verified accounts can turn points into lira. Cash prizes have a monthly budget; after that you get points instead.', '[]'),
('tip-flash', 'tip', 'How Flash jobs are paid', 'The reward is held by Luda as soon as the job is posted. The helper gets it (minus Luda''s fee) when the poster taps Job done, or automatically after 3 days unless someone reports a problem.', '[]'),
('tip-market', 'tip', 'Buying safely on Market', 'Your payment is held by Luda until you confirm you received the item. The seller gets paid then, or automatically after 7 days unless you report a problem.', '[]'),
('tip-withdraw', 'tip', 'Withdrawals', 'You can only withdraw to a bank account in your verified name. The ₺3 fee comes from your Lira wallet, or the same value in Naira if you have no lira.', '[]')
on conflict (slug) do nothing;

/* ---------------- P2P: who can see a message in an appeal ---------------- */
create table if not exists public.p2p_reviews (
  order_id   uuid not null references public.p2p_orders (id),
  author     uuid not null references public.profiles (user_id),
  target     uuid not null references public.profiles (user_id),
  good       boolean not null,
  body       text not null default '' check (length(body) <= 200),
  created_at timestamptz not null default now(),
  primary key (order_id, author)
);
create index if not exists p2p_reviews_target on public.p2p_reviews (target, created_at desc);
alter table public.p2p_reviews enable row level security;


alter table public.p2p_messages add column if not exists visibility text not null default 'all' check (visibility in ('all', 'staff'));

create or replace function public.luda_p2p_msg_v(p_order uuid, p_user uuid, p_body text, p_files text[], p_vis text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_vis not in ('all', 'staff') then raise exception 'not_available'; end if;
  if p_vis = 'staff' and not exists (select 1 from p2p_orders where id = p_order and status = 'appeal') then raise exception 'not_available'; end if;
  perform luda_p2p_msg(p_order, p_user, p_body, p_files);
  if p_vis = 'staff' then
    update p2p_messages set visibility = 'staff' where id = (select max(id) from p2p_messages where order_id = p_order and user_id = p_user);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Staff (p_user null) see everything; people see shared messages and their own 'Luda team only' ones.
create or replace function public.luda_p2p_order(p_order uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select luda_p2p_view(o, p_user) || jsonb_build_object('messages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'kind', m.kind, 'by', case when m.kind = 'user' then luda_uname(m.user_id) when m.kind = 'staff' then coalesce(m.staff_name, 'Luda team') end,
      'mine', m.kind = 'user' and m.user_id = p_user, 'body', m.body, 'files', to_jsonb(m.files), 'at', m.at, 'private', m.visibility = 'staff') order by m.id)
      from p2p_messages m where m.order_id = o.id and (p_user is null or m.visibility = 'all' or m.user_id = p_user)), '[]'::jsonb),
    'reviewed', exists (select 1 from p2p_reviews r where r.order_id = o.id and r.author = p_user))
    from p2p_orders o where o.id = p_order and (p_user is null or o.maker = p_user or o.taker = p_user)
$$;

/* ---------------- P2P: reviews, stats, remind, block ---------------- */
create or replace function public.luda_p2p_review(p_order uuid, p_user uuid, p_good boolean, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and (ngn_payer = p_user or try_sender = p_user);
  if not found or o.status <> 'done' then raise exception 'not_available'; end if;
  insert into p2p_reviews (order_id, author, target, good, body)
  values (p_order, p_user, case when o.ngn_payer = p_user then o.try_sender else o.ngn_payer end, p_good, coalesce(p_body, ''))
  on conflict (order_id, author) do nothing;
  if not found then raise exception 'already_reviewed'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.luda_p2p_reviews(p_username text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('good', r.good, 'body', r.body, 'at', r.created_at, 'by', luda_uname(r.author)) order by r.created_at desc), '[]'::jsonb)
    from (select * from p2p_reviews where target = (select user_id from profiles where username = p_username) order by created_at desc limit 30) r
$$;

-- Trader stats shown on ads: trades, completion rate, 👍/👎, how fast they release (as Naira payer) and send (as lira sender).
create or replace function public.luda_p2p_stats(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'trades', count(*) filter (where status = 'done'),
    'rate', case when count(*) filter (where status in ('done', 'cancelled')) = 0 then null
                 else round(100.0 * count(*) filter (where status = 'done') / count(*) filter (where status in ('done', 'cancelled'))) end,
    'since', (select created_at from profiles where user_id = p_user),
    'good', (select count(*) from p2p_reviews where target = p_user and good),
    'bad', (select count(*) from p2p_reviews where target = p_user and not good),
    'releaseMin', (select round(avg(extract(epoch from (done_at - sent_at)) / 60)) from (select done_at, sent_at from p2p_orders
        where ngn_payer = p_user and status = 'done' and sent_at is not null and appeal_stage is null order by done_at desc limit 30) x),
    'sendMin', (select round(avg(extract(epoch from (sent_at - created_at)) / 60)) from (select sent_at, created_at from p2p_orders
        where try_sender = p_user and sent_at is not null order by sent_at desc limit 30) y))
  from p2p_orders where maker = p_user or taker = p_user
$$;

alter table public.p2p_orders add column if not exists reminded_at timestamptz;
alter table public.p2p_orders add column if not exists reminded_by uuid;
create or replace function public.luda_p2p_remind(p_order uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o p2p_orders%rowtype;
begin
  select * into o from p2p_orders where id = p_order and (ngn_payer = p_user or try_sender = p_user) for update;
  if not found or o.status not in ('waiting', 'sent', 'appeal') then raise exception 'not_available'; end if;
  if o.reminded_at > now() - interval '5 minutes' then raise exception 'too_soon'; end if;
  update p2p_orders set reminded_at = now(), reminded_by = p_user where id = o.id;
  perform luda_p2p_sys(o.id, '🔔 @' || luda_uname(p_user) || ' sent a reminder.');
  return jsonb_build_object('ok', true);
end $$;

create table if not exists public.p2p_blocks (
  user_id    uuid not null references public.profiles (user_id),
  blocked    uuid not null references public.profiles (user_id),
  created_at timestamptz not null default now(),
  primary key (user_id, blocked)
);
alter table public.p2p_blocks enable row level security;
create or replace function public.luda_p2p_block(p_user uuid, p_username text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select user_id into t from profiles where username = lower(p_username);
  if t is null or t = p_user then raise exception 'not_found'; end if;
  if p_on then insert into p2p_blocks (user_id, blocked) values (p_user, t) on conflict do nothing;
  else delete from p2p_blocks where user_id = p_user and blocked = t; end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function public.luda_p2p_blocks(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'mine', coalesce((select jsonb_agg(luda_uname(blocked) order by created_at desc) from p2p_blocks where user_id = p_user), '[]'::jsonb),
    'hidden', coalesce((select jsonb_agg(distinct u) from (select luda_uname(blocked) u from p2p_blocks where user_id = p_user
                                                            union select luda_uname(user_id) from p2p_blocks where blocked = p_user) z), '[]'::jsonb))
$$;
create or replace function public.luda_p2p_blocked_ad(p_ad uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from p2p_ads a join p2p_blocks b on (b.user_id = a.user_id and b.blocked = p_user) or (b.user_id = p_user and b.blocked = a.user_id) where a.id = p_ad)
$$;

/* ---------------- bus tickets: server-checked QR (drivers / Luda team scan it) ---------------- */
create table if not exists public.ticket_checks (
  id         bigserial primary key,
  ticket_id  uuid not null references public.tickets (id),
  checked_by text not null,
  result     text not null,
  at         timestamptz not null default now()
);
create index if not exists ticket_checks_ticket on public.ticket_checks (ticket_id, at);
alter table public.ticket_checks enable row level security;

create or replace function public.luda_ticket_lookup(p_code text, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', t.id, 'code', t.code, 'status', t.status, 'item', t.item, 'userId', t.user_id,
      'holder', coalesce(nullif(t.item->>'holder', ''), p.full_name), 'username', p.username, 'verified', p.kyc_status = 'verified',
      'checks', (select count(*) from ticket_checks c where c.ticket_id = t.id and c.result = 'ok'),
      'lastCheck', (select max(at) from ticket_checks c where c.ticket_id = t.id and c.result = 'ok'))
    from tickets t join profiles p on p.user_id = t.user_id
   where t.code = upper(p_code) and (p_user is null or t.user_id = p_user)
$$;
create or replace function public.luda_ticket_mark(p_ticket uuid, p_by text, p_result text, p_used boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into ticket_checks (ticket_id, checked_by, result) values (p_ticket, p_by, p_result);
  if p_used then update tickets set status = 'used' where id = p_ticket and status = 'valid'; end if;
end $$;

/* ---------------- To do: reminders, private replies, rate your trade ---------------- */
create or replace function public.luda_todo(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'p2p', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'status', o.status, 'stage', o.appeal_stage, 'payer', o.ngn_payer = p_user,
              'amount', o.amount_try, 'asset', o.asset, 'ngn', o.amount_ngn, 'payBy', o.pay_by, 'sentAt', o.sent_at, 'updatedAt', o.updated_at, 'askDue', o.ask_due, 'remindedBy', case when o.reminded_by is not null and o.reminded_by <> p_user and o.reminded_at > now() - interval '30 minutes' then luda_uname(o.reminded_by) end, 'remindedAt', o.reminded_at,
              'askMe', o.ask_at is not null and ((o.ngn_payer = p_user and o.ask_who in ('payer', 'both') and o.ask_payer_at is null) or (o.try_sender = p_user and o.ask_who in ('sender', 'both') and o.ask_sender_at is null)),
              'other', (select username from profiles where user_id = case when o.ngn_payer = p_user then o.try_sender else o.ngn_payer end)) order by o.updated_at desc), '[]'::jsonb)
            from p2p_orders o where (o.ngn_payer = p_user or o.try_sender = p_user) and o.status in ('waiting', 'sent', 'appeal')),
    'rate', (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'other', luda_uname(case when o.ngn_payer = p_user then o.try_sender else o.ngn_payer end))), '[]'::jsonb)
            from p2p_orders o where (o.ngn_payer = p_user or o.try_sender = p_user) and o.status = 'done' and o.done_at > now() - interval '2 days'
             and not exists (select 1 from p2p_reviews r where r.order_id = o.id and r.author = p_user)),
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

do $$
declare f text;
begin
  foreach f in array array['luda_guide(text)', 'luda_guides(text)', 'luda_guide_save(text,text,text,jsonb,text,boolean)', 'luda_terms_accept(uuid,int)',
    'luda_p2p_msg_v(uuid,uuid,text,text[],text)', 'luda_p2p_order(uuid,uuid)', 'luda_p2p_review(uuid,uuid,boolean,text)', 'luda_p2p_reviews(text)', 'luda_p2p_stats(uuid)',
    'luda_p2p_remind(uuid,uuid)', 'luda_p2p_block(uuid,text,boolean)', 'luda_p2p_blocks(uuid)', 'luda_p2p_blocked_ad(uuid,uuid)',
    'luda_ticket_lookup(text,uuid)', 'luda_ticket_mark(uuid,text,text,boolean)', 'luda_todo(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
