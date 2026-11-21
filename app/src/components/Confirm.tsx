import { motion } from 'framer-motion'
import { AlertTriangle, Check, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Sheet } from './ui'

/** Press-and-hold button: prevents accidental taps on irreversible actions. */
export function HoldButton({ label, onDone, disabled, danger, ms = 1500 }: { label: string; onDone: () => void; disabled?: boolean; danger?: boolean; ms?: number }) {
  const [p, setP] = useState(0)
  const start = useRef(0)
  const raf = useRef(0)
  const done = useRef(false)
  const stop = () => { cancelAnimationFrame(raf.current); if (!done.current) setP(0) }
  const begin = () => {
    if (disabled) return
    done.current = false; start.current = performance.now()
    const tick = (t: number) => {
      const v = Math.min(1, (t - start.current) / ms); setP(v)
      if (v >= 1) { done.current = true; navigator.vibrate?.(30); onDone(); return }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  return (
    <button type="button" disabled={disabled} aria-label={`${label} (press and hold)`}
      onPointerDown={begin} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); begin() } }} onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative w-full touch-none select-none overflow-hidden rounded-2xl py-4 font-bold transition disabled:opacity-40 ${danger ? 'bg-rose-500/20 text-rose-100' : 'bg-mint-400/20 text-mint-100'}`}>
      <motion.span className={`absolute inset-y-0 start-0 ${danger ? 'bg-rose-500' : 'bg-gradient-to-r from-mint-400 to-emerald-500'}`} style={{ width: `${p * 100}%` }} />
      <span className={`relative ${p > 0.5 ? (danger ? 'text-white' : 'text-ink-950') : ''}`}>{p >= 1 ? '✓ Confirmed' : p > 0 ? 'Keep holding…' : `Press & hold: ${label}`}</span>
    </button>
  )
}

export interface ConfirmProps {
  title: string
  /** What exactly is about to happen. */
  summary: [string, ReactNode][]
  /** Every box must be ticked. */
  checks: string[]
  /** Optional text the user must type (e.g. the amount) for irreversible steps. */
  typeToConfirm?: string
  warning?: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** "Double-check before you continue": summary + checklist + (optional) typed confirmation + press-and-hold. */
export function ConfirmSheet({ title, summary, checks, typeToConfirm, warning, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  const [ticked, setTicked] = useState<boolean[]>(() => checks.map(() => false))
  const [typed, setTyped] = useState('')
  const allTicked = ticked.every(Boolean)
  const typedOk = !typeToConfirm || typed.replace(/[\s,.₺]/g, '') === typeToConfirm.replace(/[\s,.₺]/g, '')
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2 rounded-2xl border border-gold-400/40 bg-gold-400/10 p-3 text-sm text-gold-100">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-gold-300" />
          <span>{warning ?? 'Please double-check everything below. Luda can’t undo this once it’s done.'}</span>
        </div>
        <div className="rounded-2xl bg-fg/[0.04] p-3 text-sm">
          {summary.map(([k, v]) => <div key={k} className="flex items-start justify-between gap-3 py-1"><span className="text-slate-400">{k}</span><span className="text-end font-semibold">{v}</span></div>)}
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="label">Tick each one to confirm</p>
          {checks.map((c, i) => (
            <button key={c} onClick={() => setTicked(ticked.map((x, j) => (j === i ? !x : x)))}
              className={`flex items-start gap-3 rounded-xl p-2.5 text-start text-sm transition ${ticked[i] ? 'bg-mint-400/10' : 'bg-fg/[0.03]'}`}>
              <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${ticked[i] ? 'border-mint-400 bg-mint-400 text-ink-950' : 'border-fg/25'}`}>{ticked[i] && <Check size={13} strokeWidth={3} />}</span>
              <span>{c}</span>
            </button>
          ))}
        </div>
        {typeToConfirm && (
          <label className="grid gap-1 text-xs text-slate-400"><span>Type <b className="font-mono text-sm text-slate-100">{typeToConfirm}</b> to confirm</span>
            <input className={`input font-mono text-lg ${typed && !typedOk ? 'border-rose-400/60' : ''}`} inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={typeToConfirm} /></label>
        )}
        <HoldButton label={confirmLabel} danger={danger} disabled={!allTicked || !typedOk} onDone={onConfirm} />
        {!allTicked && <p className="flex items-center justify-center gap-1 text-[11px] text-slate-500"><ShieldAlert size={12} /> Tick every box{typeToConfirm ? ' and type the amount' : ''} to continue</p>}
      </div>
    </Sheet>
  )
}

/** Always-visible reminder on exchange screens. */
export function CrossCheck({ text }: { text?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-gold-400/30 bg-gold-400/[0.07] p-3 text-xs text-gold-100">
      <ShieldAlert size={16} className="mt-0.5 shrink-0 text-gold-300" />
      <span>{text ?? 'Always cross-check: the amount, the rate, the person and the cash. Never release before you’ve counted. If anything feels wrong, stop and tap Appeal.'}</span>
    </div>
  )
}
