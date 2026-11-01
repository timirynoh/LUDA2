import { ExternalLink, Loader2, Lock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { fmt } from '../lib/fx'
import { PROVIDER_LABEL, payConfig, savePending, startTicketCheckout, type InitResult, type Provider, type TicketOrder } from '../lib/payments'
import { useStore } from '../lib/store'
import type { Ticket } from '../lib/tickets'

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

/**
 * Pay for a ticket on Paystack's or Flutterwave's secure page.
 * Two steps so nothing is charged by accident: (1) get the exact amount, (2) confirm and open the provider.
 */
export function OnlinePay({ operator, ticketKind, order, total, ready }: { operator: string; ticketKind: Ticket['kind']; order: TicketOrder; total: number; ready: boolean }) {
  const { s, allow } = useStore()
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [provider, setProvider] = useState<Provider>('paystack')
  const [email, setEmail] = useState(s.account?.email ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [quoted, setQuoted] = useState<{ key: string; res: InitResult } | null>(null)

  useEffect(() => {
    payConfig().then((c) => { setProviders(c.providers); if (c.providers[0]) setProvider(c.providers[0]) }).catch((e) => setErr(e.message))
  }, [])
  // Any change to the trip, method or email invalidates the quote.
  const key = JSON.stringify([order, provider, email.trim()])
  const quote = quoted?.key === key ? quoted.res : null
  const setQuote = (res: InitResult | null) => setQuoted(res ? { key, res } : null)

  const getQuote = async () => {
    setErr('')
    if (!allow('ticket')) return
    setBusy(true)
    try {
      const q = await startTicketCheckout(provider, email.trim(), order)
      savePending(q.reference, { kind: 'ticket', provider, operator, ticketKind, order, createdAt: Date.now() })
      setQuote(q)
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not start the payment') } finally { setBusy(false) }
  }

  if (providers && providers.length === 0) return <p className="text-sm text-rose-300">Online payment is switched off right now. Please try again later.</p>

  return (
    <div className="flex flex-col gap-3">
      <p className="label">Pay with</p>
      <div className="grid grid-cols-2 gap-2">
        {(providers ?? ['paystack', 'flutterwave'] as Provider[]).map((p) => (
          <button key={p} disabled={!providers} onClick={() => setProvider(p)} className={`glass flex flex-col items-start gap-1 rounded-2xl p-3 text-start ${provider === p ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
            <span className="text-sm font-semibold">{PROVIDER_LABEL[p]}</span>
            <span className="text-xs text-slate-400">Card · bank transfer · USSD</span>
          </button>
        ))}
      </div>
      <input className="input" type="email" inputMode="email" autoComplete="email" placeholder="Email for your receipt" value={email} onChange={(e) => setEmail(e.target.value)} />
      <p className="flex items-start gap-1.5 text-[11px] text-slate-500"><Lock size={12} className="mt-0.5 shrink-0" /> You type your card on {PROVIDER_LABEL[provider]}'s secure page. Luda never sees or stores your card number. Charged in Naira at today's rate. Ride Saver discounts aren't applied to online payments yet.</p>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {!quote ? (
        <button className="btn-primary py-4" disabled={!ready || busy || !providers || !EMAIL.test(email.trim())} onClick={getQuote}>
          {busy ? <Loader2 size={18} className="animate-spin" /> : null} Continue · {fmt(total, 'TRY')}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-2xl border border-gold-400/30 bg-gold-400/10 p-3">
          <p className="text-sm">You'll pay <b>{fmt(quote.amountMinor / 100, quote.currency)}</b> <span className="text-slate-400">({fmt(quote.baseAmount, quote.baseCurrency)})</span> on {PROVIDER_LABEL[provider]}.</p>
          <p className="text-[11px] text-slate-400">After paying you'll come back here and your ticket appears automatically.</p>
          <button className="btn-primary py-4" onClick={() => window.location.assign(quote.checkoutUrl)}><ExternalLink size={18} /> Confirm & open {PROVIDER_LABEL[provider]}</button>
          <button className="btn-ghost text-sm" onClick={() => setQuote(null)}>Change something</button>
        </div>
      )}
    </div>
  )
}
