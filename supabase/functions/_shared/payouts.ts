// Withdrawals to Nigerian bank accounts: Paystack Transfers, with Flutterwave Transfers as a second route.
// Bank list + account-name lookup always use Paystack. The payout itself goes through the first provider
// (PAYOUT_PROVIDERS, default "paystack,flutterwave") that accepts it; a definite refusal moves on to the next.
// Paystack dashboard: Settings → Preferences → turn OFF "Confirm transfers with OTP" for API payouts.
// Flutterwave dashboard: Settings → API → enable "Transfers via API"; IP whitelisting must allow Luda's server.
import type { Fetch } from './providers.ts'

const API = 'https://api.paystack.co'
export interface Bank { code: string; name: string }
export type TransferStatus = 'processing' | 'paid' | 'failed' | 'reversed'

export type PayoutProvider = 'paystack' | 'flutterwave'

/** The provider answered and said no (as opposed to a network problem where we don't know the outcome). */
export class PayoutRefused extends Error {
  httpStatus: number; provider: PayoutProvider
  constructor(m: string, s: number, p: PayoutProvider = 'paystack') { super(m); this.httpStatus = s; this.provider = p }
}

/** Turns a provider's refusal into words a student understands. */
export function payoutRefusalMessage(m: string) {
  if (/starter business|third party payouts|not (yet )?(enabled|allowed)|whitelist|ip address|not authori[sz]ed|permission/i.test(m)) return 'Withdrawals are paused while Luda\'s payout account is being upgraded. Your money is back in your wallet; please try again later.'
  if (/balance|insufficient/i.test(m)) return 'Withdrawals are temporarily unavailable. Your money is back in your wallet; please try again in a few hours.'
  return `The bank transfer could not be started (${m}). Your money is back in your wallet.`
}

async function ps(f: Fetch, key: string, path: string, body?: unknown) {
  const r = await f(`${API}${path}`, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, any>
  // 4xx / status:false = Paystack definitely refused; 5xx = unknown (may or may not have happened)
  if (!r.ok || j.status === false) { const m = String(j.message || `Paystack error ${r.status}`); throw r.status >= 400 && r.status < 500 ? new PayoutRefused(m, r.status, 'paystack') : new Error(m) }
  return j.data
}

let banksCache: { at: number; list: Bank[] } | null = null
export async function listBanks(key: string, f: Fetch = fetch): Promise<Bank[]> {
  if (banksCache && Date.now() - banksCache.at < 6 * 3600e3) return banksCache.list
  const data = (await ps(f, key, '/bank?country=nigeria&currency=NGN&perPage=200')) as { code: string; name: string; active?: boolean }[]
  const list = data.filter((b) => b.active !== false).map((b) => ({ code: String(b.code), name: String(b.name) })).sort((a, b) => a.name.localeCompare(b.name))
  banksCache = { at: Date.now(), list }
  return list
}

export async function resolveAccount(key: string, account: string, bankCode: string, f: Fetch = fetch): Promise<string> {
  const d = await ps(f, key, `/bank/resolve?account_number=${encodeURIComponent(account)}&bank_code=${encodeURIComponent(bankCode)}`)
  if (!d?.account_name) throw new Error('Could not find that account')
  return String(d.account_name)
}

export async function createRecipient(key: string, name: string, account: string, bankCode: string, f: Fetch = fetch): Promise<string> {
  const d = await ps(f, key, '/transferrecipient', { type: 'nuban', name, account_number: account, bank_code: bankCode, currency: 'NGN' })
  return String(d.recipient_code)
}

const map = (s: string): TransferStatus =>
  s === 'success' ? 'paid' : s === 'failed' || s === 'abandoned' || s === 'rejected' ? 'failed' : s === 'reversed' ? 'reversed' : 'processing'

export async function sendTransfer(key: string, amountMinor: number, recipient: string, reference: string, f: Fetch = fetch) {
  const d = await ps(f, key, '/transfer', { source: 'balance', amount: amountMinor, recipient, reference, reason: 'Luda withdrawal' })
  return { status: map(String(d?.status)), raw: String(d?.status), transferCode: d?.transfer_code ? String(d.transfer_code) : null }
}

export async function checkTransfer(key: string, reference: string, f: Fetch = fetch) {
  const d = await ps(f, key, `/transfer/verify/${encodeURIComponent(reference)}`)
  return { status: map(String(d?.status)), reference: String(d?.reference ?? ''), transferCode: d?.transfer_code ? String(d.transfer_code) : null }
}

/* ------------------------------ Flutterwave ------------------------------ */

const FLW = 'https://api.flutterwave.com/v3'

async function fw(f: Fetch, key: string, path: string, body?: unknown, timeoutMs = 20000) {
  const r = await f(`${FLW}${path}`, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, any>
  // Any answer below 500 that isn't "success" is a definite no; 5xx / network = unknown outcome.
  if (!r.ok || j.status !== 'success') { const m = String(j.message || `Flutterwave error ${r.status}`); throw r.status < 500 ? new PayoutRefused(m, r.status, 'flutterwave') : new Error(m) }
  return j.data
}

let flwBanksCache: { at: number; list: Bank[] } | null = null
export async function flwBanks(key: string, f: Fetch = fetch): Promise<Bank[]> {
  if (flwBanksCache && Date.now() - flwBanksCache.at < 6 * 3600e3) return flwBanksCache.list
  const data = (await fw(f, key, '/banks/NG')) as { code: string; name: string }[]
  const list = (data ?? []).map((b) => ({ code: String(b.code), name: String(b.name) }))
  flwBanksCache = { at: Date.now(), list }
  return list
}

const normBank = (s: string) => s.toLowerCase().replace(/\bgt ?bank\b/g, 'guaranty trust').replace(/\bfcmb\b/g, 'first city monument').replace(/\buba\b/g, 'united bank for africa').replace(/&/g, ' and ').replace(/\b(bank|banks|plc|limited|ltd|nigeria|nig|microfinance|mfb|mfbank|of|the|and)\b/g, ' ').replace(/[^a-z0-9]/g, '')
const alike = (a: string, b: string) => !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a))))

/**
 * Finds the Flutterwave bank code for a bank picked from Paystack's list. The code must belong to a bank
 * with the same name, so money can never go to a different bank that happens to share a code.
 */
export function matchFlwBank(code: string, name: string, list: Bank[]): string | null {
  const n = normBank(name)
  const same = list.find((b) => b.code === code)
  // 3-digit codes are the standard CBN codes that every Nigerian payment company shares; longer (fintech/MFB) codes differ.
  if (same && (/^\d{3}$/.test(code) || alike(normBank(same.name), n))) return same.code
  const exact = list.filter((b) => normBank(b.name) === n)
  if (exact.length === 1) return exact[0].code
  const near = list.filter((b) => alike(normBank(b.name), n))
  return near.length === 1 ? near[0].code : null
}

const flwMap = (s: string): TransferStatus => {
  const v = s.toUpperCase()
  return v === 'SUCCESSFUL' || v === 'SUCCESS' ? 'paid' : v === 'FAILED' ? 'failed' : v === 'REVERSED' ? 'reversed' : 'processing'
}

/** Resolves the account name at Flutterwave (null if Flutterwave won't say). */
export async function flwResolve(key: string, account: string, bankCode: string, f: Fetch = fetch): Promise<string | null> {
  try { const d = await fw(f, key, '/accounts/resolve', { account_number: account, account_bank: bankCode }); return d?.account_name ? String(d.account_name) : null }
  catch { return null }
}

export async function flwSendTransfer(key: string, amountMinor: number, bankCode: string, account: string, name: string, reference: string, f: Fetch = fetch) {
  const d = await fw(f, key, '/transfers', {
    account_bank: bankCode, account_number: account, amount: amountMinor / 100, currency: 'NGN', debit_currency: 'NGN',
    narration: 'Luda withdrawal', reference, beneficiary_name: name,
  }, 55000) // Flutterwave can take a while to queue a live transfer; waiting longer avoids "unknown" outcomes
  return { status: flwMap(String(d?.status ?? 'NEW')), raw: String(d?.status ?? ''), transferCode: d?.id != null ? String(d.id) : null }
}

/** Looks a Flutterwave transfer up by its id, or by our reference among the latest transfers. */
export async function flwCheckTransfer(key: string, reference: string, transferId: string | null | undefined, f: Fetch = fetch) {
  let d: Record<string, any> | undefined
  if (transferId) d = await fw(f, key, `/transfers/${encodeURIComponent(transferId)}`)
  else d = ((await fw(f, key, '/transfers?page=1')) as Record<string, any>[] ?? []).find((t) => t.reference === reference)
  if (!d) throw new PayoutRefused('Transfer not found', 404, 'flutterwave')
  return { status: flwMap(String(d.status ?? '')), reference: String(d.reference ?? ''), transferCode: d.id != null ? String(d.id) : null }
}
