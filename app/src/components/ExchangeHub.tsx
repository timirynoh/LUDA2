import { motion } from 'framer-motion'
import { BadgeCheck, Check, ChevronRight, Lock, Pause, Play, Plus, ShieldCheck, Store, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { COUNTRIES, CURRENCIES, SAFE_SPOTS } from '../lib/data'
import { AD_LIMITS as LIMITS, EXCHANGER_BOND, PAY_METHODS, type Ad, type AdMode } from '../lib/exchanger'
import { convert, fmt, useRates } from '../lib/fx'
import { uid, useStore } from '../lib/store'
import { Segmented, Sheet } from './ui'
import { ConfirmSheet, CrossCheck } from './Confirm'

/** Exchange tab inside Chats: your trades, your ads, and becoming a verified exchanger. */
export function ExchangeHub() {
  const { s, set, gate, toast } = useStore()
  const [apply, setApply] = useState(false)
  const [creating, setCreating] = useState(false)
  const live = s.trades.filter((x) => ['escrow', 'meeting', 'disputed'].includes(x.status))
  const ex = s.exchanger
  const lim = ex.status === 'approved' ? LIMITS.exchanger : LIMITS.member
  const activeAds = s.ads.filter((a) => a.active).length

  const closeExchanger = () => {
    if (s.ads.some((a) => a.active)) return toast({ title: 'Pause or delete your active ads first', emoji: '⏸️' })
    const refund = (ex.bond ?? 0) + s.ads.reduce((a, x) => a + x.locked, 0)
    set((p) => ({ ...p, exchanger: { status: 'none' }, ads: [], balances: { ...p.balances, TRY: (p.balances.TRY ?? 0) + refund } }))
    toast({ title: `Exchanger account closed. ${fmt(refund, 'TRY')} returned`, emoji: '↩️' })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-fuchsia-500 via-purple-700 to-indigo-950 p-5 text-white">
        <p className="text-xl font-extrabold">💱 Exchange with people you can trust</p>
        <p className="mt-1 text-sm text-white/80">Naira, Cedi, CFA ⇄ Lira with verified traders. Every trade has escrow, private chat and appeals.</p>
        <Link to="/exchange?tab=p2p" className="btn mt-3 bg-white px-4 py-2 text-sm text-ink-950">Browse offers <ChevronRight size={16} className="rtl:rotate-180" /></Link>
      </div>
      <CrossCheck />

      {live.length > 0 && (
        <section>
          <p className="label mb-2">Your active trades</p>
          {live.map((t) => (
            <Link key={t.id} to="/exchange?tab=p2p" className="card mb-2 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-fuchsia-500/20 text-lg">{t.traderFlag}</span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{t.trader} · {fmt(t.get, 'TRY')}</p>
                <p className="truncate text-xs text-slate-400">{(s.threads[`trade-${t.id}`] ?? []).slice(-1)[0]?.text || 'Tap to open chat'}</p></div>
              <span className={`chip ${t.status === 'disputed' ? 'bg-rose-500/15 text-rose-300' : 'bg-mint-400/15 text-mint-300'}`}>{t.status === 'disputed' ? 'Appeal' : 'Chat'}</span>
            </Link>
          ))}
        </section>
      )}

      {/* Anyone who is KYC-verified can post ads. Verified Exchangers get higher limits and a badge. */}
      <section className="card">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-gold-400/15 text-2xl">{ex.status === 'approved' ? '🏪' : '💱'}</div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 font-bold">{ex.status === 'approved' ? ex.displayName : 'My exchange ads'}{ex.status === 'approved' && <BadgeCheck size={16} className="text-gold-300" />}</p>
            <p className="text-xs text-slate-400">{ex.status === 'approved' ? `Verified exchanger · up to ${LIMITS.exchanger.ads} ads · ${fmt(LIMITS.exchanger.total, 'TRY')} each` : `Verified users: ${LIMITS.member.ads} ad up to ${fmt(LIMITS.member.total, 'TRY')}`}</p>
          </div>
          <button className="btn-primary shrink-0 px-3 py-2 text-sm" onClick={() => { if (!gate(2, 'Post an exchange ad')) return; if (activeAds >= lim.ads) { toast({ title: `Limit reached: ${lim.ads} active ad${lim.ads > 1 ? 's' : ''}.${ex.status !== 'approved' ? ' Become a Verified Exchanger for more.' : ''}`, emoji: '⏸️' }); return } setCreating(true) }}><Plus size={16} /> Post ad</button>
        </div>
        {s.ads.length > 0 && <><p className="label mt-4 mb-2">My ads</p>{s.ads.map((a) => <AdRow key={a.id} a={a} />)}</>}
        {!s.ads.length && <p className="mt-3 text-sm text-slate-400">Have Lira or Naira to exchange? Post an ad. You must be KYC-verified, and every trade goes through escrow.</p>}
        {ex.status === 'approved' && <button className="mt-3 text-xs text-slate-500 underline" onClick={closeExchanger}>Close exchanger account & get deposit back</button>}
      </section>

      {ex.status === 'none' && (
        <div className="card">
          <p className="flex items-center gap-2 font-bold"><Store size={18} className="text-gold-300" /> Upgrade: Verified Exchanger</p>
          <p className="mt-1 text-sm text-slate-400">Exchange a lot? Get the 🏪 badge, {LIMITS.exchanger.ads} ads, bigger amounts and top placement in offers.</p>
          <ul className="mt-2 grid gap-1 text-xs text-slate-300">
            <li>✓ KYC verified · ✓ Phone verified</li><li>✓ Refundable safety deposit of {fmt(EXCHANGER_BOND, 'TRY')} (protects buyers)</li><li>✓ Agree to fair-rate & no-scam rules</li>
          </ul>
          <button className="btn-gold mt-3 w-full py-3" onClick={() => gate(2, 'Become an exchanger') && setApply(true)}>Apply</button>
        </div>
      )}
      {ex.status === 'pending' && <div className="card flex items-center gap-3 border-sky-400/30 bg-sky-400/10"><ShieldCheck className="animate-pulse text-sky-300" /><div><p className="font-semibold">Exchanger application under review</p><p className="text-xs text-slate-400">Usually a few minutes. We'll notify you.</p></div></div>}
      {apply && <ApplySheet onClose={() => setApply(false)} />}
      {creating && <CreateAd onClose={() => setCreating(false)} />}
    </div>
  )
}

function AdRow({ a }: { a: Ad }) {
  const { set } = useStore()
  const toggle = () => set((p) => ({ ...p, ads: p.ads.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x)) }))
  const del = () => set((p) => ({ ...p, ads: p.ads.filter((x) => x.id !== a.id), balances: { ...p.balances, TRY: (p.balances.TRY ?? 0) + a.locked } }))
  return (
    <div className="mb-2 rounded-2xl bg-fg/[0.03] p-3">
      <div className="flex items-center gap-2">
        <span className={`chip ${a.side === 'sell' ? 'bg-mint-400/15 text-mint-300' : 'bg-sky-400/15 text-sky-300'}`}>{a.side === 'sell' ? 'Selling ₺' : 'Buying ₺'}</span>
        <span className="text-sm font-bold">{fmt(a.rate * 1000, a.cur)} / ₺1k</span>
        <span className={`ms-auto chip ${a.active ? 'bg-mint-400/15 text-mint-300' : 'bg-fg/10 text-slate-400'}`}>{a.active ? '● Live' : 'Paused'}</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">₺{a.min.toLocaleString()}–{a.max.toLocaleString()} · {fmt(a.total, 'TRY')} total · {a.mode === 'cash' ? 'Cash in person' : 'In-app'}{a.locked ? ` · 🔒 ${fmt(a.locked, 'TRY')} in escrow` : ''}</p>
      <div className="mt-2 flex gap-2">
        <button className="chip bg-fg/5 py-1.5 text-slate-300" onClick={toggle}>{a.active ? <><Pause size={12} /> Pause</> : <><Play size={12} /> Resume</>}</button>
        <button className="chip bg-rose-500/10 py-1.5 text-rose-300" onClick={del}><Trash2 size={12} /> Delete{a.locked ? ' & unlock' : ''}</button>
      </div>
    </div>
  )
}

function ApplySheet({ onClose }: { onClose: () => void }) {
  const { s, set, addTx, notify } = useStore()
  const home = COUNTRIES.find((c) => c.code === s.country)!
  const [name, setName] = useState(`${s.name}'s Exchange`)
  const [curs, setCurs] = useState<string[]>([home.currency === 'USD' ? 'NGN' : home.currency])
  const [agree, setAgree] = useState(false)
  const [ask, setAsk] = useState(false)
  const bal = s.balances.TRY ?? 0
  const checks: [string, boolean][] = [['KYC verified', s.kyc.status === 'verified'], ['Phone verified', s.phoneVerified], [`${fmt(EXCHANGER_BOND, 'TRY')} in your Lira wallet for the deposit`, bal >= EXCHANGER_BOND]]
  const ok = checks.every(([, v]) => v) && agree && name.trim().length >= 3 && curs.length > 0
  const submit = () => {
    set((p) => ({ ...p, exchanger: { status: 'pending', displayName: name.trim(), bond: EXCHANGER_BOND, appliedAt: Date.now() }, balances: { ...p.balances, TRY: (p.balances.TRY ?? 0) - EXCHANGER_BOND } }))
    addTx({ type: 'p2p', amount: -EXCHANGER_BOND, currency: 'TRY', label: 'Exchanger safety deposit (refundable)' })
    notify('🏪', 'Exchanger application submitted')
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Become an exchanger">
      <div className="flex flex-col gap-3">
        {checks.map(([l, v]) => <p key={l} className={`flex items-center gap-2 text-sm ${v ? 'text-mint-300' : 'text-rose-300'}`}>{v ? <Check size={16} /> : <Lock size={14} />} {l}</p>)}
        {bal < EXCHANGER_BOND && <Link to="/wallet?a=deposit" onClick={onClose} className="btn-ghost py-2.5 text-sm">Top up wallet</Link>}
        <input className="input" placeholder="Exchange display name" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
        <div><p className="label mb-2">Currencies you exchange</p>
          <div className="flex flex-wrap gap-2">{Object.keys(CURRENCIES).filter((c) => c !== 'TRY').map((c) => (
            <button key={c} onClick={() => setCurs(curs.includes(c) ? curs.filter((x) => x !== c) : [...curs, c])} className={`chip py-1.5 ${curs.includes(c) ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{CURRENCIES[c].flag} {c}</button>
          ))}</div></div>
        <label className="flex items-start gap-2 rounded-2xl bg-fg/[0.03] p-3 text-xs text-slate-300"><input type="checkbox" className="mt-0.5 size-4 accent-emerald-500" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          I'll honour my posted rates, only trade through Luda escrow, meet at Safe Spots, and accept that scams lose the deposit and the account.</label>
        <button className="btn-gold py-4" disabled={!ok} onClick={() => setAsk(true)}>Pay {fmt(EXCHANGER_BOND, 'TRY')} deposit & apply</button>
        {ask && <ConfirmSheet title="Confirm your application" confirmLabel={`Pay ${fmt(EXCHANGER_BOND, 'TRY')} deposit`} onClose={() => setAsk(false)} onConfirm={() => { setAsk(false); submit() }}
          summary={[['Exchange name', name], ['Safety deposit (refundable)', fmt(EXCHANGER_BOND, 'TRY')], ['Currencies', curs.join(', ')]]}
          checks={['I will honour the rates I post', 'I will only trade through Luda escrow and meet at Safe Spots', 'I understand scams lose the deposit and the account']} />}
        <p className="text-center text-[11px] text-slate-500">The deposit is fully refundable when you close your exchanger account.</p>
      </div>
    </Sheet>
  )
}

function CreateAd({ onClose }: { onClose: () => void }) {
  const { s, set, toast, allow } = useStore()
  const { rates } = useRates()
  const home = COUNTRIES.find((c) => c.code === s.country)!
  const hc = home.currency === 'USD' || home.currency === 'TRY' ? 'NGN' : home.currency
  const market = convert(rates, 1, 'TRY', hc)
  const spots = SAFE_SPOTS[s.city] ?? SAFE_SPOTS.lefkosa
  const [ask, setAsk] = useState(false)
  const [f, setF] = useState({ side: 'sell' as Ad['side'], rate: (market * 1000).toFixed(0), total: '5000', min: '500', max: '2000', mode: 'cash' as AdMode, spot: spots[0], methods: ['Cash in person', 'Bank transfer (home country)'] })
  const rate = (+f.rate || 0) / 1000
  const diff = market ? ((rate - market) / market) * 100 : 0
  const lockNeeded = f.mode === 'inapp' && f.side === 'sell' ? +f.total || 0 : 0
  const capTotal = (s.exchanger.status === 'approved' ? LIMITS.exchanger : LIMITS.member).total
  const valid = rate > 0 && +f.min > 0 && +f.max >= +f.min && +f.total >= +f.max && +f.total <= capTotal && Math.abs(diff) <= 15 && (s.balances.TRY ?? 0) >= lockNeeded
  const publish = () => {
    if (!allow('ad')) return
    const ad: Ad = { id: uid(), side: f.side, cur: hc, rate, min: +f.min, max: +f.max, total: +f.total, mode: f.mode, spot: f.spot, methods: f.methods, active: true, createdAt: Date.now(), trades: 0, locked: lockNeeded }
    set((p) => ({ ...p, ads: [ad, ...p.ads], balances: { ...p.balances, TRY: (p.balances.TRY ?? 0) - lockNeeded } }))
    toast({ title: 'Your ad is live 💱', emoji: '✅' }); onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Create exchange ad">
      <div className="flex flex-col gap-3">
        <Segmented value={f.side} onChange={(v) => setF({ ...f, side: v })} options={[{ value: 'sell', label: `I sell ₺ for ${hc}` }, { value: 'buy', label: `I buy ₺ with ${hc}` }]} />
        <div>
          <p className="label mb-1">Your rate ({hc} per ₺1,000)</p>
          <input className="input text-lg font-bold" inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^\d.]/g, '') })} />
          <p className={`mt-1 text-xs ${Math.abs(diff) > 15 ? 'text-rose-300' : 'text-slate-400'}`}>Market: {fmt(market * 1000, hc)} · yours is {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%{Math.abs(diff) > 15 ? '. Rates more than 15% from market aren’t allowed (fair-rate rule)' : ''}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(['total', 'min', 'max'] as const).map((k) => <label key={k} className="grid gap-1 text-xs text-slate-400">{k === 'total' ? 'Total ₺' : k === 'min' ? 'Min ₺' : 'Max ₺'}<input className="input py-2.5" inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value.replace(/\D/g, '') })} /></label>)}
        </div>
        {+f.total > capTotal && <p className="text-xs text-rose-300">Max {fmt(capTotal, 'TRY')} per ad{s.exchanger.status !== 'approved' ? '. Become a Verified Exchanger for bigger ads' : ''}.</p>}
        <Segmented value={f.mode} onChange={(v) => setF({ ...f, mode: v })} options={[{ value: 'cash', label: '💵 Cash in person' }, { value: 'inapp', label: '📲 In-app (escrow)' }]} />
        {f.mode === 'inapp' && f.side === 'sell' && <p className="rounded-2xl bg-fuchsia-500/10 p-3 text-xs text-fuchsia-100">🔒 {fmt(lockNeeded, 'TRY')} will be locked in escrow from your wallet, so buyers know the money is really there. Unlocked when you delete the ad.{(s.balances.TRY ?? 0) < lockNeeded ? ' Not enough balance.' : ''}</p>}
        {f.mode === 'cash' && <select className="input" value={f.spot} onChange={(e) => setF({ ...f, spot: e.target.value })}>{spots.map((x) => <option key={x}>{x}</option>)}</select>}
        <div className="flex flex-wrap gap-2">{PAY_METHODS.map((m) => (
          <button key={m} onClick={() => setF({ ...f, methods: f.methods.includes(m) ? f.methods.filter((x) => x !== m) : [...f.methods, m] })} className={`chip py-1.5 ${f.methods.includes(m) ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{m}</button>
        ))}</div>
        <motion.button whileTap={{ scale: 0.97 }} className="btn-primary py-4" disabled={!valid} onClick={() => setAsk(true)}>Publish ad</motion.button>
        {ask && <ConfirmSheet title="Check your ad" confirmLabel="Publish ad" onClose={() => setAsk(false)} onConfirm={() => { setAsk(false); publish() }}
          warning="People will trade at exactly this rate. Make sure it's right; you must honour it."
          summary={[['Type', f.side === 'sell' ? `I sell ₺ for ${hc}` : `I buy ₺ with ${hc}`], ['Rate', `${fmt(rate * 1000, hc)} per ₺1,000 (${diff >= 0 ? '+' : ''}${diff.toFixed(1)}% vs market)`], ['Limits', `₺${(+f.min).toLocaleString()} – ₺${(+f.max).toLocaleString()}`], ['Total', fmt(+f.total, 'TRY')], ['Locked from wallet', lockNeeded ? fmt(lockNeeded, 'TRY') : 'nothing (cash ad)']]}
          checks={['The rate and limits are correct', 'I have this money available for the whole ad', 'I will reply quickly and meet only at Safe Spots']} />}
      </div>
    </Sheet>
  )
}
