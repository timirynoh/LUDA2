import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import { WALLET } from '../config'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Header } from '../components/ui'
import { ORDER_KEY } from '../components/Checkout'
import { PENDING_KEY, PROVIDER_LABEL, api, money, type Provider } from '../lib/live'
import { useLive } from '../lib/liveStore'

interface DepositView { status: 'pending' | 'paid' | 'failed' | 'mismatch'; creditMinor: number; creditCurrency: 'NGN' | 'TRY'; chargeMinor: number; currency: string; provider: Provider }
interface OrderView { status: 'pending' | 'paid' | 'failed' | 'mismatch'; kind: 'ticket' | 'bill'; label: string; chargeMinor: number; currency: string; result: { ticketId?: string; code?: string; billId?: string; auto?: { status: string } | null } | null; refund: string | null; provider: Provider }

/**
 * Where Paystack / Flutterwave send people after paying. The server confirms with the provider first.
 * v1.34.0: a payment is for ONE service (order=1): a ticket is issued or a bill goes to the team at once.
 * Old wallet top-ups (before v1.34.0) still show their result.
 */
export default function PayReturn() {
  const [params] = useSearchParams()
  const isOrder = params.get('order') === '1' || (params.get('ref') ?? '').startsWith('ord') || (!params.get('ref') && (() => { try { return !!localStorage.getItem(ORDER_KEY) } catch { return false } })())
  const ref = params.get('ref') ?? params.get('reference') ?? params.get('tx_ref') ?? (() => { try { return localStorage.getItem(ORDER_KEY) ?? localStorage.getItem(PENDING_KEY) ?? '' } catch { return '' } })()
  const { refresh } = useLive()
  const [o, setO] = useState<OrderView | null>(null)
  const [v, setV] = useState<DepositView | null>(null)
  const [err, setErr] = useState('')
  const [tries, setTries] = useState(0)

  useEffect(() => {
    if (!ref) return
    let alive = true, timer = 0
    const poll = async (n: number) => {
      try {
        const r = isOrder ? await api<OrderView>('GET', `order?ref=${encodeURIComponent(ref)}`) : await api<DepositView>('GET', `deposit?ref=${encodeURIComponent(ref)}`)
        if (!alive) return
        if (isOrder) setO(r as OrderView); else setV(r as DepositView)
        setTries(n)
        if (r.status === 'pending' && n < 10) timer = window.setTimeout(() => poll(n + 1), 3000) // bank transfers/USSD can take a moment
        else { try { localStorage.removeItem(PENDING_KEY); localStorage.removeItem(ORDER_KEY) } catch { /* fine */ } if (r.status === 'paid') void refresh() }
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : 'Could not check the payment') }
    }
    void poll(1)
    return () => { alive = false; clearTimeout(timer) }
  }, [ref, isOrder, refresh])

  if (isOrder) {
    const st = o?.status
    const ticket = o?.kind === 'ticket'
    return (
      <div>
        <Header title="Payment" />
        <div className="flex flex-col items-center gap-3 px-6 pt-10 text-center">
          {!ref ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">No payment to check</p></> :
            err ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">Couldn't check your payment</p><p className="text-sm text-slate-400">{err}. If you paid, it's completed as soon as {o ? PROVIDER_LABEL[o.provider] : 'the payment provider'} confirms. Reference <b>{ref.slice(-8)}</b>.</p></> :
            st === 'paid' && o?.refund ? <><XCircle size={56} className="text-gold-300" /><p className="text-lg font-bold">We couldn't complete this one</p><p className="text-sm text-slate-400">Your {money(o.chargeMinor, o.currency)} is on its way back to your card or bank. It usually takes 5–10 business days.</p></> :
            st === 'paid' && ticket ? <><CheckCircle2 size={56} className="text-mint-400" /><p className="text-xl font-extrabold">Ticket booked 🎟️</p><p className="text-sm text-slate-400">{o!.label}. {o!.result?.code ? <>Code <b className="selectable">{o!.result.code}</b>. </> : null}Show its QR code to the driver.</p></> :
            st === 'paid' ? <><CheckCircle2 size={56} className="text-mint-400" /><p className="text-xl font-extrabold">{o?.result?.auto?.status === 'paid' ? 'Top-up sent ✅' : 'Payment received ✅'}</p><p className="text-sm text-slate-400">{o!.label}. {o?.result?.auto?.status === 'paid' ? 'It can take a minute to show on the phone.' : 'The Luda team is paying it now. The receipt will appear in My bills.'}</p></> :
            st === 'failed' ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">Payment didn't go through</p><p className="text-sm text-slate-400">You were not charged. You can try again.</p></> :
            st === 'mismatch' ? <><XCircle size={56} className="text-gold-300" /><p className="text-lg font-bold">We're checking this payment</p><p className="text-sm text-slate-400">The amount paid didn't match. The Luda team will complete it or refund you. Reference <b>{ref.slice(-8)}</b>.</p></> :
            st === 'pending' && tries >= 10 ? <><Clock size={56} className="text-gold-300" /><p className="text-lg font-bold">Waiting for your bank</p><p className="text-sm text-slate-400">If you paid, it's completed automatically when the payment confirms. You'll get a notification. You can leave this page.</p></> :
            <><Loader2 size={56} className="animate-spin text-violet-300" /><p className="text-lg font-bold">Confirming your payment…</p><p className="text-sm text-slate-400">Please don't close this page.</p></>}
          {st === 'paid' && !o?.refund && <Link to={ticket ? '/transport' : '/bills'} replace className="btn-primary mt-4 w-full max-w-xs py-4">{ticket ? 'See my ticket' : 'Track my bill'}</Link>}
          <Link to="/payments" replace className={`${st === 'paid' && !o?.refund ? 'btn-ghost' : 'btn-primary mt-4'} w-full max-w-xs py-3.5`}>My payments</Link>
        </div>
      </div>
    )
  }

  const st = v?.status
  return (
    <div>
      <Header back title={WALLET ? 'Top-up' : 'Payment'} />
      <div className="flex flex-col items-center gap-3 px-6 pt-10 text-center">
        {!ref ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">No payment to check</p></> :
          err ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">Couldn't check your payment</p><p className="text-sm text-slate-400">{err}. Reference <b>{ref.slice(-8)}</b>.</p></> :
          st === 'paid' ? <><CheckCircle2 size={56} className="text-mint-400" /><p className="text-xl font-extrabold">Payment received</p><p className="text-sm text-slate-400">{money(v!.creditMinor, v!.creditCurrency ?? 'NGN')} was received.</p></> :
          st === 'failed' ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">Payment didn't go through</p><p className="text-sm text-slate-400">You were not charged.</p></> :
          <><Loader2 size={56} className="animate-spin text-violet-300" /><p className="text-lg font-bold">Confirming your payment…</p></>}
        <Link to="/payments" replace className="btn-primary mt-4 w-full max-w-xs py-4">My payments</Link>
      </div>
    </div>
  )
}
