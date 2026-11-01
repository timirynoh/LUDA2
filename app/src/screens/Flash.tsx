import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, BadgeCheck, Banknote, CheckCircle2, Clock, Lock, MapPin, ShieldCheck, Star, Wrench, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TradeChat } from '../components/TradeChat'
import { OpenDispute } from './Disputes'
import { PhoneVerify } from '../components/PhoneVerify'
import { DemoNote, Header, PinPad, Segmented, Sheet, Success } from '../components/ui'
import { CITIES } from '../lib/data'
import { ago, demoOffers, detectCat, FLASH_CATS, FLASH_TTL, nearbyRequests, type FlashCat, type FlashReq, type Offer } from '../lib/flash'
import { fmt } from '../lib/fx'
import { AREAS } from '../lib/housing'
import { checkText } from '../lib/moderation'
import { uid, useStore } from '../lib/store'

export function useFlashFeed() {
  const { s } = useStore()
  return useMemo(() => {
    const mine = s.flash.filter((f) => f.city === s.city && Date.now() - f.ts < FLASH_TTL && !['done', 'cancelled'].includes(f.status))
    const others = nearbyRequests(s.city, AREAS[s.city] ?? AREAS.lefkosa).filter((f) => !s.reports.includes(f.id))
    return { mine, others, all: [...mine, ...others] }
  }, [s.flash, s.city, s.reports])
}

export function FlashBubble({ f, size = 64 }: { f: FlashReq; size?: number }) {
  return (
    <div className="relative grid place-items-center" style={{ width: size + 8, height: size + 8 }}>
      <motion.div className={`absolute inset-0 rounded-full ${f.urgent ? 'bg-[conic-gradient(from_0deg,#f43f5e,#fbbf24,#34d399,#f43f5e)]' : f.mine ? 'bg-[conic-gradient(from_0deg,#34d399,#38bdf8,#34d399)]' : 'bg-fg/15'}`}
        animate={f.urgent || f.mine ? { rotate: 360 } : {}} transition={{ repeat: Infinity, duration: 4, ease: 'linear' }} />
      <div className="relative grid place-items-center rounded-full border-[3px] border-ink-950 bg-gradient-to-br from-ink-600 to-ink-800 text-3xl" style={{ width: size, height: size }}>{f.emoji}</div>
      {f.budget ? <span className="absolute -bottom-1 rounded-full bg-gold-400 px-1.5 text-[10px] font-bold text-ink-950">₺{f.budget}</span> : null}
    </div>
  )
}

export default function Flash() {
  const { s, t, gate } = useStore()
  const [params, setParams] = useSearchParams()
  const { mine, others } = useFlashFeed()
  const [tab, setTab] = useState<'nearby' | 'mine' | 'gigs'>('nearby')
  const openId = params.get('id')
  const open = [...s.flash, ...others].find((f) => f.id === openId)
  const posting = params.get('new') === '1' && s.phoneVerified
  const city = CITIES.find((c) => c.id === s.city)!

  return (
    <div>
      <Header back title={t('act.flash')} sub={`📍 ${city.name} · fix it fast, pay safely`} />
      <div className="flex flex-col gap-3 px-5">
        <button onClick={() => gate(1, 'Post a Flash request') && setParams({ new: '1' })} className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-yellow-300 via-orange-500 to-rose-600 p-5 text-start text-ink-950 shadow-xl shadow-orange-500/20">
          <motion.div className="absolute -top-8 -right-6 text-8xl opacity-20" animate={{ rotate: [0, 10, -10, 0] }} transition={{ repeat: Infinity, duration: 3 }}>⚡</motion.div>
          <p className="text-2xl font-extrabold">Need something fixed?</p>
          <p className="mt-1 text-sm font-medium text-ink-950/80">Washing machine, leak, phone screen, moving… post it in 10 seconds. Fixers nearby send offers.</p>
          <span className="chip mt-3 bg-ink-950 py-2 text-white"><Zap size={14} /> Post a Flash</span>
        </button>
        <div className="flex items-start gap-3 rounded-2xl bg-mint-400/10 p-3 text-xs text-slate-300">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-mint-300" />
          <span><b>Stay safe, pay inside Luda.</b> Your money waits in escrow and the fixer is paid only when you confirm the job is done. Cash deals outside the app can't be protected.</span>
        </div>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'nearby', label: `🔥 Nearby · ${others.length}` }, { value: 'mine', label: `🙋🏾 Mine${s.flash.length ? ` · ${s.flash.length}` : ''}` }, { value: 'gigs', label: `🛠️ My jobs${s.gigs.length ? ` · ${s.gigs.length}` : ''}` },
        ]} />

        {tab === 'nearby' && [...mine, ...others].map((f, i) => <ReqCard key={f.id} f={f} i={i} onOpen={() => setParams({ id: f.id })} />)}
        {tab === 'mine' && (s.flash.length ? s.flash.map((f, i) => <ReqCard key={f.id} f={f} i={i} onOpen={() => setParams({ id: f.id })} />)
          : <p className="card text-center text-sm text-slate-400">You haven't asked for help yet.</p>)}
        {tab === 'gigs' && (s.gigs.length ? s.gigs.map((g) => (
          <div key={g.reqId} className="card flex items-center gap-3">
            <span className="text-2xl">{g.emoji}</span>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{g.text}</p><p className="text-xs text-slate-400">for {g.from} · {fmt(g.price, 'TRY')} · ETA {g.eta}</p></div>
            <GigStatus g={g} />
          </div>
        )) : <p className="card text-center text-sm text-slate-400">Good with your hands? Tap "I can fix it" on a request to earn.</p>)}
      </div>
      <DemoNote />
      {open && <ReqSheet key={open.id} f={open} onClose={() => setParams({})} />}
      {posting && <PostFlash onClose={() => setParams({})} onPosted={(id) => setParams({ id })} />}
    </div>
  )
}

function GigStatus({ g }: { g: { reqId: string; status: string } }) {
  const { set } = useStore()
  if (g.status === 'sent') return <span className="chip bg-fg/5 text-slate-300">⏳ Waiting</span>
  if (g.status === 'accepted') return <button className="btn-primary px-3 py-2 text-xs" onClick={() => set((p) => ({ ...p, gigs: p.gigs.map((x) => (x.reqId === g.reqId ? { ...x, status: 'done', at: Date.now() } : x)) }))}>I've finished</button>
  if (g.status === 'done') return <span className="chip bg-gold-400/15 text-gold-300">Waiting for confirm</span>
  return <span className="chip bg-mint-400/15 text-mint-300">✓ Paid</span>
}

function ReqCard({ f, i, onOpen }: { f: FlashReq; i: number; onOpen: () => void }) {
  const { s } = useStore()
  const offered = s.gigs.some((g) => g.reqId === f.id)
  const visibleOffers = f.offers.filter((o) => o.at <= Date.now()).length
  return (
    <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} onClick={onOpen} className="card flex items-center gap-3 text-start">
      <FlashBubble f={f} size={52} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-semibold">{f.text}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
          <span>{f.mine ? 'You' : `${f.flag} ${f.from}`}</span><span><MapPin size={10} className="inline" /> {f.area}</span><span>{ago(f.ts)}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {f.urgent && <span className="chip bg-rose-500 py-0.5 text-[10px] text-white">URGENT</span>}
          {f.mine && f.status === 'open' && <span className="chip bg-mint-400/15 py-0.5 text-[10px] text-mint-300">{visibleOffers} offer{visibleOffers === 1 ? '' : 's'}</span>}
          {f.mine && f.status === 'escrow' && <span className="chip bg-fuchsia-500/15 py-0.5 text-[10px] text-fuchsia-300">🔒 In escrow</span>}
          {f.mine && f.status === 'done' && <span className="chip bg-mint-400/15 py-0.5 text-[10px] text-mint-300">✓ Done</span>}
          {offered && <span className="chip bg-sky-400/15 py-0.5 text-[10px] text-sky-300">Offer sent</span>}
        </div>
      </div>
    </motion.button>
  )
}

function PostFlash({ onClose, onPosted }: { onClose: () => void; onPosted: (id: string) => void }) {
  const { s, set, reward, allow } = useStore()
  const areas = AREAS[s.city] ?? AREAS.lefkosa
  const [text, setText] = useState('')
  const [area, setArea] = useState(areas[0])
  const [budget, setBudget] = useState('')
  const [urgent, setUrgent] = useState(true)
  const [cat, setCat] = useState<FlashCat | null>(null)
  const [err, setErr] = useState('')
  const [auto, autoEmoji] = detectCat(text)
  const chosen = cat ?? auto
  const emoji = cat ? FLASH_CATS.find((c) => c[0] === cat)?.[1] ?? '⚡' : autoEmoji

  const post = () => {
    const c = checkText(text)
    if (!c.ok) return setErr(c.scam ? `Blocked: ${c.scam}` : `Please remove inappropriate words (${c.bad.join(', ')})`)
    if (!allow('flash', text)) return
    const id = `myfl-${uid()}`
    const base = { id, text: text.trim(), cat: chosen, budget: +budget || undefined }
    const f: FlashReq = { ...base, emoji, city: s.city, area, urgent, from: s.name, flag: '', ts: Date.now(), mine: true, offers: demoOffers(base), status: 'open' }
    set((p) => ({ ...p, flash: [f, ...p.flash] }))
    reward(s.quests.includes('flash') ? 10 : 40, { quest: 'flash', badge: 'flash_asker', title: 'Flash posted! Fixers are being notified' })
    onPosted(id)
  }

  return (
    <Sheet open onClose={onClose} title="⚡ Post a Flash">
      {!s.phoneVerified && !s.isAdmin ? (
        <div className="flex flex-col gap-3"><p className="text-sm text-slate-300">One quick phone check keeps fake requests out.</p><PhoneVerify compact /></div>
      ) : (
        <div className="flex flex-col gap-3">
          <textarea autoFocus className="input min-h-24 text-base" maxLength={160} placeholder="e.g. My washing machine stopped spinning, need someone today" value={text} onChange={(e) => { setText(e.target.value); setErr('') }} />
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
            {[...FLASH_CATS.map(([c, e]) => [c, e] as const), ['Other', '⚡'] as const].map(([c, e]) => (
              <button key={c} onClick={() => setCat(c)} className={`chip shrink-0 py-2 ${chosen === c ? 'bg-gradient-to-r from-yellow-300 to-orange-500 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{e} {c}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={area} onChange={(e) => setArea(e.target.value)}>{areas.map((a) => <option key={a}>{a}</option>)}</select>
            <div className="relative"><span className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400">₺</span>
              <input className="input ps-8" inputMode="numeric" placeholder="Budget (optional)" value={budget} onChange={(e) => setBudget(e.target.value.replace(/\D/g, ''))} /></div>
          </div>
          <button onClick={() => setUrgent(!urgent)} className={`chip w-fit py-2 ${urgent ? 'bg-rose-500 text-white' : 'bg-fg/5 text-slate-400'}`}><Zap size={14} /> Urgent: flash it to everyone nearby</button>
          {err && <p className="text-sm text-rose-300">⚠️ {err}</p>}
          <button className="btn-gold py-4" disabled={text.trim().length < 8} onClick={post}><Zap size={18} /> Flash it</button>
          <p className="text-center text-[11px] text-slate-500">Visible for 24 hours. Your exact address is only shared with the fixer you accept.</p>
        </div>
      )}
    </Sheet>
  )
}

function ReqSheet({ f, onClose }: { f: FlashReq; onClose: () => void }) {
  return f.mine ? <MyRequest f={f} onClose={onClose} /> : <OthersRequest f={f} onClose={onClose} />
}

function Stars({ value, onPick }: { value: number; onPick?: (n: number) => void }) {
  return <div className="flex gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => onPick?.(n)} disabled={!onPick} aria-label={`${n} stars`}><Star size={28} className={n <= value ? 'fill-gold-400 text-gold-400' : 'text-slate-600'} /></button>)}</div>
}

function MyRequest({ f, onClose }: { f: FlashReq; onClose: () => void }) {
  const { s, set, addTx, reward, checkPin, toast, gate } = useStore()
  const [, tick] = useState(0)
  const [choose, setChoose] = useState<Offer | null>(null)
  const [cashOk, setCashOk] = useState(false)
  const [pin, setPin] = useState<'lock' | 'release' | null>(null)
  const [err, setErr] = useState('')
  const [rated, setRated] = useState(f.rating ?? 0)
  const [appeal, setAppeal] = useState(false)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [])
  const offers = f.offers.filter((o) => o.at <= Date.now())
  const pending = f.offers.length - offers.length
  const acc = f.offers.find((o) => o.id === f.accepted)
  const bal = s.balances.TRY ?? 0
  const update = (patch: Partial<FlashReq>) => set((p) => ({ ...p, flash: p.flash.map((x) => (x.id === f.id ? { ...x, ...patch } : x)) }))

  const lock = async (p: string) => {
    if (!(await checkPin(p))) return setErr('Wrong PIN')
    set((st) => ({ ...st, balances: { ...st.balances, TRY: (st.balances.TRY ?? 0) - choose!.price }, flash: st.flash.map((x) => (x.id === f.id ? { ...x, status: 'escrow', accepted: choose!.id } : x)) }))
    addTx({ type: 'p2p', amount: -choose!.price, currency: 'TRY', label: `Escrow · ${choose!.fixer} (Flash)`, meta: f.cat })
    toast({ title: `${fmt(choose!.price, 'TRY')} locked in escrow. ${choose!.fixer} is on the way`, emoji: '🔒' })
    setPin(null); setChoose(null)
  }
  const release = async (p: string) => {
    if (!(await checkPin(p))) return setErr('Wrong PIN')
    update({ status: 'done' })
    reward(30, { title: `${fmt(acc!.price, 'TRY')} released to ${acc!.fixer}` })
    setPin(null)
  }
  const steps = [
    ['Posted', true], ['Offer accepted', !!f.accepted], [f.status === 'cash' ? 'Paying cash (not protected)' : 'Money safe in escrow', ['escrow', 'cash', 'done', 'disputed'].includes(f.status)], ['Job done & fixer paid', f.status === 'done'],
  ] as const

  return (
    <Sheet open onClose={onClose} title="Your Flash">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3"><FlashBubble f={f} size={56} /><div><p className="font-semibold">{f.text}</p><p className="text-xs text-slate-400">{f.area} · {ago(f.ts)}{f.budget ? ` · budget ₺${f.budget}` : ''}</p></div></div>
        <div className="flex justify-between">{steps.map(([l, ok], i) => (
          <div key={l} className="flex flex-1 flex-col items-center gap-1 text-center">
            <CheckCircle2 size={20} className={ok ? 'text-mint-400' : 'text-slate-600'} /><span className={`text-[10px] leading-tight ${ok ? 'text-slate-200' : 'text-slate-500'}`}>{l}</span>
            {i < steps.length - 1 && null}
          </div>
        ))}</div>

        {f.status === 'open' && (
          <>
            <p className="label">Offers from fixers nearby</p>
            <AnimatePresence>
              {offers.map((o) => (
                <motion.div key={o.id} initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="card">
                  <div className="flex items-center gap-3">
                    <div className="grid size-11 place-items-center rounded-2xl bg-ink-700 text-xl">{o.flag}</div>
                    <div className="flex-1"><Link to={`/u/${encodeURIComponent(o.fixer)}`} className="flex items-center gap-1 font-semibold">{o.fixer}{o.verified && <BadgeCheck size={14} className="text-mint-400" />}<span className="text-xs text-mint-300">profile ›</span></Link>
                      <p className="flex items-center gap-1 text-xs text-slate-400"><Star size={11} className="fill-gold-400 text-gold-400" />{o.rating} · {o.jobs} jobs · <Clock size={11} /> {o.eta}</p></div>
                    <p className="text-xl font-extrabold text-mint-300">₺{o.price}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">"{o.note}"</p>
                  <button className="btn-primary mt-3 w-full py-2.5 text-sm" onClick={() => { setChoose(o); setCashOk(false); setErr('') }}>Accept ₺{o.price}</button>
                </motion.div>
              ))}
            </AnimatePresence>
            {pending > 0 && <p className="flex items-center justify-center gap-2 text-sm text-slate-400"><span className="size-2 animate-ping rounded-full bg-gold-400" /> Notifying fixers nearby… more offers coming</p>}
            <button className="text-xs text-slate-500 underline" onClick={() => { update({ status: 'cancelled' }); onClose() }}>Cancel request</button>
          </>
        )}

        {acc && f.status !== 'open' && (
          <div className="card flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-ink-700 text-xl">{acc.flag}</div>
            <div className="flex-1"><p className="font-semibold">{acc.fixer}</p><p className="text-xs text-slate-400">ETA {acc.eta} · agreed ₺{acc.price}</p></div>
            <a href="tel:+905330000000" className="chip bg-mint-400/15 py-2 text-mint-300">Call</a>
          </div>
        )}
        {acc && ['escrow', 'cash', 'disputed'].includes(f.status) && (
          <TradeChat threadKey={`flash-${f.id}`} name={acc.fixer} flag={acc.flag} onAppeal={f.status === 'escrow' ? () => setAppeal(true) : undefined}
            intro={f.status === 'cash' ? 'Cash deal: Luda can’t refund cash payments.' : undefined} />
        )}
        {appeal && acc && <OpenDispute kind="flash" refId={f.id} title={`Flash job: ${f.text.slice(0, 40)}`} counterparty={acc.fixer} amount={acc.price} cur="TRY" onClose={() => setAppeal(false)} onOpened={() => update({ status: 'disputed' })} />}
        {f.status === 'escrow' && (
          <>
            <div className="flex items-center gap-3 rounded-2xl bg-fuchsia-500/10 p-3 text-sm"><Lock size={18} className="text-fuchsia-300" /> {fmt(acc!.price, 'TRY')} is safe in escrow. Release it only when the job is really done.</div>
            {pin === 'release' ? <div className="flex flex-col items-center gap-2"><p className="text-sm text-slate-300">Enter PIN to pay {acc!.fixer}</p><PinPad error={err} onDone={release} /></div> : <>
              <button className="btn-primary py-4" onClick={() => { setPin('release'); setErr('') }}>✅ Job done: release ₺{acc!.price}</button>
              <button className="btn bg-rose-500/10 text-sm text-rose-300" onClick={() => setAppeal(true)}><AlertTriangle size={16} /> Problem with the job: appeal</button>
            </>}
          </>
        )}
        {f.status === 'cash' && (
          <>
            <div className="flex items-start gap-3 rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100"><AlertTriangle size={18} className="shrink-0 text-gold-300" /> You chose cash. Pay only after the job is done. Luda can't refund or help with disputes for cash payments.</div>
            <button className="btn-primary py-4" onClick={() => update({ status: 'done' })}>Job done (paid cash)</button>
          </>
        )}
        {f.status === 'disputed' && (() => { const c = s.disputes.find((x) => x.refId === f.id); return (
          <Link to={c ? `/disputes/${c.id}` : '/disputes'} className="flex items-center gap-2 rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200"><AlertTriangle size={16} /> Appeal open: escrow frozen. <span className="ms-auto underline">View case</span></Link>) })()}
        {f.status === 'done' && (
          <div className="flex flex-col items-center gap-2 rounded-3xl bg-mint-400/10 p-5 text-center">
            <p className="text-lg font-bold">All done 🎉</p>
            <p className="text-sm text-slate-300">How was {acc?.fixer}?</p>
            <Stars value={rated} onPick={rated ? undefined : (n) => { setRated(n); update({ rating: n }); set((st) => ({ ...st, reviews: [{ id: `rev-${f.id}`, about: acc!.fixer, by: st.name, stars: n, text: '', tags: [], ts: Date.now(), context: 'Flash job' }, ...st.reviews] })); reward(15, { badge: 'critic', title: 'Thanks for rating' }) }} />
          </div>
        )}

        <Sheet open={!!choose} onClose={() => setChoose(null)} title={`Pay ${choose?.fixer ?? ''}`}>
          {choose && (pin === 'lock' ? (
            <div className="flex flex-col items-center gap-2"><p className="text-sm text-slate-300">Lock ₺{choose.price} in escrow</p><PinPad error={err} onDone={lock} /></div>
          ) : (
            <div className="flex flex-col gap-3">
              <button disabled={bal < choose.price} onClick={() => { if (!gate(2, 'Escrow-protected payments')) return; setPin('lock'); setErr('') }} className="glass flex items-start gap-3 rounded-2xl border-mint-400/60 bg-mint-400/10 p-4 text-start disabled:opacity-50">
                <ShieldCheck className="shrink-0 text-mint-300" />
                <span><span className="flex items-center gap-2 font-semibold">Pay with Luda escrow <span className="chip bg-mint-400 py-0.5 text-[10px] text-ink-950">SAFEST</span></span>
                  <span className="text-xs text-slate-400">₺{choose.price} is held safely and released only when you confirm the job is done. Disputes covered.</span></span>
              </button>
              {bal < choose.price && <p className="text-xs text-rose-300">Wallet: {fmt(bal, 'TRY')}. <Link to="/wallet?a=deposit" className="underline">Top up</Link> to use escrow.</p>}
              <div className="rounded-2xl border border-fg/10 p-4">
                <p className="flex items-center gap-2 font-semibold"><Banknote size={18} className="text-slate-400" /> Pay cash</p>
                <p className="mt-1 text-xs text-slate-400">Possible, but <b>not protected</b>: no refund, no dispute help. We strongly recommend escrow.</p>
                <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 accent-amber-500" checked={cashOk} onChange={(e) => setCashOk(e.target.checked)} /> I understand Luda can't protect cash deals.</label>
                <button className="btn-ghost mt-2 w-full py-2.5 text-sm" disabled={!cashOk} onClick={() => { update({ status: 'cash', accepted: choose.id }); setChoose(null) }}>Continue with cash</button>
              </div>
            </div>
          ))}
        </Sheet>
      </div>
    </Sheet>
  )
}

function OthersRequest({ f, onClose }: { f: FlashReq; onClose: () => void }) {
  const { s, set, reward, toast, gate, allow } = useStore()
  const mine = s.gigs.find((g) => g.reqId === f.id)
  const [price, setPrice] = useState(String(f.budget ?? ''))
  const [eta, setEta] = useState('Within 1 hour')
  const [sent, setSent] = useState(false)
  const offer = () => {
    set((p) => ({ ...p, gigs: [{ reqId: f.id, text: f.text, emoji: f.emoji, from: f.from, price: +price, eta, status: 'sent', at: Date.now() }, ...p.gigs] }))
    reward(10, { title: 'Offer sent' }); setSent(true)
  }
  return (
    <Sheet open onClose={onClose} title={`${f.flag} ${f.from} needs help`}>
      {sent ? <Success title="Offer sent ⚡" sub={`If ${f.from} accepts, the money goes into escrow and you're paid as soon as they confirm the job is done. Track it in "My jobs".`} onClose={onClose} /> : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3"><FlashBubble f={f} size={56} /><div><p className="font-semibold">{f.text}</p><p className="text-xs text-slate-400"><MapPin size={10} className="inline" /> {f.area} · {ago(f.ts)}{f.budget ? ` · budget ₺${f.budget}` : ''}</p></div></div>
          {mine ? <div className="flex items-center justify-between rounded-2xl bg-sky-400/10 p-3 text-sm text-sky-100"><span>Your offer: ₺{mine.price} · {mine.eta}</span><GigStatus g={mine} /></div> : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative"><span className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400">₺</span>
                  <input className="input ps-8 text-lg font-bold" inputMode="numeric" placeholder="Your price" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} /></div>
                <select className="input" value={eta} onChange={(e) => setEta(e.target.value)}>{['Within 1 hour', 'Today', 'Tomorrow', 'This weekend'].map((x) => <option key={x}>{x}</option>)}</select>
              </div>
              <button className="btn-gold py-4" disabled={!+price} onClick={() => gate(1, 'Offer to fix things') && allow('offer') && offer()}><Wrench size={18} /> I can fix it: send offer</button>
              <p className="flex items-start gap-2 text-[11px] text-slate-500"><ShieldCheck size={14} className="shrink-0 text-mint-400" /> Get paid through Luda escrow: the money is already locked before you start, so you're never left unpaid.</p>
            </>
          )}
          <button className="text-xs text-slate-500 underline" onClick={() => { if (!allow('report')) return; set((p) => ({ ...p, reports: [...p.reports, f.id] })); toast({ title: 'Reported. Thanks for keeping Luda safe', emoji: '🛡️' }); onClose() }}>Report this request</button>
        </div>
      )}
    </Sheet>
  )
}
