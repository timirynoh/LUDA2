-- v1.19.0: Help Center. Help articles live on the server (table guides, kind 'help', with a topic and order), so the
-- Luda team edits them in Luda HQ without an app update. People can say whether an article helped (help_votes).
-- Also a Privacy notice page (kind 'privacy').
alter table public.guides drop constraint if exists guides_kind_check;
alter table public.guides add constraint guides_kind_check check (kind in ('guide', 'terms', 'tip', 'help', 'privacy'));
alter table public.guides add column if not exists topic text;
alter table public.guides add column if not exists sort int not null default 0;

create table if not exists public.help_votes (
  slug    text not null references public.guides (slug) on delete cascade,
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  helpful boolean not null,
  at      timestamptz not null default now(),
  primary key (slug, user_id)
);
alter table public.help_votes enable row level security;
revoke all on public.help_votes from anon, authenticated;

create or replace function public.luda_help() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'topic', topic, 'sort', sort, 'title', title, 'intro', intro, 'steps', steps) order by topic, sort, slug), '[]'::jsonb)
  from guides where kind = 'help' $$;

create or replace function public.luda_help_vote(p_slug text, p_user uuid, p_helpful boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from guides where slug = p_slug and kind = 'help') then return false; end if;
  insert into help_votes (slug, user_id, helpful) values (p_slug, p_user, p_helpful)
  on conflict (slug, user_id) do update set helpful = excluded.helpful, at = now();
  return true;
end $$;

create or replace function public.luda_help_votes() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'no')::int desc, (x->>'yes')::int desc), '[]'::jsonb) from (
    select jsonb_build_object('slug', g.slug, 'title', g.title, 'topic', g.topic,
      'yes', count(*) filter (where v.helpful), 'no', count(*) filter (where not v.helpful)) x
    from guides g join help_votes v on v.slug = g.slug where g.kind = 'help' group by g.slug, g.title, g.topic) y $$;

-- Luda HQ: add / remove help articles (editing uses luda_guide_save).
create or replace function public.luda_help_create(p_slug text, p_topic text, p_title text, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g guides;
begin
  insert into guides (slug, kind, topic, sort, title, intro, updated_by)
  values (p_slug, 'help', p_topic, coalesce((select max(sort) + 1 from guides where kind = 'help' and topic = p_topic), 1), p_title, '', p_by)
  returning * into g;
  return to_jsonb(g);
exception when unique_violation then raise exception 'exists';
end $$;
create or replace function public.luda_help_delete(p_slug text) returns boolean
language sql security definer set search_path = public as $$
  with d as (delete from guides where slug = p_slug and kind = 'help' returning 1) select exists (select 1 from d) $$;

revoke all on function public.luda_help() from public, anon, authenticated;
revoke all on function public.luda_help_vote(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.luda_help_votes() from public, anon, authenticated;
revoke all on function public.luda_help_create(text, text, text, text) from public, anon, authenticated;
revoke all on function public.luda_help_delete(text) from public, anon, authenticated;

-- Starting articles (the team can edit them in Luda HQ → Guides & terms).

insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-start-what', 'help', 'start', 1, 'What can I do with Luda?', 'Luda is one app for life in North Cyprus: a Naira and Lira wallet, P2P exchange, Girne ⇄ Lefkoşa bus tickets, bills paid for you by the Luda team, Market, Flash help jobs, rooms and jobs, university dates and places near you.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-start-verify', 'help', 'start', 2, 'Why do I need to verify my ID?', 'You can look around without an ID check. Verifying your ID (a photo of your document and a quick selfie) unlocks withdrawals, sending money, P2P, selling on Market, earning with Flash and cash prizes. It keeps scammers and fake accounts out. You get 2 tries a day.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-start-codes', 'help', 'start', 3, 'Sign-in code or payment PIN: what''s the difference?', 'Your 6-digit sign-in code opens Luda. Your 4-digit payment PIN (or fingerprint) approves every payment. Never share either of them with anyone, not even someone who says they work for Luda.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-wallet-topup', 'help', 'wallet', 1, 'How do I top up my wallet?', 'Go to Wallet → Top up. Pay in Naira with Paystack or Flutterwave, or in USD, GHS, KES, UGX, ZMW or XAF (these arrive in your Lira wallet). You only pay the payment provider''s fee, shown before you pay.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-wallet-pending', 'help', 'wallet', 2, 'I paid but my top-up is still pending', 'Most top-ups arrive within a minute. If it still says Pending, open Luda again: we re-check with the payment provider automatically. If it''s not there after an hour, open the top-up in Wallet and tap ''Report a problem with this'', so the team can check it with the reference.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-wallet-convert', 'help', 'wallet', 3, 'How does Naira ⇄ Lira conversion work?', 'Exchange → Instant shows the exact amount before you confirm (1% margin). Lira bought with Instant is spend-only: use it in Luda for bills, tickets, Market and Flash. It can''t be sent to other people, and you can buy up to ₺5,000 every 24 hours.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-wallet-send', 'help', 'wallet', 4, 'Can I send money to another Luda user?', 'Yes, for free. Wallet → Send, enter their username and confirm with your PIN. Sending needs a verified ID. Lira bought with Instant can''t be sent.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-withdraw-how', 'help', 'withdraw', 1, 'How do I withdraw to my bank?', 'Wallet → Withdraw to a Nigerian bank account in your own name (it must match your verified ID). The fee is ₺3 and the minimum is ₦300. You see the exact amount before you confirm.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-withdraw-failed', 'help', 'withdraw', 2, 'My withdrawal failed or was refunded', 'If the bank or payment provider refuses a withdrawal, the amount and the fee go straight back to your wallet. Check the account number and try again. If money left your wallet but never arrived, open the withdrawal in Wallet and report it.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-p2p-how', 'help', 'p2p', 1, 'How does P2P exchange work?', 'You swap Naira for lira (or dollars, euros, pounds) with another verified person. Luda holds the Naira the whole time, so nobody can run away with it.', '[{"title": "Pick an offer", "body": "Choose a trader by price, completion rate and reviews."}, {"title": "Naira is held by Luda", "body": "The Naira side is locked until the trade is finished."}, {"title": "Lira is sent", "body": "By bank transfer to the account shown, or in cash when you meet."}, {"title": "Release", "body": "The person receiving lira checks their own bank app and releases the Naira."}]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-p2p-release', 'help', 'p2p', 2, 'When should I release the Naira?', 'Only when you see the lira in your own bank app (not a screenshot) and it comes from the right name. Never release because someone is rushing you. A release can''t be undone.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-p2p-appeal', 'help', 'p2p', 3, 'The other person isn''t responding or something is wrong', 'Tap Remind first. 15 minutes after the lira is marked as sent you can appeal. You then have 30 minutes to sort it out in the order chat before the Luda team reviews it. If nobody releases within 1 hour, the team steps in automatically. A screen recording of your bank app is the best proof.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-p2p-fee', 'help', 'p2p', 4, 'What does P2P cost?', '0.5% of the trade in lira (minimum ₺1, maximum ₺25), paid by whoever receives the Naira. You see it before you confirm.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-bills-how', 'help', 'bills', 1, 'How does bill pay work?', 'Choose the bill, type the details exactly as they appear on your bill and confirm. The amount plus the service fee (₺10 up to ₺1,000, ₺20 above) is held from your Lira wallet. The Luda team pays it on the official site and uploads the receipt, usually within 2 hours between 09:00 and 19:00.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-bills-refund', 'help', 'bills', 2, 'Why was my bill refunded?', 'If the team can''t pay it (for example the account number isn''t found), the full amount and the fee come back to your wallet with the reason. Check the details and try again.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-tickets-buy', 'help', 'tickets', 1, 'How do bus tickets work?', 'Transport → Girne ⇄ Lefkoşa. Pay from your wallet with no fee. Your ticket''s QR code changes every 30 seconds, so screenshots don''t work. Show it to the driver: a single works once, a return once each way.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-tickets-airport', 'help', 'tickets', 2, 'Can I book the airport shuttle in Luda?', 'The KIBHAS airport shuttle is booked and paid on kibhas.org. Luda opens their page for you, but Luda doesn''t sell those tickets.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-market-buy', 'help', 'market', 1, 'How is buying on Market protected?', 'When you buy, Luda holds your money. Meet the seller and check the item, then tap ''I received it'' and the seller is paid. If something is wrong, tap Problem before you confirm. Sellers are paid automatically after 7 days if nothing is reported.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-market-flash', 'help', 'market', 2, 'How does Flash work?', 'Post a quick job with a reward; the reward is held when you post. A verified helper takes it. When it''s done, tap ''Job done'' and they''re paid (minus 5%). If you don''t confirm, they''re paid after 3 days unless you report a problem.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-kyc-failed', 'help', 'kyc', 1, 'My ID check failed', 'Use good light, show the whole document and make sure the name on your Luda account matches your ID. You get 2 tries a day. If it keeps failing, tap ''Contact the Luda team'' and send your ID for a manual check.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-kyc-safe', 'help', 'kyc', 2, 'Is my ID safe?', 'Your document and selfie are checked by our ID partner and stored privately. Luda only keeps what''s needed to confirm it''s you and that one ID is used for one account.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-account-forgot', 'help', 'account', 1, 'I forgot my password or sign-in code', 'On the sign-in screen tap ''Forgot password?'' and we''ll email you a code. To keep you safe, money can''t leave your wallet for 24 hours after a password reset.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-account-freeze', 'help', 'account', 2, 'I think someone else is using my account', 'Go to Security → Freeze wallet straight away, then change your password and check Recent sign-ins. Open a request so the team can help you.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, topic, sort, title, intro, steps, updated_by) values ('help-account-notify', 'help', 'account', 3, 'How do I get notifications on my phone?', 'Security → Phone notifications → Turn on. On iPhone, first add Luda to your Home Screen (Share → Add to Home Screen) and open it from there.', '[]'::jsonb, 'luda') on conflict (slug) do nothing;
insert into public.guides (slug, kind, title, intro, steps, updated_by) values ('privacy', 'privacy', 'Privacy notice', 'This explains what Luda collects and why. It is a plain-language summary; the Luda team should have it reviewed by a lawyer.', '[{"title": "What we collect", "body": "Your name, email, username, phone (if you add it), country, university, the posts and messages you send in Luda, your wallet activity, and the ID document and selfie checked by our ID partner."}, {"title": "Why", "body": "To run your wallet and payments safely, confirm who you are, prevent fraud and scams, keep the community safe, and help you when you contact us."}, {"title": "Who we share it with", "body": "Only the partners needed to run the service: payment providers (Paystack, Flutterwave), our ID check partner, and our hosting. We never sell your data."}, {"title": "What stays on your phone", "body": "Your theme, language, drafts and timetable photos (read on your phone, never uploaded)."}, {"title": "Your choices", "body": "You can download your data in Security, turn notifications on or off, and ask the Luda team to close your account. Some records must be kept for legal and anti-fraud reasons."}]'::jsonb, 'luda') on conflict (slug) do nothing;
