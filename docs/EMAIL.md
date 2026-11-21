# Luda email: how it works and how to reply as support@useluda.com

## What is already set up
- **Receiving:** support@, hello@, payments@, admin@ and no-reply@useluda.com all forward to your Gmail (Cloudflare Email Routing).
- **Sending:** Resend sends from no-reply@useluda.com.
  - Supabase sends the sign-in emails (confirm email, password reset…). Their designs live in `supabase/emails/`.
  - The Luda server sends its own emails: welcome, top-up receipt, withdrawal sent and ID verified. People who reply to these reach support@useluda.com.
- **Protection:** DMARC (`_dmarc.useluda.com`, p=quarantine) stops other people from sending as useluda.com. Reports go to admin@useluda.com.
- **Logo in the inbox (BIMI):** `default._bimi.useluda.com` points to https://useluda.com/bimi.svg.
  - Yahoo, AOL and some other providers can show the logo.
  - **Gmail and Apple Mail** show it only with a paid VMC/CMC certificate. That costs about $1,000+ a year and needs a registered trademark (VMC) or a year of public logo use (CMC). Until then Gmail shows the "L" letter circle.

## Reply to people as support@useluda.com from Gmail (5 minutes, on a computer)
1. In Resend (resend.com → API Keys), create a key:
   - Name: "Gmail send as support"
   - Permission: Sending access
   - Domain: useluda.com

   Copy it. Resend shows it only once. Don't share it with anyone, including in chat.
2. In Gmail on a computer, go to ⚙️ → See all settings → **Accounts and Import** → "Send mail as" → **Add another email address**.
3. Fill in the first screen:
   - Name: Luda Support
   - Email: support@useluda.com
   - Leave "Treat as an alias" ticked
   - Click Next.
4. Fill in the SMTP screen:
   - SMTP Server: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the key from step 1
   - Choose "Secured connection using SSL"
   - Click Add Account.
5. Gmail emails a confirmation code to support@useluda.com, which forwards to your inbox. Enter the code.
6. Optional: in the same settings, choose "Reply from the same address the message was sent to", so replies to support@ go out as support@.

When you write or reply, pick **Luda Support <support@useluda.com>** in the From field.
