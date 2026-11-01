// Luda money API (Edge Function "api") and the provider webhook (Edge Function "pay-webhook").
// Rules: the server owns every balance and price; money moves only through the SQL
// functions (atomic, idempotent); deposits are confirmed with the provider before
// crediting; spending needs the user's PIN; withdrawing and sending need KYC.
import { hashPin, randomHex, recover, refresh, setPassword, signIn, signUp, userFromToken, type AuthEnv } from './auth.ts'
import { b64u, checkRegistration, verifyAssertion, WebAuthnError, type Assertion } from './webauthn.ts'
import { MoneyError, type Db, type PaymentRow, type Profile, type WithdrawalRow } from './db.ts'
import { accountMatchesName, idMatchesName, kycEnabled, lookupId, normDate, type KycEnv } from './kyc.ts'
import { CURRENCIES, FOREIGN, LIMITS, convertOut, costIn, depositFee, foreignEnabled, foreignFee, margin, ngnPerTry, perTry, withdrawFee, type Cur, type FeeEnv, type FxEnv } from './money.ts'
import { checkTransfer, createRecipient, listBanks, resolveAccount, sendTransfer } from './payouts.ts'
import { priceTicket } from './pricing.ts'
import { checkCode, normPhone, sendCode, smsEnabled, type SmsEnv } from './sms.ts'
import { checkWebhook, initCheckout, verifyPayment, webhookEvent, type Fetch, type Keys, type Provider } from './providers.ts'

export interface Env extends Keys, FeeEnv, FxEnv, KycEnv, SmsEnv {
  APP_URL: string
  ALLOWED_ORIGINS?: string
  SUPABASE_URL: string
  AUTH_KEY: string // key used to talk to Supabase Auth
  SELL_OPERATORS?: string
  FOREIGN_CURRENCIES?: string; FOREIGN_FEE_PCT?: string; FX_TRY_RATES?: string
}
export interface Deps { db: Db; fetch?: Fetch; now?: () => Date }

/* --------------------------------- helpers --------------------------------- */

let authSettings: { at: number; google: boolean } | null = null
/** Is "Continue with Google" switched on in Supabase Auth? (cached 5 min) */
async function googleEnabled(env: Env, d: Deps) {
  if (authSettings && Date.now() - authSettings.at < 300e3) return authSettings.google
  try {
    const r = await (d.fetch ?? fetch)(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: env.AUTH_KEY }, signal: AbortSignal.timeout(5000) })
    const j = (await r.json()) as { external?: Record<string, boolean> }
    authSettings = { at: Date.now(), google: !!j.external?.google }
  } catch { authSettings = { at: Date.now(), google: false } }
  return authSettings.google
}

class Fail extends Error { status: number; constructor(msg: string, status = 400) { super(msg); this.status = status } }

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
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } })

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i
const USERNAME = /^[a-z0-9_.]{3,20}$/
const newRef = (p: string) => `${p}_${randomHex(12)}`
const authEnv = (env: Env): AuthEnv => ({ SUPABASE_URL: env.SUPABASE_URL, AUTH_KEY: env.AUTH_KEY })
const int = (v: unknown) => (typeof v === 'number' && Number.isSafeInteger(v) ? v : NaN)
const isCur = (c: unknown): c is Cur => CURRENCIES.includes(c as Cur)
const providers = (env: Env): Provider[] => [env.PAYSTACK_SECRET_KEY && 'paystack', env.FLW_SECRET_KEY && 'flutterwave'].filter(Boolean) as Provider[]
const naira = (minor: number) => `₦${(minor / 100).toLocaleString('en-NG')}`
const ticketCode = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', b = new Uint8Array(8); crypto.getRandomValues(b); return [...b].map((x) => a[x % 32]).join('') }

function moneyMsg(e: unknown): never {
  if (e instanceof MoneyError) {
    if (e.message === 'insufficient_funds') throw new Fail('Not enough money in your wallet')
    if (e.message === 'account_frozen') throw new Fail('Your account is on hold. Contact Luda support.', 403)
  }
  throw e
}

async function verifyPin(p: Profile, pin: unknown, d: Deps) {
  const now = d.now?.() ?? new Date()
  if (!p.pin_hash || !p.pin_salt) throw new Fail('Set your Luda PIN first')
  if (p.pin_locked_until && new Date(p.pin_locked_until) > now) throw new Fail('Too many wrong PINs. Try again in 15 minutes.', 429)
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin) || (await hashPin(pin, p.pin_salt)) !== p.pin_hash) {
    const fails = p.pin_fails + 1
    await d.db.updateProfile(p.user_id, fails >= 5 ? { pin_fails: 0, pin_locked_until: new Date(now.getTime() + 15 * 60e3).toISOString() } : { pin_fails: fails })
    throw new Fail(fails >= 5 ? 'Too many wrong PINs. Locked for 15 minutes.' : `Wrong PIN (${5 - fails} tries left)`, 401)
  }
  if (p.pin_fails) await d.db.updateProfile(p.user_id, { pin_fails: 0, pin_locked_until: null })
}

/** Where fingerprint approvals may come from: the app's own address(es). */
function webauthnSite(env: Env) {
  const origins = [env.APP_URL, ...(env.ALLOWED_ORIGINS ?? '').split(',')].map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)
  return { origins, rpId: new URL(origins[0] || 'https://localhost').hostname }
}

/** Approve a money action with the PIN, or with this phone's fingerprint (server-verified passkey). */
async function verifyAuth(p: Profile, body: Body, env: Env, d: Deps) {
  if (!body.bio) return verifyPin(p, body.pin, d)
  const a = body.bio as Assertion
  const now = d.now?.() ?? new Date()
  if (!p.bio_challenge || !p.bio_challenge_exp || new Date(p.bio_challenge_exp) < now) throw new Fail('Fingerprint check expired. Try again.', 401)
  const key = (await d.db.passkeys(p.user_id)).find((k) => k.id === a.id)
  await d.db.updateProfile(p.user_id, { bio_challenge: null, bio_challenge_exp: null }) // single use
  if (!key) throw new Fail('This fingerprint isn\'t set up for your account. Use your PIN.', 401)
  try {
    const count = await verifyAssertion(key, a, { challenge: p.bio_challenge, ...webauthnSite(env) })
    await d.db.setPasskeyCounter(key.id, count)
  } catch (e) {
    if (e instanceof WebAuthnError) throw new Fail('Fingerprint check failed. Use your PIN.', 401)
    throw e
  }
}

/** Caller's IP (for rate limits), as forwarded by Supabase's edge. */
const clientIp = (req: Request) => (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim()

async function limit(d: Deps, key: string, max: number, seconds: number, msg = 'Too many attempts. Please wait a few minutes and try again.') {
  if (!(await d.db.hit(key, max, seconds))) throw new Fail(msg, 429)
}

/** After a password reset, money can't leave the account for 24 hours (stops account takeovers cashing out). */
function noHold(p: Profile, d: Deps) {
  const until = p.money_hold_until ? new Date(p.money_hold_until) : null
  if (until && until > (d.now?.() ?? new Date())) {
    throw new Fail(`For your safety, withdrawals and sending are paused until ${until.toUTCString().slice(5, 22)} UTC because your password was just reset.`, 403)
  }
}

const needKyc = (p: Profile, what: string) => { if (p.kyc_status !== 'verified') throw new Fail(`Verify your identity to ${what}`, 403) }

/** Loads (or, on first use, creates) the signed-in user's profile. */
async function me(req: Request, env: Env, d: Deps): Promise<Profile> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const u = await userFromToken(token, authEnv(env), d.fetch)
  if (!u) throw new Fail('Please sign in again', 401)
  const p = await d.db.profile(u.id)
  if (p) return p
  const meta = u.user_metadata ?? {}
  const base = String(meta.username ?? u.email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20).padEnd(3, '0')
  const fullName = String(meta.full_name ?? meta.name ?? base).replace(/\s+/g, ' ').trim().slice(0, 80) // Google gives full_name / name
  for (const username of [base, `${base.slice(0, 15)}${randomHex(2)}`, `${base.slice(0, 13)}${randomHex(3)}`]) {
    const made = await d.db.createProfile({ user_id: u.id, username, full_name: fullName.length >= 2 ? fullName : username, email: u.email, country: meta.country ? String(meta.country) : undefined })
    if (made !== 'taken') return made
    const again = await d.db.profile(u.id) // created by a parallel request
    if (again) return again
  }
  if (await d.db.profileByEmail(u.email)) throw new Fail('An account with this email already exists. Sign in with your password instead.', 409)
  throw new Fail('Could not create your profile, try again')
}

/* ------------------------------ deposits (in) ------------------------------ */

/** Confirms a deposit with the provider and credits the wallet exactly once. Safe to call repeatedly. */
export async function finalizeDeposit(reference: string, env: Env, d: Deps, source: string): Promise<PaymentRow | null> {
  const p = await d.db.get(reference)
  if (!p || p.status !== 'pending') return p
  const v = await verifyPayment(p.provider, reference, env, d.fetch)
  await d.db.log(reference, source, v)
  if (!v.ok) {
    if (v.status === 'failed') { await d.db.settle(reference, 'failed', v.providerTxId); return { ...p, status: 'failed' } }
    return p
  }
  if (v.reference !== reference || v.currency !== p.currency || v.amountMinor !== p.amount_minor) {
    await d.db.settle(reference, 'mismatch', v.providerTxId)
    await d.db.log(reference, 'mismatch', { expected: { amount: p.amount_minor, currency: p.currency }, got: v })
    return { ...p, status: 'mismatch' }
  }
  await d.db.depositPaid(reference, v.providerTxId)
  await d.db.log(reference, 'paid', { providerTxId: v.providerTxId })
  return { ...p, status: 'paid' }
}

/* ----------------------------- withdrawals (out) ----------------------------- */

/** Asks Paystack for a withdrawal's final status; refunds the wallet if it failed. */
export async function settleWithdrawal(w: WithdrawalRow, env: Env, d: Deps): Promise<WithdrawalRow['status']> {
  if (w.status !== 'processing' && w.status !== 'paid') return w.status
  const t = await checkTransfer(env.PAYSTACK_SECRET_KEY!, w.reference, d.fetch)
  if (t.reference && t.reference !== w.reference) return w.status
  if (t.status === 'processing' || t.status === w.status) return w.status
  await d.db.withdrawSettle(w.reference, t.status, t.transferCode, null)
  await d.db.log(w.reference, `withdraw_${t.status}`)
  return t.status
}

/* ---------------------------------- api ---------------------------------- */

type Body = Record<string, any>
type Route = (ctx: { req: Request; env: Env; d: Deps; body: Body; url: URL }) => Promise<unknown>

const routes: Record<string, Route> = {
  /* ---- public ---- */
  'GET config': async ({ env, d }) => ({ google: await googleEnabled(env, d), sms: smsEnabled(env), providers: providers(env), foreign: env.FLW_SECRET_KEY ? foreignEnabled(env) : [], payouts: !!env.PAYSTACK_SECRET_KEY, kyc: kycEnabled(env), limits: LIMITS, fees: { withdraw: withdrawFee(env) } }),

  'GET username': async ({ d, url }) => {
    const u = (url.searchParams.get('u') ?? '').toLowerCase()
    return { free: USERNAME.test(u) && !(await d.db.profileByUsername(u)) }
  },

  // Live check on the sign-up form: is this username / email already registered?
  'GET available': async ({ req, d, url }) => {
    await limit(d, `avail-ip:${clientIp(req)}`, 60, 600)
    const u = (url.searchParams.get('username') ?? '').trim().toLowerCase().replace(/^@/, '')
    const e = (url.searchParams.get('email') ?? '').trim().toLowerCase()
    return {
      username: u ? (USERNAME.test(u) ? !(await d.db.profileByUsername(u)) : null) : null,
      email: e ? (EMAIL.test(e) ? !(await d.db.profileByEmail(e)) : null) : null,
    }
  },

  'POST signup': async ({ req, env, d, body }) => {
    await limit(d, `signup-ip:${clientIp(req)}`, 5, 3600, 'Too many new accounts from this network. Try again later.')
    const email = String(body.email ?? '').trim().toLowerCase(), username = String(body.username ?? '').trim().toLowerCase()
    const fullName = String(body.fullName ?? '').trim().replace(/\s+/g, ' ')
    if (!EMAIL.test(email)) throw new Fail('Enter a valid email')
    if (!USERNAME.test(username)) throw new Fail('Username: 3–20 letters, numbers, _ or .')
    if (fullName.length < 3 || !fullName.includes(' ')) throw new Fail('Enter your full name as on your ID (first and last name)')
    if (typeof body.password !== 'string' || body.password.length < 8) throw new Fail('Password must be at least 8 characters')
    if (await d.db.profileByUsername(username)) throw new Fail('That username is already taken. Try another one.', 409)
    if (await d.db.profileByEmail(email)) throw new Fail('An account with this email already exists. Sign in instead.', 409)
    const r = await signUp(email, body.password, { username, full_name: fullName, country: body.country ?? null }, authEnv(env), d.fetch).catch((e) => { throw new Fail(e instanceof Error ? e.message : 'Sign-up failed') })
    // Reserve the username now (if two people race for it, the loser gets a suffix on first sign-in).
    if (r.userId) await d.db.createProfile({ user_id: r.userId, username, full_name: fullName, email, country: body.country ? String(body.country).slice(0, 2) : undefined }).catch(() => {})
    return { session: r.session, needsConfirm: !r.session }
  },

  'POST login': async ({ req, env, d, body }) => {
    const id = String(body.id ?? '').trim().toLowerCase().replace(/^@/, '')
    // Stop password guessing: per account and per network.
    await limit(d, `login:${id}`, 8, 900, 'Too many sign-in attempts for this account. Wait 15 minutes or reset your password.')
    await limit(d, `login-ip:${clientIp(req)}`, 30, 900)
    let email = id
    if (!id.includes('@')) {
      const p = USERNAME.test(id) ? await d.db.profileByUsername(id) : null
      if (!p) throw new Fail('Wrong username/email or password', 401)
      email = p.email
    }
    try { return { session: await signIn(email, String(body.password ?? ''), authEnv(env), d.fetch) } } catch (e) { throw new Fail(e instanceof Error ? e.message : 'Sign-in failed', 401) }
  },

  'POST refresh': async ({ env, d, body }) => {
    try { return { session: await refresh(String(body.refresh_token ?? ''), authEnv(env), d.fetch) } } catch { throw new Fail('Session expired, please sign in again', 401) }
  },

  'POST recover': async ({ req, env, d, body }) => {
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!EMAIL.test(email)) throw new Fail('Enter a valid email')
    await limit(d, `recover:${email}`, 3, 3600); await limit(d, `recover-ip:${clientIp(req)}`, 10, 3600)
    await recover(email, `${env.APP_URL.replace(/\/$/, '')}/reset`, authEnv(env), d.fetch)
    return { ok: true }
  },

  'POST password': async ({ env, d, body }) => {
    if (typeof body.password !== 'string' || body.password.length < 8) throw new Fail('Password must be at least 8 characters')
    const token = String(body.access_token ?? '')
    const u = await userFromToken(token, authEnv(env), d.fetch)
    await setPassword(token, body.password, authEnv(env), d.fetch).catch((e) => { throw new Fail(e instanceof Error ? e.message : 'Could not change password') })
    if (u) await d.db.updateProfile(u.id, { money_hold_until: new Date((d.now?.() ?? new Date()).getTime() + 24 * 3600e3).toISOString() })
    return { ok: true, moneyPausedHours: 24 }
  },

  /* ---- signed in ---- */
  'GET me': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    const [balances, history, tickets, withdrawals] = await Promise.all([d.db.balances(p.user_id), d.db.history(p.user_id, 40), d.db.tickets(p.user_id, 30), d.db.withdrawals(p.user_id, 10)])
    return {
      profile: { username: p.username, fullName: p.full_name, email: p.email, kyc: p.kyc_status, kycName: p.kyc_name, hasPin: !!p.pin_hash, frozen: p.frozen, frozenBy: p.frozen_by ?? null, phone: p.phone ? p.phone.slice(0, 4) + '•••' + p.phone.slice(-3) : null, phoneVerified: !!p.phone_verified_at, moneyHoldUntil: p.money_hold_until ?? null },
      balances, history, tickets, withdrawals: withdrawals.map((w) => ({ ...w, account_number: '••••' + w.account_number.slice(-4), recipient_code: undefined })),
    }
  },

  'POST pin': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    if (typeof body.pin !== 'string' || !/^\d{4}$/.test(body.pin) || /^(\d)\1{3}$|^(0123|1234|2345|3456|4567|5678|6789)$/.test(body.pin)) throw new Fail('Choose a 4-digit PIN that is not easy to guess')
    if (p.pin_hash) await verifyPin(p, body.oldPin, d)
    const salt = randomHex(16)
    await d.db.updateProfile(p.user_id, { pin_salt: salt, pin_hash: await hashPin(body.pin, salt), pin_fails: 0, pin_locked_until: null })
    return { ok: true }
  },

  'GET rate': async ({ env, d }) => { const mid = await ngnPerTry(env, d.fetch); return { ngnPerTry: mid, margin: margin(env) } },

  // Top up: Naira (Paystack / Flutterwave) → Naira wallet; other currencies (Flutterwave) → Lira wallet.
  // The user always pays the provider fee on top, so the quoted amount lands in full.
  'POST deposit': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const provider = body.provider as Provider
    if (!providers(env).includes(provider)) throw new Fail('That payment method is not available')
    const cur = String(body.currency ?? 'NGN').toUpperCase()
    const amount = int(body.amountMinor)
    const now = d.now?.() ?? new Date(), dayAgo = new Date(now.getTime() - 864e5).toISOString()
    const verified = p.kyc_status === 'verified', more = verified ? '' : '. Verify your identity to raise it.'
    if ((await d.db.recentByEmail(p.email, new Date(now.getTime() - 3600e3).toISOString())) >= 10) throw new Fail('Too many top-up attempts. Try again in an hour.', 429)
    let credit: number, creditCur: Cur, fee: number, rate = 1, paymentOptions: string | undefined
    if (cur === 'NGN') {
      if (!(amount >= LIMITS.minDeposit) || amount > LIMITS.maxDepositOnce || amount % 100) throw new Fail(`Enter a whole amount between ${naira(LIMITS.minDeposit)} and ${naira(LIMITS.maxDepositOnce)}`)
      const lim = verified ? LIMITS.verified : LIMITS.unverified
      if ((await d.db.depositedSince(p.user_id, dayAgo, 'NGN')) + amount > lim.depositDay) throw new Fail(`Daily top-up limit is ${naira(lim.depositDay)}${more}`)
      if ((await d.db.balances(p.user_id)).NGN + amount > lim.maxBalanceNGN) throw new Fail(`Your Naira wallet can hold up to ${naira(lim.maxBalanceNGN)}${more}`)
      credit = amount; creditCur = 'NGN'; fee = depositFee(amount, env)
    } else {
      if (!FOREIGN[cur] || !foreignEnabled(env).includes(cur)) throw new Fail('Top-ups in that currency are not available')
      if (provider !== 'flutterwave') throw new Fail(`${FOREIGN[cur].name} top-ups go through Flutterwave`)
      if (!(amount > 0) || amount % 100) throw new Fail('Enter a whole amount')
      rate = await perTry(cur, env, d.fetch) // units of cur per ₺1
      credit = Math.floor((amount / rate) * (1 - margin(env))); creditCur = 'TRY'
      const lim = verified ? LIMITS.foreign.verified : LIMITS.foreign.unverified
      const lira = (k: number) => `₺${(k / 100).toLocaleString('en-GB')}`
      if (credit < LIMITS.foreign.minCreditTRY) throw new Fail(`Minimum top-up is about ${lira(LIMITS.foreign.minCreditTRY)}`)
      if ((await d.db.depositedSince(p.user_id, dayAgo, 'TRY')) + credit > lim.depositDayTRY) throw new Fail(`Daily top-up limit is ${lira(lim.depositDayTRY)}${more}`)
      if ((await d.db.balances(p.user_id)).TRY + credit > lim.maxBalanceTRY) throw new Fail(`Your Lira wallet can hold up to ${lira(lim.maxBalanceTRY)}${more}`)
      fee = foreignFee(amount, env); paymentOptions = FOREIGN[cur].options
    }
    const reference = newRef('dep')
    await d.db.insert({
      reference, provider, purpose: 'deposit', status: 'pending', amount_minor: amount + fee, currency: cur, base_amount: amount / 100, base_currency: cur, fx_rate: rate,
      email: p.email, item: { type: 'deposit' }, user_id: p.user_id, fee_minor: fee, credit_minor: credit, credit_currency: creditCur,
    })
    const callbackUrl = `${env.APP_URL.replace(/\/$/, '')}/pay/return?provider=${provider}&ref=${reference}`
    const checkoutUrl = await initCheckout(provider, { reference, amountMinor: amount + fee, currency: cur, email: p.email, callbackUrl, title: 'Luda wallet top-up', meta: { purpose: 'deposit', username: p.username }, paymentOptions }, env, d.fetch)
    await d.db.log(reference, 'init', { provider, cur, amount, fee, credit, creditCur })
    return { reference, checkoutUrl, currency: cur, amountMinor: amount, feeMinor: fee, chargeMinor: amount + fee, creditMinor: credit, creditCurrency: creditCur }
  },

  'GET deposit': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    const ref = url.searchParams.get('ref') ?? ''
    const row = await d.db.get(ref)
    if (!row || row.user_id !== p.user_id) throw new Fail('Unknown payment', 404)
    const done = await finalizeDeposit(ref, env, d, 'verify')
    return { reference: ref, status: done?.status, creditMinor: row.credit_minor, creditCurrency: row.credit_currency ?? 'NGN', chargeMinor: row.amount_minor, currency: row.currency, provider: row.provider }
  },

  // Naira ⇄ Lira inside Luda at today's rate minus Luda's margin.
  'POST convert': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const from = body.from, to = body.to, amount = int(body.amountMinor)
    if (!isCur(from) || !isCur(to) || from === to) throw new Fail('Pick two different currencies')
    if (!(amount > 0)) throw new Fail('Enter an amount')
    await verifyAuth(p, body, env, d)
    if ((await d.db.spent(p.user_id, from, ['convert'], 24)) + amount > LIMITS.convertDay[from]) throw new Fail('Daily conversion limit reached')
    const mid = await ngnPerTry(env, d.fetch), m = margin(env)
    const out = convertOut(from, to, amount, mid, m)
    if (out <= 0) throw new Fail('Amount too small to convert')
    // The user saw a quote; refuse if the rate moved against them by more than 1%.
    const seen = int(body.expectMinor)
    if (seen > 0 && out < seen * 0.99) throw new Fail('The rate just changed. Check the new amount and try again.', 409)
    const ref = newRef('cvt')
    try {
      await d.db.post([
        { user_id: p.user_id, currency: from, amount_minor: -amount, kind: 'convert', ref, meta: { to, rate: mid, margin: m } },
        { user_id: p.user_id, currency: to, amount_minor: out, kind: 'convert', ref, meta: { from, rate: mid, margin: m } },
      ])
    } catch (e) { moneyMsg(e) }
    return { ok: true, receivedMinor: out, currency: to }
  },

  // Bus / airport ticket paid from the wallet (Lira, or Naira at today's rate).
  'POST ticket': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const cur = body.currency
    if (!isCur(cur)) throw new Fail('Pick a wallet')
    const priced = priceTicket({ ...(body.item ?? {}), holder: p.full_name }, d.now?.() ?? new Date())
    const selling = (env.SELL_OPERATORS ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    if (selling.length && !selling.includes(priced.item.operatorId)) throw new Fail('Online tickets for this company are coming soon')
    await verifyAuth(p, body, env, d)
    const mid = cur === 'NGN' ? await ngnPerTry(env, d.fetch) : 1
    const cost = costIn(cur, priced.amount, mid, margin(env))
    const seen = int(body.expectMinor)
    if (seen > 0 && cost > seen * 1.01) throw new Fail('The rate just changed. Check the new price and try again.', 409)
    try {
      const t = await d.db.buyTicket(p.user_id, cur, cost, priced.amount, ticketCode(), { ...priced.item, label: priced.label })
      return { ticket: t }
    } catch (e) { moneyMsg(e) }
  },

  // Look up who you're sending to (shows their name before you confirm).
  'GET user': async ({ req, env, d, url }) => {
    await me(req, env, d)
    const u = await d.db.profileByUsername((url.searchParams.get('u') ?? '').toLowerCase().replace(/^@/, ''))
    if (!u) throw new Fail('No Luda user with that username', 404)
    return { username: u.username, fullName: u.full_name, verified: u.kyc_status === 'verified' }
  },

  'POST send': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    needKyc(p, 'send money'); noHold(p, d)
    const cur = body.currency, amount = int(body.amountMinor)
    if (!isCur(cur)) throw new Fail('Pick a wallet')
    if (!(amount >= LIMITS.minSend[cur])) throw new Fail('Amount too small')
    const to = await d.db.profileByUsername(String(body.to ?? '').toLowerCase().replace(/^@/, ''))
    if (!to) throw new Fail('No Luda user with that username', 404)
    if (to.user_id === p.user_id) throw new Fail("You can't send money to yourself")
    await verifyAuth(p, body, env, d)
    if ((await d.db.spent(p.user_id, cur, ['send'], 24)) + amount > LIMITS.sendDay[cur]) throw new Fail('Daily sending limit reached')
    const note = String(body.note ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 80)
    const ref = newRef('snd')
    try {
      await d.db.post([
        { user_id: p.user_id, currency: cur, amount_minor: -amount, kind: 'send', ref, meta: { to: to.username, note } },
        { user_id: to.user_id, currency: cur, amount_minor: amount, kind: 'receive', ref, meta: { from: p.username, note } },
      ])
    } catch (e) { moneyMsg(e) }
    return { ok: true, to: to.username }
  },

  'POST kyc': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    if (p.kyc_status === 'verified') return { status: 'verified', name: p.kyc_name }
    if (!kycEnabled(env)) throw new Fail('Identity checks are not switched on yet', 503)
    const type = body.type === 'bvn' ? 'bvn' : body.type === 'nin' ? 'nin' : null
    const number = String(body.number ?? '').replace(/\D/g, ''), dob = normDate(String(body.dob ?? ''))
    if (!type || number.length !== 11) throw new Fail('Enter your 11-digit NIN or BVN')
    if (!dob) throw new Fail('Enter your date of birth')
    const today = (d.now?.() ?? new Date()).toISOString().slice(0, 10)
    const tries = p.kyc_tries_day === today ? p.kyc_tries : 0
    if (tries >= 3) throw new Fail('Too many attempts today. Try again tomorrow or contact support.', 429)
    await d.db.updateProfile(p.user_id, { kyc_tries: tries + 1, kyc_tries_day: today })
    const id = await lookupId(type, number, env, d.fetch)
    if (!id) throw new Fail(`We couldn't find that ${type.toUpperCase()}. Check the number.`)
    if (id.dob !== dob) { await d.db.updateProfile(p.user_id, { kyc_status: 'failed' }); throw new Fail("Date of birth doesn't match your ID") }
    if (!idMatchesName(id, p.full_name)) {
      await d.db.updateProfile(p.user_id, { kyc_status: 'failed' })
      throw new Fail(`The name on your ${type.toUpperCase()} doesn't match "${p.full_name}". Contact support to correct your Luda name.`)
    }
    const legal = [id.firstName, id.middleName, id.lastName].filter(Boolean).join(' ').toUpperCase()
    await d.db.updateProfile(p.user_id, { kyc_status: 'verified', kyc_name: legal, kyc_dob: dob, kyc_id_type: type, kyc_id_last4: number.slice(-4), kyc_at: new Date().toISOString() } as Partial<Profile>)
    return { status: 'verified', name: legal }
  },

  // Fingerprint / Face ID: a fresh one-time challenge (and this user's registered phones).
  'GET bio': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    const challenge = b64u.enc(crypto.getRandomValues(new Uint8Array(32)))
    await d.db.updateProfile(p.user_id, { bio_challenge: challenge, bio_challenge_exp: new Date((d.now?.() ?? new Date()).getTime() + 120e3).toISOString() })
    const keys = await d.db.passkeys(p.user_id)
    return { challenge, rpId: webauthnSite(env).rpId, userId: b64u.enc(new TextEncoder().encode(p.user_id)), username: p.username, fullName: p.full_name, keys: keys.map((k) => ({ id: k.id, device: k.device, created_at: k.created_at })) }
  },

  // Register this phone's fingerprint. Needs the PIN, so a stolen session can't add its own.
  'POST bio': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await verifyPin(p, body.pin, d)
    if (!p.bio_challenge || !p.bio_challenge_exp || new Date(p.bio_challenge_exp) < (d.now?.() ?? new Date())) throw new Fail('Setup expired. Try again.')
    await d.db.updateProfile(p.user_id, { bio_challenge: null, bio_challenge_exp: null })
    const id = String(body.id ?? ''), publicKey = String(body.publicKey ?? ''), alg = Number(body.alg)
    if (!/^[\w-]{16,1400}$/.test(id) || !/^[\w-]{60,2000}$/.test(publicKey) || ![-7, -257].includes(alg)) throw new Fail('This phone\'s fingerprint can\'t be used with Luda')
    try { checkRegistration(String(body.clientDataJSON ?? ''), { challenge: p.bio_challenge, ...webauthnSite(env) }) } catch { throw new Fail('Fingerprint setup failed. Try again.') }
    if ((await d.db.passkeys(p.user_id)).length >= 5) throw new Fail('You can use fingerprint on up to 5 phones. Remove one first.')
    await d.db.addPasskey({ id, user_id: p.user_id, public_key: publicKey, alg, device: String(body.device ?? '').slice(0, 60) })
    return { ok: true }
  },

  'POST bio-remove': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await d.db.removePasskey(p.user_id, String(body.id ?? ''))
    return { ok: true }
  },

  // Phone number: one Luda account per number, proven by an SMS code (Twilio Verify).
  'POST phone-start': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    if (!smsEnabled(env)) throw new Fail('Phone checks are not switched on yet', 503)
    const phone = normPhone(String(body.phone ?? ''))
    if (!phone) throw new Fail('Enter your number with the country code, e.g. +90 533 123 4567')
    const owner = await d.db.profileByPhone(phone)
    if (owner && owner.user_id !== p.user_id) throw new Fail('This phone number is already used by another Luda account', 409)
    await limit(d, `sms-user:${p.user_id}`, 3, 3600, 'Too many codes requested. Try again in an hour.')
    await limit(d, `sms-phone:${phone}`, 5, 86400, 'Too many codes sent to this number today.')
    await sendCode(phone, env, d.fetch).catch((e) => { throw new Fail(e instanceof Error ? e.message : 'Could not send the SMS') })
    return { ok: true, phone }
  },

  'POST phone-check': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const phone = normPhone(String(body.phone ?? '')), code = String(body.code ?? '')
    if (!phone || !/^\d{4,8}$/.test(code)) throw new Fail('Enter the code from the SMS')
    await limit(d, `sms-check:${p.user_id}`, 8, 3600, 'Too many wrong codes. Try again in an hour.')
    if (!(await checkCode(phone, code, env, d.fetch))) throw new Fail('That code is wrong or expired', 400)
    try { await d.db.updateProfile(p.user_id, { phone, phone_verified_at: new Date().toISOString() }) } catch (e) {
      if (e instanceof MoneyError && e.message === 'conflict') throw new Fail('This phone number is already used by another Luda account', 409)
      throw e
    }
    return { ok: true }
  },

  // Freeze my wallet: instant, no PIN (for emergencies). Unfreezing needs the PIN, and only works on your own freeze.
  'POST freeze': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    if (body.freeze !== false) {
      if (!p.frozen) await d.db.updateProfile(p.user_id, { frozen: true, frozen_by: 'user' })
      return { frozen: true }
    }
    if (!p.frozen) return { frozen: false }
    if (p.frozen_by !== 'user') throw new Fail('Your account was put on hold by the Luda team. Contact support to lift it.', 403)
    await verifyPin(p, body.pin, d)
    await d.db.updateProfile(p.user_id, { frozen: false, frozen_by: null })
    return { frozen: false }
  },

  // Change password while signed in (needs the current one).
  'POST change-password': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    if (typeof body.newPassword !== 'string' || body.newPassword.length < 8) throw new Fail('New password must be at least 8 characters')
    await limit(d, `login:${p.username}`, 8, 900, 'Too many attempts. Wait 15 minutes.')
    let s
    try { s = await signIn(p.email, String(body.oldPassword ?? ''), authEnv(env), d.fetch) } catch { throw new Fail('Your current password is wrong', 401) }
    await setPassword(s.access_token, body.newPassword, authEnv(env), d.fetch).catch((e) => { throw new Fail(e instanceof Error ? e.message : 'Could not change password') })
    return { ok: true }
  },

  'GET banks': async ({ req, env, d }) => {
    await me(req, env, d)
    if (!env.PAYSTACK_SECRET_KEY) throw new Fail('Withdrawals are not switched on yet', 503)
    return { banks: await listBanks(env.PAYSTACK_SECRET_KEY, d.fetch) }
  },

  'POST resolve': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    needKyc(p, 'withdraw')
    const account = String(body.account ?? ''), bank = String(body.bankCode ?? '')
    if (!/^\d{10}$/.test(account) || !/^\w{2,10}$/.test(bank)) throw new Fail('Enter a 10-digit account number and pick a bank')
    const name = await resolveAccount(env.PAYSTACK_SECRET_KEY!, account, bank, d.fetch).catch(() => { throw new Fail('Could not find that account. Check the number and bank.') })
    return { accountName: name, matches: accountMatchesName(name, p.kyc_name ?? '') }
  },

  'POST withdraw': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    needKyc(p, 'withdraw'); noHold(p, d)
    if (!env.PAYSTACK_SECRET_KEY) throw new Fail('Withdrawals are not switched on yet', 503)
    const amount = int(body.amountMinor), account = String(body.account ?? ''), bank = String(body.bankCode ?? '')
    if (!(amount >= LIMITS.minWithdraw) || amount % 100) throw new Fail(`Minimum withdrawal is ${naira(LIMITS.minWithdraw)}`)
    if (!/^\d{10}$/.test(account) || !/^\w{2,10}$/.test(bank)) throw new Fail('Enter a 10-digit account number and pick a bank')
    await verifyAuth(p, body, env, d)
    if ((await d.db.spent(p.user_id, 'NGN', ['withdraw'], 24)) + amount > LIMITS.withdrawDay) throw new Fail(`Daily withdrawal limit is ${naira(LIMITS.withdrawDay)}`)
    const key = env.PAYSTACK_SECRET_KEY, f = d.fetch
    const name = await resolveAccount(key, account, bank, f).catch(() => { throw new Fail('Could not find that account. Check the number and bank.') })
    if (!accountMatchesName(name, p.kyc_name ?? '')) throw new Fail(`You can only withdraw to your own account. "${name}" doesn't match your verified name.`)
    const bankName = String(body.bankName ?? '').slice(0, 60)
    const recipient = await createRecipient(key, name, account, bank, f)
    const fee = withdrawFee(env), reference = newRef('wdr')
    try { await d.db.withdraw(p.user_id, reference, amount, fee, bank, bankName, account, name, recipient) } catch (e) { moneyMsg(e) }
    await d.db.log(reference, 'withdraw_init', { amount, fee, bank })
    try {
      const t = await sendTransfer(key, amount, recipient, reference, f)
      if (t.status === 'failed') await d.db.withdrawSettle(reference, 'failed', t.transferCode, 'Paystack refused the transfer')
      else if (t.status === 'paid') await d.db.withdrawSettle(reference, 'paid', t.transferCode, null)
      await d.db.log(reference, 'withdraw_sent', t)
      return { reference, status: t.status === 'failed' ? 'failed' : t.status, accountName: name, feeMinor: fee }
    } catch (e) {
      // Unknown outcome (network): keep it "processing"; the webhook or a status check settles it.
      await d.db.log(reference, 'withdraw_unknown', { error: String(e) })
      return { reference, status: 'processing', accountName: name, feeMinor: fee }
    }
  },

  'GET withdrawal': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    const w = await d.db.withdrawal(url.searchParams.get('ref') ?? '')
    if (!w || w.user_id !== p.user_id) throw new Fail('Unknown withdrawal', 404)
    return { reference: w.reference, status: await settleWithdrawal(w, env, d).catch(() => w.status) }
  },
}

export async function handleApi(req: Request, env: Env, d: Deps): Promise<Response> {
  const h = cors(req, env)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
  const url = new URL(req.url)
  const name = url.pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  const route = routes[`${req.method} ${name}`]
  if (!route) return json({ error: 'Not found' }, 404, h)
  try {
    const body = req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Body) : {}
    return json((await route({ req, env, d, body, url })) ?? { ok: true }, 200, h)
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, e.status, h)
    console.error('api error', name, e)
    return json({ error: e instanceof Error && /exchange rate|Provider error|Paystack|Flutterwave|ID check/i.test(e.message) ? e.message : 'Something went wrong, please try again' }, 500, h)
  }
}

/* -------------------------------- webhook -------------------------------- */

export async function handleWebhook(req: Request, env: Env, d: Deps): Promise<Response> {
  if (req.method !== 'POST') return new Response('ok')
  const raw = await req.text()
  const provider = await checkWebhook(req.headers, raw, env)
  if (!provider) return new Response('bad signature', { status: 401 })
  let body: Record<string, any> = {}
  try { body = JSON.parse(raw) } catch { return new Response('bad body', { status: 400 }) }
  const ev = webhookEvent(provider, body)
  if (!ev.ref) return new Response('ignored')
  await d.db.log(ev.ref, 'webhook', { provider, event: body.event ?? null })
  try {
    if (ev.type === 'charge') await finalizeDeposit(ev.ref, env, d, 'webhook-verify')
    else if (ev.type === 'transfer') {
      const w = await d.db.withdrawal(ev.ref)
      if (w) await settleWithdrawal(w, env, d)
    }
  } catch { return new Response('retry', { status: 500 }) } // the provider will retry
  return new Response('ok')
}
