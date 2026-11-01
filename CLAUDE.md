# Luda: project memory for Claude

Read this first in every session. It records the owner's rules, the architecture, and the open questions.
For the full feature list, see `README.md`. For history, see `git log` (the commit messages are detailed).

## What Luda is
Luda is an all-in-one, gamified, modern app for Africans (mostly students) living in **North Cyprus (TRNC)**. It covers:
- Money: wallet, FX (Naira etc. ⇄ TL), a P2P in-person exchange hub with appeals, and bills
- Admin: the residency portal (`https://permissions.gov.ct.tr/login`)
- Daily life: city directory, housing and roommates, jobs, community events (churches and mosques), a university hub (fees, deadlines, timetable OCR), and transport
- Social and growth: chats, Flash help requests, marketplace, promos, and referrals

**Live mode (owner's decision, 2026-11-01): a real-money wallet.** Paystack/Flutterwave are used ONLY to move money in (top-ups) and out (withdrawals, Paystack only). Everything else (bus/airport tickets, NGN⇄TRY conversion, sending to other users) is paid from the server wallet. The owner chose: NGN + TRY wallets; top-ups in USD/GHS/KES/UGX/ZMW/XAF via Flutterwave are converted into the TRY wallet (`FOREIGN` in money.ts, migration `*_foreign_topups.sql` adds `payments.credit_currency`); automatic KYC (Didit document + selfie for any nationality, primary; Dojah NIN/BVN optional for Nigerians), sending between users, and users pay both fees. Live mode switches on only when `VITE_PAY_API` is set at build time; without it the app is the pure demo (and the Claude artifact stays demo). In live mode, Exchange (P2P), Bills, Flash, Savings and Market show "Coming soon" (`components/LiveSoon.tsx`) until they're moved onto the real wallet.

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
- Airport: KIBHAS shuttle only. The airport ride-pool was removed on purpose.
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
- Tests: `cd supabase && npm ci && npm test` runs 32 groups on real Postgres (PGlite) with fake Supabase Auth, Paystack, Flutterwave and Dojah (`tests/harness.ts`). The CI deploy runs them first. For a browser E2E, run a local server with the harness: the same handlers behind `http.createServer`, with `VITE_PAY_API=http://localhost:4300`.
- Setup for the owner: `docs/GO_LIVE.md` (browser-only). Deploys run through the GitHub Action `.github/workflows/deploy-payments.yml` (repo secrets: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD).
- Owner's live setup is DONE: Supabase project, GitHub secrets, payment server deployed (Actions run #4 green), Paystack/Flutterwave keys in Supabase, app on Cloudflare Pages at https://luda-ct6.pages.dev (builds from this branch). Pushing to the branch redeploys both. Dojah not set up yet (kyc:false).
- Server secrets: APP_URL, PAYSTACK_SECRET_KEY, FLW_SECRET_KEY, FLW_SECRET_HASH, DOJAH_APP_ID, DOJAH_SECRET_KEY, FX_FALLBACK_RATE, SELL_OPERATORS. Optional: PAYSTACK_CUSTOMER_PAYS_FEE (default true: the owner set Paystack to 'customer pays', so Luda adds no fee for Paystack), FLW_CUSTOMER_PAYS_FEE (default false), DIDIT_API_KEY, DIDIT_WORKFLOW_ID (owner's live 'Free KYC' = e573a01e-9ba1-480b-b2e6-499f237077a0, app 'My Application' 39269115-…), DIDIT_WEBHOOK_SECRET, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID, FOREIGN_CURRENCIES, FOREIGN_FEE_PCT, FX_TRY_RATES, FX_MARGIN, FX_FIXED_RATE, WITHDRAW_FEE, DEPOSIT_FEE_*, LUDA_SERVICE_KEY, LUDA_ANON_KEY.
- Security (2026-11-01): fingerprint/Face ID = WebAuthn passkeys (`functions/_shared/webauthn.ts`, table `passkeys`, routes `GET bio`/`POST bio`/`bio-remove`; money routes accept `bio` instead of `pin`; app `lib/bio.ts`, Security toggle, LockScreen). Google sign-in = Supabase OAuth (`googleSignIn`/`takeOAuthReturn` in live.ts, `useOAuthReturn` in Auth.tsx; config.google from GoTrue /settings). Uniqueness: email (unique index), username, phone (unique, Twilio Verify routes `phone-start`/`phone-check`, config.sms). `GET available` for the live sign-up check. Rate limits via `luda_hit` (login, signup, recover, available, SMS). 24h money hold after password reset (`money_hold_until`). Server freeze (`POST freeze`, `frozen_by` user|admin), `POST change-password`. `app/public/_headers` adds security headers. In LIVE, Security hides demo 2-step and the demo withdrawal limit; account deletion goes through support.
- Reliability (after the owner's first real ₦1,000 got stuck as 'mismatch' because Paystack added its fee on top and no webhook was set): verification uses Paystack `requested_amount` and accepts paid >= expected; `luda_deposit_paid` credits from pending|failed|mismatch after re-verification; GET me self-heals pending+mismatch top-ups (48h) and stuck 'processing' withdrawals; rejected webhooks are logged as `webhook_bad_signature`; the app lists every top-up and withdrawal with its status and reference. `.github/workflows/diagnose.yml` = read-only live check (Supabase Management API; runs on dispatch or when the file changes) with PROBLEMS and HEALTH sections. As of 15:05 on 2026-11-01 the live check showed: Paystack, Flutterwave, payouts and Didit on; Google and SMS off; secrets APP_URL, PAYSTACK/FLW keys, FLW_SECRET_HASH, DIDIT_*, FX_FALLBACK_RATE, SELL_OPERATORS set; no webhooks received yet (no payments since setup). Paystack fee = customer pays (owner's choice).
- Didit KYC: `kyc.ts` diditStart/diditDecision (v3 API, `x-api-key`), routes `POST kyc-start` / `GET kyc-status`, `kycSync` applies the decision from Didit's API (name must overlap the Luda name; `kyc_doc_hash` unique = one document per account; profile kyc_status adds 'pending'); `me` and the Didit webhook (X-Signature HMAC, routed in pay-webhook) re-sync. App: LiveKyc → DiditKyc (NIN fallback), `/kyc/return` = KycReturn. The demo useKycReview never runs in LIVE. A Didit MCP server may be connected (owner's org 'luda'); use the Sandbox app for experiments.
- Owner admin (live): `profiles.is_admin` or the `ADMIN_EMAILS` secret; routes admin-overview (SQL `luda_admin_overview`), admin-users, admin-user, admin-deposits, admin-withdrawals, admin-recheck, admin-action (freeze, unfreeze, kyc-reset, kyc-approve, adjust [reason required, no self-adjust, ledger kind 'adjustment'], ticket-refund via `luda_refund_ticket`); every action needs the admin's PIN/bio and is logged `admin_*`. Non-admins get 404. App: `screens/LiveAdmin.tsx` at /admin; the Profile admin card shows only for server-confirmed admins (demo toggle hidden in LIVE).
- Support cases/appeals (live): tables `cases` and `case_messages`, private storage bucket `case-files` (created by migration if the storage schema exists; `storage.ts` uploads with the service key; signed URLs valid 10 min). User routes case-create (max 3 open, 5/day, ≤4 files ≤2 MB: jpg/png/webp/pdf), cases, case-reply (re-opens). Admin routes admin-cases, admin-case, admin-case-reply; admin-action kyc-approve (with docType/docNumber/country/dob → doc hash, duplicate-safe) and kyc-reject (reason) post into the case when caseId is given. App: `components/LiveSupport.tsx` (CasesHub pop-up with My cases / New appeal tabs and threads, AppealsCard on Help, floating HelpFab, NewCaseSheet/NewCaseForm, Thread, Attachments with client-side compression); Help shows AppealsCard + HelpFab in LIVE (demo WhatsApp/email placeholders hidden); entry points in DiditKyc, KycReturn and wallet transaction details; LiveAdmin Cases tab + AdminCaseSheet with the manual ID panel.
- Mobile feel (owner request): the page has no pull-to-refresh (`html { overscroll-behavior-y: none }`); text selection and tap highlight are off globally (inputs, textareas and `.selectable` stay selectable; use `.selectable` for references users may copy). Sheet titles and Close are sticky while the sheet scrolls.
- Never ask the owner to paste secret keys into chat.
- `vite.config.ts` uses base `/` for real hosting (deep links work) and `./` only for the embed build.

## Build, test, publish
```bash
cd app && npm install
npm run dev            # local dev
npm run build          # -> dist (normal hosting)
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
