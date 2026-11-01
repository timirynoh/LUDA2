// Small shared pieces for the real-money feature screens (bills, savings, marketplace, Flash).
import { AlertCircle, CheckCircle2, Clock3, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { api } from '../lib/live'
import { errMsg } from './LiveMoney'

/** Loads a GET route and lets the screen reload it after an action. */
export function useApi<T>(route: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => { if (route) api<T>('GET', route).then((r) => { setData(r); setErr('') }).catch((e) => setErr(errMsg(e))) }, [route])
  useEffect(() => { load() }, [load])
  return { data, err, reload: load }
}

export const lira = (minor: number) => `₺${(minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
export const toMinor = (v: string) => Math.round(Number(v.replace(/[^\d.]/g, '') || 0) * 100)
export const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const TONE = {
  wait: { c: 'bg-gold-400/15 text-gold-200', i: Clock3 },
  ok: { c: 'bg-mint-400/15 text-mint-200', i: CheckCircle2 },
  back: { c: 'bg-sky-400/15 text-sky-200', i: RotateCcw },
  bad: { c: 'bg-rose-500/15 text-rose-200', i: AlertCircle },
}
export function Pill({ tone, children }: { tone: keyof typeof TONE; children: ReactNode }) {
  const T = TONE[tone]
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${T.c}`}><T.i size={12} /> {children}</span>
}

/** "How it works" strip: 3 short steps. */
export function Steps({ steps }: { steps: [string, string][] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {steps.map(([e, t], i) => (
        <div key={i} className="rounded-2xl bg-fg/[0.04] p-3 text-center">
          <p className="text-xl">{e}</p>
          <p className="mt-1 text-[11px] leading-tight text-slate-300">{t}</p>
        </div>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; badge?: number }[] }) {
  return (
    <div className="glass flex gap-1 rounded-2xl p-1">
      {tabs.map((t) => (
        <button key={t.value} onClick={() => onChange(t.value)} className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${value === t.value ? 'bg-mint-400/20 text-mint-200' : 'text-slate-400'}`}>
          {t.label}{t.badge ? <span className="ms-1 rounded-full bg-gold-400 px-1.5 text-[10px] text-ink-950">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function Empty({ emoji, title, sub, action }: { emoji: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-fg/10 px-6 py-10 text-center">
      <span className="text-4xl">{emoji}</span>
      <p className="font-bold">{title}</p>
      {sub && <p className="text-sm text-slate-400">{sub}</p>}
      {action}
    </div>
  )
}
