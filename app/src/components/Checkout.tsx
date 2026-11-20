// Pay directly for one service (v1.34.0, owner: Luda can't hold money). The server prices the order, the person picks
// how to pay (card / bank / USSD in Naira with Paystack, or another currency with Flutterwave), approves with the PIN,
// and pays on the provider's secure page. Nothing is kept by Luda: the payment goes straight to this service.
import { CreditCard, Globe, Lock, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ReviewAndPin, errMsg } from './LiveMoney'
import { Success } from './ui'
import { PENDING_KEY, api, liveConfig, money, type Provider } from '../lib/live'

export interface OrderBody { kind: 'ticket' | 'bill'; [k: string]: unknown }
export interface Quote {
  label: string; kind: string; totalTry: number; feeTry: number; discountTry: number; discountAvailable: number
  currency: string; amountMinor: number; feeMinor: number; chargeMinor: number; providerAddsFee: boolean; estFeeMinor: number; provider: Provider
}
export const ORDER_KEY = 'luda.pending.order'
const FOREIGN_NAME: Record<string, string> = { USD: '🇺🇸 US dollar', GHS: '🇬🇭 Ghana cedi', KES: '🇰🇪 Kenyan shilling', UGX: '🇺🇬 Ugandan shilling', ZMW: '🇿🇲 Zambian kwacha', XAF: '🇨🇲 CFA franc' }

/** Prices an order on the server whenever it changes (nothing is charged). */
export function useQuote(body: OrderBody | null, payWith: Provider, currency: string) {
  const [q, setQ] = useState<Quote | null>(null)
  const [err, setErr] = useState('')
  const key = useMemo(() => (body ? JSON.stringify({ ...body, files: undefined, payWith, currency }) : ''), [body, payWith, currency])
  useEffect(() => {
    if (!key || !body) { setQ(null); return }
    let alive = true
    setErr('')
    const t = setTimeout(() => {
      api<Quote>('POST', 'checkout', { ...body, files: undefined, payWith, currency, quote: true })
        .then((r) => { if (alive) setQ(r) }).catch((e) => { if (alive) { setQ(null); setErr(errMsg(e)) } })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { q, err }
}

/** How to pay: Naira with Paystack (card, bank transfer, USSD), or another currency with Flutterwave. */
function PayMethod({ payWith, currency, onPick }: { payWith: Provider; currency: string; onPick: (p: Provider, c: string) => void }) {
  const [opts, setOpts] = useState<{ providers: Provider[]; foreign: string[] }>({ providers: ['paystack'], foreign: [] })
  useEffect(() => { liveConfig().then((c) => setOpts({ providers: c.providers, foreign: c.foreign ?? [] })).catch(() => {}) }, [])
  const naira = opts.providers.includes('paystack') ? 'paystack' : 'flutterwave'
  return (
    <div className="flex flex-col gap-2">
      <p className="label">How do you want to pay?</p>
      <button onClick={() => onPick(naira, 'NGN')} className={`glass flex items-center gap-3 rounded-2xl p-3 text-start ${currency === 'NGN' ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
        <CreditCard size={20} className="shrink-0 text-mint-300" />
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Naira · card, bank transfer or USSD</span><span className="text-[11px] text-slate-400">Any Nigerian card or bank</span></span>
      </button>
      {opts.providers.includes('flutterwave') && opts.foreign.length > 0 && (
        <div className={`glass rounded-2xl p-3 ${currency !== 'NGN' ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
          <p className="flex items-center gap-3 text-sm font-semibold"><Globe size={20} className="shrink-0 text-sky-300" /> Another currency</p>
          <div className="mt-2 flex flex-wrap gap-1.5">{opts.foreign.map((c) => (
            <button key={c} onClick={() => onPick('flutterwave', c)} className={`chip py-1.5 text-xs ${currency === c && payWith === 'flutterwave' ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.06] text-slate-300'}`}>{FOREIGN_NAME[c] ?? c}</button>
          ))}</div>
        </div>
      )}
    </div>
  )
}

/** The price breakdown and the amount the person will pay. */
export function QuoteCard({ q, err }: { q: Quote | null; err?: string }) {
  if (err) return <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200">{err}</p>
  if (!q) return <p className="text-sm text-slate-500">Working out the price…</p>
  return (
    <div className="rounded-3xl bg-gradient-to-br from-emerald-500/20 to-emerald-900/20 p-4 ring-1 ring-mint-400/30">
      <p className="text-xs text-slate-300">You pay</p>
      <p className="text-3xl font-extrabold">{money(q.chargeMinor, q.currency)}</p>
      <div className="mt-2 flex flex-col gap-0.5 text-xs text-slate-300">
        <p className="flex justify-between"><span>Price</span><span>{money(q.totalTry - q.feeTry, 'TRY')}</span></p>
        {q.feeTry > 0 && <p className="flex justify-between"><span>Luda service fee</span><span>{money(q.feeTry, 'TRY')}</span></p>}
        {q.discountTry > 0 && <p className="flex justify-between text-mint-200"><span>🎁 Your reward discount</span><span>−{money(q.discountTry, 'TRY')}</span></p>}
        {q.feeMinor > 0 && <p className="flex justify-between"><span>Card / bank fee</span><span>{money(q.feeMinor, q.currency)}</span></p>}
      </div>
      {q.providerAddsFee && <p className="mt-2 text-[11px] text-slate-400">The payment page may add its own small card or bank fee before you confirm.</p>}
    </div>
  )
}

/**
 * Review → hold → PIN → the provider's secure payment page. Used for bus tickets, bills, rent and airtime.
 * `rows` describe what is being paid for; the price comes from the server.
 */
export function DirectPay({ body, rows, onClose, note }: { body: OrderBody; rows: [string, ReactNode][]; onClose: () => void; note?: ReactNode }) {
  const [payWith, setPayWith] = useState<Provider>('paystack')
  const [currency, setCurrency] = useState('NGN')
  const { q, err } = useQuote(body, payWith, currency)
  return (
    <div className="flex flex-col gap-4">
      <PayMethod payWith={payWith} currency={currency} onPick={(p, c) => { setPayWith(p); setCurrency(c) }} />
      <QuoteCard q={q} err={err} />
      {q && (
        <ReviewAndPin
          rows={[...rows, ['You pay', <b key="pay">{money(q.chargeMinor, q.currency)}</b>]]}
          holdLabel={`Hold to pay ${money(q.chargeMinor, q.currency)}`}
          warning={note ?? <span className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0" /> You pay on {payWith === 'paystack' ? 'Paystack' : 'Flutterwave'}'s secure page. Luda never sees your card. If we can't deliver, the money goes back to your card or bank.</span>}
          onClose={onClose}
          run={async (auth) => {
            const r = await api<Quote & { reference: string; checkoutUrl: string }>('POST', 'checkout', { ...body, payWith, currency, ...auth })
            try { localStorage.setItem(ORDER_KEY, r.reference); localStorage.setItem(PENDING_KEY, r.reference) } catch { /* fine */ }
            window.location.assign(r.checkoutUrl)
          }}
          done={<Success title="Opening the secure payment page…" sub="Pay there, then you'll come straight back to Luda." onClose={onClose} />} />
      )}
      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500"><Lock size={11} /> Luda keeps no balance: you pay for this service only.</p>
    </div>
  )
}
