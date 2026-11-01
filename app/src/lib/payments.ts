// Real checkout via Paystack / Flutterwave (through our Supabase Edge Functions).
// Turned on only when VITE_PAY_API is set at build time; otherwise the app stays in demo mode.
// Card details are always typed on the provider's own page, never inside Luda.
import type { Ticket } from './tickets'

const API = (import.meta.env.VITE_PAY_API as string | undefined)?.replace(/\/$/, '') // e.g. https://<project>.supabase.co/functions/v1
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export type Provider = 'paystack' | 'flutterwave'
export const livePay = !!API
export const PROVIDER_LABEL: Record<Provider, string> = { paystack: 'Paystack', flutterwave: 'Flutterwave' }

const headers = () => ({ 'content-type': 'application/json', ...(ANON ? { apikey: ANON, authorization: `Bearer ${ANON}` } : {}) })

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API) throw new Error('Online payments are not set up')
  const r = await fetch(`${API}/${path}`, { ...init, headers: headers() })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Payment server error (${r.status})`)
  return j as T
}

let cached: Promise<{ providers: Provider[]; chargeCurrency: string }> | null = null
/** Which providers the server has keys for. */
export const payConfig = () => (cached ??= req<{ providers: Provider[]; chargeCurrency: string }>('pay-init').catch((e) => { cached = null; throw e }))

export interface TicketOrder {
  operatorId: string; city?: string; return: boolean; pax: number; from: string; to: string
  date: string; time: string; returnDate?: string; returnTime?: string; holder: string
}

/** What we remember on this phone while the user is on the checkout page. */
export interface PendingTicket { kind: 'ticket'; provider: Provider; operator: string; ticketKind: Ticket['kind']; order: TicketOrder; createdAt: number }

const KEY = 'luda.pay.'
export const savePending = (ref: string, p: PendingTicket) => localStorage.setItem(KEY + ref, JSON.stringify(p))
export const loadPending = (ref: string): PendingTicket | null => { try { return JSON.parse(localStorage.getItem(KEY + ref) ?? 'null') } catch { return null } }
export const clearPending = (ref: string) => localStorage.removeItem(KEY + ref)

export interface InitResult { reference: string; checkoutUrl: string; amountMinor: number; currency: string; baseAmount: number; baseCurrency: string }
export const startTicketCheckout = (provider: Provider, email: string, order: TicketOrder) =>
  req<InitResult>('pay-init', { method: 'POST', body: JSON.stringify({ provider, email, purpose: 'ticket', item: order }) })

export interface PaymentView { reference: string; status: 'pending' | 'paid' | 'failed' | 'mismatch'; provider: Provider; amountMinor: number; currency: string; baseAmount: number; baseCurrency: string; item: TicketOrder & { label?: string } }
export const checkPayment = (ref: string) => req<PaymentView>(`pay-verify?reference=${encodeURIComponent(ref)}`)
