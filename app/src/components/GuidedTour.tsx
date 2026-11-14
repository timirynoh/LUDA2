// Optional guided tour: highlights real parts of the screen one by one. Offered once to new people (skip = never asked again),
// and anyone can replay it from Profile or Help (fires the 'luda:tour' event).
import { AnimatePresence, motion } from 'framer-motion'
import { Compass, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'

interface Step { target: string; title: string; text: string; emoji: string }
const STEPS: Step[] = [
  { target: '[data-tour="balance"]', emoji: '💰', title: 'Your money', text: 'Your Naira and Lira balances. Tap Wallet to top up, withdraw, convert or send to a friend.' },
  { target: '[data-tour="actions"]', emoji: '⚡', title: 'Shortcuts', text: 'Your favourite actions. Tap Edit to choose which ones show here.' },
  { target: '[data-tour="nav/wallet"]', emoji: '👛', title: 'Wallet', text: 'Every top-up, payment and receipt. Protected by your PIN or fingerprint.' },
  { target: '[data-tour="nav/exchange"]', emoji: '💱', title: 'Exchange', text: 'Change Naira to Lira (and back) at a clear rate, shown before you confirm.' },
  { target: '[data-tour="nav/chats"]', emoji: '💬', title: 'Chats', text: 'Join groups for your country, university, church or mosque. Verified members can start their own.' },
  { target: '[data-tour="nav/more"]', emoji: '🧭', title: 'Everything else', text: 'Bus tickets, bills, housing, jobs, events, news, savings, market and residency help live here.' },
  { target: '[data-tour="search"]', emoji: '🔎', title: 'Search', text: 'Looking for something? Search finds any feature fast.' },
  { target: '[data-tour="inbox"]', emoji: '🔔', title: 'Notifications', text: 'Payments, replies from support and updates land here.' },
]
const PAD = 8

export function GuidedTour() {
  const { s, set } = useStore()
  const nav = useNavigate()
  const loc = useLocation()
  const [mode, setMode] = useState<'off' | 'offer' | 'run'>('off')
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  // First visit to Home after sign-in: offer the tour once.
  useEffect(() => {
    if (!s.toured && s.signedIn && loc.pathname === '/' && mode === 'off') { const t = setTimeout(() => setMode('offer'), 1200); return () => clearTimeout(t) }
  }, [s.toured, s.signedIn, loc.pathname, mode])
  useEffect(() => {
    const go = () => { nav('/'); setI(0); setTimeout(() => setMode('run'), 500) }
    window.addEventListener('luda:tour', go)
    return () => window.removeEventListener('luda:tour', go)
  }, [nav])

  const finish = useCallback(() => { setMode('off'); setRect(null); set((p) => ({ ...p, toured: true })) }, [set])
  const steps = STEPS
  const measure = useCallback(() => {
    if (mode !== 'run') return
    const el = document.querySelector(steps[i]?.target ?? '')
    if (!el) { setRect(null); return }
    setRect(el.getBoundingClientRect())
  }, [mode, i, steps])
  useLayoutEffect(() => {
    if (mode !== 'run') return
    const el = document.querySelector(steps[i]?.target ?? '')
    if (!el) { if (i < steps.length - 1) setI(i + 1); else finish(); return } // skip steps whose target isn't on screen
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = setTimeout(measure, 450)
    window.addEventListener('resize', measure); window.addEventListener('scroll', measure, true)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
  }, [mode, i, steps, measure, finish])

  if (mode === 'offer') return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-sm rounded-[2rem] border border-fg/10 bg-ink-900 p-5 shadow-2xl">
        <div className="grid h-28 place-items-center rounded-3xl bg-gradient-to-br from-mint-400/25 via-emerald-500/10 to-gold-400/20 text-6xl">🧭</div>
        <p className="mt-4 text-xl font-extrabold">Welcome to Luda, {s.name.split(' ')[0]} 👋</p>
        <p className="mt-1 text-sm text-slate-300">Want a 30-second tour of where everything is? You can skip it and replay it any time from your Profile.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="btn-ghost py-3 text-sm" onClick={finish}>Skip</button>
          <button className="btn-primary py-3 text-sm" onClick={() => { setI(0); setMode('run') }}><Compass size={16} /> Show me</button>
        </div>
      </motion.div>
    </div>
  )
  if (mode !== 'run') return null
  const st = steps[i]
  const vh = window.innerHeight, vw = window.innerWidth
  const below = rect ? rect.top + rect.height / 2 < vh / 2 : true
  const cardW = Math.min(340, vw - 32)
  const left = rect ? Math.min(Math.max(16, rect.left + rect.width / 2 - cardW / 2), vw - cardW - 16) : (vw - cardW) / 2
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label="App tour">
      {/* dim everything except the highlighted element */}
      {rect ? <motion.div layout transition={{ type: 'spring', damping: 26, stiffness: 260 }} className="pointer-events-none absolute rounded-2xl ring-2 ring-mint-300"
        style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 9999px rgba(3,7,18,.72)' }} />
        : <div className="absolute inset-0 bg-black/70" />}
      <div className="absolute inset-0" onClick={() => (i < steps.length - 1 ? setI(i + 1) : finish())} />
      <AnimatePresence mode="wait">
        <motion.div key={i} initial={{ opacity: 0, y: below ? -8 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          className="absolute rounded-3xl border border-fg/10 bg-ink-900 p-4 shadow-2xl"
          style={{ width: cardW, left, ...(rect ? (below ? { top: Math.min(rect.bottom + PAD + 12, vh - 220) } : { bottom: Math.min(vh - rect.top + PAD + 12, vh - 220) }) : { top: vh / 3 }) }}>
          <div className="flex items-start gap-3">
            <span className="text-3xl">{st.emoji}</span>
            <div className="min-w-0 flex-1"><p className="font-bold">{st.title}</p><p className="mt-0.5 text-sm text-slate-300">{st.text}</p></div>
            <button onClick={finish} aria-label="Close tour" className="grid size-8 shrink-0 place-items-center rounded-full bg-fg/[0.06]"><X size={15} /></button>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex flex-1 gap-1">{steps.map((_, k) => <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-mint-400' : 'w-1.5 bg-fg/20'}`} />)}</div>
            <button className="px-3 py-2 text-xs font-semibold text-slate-400" onClick={finish}>Skip</button>
            {i > 0 && <button className="btn-ghost px-3 py-2 text-xs" onClick={() => setI(i - 1)}>Back</button>}
            <button className="btn-primary px-4 py-2 text-xs" onClick={() => (i < steps.length - 1 ? setI(i + 1) : finish())}>{i < steps.length - 1 ? 'Next' : 'Done 🎉'}</button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/** Button that replays the tour (Profile, Help). */
export function TourButton({ className = 'btn-ghost py-3 text-sm' }: { className?: string }) {
  return <button className={className} onClick={() => window.dispatchEvent(new Event('luda:tour'))}><Compass size={16} /> Take the app tour</button>
}
