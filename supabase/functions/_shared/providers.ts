// Paystack + Flutterwave: start a checkout, verify a payment, check webhook signatures.
// Runtime-agnostic (Web Crypto + fetch) so it runs on Supabase Edge (Deno) and in Node tests.

export type Provider = 'paystack' | 'flutterwave'
export type Fetch = typeof fetch

export interface Keys {
  PAYSTACK_SECRET_KEY?: string
  FLW_SECRET_KEY?: string
  FLW_SECRET_HASH?: string // the "secret hash" you set in the Flutterwave dashboard (webhooks)
}

export interface InitArgs { reference: string; amountMinor: number; currency: string; email: string; callbackUrl: string; title: string; meta: Record<string, unknown>; paymentOptions?: string }
export interface Verified { ok: boolean; status: string; amountMinor: number; currency: string; reference: string; providerTxId: string }

const PAYSTACK = 'https://api.paystack.co'
const FLW = 'https://api.flutterwave.com/v3'

function need(v: string | undefined, name: string) {
  if (!v) throw new Error(`${name} is not set on the server`)
  return v
}

async function call(f: Fetch, url: string, key: string, init?: { method?: string; body?: unknown }) {
  const res = await f(url, {
    method: init?.method ?? 'GET',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json().catch(() => ({})) as Record<string, any>
  if (!res.ok) throw new Error(`Provider error ${res.status}: ${json.message ?? 'unknown'}`)
  return json
}

/** Creates a hosted checkout and returns the URL to send the user to. Card details are typed on the provider's page, never in Luda. */
export async function initCheckout(p: Provider, a: InitArgs, k: Keys, f: Fetch = fetch): Promise<string> {
  if (p === 'paystack') {
    const j = await call(f, `${PAYSTACK}/transaction/initialize`, need(k.PAYSTACK_SECRET_KEY, 'PAYSTACK_SECRET_KEY'), {
      method: 'POST',
      body: { email: a.email, amount: a.amountMinor, currency: a.currency, reference: a.reference, callback_url: a.callbackUrl, metadata: a.meta },
    })
    if (!j.data?.authorization_url) throw new Error('Paystack did not return a checkout link')
    return j.data.authorization_url
  }
  const j = await call(f, `${FLW}/payments`, need(k.FLW_SECRET_KEY, 'FLW_SECRET_KEY'), {
    method: 'POST',
    body: {
      tx_ref: a.reference, amount: a.amountMinor / 100, currency: a.currency, redirect_url: a.callbackUrl,
      customer: { email: a.email }, customizations: { title: a.title }, meta: a.meta,
      ...(a.paymentOptions ? { payment_options: a.paymentOptions } : {}),
    },
  })
  if (!j.data?.link) throw new Error('Flutterwave did not return a checkout link')
  return j.data.link
}

/** Asks the provider directly whether a payment succeeded. Never trust a redirect or webhook body alone. */
export async function verifyPayment(p: Provider, reference: string, k: Keys, f: Fetch = fetch): Promise<Verified> {
  if (p === 'paystack') {
    const j = await call(f, `${PAYSTACK}/transaction/verify/${encodeURIComponent(reference)}`, need(k.PAYSTACK_SECRET_KEY, 'PAYSTACK_SECRET_KEY'))
    const d = j.data ?? {}
    return { ok: d.status === 'success', status: String(d.status ?? 'unknown'), amountMinor: Number(d.amount ?? 0), currency: String(d.currency ?? ''), reference: String(d.reference ?? ''), providerTxId: String(d.id ?? '') }
  }
  const j = await call(f, `${FLW}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`, need(k.FLW_SECRET_KEY, 'FLW_SECRET_KEY'))
  const d = j.data ?? {}
  return { ok: d.status === 'successful', status: String(d.status ?? 'unknown'), amountMinor: Math.round(Number(d.amount ?? 0) * 100), currency: String(d.currency ?? ''), reference: String(d.tx_ref ?? ''), providerTxId: String(d.id ?? '') }
}

const enc = new TextEncoder()
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))

async function hmac(alg: 'SHA-512' | 'SHA-256', key: string, body: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: alg }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(body))
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

/**
 * Identifies which provider sent a webhook and checks its signature.
 * Paystack: `x-paystack-signature` = HMAC-SHA512(raw body, secret key), hex.
 * Flutterwave: `flutterwave-signature` = HMAC-SHA256(raw body, secret hash), base64 (v4),
 *              or the older `verif-hash` header = the secret hash itself (v3).
 */
export async function checkWebhook(headers: Headers, raw: string, k: Keys): Promise<Provider | null> {
  const ps = headers.get('x-paystack-signature')
  if (ps && k.PAYSTACK_SECRET_KEY) return safeEqual(hex(await hmac('SHA-512', k.PAYSTACK_SECRET_KEY, raw)), ps.toLowerCase()) ? 'paystack' : null
  const fs = headers.get('flutterwave-signature')
  if (fs && k.FLW_SECRET_HASH) return safeEqual(b64(await hmac('SHA-256', k.FLW_SECRET_HASH, raw)), fs) ? 'flutterwave' : null
  const vh = headers.get('verif-hash')
  if (vh && k.FLW_SECRET_HASH) return safeEqual(vh, k.FLW_SECRET_HASH) ? 'flutterwave' : null
  return null
}

/** What a (signature-checked) webhook is about: a deposit charge or a payout transfer, and our reference. */
export function webhookEvent(p: Provider, body: Record<string, any>): { type: 'charge' | 'transfer' | 'other'; ref: string } {
  const ev = String(body?.event ?? body?.['event.type'] ?? '')
  if (p === 'paystack') {
    if (ev === 'charge.success') return { type: 'charge', ref: String(body.data?.reference ?? '') }
    if (ev.startsWith('transfer.')) return { type: 'transfer', ref: String(body.data?.reference ?? '') }
    return { type: 'other', ref: '' }
  }
  if (ev.startsWith('transfer')) return { type: 'other', ref: '' } // Luda pays out via Paystack only
  const ref = String(body?.data?.tx_ref ?? body?.txRef ?? '')
  return { type: ref ? 'charge' : 'other', ref }
}
