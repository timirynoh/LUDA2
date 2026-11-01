# Luda: project memory for Claude

Read this first in every session. It records the owner's rules, the architecture, and the open questions.
For the full feature list, see `README.md`. For history, see `git log` (the commit messages are detailed).

## What Luda is
Luda is an all-in-one, gamified, modern app for Africans (mostly students) living in **North Cyprus (TRNC)**. It covers:
- Money: wallet, FX (Naira etc. ⇄ TL), a P2P in-person exchange hub with appeals, and bills
- Admin: the residency portal (`https://permissions.gov.ct.tr/login`)
- Daily life: city directory, housing and roommates, jobs, community events (churches and mosques), a university hub (fees, deadlines, timetable OCR), and transport
- Social and growth: chats, Flash help requests, marketplace, promos, and referrals

**Going live in phases (started 2026-11-01).** Phase 1 = real payments for bus/airport tickets via Paystack + Flutterwave (built; see `docs/GO_LIVE.md`). Everything else is still DEMO: wallet, sending money, P2P exchange, KYC and SMS. The live parts switch on only when `VITE_PAY_API` is set at build time; without it the app is the pure demo.

## Owner's rules (always follow)
1. **Ask before adding features nobody requested.** Offer them as a multi-select question and build only what is picked.
2. **Nigeria = English only.** Pidgin, Yoruba and Hausa were removed on purpose; do not re-add them. App languages: en, tr, fr, sw, ar.
3. Real money only where the owner has asked: Phase 1 ticket payments. Don't turn on wallet, transfers or exchange for real until the owner has legal advice (they need CBN licences). Don't add KYC or SMS providers unless asked.
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
- Is the owner's business registered with CAC yet? Paystack and Flutterwave need it for live keys.
- Next phases: **1b** real Luda accounts on Supabase (then Ride Saver can apply to online payments); **2** live keys after CAC; **3** wallet, transfers and exchange after legal advice. Also needed: how the bus companies get paid their TL share.

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

## Live payments (Phase 1)
- Server: `supabase/`. Migration `migrations/*_payments.sql` (tables `payments` and `payment_events`, RLS on, service-role only). Edge Functions `pay-init`, `pay-verify` and `pay-webhook`; the logic is in `functions/_shared/`:
  - `handlers.ts`: the request handlers
  - `providers.ts`: Paystack/Flutterwave API calls and webhook signatures
  - `pricing.ts`: server-side prices; keep in sync with `app/src/config.ts`
  - `fx.ts`: TL→NGN rate
  - `db.ts`: PostgREST access
- Rules: the server sets the price; the ticket is issued only after the server verifies with the provider (exact amount and currency, else `mismatch`); settled exactly once; webhooks are signature-checked; card data never touches Luda.
- App: `src/lib/payments.ts`, `components/OnlinePay.tsx` (two-step: quote, then confirm), `screens/PayReturn.tsx` (`/pay/return`). Online-paid tickets have `payRef` and are refunded through support.
- Tests: `node --test supabase/functions/_shared/payments.test.ts` (no install needed). Type-check with `app/node_modules/.bin/tsc -p supabase/functions/tsconfig.json`.
- Setup for the owner: `docs/GO_LIVE.md`.
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
