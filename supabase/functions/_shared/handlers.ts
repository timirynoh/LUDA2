// Request handlers for pay-init, pay-verify and pay-webhook.
// Each Edge Function's index.ts just wires these to Deno.serve with real env + deps.
import { chargeRate } from './fx.ts'
import type { Db, PaymentRow } from './db.ts'
import { priceTicket } from './pricing.ts'
import { checkWebhook, initCheckout, verifyPayment, webhookReference, type Fetch, type Keys, type Provider } from './providers.ts'

export interface Env extends Keys {
  APP_URL: string // where the app is hosted, e.g. https://luda.app (used for the return link)
  ALLOWED_ORIGINS?: string // extra comma-separated origins allowed to call the API (e.g. http://localhost:5173)
  CHARGE_CURRENCY?: string; FX_FIXED_RATE?: string; FX_FALLBACK_RATE?: string; FX_MARGIN?: string
  SELL_OPERATORS?: string // e.g. "virgo,girneliler,kibhas": only these can be bought. Unset = all.
}
export interface Deps { db: Db; fetch?: Fetch; now?: () => Date }

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i
const MAX_PER_HOUR = 10

export function cors(req: Request, env: Env) {
  const origin = req.headers.get('origin') ?? ''
  const allowed = [env.APP_URL, ...(env.ALLOWED_ORIGINS ?? '').split(',')].map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)
  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : allowed[0] ?? '',
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'origin',
  }
}

const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

function providers(env: Env): Provider[] {
  const out: Provider[] = []
  if (env.PAYSTACK_SECRET_KEY) out.push('paystack')
  if (env.FLW_SECRET_KEY) out.push('flutterwave')
  return out
}

function newReference() {
  const b = new Uint8Array(12); crypto.getRandomValues(b)
  return 'luda_' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

/** What the app is allowed to see about a payment. */
const view = (p: PaymentRow) => ({ reference: p.reference, status: p.status, provider: p.provider, purpose: p.purpose, item: p.item, amountMinor: p.amount_minor, currency: p.currency, baseAmount: p.base_amount, baseCurrency: p.base_currency })

/* --------------------------------- pay-init --------------------------------- */

export async function handleInit(req: Request, env: Env, d: Deps): Promise<Response> {
  const h = cors(req, env)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
  if (req.method === 'GET') return json({ providers: providers(env), chargeCurrency: (env.CHARGE_CURRENCY || 'NGN').toUpperCase() }, 200, h)
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, h)
  try {
    const body = await req.json().catch(() => ({})) as Record<string, any>
    const provider = body.provider as Provider
    if (!providers(env).includes(provider)) return json({ error: 'That payment method is not available' }, 400, h)
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!EMAIL.test(email)) return json({ error: 'Enter a valid email for your receipt' }, 400, h)
    if (body.purpose !== 'ticket') return json({ error: 'This item cannot be paid online yet' }, 400, h)

    const now = d.now?.() ?? new Date()
    if (await d.db.recentByEmail(email, new Date(now.getTime() - 3600e3).toISOString()) >= MAX_PER_HOUR)
      return json({ error: 'Too many payment attempts. Try again in an hour.' }, 429, h)

    const priced = priceTicket(body.item ?? {}, now)
    const selling = (env.SELL_OPERATORS ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    if (selling.length && !selling.includes(priced.item.operatorId)) return json({ error: 'Online tickets for this company are coming soon' }, 400, h)
    const fx = await chargeRate(priced.currency, env, d.fetch)
    const amountMinor = Math.ceil(priced.amount * fx.rate * 100)
    const reference = newReference()
    const row: PaymentRow = {
      reference, provider, purpose: 'ticket', status: 'pending', amount_minor: amountMinor, currency: fx.currency,
      base_amount: priced.amount, base_currency: priced.currency, fx_rate: fx.rate, email, item: { ...priced.item, label: priced.label },
    }
    await d.db.insert(row)
    const callbackUrl = `${env.APP_URL.replace(/\/$/, '')}/pay/return?provider=${provider}&ref=${reference}`
    const checkoutUrl = await initCheckout(provider, { reference, amountMinor, currency: fx.currency, email, callbackUrl, title: 'Luda', meta: { purpose: 'ticket', label: priced.label } }, env, d.fetch)
    await d.db.log(reference, 'init', { provider, amountMinor, currency: fx.currency, fx: fx.source })
    return json({ reference, checkoutUrl, amountMinor, currency: fx.currency, baseAmount: priced.amount, baseCurrency: priced.currency }, 200, h)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Something went wrong' }, 400, h)
  }
}

/* ------------------------- shared: confirm with provider ------------------------- */

/** Confirms a payment with the provider and settles it exactly once. Safe to call many times. */
export async function finalize(reference: string, env: Env, d: Deps, source: string): Promise<PaymentRow | null> {
  const p = await d.db.get(reference)
  if (!p || p.status !== 'pending') return p
  const v = await verifyPayment(p.provider, reference, env, d.fetch)
  await d.db.log(reference, source, v)
  if (!v.ok) {
    if (v.status === 'failed') { await d.db.settle(reference, 'failed', v.providerTxId); return { ...p, status: 'failed' } }
    return p // still pending / abandoned: the user may retry on the checkout page
  }
  if (v.reference !== reference || v.currency !== p.currency || v.amountMinor !== p.amount_minor) {
    await d.db.settle(reference, 'mismatch', v.providerTxId)
    await d.db.log(reference, 'mismatch', { expected: { amount: p.amount_minor, currency: p.currency }, got: v })
    return { ...p, status: 'mismatch' }
  }
  if (await d.db.settle(reference, 'paid', v.providerTxId)) await d.db.log(reference, 'paid', { providerTxId: v.providerTxId })
  return { ...p, status: 'paid', provider_tx_id: v.providerTxId }
}

/* -------------------------------- pay-verify -------------------------------- */

export async function handleVerify(req: Request, env: Env, d: Deps): Promise<Response> {
  const h = cors(req, env)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
  const ref = new URL(req.url).searchParams.get('reference') ?? ''
  if (!/^luda_[0-9a-f]{24}$/.test(ref)) return json({ error: 'Unknown payment' }, 404, h)
  try {
    const p = await finalize(ref, env, d, 'verify')
    return p ? json(view(p), 200, h) : json({ error: 'Unknown payment' }, 404, h)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not check the payment' }, 502, h)
  }
}

/* -------------------------------- pay-webhook -------------------------------- */

export async function handleWebhook(req: Request, env: Env, d: Deps): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok')
  const raw = await req.text()
  const provider = await checkWebhook(req.headers, raw, env)
  if (!provider) return new Response('bad signature', { status: 401 })
  let body: Record<string, any> = {}
  try { body = JSON.parse(raw) } catch { return new Response('bad body', { status: 400 }) }
  const ref = webhookReference(provider, body)
  if (!ref) return new Response('ignored') // events we don't act on still get a 200
  await d.db.log(ref, 'webhook', { provider, event: body.event ?? body['event.type'] ?? null })
  try { await finalize(ref, env, d, 'webhook-verify') } catch { return new Response('retry', { status: 500 }) } // provider will retry
  return new Response('ok')
}
