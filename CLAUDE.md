# Luda: project memory for Claude

Read this first in every session. It records the owner's rules, the architecture, and the open questions.
For the full feature list, see `README.md`. For history, see `git log` (the commit messages are detailed).

## What Luda is
Luda is an all-in-one, gamified, modern app for Africans (mostly students) living in **North Cyprus (TRNC)**. It covers:
- Money: wallet, FX (Naira etc. ⇄ TL), a P2P in-person exchange hub with appeals, and bills
- Admin: the residency portal (`https://permissions.gov.ct.tr/login`)
- Daily life: city directory, housing and roommates, jobs, community events (churches and mosques), a university hub (fees, deadlines, timetable OCR), and transport
- Social and growth: chats, Flash help requests, marketplace, promos, and referrals

**Live mode (owner's decision, 2026-11-01): a real-money wallet.** Paystack/Flutterwave are used ONLY to move money in (top-ups) and out (withdrawals, Paystack only). Everything else (bus/airport tickets, NGN⇄TRY conversion, sending to other users) is paid from the server wallet. The owner chose: NGN + TRY wallets; top-ups in USD/GHS/KES/UGX/ZMW/XAF via Flutterwave are converted into the TRY wallet (`FOREIGN` in money.ts, migration `*_foreign_topups.sql` adds `payments.credit_currency`); automatic KYC (Didit document + selfie for any nationality, primary; Dojah NIN/BVN optional for Nigerians), sending between users, and users pay both fees. Live mode switches on only when `VITE_PAY_API` is set at build time; without it the app is the pure demo (and the Claude artifact stays demo). In live mode the Exchange tab is real NGN⇄TRY conversion (`screens/LiveExchange.tsx`; P2P cash swap explained as coming later). Bills, Flash, Savings and Market run on the real wallet since 2026-11-01 (see 'Wallet features' below); `components/LiveSoon.tsx` is no longer routed.

## Versioning (owner's rule, 2026-11-02)
- The app shows its version: Profile footer shows only 'Luda v1.0.1' (owner doesn't want build numbers shown to users; demo builds add ' · Demo'), the sign-in screen 'v1.0.1', and the admin header 'v… · build <time · commit>' (build details for the owner only). 'Reset demo data' is hidden in LIVE. Source of truth: `app/package.json` "version" → `__VERSION__` (vite define, `src/build.d.ts`).
- v1.0.0 = first live real-money release (2026-11-02). Bump on EVERY push that reaches users: patch (1.0.x) = fixes, minor (1.x.0) = new features, major (x.0.0) = big changes. Mention the new version in the commit message.

## Translations (2026-11-02, v1.1.0)
- Old system: `lib/i18n.ts` `t(key)` covers ~125 keys (nav, headings). New layer: `lib/autoTranslate.ts` (`setScreenLanguage`, called from the store when `s.lang` changes) translates EVERY on-screen text node and placeholder/title/aria-label it knows, using `src/i18n/{fr,tr,sw,ar}.json` keyed by the exact English text (`{}` = pattern, e.g. "Hold to pay {}"). It follows React updates with a MutationObserver and restores English when switching back. Skips `[translate="no"]`, `.notranslate`, `.selectable` and texts that are already t() values (prevents double translation).
- Covered (v1.2.0, ~1,950 texts per language): all user screens incl. Housing, Jobs, Community, Uni, Residency, Chats, Security, Promos, Referrals. NOT translated on purpose: Admin (owner reads English), proper names, sample chat messages. Avoid `${n} day${s}` style plurals (one {} per word) — write separate strings.
- To cover a screen: `TS_JS=/path/to/typescript-v5or6 node app/scripts/extract-i18n.mjs <files>` → translate the new English lines into fr/tr/sw/ar → add to the JSON files (same {} count). Nigeria = English (owner's rule).

## Owner's rules (always follow)
1. **Ask before adding features nobody requested.** Offer them as a multi-select question and build only what is picked.
2. **Nigeria = English only.** Pidgin, Yoruba and Hausa were removed on purpose; do not re-add them. App languages: en, tr, fr, sw, ar.
3. Real money only through the server wallet. Never move live money in client state. Turn on a 'Coming soon' feature for real money only when the owner asks, and only by giving it server endpoints and SQL functions. Remind them once that holding funds, FX and P2P are regulated (they've been told); don't nag.
4. **No spam or abuse anywhere.** Every posting or action goes through `allow()` (daily limits + duplicate check), moderation (`lib/moderation.ts`) and tier gates.
5. **Money actions need a double confirmation.** Use `components/Confirm.tsx` (HoldButton, ConfirmSheet, CrossCheck). Never let a single tap move money.
6. **Explore first, verify to act.** Unverified users can browse everything, and each action shows which tier unlocks it (`lib/access.ts`).
7. **KYC:** deposits are allowed without KYC, within limits. Withdrawals need KYC.
8. Pop-ups must not nag. For example, the Flash pop-up shows once per visit, and dismissing it turns it off for good.
9. Every screen must fit all phone and tablet sizes (tested at 7 viewports).
10. The owner speaks through voice dictation, so names get mangled. "Greene" or "Guinea" means **Girne**.

## Key business numbers (`app/src/config.ts`)
- Girne⇄Lefkoşa tickets: operators VirgoBus (every 20 min) and Girneliler Seyahat (every 30 min; name confirmed by the owner). Fares: single ₺250, return ₺450.
- Ride Saver discount: −₺12 single, −₺14 return. Limits: 2 discounted tickets per month, opt-in, automatic selection. To qualify, a user needs a verified phone, KYC and one wallet top-up.
- Airport: KIBHAS shuttle only; the airport ride-pool was removed on purpose. LIVE: KIBHAS is booked and paid on kibhas.org, shown in an in-app frame (`components/KibhasBooking.tsx`) with an open-in-browser fallback. Luda doesn't sell or charge KIBHAS tickets; the owner sells only Girne⇄Lefkoşa. Don't scrape or automate KIBHAS's site.
- P2P fee: 0.5%. Ad limits: a member gets 1 ad up to ₺5,000; a Verified Exchanger gets 5 ads up to ₺50,000 and pays a ₺2,000 bond.
- Referral reward: ₺50. Daily limits for each action type are in `DAILY_LIMITS`.

## Open questions for the owner
- Does "they give me 5" mean a ₺5 commission per ticket?
- Business registration is in progress (the owner says live keys are available). Have VirgoBus, Girneliler Seyahat and KIBHAS agreed to accept Luda tickets, and how are they paid?
- Next steps: move the 'Coming soon' features onto the real wallet (owner picks the order); Ride Saver on real-money tickets (needs server-side counting); KYC for non-Nigerian students (Dojah/Smile ID country support); the welcome tour still mentions demo features; reconciliation and admin dashboard. Also: how the bus companies get paid their TL share.

## Stack
React 19, Vite 8, TypeScript and Tailwind v4 (`@tailwindcss/vite`; custom classes use `@utility`, not `@apply`; variants are `tab:` and `desk:`). Also used: framer-motion, lucide-react, react-router-dom 7, qrcode.react, and tesseract.js 7 (on-device OCR).

All code lives in `app/`:
- `src/lib/store.tsx`: a single React-context store, persisted to localStorage key `luda.v1`. Add migrations in `load()` when the shape changes. Its helpers:
  - `set`, `t` (i18n)
  - `reward(xp, {quest, badge, title})`
  - `addTx` (also writes to the inbox), `notify(emoji, title, to)` (inbox + browser push)
  - `checkPin`, `gate(tier, what)`, `allow(kind, text?)`, `toast`
- `src/lib/*`: domain logic, one file per area (housing, jobs, uni, ocr, kyc, exchanger, disputes, saver, tickets, growth, promos…).
- `src/components/*`: shared UI. Key files:
  - `ui.tsx`: Header, Sheet, PinPad, Toasts…
  - `Confirm.tsx`, `Verify.tsx`, `Kyc.tsx`, `PostGate.tsx`
  - `Handover.tsx`: couriers and delegates for cash handovers
- `src/screens/*`: one file per route. Routes and global hooks live in `src/App.tsx`.
- Security:
  - The PIN is a salted SHA-256 hash.
  - P2P handshake codes are 30-second HMAC TOTP-style codes (`lib/crypto.ts`).
  - Text is checked by the profanity and scam filter in `lib/moderation.ts`.

## Live money (server wallet)
- `supabase/migrations/`: `*_payments.sql` (payments and payment_events) and `*_wallet.sql`:
  - Tables: profiles, wallets (NGN/TRY, `balance_minor >= 0`), ledger (unique user/currency/kind/ref), tickets, withdrawals.
  - SQL functions: `luda_post` (atomic, idempotent, sorted locks, frozen accounts can't be debited), `luda_deposit_paid`, `luda_buy_ticket`, `luda_withdraw`, `luda_withdraw_settle`, `luda_spent`. Execute is revoked from anon and authenticated.
- Edge Functions:
  - `api` (all app calls, routed by the last path segment; logic in `functions/_shared/handlers.ts`)
  - `pay-webhook` (Paystack charge and transfer events, Flutterwave charges; signature checked)
  - Both are deployed `--no-verify-jwt`; `api` checks the user token itself via Supabase Auth `/user`.
- API routes:
  - **Public:** config, username, signup (reserves the username), login (email or username), refresh, recover, password.
  - **Signed in:** me, pin (PBKDF2, locks for 15 min after 5 wrong tries), rate, deposit plus `GET deposit?ref`, convert (with `expectMinor` quote guard), ticket, user, send (KYC), kyc (Dojah), banks, resolve, withdraw (KYC; account name must match the KYC legal name), `GET withdrawal?ref`.
- Shared server modules:
  - `money.ts`: LIMITS, fees, FX; minor units everywhere.
  - `pricing.ts`: ticket prices; keep in sync with `app/src/config.ts`.
  - `payouts.ts`: Paystack Transfers. Flutterwave payouts are not used because they need IP whitelisting.
  - `kyc.ts`: Dojah lookup and name/DOB match.
  - `auth.ts`: GoTrue REST and the PIN hash.
- App:
  - `lib/live.ts`: LIVE flag, session, `api()` with auto-refresh, `money()` formatting.
  - `lib/liveStore.tsx`: LiveProvider/useLive. Mirrors KYC and frozen state into local state and syncs server tickets.
  - `screens/LiveWallet.tsx`.
  - `components/LiveMoney.tsx`: ReviewAndPin (hold, then server PIN), LiveKyc, Deposit/Withdraw/Convert/Send sheets.
  - `components/LiveTicketPay.tsx`, `screens/PayReturn.tsx` (top-up return).
  - Auth, Onboarding (server PIN; on a new phone the user re-enters the existing PIN) and Security (PIN change) have LIVE branches. In LIVE, `tierOf` treats a signed-in account as tier 1 (no SMS provider yet).
- Tests: `cd supabase && npm ci && npm test` runs 40 groups (api.test.ts + features.test.ts) on real Postgres (PGlite) with fake Supabase Auth, Paystack, Flutterwave and Dojah (`tests/harness.ts`). The CI deploy runs them first. For a browser E2E, run a local server with the harness: the same handlers behind `http.createServer`, with `VITE_PAY_API=http://localhost:4300`.
- Setup for the owner: `docs/GO_LIVE.md` (browser-only). Deploys run through the GitHub Action `.github/workflows/deploy-payments.yml` (repo secrets: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD).
- Owner's live setup is DONE: Supabase project, GitHub secrets, payment server deployed (Actions run #4 green), Paystack/Flutterwave keys in Supabase, app on Cloudflare Pages at https://luda-ct6.pages.dev (builds from this branch). Pushing to the branch redeploys both. Dojah not set up yet (kyc:false).
- Server secrets: APP_URL, PAYSTACK_SECRET_KEY, FLW_SECRET_KEY, FLW_SECRET_HASH, DOJAH_APP_ID, DOJAH_SECRET_KEY, FX_FALLBACK_RATE, SELL_OPERATORS. Optional: PAYSTACK_CUSTOMER_PAYS_FEE (default true: the owner set Paystack to 'customer pays', so Luda adds no fee for Paystack), FLW_CUSTOMER_PAYS_FEE (default false), DIDIT_API_KEY, DIDIT_WORKFLOW_ID (owner's live 'Free KYC' = e573a01e-9ba1-480b-b2e6-499f237077a0, app 'My Application' 39269115-…), DIDIT_WEBHOOK_SECRET, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID, FOREIGN_CURRENCIES, FOREIGN_FEE_PCT, FX_TRY_RATES, FX_MARGIN, FX_FIXED_RATE, WITHDRAW_FEE, DEPOSIT_FEE_*, LUDA_SERVICE_KEY, LUDA_ANON_KEY.
- Security (2026-11-01): fingerprint/Face ID = WebAuthn passkeys (`functions/_shared/webauthn.ts`, table `passkeys`, routes `GET bio`/`POST bio`/`bio-remove`; money routes accept `bio` instead of `pin`; app `lib/bio.ts`, Security toggle, LockScreen). Google sign-in = Supabase OAuth (`googleSignIn`/`takeOAuthReturn` in live.ts, `useOAuthReturn` in Auth.tsx; config.google from GoTrue /settings). Uniqueness: email (unique index), username, phone (unique, Twilio Verify routes `phone-start`/`phone-check`, config.sms). `GET available` for the live sign-up check. Rate limits via `luda_hit` (login, signup, recover, available, SMS). 24h money hold after password reset (`money_hold_until`). Server freeze (`POST freeze`, `frozen_by` user|admin), `POST change-password`. `app/public/_headers` adds security headers. In LIVE, Security hides demo 2-step and the demo withdrawal limit; account deletion goes through support.
- Reliability (after the owner's first real ₦1,000 got stuck as 'mismatch' because Paystack added its fee on top and no webhook was set): verification uses Paystack `requested_amount` and accepts paid >= expected; `luda_deposit_paid` credits from pending|failed|mismatch after re-verification; GET me self-heals pending+mismatch top-ups (48h) and stuck 'processing' withdrawals; rejected webhooks are logged as `webhook_bad_signature`; the app lists every top-up and withdrawal with its status and reference. `.github/workflows/diagnose.yml` = read-only live check (Supabase Management API; runs on dispatch or when the file changes) with PROBLEMS and HEALTH sections. As of 15:05 on 2026-11-01 the live check showed: Paystack, Flutterwave, payouts and Didit on; Google and SMS off; secrets APP_URL, PAYSTACK/FLW keys, FLW_SECRET_HASH, DIDIT_*, FX_FALLBACK_RATE, SELL_OPERATORS set; no webhooks received yet (no payments since setup). Paystack fee = customer pays (owner's choice).
- Didit KYC: `kyc.ts` diditStart/diditDecision (v3 API, `x-api-key`), routes `POST kyc-start` / `GET kyc-status`, `kycSync` applies the decision from Didit's API (name must overlap the Luda name; `kyc_doc_hash` unique = one document per account; profile kyc_status adds 'pending'); `me` and the Didit webhook (X-Signature HMAC, routed in pay-webhook) re-sync. App: LiveKyc → DiditKyc (NIN fallback), `/kyc/return` = KycReturn. The demo useKycReview never runs in LIVE. A Didit MCP server may be connected (owner's org 'luda'); use the Sandbox app for experiments.
- Owner admin (live): `profiles.is_admin` or the `ADMIN_EMAILS` secret; routes admin-overview (SQL `luda_admin_overview`), admin-users, admin-user, admin-deposits, admin-withdrawals, admin-recheck, admin-action (freeze, unfreeze, kyc-reset, kyc-approve, adjust [reason required, no self-adjust, ledger kind 'adjustment'], ticket-refund via `luda_refund_ticket`); every action needs the admin's PIN/bio and is logged `admin_*`. Non-admins get 404. App: `screens/LiveAdmin.tsx` at /admin; the Profile admin card shows only for server-confirmed admins (demo toggle hidden in LIVE).
- Support cases/appeals (live): tables `cases` and `case_messages`, private storage bucket `case-files` (created by migration if the storage schema exists; `storage.ts` uploads with the service key; signed URLs valid 10 min). User routes case-create (max 3 open, 5/day, ≤4 files ≤2 MB: jpg/png/webp/pdf), cases, case-reply (re-opens). Admin routes admin-cases, admin-case, admin-case-reply; admin-action kyc-approve (with docType/docNumber/country/dob → doc hash, duplicate-safe) and kyc-reject (reason) post into the case when caseId is given. App: `components/LiveSupport.tsx` (CasesHub pop-up with My cases / New appeal tabs and threads, AppealsCard on Help, floating HelpFab, NewCaseSheet/NewCaseForm, Thread, Attachments with client-side compression); Help shows AppealsCard + HelpFab in LIVE (demo WhatsApp/email placeholders hidden); entry points in DiditKyc, KycReturn and wallet transaction details; LiveAdmin Cases tab + AdminCaseSheet with the manual ID panel.
- Mobile feel (owner request): the page has no pull-to-refresh (`html { overscroll-behavior-y: none }`); text selection and tap highlight are off globally (inputs, textareas and `.selectable` stay selectable; use `.selectable` for references users may copy). Sheet titles and Close are sticky while the sheet scrolls.
- Receipts (v1.4.0): `lib/receipt.ts` draws the receipt on a canvas (light ticket card, round Luda rubber stamp PAID/PENDING/REFUNDED/VOID, 'Authorised by Luda Payments' signature). Image (PNG) or PDF (`receiptPdf`, a hand-built one-page PDF with the JPEG, no library). Share sends ONLY the file (owner: no extra text); if the phone can't share files it downloads. No 'Paid with Paystack' row anywhere (owner's request).
- Bank picker: `components/BankBadge.tsx` brand-colour monograms (no third-party logo hosts), popular student banks first.
- In LIVE, DemoNote renders nothing and the Ride Saver promo card is hidden.
- Payout routes (2026-11-01, owner asked for Flutterwave withdrawals and a ₦300 minimum): `payOut` in handlers.ts tries `PAYOUT_PROVIDERS` in order (default paystack,flutterwave); a definite refusal (`PayoutRefused`, any provider) moves to the next, an unknown outcome stays processing; all refused = refund. `withdrawals.provider` records the route; settle/webhook check that provider. Bank list + name lookup stay on Paystack; `matchFlwBank` maps Paystack bank codes to Flutterwave's (3-digit CBN codes shared; fintech/MFB codes matched by name, e.g. Kuda 50211→090267). Flutterwave needs 'Transfers via API' + IP whitelisting off/allowed (unconfirmed for the owner's account). LIMITS.minWithdraw = ₦300 (app `MIN_WITHDRAW` in LiveMoney.tsx).
- Payout refusals: `payouts.ts` throws `PayoutRefused` (was PaystackRefused) on Paystack 4xx/status:false. The withdraw route then settles failed immediately (refund incl. fee) and returns a friendly `message`; 5xx/network stays processing. `settleWithdrawal` refunds a processing withdrawal with no transfer_code that Paystack doesn't know after 5 min. Owner's Paystack is a STARTER business (2026-11-01: 'You cannot initiate third party payouts as a starter business'), so automatic payouts need Paystack's Registered Business upgrade (CAC). Flutterwave webhooks hadn't arrived as of 17:28 (the 17:10 top-up was credited by self-heal).
- Wallet features (2026-11-01, owner picked all four + assisted bill pay): migration `*_wallet_features.sql`. ESCROW (`escrows`, `luda_hold`/`luda_settle`: payee gets amount−fee, 'luda' keeps it for a bill Luda paid, or payer refunded; ledger kinds `<kind>_pay/_refund/_earn`). Pots (`pots`, `luda_pot_create/move/close`, kinds pot_in/pot_out, optional lock). Bills (`bills`, `luda_bill_create/settle`; TRY only, fee BILL_FEE default ₺10; the team pays on the official site and uploads a receipt via admin-bill, or refunds with a reason). Marketplace (`listings`, `luda_market_create/remove/buy/finish`; sellers need KYC; fee MARKET_FEE_PCT default 2% from the seller; buyer confirms `market-received`, seller can `market-cancel` = refund). Flash (`flash_jobs`, `luda_flash_post/take/drop/finish`; reward held when posted; helpers need KYC; FLASH_FEE_PCT default 5% from the helper). `luda_auto_release` pays sellers after 7 days / helpers after 3 days unless a case with reference = item id is open (runs from GET me/market/flash, max every 10 min). Reads are SQL functions returning jsonb (`luda_features_mine`, `luda_market_list`, `luda_flash_list`, `luda_admin_bills`, `luda_admin_escrows`) called through `db.fn(name, args)`. Server text moderation: `functions/_shared/moderation.ts` (same rules as app `lib/moderation.ts` + 'pay outside Luda'). Routes: features, pot-create/move/close, bill-create, market, market-item, market-list/remove/buy/received/cancel, flash, flash-post/take/drop/done/cancel, admin-bills, admin-bill, admin-escrows, admin-escrow. App: `screens/LiveBills|LiveSavings|LiveMarket|LiveFlash.tsx`, `components/LiveKit.tsx`, `LiveBillCard.tsx`; Home Flash bubbles/pop-up use real jobs in LIVE. Admin (`LiveAdmin.tsx`, redesigned 'Luda HQ'): Home to-do, Bills (pre-filled amount + number with copy buttons, 'Find site', receipt upload, refund reasons), Held money (decide disputes), Cases, Users, Top-ups, Payouts. Receipt PNG redesigned (light ticket card). Tests: `tests/features.test.ts`.
- Fees (owner chose 'Balanced', 2026-11-03; all in `money.ts`, env-overridable): top-up = provider fee only; send = free; NGN⇄TRY 1.5% (FX_MARGIN); withdrawal ₦100 (WITHDRAW_FEE); bills ₺10 ≤ ₺1,000 else ₺20 (BILL_FEE, BILL_FEE_HIGH, BILL_FEE_STEP; `billFee`); Market 2%; Flash 5%. `GET config` returns them; the app's Fees sheet (`components/LiveFees.tsx`, Wallet → 💳 Fees) and withdraw sheet read them from the server, never hardcoded.
- Bill pay v2 (migration `*_bill_details.sql`): `bills.details` jsonb + `eta_at`. Per-provider fields in app `BILL_FIELDS` (data.ts): KIB-TEK meter type/name/district/month, water municipality, LPG address/cylinder, mobile kind/package, internet ISP, rent landlord/IBAN (server checks TR+24 digits)/month. The user must tick 'details are correct' (`confirmed: true` required by the server). ETA (`billEta`): +2h inside 09:00–19:00 Cyprus time, else 11:00 next morning; BillCard shows Received→Paying→Receipt + 'Expected by'. Admin BillPaySheet shows every detail with copy buttons and the promised time.
- Community on the server (v1.5.0, migration `*_community.sql`; tests `tests/community.test.ts`). Owner chose: remove sample data in LIVE, groups need KYC, banners for bus/bills/invite+savings.
  - Staff roles BY EMAIL (owner = profiles.is_admin / ADMIN_EMAILS = everything). Table `staff(email, roles jsonb)`; areas overview, users, kyc, money, bills, disputes, cases, content, banners; levels view < edit ('act') < full. `staff(req, env, d, area, level)` guards every admin route (non-staff 404, wrong role 403); `admin()` = owner only (team, balance adjust). admin-action needs per action: freeze/unfreeze users:full, kyc approve/reject kyc:edit, kyc-reset kyc:full, ticket-refund money:full, adjust owner. Bill refund needs bills:full; dispute decisions disputes:full. Overview hides money totals without money:view. `GET me` returns `profile.staff {owner, perms}`; Luda HQ shows only allowed tabs (+ Content, Banners, Team). Routes admin-staff, admin-staff-set/remove (PIN).
  - Banners: table `banners` (title, body, cta, internal link only, emoji, theme mint|sunset|ocean|grape|gold|night, start/end, active, sort). `GET banners` (public), admin-banners, admin-banner-save (banners:edit), admin-banner-delete (banners:full). Home `components/Banners.tsx` HomeBanners: swipe carousel, auto-rotates 5.5s, ✕ hides a banner for good (localStorage `luda.bannersHidden`); no server banners → `DEFAULT_BANNERS` (bus, bills, invite, savings). Placed after the balance card.
  - Posts: table `board_posts` (kind housing|job|event|news|promo|place, data jsonb, photos, status live|review|removed, official, reports, expires) + `board_reports`. Rules in `BOARD_RULES` (handlers.ts) and shown in the app (`lib/board.ts` rulesText, RulesCard): KYC required for all; news also needs a 7-day-old account and ALWAYS goes to review; places are staff-only; max live/per-day per kind; expiry days; moderation on every text field; 3 distinct reports → hidden for review. Staff with content:edit post as 'Luda Official' (live, pinned). Routes board, board-post, board-remove, board-report, admin-board, admin-board-review. App: `screens/LiveBoard.tsx` (routes /housing /jobs /community /news /promos /places in LIVE), `components/LiveBoardKit.tsx` (PostCard, PostSheet with WhatsApp contact + report, PostForm, RulesCard, BoardStrip for Home news/deals). Demo screens keep sample data.
  - Groups: `chat_groups`, `chat_members` (last_read for unread), `chat_messages`. Create needs KYC, max 3 owned, 2/day; anyone signed in joins; members-only read/write; 5 msgs/10 s, 400/day; owner/staff delete messages; content:full removes groups. App `screens/LiveChats.tsx` + `LiveChatRoom.tsx` (polls every 4 s).
- Guided tour (v1.5.0): `components/GuidedTour.tsx`, mounted in App. Offered once on Home after sign-in (Skip = `s.toured`, never asked again); spotlight steps on `data-tour` targets (balance, actions, nav/wallet, nav/exchange, nav/chats, nav/more, search, inbox); replay via Profile 'Take the app tour' (`luda:tour` event). Replaced the old WelcomeTour sheet (it listed demo features).
- Several accounts on one phone (v1.5.1, owner's bug report: password 'stopped working' after switching): `lib/accounts.ts` `switchAccount` is used by sign-in, sign-up and Google return. It parks the previous account's local state in `luda.acct.<username>` (+ its fingerprint key `luda.bio.<username>`) and restores the returning account's state (no onboarding again); a new account gets a fresh set-up (own PIN). `knownAccounts` (max 4, usernames + names only, never passwords) shows as tap-to-choose chips on Sign in; a wrong password says which account was used (the old screen pre-filled the LAST account's username, so the other account's password looked 'wrong'). Live mode has no client-side 5-try lock (server limits per account/network).
- Visibility (v1.5.1): Flash board and Home bubbles show ALL cities by default, the user's city first (city filter hid jobs from people whose phone city differed); the Jobs page also lists open Flash quick jobs. Market was already all-cities; posts and groups have no city filter.
- Never ask the owner to paste secret keys into chat.
- Demo/live mix-up fix (2026-11-02, owner saw demo screens on some opens): `vite.config.ts` fails a real-hosting build that lacks VITE_PAY_API (so Cloudflare never publishes a demo build over live); `_headers` sets `Cache-Control: no-cache` for pages and immutable for `/assets/*`; Profile shows '🟢 Live app' / '🧪 Demo app' + `__BUILD__` (build time + commit, declared in `src/build.d.ts`).
- `vite.config.ts` uses base `/` for real hosting (deep links work) and `./` only for the embed build.

## Build, test, publish
```bash
cd app && npm install
npm run dev            # local dev
npm run build          # -> dist (normal hosting). REFUSES to build without VITE_PAY_API (use VITE_DEMO=1 for a demo build)
npm run build:embed    # -> dist-embed (memory router, base './') for the Claude artifact demo
npm run lint
```
- OCR assets are copied into `public/ocr` (gitignored) by `scripts/copy-ocr.mjs`. The language data ships as a base64 `.js` file with `worker-wrap.js`, because the artifact host refuses `.gz` and `.bin` files.
- Testing: write Playwright scripts against `npx vite preview --port 41xx` and take screenshots. Chromium is preinstalled; don't run `playwright install`. Check for page errors and for horizontal overflow at several viewports.
- Live demo artifact: slug `e75b8525-4af5-4df3-91fa-54777b134bf9` (https://claude.ai/artifact/Va19moXQu5rYfKcUq4yEgY). To republish:
  1. Use `publish_files` in patch mode with `index.html` and the new `assets/*` files from `dist-embed`.
  2. List the old asset files in `remove`.
  3. Pass `base_version` from `get_artifact`.
- The artifact CSP blocks external fetches, so live FX rates and OSM places only work when the app is self-hosted. Fallback data is built in.

## Git
- Work on branch `claude/cyprus-expat-app-mlnvuc`. Push with `git push -u origin claude/cyprus-expat-app-mlnvuc`.
- Don't open a PR unless the owner asks.
