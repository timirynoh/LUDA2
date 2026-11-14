import { Bell, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { COUNTRIES, CURRENCIES } from '../lib/data'
import { convert, fmt, useRates } from '../lib/fx'
import { uid, useStore } from '../lib/store'

/** "Tell me when ₦1,000 is worth more than ₺30." Values are TRY per 1,000 units (per 1 for USD/EUR/GBP). */
const unit = (cur: string) => (['USD', 'EUR', 'GBP'].includes(cur) ? 1 : 1000)

export function RateAlerts() {
  const { s, set, toast } = useStore()
  const { rates } = useRates()
  const home = COUNTRIES.find((c) => c.code === s.country)!
  const [cur, setCur] = useState(home.currency === 'TRY' ? 'NGN' : home.currency)
  const now = convert(rates, unit(cur), cur, 'TRY')
  const [op, setOp] = useState<'above' | 'below'>('above')
  const [target, setTarget] = useState((now * 1.03).toFixed(2))
  const add = () => {
    if (s.alerts.filter((a) => a.active).length >= 5) return toast({ title: 'Max 5 active alerts', emoji: '🔔' })
    set((p) => ({ ...p, alerts: [{ id: uid(), cur, op, target: +target, active: true }, ...p.alerts] }))
    toast({ title: 'Rate alert set 🔔', emoji: '✅' })
  }
  return (
    <div className="card">
      <p className="flex items-center gap-2 font-bold"><Bell size={18} className="text-gold-300" /> Rate alerts</p>
      <p className="mt-1 text-xs text-slate-400">Now: {unit(cur).toLocaleString()} {cur} = {fmt(now, 'TRY')}</p>
      <div className="mt-3 grid grid-cols-[auto_auto_1fr] gap-2">
        <select className="input w-auto py-2.5" value={cur} onChange={(e) => { setCur(e.target.value); setTarget((convert(rates, unit(e.target.value), e.target.value, 'TRY') * 1.03).toFixed(2)) }} aria-label="Currency">
          {Object.keys(CURRENCIES).filter((c) => c !== 'TRY').map((c) => <option key={c} value={c}>{CURRENCIES[c].flag} {c}</option>)}</select>
        <select className="input w-auto py-2.5" value={op} onChange={(e) => setOp(e.target.value as 'above' | 'below')} aria-label="Condition"><option value="above">rises above</option><option value="below">falls below</option></select>
        <input className="input py-2.5" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ''))} aria-label="Target in TRY" />
      </div>
      <button className="btn-gold mt-2 w-full py-2.5 text-sm" disabled={!+target} onClick={add}>Alert me</button>
      {s.alerts.map((a) => (
        <div key={a.id} className="mt-2 flex items-center gap-2 rounded-xl bg-fg/[0.03] px-3 py-2 text-sm">
          <span className="flex-1">{CURRENCIES[a.cur]?.flag} {unit(a.cur).toLocaleString()} {a.cur} {a.op === 'above' ? '≥' : '≤'} {fmt(a.target, 'TRY')}</span>
          <span className={`chip ${a.active ? 'bg-mint-400/15 text-mint-300' : 'bg-fg/10 text-slate-400'}`}>{a.active ? 'Watching' : 'Triggered'}</span>
          <button aria-label="Delete alert" className="text-slate-500" onClick={() => set((p) => ({ ...p, alerts: p.alerts.filter((x) => x.id !== a.id) }))}><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  )
}

/** Checks alerts against live rates (every minute while the app is open). */
export function useRateAlerts() {
  const { s, set, notify, toast } = useStore()
  const { rates } = useRates()
  useEffect(() => {
    const check = () => {
      for (const a of s.alerts.filter((x) => x.active)) {
        const v = convert(rates, unit(a.cur), a.cur, 'TRY')
        if ((a.op === 'above' && v >= a.target) || (a.op === 'below' && v <= a.target)) {
          set((p) => ({ ...p, alerts: p.alerts.map((x) => (x.id === a.id ? { ...x, active: false, triggeredAt: Date.now() } : x)) }))
          const msg = `${unit(a.cur).toLocaleString()} ${a.cur} is now ${fmt(v, 'TRY')} (${a.op} your ${fmt(a.target, 'TRY')} alert)`
          notify('📈', msg, '/exchange'); toast({ title: msg, emoji: '📈' })
        }
      }
    }
    check()
    const t = setInterval(check, 60_000)
    return () => clearInterval(t)
  }, [s.alerts, rates, set, notify, toast])
}
