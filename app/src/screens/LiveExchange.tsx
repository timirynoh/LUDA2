// Live Exchange tab: Instant (Naira ⇄ Lira from the wallet at Luda's rate) and P2P (Naira held by Luda ⇄ lira sent
// bank-to-bank or in cash by another verified student, Bybit-style).
import { ArrowLeftRight, Info, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConvertSheet, errMsg } from '../components/LiveMoney'
import { Header } from '../components/ui'
import { P2PMarket } from './LiveP2P'
import { api, money, type Cur } from '../lib/live'
import { useLive } from '../lib/liveStore'

export default function LiveExchange() {
  const { me } = useLive()
  const [rate, setRate] = useState<{ ngnPerTry: number; margin: number } | null>(null)
  const [err, setErr] = useState('')
  const [from, setFrom] = useState<Cur | null>(null)
  const [tab, setTab] = useState<'instant' | 'p2p'>(() => (new URLSearchParams(window.location.search).get('tab') === 'p2p' ? 'p2p' : 'instant'))
  const load = useCallback(() => { api('GET', 'rate').then((r) => { setRate(r); setErr('') }).catch((e) => setErr(errMsg(e))) }, [])
  useEffect(() => { load() }, [load])
  const buyTry = rate ? rate.ngnPerTry / (1 - rate.margin) : 0 // ₦ you give for ₺1
  const sellTry = rate ? rate.ngnPerTry * (1 - rate.margin) : 0 // ₦ you get for ₺1
  return (
    <div className="pb-6">
      <Header back title="Exchange" sub={tab === 'p2p' ? 'Trade with verified students · Luda holds the Naira' : 'Naira ⇄ Lira, instantly in your wallet'} right={<button className="glass grid size-10 place-items-center rounded-2xl" aria-label="Refresh rate" onClick={load}><RefreshCw size={18} /></button>} />
      <div className="flex flex-col gap-3 px-5">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-fg/[0.05] p-1">
          {([['instant', '⚡ Instant'], ['p2p', '🤝 P2P']] as const).map(([v, l]) => <button key={v} onClick={() => setTab(v)} className={`rounded-xl py-2.5 text-sm font-bold transition ${tab === v ? 'bg-fg/10 text-slate-100' : 'text-slate-400'}`}>{l}</button>)}
        </div>
        {tab === 'p2p' ? <P2PMarket /> : <>
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
        <button onClick={() => setTab('p2p')} className="flex items-center gap-3 rounded-2xl bg-fg/[0.04] p-3 text-start text-sm text-slate-300">
          <span className="text-xl">🤝</span><span><b>Need lira in your Turkish bank account?</b><br /><span className="text-xs text-slate-400">Use P2P: a verified student sends it to your IBAN while Luda holds your Naira.</span></span>
        </button>
        <p className="flex items-start gap-1.5 text-[11px] text-slate-500"><Info size={12} className="mt-0.5 shrink-0" /> Rates follow the live market and can change a little during the day.</p>
        </>}
      </div>
      {from && <ConvertSheet initialFrom={from} onClose={() => setFrom(null)} />}
    </div>
  )
}
