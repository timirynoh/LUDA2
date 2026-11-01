# Luda — North Cyprus, levelled up

An all-in-one, gamified app for the African community in North Cyprus (TRNC). It covers the wallet, currency exchange, safe in-person swaps, bills, residency paperwork and city life, in five languages.

![Onboarding, home, deposit](docs/screens-1.png)
![Convert, verify, SafeSwap P2P](docs/screens-2.png)
![Escrow release, bills, nearby](docs/screens-3.png)
![Residency, rewards, Arabic RTL](docs/screens-4.png)

## Run it

```bash
cd app
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in app/dist
```

It is a mobile-first PWA: open it on a phone and "Add to Home Screen". On a desktop it renders as a phone frame.

## Going live

**Phase 1 (built):** real payments for bus tickets and KIBHAS airport seats with **Paystack** and **Flutterwave**. A Supabase server (`supabase/`) sets the price, verifies every payment with the provider, and checks webhook signatures. Card numbers are typed only on the provider's page. Setup steps: [`docs/GO_LIVE.md`](docs/GO_LIVE.md). Without `VITE_PAY_API` the app runs as the full demo.

Server tests: `node --test supabase/functions/_shared/payments.test.ts`

## What's inside

| Area | What it does | Status |
|---|---|---|
| **Onboarding** | Language → home country → city → name → 4-digit PIN (salted SHA-256, never stored in plain text) | ✅ |
| **Wallet** | Multi-currency balances (TRY, NGN, USD, EUR, home currency). Deposits by card, TRNC bank, home-country rails or cash agent. Withdrawals are PIN-protected. Fees shown before you confirm. | ✅ demo ledger |
| **Convert** | Live FX from open.er-api.com, with indicative fallback rates. Naira, Cedi, CFA, Congolese franc, Shilling and more ⇄ Lira. 0.8% spread shown up front. | ✅ live rates |
| **SafeSwap (P2P in person)** | KYC-gated. Your money is locked in escrow, you meet at public Safe Spots (university gates, busy streets), a **rotating TOTP-style QR/6-digit handshake** (HMAC-SHA256, 30 s window) proves you have the right person, then you count the cash and release with your PIN. Cancel/refund, dispute (freezes escrow) and SOS 155 buttons. | ✅ protocol simulated |
| **Courier & pickup handover** | In every SafeSwap: meet in person, **courier brings the cash** (trader assigns a registered driver: name, photo, vehicle, plate, ETA, call/share-trip/SOS; you verify them with a 6-digit code that rotates every 30 s, bound to the trade) or **someone collects for me** (one-time pickup code valid 2 h, sent by WhatsApp, trader must check it, your person confirms receipt). Escrow is only ever paid to the verified trader, never to a courier | ✅ demo courier |
| **Bills** | KIB-TEK electricity, municipality water (per city), LPG cylinder, Turkcell / Telsim top-up, home internet, rent. Saved accounts and 1% cashback in Luda Points. | ✅ mock biller |
| **Around me** | Live city directory from **OpenStreetMap (Overpass API)**: food, *African taste*, groceries, pharmacies, clinics, banks/ATMs/exchange, hair & beauty, worship. One-tap Call / WhatsApp / Directions. | ✅ live data |
| **Residency** | Opens the official portal in an in-app secure browser (Luda never sees the password), with a document checklist, permit-expiry countdown and step-by-step guide | ✅ |
| **Housing & Roommates** | Listings per city, filters, verified landlords, reviews, viewings, roommate matching, report taken/fake | ✅ sample data |
| **Jobs** | Verified employers, permit-support flag, apply & track, post a job | ✅ sample data |
| **Community** | Church & mosque services, culture, sports, career and help events; RSVP; add to calendar | ✅ sample data |
| **University hub** | Pick your school → only its deadlines & fees; pay tuition from wallet; **timetable screenshot reader that runs on the phone** (grids with/without time column, times inside cells, lists & cards, AM/PM, dark mode, Turkish days, course names without codes, OCR look-alike fixes) (tesseract.js, image never uploaded) with review/edit; reminders only if the user turns them on; calendar export | ✅ OCR real, dates sample |
| **Transport** | Taxi fare estimate and share-my-trip safety (tickets above) | ✅ estimates |
| **Posting safety** | Every poster: phone OTP + legal declaration (ID optional = ✓ badge). Houses: a resident's KIB-TEK/water bill, deed or agent licence → live instantly; photos only → admin approval. Jobs: business registration or "Individual". All posts reviewed before going live, hidden after 7 days unless confirmed available, user reports, 1 active post for new posters | ✅ flow simulated |
| **Admin console** | Owner reviews queue with red-flag checks, approves/rejects with reasons, posts as "Luda Official" | ✅ |
| **Personalisation** | Night / Day / Auto theme; choose and order home shortcuts (max 8) and home sections | ✅ |
| **Group chats** | Discover / join / create groups, chat bubbles, replies, reactions, typing indicator, unread badges. Safety: on-device bad-word filter (EN, TR, FR, SW, AR + Pidgin, catches disguised spellings), scam-message blocker, 3 strikes = 10-min mute, flood control, report/block, group rules on join | ✅ demo members |
| **Quick job post** | Type one line ("1 worker needed in Girne for construction"), app detects workers/area/type/pay, goes live instantly after phone check + filter | ✅ |
| **Bus & shuttle tickets** | Girne ⇄ Lefkoşa (VirgoBus + Girneliler Seyahat), other routes, KIBHAS airport shuttle. **Ride Saver** members (opt-in; automatically selected if phone + ID verified, wallet topped up once, good standing) get **2 discounted tickets per month** (− ₺12 single / − ₺14 return, self + 1 companion); after that tickets are normal price, payable from the Lira or Naira wallet or by card; named tickets with a live QR that changes every 30 s (screenshots can't be resold), no refunds 30 min before departure, >3 refunds/month pauses the discount (rules in `config.ts` → `SAVER`); pay with wallet (PIN) or card; QR e-ticket; refund. Operators & fares in `config.ts` | ✅ payment simulated |
| **Flash help** | Post a quick need ("washing machine broken") → animated bubbles on Home + a pop-up at most once per visit (closing it turns pop-ups off; switch in Profile) → fixers send offers → pay via **escrow** (released only when you confirm the job is done) or cash with a clear "not protected" warning → rating. Anyone can also be the fixer and get paid through escrow | ✅ demo offers |
| **Brand & first launch** | Original Luda logo (an "L" whose base is a Mediterranean wave + gold sun), app icons, animated splash, landing slides, sign up (name, username, email, password strength), sign in with email **or** username, forgot password, "keep me signed in", quick PIN unlock on reopen | ✅ local demo accounts |
| **Verification tiers** | 👀 Explorer browses everything; 📱 phone unlocks posting/chatting/tickets; 🛡️ ID + selfie unlocks money. Locked actions open an "Unlock" sheet with inline verification; home shows progress & what's left; first-run welcome tour | ✅ |
| **KYC** | Real-world style KYC: choose passport / TRNC residence permit / national ID → photo front & back → liveness selfie → confirm legal name, date of birth (18+), nationality → under review → approved (demo auto-approves in ~6 s). **Without KYC you can top up (₺5,000/day, ₺10,000 max balance) but cannot withdraw**; KYC unlocks withdrawals, sending home, swaps, payments and higher limits (`lib/kyc.ts`) | ✅ demo review |
| **Double-check on every money action** | SafeSwap lock/release/cancel, conversions, exchanger application, ads, Flash & marketplace releases, Send money and pickup confirmations open a **check screen**: summary of what will happen, a checklist that must all be ticked, the amount typed for irreversible releases, then **press-and-hold (1.5 s)** to confirm (a tap does nothing) before the PIN. Permanent "always cross-check" warnings on exchange screens | ✅ |
| **Security Center** | Inactivity check ("Are you still there?" → PIN lock), lock after background, freeze wallet, 2-step sign-in, daily withdrawal limit, hide balances, change PIN/password, sign-in history, download / delete my data, security score | ✅ |
| **Anti-spam** | Daily caps per action (posts, groups, applications, offers, reports, tickets), duplicate-post blocking, chat flood control & repeat blocking, content filter everywhere (`config.ts` → `DAILY_LIMITS`) | ✅ |
| **UX polish** | Notifications inbox (every money movement + sign-ins), app-wide search, Help & Support (FAQ, WhatsApp/email, report a problem), Terms & Privacy, invite friends, offline banner, crash-safe screens, respects "reduce motion" | ✅ |
| **Exchange hub (in Chats)** | Chats tab has 💬 Chats and 💱 Exchange. Apply to become a **verified exchanger** (KYC + phone + refundable ₺2,000 deposit) → create ads (sell/buy ₺, rate within ±15% of market, min/max, cash in person or in-app with funds locked in escrow, payment methods, Safe Spot), pause/delete, close account to get deposit back | ✅ demo approval |
| **Trade chat & appeals** | Private chat (with photos) inside every SafeSwap trade and Flash job. **Appeal center** like Bybit: reason → description → up to 6 evidence photos → case with status steps (Submitted → Under review → Evidence → Resolved), support agent messages, funds frozen until resolved, refund on resolution; "My appeals" in Help & Profile | ✅ demo support desk |
| **Saved cards** | Add Visa/Mastercard/Troy (Luhn + expiry checks, 3-D Secure step), only last 4 digits kept, default card, remove; used for card top-ups and ticket payments ("save this card") | ✅ simulated |
| **Send money** | Free, instant Luda-to-Luda transfers by @username or QR (receive tab), note, PIN, daily limit, KYC required | ✅ demo directory |
| **Ratings & reviews** | Stars + tags + text after SafeSwap trades, Flash jobs and marketplace purchases; shown on profiles | ✅ |
| **Public profiles** | `/u/:name` for fixers, exchangers and sellers: rating, jobs/trades, reply time, KYC badges, skills, past jobs, reviews, Message / Send money / Report | ✅ demo people |
| **Rate alerts** | "Tell me when 1,000 NGN ≥ ₺30": checked every minute against live rates, notification + inbox | ✅ |
| **Savings pots** | Goals with emoji, target and deadline; add/take out from wallet; 25/50/75/100% milestones with XP | ✅ |
| **Marketplace** | Buy & sell student items (photos, condition, category, area), buy safely with escrow at a Safe Spot, chat with seller, release, review, appeal | ✅ demo listings |
| **Voice notes** | Tap-to-record (≤60 s) voice messages with waveform playback in group chats, trade, job and marketplace chats | ✅ needs mic permission |
| **Profile & completeness** | Profile photo (auto square-crop, shown on Home, Profile & lock screen), display name & bio, completeness meter (photo, bio, phone, KYC, account, security) with All-Star badge at 100% | ✅ |
| **Fits every device** | Phones full-width (tested 320 → 430 px: iPhone SE, 8, 15, 15 Pro Max, Galaxy), tablets get a wider layout with more columns (iPad), desktop shows a phone frame; iPhone notch/home-bar safe areas; no input zoom on iOS; automated overflow check on 20 screens × 7 devices | ✅ |
| **Invite & earn** | Referral code + WhatsApp invite; ₺50 for both when the friend completes KYC + first top-up; funnel tracking; enter-a-code for new users; anti-fraud caps (20/month, same phone/device/ID never counts twice) | ✅ demo friends |
| **Campus ambassadors** | Per-university programme, leaderboard, Bronze/Silver/Gold rewards from verified referrals | ✅ |
| **Luda Deals** | Merchant discounts near campus (food, barbers, groceries, taxi, phone repair), pay with Luda at the counter, savings tracker | ✅ sample merchants |
| **Welcome pack** | First-weeks checklist for new arrivals (SIM, community group, verify, residency, housing, uni, buses, emergency) with reward | ✅ |
| **Daily check-in spin** | Once-a-day prize wheel (XP, points, small cash), double prizes on 7-day streaks | ✅ |
| **News & alerts** | Pinned scam alerts, utilities, residency, university, transport, events; like/save/share; admin can publish announcements; preview on Home | ✅ sample stories |
| **Monthly challenges** | Personal goals (pay 3 bills, save ₺1,000, 2 SafeSwaps) with prizes + Country savings cup leaderboard | ✅ |
| **Notifications** | Phone/browser notifications with per-category settings (money, security, chats, classes, rates, deals, news); full background push needs the live server | ✅ in-app + browser |
| **Promo Spotter** | Students snap promo/free products in shops (photo required, promo & normal price → auto % off, shop, area, optional GPS, end date, category). +10 pts per post, +5 per "still there" confirmation, +2 for voting; feed sorted by biggest %, newest or nearest, free-only filter, save, directions; Home strip; top spotters; anti-spam (daily cap, duplicate check, filter, auto-expiry, hidden after repeated "gone/fake") | ✅ |
| **Gamification** | XP, 5 levels (Newcomer → Legend), daily streaks, 7 quests, 9 badges, redeemable Luda Points and a community leaderboard by country, plus XP toasts and confetti | ✅ |
| **Languages** | English (used for Nigeria & other English-speaking countries), Türkçe, Français, Kiswahili, العربية (RTL) | ✅ |

Everything is saved on the device (`localStorage`) so the demo is fully interactive with no backend. **No real money moves**, and every money screen says so.

## Code map

```
app/src
├── config.ts            portal URL, FX/Overpass endpoints, fees
├── lib/
│   ├── data.ts          countries, currencies, cities, Safe Spots, billers, levels, badges, quests
│   ├── i18n.ts          5 language packs
│   ├── store.tsx        app state, XP/badges/quests engine, toasts, PIN check
│   ├── crypto.ts        PIN hashing + rotating handshake codes (Web Crypto)
│   ├── fx.ts            live rates + formatting
│   └── places.ts        OpenStreetMap city directory
├── components/          Sheet, PinPad, Ring, Toasts, confetti, TxList…
└── screens/             Onboarding, Home, Wallet, Exchange, Bills, Nearby, Residency, Rewards, Profile, More
```

## Path to production

1. **Money (licensing first).** Holding customer funds needs a licensed partner: an e-money/payment institution or a TRNC bank, plus a Nigerian/Ghanaian payout partner for home-country rails. Replace the local ledger in `store.tsx` with a backend double-entry ledger (e.g. Postgres) behind an API.
2. **KYC.** Plug a provider (Smile ID is strong for African IDs; Onfido or Sumsub also work) into `Profile.tsx`.
3. **Escrow and SafeSwap.** Move escrow and handshake secrets to the server. The counterparty app scans the QR and the server verifies the code, then add ratings and dispute ops.
4. **Bills.** Integrate with KIB-TEK, the municipalities and the telcos through an aggregator or direct agreements. The current amounts are deterministic mocks.
5. **Residency portal.** `RESIDENCY_PORTAL_URL` is set to `https://permissions.gov.ct.tr/login` (TRNC permits portal); re-check before launch. Government sites often block embedding inside other web pages. In a native build (Capacitor), the in-app browser plugin opens it inside the app. The user always logs in with the government directly; credentials are never scraped or stored.
6. **Native apps.** Wrap with Capacitor for Play Store and App Store builds and push notifications (bill due, permit expiry, trade updates).
