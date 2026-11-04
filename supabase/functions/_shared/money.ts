// Fees, limits and exchange maths. All amounts are in minor units (kobo / kuruş).
import type { Fetch } from './providers.ts'

export type Cur = 'NGN' | 'TRY'
export const CURRENCIES: Cur[] = ['NGN', 'TRY']

/** Per-user limits. Unverified users can top up and spend inside Luda; withdrawing and sending need KYC. */
export const LIMITS = {
  minDeposit: 1_000_00, // ₦1,000
  maxDepositOnce: 1_000_000_00, // ₦1,000,000
  unverified: { depositDay: 100_000_00, maxBalanceNGN: 200_000_00 },
  verified: { depositDay: 2_000_000_00, maxBalanceNGN: 10_000_000_00 },
  minWithdraw: 300_00,
  withdrawDay: 1_000_000_00,
  sendDay: { NGN: 500_000_00, TRY: 20_000_00 } as Record<Cur, number>,
  minSend: { NGN: 100_00, TRY: 10_00 } as Record<Cur, number>,
  convertDay: { NGN: 2_000_000_00, TRY: 50_000_00 } as Record<Cur, number>,
  // Top-ups in other currencies land in the Lira wallet (amounts in kuruş).
  foreign: {
    minCreditTRY: 100_00, // ₺100
    unverified: { depositDayTRY: 3_000_00, maxBalanceTRY: 6_000_00 },
    verified: { depositDayTRY: 60_000_00, maxBalanceTRY: 300_000_00 },
  },
}

/** Other currencies students can top up with (Flutterwave), and the payment methods shown for each. */
export const FOREIGN: Record<string, { name: string; options: string }> = {
  USD: { name: 'US dollar', options: 'card' },
  GHS: { name: 'Ghana cedi', options: 'card,mobilemoneyghana' },
  KES: { name: 'Kenyan shilling', options: 'card,mpesa' },
  UGX: { name: 'Ugandan shilling', options: 'card,mobilemoneyuganda' },
  ZMW: { name: 'Zambian kwacha', options: 'card,mobilemoneyzambia' },
  XAF: { name: 'CFA franc (Cameroon)', options: 'card,mobilemoneyfranco' },
}

/** Which foreign currencies are switched on (FOREIGN_CURRENCIES="GHS,USD" limits them; unset = all). */
export function foreignEnabled(env: { FOREIGN_CURRENCIES?: string }) {
  const only = (env.FOREIGN_CURRENCIES ?? '').split(',').map((c) => c.trim().toUpperCase()).filter(Boolean)
  return Object.keys(FOREIGN).filter((c) => !only.length || only.includes(c))
}

/** Fee the user pays on top for a foreign top-up (Flutterwave international / mobile money ≈ 3.8%). */
export function foreignFee(amountMinor: number, env: { FOREIGN_FEE_PCT?: string }) {
  const pct = num(env.FOREIGN_FEE_PCT, 3.8) / 100
  return Math.ceil(amountMinor / (1 - pct)) - amountMinor
}

export interface FeeEnv {
  DEPOSIT_FEE_PCT?: string; DEPOSIT_FEE_FLAT?: string; DEPOSIT_FEE_FLAT_WAIVE_BELOW?: string; DEPOSIT_FEE_CAP?: string; WITHDRAW_FEE?: string
  BILL_FEE?: string; BILL_FEE_HIGH?: string; BILL_FEE_STEP?: string; P2P_FEE_PCT?: string; MARKET_FEE_PCT?: string; FLASH_FEE_PCT?: string
}
const num = (v: string | undefined, d: number) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v))

/**
 * Deposit fee the user pays on top, so the full amount lands in their wallet.
 * Defaults mirror Paystack Nigeria local cards: 1.5% + ₦100 (₦100 waived under ₦2,500), capped at ₦2,000.
 */
export function depositFee(creditMinor: number, env: FeeEnv) {
  const pct = num(env.DEPOSIT_FEE_PCT, 1.5) / 100
  const flat = num(env.DEPOSIT_FEE_FLAT, 100) * 100, waive = num(env.DEPOSIT_FEE_FLAT_WAIVE_BELOW, 2500) * 100, cap = num(env.DEPOSIT_FEE_CAP, 2000) * 100
  const f = creditMinor + flat < waive ? 0 : flat
  const gross = Math.ceil((creditMinor + f) / (1 - pct)) // provider takes pct of the gross
  return Math.min(cap, gross - creditMinor)
}
// Luda's fee plan (owner chose 'Balanced', 2026-11-03): student-friendly, below banks/BDCs, and every number is set here on the server.
//   top-up: only the provider's own fee · send to a user: free · NGN⇄TRY: 1.5% (FX_MARGIN) · withdrawal: ₦100 (provider cost ₦10–50)
//   bills: ₺10 up to ₺1,000, ₺20 above · Market: 2% from the seller · Flash: 5% from the helper · P2P: 0.5% from whoever receives the Naira
export const withdrawFee = (env: FeeEnv) => Math.round(num(env.WITHDRAW_FEE, 100) * 100)
/** Wallet features (TRY): flat bill-pay service fee; marketplace/Flash fee taken from what the seller/helper receives. */
export const featureFees = (env: FeeEnv) => ({ billMinor: Math.round(num(env.BILL_FEE, 10) * 100), billHighMinor: Math.round(num(env.BILL_FEE_HIGH, 20) * 100), billStepMinor: Math.round(num(env.BILL_FEE_STEP, 1000) * 100), marketPct: num(env.MARKET_FEE_PCT, 0.02), flashPct: num(env.FLASH_FEE_PCT, 0.05), p2pPct: num(env.P2P_FEE_PCT, 0.005) })

export interface FxEnv { FX_FIXED_RATE?: string; FX_FALLBACK_RATE?: string; FX_MARGIN?: string }

/** Mid-market NGN per 1 TRY: fixed by the owner, else live, else the fallback. */
export async function ngnPerTry(env: FxEnv, f: Fetch = fetch): Promise<number> {
  let rate = num(env.FX_FIXED_RATE, 0)
  if (!rate) {
    try {
      const r = await f('https://open.er-api.com/v6/latest/TRY', { signal: AbortSignal.timeout(5000) })
      rate = Number(((await r.json()) as { rates?: Record<string, number> }).rates?.NGN ?? 0)
    } catch { rate = 0 }
  }
  if (!rate) rate = num(env.FX_FALLBACK_RATE, 0)
  if (!rate || !Number.isFinite(rate) || rate <= 0) throw new Error('Exchange rate unavailable, try again shortly')
  return rate
}
export const margin = (env: FxEnv) => num(env.FX_MARGIN, 0.015)

let tryRates: { at: number; rates: Record<string, number> } | null = null
/** Units of `cur` per 1 TRY (mid-market). FX_TRY_RATES='{"USD":0.029}' overrides; else live (cached 10 min). */
export async function perTry(cur: string, env: FxEnv & { FX_TRY_RATES?: string }, f: Fetch = fetch): Promise<number> {
  try { const o = JSON.parse(env.FX_TRY_RATES || '{}'); if (Number(o[cur]) > 0) return Number(o[cur]) } catch { /* ignore bad JSON */ }
  if (!tryRates || Date.now() - tryRates.at > 600e3) {
    try {
      const r = await f('https://open.er-api.com/v6/latest/TRY', { signal: AbortSignal.timeout(5000) })
      const rates = ((await r.json()) as { rates?: Record<string, number> }).rates
      if (rates) tryRates = { at: Date.now(), rates }
    } catch { /* fall through */ }
  }
  const v = tryRates?.rates[cur]
  if (!v || !(v > 0)) throw new Error('Exchange rate unavailable, try again shortly')
  return v
}

/** How much `to` you get for `amountMinor` of `from`, after Luda's margin. */
export function convertOut(from: Cur, to: Cur, amountMinor: number, mid: number, m: number) {
  if (from === to) return amountMinor
  const raw = from === 'NGN' ? amountMinor / mid : amountMinor * mid
  return Math.floor(raw * (1 - m))
}

/** Cost in `cur` (minor) of something priced in TL major units. */
export function costIn(cur: Cur, tl: number, mid: number, m: number) {
  return cur === 'TRY' ? Math.round(tl * 100) : Math.ceil(tl * 100 * mid * (1 + m))
}

/** Bill-pay service fee for a bill of `amountMinor` kuruş. */
export function billFee(amountMinor: number, env: FeeEnv) {
  const f = featureFees(env)
  return amountMinor > f.billStepMinor ? f.billHighMinor : f.billMinor
}
