import { Link } from 'react-router-dom'
// Live (real-money) wallet: Naira + Lira balances held on the Luda server.
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Download, Share2, Eye, EyeOff, Plus, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConvertSheet, DepositSheet, LiveKyc, SendSheet, WithdrawSheet } from '../components/LiveMoney'
import { Header, Sheet } from '../components/ui'
import { KIND_LABEL, money, type Cur, type Me } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { NewCaseSheet } from '../components/LiveSupport'
import { FeesSheet } from '../components/LiveFees'
import { downloadReceipt, shareReceipt, type ReceiptFormat } from '../lib/receipt'
import { useStore } from '../lib/store'
import { HelpChip } from '../components/HelpCenter'

type Open = null | 'deposit' | 'withdraw' | 'convert' | 'send' | 'kyc' | 'fees'

export default function LiveWallet() {
  const { s, set } = useStore()
  const { me, loading, error, refresh } = useLive()
  const [open, setOpen] = useState<Open>(() => {
    const a = new URLSearchParams(window.location.search).get('a')
    return a === 'deposit' || a === 'withdraw' || a === 'convert' || a === 'send' ? a : null
  })
  const hide = s.security.hideBalances
  const verified = me?.profile.kyc === 'verified'
  const close = () => setOpen(null)
  const [detail, setDetail] = useState<Item | null>(null)
  const items = useMemo(() => (me ? buildItems(me) : []), [me])
  const show = (c: Cur) => (hide ? (c === 'NGN' ? '₦ ••••' : '₺ ••••') : money(me?.balances[c] ?? 0, c))

  return (
    <div className="pb-6">
      <Header back title="Wallet" sub="Protected by your PIN" right={<div className="flex items-center gap-2"><HelpChip topic="wallet" />
        <button className="glass grid size-10 place-items-center rounded-2xl" aria-label="Refresh" onClick={() => refresh()}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button></div>} />
      <div className="flex flex-col gap-3 px-5">
        {error && !me && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          {(['NGN', 'TRY'] as Cur[]).map((c) => (
            <div key={c} className={`rounded-3xl p-4 text-white ${c === 'NGN' ? 'bg-gradient-to-br from-emerald-500 to-emerald-900' : 'bg-gradient-to-br from-rose-500 to-rose-900'}`}>
              <p className="text-xs text-white/70">{c === 'NGN' ? '🇳🇬 Naira' : '🇹🇷 Lira'}</p>
              <p className="mt-1 truncate text-2xl font-extrabold">{me ? show(c) : '…'}</p>
              {c === 'TRY' && !hide && me?.fx && me.fx.boughtTry > 0 && <p className="truncate text-[10px] opacity-80">{`${money(me.fx.boughtTry, 'TRY')} spend-only`}</p>}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between">
        <span className="flex items-center gap-3"><button className="text-xs font-semibold text-mint-300" onClick={() => setOpen('fees')}>💳 Fees</button><Link to="/statements" className="text-xs font-semibold text-mint-300">📄 Statements</Link></span>
        <button className="text-xs text-slate-400" onClick={() => set((p) => ({ ...p, security: { ...p.security, hideBalances: !hide } }))}>{hide ? <><Eye size={12} className="inline" /> Show</> : <><EyeOff size={12} className="inline" /> Hide</>} balances</button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { k: 'deposit' as const, icon: <Plus />, label: 'Top up' },
            { k: 'withdraw' as const, icon: <ArrowUpRight />, label: 'Withdraw' },
            { k: 'convert' as const, icon: <ArrowLeftRight />, label: 'Convert' },
            { k: 'send' as const, icon: <Send />, label: 'Send' },
          ].map((a) => (
            <button key={a.k} disabled={!me || me.profile.frozen} onClick={() => setOpen(a.k)} className="glass flex flex-col items-center gap-1.5 rounded-2xl py-3 text-xs font-semibold">
              <span className="grid size-10 place-items-center rounded-xl bg-mint-400/15 text-mint-300">{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
        {me?.profile.moneyHoldUntil && new Date(me.profile.moneyHoldUntil) > new Date() && <p className="rounded-2xl bg-gold-400/10 p-3 text-sm text-gold-200">🔐 Your password was just reset, so withdrawals and sending are paused until {new Date(me.profile.moneyHoldUntil).toLocaleString()}. This protects you if someone else reset it. Not you? Contact Luda support now.</p>}
        {me?.profile.frozen && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-300">Your account is on hold. Contact Luda support.</p>}
        {me && !verified && (
          <button className="flex items-center gap-3 rounded-2xl border border-gold-400/40 bg-gold-400/10 p-3 text-start" onClick={() => setOpen('kyc')}>
            <ShieldCheck className="shrink-0 text-gold-300" /><span className="text-sm"><b>Verify your identity</b><br /><span className="text-xs text-slate-400">Needed to withdraw and send money. About 2 minutes with your passport or ID + a selfie.</span></span>
          </button>
        )}
        {!!me?.withdrawals.some((w) => w.status === 'processing') && (
          <p className="rounded-2xl bg-sky-400/10 p-3 text-xs text-sky-200">⏳ A withdrawal is on its way to your bank. It usually arrives within minutes.</p>
        )}
        <h2 className="mt-2 text-sm font-bold text-slate-300">Transactions</h2>
        {me && items.length === 0 && <p className="text-sm text-slate-500">No transactions yet. Top up to get started.</p>}
        <div className="flex flex-col divide-y divide-fg/5 rounded-2xl bg-fg/[0.03]">
          {items.map((it) => <Row key={it.key} it={it} onOpen={() => setDetail(it)} />)}
        </div>
      </div>
      {open === 'deposit' && <DepositSheet onClose={close} />}
      {open === 'withdraw' && <WithdrawSheet onClose={close} />}
      {open === 'convert' && <ConvertSheet onClose={close} />}
      {open === 'send' && <SendSheet onClose={close} />}
      {detail && <Details it={detail} onClose={() => setDetail(null)} />}
      {open === 'fees' && <FeesSheet onClose={close} />}
      {open === 'kyc' && <Sheet open onClose={close} title="Verify your identity"><LiveKyc onDone={close} /></Sheet>}
    </div>
  )
}

/* ------------------------------ transactions ------------------------------ */

type Status = 'success' | 'pending' | 'failed' | 'review' | 'refunded' | 'expired'
interface Item { key: string; at: string; title: string; sub: string; amountMinor: number; currency: string; status: Status; details: [string, string][]; reference?: string; note?: string }

const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–')

/** Everything that happened to the wallet: every top-up attempt (even failed), withdrawals with their status, and all other movements. */
function buildItems(me: Me): Item[] {
  const out: Item[] = []
  for (const d of me.deposits ?? []) {
    // A checkout left unpaid for over an hour is shown as "Not completed" (it's still re-checked for 2 days, just in case).
    const status: Status = d.status === 'paid' ? 'success' : d.status === 'failed' ? 'failed' : d.status === 'mismatch' ? 'review' : Date.now() - Date.parse(d.createdAt) > 3600e3 ? 'expired' : 'pending'
    out.push({
      key: 'dep' + d.reference, at: d.paidAt ?? d.createdAt, title: 'Top-up', sub: `You paid ${money(d.chargeMinor, d.currency)}`,
      amountMinor: d.creditMinor, currency: d.creditCurrency, status, reference: d.reference,
      note: status === 'pending' ? 'Waiting for the payment to be confirmed. If you paid, it is credited automatically. Tap ↻ at the top to check again.' : status === 'review' ? 'The amount paid didn\'t match. Our team will credit or refund you; share the reference with support.' : status === 'failed' ? 'This payment didn\'t go through. You were not charged.' : status === 'expired' ? 'This checkout was never completed. If money left your account, it will be credited automatically within 2 days, or contact support with the reference.' : undefined,
      details: [['Status', LABEL[status]], ['Reference', d.reference], ['Started', when(d.createdAt)], ['Completed', when(d.paidAt)], ['You paid', money(d.chargeMinor, d.currency)], ['Payment fee', money(d.feeMinor, d.currency)], [`Into your ${d.creditCurrency === 'TRY' ? 'Lira' : 'Naira'} wallet`, money(d.creditMinor, d.creditCurrency)]],
    })
  }
  for (const w of me.withdrawals ?? []) {
    const status: Status = w.status === 'paid' ? 'success' : w.status === 'processing' ? 'pending' : 'refunded'
    out.push({
      key: 'wdr' + w.reference, at: w.created_at, title: 'Withdrawal', sub: `${w.bank_name ?? 'Bank'} ${w.account_number}`, amountMinor: -(w.amount_minor + ((w.fee_currency ?? 'NGN') === 'NGN' ? w.fee_minor : 0)), currency: 'NGN', status, reference: w.reference,
      note: status === 'pending' ? 'On its way to your bank. Usually arrives within minutes.' : status === 'refunded' ? 'The bank transfer failed, so the amount and fee went back into your Naira wallet.' : undefined,
      details: [['Status', LABEL[status]], ['Reference', w.reference], ['Date', when(w.created_at)], ['To', w.account_name], ['Bank', `${w.bank_name ?? ''} ${w.account_number}`], ['Amount', money(w.amount_minor, 'NGN')], ['Luda fee', money(w.fee_minor, w.fee_currency ?? 'NGN')]],
    })
  }
  for (const h of me.history) {
    // shown above with their status (a lira withdrawal fee, and its refund, show here in the Lira wallet)
    if (['deposit', 'withdraw'].includes(h.kind) || (['withdraw_fee', 'withdraw_reversal'].includes(h.kind) && h.currency === 'NGN')) continue
    const m = h.meta ?? {}
    const sub = h.kind === 'send' ? `to @${m.to}` : h.kind === 'receive' ? `from @${m.from}` : h.kind === 'ticket' ? `${m.label ?? ''} · ${m.code ?? ''}` : h.kind === 'convert' ? (h.amount_minor < 0 ? `to ${m.to === 'TRY' ? 'Lira' : 'Naira'}` : `from ${m.from === 'TRY' ? 'Lira' : 'Naira'}`) : ''
    out.push({
      key: 'l' + h.id, at: h.at, title: (KIND_LABEL[h.kind] ?? h.kind) + (m.note ? ` · ${m.note}` : ''), sub, amountMinor: h.amount_minor, currency: h.currency, status: 'success', reference: h.ref,
      details: [['Status', LABEL.success], ['Reference', h.ref], ['Date', when(h.at)], ['Amount', money(h.amount_minor, h.currency, { sign: true })], ['Balance after', money(h.balance_after, h.currency)], ...(m.rate ? [['Rate', `₺1 = ₦${Number(m.rate).toFixed(2)}`] as [string, string]] : []), ...(m.note ? [['Note', String(m.note)] as [string, string]] : [])],
    })
  }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

const LABEL: Record<Status, string> = { success: 'Successful', pending: 'Pending', failed: 'Failed', review: 'Under review', refunded: 'Failed · refunded', expired: 'Not completed' }
const BADGE: Record<Status, string> = { success: 'bg-mint-400/15 text-mint-300', pending: 'bg-gold-400/15 text-gold-300', failed: 'bg-rose-500/15 text-rose-300', review: 'bg-gold-400/15 text-gold-300', refunded: 'bg-rose-500/15 text-rose-300', expired: 'bg-fg/10 text-slate-400' }

function Row({ it, onOpen }: { it: Item; onOpen: () => void }) {
  const done = it.status === 'success'
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-start">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${it.amountMinor > 0 ? 'bg-mint-400/15 text-mint-300' : 'bg-fg/5 text-slate-300'}`}>{it.amountMinor > 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{it.title}</p>
        <p className="truncate text-xs text-slate-500">{it.sub}{it.sub ? ' · ' : ''}{new Date(it.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`text-sm font-bold ${!done ? 'text-slate-400' : it.amountMinor > 0 ? 'text-mint-300' : ''} ${it.status === 'failed' || it.status === 'refunded' || it.status === 'expired' ? 'line-through' : ''}`}>{money(it.amountMinor, it.currency, { sign: true })}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE[it.status]}`}>{LABEL[it.status]}</span>
      </div>
    </button>
  )
}

function Details({ it, onClose }: { it: Item; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const [report, setReport] = useState(false)
  const { me } = useLive()
  const [rmsg, setRmsg] = useState('')
  const [fmt, setFmt] = useState<ReceiptFormat>('image')
  const receipt = async (how: 'share' | 'download') => {
    setRmsg('')
    const data = { title: it.title, amount: money(it.amountMinor, it.currency, { sign: true }), status: LABEL[it.status], positive: it.amountMinor > 0, rows: it.details.filter(([k]) => k !== 'Status'), name: me ? `${me.profile.fullName} (@${me.profile.username})` : undefined }
    try { if (how === 'download') { await downloadReceipt(data, fmt); setRmsg('Receipt saved to your downloads') } else if ((await shareReceipt(data, fmt)) === 'downloaded') setRmsg('Sharing isn’t supported here, so the receipt was downloaded') } catch (e) { setRmsg(e instanceof Error ? e.message : 'Could not create the receipt') }
  }
  return (
    <Sheet open onClose={onClose} title={it.title}>
      <div className="flex flex-col gap-3">
        <div className="text-center"><p className={`text-3xl font-extrabold ${it.amountMinor > 0 && it.status === 'success' ? 'text-mint-300' : ''}`}>{money(it.amountMinor, it.currency, { sign: true })}</p>
          <span className={`mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold ${BADGE[it.status]}`}>{LABEL[it.status]}</span></div>
        {it.note && <p className="rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-300">{it.note}</p>}
        <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
          {it.details.map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-4 py-2.5"><span className="shrink-0 text-slate-400">{k}</span><span className="selectable break-all text-end font-medium">{v}</span></div>)}
        </div>
        <div className="flex items-center justify-between gap-3"><span className="text-xs text-slate-400">Receipt as</span>
          <div className="flex rounded-xl bg-fg/[0.05] p-1 text-xs font-semibold">{(['image', 'pdf'] as const).map((f) => <button key={f} onClick={() => setFmt(f)} className={`rounded-lg px-4 py-1.5 ${fmt === f ? 'bg-fg/10 text-slate-100' : 'text-slate-400'}`}>{f === 'image' ? '🖼️ Image' : '📄 PDF'}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary py-3 text-sm" onClick={() => void receipt('share')}><Share2 size={16} /> Share receipt</button>
          <button className="btn-ghost py-3 text-sm" onClick={() => void receipt('download')}><Download size={16} /> Download</button>
        </div>
        {rmsg && <p className="text-center text-xs text-slate-400">{rmsg}</p>}
        {it.reference && <button className="btn-ghost text-sm" onClick={() => { navigator.clipboard?.writeText(it.reference!).then(() => setCopied(true)).catch(() => {}) }}>{copied ? '✓ Reference copied' : 'Copy reference'}</button>}
        <button className="btn-ghost text-sm text-gold-200" onClick={() => setReport(true)}>Report a problem with this</button>
        {report && <NewCaseSheet category={it.title === 'Withdrawal' ? 'withdrawal' : 'payment'} reference={it.reference} subject={`Problem with ${it.title.toLowerCase()}`} onClose={() => setReport(false)} />}
      </div>
    </Sheet>
  )
}
