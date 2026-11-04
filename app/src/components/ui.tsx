import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, Delete, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { LIVE } from '../lib/live'

export function Header({ title, back, right, sub }: { title: string; back?: boolean; right?: ReactNode; sub?: string }) {
  const nav = useNavigate()
  const loc = useLocation()
  // If this screen was opened directly (no history), "back" goes home instead of doing nothing.
  const goBack = () => (loc.key === 'default' ? nav('/') : nav(-1))
  return (
    <div className="pt-safe flex items-center gap-3 px-5 pb-4">
      {back && (
        <button onClick={goBack} className="glass grid size-10 place-items-center rounded-2xl rtl:rotate-180" aria-label="Back">
          <ChevronLeft size={20} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-extrabold tracking-tight">{title}</h1>
        {sub && <p className="text-sm text-slate-400">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

// While any sheet is open the page behind it can't scroll. Phones scroll the page when the keyboard opens; without
// this the sheet was left pushed up and cut off after the keyboard closed (owner's report on the support form).
let openSheets = 0, savedY = 0
function lockPage() {
  if (openSheets++ === 0) { savedY = window.scrollY; document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden' }
}
function unlockPage() {
  if (--openSheets === 0) { document.documentElement.style.overflow = ''; document.body.style.overflow = ''; window.scrollTo(0, savedY) }
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    lockPage()
    const vv = window.visualViewport
    // Keyboard closed (or rotated): put the page back where it was, so the sheet sits on the bottom again.
    const settle = () => { if (!vv || vv.height > window.innerHeight * 0.8) window.scrollTo(0, savedY) }
    // A field gets focus: keep it in view inside the sheet instead of letting the page jump.
    const focus = (e: FocusEvent) => {
      const t = e.target as HTMLElement
      if (t?.matches?.('input, textarea, select')) setTimeout(() => t.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
    }
    const el = box.current
    vv?.addEventListener('resize', settle)
    el?.addEventListener('focusin', focus)
    window.addEventListener('focusout', settle)
    return () => { vv?.removeEventListener('resize', settle); el?.removeEventListener('focusin', focus); window.removeEventListener('focusout', settle); unlockPage() }
  }, [open])
  // Always drawn on top of the whole screen (portal to <body>). A sheet opened from inside another sheet used to be
  // trapped in the outer sheet's box (stuck at the top, cut off, couldn't scroll) — owner's report on 'Problem?'.
  return createPortal((
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div ref={box}
            className="pb-safe relative max-h-[92dvh] w-full max-w-app overflow-y-auto overscroll-contain rounded-t-[2rem] border-t border-fg/10 bg-ink-900 px-5 pt-3 shadow-2xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Title stays pinned while the sheet scrolls, so Close is always reachable. */}
            <div className="sticky top-0 z-10 -mx-5 -mt-3 mb-3 bg-ink-900 px-5 pb-3 pt-3">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-fg/15" />
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">{title}</h2>
                <button onClick={onClose} className="glass grid size-9 shrink-0 place-items-center rounded-xl" aria-label="Close"><X size={18} /></button>
              </div>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  ), document.body)
}

/** 4-digit PIN pad. Calls onDone with the entered PIN. */
/** Number pad. length 4 = payment PIN, length 6 = sign-in code. */
export function PinPad({ onDone, error, length = 4 }: { onDone: (pin: string) => void; error?: string; length?: number }) {
  const [pin, setPin] = useState('')
  const cb = useRef(onDone)
  useEffect(() => { cb.current = onDone })
  useEffect(() => {
    if (pin.length !== length) return
    const id = setTimeout(() => { cb.current(pin); setPin('') }, 120)
    return () => clearTimeout(id)
  }, [pin, length])
  useEffect(() => { if (error) setPin('') }, [error])
  const press = (d: string) => setPin((p) => (p.length < length ? p + d : p))
  return (
    <div className="flex w-full flex-col items-center gap-6">
      <motion.div className={`flex ${length > 4 ? 'gap-3' : 'gap-4'}`} animate={error ? { x: [0, -10, 10, -6, 6, 0] } : {}} key={error}>
        {Array.from({ length }, (_, i) => i).map((i) => (
          <div key={i} className={`size-4 rounded-full transition ${i < pin.length ? 'scale-110 bg-mint-400 shadow-[0_0_12px] shadow-mint-400' : 'bg-fg/15'}`} />
        ))}
      </motion.div>
      {error && <p className="-mt-3 text-sm text-rose-400">{error}</p>}
      <div className="grid w-full max-w-xs grid-cols-3 gap-3" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k) =>
          k === '' ? <div key="e" /> : (
            <button key={k} onClick={() => (k === '⌫' ? setPin((p) => p.slice(0, -1)) : press(k))}
              className="glass grid h-14 place-items-center rounded-2xl text-xl font-semibold active:scale-95 active:bg-fg/10">
              {k === '⌫' ? <Delete size={20} /> : k}
            </button>
          ))}
      </div>
    </div>
  )
}

export function Toasts() {
  const { toasts } = useStore()
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((x) => (
          <motion.div key={x.id} initial={{ y: -40, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0 }}
            className="flex items-center gap-3 rounded-2xl border border-fg/10 bg-ink-800/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
            <span className="text-xl">{x.emoji ?? '✨'}</span>
            <span className="text-sm font-semibold">{x.title}</span>
            {x.xp ? <span className="chip bg-gold-400/15 text-gold-300">+{x.xp} XP</span> : null}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export function Ring({ value, size = 56, stroke = 5, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#fbbf24" /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.08)" strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke="url(#ring)" strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.min(1, value)) }} transition={{ duration: 1 }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

export function Burst({ show }: { show: boolean }) {
  const pieces = Array.from({ length: 24 })
  return (
    <AnimatePresence>
      {show && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {pieces.map((_, i) => {
            const a = (i / pieces.length) * Math.PI * 2
            return (
              <motion.span key={i} className="absolute top-1/2 left-1/2 size-2 rounded-sm"
                style={{ background: ['#34d399', '#fbbf24', '#f472b6', '#60a5fa'][i % 4] }}
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{ x: Math.cos(a) * 140, y: Math.sin(a) * 140, opacity: 0, rotate: 360 }}
                transition={{ duration: 1.1, ease: 'easeOut' }} />
            )
          })}
        </div>
      )}
    </AnimatePresence>
  )
}

export function Success({ title, sub, onClose }: { title: string; sub?: string; onClose: () => void }) {
  return (
    <div className="relative flex flex-col items-center gap-3 py-6 text-center">
      <Burst show />
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10 }}
        className="grid size-20 place-items-center rounded-full bg-gradient-to-br from-mint-400 to-emerald-600 text-4xl shadow-xl shadow-emerald-500/30">✓</motion.div>
      <h3 className="text-xl font-bold">{title}</h3>
      {sub && <p className="text-sm text-slate-400">{sub}</p>}
      <button className="btn-primary mt-3 w-full" onClick={onClose}>OK</button>
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="glass relative flex rounded-2xl p-1">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className="relative z-10 flex-1 py-2.5 text-sm font-semibold">
          {value === o.value && <motion.div layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 -z-10 rounded-xl bg-fg/10" />}
          <span className={value === o.value ? 'text-slate-100' : 'text-slate-400'}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function DemoNote() {
  const { t } = useStore()
  if (LIVE) return null // never tell real-money users it's a demo
  return <p className="mx-auto mt-2 w-fit rounded-full bg-gold-400/10 px-3 py-1 text-[11px] font-medium text-gold-300">{t('common.demo')}</p>
}
