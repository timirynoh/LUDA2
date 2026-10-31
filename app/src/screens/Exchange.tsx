import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDownUp, BadgeCheck, CheckCircle2, Clock, Lock, MapPin, QrCode, ShieldAlert, ShieldCheck, Siren, Star } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { DemoNote, Header, PinPad, Segmented, Sheet, Success } from '../components/ui'
import { P2P_FEE } from '../config'
import { handshakeCode, randomSecret, verifyHandshake } from '../lib/crypto'
import { COUNTRIES, CURRENCIES, SAFE_SPOTS } from '../lib/data'
import { convert, fmt, useRates } from '../lib/fx'
import { uid, useStore, type Trade } from '../lib/store'

const SPREAD = 0.008
const TRADERS: [string, string][] = [
  ['Chidi O.', '🇳🇬'], ['Amara N.', '🇳🇬'], ['Tendai M.', '🇿🇼'], ['Kofi A.', '🇬🇭'], ['Mireille K.', '🇨🇲'], ['Emeka U.', '🇳🇬'],
  ['Wanjiru K.', '🇰🇪'], ['Fatima B.', '🇸🇩'], ['Jean-Paul M.', '🇨🇩'], ['Tolu A.', '🇳🇬'], ['Rudo C.', '🇿🇼'], ['Mehmet Y.', '🇹🇷'],
]

function seeded(seed: number) { return () => ((seed = (seed * 9301 + 49297) % 233280) / 233280) }

export default function Exchange() {
  const { t } = useStore()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'p2p' ? 'p2p' : 'convert'
  return (
    <div>
      <Header title={t('fx.title')} sub="Naira, Cedi, CFA & more ⇄ Lira" />
      <div className="px-5">
        <Segmented value={tab} onChange={(v) => setParams(v === 'p2p' ? { tab: 'p2p' } : {})}
          options={[{ value: 'convert', label: `💱 ${t('fx.convert')}` }, { value: 'p2p', label: `🤝 ${t('fx.p2p')}` }]} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {tab === 'convert' ? <Convert /> : <P2P />}
        </motion.div>
      </AnimatePresence>
      <DemoNote />
    </div>
  )
}

function Convert() {
  const { s, set, t, addTx, reward, gate } = useStore()
  const { rates, live } = useRates()
  const home = COUNTRIES.find((c) => c.code === s.country)!
  const [from, setFrom] = useState(home.currency === 'TRY' ? 'USD' : home.currency)
  const [to, setTo] = useState('TRY')
  const [amount, setAmount] = useState('')
  const [done, setDone] = useState(false)
  const amt = parseFloat(amount) || 0
  const out = convert(rates, amt, from, to) * (1 - SPREAD)
  const bal = s.balances[from] ?? 0
  const all = Object.keys(CURRENCIES)

  const go = () => {
    if (!gate(2, 'Convert currency')) return
    set((p) => ({ ...p, balances: { ...p.balances, [from]: (p.balances[from] ?? 0) - amt, [to]: (p.balances[to] ?? 0) + out } }))
    addTx({ type: 'convert', amount: out, currency: to, label: `Converted ${fmt(amt, from)} → ${to}` })
    reward(s.quests.includes('fx') ? 10 : 40, { quest: 'fx', badge: 'fx_wizard', title: 'Currency converted' })
    setDone(true)
  }

  return (
    <div className="flex flex-col gap-3 px-5 pt-5">
      <div className="card">
        <p className="label">{t('fx.from')}</p>
        <div className="mt-2 flex items-center gap-2">
          <input inputMode="decimal" className="min-w-0 flex-1 bg-transparent text-3xl font-bold outline-none" placeholder="0" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} />
          <select className="input w-auto py-2" value={from} onChange={(e) => setFrom(e.target.value)}>
            {all.map((c) => <option key={c} value={c}>{CURRENCIES[c].flag} {c}</option>)}
          </select>
        </div>
        <button className="mt-1 text-xs text-slate-400" onClick={() => setAmount(String(Math.floor(bal)))}>Balance: <span className="text-mint-300">{fmt(bal, from)}</span> · use max</button>
      </div>
      <div className="relative z-10 -my-6 flex justify-center">
        <motion.button whileTap={{ rotate: 180 }} onClick={() => { setFrom(to); setTo(from) }}
          className="grid size-12 place-items-center rounded-2xl border-4 border-ink-950 bg-gradient-to-br from-gold-300 to-amber-500 text-ink-950 shadow-lg"><ArrowDownUp size={20} /></motion.button>
      </div>
      <div className="card">
        <p className="label">{t('fx.to')}</p>
        <div className="mt-2 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-3xl font-bold text-mint-300">{amt ? fmt(out, to).replace(CURRENCIES[to].symbol, '').trim() : '0'}</p>
          <select className="input w-auto py-2" value={to} onChange={(e) => setTo(e.target.value)}>
            {all.map((c) => <option key={c} value={c}>{CURRENCIES[c].flag} {c}</option>)}
          </select>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-fg/[0.03] px-4 py-3 text-sm">
        <span className="text-slate-400">{t('fx.rate')} <span className={`chip ms-1 ${live ? 'bg-mint-400/15 text-mint-300' : 'bg-fg/5 text-slate-400'}`}>{live ? t('fx.live') : t('fx.indicative')}</span></span>
        <span className="font-semibold">1 {from} = {convert(rates, 1, from, to).toLocaleString(undefined, { maximumSignificantDigits: 5 })} {to}</span>
      </div>
      <p className="text-center text-xs text-slate-500">Transparent {SPREAD * 100}% spread · no hidden fees</p>
      <button className="btn-gold py-4" disabled={!amt || amt > bal || from === to} onClick={go}>
        {amt > bal ? t('wallet.insufficient') : `${t('fx.convert')} ${from} → ${to}`}
      </button>
      <Sheet open={done} onClose={() => { setDone(false); setAmount('') }} title={t('fx.convert')}>
        <Success title={t('wallet.success')} sub={`You received ${fmt(out, to)}`} onClose={() => { setDone(false); setAmount('') }} />
      </Sheet>
    </div>
  )
}

interface Offer { id: string; name: string; flag: string; rating: number; trades: number; rate: number; min: number; max: number; spot: string; km: number; mins: number }

function P2P() {
  const { s, set, t, addTx, checkPin, gate } = useStore()
  const { rates } = useRates()
  const home = COUNTRIES.find((c) => c.code === s.country)!
  const hc = home.currency === 'TRY' ? 'USD' : home.currency
  const spots = SAFE_SPOTS[s.city] ?? SAFE_SPOTS.lefkosa
  const market = convert(rates, 1, 'TRY', hc) // home currency per 1 TL

  const offers = useMemo<Offer[]>(() => {
    const r = seeded(s.city.length * 97 + hc.charCodeAt(0))
    return Array.from({ length: 6 }, (_, i) => {
      const [name, flag] = TRADERS[(Math.floor(r() * TRADERS.length) + i) % TRADERS.length]
      return {
        id: `o${i}`, name, flag,
        rating: 4.5 + r() * 0.5, trades: 20 + Math.floor(r() * 400), rate: market * (1 + (r() * 0.05 - 0.01)),
        min: 500, max: 2000 + Math.floor(r() * 18) * 500, spot: spots[i % spots.length], km: +(0.3 + r() * 4).toFixed(1), mins: 2 + Math.floor(r() * 20),
      }
    }).sort((a, b) => a.rate - b.rate)
  }, [s.city, hc, market, spots])

  const [offer, setOffer] = useState<Offer | null>(null)
  const [tl, setTl] = useState('1000')
  const [spot, setSpot] = useState(spots[0])
  const [when, setWhen] = useState('Within 1 hour')
  const [stage, setStage] = useState<'form' | 'pin' | 'locked'>('form')
  const [err, setErr] = useState('')
  const [active, setActive] = useState<Trade | null>(null)

  const tlAmt = parseFloat(tl) || 0
  const pay = offer ? tlAmt * offer.rate * (1 + P2P_FEE) : 0
  const bal = s.balances[hc] ?? 0

  const lock = () => {
    const trade: Trade = {
      id: uid(), trader: offer!.name, traderFlag: offer!.flag, give: pay, giveCur: hc, get: tlAmt, getCur: 'TRY',
      spot, when, status: 'escrow', secret: randomSecret(), createdAt: Date.now(),
    }
    set((p) => ({ ...p, balances: { ...p.balances, [hc]: (p.balances[hc] ?? 0) - pay }, trades: [trade, ...p.trades] }))
    addTx({ type: 'p2p', amount: -pay, currency: hc, label: `Escrow locked · ${offer!.name}`, meta: spot })
    setStage('locked')
  }

  const live = s.trades.filter((x) => x.status === 'escrow' || x.status === 'meeting' || x.status === 'disputed')

  return (
    <div className="flex flex-col gap-4 px-5 pt-5">
      {/* protocol explainer */}
      <div className="card overflow-hidden bg-gradient-to-br from-fuchsia-500/10 to-transparent">
        <div className="flex items-center gap-2"><ShieldCheck className="text-fuchsia-300" size={20} /><p className="font-bold">Luda SafeSwap protocol</p></div>
        <ol className="mt-3 grid gap-2 text-sm text-slate-300">
          {[
            ['🪪', 'Both sides are ID + selfie verified'],
            ['🔒', `Your ${hc} is locked in escrow — nobody can run with it`],
            ['📍', 'Meet only at public Safe Spots, with live check-in'],
            ['📲', 'Rotating QR handshake proves it is the right person'],
            ['✅', 'Count the cash, then release with your PIN'],
          ].map(([e, x]) => <li key={x} className="flex gap-2"><span>{e}</span><span>{x}</span></li>)}
        </ol>
      </div>

      {!(s.verified && s.phoneVerified) && (
        <button onClick={() => gate(2, 'SafeSwap in-person exchange')} className="card flex items-center gap-3 border-gold-400/40 bg-gold-400/10 text-start">
          <ShieldAlert className="text-gold-300" />
          <div className="flex-1 text-sm"><p className="font-semibold">Verify to start trading</p><p className="text-slate-400">Phone + ID · about 2 minutes · +200 XP</p></div>
        </button>
      )}

      {live.length > 0 && (
        <section>
          <p className="label mb-2">Your active trades</p>
          {live.map((x) => (
            <button key={x.id} onClick={() => setActive(x)} className="card mb-2 flex w-full items-center gap-3 border-fuchsia-400/30 text-start">
              <div className="grid size-11 place-items-center rounded-2xl bg-fuchsia-500/20 text-xl">{x.traderFlag}</div>
              <div className="flex-1">
                <p className="font-semibold">{x.trader} · {fmt(x.get, 'TRY')}</p>
                <p className="text-xs text-slate-400">{x.status === 'disputed' ? '⚠️ Disputed — funds frozen' : `🔒 ${fmt(x.give, x.giveCur)} in escrow`} · {x.spot}</p>
              </div>
              <span className="chip bg-fuchsia-500/20 text-fuchsia-200">Open</span>
            </button>
          ))}
        </section>
      )}

      <div className="flex items-center justify-between">
        <p className="label">{t('fx.offers')}</p>
        <span className="text-xs text-slate-500">Market: {fmt(market * 1000, hc)} / ₺1k</span>
      </div>
      {offers.map((o, i) => (
        <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card">
          <div className="flex items-center gap-3">
            <div className="relative grid size-12 place-items-center rounded-2xl bg-ink-700 text-xl">{o.flag}
              <BadgeCheck size={16} className="absolute -right-1 -bottom-1 rounded-full bg-ink-900 text-mint-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{o.name}</p>
              <p className="flex items-center gap-1 text-xs text-slate-400"><Star size={12} className="fill-gold-400 text-gold-400" />{o.rating.toFixed(2)} · {o.trades} trades · {o.km} km</p>
            </div>
            {i === 0 && <span className="chip bg-mint-400/15 text-mint-300">Best rate</span>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-fg/[0.03] p-2.5"><p className="text-xs text-slate-500">You pay per ₺1,000</p><p className="font-bold">{fmt(o.rate * 1000, hc)}</p></div>
            <div className="rounded-xl bg-fg/[0.03] p-2.5"><p className="text-xs text-slate-500">Cash limit</p><p className="font-bold">₺{o.min.toLocaleString()}–{o.max.toLocaleString()}</p></div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="flex items-center gap-1 text-xs text-slate-400"><MapPin size={12} />{o.spot} · <Clock size={12} />~{o.mins}m reply</p>
            <button className="btn-primary px-4 py-2 text-sm" onClick={() => { if (!gate(2, 'SafeSwap in-person exchange')) return; setOffer(o); setStage('form'); setErr(''); setTl(String(Math.min(1000, o.max))); setSpot(o.spot) }}>Trade</button>
          </div>
        </motion.div>
      ))}

      {/* new trade */}
      <Sheet open={!!offer} onClose={() => setOffer(null)} title={`Swap with ${offer?.name ?? ''}`}>
        {offer && stage === 'form' && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="label mb-2">Cash you receive (TL)</p>
              <input inputMode="numeric" className="input py-4 text-2xl font-bold" value={tl} onChange={(e) => setTl(e.target.value.replace(/\D/g, ''))} />
              <p className="mt-1 text-xs text-slate-500">Limit ₺{offer.min.toLocaleString()}–{offer.max.toLocaleString()}</p>
            </div>
            <div>
              <p className="label mb-2">Safe Spot</p>
              <div className="flex flex-col gap-2">{spots.map((x) => (
                <button key={x} onClick={() => setSpot(x)} className={`glass flex items-center gap-2 rounded-xl p-3 text-start text-sm ${spot === x ? 'border-mint-400/60 bg-mint-400/10' : ''}`}><MapPin size={14} className="text-mint-300" />{x}</button>
              ))}</div>
            </div>
            <div className="flex gap-2">{['Within 1 hour', 'This evening', 'Tomorrow'].map((w) => (
              <button key={w} onClick={() => setWhen(w)} className={`chip py-2 ${when === w ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{w}</button>
            ))}</div>
            <div className="rounded-2xl bg-fg/[0.03] p-3 text-sm">
              <div className="flex justify-between text-slate-400"><span>Rate</span><span>{fmt(offer.rate * 1000, hc)} / ₺1k</span></div>
              <div className="flex justify-between text-slate-400"><span>Escrow fee ({P2P_FEE * 100}%)</span><span>{fmt(tlAmt * offer.rate * P2P_FEE, hc)}</span></div>
              <div className="mt-1 flex justify-between font-bold"><span>Locked in escrow</span><span>{fmt(pay, hc)}</span></div>
            </div>
            {pay > bal && <p className="text-sm text-rose-400">{t('wallet.insufficient')} — top up {hc} first.</p>}
            <button className="btn-primary py-4" disabled={tlAmt < offer.min || tlAmt > offer.max || pay > bal} onClick={() => setStage('pin')}><Lock size={18} /> {t('fx.start')}</button>
          </div>
        )}
        {stage === 'pin' && (
          <div className="flex flex-col items-center gap-4"><p className="text-slate-300">{t('wallet.pin')}</p>
            <PinPad error={err} onDone={async (p) => ((await checkPin(p)) ? lock() : setErr('Wrong PIN'))} /></div>
        )}
        {stage === 'locked' && <Success title={t('fx.escrow')} sub={`Meet ${offer?.name} at ${spot}. Open the trade when you arrive.`} onClose={() => setOffer(null)} />}
      </Sheet>

      {active && <TradeSheet key={active.id} trade={active} onClose={() => setActive(null)} />}
    </div>
  )
}

function TradeSheet({ trade, onClose }: { trade: Trade | null; onClose: () => void }) {
  const { s, set, addTx, reward, checkPin } = useStore()
  const [code, setCode] = useState('')
  const [left, setLeft] = useState(30)
  const [pinErr, setPinErr] = useState('')
  const [releasing, setReleasing] = useState(false)
  const [arrived, setArrived] = useState(false)
  const [done, setDone] = useState(false)
  const cur = trade ? s.trades.find((x) => x.id === trade.id) ?? trade : null

  useEffect(() => {
    if (!cur) return
    let alive = true
    const tick = async () => {
      const c = await handshakeCode(cur.secret, cur.id)
      if (alive) { setCode(c); setLeft(30 - (Math.floor(Date.now() / 1000) % 30)) }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => { alive = false; clearInterval(id) }
  }, [cur])

  if (!cur) return null
  const update = (status: Trade['status']) => set((p) => ({ ...p, trades: p.trades.map((x) => (x.id === cur.id ? { ...x, status } : x)) }))
  const counterpartyScan = async () => { if (await verifyHandshake(cur.secret, cur.id, code)) update('meeting') }
  const release = async (pin: string) => {
    if (!(await checkPin(pin))) return setPinErr('Wrong PIN')
    update('completed')
    addTx({ type: 'p2p', amount: cur.get, currency: 'TRY', label: `Cash received in person · ${cur.trader}`, meta: 'escrow released' })
    reward(s.quests.includes('p2p') ? 40 : 200, { quest: 'p2p', badge: 'safe_trader', title: 'Safe swap complete' })
    setDone(true)
  }
  const cancel = () => {
    update('cancelled')
    set((p) => ({ ...p, balances: { ...p.balances, [cur.giveCur]: (p.balances[cur.giveCur] ?? 0) + cur.give } }))
    addTx({ type: 'p2p', amount: cur.give, currency: cur.giveCur, label: `Escrow refunded · ${cur.trader}` })
    onClose()
  }

  const steps = [
    { k: 'Escrow locked', ok: true },
    { k: 'Arrived at Safe Spot', ok: arrived || cur.status !== 'escrow' },
    { k: 'QR handshake verified', ok: cur.status === 'meeting' || cur.status === 'completed' },
    { k: 'Cash counted · escrow released', ok: cur.status === 'completed' },
  ]

  return (
    <Sheet open onClose={onClose} title={`Trade · ${cur.trader}`}>
      {done ? <Success title="Swap complete 🎉" sub={`Enjoy your ${fmt(cur.get, 'TRY')}. Rate ${cur.trader} to help the community.`} onClose={onClose} /> : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-2xl bg-fg/[0.04] p-3"><p className="text-xs text-slate-500">In escrow</p><p className="font-bold">{fmt(cur.give, cur.giveCur)}</p></div>
            <div className="rounded-2xl bg-fg/[0.04] p-3"><p className="text-xs text-slate-500">Cash to receive</p><p className="font-bold text-mint-300">{fmt(cur.get, 'TRY')}</p></div>
          </div>
          <ol className="relative grid gap-3 ps-6">
            <div className="absolute start-[9px] top-2 bottom-2 w-0.5 bg-fg/10" />
            {steps.map((x) => (
              <li key={x.k} className="relative flex items-center gap-2 text-sm">
                <CheckCircle2 size={20} className={`absolute -start-6 rounded-full bg-ink-900 ${x.ok ? 'text-mint-400' : 'text-slate-600'}`} />
                <span className={x.ok ? 'text-slate-100' : 'text-slate-500'}>{x.k}</span>
              </li>
            ))}
          </ol>
          <p className="flex items-center gap-1 text-xs text-slate-400"><MapPin size={12} /> {cur.spot} · {cur.when}</p>

          {cur.status === 'disputed' && <div className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200">⚠️ Dispute opened. Escrow is frozen and a Luda safety agent will contact you within 15 minutes.</div>}

          {cur.status === 'escrow' && !arrived && <button className="btn-ghost" onClick={() => setArrived(true)}><MapPin size={16} /> I've arrived — share live check-in</button>}

          {cur.status === 'escrow' && arrived && (
            <div className="flex flex-col items-center gap-3 rounded-3xl bg-white p-5 text-ink-950">
              <p className="text-sm font-semibold">Let {cur.trader} scan this</p>
              <QRCodeSVG value={`luda://swap/${cur.id}/${code}`} size={170} />
              <p className="font-mono text-3xl font-black tracking-[0.3em]">{code}</p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(left / 30) * 100}%` }} /></div>
              <p className="text-xs text-slate-500">Rotates in {left}s · single-use · bound to this trade</p>
              <button className="btn bg-ink-950 py-2 text-sm text-white" onClick={counterpartyScan}><QrCode size={16} /> Simulate {cur.trader.split(' ')[0]} scanning</button>
            </div>
          )}

          {cur.status === 'meeting' && (releasing ? (
            <div className="flex flex-col items-center gap-3"><p className="text-sm text-slate-300">Enter PIN to release {fmt(cur.give, cur.giveCur)}</p><PinPad error={pinErr} onDone={release} /></div>
          ) : (
            <>
              <div className="rounded-2xl bg-mint-400/10 p-3 text-sm text-mint-100">✅ Identity matched: {cur.trader} is the verified trader you booked. Count the cash before releasing.</div>
              <button className="btn-primary py-4" onClick={() => setReleasing(true)}>I received {fmt(cur.get, 'TRY')} — release escrow</button>
            </>
          ))}

          <div className="grid grid-cols-2 gap-2">
            {cur.status === 'escrow' ? <button className="btn-ghost text-sm" onClick={cancel}>Cancel & refund</button>
              : <button className="btn-ghost text-sm" disabled={cur.status === 'disputed'} onClick={() => update('disputed')}><ShieldAlert size={16} /> Dispute</button>}
            <a href="tel:155" className="btn bg-rose-500/15 text-sm text-rose-300"><Siren size={16} /> SOS · 155</a>
          </div>
        </div>
      )}
    </Sheet>
  )
}
