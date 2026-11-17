// Luda's own emails (welcome, withdrawal sent, top-up receipt, ID verified), sent through Resend's HTTP API.
// Optional: with no RESEND_API_KEY nothing is sent. Never throws, so an email problem can't break a money action.
import type { Fetch } from './providers.ts'

export interface MailEnv { RESEND_API_KEY?: string; MAIL_FROM?: string; MAIL_REPLY_TO?: string; APP_URL: string }

export const mailEnabled = (env: MailEnv) => !!env.RESEND_API_KEY

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const LOGO = 'https://useluda.com/email/logo-96.png'

export interface Mail { subject: string; preheader: string; icon: string; title: string; intro: string; rows?: [string, string][]; button?: [string, string]; note?: string }

/** Same look as the sign-in emails in supabase/emails (light card, real logo, dark-mode styles). */
export function mailHtml(m: Mail, appUrl: string): string {
  const base = appUrl.replace(/\/$/, '')
  const rows = m.rows?.length ? `<tr><td style="padding:4px 36px 6px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="note" style="background:#f8fafc;border-radius:14px">${m.rows.map(([k, v], i) => `<tr><td style="padding:12px 16px;font-size:14px;color:#64748b;${i ? 'border-top:1px solid #e2e8f0;' : ''}" class="muted">${esc(k)}</td><td align="right" style="padding:12px 16px;font-size:14px;font-weight:700;color:#0f172a;${i ? 'border-top:1px solid #e2e8f0;' : ''}" class="h">${esc(v)}</td></tr>`).join('')}</table></td></tr>` : ''
  const btn = m.button ? `<tr><td align="center" style="padding:18px 36px 4px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:14px;background:#059669"><a href="${esc(base + m.button[1])}" style="display:inline-block;padding:15px 34px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px">${esc(m.button[0])} &rarr;</a></td></tr></table></td></tr>` : ''
  const note = m.note ? `<tr><td style="padding:20px 36px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td class="note" style="background:#f8fafc;border-radius:14px;padding:14px 16px;font-size:13px;line-height:20px;color:#475569">🛡️&nbsp; ${esc(m.note)}</td></tr></table></td></tr>` : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(m.title)}</title>
<style>@media (prefers-color-scheme: dark){.bg{background:#0b1220!important}.card{background:#111a2b!important;border-color:#1f2a3d!important}.h{color:#f1f5f9!important}.body{color:#cbd5e1!important}.muted{color:#94a3b8!important}.note{background:#0f2233!important;color:#cbd5e1!important}.brand{color:#f1f5f9!important}a{color:#34d399!important}}</style></head>
<body class="bg" style="margin:0;padding:0;background:#eef4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(m.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#eef4f1"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px">
<tr><td style="padding:0 6px 18px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td><img src="${LOGO}" width="44" height="44" alt="Luda" style="display:block;border:0;border-radius:12px"></td><td class="brand" style="padding-left:12px;font-size:24px;font-weight:800;color:#0f172a">Luda</td></tr></table></td></tr>
<tr><td class="card" style="background:#ffffff;border:1px solid #dfe9e4;border-radius:24px;overflow:hidden"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="height:120px;background:#059669;background-image:linear-gradient(135deg,#34d399 0%,#059669 55%,#064e3b 100%);text-align:center"><table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="width:64px;height:64px;border-radius:32px;background:#ffffff;text-align:center;font-size:30px;line-height:64px">${m.icon}</td></tr></table></td></tr>
<tr><td class="h" style="padding:30px 36px 6px;font-size:24px;line-height:32px;font-weight:800;color:#0f172a">${esc(m.title)}</td></tr>
<tr><td class="body" style="padding:8px 36px 16px;font-size:16px;line-height:26px;color:#334155">${esc(m.intro)}</td></tr>
${rows}${btn}${note}<tr><td style="height:30px">&nbsp;</td></tr></table></td></tr>
<tr><td class="muted" style="padding:22px 18px 0;text-align:center;font-size:12px;line-height:19px;color:#64748b"><b class="brand" style="color:#334155">Luda</b> &middot; money, help and student life in North Cyprus<br><a href="https://useluda.com" style="color:#047857;text-decoration:none">useluda.com</a> &nbsp;&middot;&nbsp; Need help? <a href="mailto:support@useluda.com" style="color:#047857;text-decoration:none">support@useluda.com</a><br><span style="color:#94a3b8">Luda will never ask for your PIN, password or sign-in code by email, phone or chat.</span></td></tr>
</table></td></tr></table></body></html>`
}

export function mailText(m: Mail, appUrl: string): string {
  return [m.title, '', m.intro, ...(m.rows ?? []).map(([k, v]) => `${k}: ${v}`), m.button ? `\n${m.button[0]}: ${appUrl.replace(/\/$/, '')}${m.button[1]}` : '', m.note ? `\n${m.note}` : '',
    '\n—\nLuda · useluda.com · support@useluda.com\nLuda will never ask for your PIN, password or sign-in code.'].join('\n')
}

const first = (name: string) => { const w = name.trim().split(/\s+/)[0] || 'there'; return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() }

/** The four emails the owner picked. Plain English, short. */
export const MAILS = {
  welcome: (v: { name: string }): Mail => ({
    subject: 'Welcome to Luda 👋🏾', preheader: 'Your wallet, bus tickets, bills and help in North Cyprus, in one app.', icon: '👋🏾',
    title: `Welcome to Luda, ${first(v.name)}!`,
    intro: 'Your account is ready. Top up your wallet, buy Girne ⇄ Lefkoşa bus tickets, pay bills, exchange Naira and lira, and find help near you, all in one app.',
    rows: [['1. Set your payment PIN', 'keeps money safe'], ['2. Verify your ID', 'unlocks withdrawals'], ['3. Top up', 'Naira or lira']],
    button: ['Open Luda', '/'],
    note: 'Questions? Reply to this email or write to support@useluda.com. We never ask for your PIN or password.',
  }),
  topup: (v: { amount: string; ref: string; when: string }): Mail => ({
    subject: `Top-up received: ${v.amount}`, preheader: `${v.amount} is now in your Luda wallet.`, icon: '💰',
    title: 'Top-up received', intro: `${v.amount} has been added to your Luda wallet.`,
    rows: [['Amount', v.amount], ['Date', v.when], ['Reference', v.ref]],
    button: ['See my wallet', '/wallet'],
    note: "Didn't make this top-up? Freeze your wallet in Security and contact support@useluda.com.",
  }),
  withdrawal: (v: { amount: string; bank: string; account: string; ref: string; when: string }): Mail => ({
    subject: `Withdrawal sent: ${v.amount}`, preheader: `${v.amount} is on its way to ${v.bank}.`, icon: '🏦',
    title: 'Your withdrawal is on its way', intro: `We've sent ${v.amount} to your bank account. Most banks show it within minutes.`,
    rows: [['Amount', v.amount], ['To', `${v.bank} ••${v.account}`], ['Date', v.when], ['Reference', v.ref]],
    button: ['See my wallet', '/wallet'],
    note: "Didn't ask for this? Freeze your wallet in Security right away and contact support@useluda.com.",
  }),
  kyc: (v: { name: string }): Mail => ({
    subject: 'Your ID is verified ✅', preheader: 'Withdrawals, P2P, Market selling and Flash jobs are now unlocked.', icon: '🪪',
    title: `You’re verified, ${first(v.name)}`, intro: 'Your ID check is complete. You can now withdraw to your bank, trade P2P, sell on the Market and take paid Flash jobs.',
    button: ['Open my wallet', '/wallet'],
    note: 'One account per person: your ID is now linked to this account only.',
  }),
}
export type MailKind = keyof typeof MAILS

/** Sends one email. `key` makes it idempotent (Resend ignores a repeat with the same key for 24 h). */
export async function sendMail(env: MailEnv, fetchFn: Fetch | undefined, to: string, m: Mail, key: string): Promise<boolean> {
  if (!env.RESEND_API_KEY || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return false
  try {
    const r = await (fetchFn ?? fetch)('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json', 'idempotency-key': key.slice(0, 256) },
      body: JSON.stringify({
        from: env.MAIL_FROM || 'Luda <no-reply@useluda.com>', to: [to], reply_to: env.MAIL_REPLY_TO || 'support@useluda.com',
        subject: m.subject, html: mailHtml(m, env.APP_URL), text: mailText(m, env.APP_URL),
      }),
      signal: AbortSignal.timeout(8000),
    })
    return r.ok
  } catch { return false }
}
