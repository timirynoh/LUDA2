// Luda money API (Edge Function "api") and the provider webhook (Edge Function "pay-webhook").
// Rules: the server owns every balance and price; money moves only through the SQL
// functions (atomic, idempotent); deposits are confirmed with the provider before
// crediting; spending needs the user's PIN; withdrawing and sending need KYC.
import { NOTIFY_I18N } from './notify_i18n.ts'
import { newVapid, pushHostOk, sendPush, type PushMsg, type PushSub, type Vapid } from './webpush.ts'
import { OVERPASS_MIRRORS, PLACE_CATS, PLACE_CITIES, overpassQuery, parseOverpass, type PlaceOut } from './places.ts'
import { hashPin, randomHex, recover, refresh, setPassword, signIn, signUp, userFromToken, type AuthEnv } from './auth.ts'
import { b64u, checkRegistration, verifyAssertion, WebAuthnError, type Assertion } from './webauthn.ts'
import { MoneyError, type CaseRow, type Db, type PaymentRow, type Profile, type WithdrawalRow } from './db.ts'
import { DiditUnavailable, accountMatchesName, diditDecision, diditEnabled, diditSignatureOk, diditStart, docHash, idMatchesName, kycEnabled, lookupId, nameTokens, normDate, type DiditEnv, type KycEnv } from './kyc.ts'
import { CURRENCIES, FOREIGN, LIMITS, convertOut, costIn, billFee, depositFee, featureFees, foreignEnabled, foreignFee, margin, ngnPerTry, p2pFeeTry, perTry, withdrawFee, type Cur, type FeeEnv, type FxEnv } from './money.ts'
import { PayoutRefused, checkTransfer, createRecipient, flwBanks, flwCheckTransfer, flwResolve, flwSendTransfer, listBanks, matchFlwBank, payoutRefusalMessage, resolveAccount, sendTransfer, type PayoutProvider } from './payouts.ts'
import { priceTicket } from './pricing.ts'
import { textProblem } from './moderation.ts'
import { TopupRefused, mobileNumber, topupCheck, topupMaxMinor, topupOperatorList, topupOperators, topupSend, type TopupEnv } from './topup.ts'
import { decodeFile, MAX_VIDEO_BYTES, putFile, signedUrl, uploadUrl, VIDEO_TYPES } from './storage.ts'
import { checkCode, normPhone, sendCode, smsEnabled, type SmsEnv } from './sms.ts'
import { checkWebhook, initCheckout, verifyPayment, webhookEvent, type Fetch, type Keys, type Provider } from './providers.ts'

export interface Env extends Keys, FeeEnv, FxEnv, KycEnv, SmsEnv, DiditEnv, TopupEnv {
  APP_URL: string
  ALLOWED_ORIGINS?: string
  TICKET_QR_SECRET?: string
  EXCHANGER_BOND_TRY?: string
  PUSH_ALLOW_TEST?: string
  SUPABASE_URL: string
  AUTH_KEY: string // key used to talk to Supabase Auth
  SELL_OPERATORS?: string
  FOREIGN_CURRENCIES?: string; FOREIGN_FEE_PCT?: string; FX_TRY_RATES?: string
  // Set to match each dashboard's "who pays the fee" setting, so the customer never pays it twice.
  // Paystack defaults to true (the owner's setting: customer pays); Flutterwave defaults to false.
  PAYSTACK_CUSTOMER_PAYS_FEE?: string; FLW_CUSTOMER_PAYS_FEE?: string
  PAYOUT_PROVIDERS?: string // order to try for withdrawals, default "paystack,flutterwave"
  SERVICE_KEY?: string // for private file storage (support-case photos)
  REWARDS_MONTHLY_CAP?: string // ₺ of cash rewards per month for everyone (default 5,000); after that prizes become points
  FX_TRY_DAY_CAP?: string // ₺ of lira one person can buy with Instant per 24 h (default 5,000)
  ADMIN_EMAILS?: string // comma-separated Luda account emails that can open the owner's admin page
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

type CaseStatus = CaseRow['status']
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
const UNIS = ['neu', 'emu', 'ciu', 'gau', 'metu', 'eul', 'fiu', 'uok', 'cwu', 'bau', 'csu', 'arucad']
const UNI_KINDS = ['term', 'deadline', 'exam', 'fee', 'holiday']
const uniId = (v: unknown) => { const u = String(v ?? '').toLowerCase(); if (!UNIS.includes(u)) throw new Fail('Pick a university'); return u }
const isoDay = (v: unknown, what: string) => { const t = String(v ?? ''); if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || !Number.isFinite(Date.parse(t))) throw new Fail(`Check ${what}`); return t }

const newRef = (p: string) => `${p}_${randomHex(12)}`
const authEnv = (env: Env): AuthEnv => ({ SUPABASE_URL: env.SUPABASE_URL, AUTH_KEY: env.AUTH_KEY })
const num = (v: string | undefined, dflt: number) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? dflt : Number(v))
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

/** The 6-digit sign-in code (separate from the 4-digit payment PIN): 5 wrong = locked 15 minutes. */
async function verifyPasscode(p: Profile, code: unknown, d: Deps) {
  const now = d.now?.() ?? new Date()
  if (!p.passcode_hash || !p.passcode_salt) throw new Fail('Set your 6-digit sign-in code first', 409)
  if (p.passcode_locked_until && new Date(p.passcode_locked_until) > now) throw new Fail('Too many wrong codes. Try again in 15 minutes, or sign in with your password.', 429)
  if (typeof code !== 'string' || !/^\d{6}$/.test(code) || (await hashPin(code, p.passcode_salt)) !== p.passcode_hash) {
    const fails = (p.passcode_fails ?? 0) + 1
    await d.db.updateProfile(p.user_id, fails >= 5 ? { passcode_fails: 0, passcode_locked_until: new Date(now.getTime() + 15 * 60e3).toISOString() } : { passcode_fails: fails })
    throw new Fail(fails >= 5 ? 'Too many wrong codes. Locked for 15 minutes.' : `Wrong code (${5 - fails} tries left)`, 401)
  }
  if (p.passcode_fails) await d.db.updateProfile(p.user_id, { passcode_fails: 0, passcode_locked_until: null })
}
const weakCode = (c: string) => /^(\d)\1{5}$/.test(c) || '0123456789012345'.includes(c) || '9876543210987654'.includes(c) || /^(\d\d)\1\1$/.test(c) || /^(\d\d\d)\1$/.test(c)
const deviceOf = (req: Request) => {
  const ua = req.headers.get('user-agent') ?? ''
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown device'
  const br = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ''
  return br ? `${os} · ${br}` : os
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

/**
 * Applies a Didit decision to the profile (asked from Didit's API, never trusted from the browser).
 * Approved → verified, with the legal name from the document (used to match withdrawal bank accounts).
 * The document's name must match the Luda name, and one document can verify only one account.
 */
async function kycSync(p: Profile, env: Env, d: Deps): Promise<{ status: Profile['kyc_status']; message?: string }> {
  if (p.kyc_status === 'verified' || !p.kyc_session_id || !diditEnabled(env)) return { status: p.kyc_status }
  const r = await diditDecision(p.kyc_session_id, env, d.fetch)
  await d.db.log(p.kyc_session_id, 'kyc_decision', { status: r.raw })
  if (r.status === 'pending') { if (p.kyc_status !== 'pending') await d.db.updateProfile(p.user_id, { kyc_status: 'pending' }); return { status: 'pending' } }
  if (r.status === 'not_started') return { status: p.kyc_status }
  if (r.status === 'declined') { await d.db.updateProfile(p.user_id, { kyc_status: 'failed' }); return { status: 'failed', message: 'Your ID check was not approved. Try again with a clear photo of a valid document.' } }
  const legal = (r.name || `${r.firstName} ${r.lastName}`).trim().toUpperCase()
  const mine = new Set(nameTokens(p.full_name))
  const overlap = nameTokens(legal).filter((w) => mine.has(w)).length
  if (!legal || overlap < Math.min(2, nameTokens(p.full_name).length)) {
    await d.db.updateProfile(p.user_id, { kyc_status: 'failed' })
    return { status: 'failed', message: `The name on your document (${legal || 'unreadable'}) doesn't match your Luda name "${p.full_name}". Contact support to correct it.` }
  }
  const hash = r.docNumber ? await docHash(r.docType, r.country, r.docNumber) : null
  try {
    await d.db.updateProfile(p.user_id, {
      kyc_status: 'verified', kyc_name: legal, kyc_dob: r.dob || null, kyc_id_type: `didit:${r.docType}`.slice(0, 40),
      kyc_id_last4: r.docNumber ? r.docNumber.slice(-4) : null, kyc_doc_hash: hash, kyc_country: r.country.slice(0, 40) || null, kyc_at: new Date().toISOString(),
    } as Partial<Profile>)
  } catch (e) {
    if (e instanceof MoneyError && e.message === 'conflict') {
      await d.db.updateProfile(p.user_id, { kyc_status: 'failed' })
      return { status: 'failed', message: 'This ID document is already verified on another Luda account. Contact support if this is a mistake.' }
    }
    throw e
  }
  await notifyUser(env, d, p.user_id, { emoji: '🪪', title: 'Your ID is verified', body: 'Withdrawals, P2P, Market selling and Flash jobs are now unlocked', url: '/wallet', tag: 'kyc-verified', cat: 'security' })
  return { status: 'verified' }
}

const isAdmin = (p: Profile, env: Env) => !!p.is_admin || (env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(p.email.toLowerCase())
/* Staff roles: the owner can do everything; staff are added by email with a level per area. */
export const AREAS = ['overview', 'users', 'kyc', 'money', 'bills', 'disputes', 'cases', 'content', 'banners', 'tickets'] as const
export type Area = (typeof AREAS)[number] | 'team'
export type Level = 'view' | 'edit' | 'full'
const RANK: Record<Level, number> = { view: 1, edit: 2, full: 3 }
type Perms = Partial<Record<Area, Level>>
async function permsOf(p: Profile, env: Env, d: Deps): Promise<{ owner: boolean; perms: Perms } | null> {
  if (isAdmin(p, env)) return { owner: true, perms: Object.fromEntries([...AREAS, 'team'].map((a) => [a, 'full'])) as Perms }
  const roles = await d.db.fn<Perms | null>('luda_staff_get', { p_email: p.email }).catch(() => null)
  if (!roles || !Object.keys(roles).length) return null
  const perms: Perms = {}
  for (const a of AREAS) { const l = roles[a]; if (l && RANK[l]) perms[a] = l }
  return Object.keys(perms).length ? { owner: false, perms: { ...perms, overview: perms.overview ?? 'view' } } : null
}
const can = (s: { perms: Perms }, area: Area, level: Level) => !!s.perms[area] && RANK[s.perms[area]!] >= RANK[level]
/** Signed-in staff member allowed `level` in `area`. Non-staff get 404 (don't reveal the admin page exists). */
async function staff(req: Request, env: Env, d: Deps, area: Area, level: Level = 'view') {
  const p = await me(req, env, d)
  const s = await permsOf(p, env, d)
  if (!s) throw new Fail('Not found', 404)
  if (!can(s, area, level)) throw new Fail(level === 'view' ? "Your role can't see this. Ask the owner." : "Your role can't do this. Ask the owner.", 403)
  return Object.assign(p, { staff: s })
}
const admin = (req: Request, env: Env, d: Deps) => staff(req, env, d, 'team', 'full') // owner-only actions
/** What the admin page shows about a person (never PIN data, full document numbers or payout recipient codes). */
const adminProfile = (u: Profile) => ({
  userId: u.user_id, username: u.username, fullName: u.full_name, email: u.email, phone: u.phone ?? null, phoneVerified: !!u.phone_verified_at,
  kyc: u.kyc_status, kycName: u.kyc_name ?? null, kycType: u.kyc_id_type ?? null, kycLast4: u.kyc_id_last4 ?? null, kycCountry: u.kyc_country ?? null,
  frozen: u.frozen, frozenBy: u.frozen_by ?? null, moneyHoldUntil: u.money_hold_until ?? null, isAdmin: !!u.is_admin, createdAt: u.created_at,
})

const CASE_CATEGORIES = ['kyc', 'payment', 'withdrawal', 'account', 'other']
const cleanText = (v: unknown, max: number) => String(v ?? '').replace(/[<>\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max)

/** The extra details a provider needs (name on the bill, district, IBAN, month…), cleaned. Max 8 short fields. */
function billDetails(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!v || typeof v !== 'object') return out
  for (const [k, raw] of Object.entries(v as Record<string, unknown>).slice(0, 8)) {
    if (!/^[a-z_]{2,20}$/.test(k)) continue
    const val = cleanText(raw, 80)
    if (!val) continue
    if (k === 'iban') {
      const iban = val.replace(/\s+/g, '').toUpperCase()
      if (!/^TR\d{24}$/.test(iban)) throw new Fail('The IBAN should look like TR + 24 digits')
      out[k] = iban
    } else out[k] = val
  }
  return out
}
/** Saved-bill fields from the app (no payment): what it is, the number, details, a name and the reminder day (0 = off). */
function savedBillArgs(body: Body) {
  const biller = String(body.biller ?? '')
  if (!/^[a-z]{2,12}$/.test(biller)) throw new Fail('Pick the bill')
  const type = String(body.type ?? '')
  if (!['electricity', 'water', 'internet', 'phone', 'rent', 'other'].includes(type)) throw new Fail('Pick what kind of bill it is')
  const provider = cleanText(body.provider, 60), account = cleanText(body.account, 40).replace(/\s+/g, '')
  if (provider.length < 2) throw new Fail('Add who the bill is from')
  if (!/^[\w\-+./]{3,40}$/.test(account)) throw new Fail('Enter the customer / subscriber number from the bill')
  const label = cleanText(body.label, 40)
  const bad = label ? textProblem(label) : null
  if (bad) throw new Fail(bad)
  const remind = body.remind === undefined || body.remind === null ? null : int(body.remind)
  if (remind !== null && !(remind >= 0 && remind <= 28)) throw new Fail('Pick a reminder day between 1 and 28')
  const amount = body.amountMinor ? lira(body.amountMinor, 10, 20_000, 'The bill amount') : null
  const details = Object.fromEntries(Object.entries(billDetails(body.details)).filter(([k]) => k !== 'period' && k !== 'reference'))
  return { p_biller: biller, p_type: type, p_provider: provider, p_account: account, p_details: details, p_label: label, p_amount: amount, p_remind: remind }
}
const savedErr = (e: unknown): never => {
  if (String((e as Error)?.message ?? e).includes('too_many_saved')) throw new Fail('You can save up to 12 bills. Remove one first.')
  throw e
}

/**
 * Sends an automatic top-up for a bill that is already held. Paid → the bill is settled. Refused → it simply waits
 * for the Luda team. Unknown (network) → marked 'unknown': staff check the partner's dashboard before paying again.
 */
async function runTopup(env: Env, d: Deps, billId: string, op: { id: number; country: string }, amount: number, phone: string): Promise<string> {
  await d.db.fn('luda_bill_auto', { p_bill: billId, p_auto: { partner: 'reloadly', ref: `bill-${billId}`, status: 'processing', at: new Date().toISOString() } })
  try {
    const t = await topupSend(env, d.fetch, { operatorId: op.id, country: op.country, amountMinor: amount, phone, ref: `bill-${billId}` })
    await d.db.log(billId, 'bill_topup', { id: t.id, status: t.status })
    await d.db.fn('luda_bill_auto', { p_bill: billId, p_auto: { id: t.id, status: t.status } })
    if (t.status === 'paid') await settleAutoBill(env, d, billId)
    return t.status
  } catch (e) {
    const refused = e instanceof TopupRefused
    await d.db.log(billId, refused ? 'bill_topup_refused' : 'bill_topup_unknown', { error: String((e as Error)?.message ?? e).slice(0, 300) })
    await d.db.fn('luda_bill_auto', { p_bill: billId, p_auto: { status: refused ? 'refused' : 'unknown', said: String((e as Error)?.message ?? e).slice(0, 200) } })
    return refused ? 'refused' : 'unknown'
  }
}
async function settleAutoBill(env: Env, d: Deps, billId: string) {
  const r = await d.db.fn<{ ok: boolean; bill?: Record<string, any> }>('luda_bill_settle', { p_bill: billId, p_paid: true, p_note: 'Topped up automatically', p_receipt: [] })
  if (!r.ok || !r.bill) return
  await notifyUser(env, d, r.bill.user_id, { emoji: '📱', title: `Top-up sent: ${tl(Number(r.bill.amount_minor))}`, body: `${r.bill.provider} · ${String(r.bill.account_ref).slice(-4).padStart(8, '•')}`, url: '/bills', tag: `bill:${billId}`, cat: 'money' })
}
/** Asks the partner about top-ups still running (one person's, or everyone's from the team queue). */
async function checkTopups(env: Env, d: Deps, userId?: string) {
  const list = await d.db.fn<{ id: string; user_id: string; auto: { id?: string } }[]>('luda_bills_auto_pending', {}).catch(() => [])
  for (const b of list.filter((x) => !userId || x.user_id === userId).slice(0, 10)) {
    if (!b.auto?.id) continue
    try {
      const st = await topupCheck(env, d.fetch, b.auto.id)
      if (st === 'paid') { await d.db.fn('luda_bill_auto', { p_bill: b.id, p_auto: { status: 'paid' } }); await settleAutoBill(env, d, b.id) }
      else if (st === 'failed') { await d.db.fn('luda_bill_auto', { p_bill: b.id, p_auto: { status: 'failed' } }); await d.db.log(b.id, 'bill_topup_failed', {}) }
    } catch { /* try again later */ }
  }
}

/** When the team promises to have a bill paid: ~2 hours inside 09:00–21:00 Cyprus time, else 11:00 the next morning. */
export function billEta(now: Date) {
  const H = 3 * 3600_000 // TRNC = UTC+3
  const local = new Date(now.getTime() + H), h = local.getUTCHours() + local.getUTCMinutes() / 60
  if (h >= 9 && h < 19) return new Date(now.getTime() + 2 * 3600_000)
  const next = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (h >= 19 ? 1 : 0), 11) - H)
  return next
}

/** Stores up to 4 attached photos/PDFs privately; returns their storage paths. */
async function storeFiles(env: Env, d: Deps, userId: string, caseId: string, files: unknown): Promise<string[]> {
  const list = Array.isArray(files) ? files.slice(0, 5) : []
  if (list.length > 4) throw new Fail('Attach at most 4 files')
  const out: string[] = []
  for (const raw of list) {
    let file
    try { file = decodeFile(raw as { type?: unknown; data?: unknown }) } catch (e) { throw new Fail(e instanceof Error ? e.message : 'Bad file') }
    const path = `${userId}/${caseId}/${randomHex(8)}.${file.ext}`
    await putFile({ SUPABASE_URL: env.SUPABASE_URL, SERVICE_KEY: env.SERVICE_KEY }, path, file.bytes, file.type, d.fetch).catch(() => { throw new Fail('Upload failed, try again', 502) })
    out.push(path)
  }
  return out
}

/** Messages of some cases, with short-lived links to their files (only for whoever is allowed to see that case). */
async function threads(env: Env, d: Deps, caseIds: string[]) {
  const msgs = await d.db.caseMessages(caseIds)
  return Promise.all(msgs.map(async (m) => ({
    id: m.id, caseId: m.case_id, author: m.author, authorName: m.author_name, body: m.body, at: m.at,
    files: await Promise.all((m.files ?? []).map(async (path) => ({ name: path.split('/').pop(), url: await signedUrl({ SUPABASE_URL: env.SUPABASE_URL, SERVICE_KEY: env.SERVICE_KEY }, path, d.fetch).catch(() => null) }))),
  })))
}


/* ------------------------- wallet features (pots, bills, market, Flash) ------------------------- */
const BILL_TYPES = ['electricity', 'water', 'internet', 'phone', 'rent', 'other']
const MARKET_CATEGORIES = ['electronics', 'furniture', 'books', 'fashion', 'kitchen', 'tickets', 'other']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = (v: unknown) => { const x = String(v ?? ''); if (!UUID.test(x)) throw new Fail('Not found', 404); return x }
const tl = (minor: number) => `₺${(minor / 100).toLocaleString('en-US')}`
/** A whole-lira amount in kuruş within [min, max] TL, or a friendly error. */
function lira(v: unknown, min: number, max: number, what: string) {
  const a = int(v)
  if (!(a >= min * 100 && a <= max * 100) || a % 100) throw new Fail(`${what} must be between ${tl(min * 100)} and ${tl(max * 100)} (whole lira)`)
  return a
}
function clean(v: unknown, max: number, what: string, min = 1) {
  const t = cleanText(v, max).replace(/\s+/g, ' ')
  if (t.length < min) throw new Fail(`Add ${what}`)
  const bad = textProblem(t); if (bad) throw new Fail(bad)
  return t
}
const featureErr = (e: unknown): never => {
  if (e instanceof MoneyError) {
    if (e.message === 'not_available') throw new Fail('This is no longer available', 409)
    if (e.message === 'pot_locked') throw new Fail('This pot is locked until its unlock date')
    if (e.message === 'too_many_pots') throw new Fail('You can have up to 10 pots')
    if (e.message === 'own_listing') throw new Fail("You can't do that on your own post", 409)
  }
  return moneyMsg(e)
}
const signer = (env: Env, d: Deps) => (path: string) => signedUrl({ SUPABASE_URL: env.SUPABASE_URL, SERVICE_KEY: env.SERVICE_KEY }, path, d.fetch).catch(() => null)
const signAll = (env: Env, d: Deps, paths: string[] | null | undefined) => Promise.all((paths ?? []).map(signer(env, d)))
/** A P2P order with short-lived links to its receipts and chat photos. */
async function p2pSigned(env: Env, d: Deps, o: Record<string, any>) {
  return { ...o, receiptKeys: undefined, receiptUrls: await signAll(env, d, o.receiptKeys), messages: await Promise.all(((o.messages ?? []) as Record<string, any>[]).map(async (m) => ({ ...m, files: await signAll(env, d, m.files) }))) }
}

const needKyc = (p: Profile, what: string) => { if (p.kyc_status !== 'verified') throw new Fail(`Verify your identity to ${what}`, 403) }

/** Loads (or, on first use, creates) the signed-in user's profile. */
async function me(req: Request, env: Env, d: Deps): Promise<Profile> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const u = await userFromToken(token, authEnv(env), d.fetch)
  if (!u) throw new Fail('Please sign in again', 401)
  const p = await d.db.profile(u.id)
  if (p) {
    // Presence: 'Online / Active 5 min ago' for other people, from real use (written at most once a minute).
    if (!p.last_seen || Date.now() - Date.parse(p.last_seen) > 60_000) await d.db.fn('luda_seen', { p_user: p.user_id }).catch(() => {})
    return p
  }
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
  // Paid is final. Pending, failed and mismatch are always re-verified: the provider has the last word.
  if (!p || p.status === 'paid') return p
  const v = await verifyPayment(p.provider, reference, env, d.fetch)
  await d.db.log(reference, source, v)
  if (!v.ok) {
    if (v.status === 'failed' && p.status === 'pending') { await d.db.settle(reference, 'failed', v.providerTxId); return { ...p, status: 'failed' } }
    return p
  }
  // Paid at least what we asked (a provider may add its own fee on top) in the same currency → credit as quoted.
  if (v.reference !== reference || v.currency !== p.currency || v.amountMinor < p.amount_minor) {
    if (p.status === 'mismatch') return p
    await d.db.settle(reference, 'mismatch', v.providerTxId)
    await d.db.log(reference, 'mismatch', { expected: { amount: p.amount_minor, currency: p.currency }, got: v })
    return { ...p, status: 'mismatch' }
  }
  await d.db.depositPaid(reference, v.providerTxId)
  await d.db.log(reference, 'paid', { providerTxId: v.providerTxId })
  if (p.user_id) await pushUser(env, d, p.user_id, { title: '💰 Top-up received', body: `${fmtMoney(p.credit_minor ?? p.amount_minor, p.credit_currency ?? p.currency)} added to your wallet`, url: '/wallet', tag: `dep:${reference}`, cat: 'money' })
  return { ...p, status: 'paid' }
}

/* ----------------------------- withdrawals (out) ----------------------------- */

/** Payout routes to try, in order, limited to providers whose key is set. */
export function payoutOrder(env: Env): PayoutProvider[] {
  const want = (env.PAYOUT_PROVIDERS || 'paystack,flutterwave').split(',').map((x) => x.trim().toLowerCase())
  return want.filter((p, i): p is PayoutProvider => want.indexOf(p) === i && ((p === 'paystack' && !!env.PAYSTACK_SECRET_KEY) || (p === 'flutterwave' && !!env.FLW_SECRET_KEY)))
}

/** Asks the payout provider for a withdrawal's final status; refunds the wallet if it failed. */
export async function settleWithdrawal(w: WithdrawalRow, env: Env, d: Deps): Promise<WithdrawalRow['status']> {
  if (w.status !== 'processing' && w.status !== 'paid') return w.status
  const viaFlw = w.provider === 'flutterwave'
  if (viaFlw ? !env.FLW_SECRET_KEY : !env.PAYSTACK_SECRET_KEY) return w.status
  let t
  try {
    t = viaFlw ? await flwCheckTransfer(env.FLW_SECRET_KEY!, w.reference, w.transfer_code, d.fetch) : await checkTransfer(env.PAYSTACK_SECRET_KEY!, w.reference, d.fetch)
  } catch (e) {
    // The provider has no such transfer (it was refused before being created): after a while, give the money back.
    const wait = viaFlw ? 30 * 60e3 : 5 * 60e3
    if (e instanceof PayoutRefused && w.status === 'processing' && !w.transfer_code && Date.now() - Date.parse(w.created_at) > wait) {
      await d.db.withdrawSettle(w.reference, 'failed', null, `${viaFlw ? 'Flutterwave' : 'Paystack'} has no record of this transfer, refunded`)
      await d.db.log(w.reference, 'withdraw_failed', { reason: e.message, provider: w.provider ?? 'paystack' })
      return 'failed'
    }
    throw e
  }
  if (t.reference && t.reference !== w.reference) return w.status
  if (t.status === 'processing' || t.status === w.status) return w.status
  await d.db.withdrawSettle(w.reference, t.status, t.transferCode, null)
  await d.db.log(w.reference, `withdraw_${t.status}`, { provider: w.provider ?? 'paystack' })
  if (t.status === 'paid') await notifyUser(env, d, w.user_id, { emoji: '🏦', title: `Withdrawal sent: ${fmtMoney(w.amount_minor, w.currency)}`, body: 'It’s on its way to your bank', url: '/wallet', tag: `wdr:${w.reference}`, cat: 'money' })
  else await pushUser(env, d, w.user_id, { title: '↩️ Withdrawal refunded', body: `${fmtMoney(w.amount_minor, w.currency)} is back in your wallet`, url: '/wallet', tag: `wdr:${w.reference}`, cat: 'money' })
  return t.status
}

/**
 * Sends a recorded withdrawal through the payout providers in order. A definite refusal (nothing was sent)
 * moves on to the next provider; an unknown outcome (network / 5xx) stops and stays "processing".
 */
async function payOut(reference: string, amount: number, bank: string, bankName: string, account: string, name: string, env: Env, d: Deps) {
  const f = d.fetch, refusals: string[] = []
  for (const p of payoutOrder(env)) {
    await d.db.setWithdrawal(reference, { provider: p })
    try {
      let t
      if (p === 'paystack') {
        const recipient = await createRecipient(env.PAYSTACK_SECRET_KEY!, name, account, bank, f)
        await d.db.setWithdrawal(reference, { recipient_code: recipient })
        t = await sendTransfer(env.PAYSTACK_SECRET_KEY!, amount, recipient, reference, f)
      } else {
        const code = matchFlwBank(bank, bankName, await flwBanks(env.FLW_SECRET_KEY!, f))
        if (!code) throw new PayoutRefused(`Flutterwave does not list this bank (${bankName || bank})`, 400, 'flutterwave')
        const flwName = await flwResolve(env.FLW_SECRET_KEY!, account, code, f)
        if (flwName && !accountMatchesName(flwName, name)) throw new PayoutRefused(`Flutterwave found a different account name (${flwName})`, 400, 'flutterwave')
        t = await flwSendTransfer(env.FLW_SECRET_KEY!, amount, code, account, name, reference, f)
      }
      await d.db.log(reference, 'withdraw_sent', { ...t, provider: p })
      if (t.status === 'failed') { refusals.push(`${p}: transfer failed`); continue }
      if (t.transferCode) await d.db.setWithdrawal(reference, { transfer_code: t.transferCode })
      if (t.status === 'paid') await d.db.withdrawSettle(reference, 'paid', t.transferCode, null)
      return { status: t.status, provider: p }
    } catch (e) {
      if (e instanceof PayoutRefused) {
        await d.db.log(reference, 'withdraw_refused', { error: e.message, http: e.httpStatus, provider: p })
        refusals.push(`${p}: ${e.message}`); continue
      }
      // Unknown outcome: keep it "processing"; the webhook or a status check settles it.
      await d.db.log(reference, 'withdraw_unknown', { error: String(e), provider: p })
      return { status: 'processing' as const, provider: p }
    }
  }
  // Every route said no, so nothing was sent: return the money (and fee) to the wallet right away.
  const why = refusals.join(' | ').slice(0, 300) || 'No payout provider is switched on'
  await d.db.withdrawSettle(reference, 'failed', null, why)
  return { status: 'failed' as const, provider: null, message: payoutRefusalMessage(refusals[0] ?? why) }
}

/* ---------------------------------- api ---------------------------------- */

type Body = Record<string, any>
type Route = (ctx: { req: Request; env: Env; d: Deps; body: Body; url: URL }) => Promise<unknown>




export const KYC_TRIES_PER_DAY = 2
/** ID check attempts left today (Didit starts count; the counter resets each day). */
const kycTriesLeft = (p: Profile) => Math.max(0, KYC_TRIES_PER_DAY - (p.kyc_tries_day === new Date().toISOString().slice(0, 10) ? p.kyc_tries : 0))


/* Flash job emojis: same list as the app (lib/jobEmoji.ts). */
const JOB_EMOJI: [RegExp, string][] = [
  [/plumb|leak|pipe|sink|tap|toilet|water|shower|drain|boiler/i, '🚰'], [/fridge|freezer|refrigerat/i, '🧊'], [/wash(ing)? ?machine|laundry|iron/i, '🧺'],
  [/electric|socket|wiring|light ?bulb|lamp|fuse|power/i, '💡'], [/air ?con|\bac\b|heater|klima/i, '❄️'], [/mov(e|ing)|carry|lift|furniture|sofa|bed\b|box(es)?/i, '📦'],
  [/clean|tidy|mop|wash dishes/i, '🧹'], [/paint/i, '🎨'], [/carpent|wood|shelf|assemble|ikea|door|lock/i, '🔨'], [/car\b|mechanic|tyre|tire|drive|ride|lift to/i, '🚗'],
  [/airport|ercan|flight/i, '✈️'], [/deliver|parcel|package|pick ?up|courier|drop ?off/i, '🛵'], [/shop|groceries|market|buy me/i, '🛒'], [/cook|food|meal|jollof/i, '🍲'],
  [/hair|braid|barber|nails|makeup/i, '💇🏾'], [/laptop|computer|pc\b|software|website|code/i, '💻'], [/phone|screen|iphone|android/i, '📱'], [/wifi|internet|router|modem/i, '📶'],
  [/tutor|lesson|homework|assignment|math|exam|study|teach/i, '📚'], [/translat|turkish|interpret/i, '🗣️'], [/photo|video|camera/i, '📷'], [/print|scan|document|form/i, '🖨️'],
  [/pet|dog|cat/i, '🐾'], [/garden|plant|grass/i, '🌿'], [/baby|child|kid/i, '🧸'], [/queue|line|stand in/i, '⏳'],
]
const JOB_EMOJI_PICK = ['⚡', '🚰', '🧊', '🧺', '💡', '❄️', '📦', '🧹', '🎨', '🔨', '🚗', '✈️', '🛵', '🛒', '🍲', '💇🏾', '💻', '📱', '📶', '📚', '🗣️', '📷', '🖨️', '🐾', '🌿', '🧸', '⏳']
export const jobEmoji = (text: string) => JOB_EMOJI.find(([r]) => r.test(text))?.[1] ?? '⚡'


/* ------------------------- rewards (all on the server) ------------------------- */
// Same prizes the app's wheel shows. The server draws the prize; the phone only animates it.
export const SPIN = [
  { label: '10 XP', xp: 10, weight: 24 }, { label: '50 pts', points: 50, weight: 18 }, { label: '25 XP', xp: 25, weight: 18 }, { label: '₺5', cash: 5_00, weight: 10 },
  { label: '100 pts', points: 100, weight: 12 }, { label: '50 XP', xp: 50, weight: 10 }, { label: '₺20', cash: 20_00, weight: 3 }, { label: '200 pts', points: 200, weight: 5 },
] as { label: string; xp?: number; points?: number; cash?: number; weight: number }[]
const QUEST_XP: Record<string, number> = { phone: 50, verify: 150, deposit: 50, bill: 80, fx: 40, p2p: 200, chat: 30, flash: 40, ticket: 50 }
const REDEEM = [{ id: 'r5', pts: 500, cash: 5_00, label: '₺5 wallet credit' }, { id: 'r20', pts: 1500, cash: 20_00, label: '₺20 wallet credit' }, { id: 'r40', pts: 3000, cash: 40_00, label: '₺40 wallet credit' }]
const CHALLENGES = [
  { id: 'c-bills', goal: 3, key: 'billsMonth', prize: { points: 300, xp: 100 }, prizeLabel: '300 pts' },
  { id: 'c-save', goal: 1_000_00, key: 'potSavedMonth', prize: { cash: 20_00, xp: 100 }, prizeLabel: '₺20 bonus' },
  { id: 'c-p2p', goal: 2, key: 'p2pMonth', prize: { points: 200, xp: 100 }, prizeLabel: '200 pts' },
]
export const REFERRAL_RULES = { reward: 50_00, welcome: 50_00, perMonthCap: 20, applyDays: 14, tiers: [{ id: 'bronze', min: 10, cash: 250_00 }, { id: 'silver', min: 25, cash: 750_00 }, { id: 'gold', min: 50, cash: 2_000_00 }] }
const rewardsCap = (env: Env) => Math.round(num(env.REWARDS_MONTHLY_CAP, 5_000) * 100)
/** 6-digit code for a ticket's QR in a 30-second window (HMAC with a server secret, so only the server can make or check it). */
async function ticketOtp(env: Env, ticketId: string, win: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.TICKET_QR_SECRET || env.SERVICE_KEY || env.PAYSTACK_SECRET_KEY || 'luda-dev-ticket-key'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ticketId}:${win}`)))
  return String((((sig[0] << 24) | (sig[1] << 16) | (sig[2] << 8) | sig[3]) >>> 0) % 1_000_000).padStart(6, '0')
}
const fxDayCap = (env: Env) => Math.round(num(env.FX_TRY_DAY_CAP, 5_000) * 100)
const convertErr = (e: unknown): never => {
  if (e instanceof MoneyError && e.message === 'fx_daily_cap') throw new Fail('You can buy up to ₺5,000 of lira with Instant per 24 hours. Try again later, or use P2P.', 409)
  if (e instanceof MoneyError && e.message === 'rate_moved') throw new Fail('The rate just changed. Check the new amount and try again.', 409)
  if (e instanceof MoneyError && e.message === 'too_small') throw new Fail('Amount too small to convert')
  return moneyMsg(e)
}
const cyprusDay = (d = new Date()) => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10)
type Activity = Record<string, any>
function questsDone(a: Activity) {
  return Object.keys(QUEST_XP).filter((q) => ({ phone: a.phone, verify: a.verified, deposit: a.deposits > 0, bill: a.bills > 0, fx: a.converts > 0, p2p: a.p2p > 0, chat: a.groupsJoined > 0, flash: a.flashPosted > 0, ticket: a.tickets > 0 } as Record<string, boolean>)[q])
}
function badgesOf(a: Activity) {
  const b: [string, boolean][] = [['welcome', true], ['first_deposit', a.deposits > 0], ['bill_slayer', a.bills >= 3], ['fx_wizard', a.converts >= 3], ['safe_trader', a.p2p > 0],
    ['verified', a.verified], ['streak7', a.streak >= 7], ['founder', a.groupsOwned > 0], ['social', a.groupsJoined >= 3], ['flash_asker', a.flashPosted > 0], ['handy_hero', a.flashHelped > 0],
    ['saver_pot', a.pots > 0], ['trader', a.sold > 0], ['recruiter', a.referralsVerified > 0], ['ambassador', a.referralsVerified >= 10], ['lucky', a.spinCashWins > 0],
    ['challenger', a.challengesDone > 0], ['trusted_poster', a.posts >= 3], ['generous', a.sent > 0], ['traveller', a.tickets > 0]]
  return b.filter(([, ok]) => ok).map(([id]) => id)
}
/** XP is worked out from what really happened on the server (plus prizes), so nobody can type it in. */
const xpOf = (a: Activity) => Number(a.eventXp) + questsDone(a).reduce((t, q) => t + QUEST_XP[q], 0)
  + 10 * Math.max(0, a.bills - 1) + 5 * Math.max(0, a.tickets - 1) + 20 * Math.max(0, a.p2p - 1) + 15 * a.flashHelped + 10 * a.sold + 5 * a.posts + 25 * badgesOf(a).length
/** Pays referral bonuses that became due (friend verified + first top-up), and ambassador bonuses. Safe to call often. */
async function settleReferrals(p: Profile, env: Env, d: Deps) {
  const due = await d.db.fn<{ inviter: string; invitee: string; name: string }[]>('luda_referrals_due', { p_user: p.user_id })
  for (const r of due) {
    const capped = (await d.db.fn<number>('luda_referrals_month', { p_user: r.inviter })) >= REFERRAL_RULES.perMonthCap
    await d.db.fn('luda_reward', { p_user: r.inviter, p_kind: 'referral', p_ref: r.invitee, p_xp: 100, p_points: capped ? 500 : 0, p_cash: capped ? 0 : REFERRAL_RULES.reward, p_note: `Your friend @${r.name} joined and verified`, p_cap: rewardsCap(env) })
    await d.db.fn('luda_reward', { p_user: r.invitee, p_kind: 'referral_welcome', p_ref: r.inviter, p_xp: 50, p_points: 0, p_cash: REFERRAL_RULES.welcome, p_note: 'Welcome bonus for joining with a friend\'s code', p_cap: rewardsCap(env) })
    const a = await d.db.fn<Activity>('luda_activity', { p_user: r.inviter })
    for (const t of REFERRAL_RULES.tiers) if (a.referralsVerified >= t.min) await d.db.fn('luda_reward', { p_user: r.inviter, p_kind: 'ambassador', p_ref: t.id, p_xp: 300, p_points: 0, p_cash: t.cash, p_note: `Ambassador ${t.id}: ${t.min} friends verified`, p_cap: rewardsCap(env) })
  }
}

/* ------------------------- P2P exchange (Naira in Luda ⇄ lira outside) ------------------------- */
export const P2P_RULES = { maxAds: 1, maxTry: 5_000_00, minTry: 50_00, windowMin: 30, priceBand: 0.5, appealWaitMin: 15, assets: ['TRY', 'USD', 'EUR', 'GBP'] }
const P2P_SYMBOL: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' }
/** Verified Exchanger (owner's numbers): 5 ads up to ₺50,000 each, ₺2,000 bond; to apply: verified ID + a good P2P record. */
const EXCHANGER = { maxAds: 5, maxTry: 50_000_00, minTrades: 5, minRate: 90 }
const exchangerBond = (env: Env) => Math.max(0, Math.round(Number(env.EXCHANGER_BOND_TRY ?? 2000) * 100)) || 2000_00
async function p2pLimits(userId: string, d: Deps) {
  const x = await d.db.fn<{ status: string } | null>('luda_exchanger', { p_user: userId }).catch(() => null)
  return x?.status === 'approved' ? { ...P2P_RULES, maxAds: EXCHANGER.maxAds, maxTry: EXCHANGER.maxTry, exchanger: true } : { ...P2P_RULES, exchanger: false }
}
const p2pAsset = (v: unknown) => (P2P_RULES.assets.includes(String(v)) ? String(v) : 'TRY')
/** Today's market price in Naira for 1 unit of the asset (null if unknown). Only used as a sanity guard: people set their own rate. */
async function marketNgnPer(asset: string, env: Env, d: Deps) {
  try { const ngn = await ngnPerTry(env, d.fetch); if (asset === 'TRY') return ngn; const per = await perTry(asset, env, d.fetch); return per > 0 ? ngn / per : null } catch { return null }
}
const IBAN_ANY = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/
const IBAN = /^TR\d{24}$/
const p2pErr = (e: unknown): never => {
  if (e instanceof MoneyError) {
    if (e.message === 'too_many_ads') throw new Fail(`You can have ${P2P_RULES.maxAds} ad at a time. Edit or remove your current ad.`)
    if (e.message === 'too_many_methods') throw new Fail('You can save up to 5 bank accounts')
    if (e.message === 'appeal_too_early') throw new Fail(`You can appeal ${P2P_RULES.appealWaitMin} minutes after the money is marked as sent. Give the other person time to check their bank.`)
    if (e.message === 'p2p_limits') throw new Fail('The amount is outside this ad\'s limits')
    if (e.message === 'p2p_method') throw new Fail('This ad doesn\'t accept that payment method')
    if (e.message === 'not_available') throw new Fail('This order or ad is no longer available', 409)
    if (e.message === 'own_listing') throw new Fail("You can't trade with your own ad", 409)
    if (e.message === 'not_member') throw new Fail('Not found', 404)
    if (e.message === 'not_found') throw new Fail('Not found', 404)
  }
  return moneyMsg(e)
}
/** P2P needs a verified ID (both sides) and an account that isn't frozen or on a password-reset hold. */
function p2pBlock(p: Profile) {
  if (p.kyc_status !== 'verified') return 'Verify your ID to trade P2P. Everyone you trade with is ID-verified too.'
  if (p.frozen) return 'Your account is on hold'
  if (p.money_hold_until && Date.parse(p.money_hold_until) > Date.now()) return 'Trading is paused for 24 hours after a password reset'
  return null
}

/* ------------------------- community: posts, groups, banners, team ------------------------- */
type BoardKind = 'housing' | 'job' | 'event' | 'news' | 'promo' | 'place'
/** Who can post what (shown in the app, enforced here). Staff with content 'edit' post as "Luda Official" and skip review. */
export const BOARD_RULES: Record<BoardKind, { kyc: boolean; staffOnly?: boolean; minAgeDays?: number; review?: boolean; maxLive: number; perDay: number; days: number }> = {
  housing: { kyc: true, maxLive: 3, perDay: 3, days: 30 },
  job: { kyc: true, maxLive: 3, perDay: 3, days: 30 },
  event: { kyc: true, maxLive: 5, perDay: 3, days: 60 },
  news: { kyc: true, minAgeDays: 7, review: true, maxLive: 5, perDay: 2, days: 0 },
  promo: { kyc: true, maxLive: 5, perDay: 5, days: 14 },
  place: { kyc: true, staffOnly: true, maxLive: 0, perDay: 0, days: 0 },
}
const BOARD_KINDS = Object.keys(BOARD_RULES) as BoardKind[]
const boardKind = (v: unknown) => { const k = String(v ?? '') as BoardKind; if (!BOARD_KINDS.includes(k)) throw new Fail('Unknown post type'); return k }
/** The kind's own fields: short text, numbers, yes/no. Every text goes through the scam/abuse filter. */
function boardData(v: unknown) {
  const out: Record<string, string | number | boolean> = {}
  if (!v || typeof v !== 'object') return out
  for (const [k, raw] of Object.entries(v as Record<string, unknown>).slice(0, 14)) {
    if (!/^[a-zA-Z]{2,20}$/.test(k)) continue
    if (typeof raw === 'boolean') out[k] = raw
    else if (typeof raw === 'number' && Number.isFinite(raw)) out[k] = Math.max(-1e9, Math.min(1e9, raw))
    else if (raw !== null && raw !== undefined) { const t = cleanText(raw, 160); if (t) { const bad = textProblem(t); if (bad) throw new Fail(bad); out[k] = t } }
  }
  return out
}
/** Why this person can't post this kind yet (null = they can). */
async function boardBlock(p: Profile, kind: BoardKind, official: boolean, d: Deps) {
  const r = BOARD_RULES[kind]
  if (official) return null
  if (r.staffOnly) return 'Only the Luda team adds these.'
  if (r.kyc && p.kyc_status !== 'verified') return 'Verify your ID first (Wallet → Verify). It keeps fake posts and scammers out.'
  if (r.minAgeDays && p.created_at && Date.now() - Date.parse(p.created_at) < r.minAgeDays * 86400e3) return `Your account must be at least ${r.minAgeDays} days old to post news.`
  const c = await d.db.fn<{ live: number; recent: number }>('luda_board_count', { p_user: p.user_id, p_kind: kind, p_since: new Date(Date.now() - 86400e3).toISOString() })
  if (r.maxLive && c.live >= r.maxLive) return `You can have ${r.maxLive} active posts here. Remove an old one first.`
  if (r.perDay && c.recent >= r.perDay) return `You can post ${r.perDay} of these a day. Try again tomorrow.`
  return null
}
const communityErr = (e: unknown): never => {
  if (e instanceof MoneyError) {
    if (e.message === 'not_found') throw new Fail('This is no longer available', 404)
    if (e.message === 'own_post') throw new Fail("You can't report your own post")
    if (e.message === 'name_taken') throw new Fail('A group with this name already exists. Join it instead!')
    if (e.message === 'not_member') throw new Fail('Join the group first', 403)
    if (e.message === 'owner_cannot_leave') throw new Fail("You created this group, so you can't leave it")
  }
  return moneyMsg(e)
}
const BANNER_THEMES = ['mint', 'sunset', 'ocean', 'grape', 'gold', 'night']

const routes: Record<string, Route> = {
  /* ---- public ---- */
  'GET config': async ({ env, d }) => ({ google: await googleEnabled(env, d), sms: smsEnabled(env), didit: diditEnabled(env), providers: providers(env), foreign: env.FLW_SECRET_KEY ? foreignEnabled(env) : [], payouts: !!env.PAYSTACK_SECRET_KEY, kyc: kycEnabled(env) || diditEnabled(env), nin: kycEnabled(env), limits: LIMITS, fees: { withdraw: withdrawFee(env), fxMargin: margin(env), ...featureFees(env) }, push: (await vapid(d).catch(() => null))?.publicKey ?? null }),

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
    // Joined with a friend's code (LUDA-USERNAME): remember who invited them; the bonus is paid by the server later.
    const ref = String(body.ref ?? '').trim().replace(/^LUDA-/i, '').toLowerCase()
    if (r.userId) await d.db.fn('luda_sign_in_log', { p_user: r.userId, p_how: 'new account', p_device: deviceOf(req) }).catch(() => {})
    if (r.userId && Number(body.terms) > 0) await d.db.fn('luda_terms_accept', { p_user: r.userId, p_version: Number(body.terms) }).catch(() => {})
    if (r.userId && ref && USERNAME.test(ref) && ref !== username) await d.db.fn('luda_set_inviter', { p_user: r.userId, p_inviter: ref, p_days: REFERRAL_RULES.applyDays }).catch(() => {})
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
    let session
    try { session = await signIn(email, String(body.password ?? ''), authEnv(env), d.fetch) } catch (e) { throw new Fail(e instanceof Error ? e.message : 'Sign-in failed', 401) }
    const who = await d.db.profileByEmail(email).catch(() => null)
    if (who) await d.db.fn('luda_sign_in_log', { p_user: who.user_id, p_how: 'password', p_device: deviceOf(req) }).catch(() => {})
    if (who) await notifyUser(env, d, who.user_id, { emoji: '🔐', title: `New sign-in on ${deviceOf(req)}`, body: 'Not you? Freeze your wallet in Security and change your password', url: '/security', tag: `signin:${Date.now()}`, cat: 'security' })
    return { session }
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
    // Self-healing: re-check this user's unfinished top-ups from the last 2 days with the provider
    // (covers a missed webhook or a closed browser). Each payment is re-checked at most every 2 minutes.
    for (const pay of (await d.db.pendingDeposits(p.user_id, new Date((d.now?.() ?? new Date()).getTime() - 48 * 3600e3).toISOString())).slice(0, 3)) {
      if (await d.db.hit(`recheck:${pay.reference}`, 1, 120)) await finalizeDeposit(pay.reference, env, d, 'recheck').catch(() => {})
    }
    // ID check finished while the user was away? Ask Didit (at most every 2 minutes).
    if (p.kyc_status !== 'verified' && p.kyc_session_id && diditEnabled(env) && (await d.db.hit(`kycrecheck:${p.user_id}`, 1, 120))) {
      await kycSync(p, env, d).catch(() => {})
      Object.assign(p, (await d.db.profile(p.user_id)) ?? {})
    }
    // Same for withdrawals whose bank confirmation (webhook) never arrived.
    if (env.PAYSTACK_SECRET_KEY || env.FLW_SECRET_KEY) for (const w of (await d.db.withdrawals(p.user_id, 5)).filter((x) => x.status === 'processing' && Date.parse(x.created_at) < Date.now() - 120e3)) {
      if (await d.db.hit(`wrecheck:${w.reference}`, 1, 120)) await settleWithdrawal(w, env, d).catch(() => {})
    }
    // Money owed to this user as a seller/helper that the buyer/poster never confirmed (after 7 / 3 days, no open case).
    if (await d.db.hit(`autorel:${p.user_id}`, 1, 600)) await d.db.fn('luda_auto_release', { p_user: p.user_id }).catch(() => {})
    const staffOf = await permsOf(p, env, d)
    const [balances, history, tickets, withdrawals, deposits] = await Promise.all([d.db.balances(p.user_id), d.db.history(p.user_id, 40), d.db.tickets(p.user_id, 30), d.db.withdrawals(p.user_id, 20), d.db.deposits(p.user_id, 20)])
    return {
      profile: { username: p.username, fullName: p.full_name, email: p.email, kyc: p.kyc_status, kycName: p.kyc_name, hasPin: !!p.pin_hash, isAdmin: !!staffOf, staff: staffOf, kycTriesLeft: kycTriesLeft(p), kycStartedAt: p.kyc_started_at ?? null, frozen: p.frozen, frozenBy: p.frozen_by ?? null, phone: p.phone ? p.phone.slice(0, 4) + '•••' + p.phone.slice(-3) : null, phoneVerified: !!p.phone_verified_at, moneyHoldUntil: p.money_hold_until ?? null, university: p.university ?? null, hasPasscode: !!p.passcode_hash, inboxUnread: await d.db.fn<number>('luda_inbox_unread', { p_user: p.user_id }).catch(() => 0), termsVersion: Number(p.terms_version ?? 0), termsCurrent: Number((await d.db.fn<{ version?: number } | null>('luda_guide', { p_slug: 'terms' }).catch(() => null))?.version ?? 0) },
      // Every top-up attempt with its status (pending / paid / failed / mismatch), so the app can show all of them.
      deposits: deposits.map((x) => ({ reference: x.reference, provider: x.provider, status: x.status, chargeMinor: Number(x.amount_minor), currency: x.currency, feeMinor: Number(x.fee_minor ?? 0), creditMinor: Number(x.credit_minor ?? 0), creditCurrency: x.credit_currency ?? 'NGN', createdAt: x.created_at, paidAt: x.paid_at ?? null })),
      fx: await d.db.fn('luda_fx', { p_user: p.user_id }).catch(() => null),
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

  // Live lock screen and "re-enter your PIN on a new phone": the PIN is checked here only (5 wrong = locked 15 min);
  // the phone never stores the PIN or a hash of it.
  'POST pin-check': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await verifyPin(p, body.pin, d)
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
    const flag = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : /^(1|true|yes)$/i.test(v))
    // When the provider itself charges its fee to the customer, Luda must not add it again.
    const providerAddsFee = provider === 'paystack' ? flag(env.PAYSTACK_CUSTOMER_PAYS_FEE, true) : flag(env.FLW_CUSTOMER_PAYS_FEE, false)
    let estFee = 0
    if (cur === 'NGN') {
      if (!(amount >= LIMITS.minDeposit) || amount > LIMITS.maxDepositOnce || amount % 100) throw new Fail(`Enter a whole amount between ${naira(LIMITS.minDeposit)} and ${naira(LIMITS.maxDepositOnce)}`)
      const lim = verified ? LIMITS.verified : LIMITS.unverified
      if ((await d.db.depositedSince(p.user_id, dayAgo, 'NGN')) + amount > lim.depositDay) throw new Fail(`Daily top-up limit is ${naira(lim.depositDay)}${more}`)
      if ((await d.db.balances(p.user_id)).NGN + amount > lim.maxBalanceNGN) throw new Fail(`Your Naira wallet can hold up to ${naira(lim.maxBalanceNGN)}${more}`)
      credit = amount; creditCur = 'NGN'; estFee = depositFee(amount, env); fee = providerAddsFee ? 0 : estFee
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
      estFee = foreignFee(amount, env); fee = providerAddsFee ? 0 : estFee; paymentOptions = FOREIGN[cur].options
    }
    const reference = newRef('dep')
    await d.db.insert({
      reference, provider, purpose: 'deposit', status: 'pending', amount_minor: amount + fee, currency: cur, base_amount: amount / 100, base_currency: cur, fx_rate: rate,
      email: p.email, item: { type: 'deposit' }, user_id: p.user_id, fee_minor: fee, credit_minor: credit, credit_currency: creditCur,
    })
    const callbackUrl = `${env.APP_URL.replace(/\/$/, '')}/pay/return?provider=${provider}&ref=${reference}`
    const checkoutUrl = await initCheckout(provider, { reference, amountMinor: amount + fee, currency: cur, email: p.email, callbackUrl, title: 'Luda wallet top-up', meta: { purpose: 'deposit', username: p.username }, paymentOptions }, env, d.fetch)
    await d.db.log(reference, 'init', { provider, cur, amount, fee, credit, creditCur })
    return { reference, checkoutUrl, currency: cur, amountMinor: amount, feeMinor: fee, chargeMinor: amount + fee, creditMinor: credit, creditCurrency: creditCur, providerAddsFee, estFeeMinor: estFee }
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
  // Instant conversion (v1.15.0, spend-only lira): priced and booked in one SQL function. Bought lira can be spent in
  // Luda but not sent; changing it back gives at most the Naira paid for it (no profit from rate moves at Luda's cost).
  'GET convert-quote': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    const from = url.searchParams.get('from'), amount = int(Number(url.searchParams.get('amount')))
    if (!isCur(from) || !(amount > 0)) throw new Fail('Enter an amount')
    const mid = await ngnPerTry(env, d.fetch), m = margin(env)
    const q = await d.db.fn<{ out: number; capped?: boolean; fromBought?: number }>('luda_convert', { p_user: p.user_id, p_from: from, p_amount: amount, p_mid: mid, p_margin: m, p_ref: 'quote', p_try_day_cap: fxDayCap(env), p_min_out: 0, p_quote: true }).catch(convertErr)
    return { ...q, rate: mid, margin: m, fx: await d.db.fn('luda_fx', { p_user: p.user_id }) }
  },
  'POST convert': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const from = body.from, to = body.to, amount = int(body.amountMinor)
    if (!isCur(from) || !isCur(to) || from === to) throw new Fail('Pick two different currencies')
    if (!(amount > 0)) throw new Fail('Enter an amount')
    await verifyAuth(p, body, env, d)
    if ((await d.db.spent(p.user_id, from, ['convert'], 24)) + amount > LIMITS.convertDay[from]) throw new Fail('Daily conversion limit reached')
    const mid = await ngnPerTry(env, d.fetch), m = margin(env)
    // The user saw a quote; refuse if it got worse by more than 1%.
    const seen = int(body.expectMinor)
    const ref = newRef('cvt')
    const r = await d.db.fn<{ out: number; capped?: boolean }>('luda_convert', { p_user: p.user_id, p_from: from, p_amount: amount, p_mid: mid, p_margin: m, p_ref: ref, p_try_day_cap: fxDayCap(env), p_min_out: seen > 0 ? Math.floor(seen * 0.99) : 1, p_quote: false }).catch(convertErr)
    await d.db.log(ref, 'convert', { user: p.username, from, amount, out: r.out, capped: !!r.capped })
    return { ok: true, receivedMinor: r.out, currency: to, capped: !!r.capped }
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
    if (cur === 'TRY') {
      const fx = await d.db.fn<{ freeTry: number; boughtTry: number }>('luda_fx', { p_user: p.user_id })
      if (amount > Number(fx.freeTry)) throw new Fail(`Lira bought with Instant can only be spent in Luda (bills, tickets, Market, Flash). You can send up to ₺${(Number(fx.freeTry) / 100).toLocaleString('en-US')}.`, 409)
    }
    const note = String(body.note ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 80)
    const ref = newRef('snd')
    try {
      await d.db.post([
        { user_id: p.user_id, currency: cur, amount_minor: -amount, kind: 'send', ref, meta: { to: to.username, note } },
        { user_id: to.user_id, currency: cur, amount_minor: amount, kind: 'receive', ref, meta: { from: p.username, note } },
      ])
    } catch (e) { moneyMsg(e) }
    await pushUser(env, d, to.user_id, { title: `💸 You received ${fmtMoney(amount, cur)}`, body: note ? `From @${p.username} · ${note}` : `From @${p.username}`, url: '/wallet', tag: `recv:${ref}`, cat: 'money' })
    return { ok: true, to: to.username }
  },

  // Support cases / appeals.
  'POST case-create': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const category = String(body.category ?? ''), subject = cleanText(body.subject, 80), message = cleanText(body.message, 2000)
    if (!CASE_CATEGORIES.includes(category)) throw new Fail('Pick what the problem is about')
    if (subject.length < 3 || message.length < 5) throw new Fail('Add a short title and describe the problem')
    const reference = cleanText(body.reference, 60).replace(/[^\w-]/g, '') || null
    const open = (await d.db.userCases(p.user_id, 20)).filter((c) => c.status === 'open' || c.status === 'waiting_user')
    if (open.length >= 3) throw new Fail('You already have 3 open cases. Please wait for a reply or add to an existing one.')
    await limit(d, `case-new:${p.user_id}`, 5, 86400, 'Too many new cases today. Add details to an existing case instead.')
    const c = await d.db.createCase({ user_id: p.user_id, category, subject, reference })
    const files = await storeFiles(env, d, p.user_id, c.id, body.files)
    await d.db.addCaseMessage({ case_id: c.id, author: 'user', author_name: p.full_name, body: message, files })
    return { id: c.id }
  },

  'GET cases': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    const list = await d.db.userCases(p.user_id, 20)
    const msgs = await threads(env, d, list.map((c) => c.id))
    return { cases: list.map((c) => ({ ...c, user_id: undefined, messages: msgs.filter((m) => m.caseId === c.id) })) }
  },

  'POST case-reply': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const c = await d.db.getCase(String(body.caseId ?? ''))
    if (!c || c.user_id !== p.user_id) throw new Fail('Case not found', 404)
    if (c.status === 'resolved' || c.status === 'rejected') throw new Fail('This case is closed. Tap "Reopen the case" if it isn\'t solved, or open a new appeal.', 409)
    const message = cleanText(body.message, 2000)
    if (message.length < 2 && !(Array.isArray(body.files) && body.files.length)) throw new Fail('Write a message or attach a photo')
    await limit(d, `case-msg:${p.user_id}`, 30, 86400)
    const files = await storeFiles(env, d, p.user_id, c.id, body.files)
    await d.db.addCaseMessage({ case_id: c.id, author: 'user', author_name: p.full_name, body: message || '(photo)', files })
    await d.db.updateCase(c.id, { status: 'open' }) // a reply re-opens the case for the team
    return { ok: true }
  },

  // Real-time document check (any nationality): returns Didit's secure page for ID photo + live selfie.
  'POST kyc-start': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    if (p.kyc_status === 'verified') return { status: 'verified' }
    if (!diditEnabled(env)) throw new Fail('ID checks are not switched on yet', 503)
    // 2 attempts a day (owner's rule). After that: try again tomorrow, or send the ID to the Luda team.
    const left = kycTriesLeft(p)
    if (left <= 0) throw new Fail(`You've used today's ${KYC_TRIES_PER_DAY} ID checks. Try again tomorrow, or send your ID to the Luda team from Help.`, 429)
    const s = await diditStart(p.user_id, `${env.APP_URL.replace(/\/$/, '')}/kyc/return`, env, d.fetch).catch(async (e) => {
      // Record the real reason for the Luda team (live check + Luda HQ), at most a few times an hour.
      const why = e instanceof DiditUnavailable ? { reason: e.reason, status: e.status, said: e.said } : { reason: 'network', said: String(e).slice(0, 200) }
      if (await d.db.hit('diditfail', 10, 3600).catch(() => false)) await d.db.log(p.user_id, 'kyc_start_failed', why).catch(() => {})
      // The person isn't stuck: their try isn't counted, and they can send their ID to the team instead.
      throw new Fail(e instanceof DiditUnavailable && e.reason !== 'other'
        ? 'Automatic ID checks are paused for a moment. Please tap “Send your ID to the Luda team” below and we’ll verify you by hand.'
        : 'Could not start the ID check. Try again in a minute, or send your ID to the Luda team below.', 503)
    })
    const today = new Date().toISOString().slice(0, 10)
    await d.db.updateProfile(p.user_id, { kyc_session_id: s.sessionId, kyc_started_at: new Date().toISOString(), kyc_tries: (p.kyc_tries_day === today ? p.kyc_tries : 0) + 1, kyc_tries_day: today, ...(p.kyc_status === 'failed' || p.kyc_status === 'pending' ? { kyc_status: 'none' } : {}) } as Partial<Profile>)
    return { url: s.url, triesLeft: left - 1 }
  },

  'GET kyc-status': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    const r = await kycSync(p, env, d).catch(() => ({ status: p.kyc_status, message: 'Could not reach the ID checker. Try again in a minute.' }))
    const fresh = await d.db.profile(p.user_id)
    return { ...r, name: fresh?.kyc_name ?? null, triesLeft: fresh ? kycTriesLeft(fresh) : 0, startedAt: fresh?.kyc_started_at ?? null }
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
    if (tries >= KYC_TRIES_PER_DAY) throw new Fail(`You've used today's ${KYC_TRIES_PER_DAY} ID checks. Try again tomorrow, or send your ID to the Luda team from Help.`, 429)
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

  /* ---- owner admin ---- */
  'GET admin-overview': async ({ req, env, d }) => {
    const a = await staff(req, env, d, 'overview', 'view')
    const [ov, cases, bills, held] = await Promise.all([d.db.adminOverview(), d.db.listCases('open', 200), d.db.fn<Record<string, any>[]>('luda_admin_bills', { p_status: 'pending' }), d.db.fn<Record<string, any>[]>('luda_admin_escrows', { p_status: 'held' })])
    const disputes = held.filter((e) => e.kind !== 'bill')
    return {
      ...(can(a.staff, 'money', 'view') ? ov : { users: ov.users, verified: ov.verified, kycPending: ov.kycPending, phoneVerified: ov.phoneVerified, frozen: ov.frozen, newUsers7d: ov.newUsers7d }),
      admin: a.username, owner: a.staff.owner, perms: a.staff.perms, openCases: cases.length,
      billsPending: bills.length, billsPendingMinor: bills.reduce((t, b) => t + Number(b.amount_minor), 0),
      escrowHeld: disputes.length, escrowHeldMinor: disputes.reduce((t, e) => t + Number(e.amount_minor), 0),
    }
  },

  'GET admin-users': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'users', 'view')
    const list = await d.db.searchProfiles((url.searchParams.get('q') ?? '').slice(0, 60), 30)
    return { users: list.map(adminProfile) }
  },

  'GET admin-user': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'users', 'view')
    const u = await d.db.profile(url.searchParams.get('id') ?? '')
    if (!u) throw new Fail('User not found', 404)
    const [balances, history, tickets, withdrawals, deposits] = await Promise.all([d.db.balances(u.user_id), d.db.history(u.user_id, 50), d.db.tickets(u.user_id, 20), d.db.withdrawals(u.user_id, 20), d.db.deposits(u.user_id, 20)])
    return { user: adminProfile(u), balances, history, tickets, withdrawals: withdrawals.map((w) => ({ ...w, recipient_code: undefined })), deposits }
  },

  'GET admin-deposits': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'money', 'view')
    return { deposits: await d.db.listDeposits(url.searchParams.get('status') || null, url.searchParams.get('q') || null, 50) }
  },

  'GET admin-withdrawals': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'money', 'view')
    return { withdrawals: (await d.db.listWithdrawals(url.searchParams.get('status') || null, 50)).map((w) => ({ ...w, recipient_code: undefined })) }
  },

  'GET admin-cases': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'cases', 'view')
    const st = (url.searchParams.get('status') ?? 'open,waiting_user').replace(/[^a-z_,]/g, '') || null
    const list = await d.db.listCases(st === 'all' ? null : st, 100)
    const msgs = await d.db.caseMessages(list.map((c) => c.id))
    return { cases: list.map((c) => { const mine = msgs.filter((m) => m.case_id === c.id); const last = mine[mine.length - 1]; return { ...c, messages: mine.length, last: last ? { author: last.author, body: last.body.slice(0, 120), at: last.at, files: last.files.length } : null } }) }
  },

  'GET admin-case': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'cases', 'view')
    const c = await d.db.getCase(url.searchParams.get('id') ?? '')
    if (!c) throw new Fail('Case not found', 404)
    const u = await d.db.profile(c.user_id)
    return { case: c, user: u ? adminProfile(u) : null, messages: await threads(env, d, [c.id]) }
  },

  'POST admin-case-reply': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'cases', 'edit')
    const c = await d.db.getCase(String(body.caseId ?? ''))
    if (!c) throw new Fail('Case not found', 404)
    const message = cleanText(body.message, 2000)
    const status = ['open', 'waiting_user', 'resolved', 'rejected'].includes(String(body.status)) ? (String(body.status) as CaseStatus) : null
    if (!message && !status) throw new Fail('Write a reply or change the status')
    if (message) await d.db.addCaseMessage({ case_id: c.id, author: 'admin', author_name: 'Luda team', body: message, files: [] })
    await d.db.updateCase(c.id, { ...(status ? { status } : message ? { status: 'waiting_user' as CaseStatus } : {}), ...(status === 'resolved' || status === 'rejected' ? { resolution: message || status } : {}) })
    await d.db.fn('luda_mark_handled', { p_kind: 'case', p_id: c.id, p_staff: a.username })
    await d.db.log(c.id, 'admin_case_reply', { by: a.username, status })
    if ((status === 'resolved' || status === 'rejected') && c.status !== status)
      await notifyUser(env, d, c.user_id, { emoji: status === 'resolved' ? '✅' : '📁', title: status === 'resolved' ? 'Your case is solved' : 'Your case was closed', body: 'Tell us how we did, or reopen it if something is still wrong', url: `/help?rate=case:${c.id}`, tag: `case:${c.id}:closed:${Date.now()}`, cat: 'chats' })
    else if (message) await notifyUser(env, d, c.user_id, { emoji: '💬', title: 'The Luda team replied to you', body: c.subject, url: '/help', tag: `case:${c.id}:msg:${Date.now()}`, cat: 'chats', push: false })
    return { ok: true }
  },

  // Ask Paystack/Flutterwave again about a top-up or withdrawal (safe: it only settles what the provider confirms).
  'POST admin-recheck': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'money', 'edit')
    const ref = String(body.reference ?? '')
    await d.db.log(ref, 'admin_recheck', { by: a.username })
    if (ref.startsWith('wdr_')) { const w = await d.db.withdrawal(ref); if (!w) throw new Fail('Not found', 404); return { status: await settleWithdrawal(w, env, d) } }
    const r = await finalizeDeposit(ref, env, d, 'admin-recheck')
    if (!r) throw new Fail('Not found', 404)
    return { status: r.status }
  },

  // Changes to someone's account: always needs the admin's PIN or fingerprint, and is written to the audit log.
  'POST admin-action': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'users', 'view')
    await verifyAuth(a, body, env, d)
    const u = await d.db.profile(String(body.userId ?? ''))
    if (!u) throw new Fail('User not found', 404)
    const action = String(body.action ?? ''), reason = String(body.reason ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, 140)
    const NEED: Record<string, [Area, Level]> = { freeze: ['users', 'full'], unfreeze: ['users', 'full'], 'kyc-reset': ['kyc', 'full'], 'kyc-approve': ['kyc', 'edit'], 'kyc-reject': ['kyc', 'edit'], adjust: ['team', 'full'], 'ticket-refund': ['money', 'full'] }
    const need = NEED[action]
    if (!need) throw new Fail('Unknown action')
    if (!can(a.staff, need[0], need[1])) throw new Fail(need[0] === 'team' ? 'Only the owner can correct balances' : "Your role can't do this. Ask the owner.", 403)
    const audit = (extra: Record<string, unknown> = {}) => d.db.log(u.user_id, `admin_${action}`, { by: a.username, user: u.username, reason, ...extra })
    // When acting from a support case, tell the user in that case and update its status.
    const caseNote = async (text: string, status: CaseStatus) => {
      const c = body.caseId ? await d.db.getCase(String(body.caseId)) : null
      if (c && c.user_id === u.user_id) { await d.db.addCaseMessage({ case_id: c.id, author: 'admin', author_name: 'Luda team', body: text, files: [] }); await d.db.updateCase(c.id, { status, ...(status === 'resolved' ? { resolution: text } : {}) }); await d.db.fn('luda_mark_handled', { p_kind: 'case', p_id: c.id, p_staff: a.username }) }
    }
    switch (action) {
      case 'freeze': await d.db.updateProfile(u.user_id, { frozen: true, frozen_by: 'admin' }); break
      case 'unfreeze': await d.db.updateProfile(u.user_id, { frozen: false, frozen_by: null }); break
      case 'kyc-reset': await d.db.updateProfile(u.user_id, { kyc_status: 'none', kyc_session_id: null, kyc_doc_hash: null, kyc_tries: 0 } as Partial<Profile>); break
      case 'kyc-approve': {
        const legal = String(body.legalName ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
        if (nameTokens(legal).length < 2 || !reason) throw new Fail('Enter the legal name exactly as on the ID, and a reason')
        // Optional document details from the photo: also blocks the same document on two accounts.
        const docType = cleanText(body.docType, 30) || 'document', docNumber = cleanText(body.docNumber, 40).replace(/\s/g, ''), country = cleanText(body.country, 40).toUpperCase()
        const hash = docNumber ? await docHash(docType, country, docNumber) : null
        try {
          await d.db.updateProfile(u.user_id, {
            kyc_status: 'verified', kyc_name: legal, kyc_id_type: `manual:${docType}`.slice(0, 40), kyc_at: new Date().toISOString(),
            ...(docNumber ? { kyc_id_last4: docNumber.slice(-4), kyc_doc_hash: hash, kyc_country: country || null } : {}), ...(body.dob ? { kyc_dob: normDate(String(body.dob)) || null } : {}),
          } as Partial<Profile>)
        } catch (e) {
          if (e instanceof MoneyError && e.message === 'conflict') throw new Fail('This document is already verified on another Luda account')
          throw e
        }
        await caseNote('✅ Your identity has been verified by the Luda team. Withdrawals and sending money are now unlocked.', 'resolved')
        break
      }
      case 'kyc-reject': {
        if (!reason) throw new Fail('Tell the user why (e.g. photo blurry, document expired)')
        await d.db.updateProfile(u.user_id, { kyc_status: 'failed' })
        await caseNote(`We couldn't verify your identity: ${reason}. Please reply with clearer photos or a valid document.`, 'waiting_user')
        break
      }
      case 'adjust': {
        const cur = body.currency, amt = int(body.amountMinor)
        if (!isCur(cur) || !amt || Math.abs(amt) > 10_000_000_00) throw new Fail('Pick a wallet and a non-zero amount')
        if (!reason) throw new Fail('A reason is required for balance corrections')
        if (u.user_id === a.user_id) throw new Fail("You can't change your own balance")
        const ref = newRef('adj')
        try { await d.db.post([{ user_id: u.user_id, currency: cur, amount_minor: amt, kind: 'adjustment', ref, meta: { reason, by: a.username } }]) } catch (e) { moneyMsg(e) }
        await audit({ currency: cur, amountMinor: amt, ref })
        return { ok: true, ref }
      }
      case 'ticket-refund': {
        const r = await d.db.refundTicket(String(body.ticketId ?? '')).catch((e) => moneyMsg(e))
        if (!r.ok) throw new Fail('This ticket was already refunded or used')
        break
      }
      default: throw new Fail('Unknown action')
    }
    await audit()
    return { ok: true }
  },

  /* ---------------- savings pots ---------------- */
  'POST pot-create': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const name = clean(body.name, 40, 'a name for your pot', 2), emoji = cleanText(body.emoji, 8) || '🎯'
    const cur = body.currency === 'NGN' ? 'NGN' : 'TRY', goal = int(body.goalMinor ?? 0)
    if (!(goal >= 0 && goal <= 100_000_000_00) || goal % 100) throw new Fail('Enter a goal in whole amounts')
    const days = int(body.lockDays ?? 0)
    if (!(days >= 0 && days <= 366)) throw new Fail('Lock for at most a year')
    await limit(d, `pot-new:${p.user_id}`, 10, 86400)
    const until = days ? new Date((d.now?.() ?? new Date()).getTime() + days * 86400e3).toISOString() : null
    return { pot: await d.db.fn('luda_pot_create', { p_user: p.user_id, p_name: name, p_emoji: emoji, p_currency: cur, p_goal: goal, p_locked_until: until }).catch(featureErr) }
  },

  'POST pot-move': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const amt = int(body.amountMinor)
    if (!amt || Math.abs(amt) > 100_000_000_00 || amt % 100) throw new Fail('Enter an amount in whole Naira or Lira')
    await verifyAuth(p, body, env, d)
    return { pot: await d.db.fn('luda_pot_move', { p_user: p.user_id, p_pot: uuid(body.potId), p_amount: amt, p_ref: newRef('pot') }).catch(featureErr) }
  },

  'POST pot-close': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await d.db.fn('luda_pot_close', { p_user: p.user_id, p_pot: uuid(body.potId) }).catch((e) => { if (e instanceof MoneyError && e.message === 'not_available') throw new Fail('Move the money back to your wallet before closing this pot'); throw e })
    return { ok: true }
  },

  /* ---------------- assisted bill pay ---------------- */
  'GET features': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    const r = await d.db.fn<{ pots: unknown[]; bills: Record<string, any>[] }>('luda_features_mine', { p_user: p.user_id })
    if (r.bills.some((b) => b.status === 'pending' && b.auto?.status === 'processing') && (await d.db.hit(`topupchk:${p.user_id}`, 1, 30).catch(() => false))) {
      await checkTopups(env, d, p.user_id)
      Object.assign(r, await d.db.fn<{ pots: unknown[]; bills: Record<string, any>[] }>('luda_features_mine', { p_user: p.user_id }))
    }
    const bills = await Promise.all(r.bills.map(async (b) => ({ ...b, user_id: undefined, files: undefined, receipt: undefined, auto: b.auto ? { status: b.auto.status } : null, receiptUrls: await signAll(env, d, b.receipt), photoUrls: await signAll(env, d, b.files) })))
    const saved = await d.db.fn<unknown[]>('luda_saved_bills', { p_user: p.user_id })
    return { pots: r.pots, bills, saved, fees: featureFees(env), topup: { billers: Object.keys(topupOperators(env)), maxMinor: topupMaxMinor(env) } }
  },

  // Save a bill to pay again later (or change its name / monthly reminder) without paying now.
  'POST saved-bill-save': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await limit(d, `savedbill:${p.user_id}`, 30, 86400, 'Too many changes today. Try again tomorrow.')
    const s = savedBillArgs(body)
    return { saved: await d.db.fn('luda_saved_bill_save', { p_user: p.user_id, ...s, p_paid: false }).catch(savedErr) }
  },
  'POST saved-bill-remove': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    if (!(await d.db.fn<boolean>('luda_saved_bill_remove', { p_user: p.user_id, p_id: uuid(body.id) }))) throw new Fail('Not found', 404)
    return { ok: true }
  },

  'POST bill-create': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const type = String(body.type ?? '')
    if (!BILL_TYPES.includes(type)) throw new Fail('Pick what kind of bill it is')
    const provider = clean(body.provider, 60, 'who the bill is from (e.g. KIB-TEK)', 2)
    const account = cleanText(body.account, 40).replace(/\s+/g, '')
    if (!/^[\w\-+./]{3,40}$/.test(account)) throw new Fail('Enter the customer / subscriber number from the bill')
    const amount = lira(body.amountMinor, 10, 20_000, 'The bill amount')
    const biller = /^[a-z]{2,12}$/.test(String(body.biller ?? '')) ? String(body.biller) : null
    const details = billDetails(body.details)
    if (type === 'rent' && (!details.landlord || !details.iban || !details.period)) throw new Fail("Add the landlord's name, their IBAN and the rent month")
    // Automatic top-up: prepaid TL for an operator the owner switched on, to a valid mobile number.
    const op = type === 'phone' && biller && /top-up/i.test(details.kind ?? '') ? topupOperators(env)[biller] : undefined
    const phone = op ? mobileNumber(account) : null
    if (op && !phone) throw new Fail('Enter the mobile number like 0533 123 45 67')
    if (op && amount > topupMaxMinor(env)) throw new Fail(`Top-ups can be up to ${tl(topupMaxMinor(env))} at a time`)
    if (body.confirmed !== true) throw new Fail('Please confirm the bill details are correct')
    await verifyAuth(p, body, env, d)
    await limit(d, `bill:${p.user_id}`, 10, 86400, 'You can send up to 10 bills a day')
    const fee = billFee(amount, env)
    const files = await storeFiles(env, d, p.user_id, 'bills', body.files)
    const eta = billEta(d.now?.() ?? new Date())
    const bill = await d.db.fn<Record<string, unknown>>('luda_bill_create', { p_user: p.user_id, p_type: type, p_provider: provider, p_account: account, p_amount: amount, p_fee: fee, p_files: files, p_details: details, p_eta: eta.toISOString() }).catch(featureErr)
    await d.db.log(String(bill.id), 'bill_new', { user: p.username, type, amount, fee, biller })
    const id = String(bill.id)
    if (biller) await d.db.fn('luda_bill_set_biller', { p_bill: id, p_biller: biller })
    if (biller && body.save === true) {
      const remind = body.remind === undefined ? null : int(body.remind)
      await d.db.fn('luda_saved_bill_save', { p_user: p.user_id, p_biller: biller, p_type: type, p_provider: provider, p_account: account,
        p_details: Object.fromEntries(Object.entries(details).filter(([k]) => k !== 'period' && k !== 'reference')), p_label: cleanText(body.label, 40),
        p_amount: amount, p_remind: remind !== null && remind >= 0 && remind <= 28 ? remind : null, p_paid: true }).catch(() => null)
    }
    let status = 'pending', auto: string | null = null
    if (op && phone) {
      auto = await runTopup(env, d, id, op, amount, phone)
      if (auto === 'paid') status = 'paid'
    }
    return { bill: { ...bill, biller, status, auto: auto ? { status: auto } : null, files: undefined, user_id: undefined } }
  },

  /* ---------------- marketplace ---------------- */
  'GET market': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    if (await d.db.hit(`autorel:${p.user_id}`, 1, 600)) await d.db.fn('luda_auto_release', { p_user: p.user_id }).catch(() => {})
    const r = await d.db.fn<{ items: Record<string, any>[]; mine: Record<string, any>[]; bought: Record<string, any>[] }>('luda_market_list', { p_user: p.user_id, p_city: cleanText(url.searchParams.get('city'), 30) })
    const sign = signer(env, d)
    const view = async (l: Record<string, any>, all = false) => ({ ...l, seller: undefined, photos: undefined, mine: l.seller === p.user_id, photoUrls: await Promise.all((all ? l.photos : (l.photos ?? []).slice(0, 1)).map(sign)) })
    return { items: await Promise.all(r.items.map((l) => view(l))), mine: await Promise.all(r.mine.map((l) => view(l))), bought: await Promise.all(r.bought.map((l) => view(l))), feePct: featureFees(env).marketPct }
  },

  'GET market-item': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    const id = uuid(url.searchParams.get('id'))
    const r = await d.db.fn<{ items: Record<string, any>[]; mine: Record<string, any>[]; bought: Record<string, any>[] }>('luda_market_list', { p_user: p.user_id, p_city: '' })
    const l = [...r.items, ...r.mine, ...r.bought].find((x) => x.id === id)
    if (!l) throw new Fail('This item is no longer listed', 404)
    return { item: { ...l, seller: undefined, photos: undefined, mine: l.seller === p.user_id, photoUrls: await signAll(env, d, l.photos) } }
  },

  'POST market-list': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    needKyc(p, 'sell on the marketplace')
    const title = clean(body.title, 70, 'a title', 3), description = clean(body.description ?? '', 600, 'a description', 0)
    const category = MARKET_CATEGORIES.includes(String(body.category)) ? String(body.category) : 'other'
    const city = cleanText(body.city, 30), price = lira(body.priceMinor, 10, 100_000, 'The price')
    if (Array.isArray(body.photos) && body.photos.length > 3) throw new Fail('Add at most 3 photos')
    await limit(d, `list:${p.user_id}`, 5, 86400, 'You can post up to 5 items a day')
    const id = crypto.randomUUID()
    const photos = await storeFiles(env, d, p.user_id, `market-${id}`, body.photos)
    if (photos.some((x) => x.endsWith('.pdf'))) throw new Fail('Photos only (JPG, PNG or WEBP)')
    const row = await d.db.fn<Record<string, unknown>>('luda_market_create', { p_id: id, p_seller: p.user_id, p_title: title, p_description: description, p_category: category, p_city: city, p_price: price, p_photos: photos }).catch(featureErr)
    return { item: row }
  },

  'POST market-remove': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await d.db.fn('luda_market_remove', { p_listing: uuid(body.id), p_seller: p.user_id }).catch(featureErr)
    return { ok: true }
  },

  'POST market-buy': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const id = uuid(body.id)
    await verifyAuth(p, body, env, d)
    await limit(d, `buy:${p.user_id}`, 20, 86400)
    const r = await d.db.fn<{ price_minor: number }>('luda_market_buy', { p_listing: id, p_buyer: p.user_id, p_fee_pct: featureFees(env).marketPct }).catch(featureErr)
    await d.db.log(id, 'market_buy', { buyer: p.username, price: r.price_minor })
    const pt = await parties(d, 'market', id)
    if (pt) await notifyUser(env, d, pt.seller, { emoji: '🛍️', title: `@${p.username} bought "${pt.title}"`, body: 'Hand it over; you’re paid when they confirm', url: '/market', tag: `market:${id}:buy:${Date.now()}`, cat: 'money', push: false })
    return { ok: true }
  },

  // Buyer has the item: pay the seller.
  'POST market-received': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const id = uuid(body.id)
    await verifyAuth(p, body, env, d)
    const r = await d.db.fn<{ items: unknown[]; mine: unknown[]; bought: Record<string, any>[] }>('luda_market_list', { p_user: p.user_id, p_city: '' })
    if (!r.bought.some((l) => l.id === id && l.status === 'reserved')) throw new Fail('Nothing to confirm for this item', 409)
    await d.db.fn('luda_market_finish', { p_listing: id, p_to: 'seller', p_note: 'Buyer confirmed receipt' }).catch(featureErr)
    await d.db.log(id, 'market_released', { by: p.username })
    return { ok: true }
  },

  // Seller can't hand it over: give the buyer their money back.
  'POST market-cancel': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const id = uuid(body.id)
    const r = await d.db.fn<{ items: unknown[]; mine: Record<string, any>[]; bought: unknown[] }>('luda_market_list', { p_user: p.user_id, p_city: '' })
    if (!r.mine.some((l) => l.id === id && l.status === 'reserved')) throw new Fail('Nothing to cancel for this item', 409)
    await d.db.fn('luda_market_finish', { p_listing: id, p_to: 'buyer', p_note: 'Seller cancelled the sale' }).catch(featureErr)
    await d.db.log(id, 'market_cancelled', { by: p.username })
    return { ok: true }
  },

  /* ---------------- Flash help ---------------- */
  'GET flash': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    if (await d.db.hit(`autorel:${p.user_id}`, 1, 600)) await d.db.fn('luda_auto_release', { p_user: p.user_id }).catch(() => {})
    const r = await d.db.fn<Record<string, Record<string, any>[]>>('luda_flash_list', { p_user: p.user_id, p_city: cleanText(url.searchParams.get('city'), 30) })
    const strip = (j: Record<string, any>) => ({ ...j, poster: undefined, helper: undefined, mine: j.poster === p.user_id })
    return { open: r.open.map(strip), mine: r.mine.map(strip), helping: r.helping.map(strip), feePct: featureFees(env).flashPct }
  },

  'POST flash-post': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const title = clean(body.title, 70, 'what you need help with', 5), details = clean(body.details ?? '', 400, 'details', 0)
    const city = cleanText(body.city, 30), reward = lira(body.rewardMinor, 20, 5_000, 'The reward')
    await verifyAuth(p, body, env, d)
    await limit(d, `flash:${p.user_id}`, 5, 86400, 'You can post up to 5 Flash jobs a day')
    const fee = Math.round(reward * featureFees(env).flashPct)
    const job = await d.db.fn<Record<string, unknown>>('luda_flash_post', { p_poster: p.user_id, p_title: title, p_details: details, p_city: city, p_reward: reward, p_fee: fee }).catch(featureErr)
    // The emoji the poster picked (from Luda's list only), else the best match for the title.
    const emoji = JOB_EMOJI_PICK.includes(String(body.emoji)) ? String(body.emoji) : jobEmoji(`${title} ${details}`)
    await d.db.fn('luda_flash_emoji', { p_job: job.id, p_emoji: emoji })
    return { job: { ...job, emoji } }
  },

  'POST flash-take': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    needKyc(p, 'take paid Flash jobs')
    const r = await d.db.fn<Record<string, Record<string, any>[]>>('luda_flash_list', { p_user: p.user_id, p_city: '' })
    if (r.helping.filter((j) => j.status === 'taken').length >= 3) throw new Fail('Finish your current jobs first (max 3 at a time)')
    await limit(d, `flash-take:${p.user_id}`, 10, 86400)
    const job = await d.db.fn('luda_flash_take', { p_job: uuid(body.id), p_helper: p.user_id }).catch(featureErr)
    const pt = await parties(d, 'flash', String(body.id))
    if (pt) await notifyUser(env, d, pt.poster, { emoji: '⚡', title: `@${p.username} is doing "${pt.title}"`, body: 'Tap Job done when it’s finished', url: '/flash', tag: `flash:${body.id}:take:${Date.now()}`, cat: 'money', push: false })
    return { job }
  },

  'POST flash-drop': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    return { job: await d.db.fn('luda_flash_drop', { p_job: uuid(body.id), p_helper: p.user_id }).catch(featureErr) }
  },

  // Poster: job done → pay the helper. Or cancel an open job → reward back.
  'POST flash-done': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const id = uuid(body.id)
    await verifyAuth(p, body, env, d)
    const r = await d.db.fn<Record<string, Record<string, any>[]>>('luda_flash_list', { p_user: p.user_id, p_city: '' })
    if (!r.mine.some((j) => j.id === id && j.status === 'taken')) throw new Fail('Nothing to confirm for this job', 409)
    await d.db.fn('luda_flash_finish', { p_job: id, p_to: 'helper', p_note: 'Poster confirmed the job is done' }).catch(featureErr)
    return { ok: true }
  },

  'POST flash-cancel': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const id = uuid(body.id)
    const r = await d.db.fn<Record<string, Record<string, any>[]>>('luda_flash_list', { p_user: p.user_id, p_city: '' })
    const j = r.mine.find((x) => x.id === id)
    if (!j || j.status !== 'open') throw new Fail(j?.status === 'taken' ? 'Someone is already doing this job. Ask them to drop it, or open a case if there is a problem.' : 'Nothing to cancel', 409)
    await d.db.fn('luda_flash_finish', { p_job: id, p_to: 'poster', p_note: 'Poster cancelled' }).catch(featureErr)
    return { ok: true }
  },

  /* ---------------- admin: bills and money in escrow ---------------- */
  'GET admin-bills': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'bills', 'view')
    const st = url.searchParams.get('status')
    if ((st ?? 'pending') === 'pending' && (await d.db.hit('topupchk:all', 1, 30).catch(() => false))) await checkTopups(env, d)
    const list = await d.db.fn<Record<string, any>[]>('luda_admin_bills', { p_status: st === 'all' ? null : st || 'pending' })
    return { bills: await Promise.all(list.map(async (b) => ({ ...b, photoUrls: await signAll(env, d, b.files), receiptUrls: await signAll(env, d, b.receipt), files: undefined, receipt: undefined }))) }
  },

  'POST admin-bill': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'bills', 'edit')
    await verifyAuth(a, body, env, d)
    const id = uuid(body.billId), paid = body.paid === true, note = cleanText(body.note, 200)
    if (!paid && !note) throw new Fail('Tell the user why the bill could not be paid')
    const cur = (await d.db.fn<Record<string, any>[]>('luda_admin_bills', { p_status: 'pending' })).find((x) => x.id === id)
    if (cur?.auto?.status === 'processing') throw new Fail('An automatic top-up is still running for this bill. Wait for it to finish.', 409)
    if (cur?.claimed_by && cur.claimed_by !== a.username && Date.parse(cur.claimed_at) > Date.now() - 45 * 60e3) throw new Fail(`@${cur.claimed_by} is paying this bill right now`, 409)
    if (paid && body.checked !== true) throw new Fail('Tick that the receipt shows the same number and amount')
    if (!paid && !can(a.staff, 'bills', 'full')) throw new Fail("Your role can mark bills as paid, but refunds need the owner or a 'full' bills role", 403)
    const receipt = paid ? await storeFiles(env, d, a.user_id, `receipts`, body.files) : []
    if (paid && !receipt.length) throw new Fail('Attach the payment receipt (photo or PDF)')
    const r = await d.db.fn<{ ok: boolean }>('luda_bill_settle', { p_bill: id, p_paid: paid, p_note: note || 'Paid by the Luda team', p_receipt: receipt })
    if (!r.ok) throw new Fail('This bill was already handled', 409)
    await d.db.log(id, paid ? 'admin_bill_paid' : 'admin_bill_refunded', { by: a.username, note })
    await d.db.fn('luda_mark_handled', { p_kind: 'bill', p_id: id, p_staff: a.username })
    const owner = await d.db.fn<string | null>('luda_bill_user', { p_bill: id }).catch(() => null)
    if (owner && paid) await notifyUser(env, d, owner, { emoji: '🧾', title: 'Your bill is paid', body: 'The receipt is in Bills. Tell us how it went', url: `/bills?rate=bill:${id}`, tag: `bill:${id}`, cat: 'money' })
    else if (owner) await pushUser(env, d, owner, { title: '↩️ Bill refunded', body: note, url: '/bills', tag: `bill:${id}`, cat: 'money' })
    return { ok: true }
  },

  // "I'm paying this one" (or let it go): stops two people paying the same bill.
  'POST admin-bill-claim': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'bills', 'edit')
    const r = await d.db.fn<{ ok: boolean; why?: string; by?: string }>('luda_bill_claim', { p_bill: uuid(body.billId), p_staff: a.username, p_release: body.release === true })
    if (!r.ok) throw new Fail(r.why === 'auto' ? 'An automatic top-up is still running for this bill' : r.why === 'claimed' ? `@${r.by} is already paying this bill` : 'This bill was already handled', 409)
    return { ok: true, claimedBy: body.release === true ? null : a.username }
  },

  // The top-up partner's operators for a country, so the owner can pick the right North Cyprus ids for TOPUP_OPERATORS.
  'GET admin-topup-operators': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'bills', 'full')
    if (!env.RELOADLY_CLIENT_ID || !env.RELOADLY_CLIENT_SECRET) return { on: false, operators: [], active: {} }
    const country = /^[A-Z]{2}$/.test(url.searchParams.get('country') ?? '') ? url.searchParams.get('country')! : 'TR'
    const operators = await topupOperatorList(env, d.fetch, country).catch((e) => { throw new Fail(`The top-up partner didn't answer: ${String((e as Error).message)}`, 502) })
    return { on: true, operators, active: topupOperators(env) }
  },

  'GET admin-escrows': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'disputes', 'view')
    const st = url.searchParams.get('status')
    return { escrows: await d.db.fn('luda_admin_escrows', { p_status: st === 'all' ? null : st || 'held' }) }
  },

  // Resolve a marketplace / Flash dispute: pay the seller or helper, or refund the buyer or poster.
  'POST admin-escrow': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'disputes', 'full')
    await verifyAuth(a, body, env, d)
    const to = body.to === 'payee' ? 'payee' : body.to === 'payer' ? 'payer' : ''
    const note = cleanText(body.note, 200)
    if (!to || !note) throw new Fail('Choose who gets the money and add a reason')
    const list = await d.db.fn<Record<string, any>[]>('luda_admin_escrows', { p_status: 'held' })
    const e = list.find((x) => x.id === uuid(body.escrowId))
    if (!e) throw new Fail('This money was already released or refunded', 409)
    const item = e.item as { type: string; id: string } | null
    let r: { ok: boolean }
    if (item?.type === 'market') r = await d.db.fn('luda_market_finish', { p_listing: item.id, p_to: to === 'payee' ? 'seller' : 'buyer', p_note: `Luda team: ${note}` })
    else if (item?.type === 'flash') {
      if (to === 'payee' && !e.payee) throw new Fail('Nobody has taken this job yet')
      r = await d.db.fn('luda_flash_finish', { p_job: item.id, p_to: to === 'payee' ? 'helper' : 'poster', p_note: `Luda team: ${note}` })
    } else if (item?.type === 'bill') r = await d.db.fn('luda_bill_settle', { p_bill: item.id, p_paid: to === 'payee', p_note: note, p_receipt: [] })
    else if (item?.type === 'p2p') {
      r = await d.db.fn('luda_p2p_finish', { p_order: item.id, p_to: to === 'payee' ? 'sender' : 'payer', p_note: `Luda team: ${note}` })
      if (r.ok) await d.db.fn('luda_p2p_msg', { p_order: item.id, p_user: null, p_body: `Luda team decision: ${note}`, p_files: [] })
    }
    else throw new Fail('Unknown item')
    if (!r.ok) throw new Fail('This was already settled', 409)
    if (body.caseId) {
      const c = await d.db.getCase(String(body.caseId))
      if (c) { await d.db.addCaseMessage({ case_id: c.id, author: 'admin', author_name: 'Luda team', body: `Decision: ${note}`, files: [] }); await d.db.updateCase(c.id, { status: 'resolved', resolution: note }); await d.db.fn('luda_mark_handled', { p_kind: 'case', p_id: c.id, p_staff: a.username }) }
    }
    await d.db.log(String(body.escrowId), 'admin_escrow', { by: a.username, to, note })
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
    const name = await resolveAccount(env.PAYSTACK_SECRET_KEY, account, bank, d.fetch).catch(() => { throw new Fail('Could not find that account. Check the number and bank.') })
    if (!accountMatchesName(name, p.kyc_name ?? '')) throw new Fail(`You can only withdraw to your own account. "${name}" doesn't match your verified name.`)
    // The bank's name comes from Paystack's own list (not from the app), so Flutterwave gets the right bank.
    const bankName = (await listBanks(env.PAYSTACK_SECRET_KEY, d.fetch).catch(() => [])).find((x) => x.code === bank)?.name ?? String(body.bankName ?? '').slice(0, 60)
    // The fee is priced in lira: taken from the Lira wallet when it has enough, otherwise the same value in Naira (today's rate).
    const feeTry = withdrawFee(env), reference = newRef('wdr')
    const bal = await d.db.balances(p.user_id)
    let fee = feeTry, feeCur: 'NGN' | 'TRY' = 'TRY'
    if ((bal.TRY ?? 0) < feeTry) { fee = feeTry ? Math.ceil(feeTry * (await ngnPerTry(env, d.fetch))) : 0; feeCur = 'NGN' }
    try { await d.db.withdraw(p.user_id, reference, amount, fee, feeCur, bank, bankName, account, name, '') } catch (e) { moneyMsg(e) }
    await d.db.log(reference, 'withdraw_init', { amount, fee, feeCur, bank })
    const r = await payOut(reference, amount, bank, bankName, account, name, env, d)
    return { reference, status: r.status, accountName: name, feeMinor: fee, feeCurrency: feeCur, feeTry, ...('message' in r ? { message: r.message } : {}) }
  },

  /* ---------------- P2P: saved lira bank accounts ---------------- */
  'GET pay-methods': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    return { methods: await d.db.fn('luda_pay_methods', { p_user: p.user_id }), holder: p.kyc_name ?? null }
  },
  'POST pay-method-add': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    if (p.kyc_status !== 'verified' || !p.kyc_name) throw new Fail('Verify your ID first: the account must be in your verified name', 403)
    const iban = String(body.iban ?? '').replace(/\s+/g, '').toUpperCase()
    const currency = p2pAsset(body.currency)
    if (currency === 'TRY' ? !IBAN.test(iban) : !IBAN_ANY.test(iban)) throw new Fail(currency === 'TRY' ? 'Enter a Turkish IBAN: TR followed by 24 digits' : 'Enter a valid IBAN (letters, then numbers, no spaces)')
    const bank = clean(body.bank, 60, 'the bank name', 2)
    await limit(d, `paym:${p.user_id}`, 10, 86400, 'Too many changes today. Try again tomorrow.')
    // The holder is always the verified legal name, so money can only be sent to the trader's own account.
    return { method: await d.db.fn('luda_pay_method_add2', { p_user: p.user_id, p_bank: bank, p_iban: iban, p_holder: p.kyc_name, p_currency: currency }).catch(p2pErr) }
  },
  'POST pay-method-remove': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await d.db.fn('luda_pay_method_remove', { p_user: p.user_id, p_id: uuid(body.id) })
    return { ok: true }
  },

  /* ---------------- P2P: ads ---------------- */
  // ?want=buy → ads of people SELLING lira; ?want=sell → ads of people BUYING lira. Nearby (same area, then city) first.
  'GET p2p': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    if (await d.db.hit('p2pexpire', 1, 60).catch(() => false)) await d.db.fn('luda_p2p_expire', {}).catch(() => {})
    const want = url.searchParams.get('want') === 'sell' ? 'sell' : 'buy'
    const asset = p2pAsset(url.searchParams.get('asset'))
    const city = cleanText(url.searchParams.get('city'), 30), area = cleanText(url.searchParams.get('area'), 40).toLowerCase()
    let ads = await d.db.fn<Record<string, any>[]>('luda_p2p_ads2', { p_side: want === 'buy' ? 'sell' : 'buy', p_asset: asset, p_viewer: p.user_id })
    const hidden = new Set((await d.db.fn<{ hidden: string[] }>('luda_p2p_blocks', { p_user: p.user_id })).hidden)
    ads = ads.filter((a) => !hidden.has(a.maker))
    const seen = ads.length ? await d.db.fn<Record<string, string | null>>('luda_presence', { p_usernames: [...new Set(ads.map((x) => String(x.maker)))] }) : {}
    const exNames = new Set(await d.db.fn<string[]>('luda_exchanger_names', {}).catch(() => [] as string[]))
    ads = ads.map((x) => ({ ...x, lastSeen: seen[x.maker] ?? null, exchanger: exNames.has(x.maker) }))
    const near = (a: Record<string, any>) => (area && String(a.area).toLowerCase() === area ? 2 : 0) + (city && a.city === city ? 1 : 0)
    if (url.searchParams.get('near') === '1') ads = ads.filter((a) => near(a) > 0)
    // Bybit-style: best price first (cheapest when you buy, highest when you sell); nearby breaks ties.
    ads.sort((a, b) => (want === 'buy' ? a.price - b.price : b.price - a.price) || near(b) - near(a))
    const mid = await marketNgnPer(asset, env, d)
    const mine = await d.db.fn<Record<string, any>[]>('luda_p2p_my_ads', { p_user: p.user_id })
    return { ads: ads.map((a) => ({ ...a, nearby: near(a) })), mine, asset, market: mid, rules: { ...(await p2pLimits(p.user_id, d)), feePct: featureFees(env).p2pPct, feeMinTry: featureFees(env).p2pMinMinor, feeMaxTry: featureFees(env).p2pMaxMinor, assetPerTry: asset === 'TRY' ? 1 : await perTry(asset, env, d.fetch).catch(() => null) }, canTrade: !p2pBlock(p), why: p2pBlock(p) }
  },
  'POST p2p-ad-save': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const block = p2pBlock(p); if (block) throw new Fail(block, 403)
    const side = body.side === 'buy' ? 'buy' : 'sell'
    const asset = p2pAsset(body.asset), sym = P2P_SYMBOL[asset]
    const price = Number(body.price)
    // People set their own rate. Only obvious mistakes (more than 50% away from the market) are blocked.
    const mid = await marketNgnPer(asset, env, d)
    if (!(price > 0) || !(price < 1_000_000)) throw new Fail('Enter your price in Naira')
    if (mid && Math.abs(price - mid) / mid > P2P_RULES.priceBand) throw new Fail(`That price looks like a typo: today's market is about ₦${mid.toFixed(2)} per ${sym}1`)
    const minTry = int(body.minTry), maxTry = int(body.maxTry), lim = await p2pLimits(p.user_id, d)
    if (!(minTry >= lim.minTry) || !(maxTry >= minTry) || maxTry > lim.maxTry || minTry % 100 || maxTry % 100) throw new Fail(`Limits must be whole lira between ₺${lim.minTry / 100} and ₺${(lim.maxTry / 100).toLocaleString('en-US')}${lim.exchanger ? '' : '. Verified Exchangers can go up to ₺50,000'}`)
    const methods = (Array.isArray(body.methods) ? body.methods : []).filter((m: unknown) => m === 'bank' || m === 'cash')
    if (!methods.length) throw new Fail('Choose how the lira is paid: bank transfer and/or cash')
    let receive: string | null = null
    if (side === 'buy' && methods.includes('bank')) {
      receive = uuid(body.receiveMethod)
      const mine = await d.db.fn<{ id: string }[]>('luda_pay_methods', { p_user: p.user_id })
      const m = (mine as { id: string; currency?: string }[]).find((x) => x.id === receive)
      if (!m || (m.currency ?? 'TRY') !== asset) throw new Fail(`Choose your ${asset} bank account where you receive the money`)
    }
    const area = body.area ? clean(body.area, 40, 'your area') : '', terms = body.terms ? clean(body.terms, 300, 'your terms') : ''
    if (methods.includes('cash') && !area) throw new Fail('For cash, add the area where you meet (e.g. Hamitköy)')
    await limit(d, `p2pad:${p.user_id}`, 20, 86400, 'Too many ad changes today')
    const status = body.status === 'paused' ? 'paused' : body.status === 'removed' ? 'removed' : 'active'
    const ad = await d.db.fn('luda_p2p_ad_save', { p_user: p.user_id, p_id: body.id ? uuid(body.id) : null, p_max_ads: lim.maxAds,
      p: { side, asset, price: Math.round(price * 10000) / 10000, min_try: minTry, max_try: maxTry, methods, receive_method: receive ?? '', city: cleanText(body.city, 30), area, terms, status } }).catch(p2pErr)
    await d.db.log(String((ad as { id: string }).id), 'p2p_ad', { user: p.username, side, price, status })
    return { ad }
  },

  /* ---------------- P2P: orders ---------------- */
  'POST p2p-order': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const block = p2pBlock(p); if (block) throw new Fail(block, 403)
    const method = body.method === 'cash' ? 'cash' : 'bank'
    const amountTry = int(body.amountTry)
    if (!(amountTry > 0) || amountTry % 100) throw new Fail('Enter a whole lira amount')
    let tryTo: Record<string, unknown> = {}
    // Which side the taker is on comes from the ad on the server, never from the app.
    const ad = await d.db.fn<{ side: string; asset: string } | null>('luda_p2p_ad_get', { p_id: uuid(body.adId) })
    if (!ad) throw new Fail('This ad is no longer available', 409)
    const side = ad.side
    if (side === 'sell') { // taker pays Naira and receives the lira
      if (method === 'bank') {
        const m = (await d.db.fn<Record<string, string>[]>('luda_pay_methods', { p_user: p.user_id })).find((x) => x.id === String(body.payMethodId ?? ''))
        if (!m || (m.currency ?? 'TRY') !== (ad as { asset?: string }).asset) throw new Fail(`Choose your ${(ad as { asset?: string }).asset ?? 'TRY'} bank account to receive the money`)
        tryTo = { kind: 'bank', bank: m.bank, iban: m.iban, holder: m.holder, currency: m.currency }
      } else tryTo = { kind: 'cash', area: cleanText(body.area, 40) }
      await verifyAuth(p, body, env, d) // Naira leaves the wallet into escrow: PIN / fingerprint
    } else if (method === 'cash') tryTo = { kind: 'cash', area: cleanText(body.area, 40) }
    await limit(d, `p2porder:${p.user_id}`, 10, 86400, 'You can open 10 P2P orders a day')
    if (await d.db.fn<boolean>('luda_p2p_blocked_ad', { p_ad: uuid(body.adId), p_user: p.user_id })) throw new Fail('You can\'t trade with this person', 403)
    // The fee is priced in lira (0.5%, min ₺1, max ₺25) and collected from the held Naira at this trade's own rate.
    const asset = (ad as { asset?: string }).asset ?? 'TRY'
    const liraMinor = asset === 'TRY' ? amountTry : Math.round(amountTry / (await perTry(asset, env, d.fetch)))
    const feeTry = p2pFeeTry(liraMinor, env)
    const o = await d.db.fn<Record<string, any>>('luda_p2p_order_create', { p_ad: uuid(body.adId), p_taker: p.user_id, p_try: amountTry, p_fee_pct: liraMinor > 0 ? feeTry / liraMinor : 0, p_method: method, p_try_to: tryTo, p_window_min: P2P_RULES.windowMin }).catch(p2pErr)
    await d.db.fn('luda_p2p_set_fee_try', { p_order: o.id, p_fee: feeTry }).catch(() => {})
    await d.db.log(String(o.id), 'p2p_order', { user: p.username, amountTry, ngn: o.amount_ngn, feeTry })
    const pt = await parties(d, 'p2p', String(o.id))
    if (pt) await notifyUser(env, d, pt.payer === p.user_id ? pt.sender : pt.payer, { emoji: '🤝', title: `New P2P order from @${p.username}`, body: `${fmtMoney(amountTry, pt.asset)} · open it to continue`, url: `/p2p/${o.id}`, tag: `p2p:${o.id}:new`, cat: 'money', push: false })
    return { order: { ...o, fee_try: feeTry } }
  },
  'GET p2p-orders': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    if (await d.db.hit('p2pexpire', 1, 60).catch(() => false)) await d.db.fn('luda_p2p_expire', {}).catch(() => {})
    return { orders: await d.db.fn('luda_p2p_orders', { p_user: p.user_id }) }
  },
  'GET p2p-order': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    if (await d.db.hit('p2pexpire', 1, 60).catch(() => false)) await d.db.fn('luda_p2p_expire', {}).catch(() => {})
    const o = await d.db.fn<Record<string, any> | null>('luda_p2p_order', { p_order: uuid(url.searchParams.get('id')), p_user: p.user_id })
    if (!o) throw new Fail('Not found', 404)
    return { order: await p2pSigned(env, d, o) }
  },
  'POST p2p-sent': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const files = await storeFiles(env, d, p.user_id, 'p2p', body.files)
    if (!files.length) throw new Fail('Attach the transfer receipt (screenshot or PDF)')
    await d.db.fn('luda_p2p_sent', { p_order: uuid(body.id), p_user: p.user_id, p_receipt: files }).catch(p2pErr)
    const pt = await parties(d, 'p2p', String(body.id))
    if (pt) await notifyUser(env, d, pt.payer, { emoji: '✅', title: `@${p.username} says they sent ${fmtMoney(pt.amount, pt.asset)}`, body: 'Check your own bank app, then release', url: `/p2p/${body.id}`, tag: `p2p:${body.id}:sent`, cat: 'money', push: false })
    return { ok: true }
  },
  'POST p2p-release': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await verifyAuth(p, body, env, d)
    await d.db.fn('luda_p2p_release', { p_order: uuid(body.id), p_user: p.user_id }).catch(p2pErr)
    await d.db.log(String(body.id), 'p2p_release', { user: p.username })
    return { ok: true }
  },
  'POST p2p-cancel': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await d.db.fn('luda_p2p_cancel', { p_order: uuid(body.id), p_user: p.user_id }).catch(p2pErr)
    const pt = await parties(d, 'p2p', String(body.id))
    if (pt) await notifyUser(env, d, pt.payer === p.user_id ? pt.sender : pt.payer, { emoji: '✖️', title: `@${p.username} cancelled your P2P order`, url: `/p2p/${body.id}`, tag: `p2p:${body.id}:cancel`, cat: 'money' })
    return { ok: true }
  },
  'POST p2p-appeal': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const reason = clean(body.reason, 300, 'what went wrong', 5)
    await d.db.fn('luda_p2p_appeal2', { p_order: uuid(body.id), p_user: p.user_id, p_reason: reason, p_wait_min: P2P_RULES.appealWaitMin }).catch(p2pErr)
    await d.db.log(String(body.id), 'p2p_appeal', { user: p.username, reason })
    const pt = await parties(d, 'p2p', String(body.id))
    if (pt) await notifyUser(env, d, pt.payer === p.user_id ? pt.sender : pt.payer, { emoji: '⚖️', title: `@${p.username} opened an appeal on your P2P order`, body: 'Reply in the order chat', url: `/p2p/${body.id}`, tag: `p2p:${body.id}:appeal`, cat: 'money', push: false })
    return { ok: true }
  },
  'POST p2p-video-start': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const o = await d.db.fn<Record<string, any> | null>('luda_p2p_order', { p_order: uuid(body.id), p_user: p.user_id })
    if (!o) throw new Fail('Not found', 404)
    if (!['waiting', 'sent', 'appeal'].includes(o.status)) throw new Fail('This order is closed', 409)
    const ext = VIDEO_TYPES[String(body.type ?? '')]
    if (!ext) throw new Fail('Use a normal phone video (MP4, MOV or WebM)')
    if (!(Number(body.size) > 0 && Number(body.size) <= MAX_VIDEO_BYTES)) throw new Fail('The video must be under 50 MB. Record only the important part, or send it in two parts.')
    await limit(d, `p2pvideo:${p.user_id}`, 6, 86400, 'You can upload 6 videos a day')
    const path = `${p.user_id}/p2p-${o.id}/${randomHex(8)}.${ext}`
    return { path, uploadUrl: await uploadUrl({ SUPABASE_URL: env.SUPABASE_URL, SERVICE_KEY: env.SERVICE_KEY }, path, d.fetch).catch(() => { throw new Fail('Upload is not available right now, try again', 502) }) }
  },
  'POST p2p-msg': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await limit(d, `p2pmsg:${p.user_id}`, 30, 600, 'Slow down a little')
    const text = body.body ? clean(body.body, 500, 'a message') : ''
    const files = await storeFiles(env, d, p.user_id, 'p2p', body.files)
    // A proof video uploaded through p2p-video-start: only accepted from its own folder for this order.
    if (body.video) {
      const v = String(body.video)
      if (!new RegExp(`^${p.user_id}/p2p-${uuid(body.id)}/[0-9a-f]{16}\\.(mp4|webm|mov|3gp)$`).test(v)) throw new Fail('That video upload is not valid')
      files.push(v)
    }
    if (!text && !files.length) throw new Fail('Write a message or attach a photo')
    // In an appeal people can send evidence to the Luda team only (Bybit-style): the other person doesn't see it.
    if (body.private) await d.db.fn('luda_p2p_msg_v', { p_order: uuid(body.id), p_user: p.user_id, p_body: text, p_files: files, p_vis: 'staff' }).catch(p2pErr)
    else {
      await d.db.fn('luda_p2p_msg', { p_order: uuid(body.id), p_user: p.user_id, p_body: text, p_files: files }).catch(p2pErr)
      const pt = await parties(d, 'p2p', String(body.id))
      // One alert per minute per order, so a chat doesn't flood the inbox.
      if (pt) await notifyUser(env, d, pt.payer === p.user_id ? pt.sender : pt.payer, { emoji: '💬', title: `New message from @${p.username}`, body: text ? text.slice(0, 80) : '📎 Photo', url: `/p2p/${body.id}`, tag: `p2p:${body.id}:msg:${Math.floor(Date.now() / 60000)}`, cat: 'chats' })
    }
    return { ok: true }
  },
  'POST p2p-appeal-cancel': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await d.db.fn('luda_p2p_appeal_cancel', { p_order: uuid(body.id), p_user: p.user_id }).catch(p2pErr)
    return { ok: true }
  },
  // Luda team: take a dispute, message both sides, decide.
  'POST admin-p2p-claim': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'disputes', 'edit')
    await d.db.fn('luda_p2p_claim', { p_order: uuid(body.id), p_staff: a.username }).catch(p2pErr)
    await d.db.log(String(body.id), 'admin_p2p_claim', { by: a.username })
    return { ok: true }
  },
  'POST admin-p2p-msg': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'disputes', 'edit')
    const text = clean(body.body, 800, 'a message')
    // Optional: ask one or both people for a reply within a deadline (Bybit-style). Their next message counts as the reply.
    const ask = (body.ask ?? null) as { who?: string; minutes?: number } | null
    if (ask && ask.who) {
      const who = ['payer', 'sender', 'both'].includes(String(ask.who)) ? String(ask.who) : ''
      const minutes = Number(ask.minutes)
      if (!who || ![15, 30, 60, 180, 1440].includes(minutes)) throw new Fail('Pick who must reply and how long they have')
      await d.db.fn('luda_p2p_staff_ask', { p_order: uuid(body.id), p_staff: `Luda team · ${a.username}`, p_body: text, p_who: who, p_minutes: minutes }).catch(p2pErr)
      await d.db.log(String(body.id), 'admin_p2p_ask', { by: a.username, who, minutes })
    } else await d.db.fn('luda_p2p_staff_msg', { p_order: uuid(body.id), p_staff: `Luda team · ${a.username}`, p_body: text }).catch(p2pErr)
    const pt = await parties(d, 'p2p', String(body.id))
    for (const u of pt ? [pt.payer, pt.sender] : []) await notifyUser(env, d, u, { emoji: '🛡️', title: 'Message from the Luda team about your P2P order', body: text.slice(0, 100), url: `/p2p/${body.id}`, tag: `p2p:${body.id}:staff:${Date.now()}`, cat: 'chats' })
    return { ok: true }
  },
  'POST admin-p2p-decide': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'disputes', 'full')
    await verifyAuth(a, body, env, d)
    const to = body.to === 'sender' ? 'sender' : body.to === 'payer' ? 'payer' : ''
    const note = cleanText(body.note, 300)
    if (!to || !note) throw new Fail('Choose who gets the Naira and write the reason (both people see it)')
    const r = await d.db.fn<{ ok: boolean }>('luda_p2p_finish', { p_order: uuid(body.id), p_to: to, p_note: `Luda team decision: ${note}` })
    if (!r.ok) throw new Fail('This order was already closed', 409)
    await d.db.fn('luda_p2p_staff_msg', { p_order: uuid(body.id), p_staff: `Luda team · ${a.username}`, p_body: `Decision: ${to === 'sender' ? 'Naira released to the sender' : 'Naira refunded to the payer'}. ${note}` })
    await d.db.log(String(body.id), 'admin_p2p_decide', { by: a.username, to, note })
    const pt = await parties(d, 'p2p', String(body.id))
    for (const u of pt ? [pt.payer, pt.sender] : []) await notifyUser(env, d, u, { emoji: '⚖️', title: 'The Luda team decided your P2P dispute', body: note.slice(0, 100), url: `/p2p/${body.id}`, tag: `p2p:${body.id}:decided`, cat: 'money' })
    return { ok: true }
  },
  'GET admin-p2p': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'disputes', 'view')
    const id = url.searchParams.get('id')
    if (id) { const o = await d.db.fn<Record<string, any> | null>('luda_p2p_order', { p_order: uuid(id), p_user: null }); if (!o) throw new Fail('Not found', 404); return { order: await p2pSigned(env, d, o) } }
    if (await d.db.hit('p2pexpire', 1, 60).catch(() => false)) await d.db.fn('luda_p2p_expire', {}).catch(() => {})
    const st = url.searchParams.get('status')
    return { orders: await d.db.fn('luda_p2p_admin', { p_status: st === 'all' ? null : st || 'appeal' }) }
  },

  /* ---------------- rewards: XP, points, spin, challenges, referrals ---------------- */
  'GET rewards': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    if (await d.db.hit(`refsettle:${p.user_id}`, 1, 60).catch(() => false)) await settleReferrals(p, env, d).catch(() => {})
    const a = await d.db.fn<Activity>('luda_activity', { p_user: p.user_id })
    const month = cyprusDay().slice(0, 7), claimed = new Set<string>(a.claimed ?? [])
    return {
      xp: xpOf(a), points: Number(a.points), streak: Number(a.streak), checkedInToday: a.lastCheckin === cyprusDay(), spunToday: claimed.has(`spin:${cyprusDay()}`),
      badges: badgesOf(a), quests: questsDone(a), questXp: QUEST_XP, cashEarned: Number(a.cashEarned), recent: a.recent,
      challenges: CHALLENGES.map((c) => ({ id: c.id, goal: c.goal, progress: Number(a[c.key] ?? 0), prize: c.prizeLabel, claimed: claimed.has(`challenge:${c.id}:${month}`) })),
      spin: SPIN.map((x) => ({ label: x.label, cash: !!x.cash })), redeem: REDEEM, verified: p.kyc_status === 'verified',
      referral: { code: `LUDA-${p.username.toUpperCase()}`, reward: REFERRAL_RULES.reward, welcome: REFERRAL_RULES.welcome, perMonthCap: REFERRAL_RULES.perMonthCap, tiers: REFERRAL_RULES.tiers, verifiedFriends: Number(a.referralsVerified), invitedBy: p.invited_by ? true : false },
    }
  },
  // Daily check-in + spin (once per Cyprus day). Cash prizes only for ID-verified accounts (one person = one account).
  'POST spin': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    if (p.frozen) throw new Fail('Your account is on hold', 403)
    const day = cyprusDay()
    const c = await d.db.fn<{ already: boolean; streak: number }>('luda_checkin', { p_user: p.user_id, p_day: day })
    if (!c.already) await d.db.fn('luda_reward', { p_user: p.user_id, p_kind: 'checkin', p_ref: day, p_xp: 5 + Math.min(c.streak, 30), p_points: 0, p_cash: 0, p_note: `Day ${c.streak} streak`, p_cap: rewardsCap(env) })
    const pool = SPIN.map((x, i) => ({ ...x, i })).filter((x) => p.kyc_status === 'verified' || !x.cash)
    const total = pool.reduce((t, x) => t + x.weight, 0)
    let roll = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 * total, prize = pool[0]
    for (const x of pool) { if ((roll -= x.weight) < 0) { prize = x; break } }
    const r = await d.db.fn<{ ok: boolean; already?: boolean; cash?: number; points?: number; swapped?: boolean }>('luda_reward', { p_user: p.user_id, p_kind: 'spin', p_ref: day, p_xp: prize.xp ?? 0, p_points: prize.points ?? 0, p_cash: prize.cash ?? 0, p_note: `Daily spin: ${prize.label}`, p_cap: rewardsCap(env) })
    if (!r.ok) throw new Fail('You already spun today. Come back tomorrow!', 409)
    return { index: prize.i, label: prize.label, xp: prize.xp ?? 0, points: r.points ?? 0, cash: r.cash ?? 0, swapped: !!r.swapped, streak: c.streak, verifiedOnlyCash: p.kyc_status !== 'verified' }
  },
  'POST challenge-claim': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const c = CHALLENGES.find((x) => x.id === body.id)
    if (!c) throw new Fail('Unknown challenge', 404)
    const a = await d.db.fn<Activity>('luda_activity', { p_user: p.user_id })
    if (Number(a[c.key] ?? 0) < c.goal) throw new Fail('Not finished yet. Keep going!')
    if (c.prize.cash && p.kyc_status !== 'verified') throw new Fail('Verify your ID to receive cash prizes', 403)
    const r = await d.db.fn<{ ok: boolean; cash?: number; points?: number }>('luda_reward', { p_user: p.user_id, p_kind: 'challenge', p_ref: `${c.id}:${cyprusDay().slice(0, 7)}`, p_xp: c.prize.xp, p_points: c.prize.points ?? 0, p_cash: c.prize.cash ?? 0, p_note: `Challenge complete: ${c.prizeLabel}`, p_cap: rewardsCap(env) })
    if (!r.ok) throw new Fail('Already claimed this month', 409)
    return { ok: true, cash: r.cash ?? 0, points: r.points ?? 0 }
  },
  'POST rewards-redeem': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const o = REDEEM.find((x) => x.id === body.id)
    if (!o) throw new Fail('Unknown reward', 404)
    if (p.kyc_status !== 'verified') throw new Fail('Verify your ID to turn points into money', 403)
    if (p.frozen) throw new Fail('Your account is on hold', 403)
    await limit(d, `redeem:${p.user_id}`, 5, 86400, 'You can redeem 5 times a day')
    const r = await d.db.fn<{ ok: boolean; points: number; cash: number }>('luda_redeem', { p_user: p.user_id, p_pts: o.pts, p_cash: o.cash, p_ref: `${o.id}:${Date.now()}`, p_cap: rewardsCap(env) }).catch((e) => {
      if (e instanceof MoneyError && e.message === 'not_enough_points') throw new Fail('Not enough points yet')
      if (e instanceof MoneyError && e.message === 'rewards_budget') throw new Fail('This month\'s rewards are all given out. Try again next month.', 409)
      return moneyMsg(e)
    })
    await d.db.log(p.user_id, 'reward_redeem', { user: p.username, pts: o.pts, cash: o.cash })
    return r
  },
  'GET referrals': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    if (await d.db.hit(`refsettle:${p.user_id}`, 1, 60).catch(() => false)) await settleReferrals(p, env, d).catch(() => {})
    const inviter = p.invited_by ? (await d.db.profile(p.invited_by))?.username ?? null : null
    return { code: `LUDA-${p.username.toUpperCase()}`, invitees: await d.db.fn('luda_invitees', { p_user: p.user_id }), invitedBy: inviter, rules: REFERRAL_RULES, canApply: !p.invited_by && !!p.created_at && Date.now() - Date.parse(p.created_at) < REFERRAL_RULES.applyDays * 86400e3 }
  },
  'POST referral-apply': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await limit(d, `refapply:${p.user_id}`, 5, 86400, 'Too many tries today')
    const code = String(body.code ?? '').trim().replace(/^LUDA-/i, '').replace(/^@/, '').toLowerCase()
    if (!USERNAME.test(code)) throw new Fail('That code doesn\'t look right (e.g. LUDA-ADA)')
    await d.db.fn('luda_set_inviter', { p_user: p.user_id, p_inviter: code, p_days: REFERRAL_RULES.applyDays }).catch((e) => {
      if (e instanceof MoneyError && e.message === 'already_invited') throw new Fail('You already used a friend\'s code', 409)
      if (e instanceof MoneyError && e.message === 'invite_too_late') throw new Fail(`Codes can only be used in your first ${REFERRAL_RULES.applyDays} days`, 409)
      if (e instanceof MoneyError && e.message === 'not_found') throw new Fail('No Luda user with that code', 404)
      return moneyMsg(e)
    })
    return { ok: true }
  },
  'GET country-cup': async ({ req, env, d }) => { await me(req, env, d); return { cup: await d.db.fn('luda_country_cup', {}) } },

  /* ---------------- community posts ---------------- */
  'GET board': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    const kind = boardKind(url.searchParams.get('kind'))
    const st = await permsOf(p, env, d)
    const official = !!st && can(st, 'content', 'edit')
    const r = await d.db.fn<{ items: Record<string, any>[]; mine: Record<string, any>[] }>('luda_board_list', { p_kind: kind, p_viewer: p.user_id })
    const sign = signer(env, d)
    const view = async (x: Record<string, any>) => ({ ...x, photoKeys: undefined, photoUrls: await Promise.all(((x.photoKeys as string[]) ?? []).slice(0, 4).map(sign)) })
    const block = await boardBlock(p, kind, official, d)
    return { items: await Promise.all(r.items.map(view)), mine: await Promise.all(r.mine.map(view)), rules: BOARD_RULES[kind], canPost: !block, why: block, official }
  },

  'POST board-post': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const kind = boardKind(body.kind)
    const st = await permsOf(p, env, d)
    const official = body.official === true && !!st && can(st, 'content', 'edit')
    if (body.official === true && !official) throw new Fail("Your role can't post as Luda Official", 403)
    const block = await boardBlock(p, kind, official, d)
    if (block) throw new Fail(block, 403)
    await limit(d, `board:${p.user_id}`, official ? 60 : 10, 3600, 'Slow down a little: too many posts in an hour')
    const title = clean(body.title, 90, 'a title', 3), text = body.body ? clean(body.body, 1500, 'a description') : ''
    const data = boardData(body.data), city = cleanText(body.city, 30)
    const photos = await storeFiles(env, d, p.user_id, `board-${kind}`, body.files)
    const r = BOARD_RULES[kind]
    const status = r.review && !official ? 'review' : 'live'
    const post = await d.db.fn<Record<string, any>>('luda_board_create', { p_user: p.user_id, p_kind: kind, p_title: title, p_body: text, p_data: data, p_photos: photos, p_city: city, p_status: status, p_official: official, p_days: r.days }).catch(communityErr)
    await d.db.log(String(post.id), 'board_post', { user: p.username, kind, status, official })
    return { post: { ...post, photoKeys: undefined }, status }
  },

  'POST board-remove': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const ok = await d.db.fn<boolean>('luda_board_remove', { p_id: uuid(body.id), p_user: p.user_id, p_staff: false, p_note: 'Removed by the author' })
    if (!ok) throw new Fail('Not found', 404)
    return { ok: true }
  },

  'POST board-report': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await limit(d, `report:${p.user_id}`, 20, 86400, 'You have sent a lot of reports today. Thank you! Try again tomorrow.')
    const r = await d.db.fn<{ reports: number; status: string }>('luda_board_report', { p_id: uuid(body.id), p_user: p.user_id, p_reason: cleanText(body.reason, 140) }).catch(communityErr)
    return { ok: true, hidden: r.status !== 'live' }
  },

  'GET admin-board': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'content', 'view')
    const st = url.searchParams.get('status')
    const list = await d.db.fn<Record<string, any>[]>('luda_board_admin', { p_status: st === 'all' ? null : st || 'review' })
    const sign = signer(env, d)
    return { posts: await Promise.all(list.map(async (x) => ({ ...x, photoKeys: undefined, photoUrls: await Promise.all(((x.photoKeys as string[]) ?? []).map(sign)) }))) }
  },

  'POST admin-board-review': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'content', 'edit')
    const approve = body.approve === true, note = cleanText(body.note, 200)
    if (!approve && !note) throw new Fail('Add a short reason')
    const ok = await d.db.fn<boolean>('luda_board_review', { p_id: uuid(body.id), p_approve: approve, p_note: note || null })
    if (!ok) throw new Fail('Already handled', 409)
    await d.db.log(String(body.id), approve ? 'admin_post_approved' : 'admin_post_removed', { by: a.username, note })
    return { ok: true }
  },

  /* ---------------- group chats ---------------- */
  'GET groups': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    const owned = await d.db.fn<number>('luda_groups_owned', { p_user: p.user_id })
    const st = await permsOf(p, env, d)
    const staffCan = !!st && can(st, 'content', 'edit')
    const why = staffCan ? null : p.kyc_status !== 'verified' ? 'Verify your ID to create a group. Anyone signed in can join and chat.' : owned >= 3 ? 'You already run 3 groups (the maximum).' : null
    return { groups: await d.db.fn('luda_groups', { p_user: p.user_id }), canCreate: !why, why, official: staffCan }
  },

  'POST group-create': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const st = await permsOf(p, env, d)
    const official = body.official === true && !!st && can(st, 'content', 'edit')
    if (!official) {
      if (p.kyc_status !== 'verified') throw new Fail('Verify your ID to create a group', 403)
      if ((await d.db.fn<number>('luda_groups_owned', { p_user: p.user_id })) >= 3) throw new Fail('You can run up to 3 groups', 403)
      await limit(d, `groupnew:${p.user_id}`, 2, 86400, 'You can create 2 groups a day')
    }
    const name = clean(body.name, 40, 'a group name', 3), about = body.about ? clean(body.about, 200, 'what the group is about') : ''
    const emoji = cleanText(body.emoji, 8) || '💬', city = cleanText(body.city, 30)
    const g = await d.db.fn<Record<string, any>>('luda_group_create', { p_user: p.user_id, p_name: name, p_about: about, p_emoji: emoji, p_city: city, p_official: official }).catch(communityErr)
    await d.db.log(String(g.id), 'group_new', { user: p.username, name, official })
    return { group: g }
  },

  'POST group-join': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await d.db.fn('luda_group_join', { p_group: uuid(body.id), p_user: p.user_id, p_join: body.join !== false }).catch(communityErr)
    return { ok: true }
  },

  'GET group-messages': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    const after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0))
    return { messages: await d.db.fn('luda_group_messages', { p_group: uuid(url.searchParams.get('id')), p_user: p.user_id, p_after: after }).catch(communityErr) }
  },

  'POST group-send': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    if (p.frozen) throw new Fail('Your account is on hold', 403)
    await limit(d, `chat:${p.user_id}`, 5, 10, '🐢 Slow down: 5 messages every 10 seconds')
    await limit(d, `chatday:${p.user_id}`, 400, 86400, "You've sent a lot today. Try again tomorrow.")
    const text = clean(body.body, 1000, 'a message')
    const m = await d.db.fn<Record<string, unknown>>('luda_group_send', { p_group: uuid(body.id), p_user: p.user_id, p_body: text }).catch(communityErr)
    return { message: m }
  },

  'POST group-delete-msg': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const st = await permsOf(p, env, d)
    const ok = await d.db.fn<boolean>('luda_group_delete_msg', { p_msg: int(body.messageId), p_user: p.user_id, p_staff: !!st && can(st, 'content', 'edit') })
    if (!ok) throw new Fail("You can't delete this message", 403)
    return { ok: true }
  },

  'POST admin-group-remove': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'content', 'full')
    if (!(await d.db.fn<boolean>('luda_group_remove', { p_group: uuid(body.id) }))) throw new Fail('Already removed', 409)
    await d.db.log(String(body.id), 'admin_group_removed', { by: a.username })
    return { ok: true }
  },

  /* ---------------- Home banners ---------------- */
  'GET banners': async ({ d }) => ({ banners: await d.db.fn('luda_banners_live', {}) }),

  /* Nearby directory: real OpenStreetMap places saved on the server per city + category (v1.16.0). Public
     (it's open map data), limited per network. A copy older than a week is refreshed; if Overpass is down the
     saved copy is still served. Only the fixed cities and categories can be asked for, never a free query. */
  'GET places': async ({ req, d, url }) => {
    const city = String(url.searchParams.get('city') ?? ''), cat = String(url.searchParams.get('cat') ?? '')
    if (!PLACE_CITIES[city] || !PLACE_CATS[cat]) throw new Fail('Unknown city or category', 400)
    await limit(d, `places:${clientIp(req)}`, 120, 600)
    const saved = await d.db.fn<{ places: PlaceOut[]; fetchedAt: string; ageHours: number } | null>('luda_places_get', { p_city: city, p_cat: cat })
    // The weekly 'Load Nearby places' workflow keeps this fresh; the server only tries itself if a copy is missing or 2+ weeks old.
    if (saved && saved.ageHours < 24 * 14) return { places: saved.places, fetchedAt: saved.fetchedAt }
    // One refresh at a time per city + category (others get the saved copy, or wait for the next try).
    if (await d.db.hit(`placesfetch:${city}:${cat}`, 1, saved ? 300 : 20)) {
      const why: string[] = []
      for (const mirror of OVERPASS_MIRRORS) {
        try {
          const r = await (d.fetch ?? fetch)(mirror, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Luda/1.0 (city directory)' },
            body: new URLSearchParams({ data: overpassQuery(city, cat) }).toString(), signal: AbortSignal.timeout(saved ? 15000 : 9000) })
          if (!r.ok) { why.push(`${new URL(mirror).host} ${r.status}`); continue }
          const places = parseOverpass(city, await r.json())
          await d.db.fn('luda_places_put', { p_city: city, p_cat: cat, p_places: { items: places } })
          return { places, fetchedAt: new Date().toISOString() }
        } catch (e) { why.push(`${new URL(mirror).host} ${(e as Error).name}`) }
      }
      if (await d.db.hit('placesfail', 5, 3600).catch(() => false)) await d.db.log('-', 'places_fetch_failed', { city, cat, why }).catch(() => {})
    }
    if (saved) return { places: saved.places, fetchedAt: saved.fetchedAt }
    throw new Fail('The directory is loading. Please try again in a minute.', 503)
  },
  'GET admin-banners': async ({ req, env, d }) => { await staff(req, env, d, 'banners', 'view'); return { banners: await d.db.fn('luda_banners_all', {}) } },
  'POST admin-banner-save': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'banners', 'edit')
    const b = (body.banner ?? {}) as Record<string, unknown>
    const link = String(b.link ?? '/')
    if (!/^\/[a-z0-9/_?=&-]*$/.test(link)) throw new Fail('The button must open a Luda page, like /transport or /bills')
    const iso = (v: unknown) => { const t = String(v ?? ''); if (!t) return ''; const ms = Date.parse(t); if (!Number.isFinite(ms)) throw new Fail('Check the dates'); return new Date(ms).toISOString() }
    const data = {
      title: clean(b.title, 60, 'a title', 2), body: b.body ? clean(b.body, 120, 'a line of text') : '', cta: cleanText(b.cta, 24) || 'Open', link,
      emoji: cleanText(b.emoji, 8) || '✨', theme: BANNER_THEMES.includes(String(b.theme)) ? String(b.theme) : 'mint',
      starts_at: iso(b.startsAt), ends_at: iso(b.endsAt), active: b.active !== false, sort: Math.max(-100, Math.min(100, int(b.sort ?? 0))),
    }
    const saved = await d.db.fn<Record<string, unknown>>('luda_banner_save', { p_id: b.id ? uuid(b.id) : null, p: data, p_by: a.user_id }).catch(communityErr)
    await d.db.log(String(saved.id), 'admin_banner_saved', { by: a.username, title: data.title })
    return { banner: saved }
  },
  'POST admin-banner-delete': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'banners', 'full')
    if (!(await d.db.fn<boolean>('luda_banner_delete', { p_id: uuid(body.id) }))) throw new Fail('Not found', 404)
    await d.db.log(String(body.id), 'admin_banner_deleted', { by: a.username })
    return { ok: true }
  },

  /* ---------------- "To do" on Home: everything waiting for this user, worked out on the server ---------------- */
  /* ---------------- statements & insights (v1.21.0): a month of the wallet, from the server ledger ---------------- */
  'GET statement': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    const m = String(url.searchParams.get('month') ?? '')
    const month = /^20\d\d-(0[1-9]|1[0-2])$/.test(m) ? `${m}-01` : new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 8) + '01'
    const st = await d.db.fn<Record<string, unknown>>('luda_statement', { p_user: p.user_id, p_month: month })
    return { ...st, holder: { name: p.kyc_name || p.full_name, username: p.username, email: p.email } }
  },

  /* ---------------- Luda HQ: daily money report (v1.21.0) ---------------- */
  'GET admin-money': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'money', 'view')
    const days = [7, 14, 30].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 7
    const r = await d.db.fn<Record<string, unknown>>('luda_admin_money', { p_days: days })
    // Paystack's own total for the same days (successful charges), to compare with what Luda recorded.
    let paystack: { volume: number; count: number } | null = null
    if (env.PAYSTACK_SECRET_KEY) {
      try {
        const from = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10)
        const res = await (d.fetch ?? fetch)(`https://api.paystack.co/transaction/totals?from=${from}`, { headers: { authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` }, signal: AbortSignal.timeout(6000) })
        const j = (await res.json()) as { status?: boolean; data?: { total_volume?: number; total_transactions?: number } }
        if (res.ok && j.status && j.data) paystack = { volume: Number(j.data.total_volume ?? 0), count: Number(j.data.total_transactions ?? 0) }
      } catch { /* shown as 'not available' */ }
    }
    return { days, ...r, paystack }
  },

  /* ---------------- Verified Exchanger (v1.21.0) ---------------- */
  'GET exchanger': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    const stats = await d.db.fn<{ trades?: number; rate?: number | null }>('luda_p2p_stats', { p_user: p.user_id }).catch(() => ({} as { trades?: number; rate?: number | null }))
    const trades = Number(stats.trades ?? 0), rate = stats.rate == null ? null : Number(stats.rate)
    const checks = { kyc: p.kyc_status === 'verified', trades: trades >= EXCHANGER.minTrades, rate: rate !== null && rate >= EXCHANGER.minRate }
    return { me: await d.db.fn('luda_exchanger', { p_user: p.user_id }), rules: { ...EXCHANGER, bond: exchangerBond(env), member: { maxAds: P2P_RULES.maxAds, maxTry: P2P_RULES.maxTry } }, stats: { trades, rate }, checks, eligible: checks.kyc && checks.trades && checks.rate }
  },
  'POST exchanger-apply': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    needKyc(p, 'become a Verified Exchanger'); noHold(p, d)
    const stats = await d.db.fn<{ trades?: number; rate?: number | null }>('luda_p2p_stats', { p_user: p.user_id }).catch(() => ({} as { trades?: number; rate?: number | null }))
    if (Number(stats.trades ?? 0) < EXCHANGER.minTrades || !(Number(stats.rate ?? 0) >= EXCHANGER.minRate)) throw new Fail(`You need at least ${EXCHANGER.minTrades} completed P2P trades and a ${EXCHANGER.minRate}% completion rate`, 403)
    await verifyAuth(p, body, env, d)
    const x = await d.db.fn('luda_exchanger_apply', { p_user: p.user_id, p_bond: exchangerBond(env) }).catch((e) => {
      if (e instanceof MoneyError && e.message === 'already_applied') throw new Fail('You already applied', 409)
      return moneyMsg(e)
    })
    await d.db.log(p.user_id, 'exchanger_apply', { user: p.username, bond: exchangerBond(env) })
    return { me: x }
  },
  'POST exchanger-leave': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await verifyAuth(p, body, env, d)
    const open = (await d.db.fn<{ status: string }[]>('luda_p2p_orders', { p_user: p.user_id })).filter((o) => ['waiting', 'sent', 'appeal'].includes(o.status))
    if (open.length) throw new Fail('Finish your open P2P orders first', 409)
    const x = await d.db.fn('luda_exchanger_set', { p_user: p.user_id, p_status: 'left', p_by: p.username, p_note: 'Left the program', p_keep: false }).catch((e) => {
      if (e instanceof MoneyError && (e.message === 'not_active' || e.message === 'not_found')) throw new Fail('You are not in the program', 409)
      throw e
    })
    return { me: x }
  },
  'GET admin-exchangers': async ({ req, env, d }) => { await staff(req, env, d, 'disputes', 'view'); return { exchangers: await d.db.fn('luda_admin_exchangers', {}), rules: { ...EXCHANGER, bond: exchangerBond(env) } } },
  'POST admin-exchanger': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'disputes', 'full')
    await verifyAuth(a, body, env, d)
    const u = await d.db.profileByUsername(String(body.username ?? '').toLowerCase())
    if (!u) throw new Fail('Not found', 404)
    const action = String(body.action ?? ''), note = cleanText(body.note, 300)
    const status = ({ approve: 'approved', reject: 'rejected', remove: 'removed' } as Record<string, string>)[action]
    if (!status) throw new Fail('Unknown action')
    if (status !== 'approved' && !note) throw new Fail('Write the reason (the person sees it)')
    const keep = status === 'removed' && body.keepBond === true
    const x = await d.db.fn('luda_exchanger_set', { p_user: u.user_id, p_status: status, p_by: a.username, p_note: note || 'Approved', p_keep: keep }).catch((e) => {
      if (e instanceof MoneyError) throw new Fail(e.message === 'not_pending' ? 'This application was already decided' : 'Not in the program', 409)
      throw e
    })
    await d.db.log(u.user_id, `admin_exchanger_${action}`, { by: a.username, user: u.username, note, keep })
    await notifyUser(env, d, u.user_id, status === 'approved'
      ? { emoji: '🏅', title: 'You’re a Verified Exchanger', body: 'You can now post 5 ads up to ₺50,000 each', url: '/exchange?tab=p2p', tag: `exch:${Date.now()}`, cat: 'money' }
      : { emoji: '🛡️', title: status === 'rejected' ? 'Your Exchanger application was not approved' : 'You were removed from the Verified Exchanger program', body: note, url: '/exchange?tab=p2p', tag: `exch:${Date.now()}`, cat: 'money' })
    return { exchanger: x }
  },

  /* ---------------- app language (v1.21.0): phone notifications arrive in it ---------------- */
  'POST lang': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const lang = String(body.lang ?? '')
    if (!['en', 'fr', 'tr', 'sw', 'ar'].includes(lang)) throw new Fail('Unknown language')
    if (p.lang !== lang) await d.db.updateProfile(p.user_id, { lang } as Partial<Profile>)
    return { ok: true }
  },

  /* ---------------- in-app notifications (v1.20.0): the 🔔 inbox lives on the server ---------------- */
  'GET inbox': async ({ req, env, d }) => { const p = await me(req, env, d); return await d.db.fn('luda_inbox', { p_user: p.user_id, p_limit: 100 }) },
  'POST inbox-read': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((x: number) => Number.isSafeInteger(x) && x > 0).slice(0, 200) : null
    await d.db.fn('luda_inbox_read', { p_user: p.user_id, p_ids: ids ? { items: ids } : null })
    return { ok: true }
  },

  /* ---------------- Help Center (v1.19.0): articles on the server, editable in Luda HQ ---------------- */
  'GET help': async ({ req, d }) => { await limit(d, `help-ip:${clientIp(req)}`, 300, 600); return { topics: HELP_TOPICS, articles: await d.db.fn('luda_help', {}) } },
  'POST help-vote': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await limit(d, `helpvote:${p.user_id}`, 100, 86400)
    if (typeof body.helpful !== 'boolean') throw new Fail('Pick yes or no')
    if (!(await d.db.fn<boolean>('luda_help_vote', { p_slug: String(body.slug ?? '').slice(0, 40), p_user: p.user_id, p_helpful: body.helpful }))) throw new Fail('Not found', 404)
    return { ok: true }
  },
  'POST admin-help-create': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'content', 'edit')
    const topic = String(body.topic ?? '')
    if (!HELP_TOPICS.some((t) => t.id === topic)) throw new Fail('Pick a topic')
    const slug = `help-${topic}-${randomHex(3)}`
    const g = await d.db.fn('luda_help_create', { p_slug: slug, p_topic: topic, p_title: clean(body.title, 120, 'a question', 5), p_by: a.username })
    await d.db.log(slug, 'admin_help_created', { by: a.username })
    return { guide: g }
  },
  'POST admin-help-delete': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'content', 'full')
    const slug = String(body.slug ?? '').slice(0, 40)
    if (!(await d.db.fn<boolean>('luda_help_delete', { p_slug: slug }))) throw new Fail('Not found', 404)
    await d.db.log(slug, 'admin_help_deleted', { by: a.username })
    return { ok: true }
  },

  /* ---------------- ratings + reopening cases (v1.18.0) ---------------- */
  'POST rate': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await limit(d, `rate:${p.user_id}`, 60, 86400, 'Too many ratings today. Try again tomorrow.')
    const kind = String(body.kind ?? '') as RateKind
    if (!RATE_TAGS[kind]) throw new Fail('Unknown rating')
    const ref = uuid(body.ref)
    const stars = kind === 'case' || kind === 'bill' ? int(body.stars) : null
    const good = kind === 'market' || kind === 'flash' ? body.good : null
    if (stars !== null && !(stars >= 1 && stars <= 5)) throw new Fail('Pick 1 to 5 stars')
    if (good !== null && typeof good !== 'boolean') throw new Fail('Pick 👍 or 👎')
    const tags = (Array.isArray(body.tags) ? body.tags : []).map(String).filter((t, i, a) => RATE_TAGS[kind].includes(t) && a.indexOf(t) === i).slice(0, 6)
    const text = cleanText(body.body, 300)
    if (text) { const bad = textProblem(text); if (bad) throw new Fail(bad) }
    const r = await d.db.fn<{ ok: boolean; reason?: string }>('luda_rate', { p_user: p.user_id, p_kind: kind, p_ref: ref, p_stars: stars, p_good: good, p_tags: tags, p_body: text })
    if (!r.ok) throw new Fail(r.reason === 'not_finished' ? 'You can rate this once it’s finished' : 'Not found', r.reason === 'not_finished' ? 409 : 404)
    return { ok: true }
  },
  'GET ratings-mine': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    return { ratings: await d.db.fn('luda_ratings_mine', { p_user: p.user_id }), pending: await d.db.fn('luda_rate_pending', { p_user: p.user_id }) }
  },
  'POST case-reopen': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const reason = cleanText(body.reason, 500)
    if (reason.length < 5) throw new Fail('Tell the team what is still wrong')
    const bad = textProblem(reason); if (bad) throw new Fail(bad)
    await limit(d, `case-reopen:${p.user_id}`, 10, 86400)
    const r = await d.db.fn<{ ok: boolean; reason?: string }>('luda_case_reopen', { p_user: p.user_id, p_case: uuid(body.caseId), p_reason: reason, p_name: p.full_name })
    if (!r.ok) throw new Fail(({ not_found: 'Case not found', open: 'This case is already open', too_many: 'This case was already reopened twice. Please open a new case.', too_late: 'Cases can be reopened within 7 days of being closed. Please open a new case.' } as Record<string, string>)[r.reason ?? ''] ?? 'Could not reopen', r.reason === 'not_found' ? 404 : 409)
    return { ok: true }
  },
  'GET admin-ratings': async ({ req, env, d, url }) => {
    await staff(req, env, d, 'overview', 'view')
    const days = [7, 30, 90, 365].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30
    return { days, ...(await d.db.fn<Record<string, unknown>>('luda_admin_ratings', { p_days: days })), help: await d.db.fn('luda_help_votes', {}) }
  },

  /* ---------------- phone notifications (Web Push) ---------------- */
  'POST push-subscribe': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await limit(d, `pushsub:${p.user_id}`, 30, 3600)
    const endpoint = String(body.endpoint ?? ''), keys = (body.keys ?? {}) as Record<string, unknown>
    const p256dh = String(keys.p256dh ?? ''), auth = String(keys.auth ?? '')
    if (endpoint.length > 1000 || !pushHostOk(endpoint, env.PUSH_ALLOW_TEST === '1')) throw new Fail("This browser can't receive notifications from Luda")
    if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) throw new Fail('Invalid subscription')
    await d.db.fn('luda_push_save', { p_user: p.user_id, p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_prefs: pushPrefs(body.prefs), p_ua: req.headers.get('user-agent') ?? '' })
    // Learn what's already waiting so it doesn't all buzz at once; only new things are sent from now on.
    const items = (await todoItems(p, env, d).catch(() => [])).filter((i) => i.level !== 'info')
    await d.db.fn('luda_push_mark', { p_user: p.user_id, p_keys: { items: items.map((i) => i.key) } })
    return { ok: true }
  },
  'POST push-prefs': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await d.db.fn('luda_push_prefs', { p_user: p.user_id, p_endpoint: String(body.endpoint ?? '').slice(0, 1000), p_prefs: pushPrefs(body.prefs) })
    return { ok: true }
  },
  'POST push-unsubscribe': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await d.db.fn('luda_push_remove', { p_user: p.user_id, p_endpoint: String(body.endpoint ?? '').slice(0, 1000) })
    return { ok: true }
  },
  'POST push-test': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    await limit(d, `pushtest:${p.user_id}`, 10, 3600)
    const sent = await pushUser(env, d, p.user_id, { title: '🔔 Luda notifications are on', body: "You'll get alerts here even when Luda is closed", url: '/', tag: 'test' })
    return { sent }
  },

  'GET todo': async ({ req, env, d }) => {
    const p = await me(req, env, d)
    return { items: await todoItems(p, env, d) }
  },

  /* ---------------- university calendars (staff enter official dates) + personal fee plans ---------------- */
  'GET uni': async ({ req, env, d, url }) => {
    await me(req, env, d)
    const u = uniId(url.searchParams.get('u'))
    return { uni: u, dates: await d.db.fn('luda_uni_dates', { p_uni: u }) }
  },
  'POST uni-set': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await d.db.fn('luda_set_university', { p_user: p.user_id, p_uni: uniId(body.uni) })
    return { ok: true }
  },
  'GET fee-plan': async ({ req, env, d }) => { const p = await me(req, env, d); return { items: await d.db.fn('luda_fee_plan', { p_user: p.user_id }) } },
  'POST fee-plan-save': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await limit(d, `feeplan:${p.user_id}`, 40, 86400, 'Too many changes today. Try again tomorrow.')
    const i = (body.item ?? {}) as Record<string, unknown>
    const amount = int(i.amountMinor), currency = String(i.currency ?? 'TRY')
    if (!(amount > 0 && amount <= 1_000_000_00)) throw new Fail('Enter the amount')
    if (!['TRY', 'USD', 'EUR', 'GBP'].includes(currency)) throw new Fail('Pick a currency')
    const data = { title: clean(i.title, 60, 'a name, like "2nd instalment"', 2), due: isoDay(i.due, 'the due date'), amountMinor: amount, currency }
    return { item: await d.db.fn('luda_fee_plan_save', { p_user: p.user_id, p_id: i.id ? uuid(i.id) : null, p: data }).catch((e) => {
      if (e instanceof MoneyError && e.message === 'too_many_fees') throw new Fail('You can keep up to 24 payments in your plan')
      if (e instanceof MoneyError && e.message === 'not_found') throw new Fail('Not found', 404)
      throw e
    }) }
  },
  'POST fee-plan-paid': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    if (!(await d.db.fn<boolean>('luda_fee_plan_mark', { p_user: p.user_id, p_id: uuid(body.id), p_paid: body.paid !== false }))) throw new Fail('Not found', 404)
    return { ok: true }
  },
  'POST fee-plan-remove': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    if (!(await d.db.fn<boolean>('luda_fee_plan_remove', { p_user: p.user_id, p_id: uuid(body.id) }))) throw new Fail('Not found', 404)
    return { ok: true }
  },
  'GET admin-uni': async ({ req, env, d, url }) => { await staff(req, env, d, 'content', 'view'); return d.db.fn('luda_uni_admin', { p_uni: uniId(url.searchParams.get('u')) }) },
  'POST admin-uni-save': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'content', 'edit')
    const x = (body.date ?? {}) as Record<string, unknown>
    const kind = String(x.kind ?? '')
    if (!UNI_KINDS.includes(kind)) throw new Fail('Pick a type')
    const source = cleanText(x.source, 300)
    if (source && !/^https:\/\/[^\s]+\.[^\s]+$/.test(source)) throw new Fail('The source must be a full https:// link to the official calendar')
    const start = isoDay(x.start, 'the start date'), end = x.end ? isoDay(x.end, 'the end date') : ''
    if (end && end < start) throw new Fail('The end date is before the start date')
    const data = { uni: uniId(x.uni), title: clean(x.title, 80, 'a title', 2), kind, start, end, source, note: cleanText(x.note, 200) }
    const saved = await d.db.fn<Record<string, unknown>>('luda_uni_save', { p_id: x.id ? uuid(x.id) : null, p: data, p_by: a.user_id }).catch((e) => {
      if (e instanceof MoneyError && e.message === 'not_found') throw new Fail('Not found', 404)
      throw e
    })
    await d.db.log(String(saved.id), 'admin_uni_date', { by: a.username, uni: data.uni, title: data.title, start })
    return { date: saved }
  },
  'POST admin-uni-delete': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'content', 'edit')
    if (!(await d.db.fn<boolean>('luda_uni_delete', { p_id: uuid(body.id) }))) throw new Fail('Not found', 404)
    await d.db.log(String(body.id), 'admin_uni_date_deleted', { by: a.username })
    return { ok: true }
  },
  'POST admin-uni-copy': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'content', 'edit')
    const u = uniId(body.uni), from = isoDay(body.from, 'the first date'), to = isoDay(body.to, 'the last date')
    const n = await d.db.fn<number>('luda_uni_copy_year', { p_uni: u, p_from: from, p_to: to, p_by: a.user_id })
    await d.db.log(u, 'admin_uni_copy', { by: a.username, from, to, n })
    return { copied: n }
  },

  /* ---------------- guides, terms and ⓘ tips: content lives on the server, editable in Luda HQ ---------------- */
  'GET guide': async ({ d, url }) => {
    const g = await d.db.fn<Record<string, unknown> | null>('luda_guide', { p_slug: String(url.searchParams.get('slug') ?? '').slice(0, 40) })
    if (!g) throw new Fail('Not found', 404)
    return { guide: { ...g, updated_by: undefined } }
  },
  'GET guides': async ({ d, url }) => {
    const kind = url.searchParams.get('kind')
    return { guides: (await d.db.fn<Record<string, unknown>[]>('luda_guides', { p_kind: kind && ['guide', 'terms', 'tip'].includes(kind) ? kind : null })).map((g) => ({ ...g, updated_by: undefined })) }
  },
  'POST terms-accept': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    return d.db.fn('luda_terms_accept', { p_user: p.user_id, p_version: int(body.version) }).catch(() => { throw new Fail('The terms were just updated. Please read them again.', 409) })
  },
  'GET admin-guides': async ({ req, env, d }) => { await staff(req, env, d, 'content', 'view'); return { guides: await d.db.fn('luda_guides', { p_kind: null }) } },
  'POST admin-guide-save': async ({ req, env, d, body }) => {
    const slug = String(body.slug ?? '').slice(0, 40)
    // Changing the terms (and asking everyone to accept again) needs content:full; guides and tips need edit.
    const a = await staff(req, env, d, 'content', slug === 'terms' || slug === 'privacy' ? 'full' : 'edit')
    const steps = (Array.isArray(body.steps) ? body.steps : []).slice(0, 30).map((x: any) => ({ title: cleanText(x?.title, 120), body: cleanText(x?.body, 1500) })).filter((x: any) => x.title || x.body)
    const g = await d.db.fn('luda_guide_save', { p_slug: slug, p_title: clean(body.title, 120, 'a title', 2), p_intro: cleanText(body.intro, 1500), p_steps: { items: steps }, p_by: a.username, p_bump: slug === 'terms' && !!body.bump }).catch((e) => {
      if (e instanceof MoneyError && e.message === 'not_found') throw new Fail('Not found', 404)
      throw e
    })
    await d.db.log(slug, 'admin_guide_saved', { by: a.username, bump: !!body.bump })
    return { guide: g }
  },

  /* ---------------- P2P: reviews, remind, block ---------------- */
  'POST p2p-review': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const text = body.body ? clean(body.body, 200, 'a review') : ''
    await d.db.fn('luda_p2p_review', { p_order: uuid(body.id), p_user: p.user_id, p_good: body.good !== false, p_body: text }).catch((e) => {
      if (e instanceof MoneyError && e.message === 'already_reviewed') throw new Fail('You already reviewed this trade', 409)
      if (e instanceof MoneyError && e.message === 'not_available') throw new Fail('You can review a trade once it\'s completed', 409)
      throw e
    })
    return { ok: true }
  },
  'GET p2p-reviews': async ({ req, env, d, url }) => {
    await me(req, env, d)
    const u = String(url.searchParams.get('u') ?? '').toLowerCase()
    if (!USERNAME.test(u)) throw new Fail('Not found', 404)
    return { reviews: await d.db.fn('luda_p2p_reviews', { p_username: u }) }
  },
  'POST p2p-remind': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await d.db.fn('luda_p2p_remind', { p_order: uuid(body.id), p_user: p.user_id }).catch((e) => {
      if (e instanceof MoneyError && e.message === 'too_soon') throw new Fail('You can remind them again in a few minutes', 429)
      throw new Fail('You can\'t remind on this order now', 409)
    })
    return { ok: true }
  },
  'GET p2p-blocks': async ({ req, env, d }) => { const p = await me(req, env, d); return d.db.fn('luda_p2p_blocks', { p_user: p.user_id }) },
  'POST p2p-block': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await limit(d, `p2pblock:${p.user_id}`, 20, 86400, 'Too many changes today')
    await d.db.fn('luda_p2p_block', { p_user: p.user_id, p_username: String(body.username ?? '').replace(/^@/, '').slice(0, 30), p_on: body.on !== false }).catch(() => { throw new Fail('No Luda user with that name', 404) })
    return { ok: true }
  },

  /* ---------------- bus tickets: the QR changes every 30 s and is made and checked by the server ---------------- */
  'GET ticket-qr': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    const t = await d.db.fn<Record<string, any> | null>('luda_ticket_lookup', { p_code: String(url.searchParams.get('code') ?? '').slice(0, 20), p_user: p.user_id })
    if (!t) throw new Fail('Not found', 404)
    const win = Math.floor(Date.now() / 30_000)
    return { payload: `luda://ticket/${t.code}/${await ticketOtp(env, t.id, win)}`, ttl: 30 - (Math.floor(Date.now() / 1000) % 30), status: t.status }
  },
  'POST ticket-check': async ({ req, env, d, body }) => {
    const a = await staff(req, env, d, 'tickets', 'edit')
    await limit(d, `tcheck:${a.user_id}`, 300, 3600, 'Too many checks, slow down')
    const raw = String(body.payload ?? body.code ?? '').trim()
    const m = /^luda:\/\/ticket\/([A-Z0-9-]{4,20})\/(\d{6})$/i.exec(raw)
    const code = m ? m[1] : raw.replace(/[^A-Z0-9-]/gi, '').slice(0, 20)
    const t = await d.db.fn<Record<string, any> | null>('luda_ticket_lookup', { p_code: code, p_user: null })
    if (!t) return { ok: false, verdict: 'No ticket with this code' }
    const i = t.item ?? {}, today = cyprusDay(), leg = i.date === today ? 'out' : i.returnDate === today ? 'return' : null
    const info = { code: t.code, holder: t.holder, username: t.username, verified: t.verified, from: i.from, to: i.to, date: i.date, time: i.time, returnDate: i.returnDate ?? null, returnTime: i.returnTime ?? null, pax: i.pax ?? 1, checks: Number(t.checks), lastCheck: t.lastCheck }
    let verdict = ''
    if (t.status === 'refunded') verdict = 'Refunded: not valid'
    else if (t.status === 'used') verdict = `Already used${t.lastCheck ? ' (checked before)' : ''}`
    else if (!leg) verdict = `Wrong day: valid on ${i.date}${i.returnDate ? ` and ${i.returnDate}` : ''}`
    else if (m) {
      const win = Math.floor(Date.now() / 30_000)
      const good = (await ticketOtp(env, t.id, win)) === m[2] || (await ticketOtp(env, t.id, win - 1)) === m[2]
      if (!good) verdict = 'Old code: ask them to open the ticket in their Luda app (screenshots don\'t work)'
    }
    const ok = !verdict
    const isReturn = !!i.returnDate
    const used = ok && (!isReturn || Number(t.checks) >= 1)
    await d.db.fn('luda_ticket_mark', { p_ticket: t.id, p_by: a.username, p_result: ok ? 'ok' : verdict.slice(0, 60), p_used: used })
    await d.db.log(t.code, 'ticket_check', { by: a.username, ok, verdict, manual: !m })
    return { ok, verdict: ok ? (m ? `Valid ${leg === 'return' ? 'return trip' : 'ticket'}` : 'Valid · typed code: check their name and ID') : verdict, ticket: info }
  },

  /* ---------------- 6-digit sign-in code (unlock / sign in) — the 4-digit PIN stays for payments ---------------- */
  'POST passcode': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const code = String(body.code ?? '')
    if (!/^\d{6}$/.test(code) || weakCode(code)) throw new Fail('Choose a 6-digit code that is not easy to guess (no 123456, 111111 or repeats)')
    // Changing an existing code needs the old one; setting it the first time needs the payment PIN (proves it's you).
    if (p.passcode_hash) await verifyPasscode(p, body.oldCode, d)
    else if (p.pin_hash) await verifyPin(p, body.pin, d)
    const salt = randomHex(16)
    await d.db.updateProfile(p.user_id, { passcode_salt: salt, passcode_hash: await hashPin(code, salt), passcode_fails: 0, passcode_locked_until: null })
    await d.db.log(p.user_id, 'passcode_set', { first: !p.passcode_hash })
    return { ok: true }
  },
  'POST passcode-check': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    await verifyPasscode(p, body.code, d)
    await d.db.fn('luda_sign_in_log', { p_user: p.user_id, p_how: 'code', p_device: deviceOf(req) }).catch(() => {})
    return { ok: true }
  },
  'POST sign-in-log': async ({ req, env, d, body }) => {
    const p = await me(req, env, d)
    const how = ['google', 'fingerprint', 'new account'].includes(String(body.how)) ? String(body.how) : ''
    if (!how) throw new Fail('Bad request')
    await limit(d, `signinlog:${p.user_id}`, 30, 3600)
    await d.db.fn('luda_sign_in_log', { p_user: p.user_id, p_how: how, p_device: deviceOf(req) })
    return { ok: true }
  },
  'GET sign-ins': async ({ req, env, d }) => { const p = await me(req, env, d); return { items: await d.db.fn('luda_sign_ins', { p_user: p.user_id }) } },

  /* ---------------- search and trader profiles (live data only) ---------------- */
  'GET search': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    const q = cleanText(url.searchParams.get('q'), 40).trim()
    if (q.length < 2) return { posts: [], flash: [], market: [], groups: [], people: [] }
    await limit(d, `search:${p.user_id}`, 120, 600, 'Slow down a little')
    return d.db.fn('luda_search', { p_q: q })
  },
  'GET trader': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    const u = String(url.searchParams.get('u') ?? '').toLowerCase().replace(/^@/, '')
    if (!USERNAME.test(u)) throw new Fail('Not found', 404)
    const t = await d.db.fn<Record<string, unknown> | null>('luda_trader', { p_username: u, p_viewer: p.user_id })
    if (!t) throw new Fail('No Luda user with that name', 404)
    return { trader: { ...t, exchanger: (await d.db.fn<string[]>('luda_exchanger_names', {}).catch(() => [] as string[])).includes(u) } }
  },

  /* ---------------- team (owner only) ---------------- */
  'GET admin-staff': async ({ req, env, d }) => { await admin(req, env, d); return { staff: await d.db.fn('luda_staff_list', {}), areas: AREAS } },
  'POST admin-staff-set': async ({ req, env, d, body }) => {
    const a = await admin(req, env, d)
    await verifyAuth(a, body, env, d)
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new Fail('Enter a valid email')
    if (email === a.email.toLowerCase()) throw new Fail('You are the owner: you can already do everything')
    const roles: Record<string, Level> = {}
    for (const ar of AREAS) { const l = (body.roles as Record<string, unknown> | undefined)?.[ar]; if (l === 'view' || l === 'edit' || l === 'full') roles[ar] = l }
    if (!Object.keys(roles).length) throw new Fail('Give this person at least one area')
    const row = await d.db.fn('luda_staff_set', { p_email: email, p_roles: roles, p_note: cleanText(body.note, 60) || null, p_by: a.user_id })
    await d.db.log(email, 'admin_staff_set', { by: a.username, roles })
    return { staff: row }
  },
  'POST admin-staff-remove': async ({ req, env, d, body }) => {
    const a = await admin(req, env, d)
    await verifyAuth(a, body, env, d)
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!(await d.db.fn<boolean>('luda_staff_remove', { p_email: email }))) throw new Fail('Not found', 404)
    await d.db.log(email, 'admin_staff_removed', { by: a.username })
    return { ok: true }
  },

  'GET withdrawal': async ({ req, env, d, url }) => {
    const p = await me(req, env, d)
    const w = await d.db.withdrawal(url.searchParams.get('ref') ?? '')
    if (!w || w.user_id !== p.user_id) throw new Fail('Unknown withdrawal', 404)
    return { reference: w.reference, status: await settleWithdrawal(w, env, d).catch(() => w.status) }
  },
}

/** The person's To do list (Home card + phone notifications). Built on the server from real state. */
type TodoItem = { key: string; emoji: string; title: string; sub?: string; to: string; level: 'urgent' | 'action' | 'info' }
async function todoItems(p: Profile, env: Env, d: Deps): Promise<TodoItem[]> {
  const t = await d.db.fn<Record<string, any>>('luda_todo', { p_user: p.user_id })
  const sym: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£', NGN: '₦' }
  const amt = (minor: number, cur: string) => `${sym[cur] ?? ''}${(Number(minor) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  const items: TodoItem[] = []
  if (p.frozen) items.push({ key: 'frozen', emoji: '🧊', title: 'Your account is on hold', sub: 'Money can\'t leave your wallet until it\'s unfrozen', to: '/security', level: 'urgent' })
  if (p.pin_hash && !p.passcode_hash) items.push({ key: 'passcode', emoji: '🔐', title: 'New: set your 6-digit sign-in code', sub: 'Unlock Luda with 6 digits; your 4-digit PIN is now only for payments', to: '/security?a=passcode', level: 'urgent' })
  if (!p.pin_hash) items.push({ key: 'pin', emoji: '🔢', title: 'Set your payment PIN', sub: 'You need it to move money', to: '/security', level: 'action' })
  if (p.kyc_status === 'pending') items.push({ key: 'kyc-pending', emoji: '🪪', title: 'Your ID check is in progress', sub: 'We\'ll tell you as soon as it\'s done', to: '/wallet?a=kyc', level: 'info' })
  else if (p.kyc_status !== 'verified') items.push({ key: 'kyc', emoji: '🪪', title: 'Verify your ID', sub: 'Unlocks withdrawals, P2P, Market selling, Flash jobs and cash prizes', to: '/wallet?a=kyc', level: 'action' })
  if (smsEnabled(env) && !p.phone_verified_at) items.push({ key: 'phone', emoji: '📱', title: 'Verify your phone number', sub: 'Keeps your account safe', to: '/security', level: 'action' })
  for (const o of t.p2p ?? []) {
    const lira = amt(o.amount, o.asset), to = `/p2p/${o.id}`
    if (o.status === 'waiting' && !o.payer) items.push({ key: `p2p:${o.id}:send`, emoji: '💸', title: `Send ${lira} to @${o.other}`, sub: 'Then tap "I\'ve sent it" and add the receipt', to, level: 'urgent' })
    else if (o.status === 'waiting') items.push({ key: `p2p:${o.id}:wait`, emoji: '⏳', title: `Waiting for @${o.other} to send ${lira}`, sub: 'Your Naira is held safely by Luda', to, level: 'info' })
    else if (o.status === 'sent' && o.payer) items.push({ key: `p2p:${o.id}:release`, emoji: '✅', title: `@${o.other} says they sent ${lira}`, sub: 'Check your own bank app, then release', to, level: 'urgent' })
    else if (o.status === 'sent') items.push({ key: `p2p:${o.id}:sent`, emoji: '⏳', title: `Waiting for @${o.other} to release your Naira`, to, level: 'info' })
    if (o.status === 'appeal' && o.askMe && o.askDue) items.push({ key: `p2p:${o.id}:ask:${o.askDue}`, emoji: '🛡️', title: 'The Luda team needs your reply', sub: Date.parse(o.askDue) > Date.now() ? `P2P with @${o.other} · reply before ${new Date(o.askDue).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Nicosia' })}` : `P2P with @${o.other} · the time is up, reply now`, to: `/p2p/${o.id}`, level: 'urgent' })
    if (o.status === 'appeal' && !(o.askMe && o.askDue)) items.push({ key: `p2p:${o.id}:appeal:${o.stage}`, emoji: '⚖️', title: `P2P dispute with @${o.other}`, sub: o.stage === 'negotiation' ? 'Try to sort it out in the order chat' : 'The Luda team is reviewing it', to, level: o.stage === 'negotiation' ? 'action' : 'info' })
  }
  for (const o of t.p2p ?? []) if (o.remindedBy) items.push({ key: `p2p:${o.id}:remind:${o.remindedAt}`, emoji: '🔔', title: `@${o.remindedBy} is waiting for you`, sub: 'Open your P2P order', to: `/p2p/${o.id}`, level: 'urgent' })
  for (const o of t.rate ?? []) items.push({ key: `p2p:${o.id}:rate`, emoji: '⭐', title: `Rate your trade with @${o.other}`, sub: 'Helps everyone trade safely', to: `/p2p/${o.id}`, level: 'info' })
  for (const l of t.bought ?? []) items.push({ key: `buy:${l.id}`, emoji: '📦', title: `Got "${l.title}"?`, sub: `Confirm you received it so @${l.seller} gets paid`, to: '/market', level: 'urgent' })
  for (const l of t.sold ?? []) items.push({ key: `sold:${l.id}`, emoji: '🛍️', title: `Hand over "${l.title}" to @${l.buyer}`, sub: `${amt(l.price, 'TRY')} is held until they confirm`, to: '/market', level: 'action' })
  for (const j of t.flashPosted ?? []) items.push({ key: `flash:${j.id}`, emoji: '⚡', title: `@${j.helper} is doing "${j.title}"`, sub: 'Tap Job done when it\'s finished', to: '/flash', level: 'action' })
  for (const j of t.flashHelping ?? []) items.push({ key: `help:${j.id}`, emoji: '💪🏿', title: `Do "${j.title}" for @${j.poster}`, sub: `${amt(j.reward, 'TRY')} when they tap Job done`, to: '/flash', level: 'info' })
  for (const c of t.cases ?? []) items.push({ key: `case:${c.id}`, emoji: '💬', title: 'The Luda team replied to you', sub: String(c.subject ?? ''), to: '/help', level: 'urgent' })
  for (const f of t.fees ?? []) items.push({ key: `fee:${f.id}:${f.due}`, emoji: '🎓', title: `${f.title}: ${amt(f.amount, f.currency)} due ${new Date(`${f.due}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`, sub: 'Mark it paid once it\'s done', to: '/uni?tab=fees', level: f.due <= cyprusDay() ? 'urgent' : 'action' })
  if (Number(t.bills)) items.push({ key: 'bills', emoji: '🧾', title: Number(t.bills) === 1 ? 'The Luda team is paying your bill' : `The Luda team is paying ${t.bills} bills`, to: '/bills', level: 'info' })
  if (Number(t.withdrawals)) items.push({ key: 'withdrawals', emoji: '🏦', title: 'Withdrawal on its way to your bank', to: '/wallet', level: 'info' })
  const rp = await d.db.fn<Record<string, { id: string; subject?: string; provider?: string; title?: string; other?: string }[]>>('luda_rate_pending', { p_user: p.user_id }).catch(() => ({} as Record<string, never[]>))
  for (const c of rp.cases ?? []) items.push({ key: `rate:case:${c.id}`, emoji: '⭐', title: 'How did the Luda team do?', sub: String(c.subject ?? ''), to: `/help?rate=case:${c.id}`, level: 'info' })
  for (const b of rp.bills ?? []) items.push({ key: `rate:bill:${b.id}`, emoji: '⭐', title: `Rate your ${b.provider} bill payment`, to: `/bills?rate=bill:${b.id}`, level: 'info' })
  for (const l of rp.market ?? []) items.push({ key: `rate:market:${l.id}`, emoji: '⭐', title: `Rate @${l.other}`, sub: String(l.title ?? ''), to: `/market?rate=market:${l.id}`, level: 'info' })
  for (const j of rp.flash ?? []) items.push({ key: `rate:flash:${j.id}`, emoji: '⭐', title: `Rate @${j.other}`, sub: String(j.title ?? ''), to: `/flash?rate=flash:${j.id}`, level: 'info' })
  // Saved bills whose monthly reminder day has come and that aren't paid yet this month.
  const saved = await d.db.fn<{ id: string; provider: string; label: string | null; due: boolean; amount_minor: number | null }[]>('luda_saved_bills', { p_user: p.user_id }).catch(() => [])
  for (const s of saved.filter((x) => x.due)) items.push({ key: `savedbill:${s.id}:${cyprusDay().slice(0, 7)}`, emoji: '🗓️', title: `Time to pay ${s.label || s.provider}`, sub: s.amount_minor ? `Last time ${amt(s.amount_minor, 'TRY')} · two taps to pay` : 'Two taps to pay from your Lira wallet', to: `/bills?pay=${s.id}`, level: 'action' })
  // Luda team: bills waiting to be paid (new ones, and ones close to the promised time).
  const sp = await permsOf(p, env, d).catch(() => null)
  if (sp && can(sp, 'bills', 'edit')) {
    const q = await d.db.fn<Record<string, any>[]>('luda_admin_bills', { p_status: 'pending' }).catch(() => [])
    const free = q.filter((b) => b.auto?.status !== 'processing' && (!b.claimed_by || Date.parse(b.claimed_at) < Date.now() - 45 * 60e3))
    for (const b of free.slice(0, 5)) {
      const late = !!b.eta_at && Date.parse(b.eta_at) - Date.now() < 30 * 60e3
      items.push({ key: `staffbill:${b.id}${late ? ':late' : ''}`, emoji: late ? '⏰' : '🧾', title: late ? `Bill due soon: ${b.provider} ${amt(b.amount_minor, 'TRY')}` : `New bill to pay: ${b.provider} ${amt(b.amount_minor, 'TRY')}`, sub: `@${b.username} · Luda HQ → Bills`, to: '/admin?tab=bills', level: late ? 'urgent' : 'action' })
    }
  }
  const rank = { urgent: 0, action: 1, info: 2 }
  return items.sort((a, b) => rank[a.level] - rank[b.level])
}

/* ---------------- Help Center topics (the app shows them in this order) ---------------- */
const HELP_TOPICS = [
  { id: 'start', emoji: '🚀', title: 'Getting started', category: 'other' },
  { id: 'wallet', emoji: '💰', title: 'Wallet & top-ups', category: 'payment' },
  { id: 'withdraw', emoji: '🏦', title: 'Withdrawals', category: 'withdrawal' },
  { id: 'p2p', emoji: '🤝', title: 'P2P exchange', category: 'payment' },
  { id: 'bills', emoji: '🧾', title: 'Bills', category: 'payment' },
  { id: 'tickets', emoji: '🚌', title: 'Bus tickets', category: 'payment' },
  { id: 'market', emoji: '🛍️', title: 'Market & Flash', category: 'other' },
  { id: 'kyc', emoji: '🪪', title: 'ID check', category: 'kyc' },
  { id: 'account', emoji: '🔐', title: 'Account & security', category: 'account' },
]

/* ---------------- ratings ---------------- */
type RateKind = 'case' | 'bill' | 'market' | 'flash'
/** Quick tags people can pick (same list in the app, components/Ratings.tsx). */
const RATE_TAGS: Record<RateKind, string[]> = {
  case: ['fast', 'helpful', 'polite', 'clear', 'solved', 'slow', 'not_solved', 'unclear', 'unhelpful'],
  bill: ['fast', 'correct', 'clear_receipt', 'easy', 'slow', 'wrong_amount', 'no_receipt', 'confusing'],
  market: ['friendly', 'on_time', 'as_described', 'smooth', 'late', 'no_show', 'not_as_described', 'rude'],
  flash: ['friendly', 'on_time', 'good_work', 'smooth', 'late', 'no_show', 'poor_work', 'rude'],
}

/* ---------------- phone notifications: helpers ---------------- */
const PUSH_CATS = ['money', 'chats', 'classes', 'rates', 'deals', 'news', 'security'] as const
function pushPrefs(v: unknown) {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return Object.fromEntries(PUSH_CATS.map((c) => [c, o[c] !== false]))
}
const fmtMoney = (minor: number, cur: string) => `${({ TRY: '₺', NGN: '₦', USD: '$', EUR: '€', GBP: '£' } as Record<string, string>)[cur] ?? `${cur} `}${(Number(minor) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const pushCat = (to: string, key: string) => to.startsWith('/uni') ? 'classes' : to.startsWith('/help') ? 'chats' : /^(frozen|passcode|pin|kyc|phone)/.test(key) ? 'security' : 'money'

let vapidCache: Vapid | null = null
/** The server's VAPID key pair: made once, kept in app_keys (never in the app or the repo). */
async function vapid(d: Deps): Promise<Vapid> {
  if (vapidCache) return vapidCache
  let v = await d.db.fn<Vapid | null>('luda_app_key', { p_name: 'vapid', p_value: null })
  if (!v?.publicKey) v = await d.db.fn<Vapid>('luda_app_key', { p_name: 'vapid', p_value: await newVapid() })
  return (vapidCache = v)
}

/** Adds a line to the person's in-app 🔔 inbox (and, unless push is false, sends it to their phones). Never throws. */
export async function notifyUser(env: Env, d: Deps, userId: string | null | undefined, n: { emoji: string; title: string; body?: string; url?: string; tag?: string; cat?: string; push?: boolean }) {
  if (!userId) return
  await d.db.fn('luda_inbox_add', { p_user: userId, p_emoji: n.emoji, p_title: n.title, p_body: n.body ?? null, p_url: n.url ?? null, p_tag: n.tag ?? null }).catch(() => {})
  if (n.push !== false) await pushUser(env, d, userId, { title: `${n.emoji} ${n.title}`, body: n.body, url: n.url, tag: n.tag, cat: n.cat })
}
type Parties = Record<string, any>
const parties = (d: Deps, kind: 'p2p' | 'market' | 'flash', id: string) => d.db.fn<Parties | null>('luda_parties', { p_kind: kind, p_id: id }).catch(() => null)

/** Translates a notification text the server wrote in English into the person's app language (same rules as the
 *  app: exact text, or a pattern with {} / {1} {2}). A leading emoji is kept as it is. Unknown text stays English. */
const notifyPatterns: Record<string, [RegExp, string][]> = {}
export function trNotify(lang: string, text: string | undefined): string | undefined {
  const dict = NOTIFY_I18N[lang]
  if (!text || !dict) return text
  const m = /^(\p{Extended_Pictographic}[\u{FE0F}\u{200D}\p{Extended_Pictographic}]*\s+)?([\s\S]+)$/u.exec(text)!
  const lead = m[1] ?? '', key = m[2].trim()
  if (dict[key] !== undefined) return lead + dict[key]
  notifyPatterns[lang] ??= Object.entries(dict).filter(([k]) => k.includes('{}'))
    .map(([k, v]) => [new RegExp('^' + k.split('{}').map((x) => x.replace(/[.*+?^$()|[\]\\]/g, '\\$&')).join('([\\s\\S]+?)') + '$'), v] as [RegExp, string])
    .sort((a, b) => b[0].source.length - a[0].source.length)
  for (const [re, v] of notifyPatterns[lang]) {
    const r = re.exec(key)
    if (r) { let i = 1; return lead + v.replace(/\{(\d?)\}/g, (_, n: string) => (n ? r[Number(n)] : r[i++]) ?? '') }
  }
  return text
}

/** Sends a notification to every phone of this person (respecting their categories). Never throws. */
export async function pushUser(env: Env, d: Deps, userId: string, msg: PushMsg & { cat?: string }): Promise<number> {
  try {
    const subs = await d.db.fn<(PushSub & { prefs: Record<string, boolean> })[]>('luda_push_subs', { p_user: userId })
    if (!subs?.length) return 0
    const v = await vapid(d), subject = /^https:\/\//.test(env.APP_URL ?? '') ? env.APP_URL.replace(/\/$/, '') : 'mailto:support@luda.app'
    // In the person's own language (owner's pick, v1.21.0).
    const lang = (await d.db.profile(userId).catch(() => null))?.lang ?? 'en'
    if (lang !== 'en') msg = { ...msg, title: trNotify(lang, msg.title) ?? msg.title, body: trNotify(lang, msg.body) }
    let n = 0
    for (const s of subs) {
      if (msg.cat && s.prefs?.[msg.cat] === false) continue
      const r = await sendPush(s, { title: msg.title, body: msg.body, url: msg.url, tag: msg.tag }, v, subject, d.fetch)
      await d.db.fn('luda_push_result', { p_endpoint: s.endpoint, p_ok: r === 'ok', p_gone: r === 'gone' }).catch(() => {})
      if (r === 'ok') n++
    }
    return n
  } catch { return 0 }
}

/** Sends new To do items (urgent/action) to everyone with notifications on: P2P steps, replies, deadlines… */
export async function pushSweep(env: Env, d: Deps) {
  const users = await d.db.fn<string[]>('luda_push_users', { p_limit: 500 }).catch(() => [] as string[])
  for (const u of users ?? []) {
    try {
      const p = await d.db.profile(u)
      if (!p) continue
      const items = (await todoItems(p, env, d)).filter((i) => i.level !== 'info')
      const r = await d.db.fn<{ fresh: string[]; first: boolean }>('luda_push_mark', { p_user: u, p_keys: { items: items.map((i) => i.key) } })
      if (r.first) continue
      for (const i of items.filter((x) => r.fresh.includes(x.key)).slice(0, 3))
        await pushUser(env, d, u, { title: `${i.emoji} ${i.title}`, body: i.sub, url: i.to, tag: i.key, cat: pushCat(i.to, i.key) })
    } catch { /* one person's problem never stops the others */ }
  }
}

/** Runs the sweep after actions (so the other person hears about it right away), in the background when possible. */
async function afterRequest(env: Env, d: Deps, name: string, method: string) {
  const seconds = method === 'POST' && !name.startsWith('push-') ? 3 : name === 'me' || name === 'todo' ? 30 : 0
  if (!seconds) return
  const job = (async () => { if (await d.db.hit('pushsweep', 1, seconds).catch(() => false)) await pushSweep(env, d) })().catch(() => {})
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
  if (rt?.waitUntil) rt.waitUntil(job); else await job
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
    const out = (await route({ req, env, d, body, url })) ?? { ok: true }
    await afterRequest(env, d, name, req.method)
    return json(out, 200, h)
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
  // Didit (ID checks): we only use the session id from the message and ask Didit for the real decision.
  if (req.headers.get('x-signature') || req.headers.get('x-signature-v2') || req.headers.get('x-signature-simple')) {
    if (env.DIDIT_WEBHOOK_SECRET && !(await diditSignatureOk(raw, req.headers.get('x-signature'), env))) {
      if (await d.db.hit('badsig', 50, 3600).catch(() => false)) await d.db.log('-', 'webhook_bad_signature', { from: 'didit' })
      return new Response('bad signature', { status: 401 })
    }
    let sid = ''
    try { sid = String((JSON.parse(raw) as Record<string, unknown>).session_id ?? '') } catch { /* ignore */ }
    const p = sid ? await d.db.profileByKycSession(sid) : null
    if (p) { await d.db.log(sid, 'webhook', { provider: 'didit' }); await kycSync(p, env, d).catch(() => {}) }
    return new Response('ok')
  }
  const provider = await checkWebhook(req.headers, raw, env)
  if (!provider) {
    // Record rejected webhooks (e.g. a wrong Flutterwave secret hash) so the owner's check can spot them.
    const from = req.headers.get('x-paystack-signature') ? 'paystack' : req.headers.get('verif-hash') || req.headers.get('flutterwave-signature') ? 'flutterwave' : 'unknown'
    if (await d.db.hit('badsig', 50, 3600).catch(() => false)) await d.db.log('-', 'webhook_bad_signature', { from })
    return new Response('bad signature', { status: 401 })
  }
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
