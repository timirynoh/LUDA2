// Withdrawals to Nigerian bank accounts via Paystack Transfers.
// (Flutterwave transfers require a fixed, whitelisted server IP, which Supabase Edge Functions don't have.)
// Paystack dashboard: Settings → Preferences → turn OFF "Confirm transfers with OTP" for API payouts.
import type { Fetch } from './providers.ts'

const API = 'https://api.paystack.co'
export interface Bank { code: string; name: string }
export type TransferStatus = 'processing' | 'paid' | 'failed' | 'reversed'

async function ps(f: Fetch, key: string, path: string, body?: unknown) {
  const r = await f(`${API}${path}`, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, signal: AbortSignal.timeout(20000),
  })
  const j = (await r.json().catch(() => ({}))) as Record<string, any>
  if (!r.ok || j.status === false) throw new Error(j.message || `Paystack error ${r.status}`)
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
