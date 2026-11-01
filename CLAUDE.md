# Luda: project memory for Claude

Read this first in every session. It records the owner's rules, the architecture, and the open questions.
For the full feature list, see `README.md`. For history, see `git log` (the commit messages are detailed).

## What Luda is
Luda is an all-in-one, gamified, modern app for Africans (mostly students) living in **North Cyprus (TRNC)**. It covers:
- Money: wallet, FX (Naira etc. ⇄ TL), a P2P in-person exchange hub with appeals, and bills
- Admin: the residency portal (`https://permissions.gov.ct.tr/login`)
- Daily life: city directory, housing and roommates, jobs, community events (churches and mosques), a university hub (fees, deadlines, timetable OCR), and transport
- Social and growth: chats, Flash help requests, marketplace, promos, and referrals

**Live mode (owner's decision, 2026-11-01): a real-money wallet.** Paystack/Flutterwave are used ONLY to move money in (top-ups) and out (withdrawals, Paystack only). Everything else (bus/airport tickets, NGN⇄TRY conversion, sending to other users) is paid from the server wallet. The owner chose: NGN + TRY wallets, automatic KYC (Dojah NIN/BVN), sending between users, and users pay both fees. Live mode switches on only when `VITE_PAY_API` is set at build time; without it the app is the pure demo (and the Claude artifact stays demo). In live mode, Exchange (P2P), Bills, Flash, Savings and Market show "Coming soon" (`components/LiveSoon.tsx`) until they're moved onto the real wallet.

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
- Next steps: move the 'Coming soon' features onto the real wallet (owner picks the order); Ride Saver on real-money tickets (needs server-side counting); a real SMS phone check (e.g. Termii); KYC for non-Nigerian students (Dojah/Smile ID country support); the welcome tour still mentions demo features; reconciliation and admin dashboard. Also: how the bus companies get paid their TL share.

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
- Tests: `cd supabase && npm ci && npm test` runs 15 groups on real Postgres (PGlite) with fake Supabase Auth, Paystack, Flutterwave and Dojah (`tests/harness.ts`). The CI deploy runs them first. For a browser E2E, run a local server with the harness: the same handlers behind `http.createServer`, with `VITE_PAY_API=http://localhost:4300`.
- Setup for the owner: `docs/GO_LIVE.md` (browser-only). Deploys run through the GitHub Action `.github/workflows/deploy-payments.yml` (repo secrets: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD).
- Server secrets: APP_URL, PAYSTACK_SECRET_KEY, FLW_SECRET_KEY, FLW_SECRET_HASH, DOJAH_APP_ID, DOJAH_SECRET_KEY, FX_FALLBACK_RATE, SELL_OPERATORS. Optional: FX_MARGIN, FX_FIXED_RATE, WITHDRAW_FEE, DEPOSIT_FEE_*, LUDA_SERVICE_KEY, LUDA_ANON_KEY.
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
