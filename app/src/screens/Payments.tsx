// "My payments" (v1.34.0, replaces the wallet): Luda keeps no balance, so this is simply every service the person
// paid for (bus tickets, bills, rent, mobile top-ups) with its status, any refund, a receipt and help.
import { Bus, Landmark, Copy, Download, FileText, Home as HomeIcon, LifeBuoy, Smartphone, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LiveKyc } from '../components/LiveMoney'
import { useLive } from '../lib/liveStore'
import { Empty, Pill, useApi } from '../components/LiveKit'
import { CasesHub } from '../components/LiveSupport'
import { Header, Sheet } from '../components/ui'
import { money } from '../lib/live'
import { downloadReceipt } from '../lib/receipt'
import { useStore } from '../lib/store'

export interface Order {
  reference: string; provider: 'paystack' | 'flutterwave'; status: 'pending' | 'paid' | 'failed' | 'mismatch'; charge: number; currency: string
  item: { kind: 'ticket' | 'bill'; label: string; total: number; fee: number; discount?: number; result?: { ticketId?: string; code?: string; billId?: string } | null; bill?: { type: string } }
  createdAt: string; paidAt: string | null; doneAt: string | null; refund: 'pending' | 'refunded' | 'failed' | null; refundNote: string | null; refundedAt: string | null
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const icon = (o: Order) => (o.item.kind === 'ticket' ? Bus : o.item.bill?.type === 'rent' ? HomeIcon : o.item.bill?.type === 'residency' ? Landmark : o.item.bill?.type === 'phone' ? Smartphone : Zap)

function StatusPill({ o }: { o: Order }) {
  if (o.refund === 'refunded') return <Pill tone="back">Refunded</Pill>
  if (o.refund) return <Pill tone="wait">Refund on its way</Pill>
  if (o.status === 'paid') return <Pill tone="ok">Paid</Pill>
  if (o.status === 'pending') return <Pill tone="wait">Waiting for your bank</Pill>
  if (o.status === 'mismatch') return <Pill tone="wait">Being checked</Pill>
  return <Pill tone="back">Not completed</Pill>
}

export default function Payments() {
  const { data } = useApi<{ orders: Order[]; discount: number }>('orders')
  const [open, setOpen] = useState<Order | null>(null)
  const { me } = useLive()
  const [qs, setQs] = useSearchParams()
  const kycOpen = qs.get('a') === 'kyc'
  const closeKyc = () => setQs({}, { replace: true })
  const kyc = me?.profile.kyc
  const orders = (data?.orders ?? []).filter((o) => o.status !== 'failed' || Date.now() - Date.parse(o.createdAt) < 86400e3)
  const [filter, setFilter] = useState<'all' | 'open' | 'refunds'>('all')
  const isOpen = (o: Order) => o.status === 'pending' || o.status === 'mismatch' || (o.status === 'paid' && !o.doneAt && !o.refund) || o.refund === 'pending' || o.refund === 'failed'
  const shown = orders.filter((o) => filter === 'all' || (filter === 'refunds' ? !!o.refund : isOpen(o)))
  const groups = Object.entries(shown.reduce<Record<string, Order[]>>((g, o) => { const k = new Date(o.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); (g[k] ??= []).push(o); return g }, {}))
  const now = new Date()
  const thisMonth = orders.filter((o) => o.status === 'paid' && !o.refund && new Date(o.paidAt ?? o.createdAt).getMonth() === now.getMonth() && new Date(o.paidAt ?? o.createdAt).getFullYear() === now.getFullYear())
  const monthTotal = thisMonth.reduce((n, o) => n + o.item.total - (o.item.discount ?? 0), 0)
  const monthCount = thisMonth.length
  return (
    <div className="pb-8">
      <Header title="My payments" sub="Everything you paid for, with receipts" />
      <div className="flex flex-col gap-4 px-5">
        {/* v1.36.0: one summary card, a slim 'pay for' row, filters and month groups */}
        <div data-tour="balance" className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-500 via-emerald-700 to-emerald-950 p-5 text-white shadow-xl shadow-emerald-900/30">
          <div className="absolute -end-10 -top-12 size-40 rounded-full bg-gold-300/20 blur-3xl" />
          <p className="relative text-xs font-semibold uppercase tracking-wide text-emerald-100/80">This month</p>
          <p className="relative text-3xl font-extrabold">{money(monthTotal, 'TRY')}</p>
          <p className="relative text-xs text-emerald-100/80">{monthCount === 1 ? '1 payment' : `${monthCount} payments`}{(data?.discount ?? 0) > 0 ? ` · 🎁 ${money(data!.discount, 'TRY')} off your next payment` : ''}</p>
          <p className="relative mt-3 flex items-center gap-1.5 rounded-xl bg-black/20 px-3 py-2 text-xs text-emerald-50">🔒 Luda never holds your money. If we can't deliver, it goes back to your card or bank.</p>
        </div>

        {me && kyc !== 'verified' && <button onClick={() => setQs({ a: 'kyc' })} className="flex items-center gap-3 rounded-2xl border border-mint-400/30 bg-mint-400/[0.08] p-3 text-start"><span className="text-2xl">🪪</span><span className="flex-1 text-sm"><b>{kyc === 'pending' ? 'Your ID check is in progress' : 'Verify your ID'}</b><br /><span className="text-xs text-slate-400">{kyc === 'pending' ? 'We’ll tell you as soon as it’s done.' : 'About 2 minutes. Unlocks Market selling, Flash jobs, posting and prizes.'}</span></span></button>}

        <div>
          <p className="label mb-2">Pay for</p>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {([['/transport', Bus, 'Bus ticket'], ['/bills', Zap, 'Bill'], ['/bills', HomeIcon, 'Rent'], ['/bills', Smartphone, 'Airtime'], ['/bills?residency=1', Landmark, 'Residency fees']] as const).map(([to, I, label]) => (
              <Link key={label} to={to} className="chip shrink-0 gap-1.5 bg-fg/[0.06] py-2.5 text-sm font-semibold text-slate-200"><I size={15} /> {label}</Link>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="label">History</p>
          <div className="flex gap-1.5">{([['all', 'All'], ['open', 'In progress'], ['refunds', 'Refunds']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} className={`chip py-1.5 text-xs ${filter === v ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/[0.05] text-slate-400'}`}>{l}</button>
          ))}</div>
        </div>
        {!data ? <p className="text-sm text-slate-500">Loading…</p> : shown.length === 0
          ? <Empty emoji="🧾" title={filter === 'all' ? 'No payments yet' : 'Nothing here'} sub={filter === 'all' ? 'Buy a bus ticket or pay a bill. It will show here with its receipt.' : 'Payments that match this filter show here.'} />
          : groups.map(([month, list]) => (
            <div key={month} className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-slate-500">{month}</p>
              <div className="card divide-y divide-fg/5 p-0">
                {list.map((o) => { const I = icon(o); return (
                  <button key={o.reference} onClick={() => setOpen(o)} className="flex w-full items-center gap-3 px-4 py-3 text-start">
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-fg/[0.06]"><I size={18} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{o.item.label}</span><span className="block text-[11px] text-slate-400">{when(o.createdAt)}</span></span>
                    <span className="flex flex-col items-end gap-1"><b className="text-sm">{money(o.charge, o.currency)}</b><StatusPill o={o} /></span>
                  </button>
                ) })}
              </div>
            </div>
          ))}
      </div>
      {open && <PaymentSheet o={open} onClose={() => setOpen(null)} />}
      {kycOpen && <Sheet open onClose={closeKyc} title="Verify your identity"><LiveKyc onDone={closeKyc} /></Sheet>}
    </div>
  )
}

function PaymentSheet({ o, onClose }: { o: Order; onClose: () => void }) {
  const { s, toast } = useStore()
  const [help, setHelp] = useState(false)
  const rows: [string, string][] = [
    ['For', o.item.label], ['Paid', money(o.charge, o.currency)], ['Price', money(o.item.total, 'TRY')],
    ...(o.item.fee ? [['Luda service fee', money(o.item.fee, 'TRY')] as [string, string]] : []),
    ...(o.item.discount ? [['Reward discount', `−${money(o.item.discount, 'TRY')}`] as [string, string]] : []),
    ['Paid with', o.provider === 'paystack' ? 'Card / bank (Paystack)' : 'Flutterwave'], ['Date', when(o.paidAt ?? o.createdAt)], ['Reference', o.reference],
    ...(o.item.result?.code ? [['Ticket code', o.item.result.code] as [string, string]] : []),
    ...(o.refund ? [['Refund', o.refund === 'refunded' ? `Sent back${o.refundedAt ? ` on ${when(o.refundedAt)}` : ''}` : 'On its way to your card or bank'] as [string, string]] : []),
  ]
  const copy = async () => { try { await navigator.clipboard.writeText(o.reference); toast({ title: 'Reference copied', emoji: '📋' }) } catch { /* not allowed */ } }
  return (
    <Sheet open onClose={onClose} title={o.item.label}>
      <div className="flex flex-col gap-3 pb-4">
        <div className="flex items-center justify-between"><p className="text-3xl font-extrabold">{money(o.charge, o.currency)}</p><StatusPill o={o} /></div>
        {o.refundNote && <p className="rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100">{o.refundNote}</p>}
        <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
          {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-4 py-2.5"><span className="text-slate-400">{k}</span><span className="selectable break-all text-end font-semibold">{v}</span></div>)}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost py-3 text-sm" onClick={() => void copy()}><Copy size={15} /> Copy reference</button>
          {o.status === 'paid' && <button className="btn-ghost py-3 text-sm" onClick={() => void downloadReceipt({ title: o.item.label, amount: money(o.charge, o.currency), status: o.refund === 'refunded' ? 'Refunded' : 'Paid', positive: false, rows: rows.filter(([k]) => k !== 'For'), name: s.name })}><Download size={15} /> Receipt</button>}
        </div>
        {o.item.kind === 'ticket' && o.status === 'paid' && !o.refund && <Link to="/transport" className="btn-primary py-3.5 text-sm">Open my ticket</Link>}
        {o.item.kind === 'bill' && o.status === 'paid' && !o.refund && <Link to="/bills" className="btn-primary py-3.5 text-sm"><FileText size={15} /> Track this bill</Link>}
        <button className="btn-ghost py-3 text-sm" onClick={() => setHelp(true)}><LifeBuoy size={15} /> Report a problem with this payment</button>
      </div>
      {help && <CasesHub start="new" category="payment" reference={o.reference} subject={`Problem with a payment: ${o.item.label}`} onClose={() => setHelp(false)} />}
    </Sheet>
  )
}
