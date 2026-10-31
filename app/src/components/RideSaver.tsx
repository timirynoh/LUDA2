import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2, Ticket, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SAVER, TICKET_DISCOUNT } from '../config'
import { saverChecks, saverState } from '../lib/saver'
import { useStore } from '../lib/store'
import { PhoneVerify } from './PhoneVerify'
import { Sheet } from './ui'

/** Small status / promo strip for Ride Saver. */
export function SaverCard({ onOpen, dismissible }: { onOpen: () => void; dismissible?: boolean }) {
  const { s, set } = useStore()
  const st = saverState(s)
  if (dismissible && s.saver.status !== 'none') return null
  if (st.active) return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-violet-500/20 to-fuchsia-500/10 p-3 text-start">
      <span className="text-2xl">🎟️</span>
      <span className="flex-1 text-sm"><b>Ride Saver active</b><span className="block text-xs text-slate-400">{st.leftToday} discounted ticket{st.leftToday === 1 ? '' : 's'} left today · {st.leftMonth} this month</span></span>
      <span className="chip bg-mint-400/15 text-mint-300">−₺{TICKET_DISCOUNT.single}</span>
    </button>
  )
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-700 to-indigo-900 p-4 text-white">
      {dismissible && <button className="absolute end-3 top-3 text-white/60" aria-label="Not now" onClick={() => set((p) => ({ ...p, saver: { status: 'declined' } }))}><X size={16} /></button>}
      <p className="flex items-center gap-2 text-lg font-extrabold"><Ticket size={20} /> Ride for less with Luda</p>
      <p className="mt-1 text-sm text-white/80">{s.saver.status === 'member' && !st.active ? st.message : `Get ₺${TICKET_DISCOUNT.single} off one-way and ₺${TICKET_DISCOUNT.return} off return bus & airport tickets. Opt in, and we check your account automatically.`}</p>
      <button onClick={onOpen} className="btn mt-3 bg-white px-4 py-2 text-sm text-ink-950">{s.saver.status === 'member' ? 'See details' : 'Opt in to Ride Saver'}</button>
    </div>
  )
}

/** Opt-in + automatic selection flow. */
export function SaverSheet({ onClose }: { onClose: () => void }) {
  const { s, set, reward } = useStore()
  const [agree, setAgree] = useState(false)
  const [phase, setPhase] = useState<'intro' | 'checking' | 'result'>(s.saver.status === 'member' ? 'result' : 'intro')
  const [shown, setShown] = useState(0)
  const checks = saverChecks(s)
  const allOk = checks.every((c) => c.ok)

  // Reveal checks one by one, then select automatically.
  useEffect(() => {
    if (phase !== 'checking') return
    if (shown < checks.length) { const t = setTimeout(() => setShown(shown + 1), 450); return () => clearTimeout(t) }
    const t = setTimeout(() => {
      if (allOk && s.saver.status !== 'member') { set((p) => ({ ...p, saver: { status: 'member', joinedAt: Date.now() } })); reward(25, { badge: 'saver', title: "You're selected for Ride Saver" }) }
      setPhase('result')
    }, 400)
    return () => clearTimeout(t)
  }, [phase, shown, checks.length, allOk, s.saver.status, set, reward])
  // If the user fixes a failing check (e.g. verifies phone), re-run selection automatically.
  useEffect(() => { if (phase === 'result' && allOk && s.saver.status !== 'member') { setShown(0); setPhase('checking') } }, [phase, allOk, s.saver.status])

  const member = s.saver.status === 'member'
  return (
    <Sheet open onClose={onClose} title="🎟️ Luda Ride Saver">
      {phase === 'intro' ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-2xl bg-mint-400/10 p-3"><p className="text-2xl font-extrabold text-mint-300">−₺{TICKET_DISCOUNT.single}</p><p className="text-xs text-slate-400">one-way tickets</p></div>
            <div className="rounded-2xl bg-mint-400/10 p-3"><p className="text-2xl font-extrabold text-mint-300">−₺{TICKET_DISCOUNT.return}</p><p className="text-xs text-slate-400">return tickets</p></div>
          </div>
          <div className="rounded-2xl bg-fg/[0.03] p-4 text-sm">
            <p className="label mb-2">Fair-use rules</p>
            <ul className="grid gap-1.5 text-slate-300">
              <li>• Up to <b>{SAVER.perDay} discounted tickets a day</b> and <b>{SAVER.perMonth} a month</b></li>
              <li>• Discount covers <b>you + {SAVER.companions} companion</b> per ticket; extra seats pay normal price</li>
              <li>• Tickets carry your name and a <b>live QR that changes every 30s</b>. Screenshots don't work.</li>
              <li>• No refunds in the last {SAVER.noRefundMinutes} minutes. More than {SAVER.maxRefundsPerMonth} refunds a month pauses the discount.</li>
              <li>• Reselling or sharing discounted tickets = removal from Ride Saver</li>
            </ul>
          </div>
          <label className="flex items-start gap-3 rounded-2xl bg-fg/[0.03] p-3 text-xs text-slate-300">
            <input type="checkbox" className="mt-0.5 size-4 accent-emerald-500" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            I'll only use discounted tickets for my own travel and agree to the fair-use rules.
          </label>
          <button className="btn-primary py-4" disabled={!agree} onClick={() => { setShown(0); setPhase('checking') }}>Opt in & check my account</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {phase === 'checking' && <p className="flex items-center gap-2 text-sm text-slate-300"><Loader2 size={16} className="animate-spin text-mint-300" /> Checking your account automatically…</p>}
          {checks.map((c, i) => (
            <AnimatePresence key={c.key}>
              {(phase === 'result' || i < shown) && (
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={`rounded-2xl border p-3 ${c.ok ? 'border-mint-400/30 bg-mint-400/5' : 'border-rose-400/30 bg-rose-500/5'}`}>
                  <p className="flex items-center gap-2 text-sm">{c.ok ? <Check size={16} className="text-mint-300" /> : <X size={16} className="text-rose-300" />}{c.label}</p>
                  {!c.ok && c.fix === 'verify' && phase === 'result' && <div className="mt-2 ps-6"><PhoneVerify compact /></div>}
                </motion.div>
              )}
            </AnimatePresence>
          ))}
          {phase === 'result' && (member && allOk ? (
            <div className="relative mt-2 flex flex-col items-center gap-2 rounded-3xl bg-gradient-to-br from-violet-500/20 to-mint-400/10 p-5 text-center">
              <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} className="text-5xl">🎉</motion.p>
              <p className="text-lg font-extrabold">You're selected!</p>
              <p className="text-sm text-slate-300">Luda prices now apply automatically when you book.</p>
              <button className="btn-primary mt-2 w-full" onClick={onClose}>Book a ticket</button>
              <button className="text-xs text-slate-500 underline" onClick={() => { set((p) => ({ ...p, saver: { status: 'declined' } })); onClose() }}>Leave Ride Saver</button>
            </div>
          ) : !allOk && <p className="text-center text-sm text-slate-400">Fix the item{checks.filter((c) => !c.ok).length > 1 ? 's' : ''} above and we'll select you automatically.</p>)}
        </div>
      )}
    </Sheet>
  )
}
