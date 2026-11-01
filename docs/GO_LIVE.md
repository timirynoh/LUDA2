# Going live: the real Luda wallet

**How money works in Luda (live):**
- **In:** students **top up** their Naira wallet with **Paystack or Flutterwave** (card, bank transfer, USSD). They pay the provider's fee on top, so the full amount lands in their wallet.
- **Inside Luda:** they **convert** Naira ⇄ Lira, **buy bus and airport tickets** from the wallet, and **send money** to other Luda users. No card is involved.
- **Out:** they **withdraw** Naira to **their own Nigerian bank account** through **Paystack**. Each withdrawal has a ₦50 fee. Withdrawals and sending need identity verification (NIN or BVN, checked automatically by **Dojah**).

The balances live on your server (Supabase), not on the phone. Every kobo is recorded in a ledger, and nothing can be spent twice.

Everything below is done **in your web browser**. It takes about an hour.

> 🔐 **Golden rule:** secret keys (`sk_live_…`, `FLWSECK-…`, Dojah secret, Supabase token and password) are pasted **only** into the settings pages named below. Never paste them into a chat (including with Claude), an email or WhatsApp. If one leaks, regenerate it in that dashboard immediately.

---

## Before real customers
- [ ] **Bus companies agree** to accept Luda QR tickets, and you've agreed how they're paid. Until then, set `SELL_OPERATORS` to only the companies that have said yes.
- [ ] **Paystack and Flutterwave are activated** for live payments, and **Paystack Transfers** are enabled for withdrawals.
- [ ] **Legal advice:** holding customers' money, exchanging Naira ⇄ Lira and person-to-person transfers are regulated activities. Start small (friends and early users) and get a fintech lawyer's view.
- [ ] **Terms, Privacy and Refund pages** on your site. Paystack and Flutterwave ask for them. Ask Claude to add them.

---

## Step 1: Supabase project (10 min)
1. <https://supabase.com> → **New project** → name `luda`, region **Central EU (Frankfurt)**. Save the **database password**.
2. Note the **Project URL** (`https://abcd1234.supabase.co`), the **project ref** (`abcd1234`), and the **anon / publishable key** (Project Settings → API).
3. Make an **access token** at <https://supabase.com/dashboard/account/tokens> (name it `github-deploy`).
4. **Authentication → URL Configuration:**
   - **Site URL:** your app address from step 6 (e.g. `https://luda.pages.dev`)
   - **Redirect URLs:** add `https://luda.pages.dev/reset`
5. **Authentication → Providers → Email:** keep **Confirm email** ON, so people must own their email.
6. **Authentication → Emails → SMTP settings:** Supabase's built-in email only sends a few messages an hour. Before launch, connect a free email service (e.g. Resend or Brevo) so sign-up and reset emails always arrive.

## Step 2: GitHub secrets for the automatic install (5 min)
GitHub → `timirynoh/luda2` → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | token from step 1.3 |
| `SUPABASE_PROJECT_REF` | e.g. `abcd1234` |
| `SUPABASE_DB_PASSWORD` | database password from step 1.1 |

## Step 3: Provider settings (15 min)
**Paystack (Live mode)**
- Settings → API Keys & Webhooks → copy the **Live Secret Key**.
- Settings → **Preferences → Transfers**: turn **off** "Confirm transfers with OTP". Otherwise automatic withdrawals wait for an OTP that nobody enters.
- **Withdrawals are paid from your Paystack balance.** Keep enough money there: either set settlement to keep funds in your Paystack balance, or top it up from your bank (Transfers → Fund balance). If it runs dry, withdrawals fail and **the student's money goes straight back into their Luda wallet** automatically.

**Flutterwave (Live mode)**
- Settings → API Keys → copy the **Live Secret Key**.
- Settings → Webhooks → make up a long random **Secret hash** and save it.
- Flutterwave is used for **top-ups only**. Its payouts need a fixed server address, which Supabase doesn't have. Money collected on Flutterwave settles to your bank; move what's needed into your Paystack balance for withdrawals.

**Dojah (identity checks)**
- Sign up at <https://dojah.io>, then **fund your Dojah wallet**. Each NIN or BVN lookup costs a small fee.
- Copy your **App ID** and **Secret Key** (production).

## Step 4: Put the keys into Supabase (10 min)
Supabase → **Edge Functions → Secrets** → add:

| Name | Value |
|---|---|
| `APP_URL` | your app address (step 6), e.g. `https://luda.pages.dev` |
| `PAYSTACK_SECRET_KEY` | `sk_live_…` |
| `FLW_SECRET_KEY` | `FLWSECK-…` |
| `FLW_SECRET_HASH` | the secret hash from Flutterwave |
| `DOJAH_APP_ID` | Dojah App ID |
| `DOJAH_SECRET_KEY` | Dojah Secret Key |
| `FX_FALLBACK_RATE` | today's Naira per 1 Lira, e.g. `42`. It's used only if the live rate service is down. |
| `SELL_OPERATORS` | companies that agreed, e.g. `virgo,girneliler,kibhas` |

Optional (defaults in brackets):

| Name | Meaning |
|---|---|
| `FX_MARGIN` | your margin on Naira ⇄ Lira and on Naira-paid tickets (`0.01` = 1%) |
| `FX_FIXED_RATE` | use your own fixed rate instead of the live one |
| `WITHDRAW_FEE` | Naira per withdrawal (`50`) |
| `DEPOSIT_FEE_PCT` / `DEPOSIT_FEE_FLAT` / `DEPOSIT_FEE_FLAT_WAIVE_BELOW` / `DEPOSIT_FEE_CAP` | top-up fee passed to the user (`1.5` / `100` / `2500` / `2000`, matching Paystack's local card fee) |

## Step 5: Install the server (2 min)
GitHub → **Actions** → **Deploy payment server** → **Run workflow**.
- It runs 15 groups of money tests, creates the database tables and installs two functions: `api` and `pay-webhook`.
- When it's green ✅, open **Print your webhook address** and copy the address (`https://abcd1234.supabase.co/functions/v1/pay-webhook`).

## Step 6: Put the app online (10 min)
1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → `timirynoh/luda2`.
2. Settings:
   - Branch: `claude/cyprus-expat-app-mlnvuc`
   - Root: `app`
   - Build: `npm run build`
   - Output: `dist`
3. Variables:
   - `NODE_VERSION` = `22`
   - `VITE_PAY_API` = `https://abcd1234.supabase.co/functions/v1`
   - `VITE_SUPABASE_ANON_KEY` = your anon or publishable key
4. Put the address Cloudflare gives you into `APP_URL` (step 4) and into Supabase's Site URL and Redirect URLs (step 1.4).

## Step 7: Webhooks (5 min)
Paste the webhook address from step 5 into:
- **Paystack** → Settings → API Keys & Webhooks → **Live Webhook URL**. This one address handles both top-ups and withdrawals.
- **Flutterwave** → Settings → Webhooks → **URL**, using the same secret hash as in step 4.

## Step 8: Your own first run (15 min, real money, small amounts)
1. Open your app address on your phone → **Create account**. Use your full name exactly as on your NIN, confirm the email, then sign in and set a PIN.
2. **Wallet → Top up ₦1,000 with Paystack.** You should come back to "Wallet topped up". Do it once with **Flutterwave** too.
3. **Convert** some Naira to Lira, then buy a **bus ticket** from the Lira wallet.
4. **Verify your identity** with your NIN or BVN.
5. **Withdraw ₦1,000** to your own bank account. Check that it arrives.
6. Create a second account (a friend) and **send** ₺10 between you.
7. In Supabase → **Table Editor**, check that `wallets` and `ledger` match what you did.

If something fails, check Supabase → Edge Functions → `api` → **Logs**, and the tables `payment_events` and `withdrawals`. Tell Claude what you see (never the keys).

---

## Day-to-day
- **How much you owe users:** Supabase → SQL Editor → `select currency, sum(balance_minor)/100 as total from wallets group by currency;`. Your Paystack balance plus your bank should always cover the Naira total. The Lira total is money you owe in Lira (for tickets you sell).
- **Freeze an account** (suspected fraud): Table Editor → `profiles` → set `frozen` to `true`. They can't spend or withdraw, but can still receive refunds.
- **Failed withdrawals** are refunded to the wallet automatically, including the fee.
- **`mismatch` top-ups** (paid amount ≠ expected): check them in the provider dashboard, then refund there.
- **Pause top-ups:** remove `PAYSTACK_SECRET_KEY` or `FLW_SECRET_KEY`. **Pause withdrawals:** remove `PAYSTACK_SECRET_KEY` (this also pauses Paystack top-ups).
- **Stop selling a bus company:** remove it from `SELL_OPERATORS`.

## Built-in safety
- Balances live only on the server. A hacked phone can't add money.
- Every money action is all-or-nothing and recorded once in the ledger. Balances can never go below zero.
- Top-ups are credited only after Luda asks the provider directly that the exact amount was paid. Fake webhooks are rejected by signature.
- Every payment from the wallet needs the user's PIN, checked on the server. 5 wrong PINs lock it for 15 minutes.
- Withdrawals go only to a bank account whose name matches the verified NIN/BVN name.
- Daily limits:
  - **Unverified:** top up ₦100,000 a day and hold up to ₦200,000; no withdrawing or sending.
  - **Verified:** top up ₦2,000,000 a day; withdraw ₦1,000,000 a day; send ₦500,000 or ₺20,000 a day.
- Only the last 4 digits of a NIN or BVN are stored.

## Still demo in live mode (switched off with "Coming soon")
Exchange (P2P), Bills, Flash help, Savings pots, Marketplace. They'll be connected to the real wallet one by one. **Ride Saver** discounts aren't applied to real-money tickets yet. **Phone (SMS) verification** isn't real yet: it needs an SMS provider (e.g. Termii).
