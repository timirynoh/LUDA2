import { AnimatePresence, motion } from 'framer-motion'
import { Camera, Check, ChevronRight, IdCard, Loader2, Lock, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { FEATURES, TIERS, tierOf, type Tier } from '../lib/access'
import { useStore } from '../lib/store'
import { PhoneVerify } from './PhoneVerify'
import { Ring, Sheet } from './ui'

/** Inline ID + selfie check (demo: any photo or "skip"). */
export function IdVerify() {
  const { s, set, reward } = useStore()
  const [step, setStep] = useState<'id' | 'selfie' | 'checking'>('id')
  if (s.verified) return <p className="flex items-center gap-1 text-xs text-mint-300"><Check size={14} /> ID verified</p>
  const next = async () => {
    if (step === 'id') return setStep('selfie')
    setStep('checking')
    await new Promise((r) => setTimeout(r, 1600))
    set((p) => ({ ...p, verified: true }))
    reward(150, { quest: 'verify', badge: 'verified', title: 'Identity verified' })
  }
  if (step === 'checking') return <p className="flex items-center gap-2 text-sm text-slate-300"><Loader2 size={16} className="animate-spin text-mint-300" /> Matching your face to your document…</p>
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-400">{step === 'id' ? 'Step 1/2 · Photo of your passport or residence card' : 'Step 2/2 · Quick selfie to prove it’s you'}</p>
      <label className="btn-primary cursor-pointer py-2.5 text-sm">{step === 'id' ? <IdCard size={16} /> : <Camera size={16} />} {step === 'id' ? 'Scan / upload ID' : 'Take selfie'}
        <input type="file" accept="image/*" capture={step === 'id' ? 'environment' : 'user'} className="hidden" onChange={next} /></label>
      <button className="text-[11px] text-slate-500 underline" onClick={next}>Skip (demo)</button>
    </div>
  )
}

function TierStep({ n, done, active, title, sub, children }: { n: number; done: boolean; active: boolean; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border p-3 ${done ? 'border-mint-400/30 bg-mint-400/5' : active ? 'border-fg/15 bg-fg/[0.04]' : 'border-fg/5 opacity-60'}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? 'bg-mint-400 text-ink-950' : 'bg-fg/10'}`}>{done ? <Check size={16} /> : n}</span>
        <div className="flex-1"><p className="text-sm font-semibold">{title}</p><p className="text-xs text-slate-400">{sub}</p></div>
      </div>
      {!done && active && children && <div className="mt-3 ps-11">{children}</div>}
    </div>
  )
}

/** Opens whenever someone taps something they haven't unlocked yet. */
export function UnlockSheet() {
  const { gateReq } = useStore()
  return gateReq ? <UnlockInner key={`${gateReq.tier}-${gateReq.what}`} /> : null
}

function UnlockInner() {
  const { s, gateReq: req, closeGate } = useStore()
  const gateReq = req!
  const tier = tierOf(s)
  const [startTier] = useState(tier)
  const done = tier >= gateReq.tier
  const unlocks = (t: Tier) => FEATURES.filter((f) => f.tier === t)
  return (
    <Sheet open onClose={closeGate} title={done ? 'Unlocked 🎉' : `🔓 Unlock: ${gateReq.what}`}>
      {done ? (
        <div className="relative flex flex-col items-center gap-3 py-4 text-center">
          <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring' }} className="text-6xl">{TIERS[tier].emoji}</motion.div>
          <p className="text-xl font-extrabold">You're {TIERS[tier].name}!</p>
          <p className="text-sm text-slate-400">{FEATURES.filter((f) => f.tier > startTier && f.tier <= tier).length} new things unlocked, including <b>{gateReq.what}</b>.</p>
          <button className="btn-primary mt-2 w-full py-4" onClick={closeGate}>Continue</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-300">You can look around freely. To <b>{gateReq.what.toLowerCase()}</b>, Luda needs to know you're a real person. It keeps scammers out and everyone safe.</p>
          <TierStep n={1} done={s.phoneVerified} active title="Verify your phone" sub={`30 seconds · unlocks ${unlocks(1).length} features`}><PhoneVerify compact /></TierStep>
          {gateReq.tier >= 2 && <TierStep n={2} done={s.verified} active={s.phoneVerified} title="Verify your ID + selfie" sub={`2 minutes · unlocks ${unlocks(2).length} money features`}><IdVerify /></TierStep>}
          <div className="rounded-2xl bg-fg/[0.03] p-3">
            <p className="label mb-2">You'll also unlock</p>
            <div className="flex flex-wrap gap-1.5">
              {FEATURES.filter((f) => f.tier > tier && f.tier <= gateReq.tier).map((f) => <span key={f.label} className="chip bg-fg/5 text-slate-300">{f.emoji} {f.label}</span>)}
            </div>
          </div>
          <p className="flex items-center justify-center gap-1 text-[11px] text-slate-500"><Lock size={10} /> Your documents are encrypted and only used for verification.</p>
        </div>
      )}
    </Sheet>
  )
}

/** Home card for people who haven't unlocked everything yet. */
export function UnlockCard() {
  const { s, gate } = useStore()
  const tier = tierOf(s)
  if (tier >= 2) return null
  const locked = FEATURES.filter((f) => f.tier > tier)
  const open = FEATURES.length - locked.length
  return (
    <motion.button initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} onClick={() => gate(2, 'Everything in Luda')}
      className="relative overflow-hidden rounded-[2rem] border border-fg/10 bg-gradient-to-br from-ink-700 to-ink-800 p-5 text-start">
      <div className="absolute -top-10 -right-10 size-40 rounded-full bg-mint-400/10 blur-2xl" />
      <div className="flex items-center gap-4">
        <Ring value={open / FEATURES.length} size={64} stroke={6}><span className="text-xl">{TIERS[tier].emoji}</span></Ring>
        <div className="flex-1">
          <p className="text-xs text-slate-400">You're an {TIERS[tier].name} · {open}/{FEATURES.length} unlocked</p>
          <p className="text-lg font-extrabold leading-tight">There's so much more you can do 🚀</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {locked.slice(0, 7).map((f) => (
          <span key={f.label} className="chip relative bg-fg/5 py-1.5 text-slate-300"><span className="opacity-60">{f.emoji}</span> {f.label}<Lock size={10} className="text-slate-500" /></span>
        ))}
        {locked.length > 7 && <span className="chip bg-fg/5 py-1.5 text-slate-400">+{locked.length - 7} more</span>}
      </div>
      <div className="mt-4 flex items-center gap-2">
        {[1, 2].map((t) => (
          <span key={t} className={`chip py-1.5 ${tier >= t ? 'bg-mint-400/15 text-mint-300' : 'bg-fg/5 text-slate-400'}`}>{tier >= t ? <Check size={12} /> : t}. {t === 1 ? 'Phone' : 'ID + selfie'}</span>
        ))}
        <span className="btn-primary ms-auto px-4 py-2 text-sm">Unlock <ChevronRight size={16} className="rtl:rotate-180" /></span>
      </div>
    </motion.button>
  )
}

const TOUR = [
  { emoji: '💰', title: 'Your money, sorted', points: ['Wallet in Lira, Naira, Cedi, CFA & more', 'Convert at live rates', 'SafeSwap: meet & exchange with escrow', 'Pay KIB-TEK, water & phone bills'] },
  { emoji: '🏝️', title: 'Your life in North Cyprus', points: ['Verified houses & roommates', 'Jobs & quick gigs', 'Flash help: get things fixed fast', 'Group chats & community events'] },
  { emoji: '🎓', title: 'Study & travel smarter', points: ['Timetable from a screenshot + reminders', 'Your school’s deadlines & fees', 'Cheaper bus & airport tickets', 'Residency permit guide & portal'] },
]

/** First-run tour: shows what the app can do, then invites verification. */
export function WelcomeTour() {
  const { s, set, gate } = useStore()
  const [i, setI] = useState(0)
  const done = () => set((p) => ({ ...p, toured: true }))
  if (s.toured) return null
  const last = i === TOUR.length
  return (
    <Sheet open onClose={done} title={last ? 'Unlock everything' : `Welcome to Luda, ${s.name} 👋`}>
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="flex flex-col gap-4">
          {!last ? (
            <>
              <div className="grid h-36 place-items-center rounded-3xl bg-gradient-to-br from-mint-400/20 via-emerald-500/10 to-gold-400/20 text-7xl">{TOUR[i].emoji}</div>
              <p className="text-2xl font-extrabold">{TOUR[i].title}</p>
              <ul className="grid gap-2">{TOUR[i].points.map((p) => <li key={p} className="flex items-center gap-2 text-sm"><Sparkles size={14} className="shrink-0 text-gold-300" />{p}</li>)}</ul>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-300">You can explore everything right now. Two quick checks unlock the rest and keep the community safe from scammers:</p>
              {[1, 2].map((t) => (
                <div key={t} className="flex items-center gap-3 rounded-2xl bg-fg/[0.03] p-3">
                  <span className={`grid size-11 place-items-center rounded-2xl bg-gradient-to-br ${TIERS[t].color} text-xl`}>{TIERS[t].emoji}</span>
                  <div className="flex-1"><p className="font-semibold">{TIERS[t].name}</p><p className="text-xs text-slate-400">{TIERS[t].how} · unlocks {FEATURES.filter((f) => f.tier === t).length} features</p></div>
                </div>
              ))}
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="mt-5 flex items-center gap-2">
        <div className="flex flex-1 gap-1.5">{[...TOUR, null].map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-6 bg-mint-400' : 'w-1.5 bg-fg/20'}`} />)}</div>
        {last ? <>
          <button className="btn-ghost px-4 py-2.5 text-sm" onClick={done}>Explore first</button>
          <button className="btn-primary px-4 py-2.5 text-sm" onClick={() => { done(); gate(2, 'Everything in Luda') }}>Unlock now</button>
        </> : <button className="btn-primary px-5 py-2.5 text-sm" onClick={() => setI(i + 1)}>Next</button>}
      </div>
    </Sheet>
  )
}

/** Celebrates tier upgrades wherever they happen. */
export function useTierCelebration() {
  const { s, reward } = useStore()
  const tier = tierOf(s)
  const prev = useRef(tier)
  useEffect(() => {
    if (tier > prev.current && tier >= 1 && prev.current < 1) reward(50, { quest: 'phone', title: `Unlocked ${FEATURES.filter((f) => f.tier === 1).length} features 📱` })
    prev.current = tier
  }, [tier, reward])
}
