# Going live: Phase 1, real ticket payments (Paystack + Flutterwave)

Phase 1 sells **bus tickets** (VirgoBus, Girneliler Seyahat) and **KIBHAS airport seats** for real money, in Naira, through Paystack or Flutterwave. Everything else in Luda stays in demo mode (wallet, sending money, exchange).

**Everything below is done in your web browser. You don't need a terminal.** Total time is about 45 minutes.

> 🔐 **Golden rule:** live secret keys (`sk_live_…`, `FLWSECK-…`) are pasted **only** into Supabase's Secrets page. Never paste them into a chat (including with Claude), an email, WhatsApp, or the app code. If one ever leaks, regenerate it in that dashboard straight away.

---

## Before you sell to anyone
- [ ] **Bus companies agree.** VirgoBus, Girneliler Seyahat and KIBHAS must agree to accept Luda QR tickets and say how they get paid (e.g. a weekly bank transfer). Otherwise students pay and the driver refuses them. Use `SELL_OPERATORS` (step 3) to sell **only** the companies that have agreed.
- [ ] **Paystack and Flutterwave are activated for live payments.** If your business registration is still in progress, live checkouts may be refused or limited. Luda then shows the student the provider's error and charges nothing.
- [ ] **Website pages.** Both providers expect a Terms, Privacy and Refund policy on your site. Ask Claude to add these pages to the app.

---

## Step 1: Supabase project (5 min)
1. Go to <https://supabase.com> and sign up, then click **New project**.
   - Name: `luda`. Region: **Central EU (Frankfurt)**.
   - Choose a strong **database password** and save it in your password manager.
2. When it's ready, open **Project Settings → General** (or the API settings) and note:
   - the **Project URL**, like `https://abcd1234.supabase.co`;
   - the **Project ref**: the `abcd1234` part;
   - in **API Keys**, the **anon** or **publishable** key (this one is safe to be public).
3. Go to <https://supabase.com/dashboard/account/tokens> and click **Generate new token**. Name it `github-deploy` and copy it.

## Step 2: Let GitHub install the payment server (5 min)
GitHub → `timirynoh/luda2` → **Settings → Secrets and variables → Actions → New repository secret**. Add three:

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | the token from step 1.3 |
| `SUPABASE_PROJECT_REF` | e.g. `abcd1234` |
| `SUPABASE_DB_PASSWORD` | the database password from step 1.1 |

## Step 3: Put your live keys into Supabase (10 min)
1. **Paystack** (Live mode) → Settings → **API Keys & Webhooks** → copy the **Live Secret Key** (`sk_live_…`).
2. **Flutterwave** (Live mode) → Settings → **API Keys** → copy the **Live Secret Key** (`FLWSECK-…`).
3. **Flutterwave** → Settings → **Webhooks** → make up a long random **Secret hash** (40+ random letters and numbers), type it there and save. Keep a copy for the next step.
4. **Supabase** → **Edge Functions → Secrets** → add:

| Name | Value |
|---|---|
| `APP_URL` | your app's web address from step 5 (e.g. `https://luda.pages.dev`). You can come back and fill this in after step 5. |
| `PAYSTACK_SECRET_KEY` | `sk_live_…` |
| `FLW_SECRET_KEY` | `FLWSECK-…` |
| `FLW_SECRET_HASH` | the secret hash you made up |
| `FX_FALLBACK_RATE` | today's Naira per 1 Lira, e.g. `42`. It's used only if the live rate service is down. |
| `SELL_OPERATORS` | only the companies that have agreed, e.g. `virgo,girneliler,kibhas` |

Optional:
- `FX_FIXED_RATE`: your own fixed NGN/TL rate, used instead of the live one.
- `FX_MARGIN`: extra on the rate to cover conversion costs. Default `0.008` (0.8%).

To use only **one** provider, add only its key. The other button disappears from the app.

## Step 4: Start the install (2 min)
GitHub → **Actions** → **Deploy payment server** → **Run workflow**.
- It runs the safety tests, creates the database tables, and installs the three payment functions.
- When it's green ✅, open the last step, **Print your webhook address**, and copy the address. It looks like:
  `https://abcd1234.supabase.co/functions/v1/pay-webhook`
- After this, every change Claude pushes to the payment server is installed automatically.

## Step 5: Put the app online (10 min)
1. Go to <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git** → choose `timirynoh/luda2`.
2. Use these settings:
   - Production branch: `claude/cyprus-expat-app-mlnvuc`
   - Root directory: `app`
   - Build command: `npm run build`
   - Output directory: `dist`
3. Add these environment variables, then click **Save and Deploy**:
   - `NODE_VERSION` = `22`
   - `VITE_PAY_API` = `https://abcd1234.supabase.co/functions/v1`
   - `VITE_SUPABASE_ANON_KEY` = the anon or publishable key from step 1
4. Copy your address (e.g. `https://luda.pages.dev`) into the Supabase secret `APP_URL` (step 3).

## Step 6: Connect the webhooks (5 min)
Paste the webhook address from step 4 into:
- **Paystack** (Live mode) → Settings → API Keys & Webhooks → **Live Webhook URL**.
- **Flutterwave** (Live mode) → Settings → Webhooks → **URL**, with the same secret hash as step 3.

## Step 7: Your first real sale (5 min)
1. Open your app address on your phone and sign up.
2. Go to Transport → VirgoBus → choose **Paystack** → Continue → check the Naira amount → **Confirm & open Paystack** → pay with your own card.
3. The ticket should appear. Check that:
   - Supabase → **Table Editor → `payments`** shows the row with status **paid**;
   - Paystack → **Transactions** shows the payment.
4. Do the same with **Flutterwave**.
5. Refund both test purchases from the Paystack and Flutterwave dashboards.

If anything goes wrong, look at Supabase → Edge Functions → `pay-init` → **Logs** and the `payment_events` table, and tell Claude what you see (never the keys).

---

## Day-to-day
- **Sales:** Supabase → Table Editor → `payments` (status `paid`). Each payment's history is in `payment_events`.
- **Refunds:** do them from the Paystack or Flutterwave dashboard. Students are told to contact support to cancel.
- **`mismatch` status:** the amount paid didn't match the price. Check it in the provider dashboard, then refund or issue the ticket by hand.
- **Pause all sales instantly:** delete `PAYSTACK_SECRET_KEY` and `FLW_SECRET_KEY` from Supabase Secrets. The app shows "Online payment is switched off".
- **Stop selling one company:** remove it from `SELL_OPERATORS`.
- **Fares change:** tell Claude. Prices live in `supabase/functions/_shared/pricing.ts` and `app/src/config.ts`.

## How it stays safe
- Card numbers are typed only on Paystack's or Flutterwave's page. Luda never sees them.
- The price is set by the server, not the phone, so a hacked app can't pay ₦1 for a ticket.
- A ticket is issued only after the server checks with the provider that the exact amount and currency were paid.
- Webhooks must carry a valid signature, so fake "payment succeeded" messages are rejected.
- Each payment counts only once. There's a limit of 10 payment attempts per email per hour, and every step is logged.

## Not in Phase 1 (on purpose)
- **Ride Saver discount on online tickets:** needs real Luda accounts on the server (next phase, 1b).
- **Wallet top-ups, sending money, P2P exchange:** holding customers' money and exchanging currency need CBN licences or a licensed partner. Get legal advice first.
