import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { LogoMark } from './Logo'

const WARN_SECONDS = 30

/**
 * Inactivity protection: after `minutes` without touches/keys, ask "Are you still there?".
 * No answer within 30s (or coming back after the app was in the background that long) → lock.
 */
export function IdleGuard({ minutes, onLock }: { minutes: number; onLock: () => void }) {
  const [warn, setWarn] = useState(false)
  const [left, setLeft] = useState(WARN_SECONDS)
  const last = useRef(Date.now())
  const hiddenAt = useRef<number | null>(null)
  const limit = minutes * 60_000

  useEffect(() => {
    const touch = () => { if (!warn) last.current = Date.now() }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const onVis = () => {
      if (document.hidden) hiddenAt.current = Date.now()
      else if (hiddenAt.current && Date.now() - hiddenAt.current > limit) onLock()
      else hiddenAt.current = null
    }
    document.addEventListener('visibilitychange', onVis)
    const tick = setInterval(() => { if (!warn && Date.now() - last.current > limit) { setWarn(true); setLeft(WARN_SECONDS) } }, 1000)
    return () => { events.forEach((e) => window.removeEventListener(e, touch)); document.removeEventListener('visibilitychange', onVis); clearInterval(tick) }
  }, [warn, limit, onLock])

  useEffect(() => {
    if (!warn) return
    if (left <= 0) { setWarn(false); onLock(); return }
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [warn, left, onLock])

  const stay = () => { last.current = Date.now(); setWarn(false) }
  return (
    <AnimatePresence>
      {warn && (
        <motion.div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-6 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-[2rem] border border-fg/10 bg-ink-900 p-6 text-center shadow-2xl">
            <LogoMark size={52} className="mx-auto" />
            <p className="mt-4 text-xl font-extrabold">Are you still there? 👀</p>
            <p className="mt-1 text-sm text-slate-400">For your security, Luda will lock in</p>
            <div className="relative mx-auto my-4 grid size-24 place-items-center">
              <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" stroke="rgba(127,127,127,.2)" strokeWidth="8" fill="none" />
                <circle cx="50" cy="50" r="44" stroke="#34d399" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={276} strokeDashoffset={276 * (1 - left / WARN_SECONDS)} style={{ transition: 'stroke-dashoffset 1s linear' }} /></svg>
              <span className="text-3xl font-extrabold">{left}</span>
            </div>
            <button className="btn-primary w-full py-4" onClick={stay}>I'm still here</button>
            <button className="mt-3 text-sm text-slate-400" onClick={() => { setWarn(false); onLock() }}>Lock now</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
