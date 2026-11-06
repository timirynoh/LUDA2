import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Header } from '../components/ui'
import { PENDING_KEY, PROVIDER_LABEL, api, money, type Provider } from '../lib/live'
import { useLive } from '../lib/liveStore'

interface DepositView { status: 'pending' | 'paid' | 'failed' | 'mismatch'; creditMinor: number; creditCurrency: 'NGN' | 'TRY'; chargeMinor: number; currency: string; provider: Provider }

/** Where Paystack / Flutterwave send people after a top-up. The server confirms with the provider before crediting. */
export default function PayReturn() {
  const [params] = useSearchParams()
  const ref = params.get('ref') ?? params.get('reference') ?? params.get('tx_ref') ?? localStorage.getItem(PENDING_KEY) ?? ''
  const { refresh } = useLive()
  const [v, setV] = useState<DepositView | null>(null)
  const [err, setErr] = useState('')
  const [tries, setTries] = useState(0)

  useEffect(() => {
    if (!ref) return
    let alive = true, timer = 0
    const poll = async (n: number) => {
      try {
        const r = await api<DepositView>('GET', `deposit?ref=${encodeURIComponent(ref)}`)
        if (!alive) return
        setV(r); setTries(n)
        if (r.status === 'pending' && n < 10) timer = window.setTimeout(() => poll(n + 1), 3000) // transfers/USSD can take a moment
        else { localStorage.removeItem(PENDING_KEY); if (r.status === 'paid') refresh() }
      } catch (e) { if (alive) setErr(e instanceof Error ? e.message : 'Could not check the payment') }
    }
    poll(1)
    return () => { alive = false; clearTimeout(timer) }
  }, [ref, refresh])

  const st = v?.status
  return (
    <div>
      <Header back title="Top-up" />
      <div className="flex flex-col items-center gap-3 px-6 pt-10 text-center">
        {!ref ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">No payment to check</p></> :
          err ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">Couldn't check your payment</p><p className="text-sm text-slate-400">{err}. If you were charged, your wallet is credited as soon as {v ? PROVIDER_LABEL[v.provider] : 'the provider'} confirms. Reference <b>{ref.slice(-8)}</b>.</p></> :
          st === 'paid' ? <><CheckCircle2 size={56} className="text-mint-400" /><p className="text-xl font-extrabold">Wallet topped up 🎉</p><p className="text-sm text-slate-400">{money(v!.creditMinor, v!.creditCurrency ?? 'NGN')} is now in your {v!.creditCurrency === 'TRY' ? 'Lira' : 'Naira'} wallet.</p></> :
          st === 'failed' ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">Payment didn't go through</p><p className="text-sm text-slate-400">You were not charged. You can try again.</p></> :
          st === 'mismatch' ? <><XCircle size={56} className="text-gold-300" /><p className="text-lg font-bold">We're reviewing this payment</p><p className="text-sm text-slate-400">The amount paid didn't match. Our team will credit or refund you. Reference <b>{ref.slice(-8)}</b>.</p></> :
          st === 'pending' && tries >= 10 ? <><Clock size={56} className="text-gold-300" /><p className="text-lg font-bold">Waiting for your bank</p><p className="text-sm text-slate-400">If you paid, your wallet is credited automatically when the payment confirms. You can leave this page.</p></> :
          <><Loader2 size={56} className="animate-spin text-violet-300" /><p className="text-lg font-bold">Confirming your payment…</p><p className="text-sm text-slate-400">Please don't close this page.</p></>}
        <Link to="/wallet" replace className="btn-primary mt-4 w-full max-w-xs py-4">Go to my wallet</Link>
      </div>
    </div>
  )
}
