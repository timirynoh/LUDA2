import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftRight, BadgePercent, Bus, Car, CreditCard, ExternalLink, Minus, Plane, Plus, Share2, Ticket as TicketIcon, Wallet } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DemoNote, Header, PinPad, Segmented, Sheet, Success } from '../components/ui'
import { GIRNE_LEFKOSA, KIBHAS_FARES, SAVER, TICKET_DISCOUNT } from '../config'
import { SaverCard, SaverSheet } from '../components/RideSaver'
import { handshakeCode, randomSecret } from '../lib/crypto'
import { quote, refundsThisMonth, saverState } from '../lib/saver'
import { CITIES, SAFE_SPOTS } from '../lib/data'
import { convert, fmt, useRates } from '../lib/fx'
import { COUNTRIES, CURRENCIES } from '../lib/data'
import { uid, useStore } from '../lib/store'
import { departures, luhn, ticketCode, type Ticket } from '../lib/tickets'
import { CardPicker } from '../components/Cards'
import { LiveTicketPay } from '../components/LiveTicketPay'
import { LIVE } from '../lib/live'
import { KibhasLive } from '../components/KibhasBooking'
import { brandOf } from '../lib/cards'
import { ERCAN, km, taxiFare } from '../lib/transport'

type Tab = 'tickets' | 'airport' | 'taxi'

export default function Transport() {
  const { s, t } = useStore()
  const [tab, setTab] = useState<Tab>('tickets')
  const valid = s.tickets.filter((x) => x.status === 'valid')
  const [saver, setSaver] = useState(false)
  return (
    <div>
      <Header back title={t('act.transport')} sub="Bus tickets, airport shuttle & taxis" />
      {tab !== 'taxi' && !LIVE && <div className="px-5 pb-3"><SaverCard onOpen={() => setSaver(true)} /></div>}
      {saver && <SaverSheet onClose={() => setSaver(false)} />}
      <div className="px-5"><Segmented value={tab} onChange={setTab} options={[{ value: 'tickets', label: '🎟️ Bus tickets' }, { value: 'airport', label: '✈️ Airport' }, { value: 'taxi', label: '🚕 Taxi' }]} /></div>
      {valid.length > 0 && <MyTickets tickets={valid} />}
      {tab === 'tickets' && <BusTickets />}
      {tab === 'airport' && (LIVE ? <KibhasLive /> : <Airport />)}
      {tab === 'taxi' && <Taxi />}
      <DemoNote />
    </div>
  )
}

/* ------------------------------ My tickets ------------------------------ */

function MyTickets({ tickets }: { tickets: Ticket[] }) {
  const [open, setOpen] = useState<Ticket | null>(null)
  return (
    <div className="px-5 pt-4">
      <p className="label mb-2">My tickets</p>
      <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {tickets.map((tk) => (
          <button key={tk.id} onClick={() => setOpen(tk)} className="relative min-w-60 overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-700 to-indigo-900 p-4 text-start text-white shadow-xl">
            <div className="absolute -top-6 -right-6 size-24 rounded-full bg-white/10" />
            <p className="flex items-center gap-1 text-xs text-white/70"><TicketIcon size={12} /> {tk.operator}</p>
            <p className="mt-1 text-lg font-extrabold">{tk.from} → {tk.to}</p>
            <p className="text-xs text-white/80">{new Date(tk.date + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · {tk.time}{tk.returnDate ? ' · return' : ''} · {tk.pax} pax</p>
            <p className="mt-2 font-mono text-sm tracking-widest">{tk.code}</p>
          </button>
        ))}
      </div>
      {open && <TicketSheet tk={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function TicketSheet({ tk, onClose }: { tk: Ticket; onClose: () => void }) {
  const { s, set, addTx, toast } = useStore()
  const [code, setCode] = useState('')
  const [left, setLeft] = useState(30)
  // Live QR: changes every 30s and only exists inside the holder's app, so screenshots can't be resold.
  useEffect(() => {
    let alive = true
    const tick = async () => { const c = await handshakeCode(tk.secret ?? tk.id, tk.id); if (alive) { setCode(c); setLeft(30 - (Math.floor(Date.now() / 1000) % 30)) } }
    tick(); const id = setInterval(tick, 1000)
    return () => { alive = false; clearInterval(id) }
  }, [tk.id, tk.secret])
  const departs = new Date(`${tk.date}T${tk.time}:00`).getTime()
  const tooLate = departs - Date.now() < SAVER.noRefundMinutes * 60_000
  const refundsLeft = SAVER.maxRefundsPerMonth - refundsThisMonth(s.tickets)
  const refund = () => {
    if (tooLate) return toast({ title: `No refunds in the last ${SAVER.noRefundMinutes} minutes before departure`, emoji: '⛔' })
    set((p) => ({ ...p, tickets: p.tickets.map((x) => (x.id === tk.id ? { ...x, status: 'refunded', refundedAt: Date.now() } : x)), balances: tk.paidWith === 'wallet' ? { ...p.balances, TRY: (p.balances.TRY ?? 0) + tk.total } : tk.paidWith === 'home' && tk.paidCur ? { ...p.balances, [tk.paidCur]: (p.balances[tk.paidCur] ?? 0) + (tk.paidAmount ?? 0) } : p.balances }))
    if (tk.paidWith !== 'card') addTx({ type: 'bill', amount: tk.paidWith === 'home' ? tk.paidAmount ?? 0 : tk.total, currency: tk.paidWith === 'home' ? tk.paidCur ?? 'TRY' : 'TRY', label: `Refund · ${tk.operator} ${tk.from}→${tk.to}` })
    toast({ title: tk.paidWith === 'card' ? 'Refund sent to your card (3–5 days)' : 'Refunded to your wallet', emoji: '↩️' })
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Your e-ticket">
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-white p-5 text-ink-950">
        <p className="text-sm font-semibold">{tk.operator}</p>
        <p className="text-2xl font-extrabold">{tk.from} → {tk.to}</p>
        <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">👤 {tk.holder ?? s.name}{tk.pax > 1 ? ` + ${tk.pax - 1}` : ''} · personal ticket</p>
        <QRCodeSVG value={`luda://ticket/${tk.code}/${code}`} size={180} />
        <p className="font-mono text-2xl font-black tracking-[0.3em]">{tk.code}</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-violet-500 transition-all" style={{ width: `${(left / 30) * 100}%` }} /></div>
        <p className="text-[11px] text-slate-500">Live QR refreshes in {left}s · screenshots won't scan · driver may check your name</p>
        <div className="grid w-full grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl bg-slate-100 p-2"><p className="text-slate-500">Date</p><p className="font-bold">{new Date(tk.date + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</p></div>
          <div className="rounded-xl bg-slate-100 p-2"><p className="text-slate-500">Departs</p><p className="font-bold">{tk.time}</p></div>
          <div className="rounded-xl bg-slate-100 p-2"><p className="text-slate-500">Passengers</p><p className="font-bold">{tk.pax}</p></div>
        </div>
        {tk.returnDate && <p className="text-xs text-slate-600">Return: {new Date(tk.returnDate + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · {tk.returnTime}</p>}
        <p className="text-xs text-slate-500">Show this QR to the driver · paid {fmt(tk.total, 'TRY')} · saved {fmt(tk.saved, 'TRY')}</p>
      </div>
      {tk.payRef ? <p className="mt-3 text-center text-xs text-slate-400">Paid from your Luda wallet. To cancel, contact Luda support from Help.</p> :
      <button className="btn-ghost mt-3 w-full text-sm text-rose-300" disabled={tooLate} onClick={refund}>{tooLate ? `Refunds close ${SAVER.noRefundMinutes} min before departure` : 'Cancel & refund'}</button>}
      {!tooLate && tk.saved > 0 && <p className="mt-2 text-center text-[11px] text-slate-500">Refunded Saver tickets still count toward your limits. {Math.max(0, refundsLeft - 1)} refund{refundsLeft - 1 === 1 ? '' : 's'} left this month before Saver pauses.</p>}
    </Sheet>
  )
}

/* ------------------------------ Bus tickets ------------------------------ */

interface Trip { from: string; to: string; operator: string; official: { single: number; ret: number }; every: number; estimated?: boolean; kind: Ticket['kind']; first?: string; last?: string; opId?: string; city?: string }

function BusTickets() {
  const { s, gate } = useStore()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [dir, setDir] = useState<'gl' | 'lg'>(s.city === 'lefkosa' ? 'lg' : 'gl')
  const from = dir === 'gl' ? 'Girne' : 'Lefkoşa', to = dir === 'gl' ? 'Lefkoşa' : 'Girne'
  const active = saverState(s).active
  const price = (official: number, ret: boolean) => (active ? official - (ret ? TICKET_DISCOUNT.return : TICKET_DISCOUNT.single) : official)

  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-500 via-fuchsia-700 to-indigo-950 p-5 text-white">
        <div className="absolute -top-10 -right-10 size-40 rounded-full bg-white/10 blur-2xl" />
        <p className="chip bg-white/15 text-white"><BadgePercent size={12} /> {active ? 'Ride Saver prices' : 'Opt in to Ride Saver for Luda prices'}</p>
        <div className="mt-3 flex items-center gap-3">
          <p className="text-2xl font-extrabold">{from}</p>
          <button onClick={() => setDir(dir === 'gl' ? 'lg' : 'gl')} className="grid size-9 place-items-center rounded-full bg-white/20" aria-label="Swap direction"><ArrowLeftRight size={16} /></button>
          <p className="text-2xl font-extrabold">{to}</p>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl bg-black/20 p-3"><p className="text-xs text-white/70">One way</p><p><span className="text-xl font-extrabold">₺{price(GIRNE_LEFKOSA.single, false)}</span> {active ? <span className="text-xs text-white/60 line-through">₺{GIRNE_LEFKOSA.single}</span> : <span className="text-xs text-white/70">or ₺{GIRNE_LEFKOSA.single - TICKET_DISCOUNT.single} with Saver</span>}</p></div>
          <div className="rounded-2xl bg-black/20 p-3"><p className="text-xs text-white/70">Return</p><p><span className="text-xl font-extrabold">₺{price(GIRNE_LEFKOSA.return, true)}</span> {active ? <span className="text-xs text-white/60 line-through">₺{GIRNE_LEFKOSA.return}</span> : <span className="text-xs text-white/70">or ₺{GIRNE_LEFKOSA.return - TICKET_DISCOUNT.return} with Saver</span>}</p></div>
        </div>
      </div>
      <p className="label">Choose your bus</p>
      {GIRNE_LEFKOSA.operators.map((o) => (
        <button key={o.id} onClick={() => gate(1, 'Buy bus tickets') && setTrip({ from, to, operator: o.name, opId: o.id, official: { single: GIRNE_LEFKOSA.single, ret: GIRNE_LEFKOSA.return }, every: o.every, kind: 'bus' })} className="card flex items-center gap-3 text-start">
          <div className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${o.color} text-white`}><Bus /></div>
          <div className="flex-1"><p className="font-semibold">{o.name}</p><p className="text-xs text-slate-400">{from} → {to} · every {o.every} min · ~30 min</p></div>
          <span className="chip bg-mint-400/15 py-2 text-mint-300">Book</span>
        </button>
      ))}

      {trip && <BookSheet trip={trip} onClose={() => setTrip(null)} />}
    </div>
  )
}

/* ------------------------------ Booking ------------------------------ */

function BookSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { s, set, addTx, reward, checkPin, gate, allow } = useStore()
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10) }), [])
  const [ret, setRet] = useState(false)
  const [date, setDate] = useState(days[0])
  const [rdate, setRdate] = useState(days[0])
  const [time, setTime] = useState('')
  const [rtime, setRtime] = useState('')
  const times = departures(date, trip.first, trip.last, trip.every)
  const goTime = time || times[0] || ''
  const rd = rdate < date ? date : rdate
  const rtimes = departures(rd, trip.first, trip.last, trip.every).filter((t) => rd !== date || t > goTime)
  const [pax, setPax] = useState(1)
  const [pay, setPay] = useState<'wallet' | 'card' | 'home'>('wallet')
  const { rates } = useRates()
  const hc = COUNTRIES.find((c) => c.code === s.country)?.currency ?? 'NGN'
  const showHome = hc !== 'TRY'
  const [card, setCard] = useState({ num: '', exp: '', cvv: '' })
  const [stage, setStage] = useState<'form' | 'pin' | 'done'>('form')
  const [err, setErr] = useState('')
  const [made, setMade] = useState<Ticket | null>(null)

  const st = saverState(s)
  const online = LIVE && !!trip.opId // real money: paid from the server wallet
  const q = quote(ret ? trip.official.ret : trip.official.single, ret, pax, st.active && !online)
  const official = q.full, total = q.total, saved = q.saved
  const [saverOpen, setSaverOpen] = useState(false)
  const bal = s.balances.TRY ?? 0
  const homeBal = s.balances[hc] ?? 0
  const homeNeeded = convert(rates, total, 'TRY', hc) * 1.008 // live rate + 0.8% FX spread
  const [savedId, setSavedId] = useState(() => s.cards.find((c) => c.isDefault)?.id ?? '')
  const [saveCard, setSaveCard] = useState(true)
  const cardOk = savedId ? /^\d{3,4}$/.test(card.cvv) : luhn(card.num) && /^\d{2}\/\d{2}$/.test(card.exp) && /^\d{3,4}$/.test(card.cvv)
  const canPay = !!(time || times[0]) && (!ret || !!(rtime || rtimes[0])) && (pay === 'wallet' ? bal >= total : pay === 'home' ? homeBal >= homeNeeded : cardOk)

  const issue = () => {
    const tk: Ticket = {
      id: uid(), code: ticketCode(), operator: trip.operator, from: trip.from, to: trip.to, date, time: time || times[0],
      returnDate: ret ? rd : undefined, returnTime: ret ? rtime || rtimes[0] : undefined, pax, total, saved, paidWith: pay, createdAt: Date.now(), status: 'valid', kind: trip.kind,
      holder: s.name, secret: randomSecret(),
    }
    if (pay === 'home') { tk.paidCur = hc; tk.paidAmount = homeNeeded }
    if (pay === 'card' && !savedId && saveCard && s.cards.every((c) => c.last4 !== card.num.replace(/\D/g, '').slice(-4))) {
      const d = card.num.replace(/\D/g, '')
      set((p) => ({ ...p, cards: [...p.cards, { id: uid(), brand: brandOf(d), last4: d.slice(-4), exp: card.exp, name: p.name, isDefault: p.cards.length === 0 }] }))
    }
    set((p) => ({ ...p, tickets: [tk, ...p.tickets], balances: pay === 'wallet' ? { ...p.balances, TRY: (p.balances.TRY ?? 0) - total } : pay === 'home' ? { ...p.balances, [hc]: (p.balances[hc] ?? 0) - homeNeeded } : p.balances }))
    addTx({ type: 'bill', amount: pay === 'home' ? -homeNeeded : -total, currency: pay === 'home' ? hc : 'TRY', label: `${trip.operator} · ${trip.from}→${trip.to}`, meta: `${pay === 'card' ? 'card' : pay === 'home' ? `${hc} wallet` : 'wallet'}${saved ? ` · saved ₺${saved}` : ''}` })
    reward(s.quests.includes('ticket') ? 10 : 50, { quest: 'ticket', badge: 'traveller', title: saved ? `Saved ₺${saved} on your ticket` : 'Ticket booked' })
    setMade(tk); setStage('done')
  }
  const submit = () => {
    setErr('')
    if (pay !== 'card' && !gate(2, 'Pay from your Luda wallet')) return
    if (!allow('ticket')) return
    if (pay !== 'card') setStage('pin'); else issue()
  }

  return (
    <Sheet open onClose={onClose} title={`${trip.operator}`}>
      {stage === 'done' && made ? <Success title="Ticket booked 🎟️" sub={`${made.from} → ${made.to} · ${made.time}. Code ${made.code}.${made.saved ? ` You saved ₺${made.saved}!` : ''} Find it under "My tickets".`} onClose={onClose} /> :
        stage === 'pin' ? (
          <div className="flex flex-col items-center gap-3"><p className="text-sm text-slate-300">Pay {pay === 'home' ? fmt(homeNeeded, hc) : fmt(total, 'TRY')} from your wallet</p>
            <PinPad error={err} onDone={async (pin) => ((await checkPin(pin)) ? issue() : setErr('Wrong PIN'))} /></div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-lg font-bold">{trip.from} → {trip.to}</p>
            <Segmented value={ret ? 'ret' : 'one'} onChange={(v) => setRet(v === 'ret')} options={[{ value: 'one', label: 'One way' }, { value: 'ret', label: 'Return' }]} />
            <DayTime label={ret ? 'Going' : 'Date'} days={days} date={date} setDate={(d) => { setDate(d); setTime('') }} times={times} time={time || times[0]} setTime={setTime} />
            {ret && <DayTime label="Coming back" days={days.filter((d) => d >= date)} date={rd} setDate={(d) => { setRdate(d); setRtime('') }} times={rtimes} time={rtime || rtimes[0]} setTime={setRtime} />}
            <div className="flex items-center justify-between">
              <p className="label">Passengers</p>
              <div className="flex items-center gap-3">
                <button className="grid size-9 place-items-center rounded-xl bg-fg/5" disabled={pax <= 1} onClick={() => setPax(pax - 1)} aria-label="Fewer"><Minus size={16} /></button>
                <span className="w-6 text-center text-lg font-bold">{pax}</span>
                <button className="grid size-9 place-items-center rounded-xl bg-fg/5" disabled={pax >= 6} onClick={() => setPax(pax + 1)} aria-label="More"><Plus size={16} /></button>
              </div>
            </div>
            <div className="rounded-2xl bg-fg/[0.03] p-3 text-sm">
              <div className="flex justify-between text-slate-400"><span>Official price</span><span className={saved ? 'line-through' : ''}>{fmt(official, 'TRY')}</span></div>
              {saved > 0 && <div className="flex justify-between text-mint-300"><span>Ride Saver (₺{q.off} × {q.seats} seat{q.seats > 1 ? 's' : ''})</span><span>−{fmt(saved, 'TRY')}</span></div>}
              {st.active && pax > q.seats && <p className="text-[11px] text-slate-500">Saver covers you + {SAVER.companions} companion. Other seats are normal price.</p>}
              {!st.active && !online && <button className="mt-1 text-start text-xs text-violet-300 underline" onClick={() => setSaverOpen(true)}>{st.message} {st.reason === 'not_member' ? `Save ₺${q.off}/seat →` : ''}</button>}
              <div className="mt-1 flex justify-between text-lg font-extrabold"><span>You pay</span><span>{fmt(total, 'TRY')}</span></div>
              {trip.estimated && <p className="mt-1 text-[11px] text-slate-500">Fare estimated for this route in the demo.</p>}
            </div>
            {online && <LiveTicketPay operator={trip.operator} ticketKind={trip.kind} total={total} ready={!!goTime && (!ret || !!(rtime || rtimes[0]))} onDone={onClose}
              order={{ operatorId: trip.opId!, city: trip.city, return: ret, pax, from: trip.from, to: trip.to, date, time: goTime, returnDate: ret ? rd : undefined, returnTime: ret ? rtime || rtimes[0] : undefined, holder: s.name }} />}
            {LIVE && !online && <p className="text-sm text-slate-400">Online payment isn't available for this route yet.</p>}
            {!LIVE && <>
            <div className={`grid gap-2 ${showHome ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button onClick={() => setPay('wallet')} className={`glass flex flex-col items-start gap-1 rounded-2xl p-3 text-start ${pay === 'wallet' ? 'border-mint-400/60 bg-mint-400/10' : ''}`}><Wallet size={18} /><span className="text-sm font-semibold">Lira wallet</span><span className="text-xs text-slate-400">{fmt(bal, 'TRY')}</span></button>
              {showHome && <button onClick={() => setPay('home')} className={`glass flex flex-col items-start gap-1 rounded-2xl p-3 text-start ${pay === 'home' ? 'border-mint-400/60 bg-mint-400/10' : ''}`}><span className="text-lg leading-none">{CURRENCIES[hc]?.flag}</span><span className="text-sm font-semibold">{hc} wallet</span><span className="text-xs text-slate-400">{fmt(homeBal, hc, { compact: true })}</span></button>}
              <button onClick={() => setPay('card')} className={`glass flex flex-col items-start gap-1 rounded-2xl p-3 text-start ${pay === 'card' ? 'border-mint-400/60 bg-mint-400/10' : ''}`}><CreditCard size={18} /><span className="text-sm font-semibold">Bank card</span><span className="text-xs text-slate-400">Visa · Mastercard</span></button>
            </div>
            <AnimatePresence>
              {pay === 'card' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-2 overflow-hidden">
                  {s.cards.length > 0 && <CardPicker value={savedId} onChange={setSavedId} />}
                  {s.cards.length > 0 && savedId && <button className="text-start text-xs text-slate-400 underline" onClick={() => setSavedId('')}>Use a different card once</button>}
                  {!savedId && <div className="grid grid-cols-4 gap-2">
                    <input className="input col-span-4 font-mono" inputMode="numeric" placeholder="Card number" value={card.num} onChange={(e) => setCard({ ...card, num: e.target.value.replace(/[^\d ]/g, '').slice(0, 23) })} />
                    <input className="input col-span-2" inputMode="numeric" placeholder="MM/YY" value={card.exp} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setCard({ ...card, exp: v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v }) }} />
                    <input className="input col-span-2" inputMode="numeric" placeholder="CVV" type="password" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                    <label className="col-span-4 flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" className="size-4 accent-emerald-500" checked={saveCard} onChange={(e) => setSaveCard(e.target.checked)} /> Save this card for next time</label>
                  </div>}
                  {savedId && <input className="input" inputMode="numeric" placeholder="CVV for this card" type="password" value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} />}
                  <p className="text-[11px] text-slate-500">🔒 Protected by 3-D Secure. Demo: try 4242 4242 4242 4242.</p>
                </motion.div>
              )}
            </AnimatePresence>
            {pay === 'home' && <p className="text-xs text-slate-400">≈ {fmt(homeNeeded, hc)} at today's rate (incl. 0.8% conversion).</p>}
            {pay === 'wallet' && bal < total && <p className="text-sm text-rose-300">Not enough TL in your wallet. <Link to="/wallet?a=deposit" className="underline">Top up</Link>{showHome ? `, pay with your ${hc} wallet` : ''} or pay by card.</p>}
            {pay === 'home' && homeBal < homeNeeded && <p className="text-sm text-rose-300">Not enough {hc}. <Link to="/wallet?a=deposit" className="underline">Top up</Link> or pay by card.</p>}
            <button className="btn-primary py-4" disabled={!canPay} onClick={submit}><TicketIcon size={18} /> Pay {fmt(total, 'TRY')}</button>
            </>}
            {saverOpen && <SaverSheet onClose={() => setSaverOpen(false)} />}
          </div>
        )}
    </Sheet>
  )
}

function DayTime({ label, days, date, setDate, times, time, setTime }: { label: string; days: string[]; date: string; setDate: (d: string) => void; times: string[]; time?: string; setTime: (t: string) => void }) {
  return (
    <div>
      <p className="label mb-2">{label}</p>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
        {days.map((d, i) => {
          const dt = new Date(d + 'T12:00')
          return (
            <button key={d} onClick={() => setDate(d)} className={`flex min-w-14 flex-col items-center rounded-2xl px-3 py-2 text-xs ${date === d ? 'bg-mint-400 text-ink-950' : 'glass text-slate-300'}`}>
              <span>{i === 0 && d === new Date().toISOString().slice(0, 10) ? 'Today' : dt.toLocaleDateString(undefined, { weekday: 'short' })}</span><span className="text-lg font-bold">{dt.getDate()}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {times.length ? times.slice(0, 18).map((t) => <button key={t} onClick={() => setTime(t)} className={`chip py-1.5 ${time === t ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{t}</button>)
          : <p className="text-xs text-slate-400">No more departures this day. Pick another date.</p>}
      </div>
    </div>
  )
}

/* ------------------------------ Airport (KIBHAS) ------------------------------ */

function Airport() {
  const { s, gate } = useStore()
  const city = CITIES.find((c) => c.id === s.city)!
  const [toAirport, setToAirport] = useState(true)
  const [book, setBook] = useState<Trip | null>(null)
  const fare = KIBHAS_FARES[s.city] ?? 300
  const active = saverState(s).active
  const d = Math.round(km(city, ERCAN))
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-cyan-500 via-sky-700 to-sky-950 p-5 text-white">
        <Plane className="absolute -right-2 -bottom-2 size-28 rotate-12 text-white/10" />
        <p className="chip bg-white/15 text-white">KIBHAS airport shuttle</p>
        <p className="mt-3 text-2xl font-extrabold">{toAirport ? `${city.name} → Ercan` : `Ercan → ${city.name}`}</p>
        <p className="text-sm text-cyan-50/80">~{d} km · seats bookable in Luda</p>
        <p className="mt-2"><span className="text-3xl font-extrabold">₺{active ? fare - TICKET_DISCOUNT.single : fare}</span> {active && <span className="text-sm text-white/60 line-through">₺{fare}</span>} <span className="text-xs text-white/70">per person{active ? '' : ` · ₺${fare - TICKET_DISCOUNT.single} with Ride Saver`}</span></p>
      </div>
      <Segmented value={toAirport ? 'to' : 'from'} onChange={(v) => setToAirport(v === 'to')} options={[{ value: 'to', label: '🛫 To the airport' }, { value: 'from', label: '🛬 From the airport' }]} />
      <button className="btn-primary py-4" onClick={() => gate(1, 'Book airport shuttle') && setBook({ from: toAirport ? city.name : 'Ercan Airport', to: toAirport ? 'Ercan Airport' : city.name, operator: 'KIBHAS', opId: 'kibhas', city: s.city, official: { single: fare, ret: fare * 2 }, every: 60, kind: 'shuttle', first: toAirport ? '04:00' : '06:00', last: toAirport ? '22:00' : '23:59' })}>
        <TicketIcon size={18} /> Book KIBHAS seat
      </button>
      <div className="card text-xs text-slate-400">
        <p className="mb-1 font-semibold text-slate-200">How it works</p>
        <p>• From the airport, buses wait for flights. Pick the time closest after your landing.</p>
        <p>• Show your Luda QR ticket to the driver. Luggage included.</p>
        <p>• Ride Saver members pay ₺{TICKET_DISCOUNT.single} less than the counter.</p>
      </div>
      <a href="https://kibhas.org" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-xs text-sky-300 underline"><ExternalLink size={12} /> KIBHAS official website</a>
      <p className="text-center text-[11px] text-slate-500">Live seat booking needs a partnership with KIBHAS (their booking system connected to Luda). Fares shown are publicly reported and may change.</p>
      {book && <BookSheet trip={book} onClose={() => setBook(null)} />}
    </div>
  )
}

/* ------------------------------ Taxi ------------------------------ */

function Taxi() {
  const { s, toast } = useStore()
  const city = CITIES.find((c) => c.id === s.city)!
  const dests = useMemo(() => [
    ...(SAFE_SPOTS[s.city] ?? []).map((n, i) => ({ name: n.split('·')[0].trim(), d: 2 + i * 2.5 })),
    ...CITIES.filter((c) => c.id !== s.city).slice(0, 3).map((c) => ({ name: c.name, d: km(city, c) })),
    { name: 'Ercan Airport', d: km(city, ERCAN) },
  ], [s.city, city])
  const [dest, setDest] = useState(0)
  const [plate, setPlate] = useState('')
  const fare = taxiFare(dests[dest].d)
  const msg = `🚕 I'm in a taxi from ${city.name} to ${dests[dest].name}. Plate: ${plate || '—'}. Left at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Sent via Luda.`
  const share = async () => {
    try { await navigator.clipboard.writeText(msg); toast({ title: 'Trip details copied. Paste to a friend', emoji: '📋' }) }
    catch { toast({ title: 'Copy blocked. Use WhatsApp share', emoji: 'ℹ️' }) }
  }
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <div className="card">
        <p className="label mb-2">Fare estimate from {city.name}</p>
        <div className="flex flex-wrap gap-2">{dests.map((x, i) => <button key={x.name} onClick={() => setDest(i)} className={`chip py-2 ${dest === i ? 'bg-gold-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{x.name}</button>)}</div>
        <p className="mt-4 text-4xl font-extrabold">~₺{fare.toLocaleString()}</p>
        <p className="text-xs text-slate-400">{Math.round(dests[dest].d)} km · agree the price <b>before</b> you get in. Taxis here rarely use meters.</p>
      </div>
      <Link to="/nearby?cat=taxi" className="btn-gold"><Car size={18} /> Find taxi ranks near me</Link>
      <div className="card">
        <p className="flex items-center gap-2 font-bold"><Share2 size={18} className="text-mint-300" /> Share my trip (safety)</p>
        <p className="mt-1 text-xs text-slate-400">Send your route and the taxi's plate number to a friend before you ride.</p>
        <input className="input mt-3 uppercase" placeholder="Plate number, e.g. TAK 123" value={plate} onChange={(e) => setPlate(e.target.value)} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="btn-ghost text-sm" onClick={share}>Copy</button>
          <a className="btn-primary text-sm" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </div>
    </div>
  )
}
