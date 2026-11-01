// Live (real-money) mode: talks to the Luda server (Supabase Edge Function "api").
// Switched on only when VITE_PAY_API is set at build time; otherwise the app is the demo.
// The server owns balances, prices, PIN checks, KYC and limits. This file only calls it.

const BASE = (import.meta.env.VITE_PAY_API as string | undefined)?.replace(/\/$/, '') // https://<project>.supabase.co/functions/v1
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const LIVE = !!BASE

export type Cur = 'NGN' | 'TRY'
export type Provider = 'paystack' | 'flutterwave'
export const PROVIDER_LABEL: Record<Provider, string> = { paystack: 'Paystack', flutterwave: 'Flutterwave' }

export interface Session { access_token: string; refresh_token: string; expires_at: number }
const KEY = 'luda.session'
export const getSession = (): Session | null => { try { return JSON.parse(localStorage.getItem(KEY) ?? 'null') } catch { return null } }
function saveSession(s: { access_token: string; refresh_token: string; expires_in?: number }) {
  localStorage.setItem(KEY, JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: Date.now() + (s.expires_in ?? 3600) * 1000 }))
}
export function clearSession() { localStorage.removeItem(KEY) }

export class ApiError extends Error { status: number; constructor(m: string, status: number) { super(m); this.status = status } }

let refreshing: Promise<boolean> | null = null
async function refreshSession(): Promise<boolean> {
  const s = getSession()
  if (!s) return false
  refreshing ??= raw('POST', 'refresh', { refresh_token: s.refresh_token }, false)
    .then((r: any) => { saveSession(r.session); return true })
    .catch(() => { clearSession(); window.dispatchEvent(new Event('luda:signedout')); return false })
    .finally(() => { refreshing = null })
  return refreshing
}

async function raw<T>(method: string, route: string, body?: unknown, auth = true): Promise<T> {
  if (!BASE) throw new ApiError('Live mode is not set up', 0)
  const s = auth ? getSession() : null
  let r: Response
  try {
    r = await fetch(`${BASE}/api/${route}`, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { 'content-type': 'application/json', ...(ANON ? { apikey: ANON } : {}), ...(s ? { authorization: `Bearer ${s.access_token}` } : {}) },
    })
  } catch { throw new ApiError("Can't reach Luda. Check your internet connection.", 0) }
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(j.error || `Server error (${r.status})`, r.status)
  return j as T
}

/** Signed-in API call. Renews the session automatically when it expires. */
export async function api<T = any>(method: 'GET' | 'POST', route: string, body?: unknown): Promise<T> {
  const s = getSession()
  if (s && s.expires_at - Date.now() < 60_000) await refreshSession()
  try { return await raw<T>(method, route, body) } catch (e) {
    if (e instanceof ApiError && e.status === 401 && /sign in/i.test(e.message) && (await refreshSession())) return raw<T>(method, route, body)
    throw e
  }
}

export async function liveSignUp(f: { email: string; username: string; fullName: string; password: string; country?: string }) {
  const r = await raw<{ session: any; needsConfirm: boolean }>('POST', 'signup', f, false)
  if (r.session) saveSession(r.session)
  return r
}
export async function liveSignIn(id: string, password: string) {
  const r = await raw<{ session: any }>('POST', 'login', { id, password }, false)
  saveSession(r.session)
}
/** Supabase project address, derived from the API address (…/functions/v1). */
const SUPABASE_URL = BASE?.replace(/\/functions\/v1$/, '')

/** Continue with Google: Supabase Auth sends the user to Google and back to this app with a session. */
export function googleSignIn() {
  if (!SUPABASE_URL) return
  window.location.assign(`${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(window.location.origin + '/')}`)
}

/** After Google sends the user back (#access_token=…), keep the session and clean the address bar. */
export function takeOAuthReturn(): boolean {
  if (!LIVE || !window.location.hash.includes('access_token=') || window.location.hash.includes('type=recovery')) return false
  const h = new URLSearchParams(window.location.hash.slice(1))
  const access_token = h.get('access_token'), refresh_token = h.get('refresh_token')
  history.replaceState(null, '', window.location.pathname)
  if (!access_token || !refresh_token) return false
  saveSession({ access_token, refresh_token, expires_in: Number(h.get('expires_in') ?? 3600) })
  return true
}

/** Live check for the sign-up form: true = free, false = already registered, null = not valid yet. */
export const checkAvailable = (username: string, email: string) =>
  raw<{ username: boolean | null; email: boolean | null }>('GET', `available?username=${encodeURIComponent(username)}&email=${encodeURIComponent(email)}`, undefined, false)

export const liveRecover = (email: string) => raw('POST', 'recover', { email }, false)
export async function liveSetPassword(accessToken: string, password: string) {
  await raw('POST', 'password', { access_token: accessToken, password }, false)
}

/* ------------------------------- data types ------------------------------- */

export interface LedgerRow { id: number; currency: Cur; amount_minor: number; balance_after: number; kind: string; ref: string; meta: Record<string, any> | null; at: string }
export interface LiveTicket { id: string; code: string; item: Record<string, any>; base_amount: number; paid_minor: number; paid_currency: Cur; status: string; created_at: string }
export interface LiveWithdrawal { reference: string; amount_minor: number; fee_minor: number; bank_name: string | null; account_number: string; account_name: string; status: 'processing' | 'paid' | 'failed' | 'reversed'; created_at: string }
export interface LiveDeposit { reference: string; provider: Provider; status: 'pending' | 'paid' | 'failed' | 'mismatch'; chargeMinor: number; currency: string; feeMinor: number; creditMinor: number; creditCurrency: Cur; createdAt: string; paidAt: string | null }
export interface Me {
  profile: { username: string; fullName: string; email: string; kyc: 'none' | 'pending' | 'verified' | 'failed'; kycName: string | null; hasPin: boolean; frozen: boolean; frozenBy: 'user' | 'admin' | null; phone: string | null; phoneVerified: boolean; moneyHoldUntil: string | null }
  balances: Record<Cur, number>
  history: LedgerRow[]
  tickets: LiveTicket[]
  withdrawals: LiveWithdrawal[]
  deposits: LiveDeposit[]
}
export interface LiveConfig { google: boolean; sms: boolean; didit: boolean; nin: boolean; providers: Provider[]; foreign: string[]; payouts: boolean; kyc: boolean; limits: Record<string, any>; fees: { withdraw: number } }

let cfg: Promise<LiveConfig> | null = null
export const liveConfig = () => (cfg ??= raw<LiveConfig>('GET', 'config', undefined, false).catch((e) => { cfg = null; throw e }))

/** Formats minor units: 1025000 NGN → ₦10,250 */
const SYMBOL: Record<string, string> = { NGN: '₦', TRY: '₺', USD: '$', GHS: 'GH₵', KES: 'KSh ', UGX: 'USh ', ZMW: 'ZK ', XAF: 'FCFA ' }
export function money(minor: number, cur: string, opts: { sign?: boolean } = {}) {
  const v = minor / 100
  const s = (SYMBOL[cur] ?? cur + ' ') + Math.abs(v).toLocaleString('en-GB', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })
  return opts.sign ? (minor < 0 ? '−' : '+') + s : (minor < 0 ? '−' : '') + s
}

/** Top-up currencies other than Naira (Flutterwave), credited to the Lira wallet. */
export const FOREIGN_CURRENCIES: Record<string, { flag: string; name: string; quick: number[]; how: string }> = {
  USD: { flag: '🇺🇸', name: 'US dollar', quick: [20, 50, 100, 200], how: 'Visa / Mastercard' },
  GHS: { flag: '🇬🇭', name: 'Ghana cedi', quick: [200, 500, 1000, 2000], how: 'Card · MTN / Telecel / AirtelTigo MoMo' },
  KES: { flag: '🇰🇪', name: 'Kenyan shilling', quick: [2000, 5000, 10000, 20000], how: 'Card · M-Pesa' },
  UGX: { flag: '🇺🇬', name: 'Ugandan shilling', quick: [50000, 100000, 200000, 500000], how: 'Card · MTN / Airtel mobile money' },
  ZMW: { flag: '🇿🇲', name: 'Zambian kwacha', quick: [300, 500, 1000, 2000], how: 'Card · mobile money' },
  XAF: { flag: '🇨🇲', name: 'CFA franc', quick: [10000, 25000, 50000, 100000], how: 'Card · MTN / Orange mobile money' },
}

export const KIND_LABEL: Record<string, string> = {
  deposit: 'Top-up', withdraw: 'Withdrawal', withdraw_fee: 'Withdrawal fee', withdraw_reversal: 'Withdrawal refunded',
  convert: 'Conversion', send: 'Sent', receive: 'Received', ticket: 'Ticket',
}

/* ----------------------------- pending deposit ----------------------------- */
export const PENDING_KEY = 'luda.pending.deposit'
