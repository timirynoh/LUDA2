// Automatic mobile top-ups through a partner with an API (v1.22.0, owner's pick). Reloadly is used because it has a
// plain REST API; it only runs for operators the owner has switched on in TOPUP_OPERATORS (after checking in Luda HQ
// that the operator really is the North Cyprus one). Anything it can't do goes to the Luda team's bill queue instead,
// so the user never loses money: the bill stays held until it's paid by the partner or by the team.
type Fetch = typeof fetch

export interface TopupEnv {
  RELOADLY_CLIENT_ID?: string
  RELOADLY_CLIENT_SECRET?: string
  RELOADLY_SANDBOX?: string
  /** App biller id → Reloadly operator id (optionally :country), e.g. "turkcell:1234,telsim:5678:TR". */
  TOPUP_OPERATORS?: string
  TOPUP_MAX_TRY?: string
}

export class TopupRefused extends Error {
  said: string
  constructor(said: string) { super(said); this.said = said }
}

const host = (env: TopupEnv) => (env.RELOADLY_SANDBOX === 'true' ? 'https://topups-sandbox.reloadly.com' : 'https://topups.reloadly.com')

export function topupOperators(env: TopupEnv): Record<string, { id: number; country: string }> {
  const out: Record<string, { id: number; country: string }> = {}
  if (!env.RELOADLY_CLIENT_ID || !env.RELOADLY_CLIENT_SECRET) return out
  for (const part of (env.TOPUP_OPERATORS ?? '').split(',')) {
    const [biller, id, country] = part.trim().split(':')
    if (biller && /^\d+$/.test(id ?? '')) out[biller.toLowerCase()] = { id: Number(id), country: (country || 'TR').toUpperCase() }
  }
  return out
}
export const topupMaxMinor = (env: TopupEnv) => Math.max(10, Number(env.TOPUP_MAX_TRY) || 1000) * 100

/** A KKTC/Turkish mobile number as 90 + 10 digits, or null. */
export function mobileNumber(v: string): string | null {
  let n = String(v).replace(/[^\d]/g, '')
  if (n.startsWith('00')) n = n.slice(2)
  if (n.startsWith('0')) n = '90' + n.slice(1)
  if (n.length === 10 && n.startsWith('5')) n = '90' + n
  return /^905\d{9}$/.test(n) ? n : null
}

let cached: { token: string; until: number; key: string } | null = null
async function token(env: TopupEnv, f: Fetch) {
  const audience = host(env), key = `${env.RELOADLY_CLIENT_ID}|${audience}`
  if (cached && cached.key === key && cached.until > Date.now()) return cached.token
  const r = await f('https://auth.reloadly.com/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: env.RELOADLY_CLIENT_ID, client_secret: env.RELOADLY_CLIENT_SECRET, grant_type: 'client_credentials', audience }),
  })
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; message?: string }
  if (!r.ok || !j.access_token) {
    if (r.status >= 400 && r.status < 500) throw new TopupRefused(`Top-up partner sign-in refused: ${j.message ?? r.status}`)
    throw new Error(`top-up partner sign-in failed (${r.status})`)
  }
  cached = { token: j.access_token, until: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 120) * 1000, key }
  return j.access_token
}

const HDR = (t: string) => ({ authorization: `Bearer ${t}`, accept: 'application/com.reloadly.topups-v1+json', 'content-type': 'application/json' })
const status = (s: unknown): 'paid' | 'processing' | 'failed' => (s === 'SUCCESSFUL' ? 'paid' : s === 'FAILED' || s === 'REFUNDED' ? 'failed' : 'processing')

/**
 * Sends a top-up. A definite refusal (4xx: wrong number, operator, balance…) throws TopupRefused: nothing was sent.
 * A network/5xx error throws a plain Error: the outcome is unknown and must be checked before anyone pays again.
 */
export async function topupSend(env: TopupEnv, f: Fetch, o: { operatorId: number; country: string; amountMinor: number; phone: string; ref: string }) {
  const t = await token(env, f)
  const r = await f(`${host(env)}/topups`, {
    method: 'POST', headers: HDR(t),
    body: JSON.stringify({ operatorId: o.operatorId, amount: o.amountMinor / 100, useLocalAmount: true, customIdentifier: o.ref, recipientPhone: { countryCode: o.country, number: o.phone } }),
  })
  const j = (await r.json().catch(() => ({}))) as { transactionId?: number; status?: string; message?: string; errorCode?: string }
  if (r.status >= 400 && r.status < 500) throw new TopupRefused(j.message ?? j.errorCode ?? `refused (${r.status})`)
  if (!r.ok) throw new Error(`top-up partner error (${r.status})`)
  return { id: String(j.transactionId ?? ''), status: status(j.status ?? 'SUCCESSFUL') }
}

/** The final state of an earlier top-up (by transaction id). */
export async function topupCheck(env: TopupEnv, f: Fetch, id: string) {
  const t = await token(env, f)
  const r = await f(`${host(env)}/topups/${encodeURIComponent(id)}/status`, { headers: HDR(t) })
  const j = (await r.json().catch(() => ({}))) as { status?: string; message?: string }
  if (r.status === 404) return 'failed' as const
  if (!r.ok) throw new Error(`top-up status error (${r.status})`)
  return status(j.status)
}

/** Operators the partner lists for a country, so the owner can check the right North Cyprus operator ids in Luda HQ. */
export async function topupOperatorList(env: TopupEnv, f: Fetch, country: string) {
  const t = await token(env, f)
  const r = await f(`${host(env)}/operators/countries/${encodeURIComponent(country)}`, { headers: HDR(t) })
  if (!r.ok) throw new Error(`operator list error (${r.status})`)
  const j = (await r.json().catch(() => [])) as { operatorId?: number; id?: number; name?: string; denominationType?: string; localMinAmount?: number; localMaxAmount?: number; supportsLocalAmounts?: boolean }[]
  return (Array.isArray(j) ? j : []).map((x) => ({ id: x.operatorId ?? x.id, name: x.name, localAmounts: !!x.supportsLocalAmounts, min: x.localMinAmount ?? null, max: x.localMaxAmount ?? null }))
}
