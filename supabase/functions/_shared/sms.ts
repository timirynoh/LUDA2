// Phone number checks by SMS with Twilio Verify (works for Cyprus/Turkey +90, Nigeria +234 and the rest of Africa).
// Twilio sends and checks the code; we never see or store it.
import type { Fetch } from './providers.ts'

export interface SmsEnv { TWILIO_ACCOUNT_SID?: string; TWILIO_AUTH_TOKEN?: string; TWILIO_VERIFY_SID?: string }
export const smsEnabled = (e: SmsEnv) => !!(e.TWILIO_ACCOUNT_SID && e.TWILIO_AUTH_TOKEN && e.TWILIO_VERIFY_SID)

/** "+90 533 812 44 55" / "0533…" (with a default country code) → "+905338124455", or null if it doesn't look valid. */
export function normPhone(raw: string, defaultCc = '90'): string | null {
  let d = raw.replace(/[^\d+]/g, '')
  if (d.startsWith('00')) d = '+' + d.slice(2)
  if (!d.startsWith('+')) d = '+' + defaultCc + d.replace(/^0+/, '')
  return /^\+[1-9]\d{8,14}$/.test(d) ? d : null
}

async function twilio(env: SmsEnv, f: Fetch, path: string, form: Record<string, string>) {
  const r = await f(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SID}/${path}`, {
    method: 'POST', body: new URLSearchParams(form).toString(), signal: AbortSignal.timeout(15000),
    headers: { authorization: 'Basic ' + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`), 'content-type': 'application/x-www-form-urlencoded' },
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, any>
  return { ok: r.ok, status: r.status, j }
}

export async function sendCode(phone: string, env: SmsEnv, f: Fetch = fetch) {
  const r = await twilio(env, f, 'Verifications', { To: phone, Channel: 'sms' })
  if (!r.ok) throw new Error(r.status === 429 ? 'Too many codes requested. Try again later.' : 'Could not send the SMS. Check the number.')
}

export async function checkCode(phone: string, code: string, env: SmsEnv, f: Fetch = fetch) {
  const r = await twilio(env, f, 'VerificationCheck', { To: phone, Code: code })
  return r.ok && r.j.status === 'approved'
}
