import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Header } from '../components/ui'
import { randomSecret } from '../lib/crypto'
import { fmt } from '../lib/fx'
import { PROVIDER_LABEL, checkPayment, clearPending, loadPending, type PaymentView } from '../lib/payments'
import { uid, useStore } from '../lib/store'
import { ticketCode, type Ticket } from '../lib/tickets'

/**
 * Where Paystack / Flutterwave send the user after checkout.
 * We never trust the URL: the server confirms with the provider, then the ticket is issued once.
 */
export default function PayReturn() {
  const [params] = useSearchParams()
  const ref = params.get('ref') ?? params.get('reference') ?? params.get('tx_ref') ?? ''
  const { s, set, addTx, reward } = useStore()
  const [view, setView] = useState<PaymentView | null>(null)
  const [err, setErr] = useState('')
  const [tries, setTries] = useState(0)
  const issued = useRef(false)
  const existing = s.tickets.find((t) => t.payRef === ref)

  useEffect(() => {
    if (!ref || existing) return
    let alive = true, timer = 0
    const poll = async (n: number) => {
      try {
        const v = await checkPayment(ref)
        if (!alive) return
        setView(v); setTries(n)
        if (v.status === 'pending' && n < 8) timer = window.setTimeout(() => poll(n + 1), 2500) // bank transfers can take a moment
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : 'Could not check the payment') }
    }
    poll(1)
    return () => { alive = false; clearTimeout(timer) }
  }, [ref, existing])

  // Issue the ticket exactly once, from what the server confirmed.
  useEffect(() => {
    if (!view || view.status !== 'paid' || existing || issued.current) return
    issued.current = true
    const pending = loadPending(ref)
    const o = view.item
    const tk: Ticket = {
      id: uid(), code: ticketCode(), operator: pending?.operator ?? o.label?.split(' · ')[0] ?? 'Bus', from: o.from, to: o.to, date: o.date, time: o.time,
      returnDate: o.returnDate, returnTime: o.returnTime, pax: o.pax, total: view.baseAmount, saved: 0, paidWith: 'card',
      paidCur: view.currency, paidAmount: view.amountMinor / 100, createdAt: Date.now(), status: 'valid', kind: pending?.ticketKind ?? (o.operatorId === 'kibhas' ? 'shuttle' : 'bus'),
      holder: o.holder || s.name, secret: randomSecret(), payRef: ref,
    }
    set((p) => ({ ...p, tickets: [tk, ...p.tickets] }))
    addTx({ type: 'bill', amount: -view.amountMinor / 100, currency: view.currency, label: `${tk.operator} · ${tk.from}→${tk.to}`, meta: PROVIDER_LABEL[view.provider] })
    reward(s.quests.includes('ticket') ? 10 : 50, { quest: 'ticket', badge: 'traveller', title: 'Ticket booked' })
    clearPending(ref)
  }, [view, existing, ref, s.name, s.quests, set, addTx, reward])

  const status = existing ? 'paid' : view?.status
  return (
    <div>
      <Header back title="Payment" />
      <div className="flex flex-col items-center gap-3 px-6 pt-10 text-center">
        {!ref ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">No payment to check</p></> :
          err ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">Couldn't check your payment</p><p className="text-sm text-slate-400">{err}. If you were charged, your ticket will still be issued. Contact support with code <b>{ref.slice(-8)}</b>.</p></> :
          status === 'paid' ? <><CheckCircle2 size={56} className="text-mint-400" /><p className="text-xl font-extrabold">Ticket booked 🎟️</p>
            <p className="text-sm text-slate-400">{existing ? `${existing.from} → ${existing.to} · ${existing.time}. Code ${existing.code}.` : 'Your e-ticket is ready.'} Find it under "My tickets".</p>
            {view && <p className="text-xs text-slate-500">Paid {fmt(view.amountMinor / 100, view.currency)} with {PROVIDER_LABEL[view.provider]}</p>}</> :
          status === 'failed' ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">Payment didn't go through</p><p className="text-sm text-slate-400">You were not charged. You can try again.</p></> :
          status === 'mismatch' ? <><XCircle size={56} className="text-gold-300" /><p className="text-lg font-bold">We're checking this payment</p><p className="text-sm text-slate-400">The amount didn't match the ticket price, so our team will review it and refund or issue your ticket. Code <b>{ref.slice(-8)}</b>.</p></> :
          status === 'pending' && tries >= 8 ? <><Clock size={56} className="text-gold-300" /><p className="text-lg font-bold">Still waiting for your bank</p><p className="text-sm text-slate-400">If you paid, your ticket appears as soon as the payment is confirmed. You can come back to this page later.</p></> :
          <><Loader2 size={56} className="animate-spin text-violet-300" /><p className="text-lg font-bold">Confirming your payment…</p><p className="text-sm text-slate-400">Please don't close this page.</p></>}
        <Link to="/transport" className="btn-primary mt-4 w-full max-w-xs py-4">Go to my tickets</Link>
      </div>
    </div>
  )
}
