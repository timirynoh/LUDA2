// Live Exchange tab: real Naira ⇄ Lira conversion from the wallet at today's rate.
// Person-to-person (P2P) cash exchange is not on real money yet (it needs real escrow + dispute handling).
import { ArrowLeftRight, Info, RefreshCw, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConvertSheet, errMsg } from '../components/LiveMoney'
import { Header } from '../components/ui'
import { api, money, type Cur } from '../lib/live'
import { useLive } from '../lib/liveStore'

export default function LiveExchange() {
  const { me } = useLive()
  const [rate, setRate] = useState<{ ngnPerTry: number; margin: number } | null>(null)
  const [err, setErr] = useState('')
  const [from, setFrom] = useState<Cur | null>(null)
  const load = useCallback(() => { api('GET', 'rate').then((r) => { setRate(r); setErr('') }).catch((e) => setErr(errMsg(e))) }, [])
  useEffect(() => { load() }, [load])
  const buyTry = rate ? rate.ngnPerTry / (1 - rate.margin) : 0 // ₦ you give for ₺1
  const sellTry = rate ? rate.ngnPerTry * (1 - rate.margin) : 0 // ₦ you get for ₺1
  return (
    <div className="pb-6">
      <Header back title="Exchange" sub="Naira ⇄ Lira, instantly in your wallet" right={<button className="glass grid size-10 place-items-center rounded-2xl" aria-label="Refresh rate" onClick={load}><RefreshCw size={18} /></button>} />
      <div className="flex flex-col gap-3 px-5">
        <div className="rounded-[2rem] bg-gradient-to-br from-emerald-500 via-emerald-700 to-emerald-950 p-5 text-white">
          <p className="text-sm text-emerald-100/80">Today's Luda rate</p>
          {rate ? <>
            <p className="mt-1 text-3xl font-extrabold">₺1 = ₦{rate.ngnPerTry.toFixed(2)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-black/20 p-2"><p className="text-emerald-100/70">You buy ₺1 for</p><p className="text-base font-bold">₦{buyTry.toFixed(2)}</p></div>
              <div className="rounded-xl bg-black/20 p-2"><p className="text-emerald-100/70">You sell ₺1 for</p><p className="text-base font-bold">₦{sellTry.toFixed(2)}</p></div>
            </div>
            <p className="mt-2 text-[11px] text-emerald-100/70">Includes Luda's {(rate.margin * 100).toFixed(1)}% fee. You see the exact amount before you confirm.</p>
          </> : <p className="mt-2 text-sm">{err || 'Loading…'}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(['NGN', 'TRY'] as Cur[]).map((c) => (
            <button key={c} disabled={!me || !rate} onClick={() => setFrom(c)} className="glass flex flex-col items-start gap-1 rounded-3xl p-4 text-start">
              <span className="text-xs text-slate-400">{c === 'NGN' ? '🇳🇬 Naira' : '🇹🇷 Lira'} · {me ? money(me.balances[c], c) : '…'}</span>
              <span className="flex items-center gap-1 text-base font-bold"><ArrowLeftRight size={16} /> {c === 'NGN' ? '₦ → ₺' : '₺ → ₦'}</span>
              <span className="text-[11px] text-slate-500">{c === 'NGN' ? 'Get Lira for tickets & life in Cyprus' : 'Back to Naira'}</span>
            </button>
          ))}
        </div>
        <Link to="/wallet?a=deposit" className="btn-ghost text-sm">Top up first</Link>
        <div className="flex items-start gap-3 rounded-2xl bg-fg/[0.04] p-3 text-sm text-slate-300">
          <Users size={18} className="mt-0.5 shrink-0 text-violet-300" />
          <div><p className="font-semibold">Person-to-person cash exchange</p><p className="text-xs text-slate-400">Swapping cash with another student (SafeSwap) is coming later. It needs protected escrow and a dispute team for real money. For now, convert instantly above.</p></div>
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500"><Info size={12} className="mt-0.5 shrink-0" /> Rates follow the live market and can change a little during the day.</p>
      </div>
      {from && <ConvertSheet initialFrom={from} onClose={() => setFrom(null)} />}
    </div>
  )
}
