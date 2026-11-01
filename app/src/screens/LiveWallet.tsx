// Live (real-money) wallet: Naira + Lira balances held on the Luda server.
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Eye, EyeOff, Plus, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { ConvertSheet, DepositSheet, LiveKyc, SendSheet, WithdrawSheet } from '../components/LiveMoney'
import { Header, Sheet } from '../components/ui'
import { KIND_LABEL, money, type Cur, type LedgerRow } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { useStore } from '../lib/store'

type Open = null | 'deposit' | 'withdraw' | 'convert' | 'send' | 'kyc'

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
  const show = (c: Cur) => (hide ? (c === 'NGN' ? '₦ ••••' : '₺ ••••') : money(me?.balances[c] ?? 0, c))

  return (
    <div className="pb-6">
      <Header back title="Wallet" sub="Real money · protected by your PIN" right={
        <button className="glass grid size-10 place-items-center rounded-2xl" aria-label="Refresh" onClick={() => refresh()}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>} />
      <div className="flex flex-col gap-3 px-5">
        {error && !me && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          {(['NGN', 'TRY'] as Cur[]).map((c) => (
            <div key={c} className={`rounded-3xl p-4 text-white ${c === 'NGN' ? 'bg-gradient-to-br from-emerald-500 to-emerald-900' : 'bg-gradient-to-br from-rose-500 to-rose-900'}`}>
              <p className="text-xs text-white/70">{c === 'NGN' ? '🇳🇬 Naira' : '🇹🇷 Lira'}</p>
              <p className="mt-1 truncate text-2xl font-extrabold">{me ? show(c) : '…'}</p>
            </div>
          ))}
        </div>
        <button className="self-end text-xs text-slate-400" onClick={() => set((p) => ({ ...p, security: { ...p.security, hideBalances: !hide } }))}>{hide ? <><Eye size={12} className="inline" /> Show</> : <><EyeOff size={12} className="inline" /> Hide</>} balances</button>
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
        {me?.profile.frozen && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-300">Your account is on hold. Contact Luda support.</p>}
        {me && !verified && (
          <button className="flex items-center gap-3 rounded-2xl border border-gold-400/40 bg-gold-400/10 p-3 text-start" onClick={() => setOpen('kyc')}>
            <ShieldCheck className="shrink-0 text-gold-300" /><span className="text-sm"><b>Verify your identity</b><br /><span className="text-xs text-slate-400">Needed to withdraw and send money. Takes 1 minute with your NIN or BVN.</span></span>
          </button>
        )}
        {!!me?.withdrawals.some((w) => w.status === 'processing') && (
          <p className="rounded-2xl bg-sky-400/10 p-3 text-xs text-sky-200">⏳ A withdrawal is on its way to your bank. It usually arrives within minutes.</p>
        )}
        <h2 className="mt-2 text-sm font-bold text-slate-300">History</h2>
        {me && me.history.length === 0 && <p className="text-sm text-slate-500">No transactions yet. Top up to get started.</p>}
        <div className="flex flex-col divide-y divide-fg/5 rounded-2xl bg-fg/[0.03]">
          {me?.history.map((h) => <Row key={h.id} h={h} />)}
        </div>
      </div>
      {open === 'deposit' && <DepositSheet onClose={close} />}
      {open === 'withdraw' && <WithdrawSheet onClose={close} />}
      {open === 'convert' && <ConvertSheet onClose={close} />}
      {open === 'send' && <SendSheet onClose={close} />}
      {open === 'kyc' && <Sheet open onClose={close} title="Verify your identity"><LiveKyc onDone={close} /></Sheet>}
    </div>
  )
}

function Row({ h }: { h: LedgerRow }) {
  const m = h.meta ?? {}
  const sub = h.kind === 'send' ? `to @${m.to}` : h.kind === 'receive' ? `from @${m.from}` : h.kind === 'ticket' ? `${m.label ?? ''} · ${m.code ?? ''}` : h.kind === 'withdraw' ? `${m.bank ?? 'Bank'} ••${m.account ?? ''}` : h.kind === 'deposit' ? `via ${m.provider === 'flutterwave' ? 'Flutterwave' : 'Paystack'}${m.charged_currency && m.charged_currency !== h.currency ? ` · paid ${money(Number(m.charged), m.charged_currency)}` : ''}` : ''
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${h.amount_minor > 0 ? 'bg-mint-400/15 text-mint-300' : 'bg-fg/5 text-slate-300'}`}>{h.amount_minor > 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{KIND_LABEL[h.kind] ?? h.kind}{m.note ? ` · ${m.note}` : ''}</p><p className="truncate text-xs text-slate-500">{sub}{sub ? ' · ' : ''}{new Date(h.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p></div>
      <span className={`text-sm font-bold ${h.amount_minor > 0 ? 'text-mint-300' : ''}`}>{money(h.amount_minor, h.currency, { sign: true })}</span>
    </div>
  )
}
