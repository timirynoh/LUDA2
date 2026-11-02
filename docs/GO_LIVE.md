# Going live: the real Luda wallet

**How money works in Luda (live):**
- **In:** students **top up** with **Paystack or Flutterwave** (card, bank transfer, USSD). They pay the provider's fee on top, so the full amount lands in their wallet.
  - **Naira** goes into the **Naira wallet** (Paystack or Flutterwave).
  - **Other currencies** go through **Flutterwave** and are converted into the **Lira wallet** at today's rate, minus your margin: US dollar by card, Ghana cedi, Kenyan and Ugandan shilling, Zambian kwacha, Cameroon CFA (card or mobile money).
- **Inside Luda:** they **convert** Naira ⇄ Lira, **buy bus and airport tickets** from the wallet, and **send money** to other Luda users. No card is involved.
- **Out:** they **withdraw** Naira to **their own Nigerian bank account** through **Paystack**, or **Flutterwave** when Paystack refuses. Minimum ₦300; each withdrawal has a ₦50 fee. Withdrawals and sending need identity verification (NIN or BVN, checked automatically by **Dojah**).

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
- **Flutterwave payouts (second route for withdrawals).** Luda tries Paystack first. If Paystack says no (e.g. "starter business" or not enough balance), it tries Flutterwave. Nothing is sent twice: Luda only moves on when a provider clearly refused. To let Flutterwave pay out:
  1. Flutterwave → Settings → **API** → turn on **Transfers via API** (ask Flutterwave support if you can't see it).
  2. **IP whitelisting:** Flutterwave only accepts payouts from server addresses on your list, and Luda's server has no fixed address. If you can turn whitelisting off, do so; otherwise ask support to allow API transfers without it. If a payout is refused for this reason, the student's money goes straight back and the live check shows "IP Whitelisting" in the withdrawal note.
  3. Keep money in your **Flutterwave NGN balance**: Flutterwave pays from there.
- Order of routes: secret `PAYOUT_PROVIDERS` (default `paystack,flutterwave`). Set it to `flutterwave` to use Flutterwave only.

**Dojah (identity checks)**
- Sign up at <https://dojah.io>, then **fund your Dojah wallet**. Each NIN or BVN lookup costs a small fee.
- Copy your **App ID** and **Secret Key** (production).

**Flutterwave: switch on the other currencies.** In Flutterwave → Settings → **Business preferences / Payment methods**, make sure **USD, GHS, KES, UGX, ZMW and XAF** collections and their mobile-money methods are enabled. Some need a request to Flutterwave support. A currency that isn't enabled fails at checkout, the student isn't charged, and nothing is credited. To show only some currencies in the app, set the secret `FOREIGN_CURRENCIES` (e.g. `GHS,USD`).

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
| `DEPOSIT_FEE_PCT` / `DEPOSIT_FEE_FLAT` / `DEPOSIT_FEE_FLAT_WAIVE_BELOW` / `DEPOSIT_FEE_CAP` | Naira top-up fee passed to the user (`1.5` / `100` / `2500` / `2000`, matching Paystack's local card fee) |
| `PAYSTACK_CUSTOMER_PAYS_FEE` | `true` (default) if Paystack is set to make the customer pay its fee, so Luda doesn't add the fee again. Set `false` if you switch Paystack to "charge me" |
| `FLW_CUSTOMER_PAYS_FEE` | same for Flutterwave (default `false`: Luda adds the fee itself) |
| `FOREIGN_CURRENCIES` | which other currencies to offer, e.g. `GHS,USD` (all six) |
| `FOREIGN_FEE_PCT` | fee passed to the user on other-currency top-ups (`3.8`) |
| `DIDIT_API_KEY` / `DIDIT_WORKFLOW_ID` / `DIDIT_WEBHOOK_SECRET` | ID document + selfie checks (see below) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_VERIFY_SID` | real SMS phone checks (see below) |
| `FX_TRY_RATES` | your own rates instead of live ones, as units per ₺1, e.g. `{"USD":0.029,"GHS":0.35}` |

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
3. Variables (add them for **both Production and Preview**; without `VITE_PAY_API` the build now stops on purpose instead of publishing the demo app):
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
5. **Withdraw ₦300** to your own bank account. Check that it arrives.
6. Create a second account (a friend) and **send** ₺10 between you.
7. In Supabase → **Table Editor**, check that `wallets` and `ledger` match what you did.

If something fails, check Supabase → Edge Functions → `api` → **Logs**, and the tables `payment_events` and `withdrawals`. Tell Claude what you see (never the keys).

---

## Sign-in and security extras

### Continue with Google (about 15 min)
1. Go to <https://console.cloud.google.com>, create a project called **Luda**, then **APIs & Services → OAuth consent screen**:
   - Choose **External**.
   - App name **Luda**, plus your support email.
   - Save. Then click **Publish app**; while it's in "Testing", only test users can sign in.
2. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**:
   - **Authorized JavaScript origins:** `https://luda-ct6.pages.dev`
   - **Authorized redirect URIs:** `https://<your-project-code>.supabase.co/auth/v1/callback`
   - Click **Create**, then copy the **Client ID** and **Client secret**.
3. In Supabase, go to **Authentication → Sign In / Providers → Google**. Turn it on, paste the Client ID and secret, and **Save**.
4. In Supabase, go to **Authentication → URL Configuration → Redirect URLs** and add `https://luda-ct6.pages.dev/**`.

The **Continue with Google** button appears in the app by itself once Google is switched on in Supabase.

### Phone numbers by SMS (Twilio Verify, about 15 min)
1. Sign up at <https://www.twilio.com> and **upgrade** the account by adding a little credit. Trial accounts can only text numbers you've verified yourself.
2. In the Twilio Console, go to **Verify → Services → Create new** and name it **Luda**. Copy the **Service SID** (starts `VA`).
3. In **Verify → Settings → Geo permissions**, allow the countries your students use, at least **Turkey/Northern Cyprus (+90)**, **Nigeria (+234)** and **Ghana (+233)**.
4. From the Console home page, copy the **Account SID** (`AC…`) and **Auth Token**.
5. In Supabase, go to **Edge Functions → Secrets** and add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_VERIFY_SID`.

Once they're set:
- Every account must prove its phone number with a real SMS code before buying tickets, posting and similar actions.
- **One Luda account per phone number.**

Until they're set, the phone step is skipped.

### ID checks with Didit (any nationality, free for 500 a month)
Students photograph their **passport, national ID, driver's licence or residence permit** and take a **live selfie**. Didit checks that the document is real and that the face matches. Luda then asks Didit for the result directly, and unlocks withdrawals and sending.
1. In the Didit Console, use the **live** application ("My Application", not the Sandbox one). Go to **API & Webhooks** and copy the **API key**.
2. In Supabase, go to **Edge Functions → Secrets** and add:
   - `DIDIT_API_KEY` = your API key
   - `DIDIT_WORKFLOW_ID` = `e573a01e-9ba1-480b-b2e6-499f237077a0` (your "Free KYC" workflow)
3. Optional, for instant results: in Didit, add a webhook pointing to your `pay-webhook` address, copy its **secret**, and add it in Supabase as `DIDIT_WEBHOOK_SECRET`. Without it, Luda still gets the result when the student comes back or next opens the app.

Built-in rules:
- The name on the document must match the Luda name.
- **One document can verify only one account.**
- Luda stores only the verified name, date of birth, country and the last 4 characters of the document number.
- Nigerians can still use NIN/BVN if Dojah is set up.

### Your admin page
In Supabase → **Edge Functions → Secrets**, add `ADMIN_EMAILS` = the email of **your own Luda account** (comma-separate several). Then in the app go to **Profile → Open admin page**. It has:
- **Overview:** users, money held, top-ups and payouts, webhooks, and anything stuck.
- **Users:** search, balances, activity, ID status.
- **Actions:** freeze or unfreeze, reset or approve an ID check, correct a balance (a reason is required, and you can't change your own), refund a ticket.
- **Top-ups / Payouts:** filter, and re-check any payment with Paystack or Flutterwave.

**Cases tab (appeals and support):** students open a case from **Help → My cases**, from "Can't verify? Send your ID to the Luda team", or from "Report a problem" on any transaction. They can attach up to 4 photos or PDFs, which are stored privately in the Supabase bucket `case-files`. You reply, resolve or close the case. For ID cases you can **verify the ID by hand**: enter the legal name, document type, number, country and date of birth, plus how you checked. The same document still can't verify two accounts. Or **reject** with a reason the student sees.

Every change needs your PIN or fingerprint and is written to the audit log (`payment_events`, kinds `admin_*`). Nobody else can see the page.

### Fingerprint / Face ID
Nothing to set up. Students switch it on in **Security Center → Fingerprint / Face ID**, and it needs their PIN once. After that they unlock Luda and approve payments with their fingerprint, and the PIN still works as a backup. Each phone is checked by your server; the fingerprint itself never leaves the phone.
⚠️ Fingerprints are tied to your app's address. If you later move to a custom domain (e.g. `luda.app`), update `APP_URL`; students then switch fingerprint on again once.

### Built-in protections (nothing to do)
- **Duplicates:** one account per email, per username and per phone number. The sign-up form tells people straight away if one is already taken.
- **Rate limits:**
  - Password guessing: 8 tries per account every 15 minutes, plus a per-network limit.
  - Sign-up spam: 5 per network per hour.
  - Reset-email spam and SMS spam are limited too.
- **After a password reset**, withdrawals and sending are **paused for 24 hours**, so someone who steals an email account can't cash out.
- **Freeze my wallet** works on the server and stops every phone at once. Unfreezing needs the PIN. A freeze set by you (`frozen_by = admin` in `profiles`) can only be lifted by you.
- **Security headers:** other websites can't embed Luda in a hidden frame to trick taps.

## Day-to-day
- **How much you owe users:** Supabase → SQL Editor → `select currency, sum(balance_minor)/100 as total from wallets group by currency;`. Your Paystack balance plus your bank should always cover the Naira total. The Lira total is money you owe in Lira (for tickets you sell).
- **Freeze an account** (suspected fraud): Table Editor → `profiles` → set `frozen` to `true`. They can't spend or withdraw, but can still receive refunds.
- **Failed withdrawals** are refunded to the wallet automatically, including the fee.
- **`mismatch` top-ups** (paid amount ≠ expected): check them in the provider dashboard, then refund there.
- **Pause top-ups:** remove `PAYSTACK_SECRET_KEY` or `FLW_SECRET_KEY`. **Pause withdrawals:** remove `PAYSTACK_SECRET_KEY` (this also pauses Paystack top-ups and the bank list).
- **Stop selling a bus company:** remove it from `SELL_OPERATORS`.

## Built-in safety
- Balances live only on the server. A hacked phone can't add money.
- Every money action is all-or-nothing and recorded once in the ledger. Balances can never go below zero.
- Top-ups are credited only after Luda asks the provider directly that the exact amount was paid. Fake webhooks are rejected by signature.
- Every payment from the wallet needs the user's PIN, checked on the server. 5 wrong PINs lock it for 15 minutes.
- Withdrawals go only to a bank account whose name matches the verified NIN/BVN name.
- Daily limits:
  - **Unverified:** top up ₦100,000 a day and hold up to ₦200,000; other currencies up to ₺3,000 a day and ₺6,000 in the Lira wallet; no withdrawing or sending.
  - **Verified:** top up ₦2,000,000 a day; withdraw ₦1,000,000 a day; send ₦500,000 or ₺20,000 a day.
- Only the last 4 digits of a NIN or BVN are stored.

## Still demo in live mode (switched off with "Coming soon")
Exchange (P2P), Bills, Flash help, Savings pots, Marketplace. They'll be connected to the real wallet one by one. **Ride Saver** discounts aren't applied to real-money tickets yet. **Phone (SMS) verification** isn't real yet: it needs an SMS provider (e.g. Termii). **Identity checks are Nigeria-only (NIN/BVN)**, so students from other countries can top up and spend but can't withdraw or send yet.


## Bills, savings, marketplace and Flash help (real money)
- **Bills (assisted):** a student picks KIB-TEK, water, phone, internet or rent, types the number from the bill and the amount. The amount + a ₺10 service fee leave their Lira wallet. You open **Admin → Bills**: the amount and number are already there with **Copy** buttons. Pay it on the official site or your bank app, attach the receipt, tap **Mark as paid** (PIN). If you can't pay, tap **Can't pay**, pick a reason, and they get everything back.
- **Savings pots:** students move money between their wallet and pots (optionally locked).
- **Marketplace:** the buyer's money is held by Luda until they tap **I received it**; then the seller is paid (minus 2%). Sellers must be ID-verified.
- **Flash help:** the reward is held when a job is posted; the helper is paid when the poster taps **Job done** (minus 5%).
- If nobody confirms, money is released automatically (7 days marketplace, 3 days Flash) unless someone opened a case. Decide disputes in **Admin → Held money**.
- Fees are secrets you can change: `BILL_FEE` (lira, default `10`), `MARKET_FEE_PCT` (default `0.02`), `FLASH_FEE_PCT` (default `0.05`).
