# Going live: Phase 1, real payments for bus and airport tickets

Phase 1 lets people **pay for bus tickets** (VirgoBus, Girneliler Seyahat) and **KIBHAS airport shuttle seats** with **Paystack** or **Flutterwave**, in Naira. Everything else in the app stays in demo mode for now (wallet, sending money, exchange). Those need a licence; see the end of this guide.

You can do every step below **in test mode, free, with no business documents**. When CAC approval arrives, you only swap the test keys for live keys (step 6).

---

## Step 1: Create the accounts (about 15 min)
1. **Supabase** (our server and database): sign up at <https://supabase.com>, then click **New project**.
   - Name: `luda`. Region: **Frankfurt (eu-central-1)** is closest to Cyprus and Nigeria.
   - Save the database password somewhere safe.
2. **Paystack**: sign up at <https://paystack.com>. Don't submit documents yet. The dashboard opens in **Test mode**.
3. **Flutterwave**: sign up at <https://flutterwave.com>. The dashboard has a **Test mode** switch; keep it on.
4. **Cloudflare** (hosting the app): sign up at <https://dash.cloudflare.com>.

## Step 2: Copy your test keys (5 min)
**Never paste secret keys into a chat, an email, or the app code.** They go only into Supabase (step 4).

| Where | What to copy | Looks like |
|---|---|---|
| Paystack → Settings → API Keys & Webhooks | Test **Secret** Key | `sk_test_…` |
| Flutterwave → Settings → API Keys | Test **Secret** Key | `FLWSECK_TEST-…` |
| Flutterwave → Settings → Webhooks | Make up a long random **Secret hash** (e.g. 40 random letters and numbers) and save it | your own text |
| Supabase → Project Settings → API | **Project URL** and the **anon public** key (this one is safe to share) | `https://abcd.supabase.co`, `eyJ…` |

## Step 3: Put the app online (10 min)
Cloudflare → Workers & Pages → Create → Pages → **Connect to Git** → pick `timirynoh/luda2`.
- Production branch: `claude/cyprus-expat-app-mlnvuc` (or `main` once merged)
- Root directory: `app`
- Build command: `npm run build`
- Build output: `dist`
- Environment variables:
  - `NODE_VERSION` = `22`
  - `VITE_PAY_API` = `https://<your-project>.supabase.co/functions/v1`
  - `VITE_SUPABASE_ANON_KEY` = your anon public key

Cloudflare gives you an address like `https://luda.pages.dev`. You'll need it in step 4.

## Step 4: Install the payment server (15 min, or ask Claude to walk you through it live)
On a computer with Node.js installed:
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>     # the "abcd" part of your Supabase URL
npx supabase db push                                    # creates the payments tables
npx supabase secrets set \
  APP_URL=https://luda.pages.dev \
  PAYSTACK_SECRET_KEY=sk_test_xxx \
  FLW_SECRET_KEY=FLWSECK_TEST-xxx \
  FLW_SECRET_HASH=your-random-secret-hash \
  FX_FALLBACK_RATE=42                                   # NGN per 1 TL, used only if the live rate is down
npx supabase functions deploy pay-init
npx supabase functions deploy pay-verify
npx supabase functions deploy pay-webhook
```
Optional settings:
- `FX_FIXED_RATE=43.5`: use your own NGN/TL rate instead of the live one.
- `FX_MARGIN=0.008`: extra margin on the rate (default 0.8%) to cover conversion costs.
- `ALLOWED_ORIGINS=http://localhost:5173`: also allow a local test copy of the app.

## Step 5: Tell Paystack and Flutterwave where to send payment updates
Use the same webhook address for both:
`https://<your-project>.supabase.co/functions/v1/pay-webhook`
- **Paystack:** Settings → API Keys & Webhooks → **Test Webhook URL**.
- **Flutterwave:** Settings → Webhooks → **URL**. Put the same secret hash you used in step 4.

**Test it:** open your Cloudflare address, sign up, go to Transport, pick VirgoBus, choose Paystack, and continue.
- Paystack test card: `4084 0840 8408 4081`, any future expiry, CVV `408`, PIN `0000`, OTP `123456`.
- Flutterwave test card: `5531 8866 5214 2950`, expiry `09/32`, CVV `564`, PIN `3310`, OTP `12345`.

(Test cards change sometimes; if one is refused, check the "test cards" page in each provider's docs.) The ticket appears after payment. You'll also see the payment in Supabase → Table Editor → `payments`.

## Step 6: Switch to real money (after CAC and approval)
1. Finish compliance on Paystack and Flutterwave: CAC documents, TIN, a corporate bank account whose name matches CAC, and director IDs.
2. Copy the **Live** secret keys and run `npx supabase secrets set PAYSTACK_SECRET_KEY=sk_live_… FLW_SECRET_KEY=FLWSECK-…` again.
3. Set the **Live** webhook URLs in both dashboards (same address as step 5).
4. Make one small real purchase yourself, then refund it from the Paystack or Flutterwave dashboard.

## How it stays safe
- Card numbers are typed on Paystack's or Flutterwave's own page. **Luda never sees or stores them.**
- **The price is set by the server**, not the phone, so a tampered app can't pay ₦1 for a ticket.
- A ticket is issued only after the server asks Paystack or Flutterwave directly that the payment succeeded, with the exact amount and currency. A wrong amount is flagged for review, not accepted.
- Webhooks are checked against their signatures; fake ones are rejected.
- Each payment is settled exactly once, even if the webhook and the app both check it.
- Max 10 payment attempts per email per hour.
- Every step is written to the `payment_events` audit log.
- Refunds for online tickets go through support (from the Paystack or Flutterwave dashboard) for now.

## Not in Phase 1 (on purpose)
- **Ride Saver discount on online payments.** It needs real Luda accounts on the server so the 2-per-month limit can't be bypassed (Phase 1b).
- **Wallet top-ups, sending money, P2P exchange.** Holding customers' money and exchanging currency need CBN licences (or a licensed partner). Get legal advice first (Phase 3).
- **Paying the bus companies their share in TL.** Agree this with VirgoBus and Girneliler Seyahat (a monthly bank transfer, or they sell you tickets in bulk).
