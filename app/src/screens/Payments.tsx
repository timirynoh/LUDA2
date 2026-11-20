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
  return (
    <div className="pb-8">
      <Header title="My payments" sub="Every service you paid for, with receipts" />
      <div className="flex flex-col gap-4 px-5">
        <div data-tour="balance" className="grid grid-cols-2 gap-2.5">
          {([['/transport', Bus, 'Bus ticket', 'from-cyan-400 to-sky-700'], ['/bills', Zap, 'Pay a bill', 'from-orange-400 to-rose-500'], ['/bills', HomeIcon, 'Pay rent', 'from-amber-400 to-orange-600'], ['/bills', Smartphone, 'Mobile top-up', 'from-emerald-400 to-cyan-700']] as const).map(([to, I, label, c]) => (
            <Link key={label} to={to} className="card flex items-center gap-3 py-3"><span className={`grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${c} text-white`}><I size={18} /></span><span className="text-sm font-semibold">{label}</span></Link>
          ))}
        </div>
        {me && kyc !== 'verified' && <button onClick={() => setQs({ a: 'kyc' })} className="flex items-center gap-3 rounded-2xl border border-mint-400/30 bg-mint-400/[0.08] p-3 text-start"><span className="text-2xl">🪪</span><span className="flex-1 text-sm"><b>{kyc === 'pending' ? 'Your ID check is in progress' : 'Verify your ID'}</b><br /><span className="text-xs text-slate-400">{kyc === 'pending' ? 'We’ll tell you as soon as it’s done.' : 'About 2 minutes. Unlocks Market selling, Flash jobs, posting and prizes.'}</span></span></button>}
        {(data?.discount ?? 0) > 0 && <div className="rounded-2xl bg-mint-400/10 p-3 text-sm text-mint-100">🎁 You have <b>{money(data!.discount, 'TRY')}</b> off your next payment. It's used automatically at checkout.</div>}
        <p className="rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-400">Luda doesn't keep a balance. You pay for each service when you use it, by card, bank transfer or USSD. If we can't deliver, the money goes back to your card or bank.</p>
        <p className="label">History</p>
        {!data ? <p className="text-sm text-slate-500">Loading…</p> : orders.length === 0
          ? <Empty emoji="🧾" title="No payments yet" sub="Buy a bus ticket or pay a bill. It will show here with its receipt." />
          : orders.map((o) => { const I = icon(o); return (
            <button key={o.reference} onClick={() => setOpen(o)} className="card flex items-center gap-3 py-3 text-start">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-fg/[0.06]"><I size={18} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{o.item.label}</span><span className="block text-[11px] text-slate-400">{when(o.createdAt)}</span></span>
              <span className="flex flex-col items-end gap-1"><b className="text-sm">{money(o.charge, o.currency)}</b><StatusPill o={o} /></span>
            </button>
          ) })}
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
