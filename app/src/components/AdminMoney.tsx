// Luda HQ → Money report (v1.21.0, owner's pick): each day's money in and out, fees earned, money held right now, and
// checks that the payment providers' records match Luda's ledger. Admin is English-only (owner's rule).
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, money, type Cur } from '../lib/live'
import { errMsg } from './LiveMoney'

type Amt = { cur: string; amount: number; n?: number }
interface Day { day: string; topups: (Amt & { provider: string })[]; withdrawals: (Amt & { status: string })[]; fees: { withdraw: Amt[]; escrow: (Amt & { kind: string })[] }; escrowReleased: (Amt & { kind: string })[]; conversions: Amt[]; tickets: Amt[] }
interface Report {
  days: Day[]
  now: { wallets: Record<string, number>; held: (Amt & { kind: string })[]; withdrawalsProcessing: Amt[]; ledgerVsWallets: { cur: string; ledger: number; wallets: number }[] }
  checks: { paidNotCredited: { ref: string; provider: string; amount: number; cur: string; paidAt: string }[]; creditedNotPaid: { ref: string; amount: number; cur: string; at: string }[]; mismatches: number; stuckWithdrawals: number }
  paystack: { volume: number; count: number } | null
}

const m = (a: number, c: string) => money(Number(a), (c || 'NGN') as Cur)
const sum = (xs: Amt[]) => {
  const t: Record<string, number> = {}
  for (const x of xs) t[x.cur] = (t[x.cur] ?? 0) + Number(x.amount)
  return Object.entries(t)
}
const Sums = ({ xs, empty = '–' }: { xs: Amt[]; empty?: string }) => {
  const s = sum(xs)
  return s.length ? <>{s.map(([c, a], i) => <span key={c}>{i ? ' · ' : ''}{m(a, c)}</span>)}</> : <span className="text-slate-600">{empty}</span>
}

export function MoneyTab() {
  const [days, setDays] = useState(7)
  const [r, setR] = useState<Report | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => { try { setR(await api<Report>('GET', `admin-money?days=${days}`)); setErr('') } catch (e) { setErr(errMsg(e)) } }, [days])
  useEffect(() => { void load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect
  if (err) return <p className="text-sm text-rose-300">{err}</p>
  if (!r) return <Loader2 className="mx-auto animate-spin text-slate-500" />
  const problems = r.checks.paidNotCredited.length + r.checks.creditedNotPaid.length + r.checks.mismatches + r.checks.stuckWithdrawals + r.now.ledgerVsWallets.length
  const all = (k: 'topups' | 'conversions' | 'tickets') => r.days.flatMap((d) => d[k])
  const paidOut = r.days.flatMap((d) => d.withdrawals.filter((w) => w.status === 'paid'))
  const fees = r.days.flatMap((d) => [...d.fees.withdraw, ...d.fees.escrow])
  const psLuda = r.days.flatMap((d) => d.topups.filter((t) => t.provider === 'paystack' && t.cur === 'NGN')).reduce((n, t) => n + Number(t.amount), 0)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">{[7, 14, 30].map((d) => <button key={d} onClick={() => setDays(d)} className={`chip px-3 py-2 text-xs ${days === d ? 'bg-mint-400 text-ink-950' : 'glass text-slate-300'}`}>{d} days</button>)}</div>

      <div className={`card flex items-start gap-3 py-3 ${problems ? 'ring-1 ring-rose-400/50' : ''}`}>
        {problems ? <AlertTriangle className="shrink-0 text-rose-300" /> : <CheckCircle2 className="shrink-0 text-mint-300" />}
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">{problems ? `${problems} thing${problems === 1 ? '' : 's'} to check` : 'Everything adds up'}</p>
          <p className="text-xs text-slate-400">Provider payments vs wallet credits, ledger vs wallets, stuck payouts.</p>
          {r.checks.paidNotCredited.map((x) => <p key={x.ref} className="mt-1 text-xs text-rose-200">Paid at {x.provider} but not credited: {m(x.amount, x.cur)} · <span className="font-mono">{x.ref}</span> (use Top-ups → Re-check)</p>)}
          {r.checks.creditedNotPaid.map((x) => <p key={x.ref} className="mt-1 text-xs text-rose-200">Credited without a confirmed payment: {m(x.amount, x.cur)} · <span className="font-mono">{x.ref}</span></p>)}
          {r.checks.mismatches > 0 && <p className="mt-1 text-xs text-gold-200">{r.checks.mismatches} top-up(s) under review (amount didn’t match)</p>}
          {r.checks.stuckWithdrawals > 0 && <p className="mt-1 text-xs text-gold-200">{r.checks.stuckWithdrawals} payout(s) processing for over an hour</p>}
          {r.now.ledgerVsWallets.map((x) => <p key={x.cur} className="mt-1 text-xs text-rose-200">{x.cur}: ledger {m(x.ledger, x.cur)} ≠ wallets {m(x.wallets, x.cur)}</p>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="card py-3"><p className="text-xs text-slate-400">Money in (top-ups)</p><p className="mt-1 text-sm font-bold"><Sums xs={all('topups')} /></p></div>
        <div className="card py-3"><p className="text-xs text-slate-400">Paid out (withdrawals)</p><p className="mt-1 text-sm font-bold"><Sums xs={paidOut} /></p></div>
        <div className="card py-3"><p className="text-xs text-slate-400">Fees earned</p><p className="mt-1 text-sm font-bold text-mint-300"><Sums xs={fees} /></p><p className="text-[10px] text-slate-500">withdrawal, bills, Market, Flash, P2P (FX margin not included)</p></div>
        <div className="card py-3"><p className="text-xs text-slate-400">Bus tickets sold</p><p className="mt-1 text-sm font-bold"><Sums xs={all('tickets')} /></p></div>
      </div>

      <div className="card py-3 text-sm">
        <p className="font-semibold">Right now</p>
        <p className="mt-1 text-xs text-slate-400">In users’ wallets: {Object.entries(r.now.wallets).map(([c, a], i) => <span key={c}>{i ? ' · ' : ''}{m(a, c)}</span>)}</p>
        <p className="text-xs text-slate-400">Held in escrow: <Sums xs={r.now.held} empty="nothing" /> {r.now.held.length > 0 && <span>({r.now.held.map((h) => `${h.kind} ${h.n}`).join(', ')})</span>}</p>
        <p className="text-xs text-slate-400">Payouts processing: <Sums xs={r.now.withdrawalsProcessing} empty="none" /></p>
        <p className="mt-1 text-xs text-slate-400">Paystack says (successful charges, these days): {r.paystack ? `₦${(r.paystack.volume / 100).toLocaleString('en-US')} in ${r.paystack.count} payments` : 'not available'} · Luda credited via Paystack: {m(psLuda, 'NGN')}</p>
      </div>

      <p className="label mt-1">Day by day</p>
      {r.days.map((d) => (
        <div key={d.day} className="card py-3 text-xs">
          <p className="mb-1 text-sm font-semibold">{new Date(`${d.day}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          <p className="text-slate-400">Top-ups: <span className="text-slate-200"><Sums xs={d.topups} /></span>{d.topups.length > 0 && ` (${d.topups.reduce((n, t) => n + Number(t.n ?? 0), 0)})`}</p>
          <p className="text-slate-400">Withdrawals: {d.withdrawals.length ? d.withdrawals.map((w, i) => <span key={i} className="text-slate-200">{i ? ' · ' : ''}{m(w.amount, w.cur)} {w.status}</span>) : <span className="text-slate-600">–</span>}</p>
          <p className="text-slate-400">Fees: <span className="text-mint-300"><Sums xs={[...d.fees.withdraw, ...d.fees.escrow]} /></span></p>
          <p className="text-slate-400">Conversions (paid in): <span className="text-slate-200"><Sums xs={d.conversions} /></span> · Tickets: <span className="text-slate-200"><Sums xs={d.tickets} /></span></p>
          {d.escrowReleased.length > 0 && <p className="text-slate-400">Released: {d.escrowReleased.map((e, i) => <span key={i} className="text-slate-200">{i ? ' · ' : ''}{e.kind} {m(e.amount, e.cur)}</span>)}</p>}
        </div>
      ))}
    </div>
  )
}
