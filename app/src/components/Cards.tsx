import { motion } from 'framer-motion'
import { CreditCard, Lock, Plus, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BRAND_STYLE, brandOf, expValid, type SavedCard } from '../lib/cards'
import { uid, useStore } from '../lib/store'
import { luhn } from '../lib/tickets'
import { Sheet } from './ui'

export function CardFace({ c, small }: { c: SavedCard; small?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${BRAND_STYLE[c.brand]} text-white shadow-lg ${small ? 'p-3' : 'aspect-[1.6] p-5'}`}>
      <div className="absolute -top-8 -right-8 size-28 rounded-full bg-white/10" />
      <div className="flex items-center justify-between"><span className="text-xs font-bold tracking-wider opacity-90">{c.brand.toUpperCase()}</span>{c.isDefault && <span className="chip bg-white/20 text-[10px] text-white"><Star size={10} /> Default</span>}</div>
      <p className={`font-mono tracking-[0.2em] ${small ? 'mt-1 text-sm' : 'mt-8 text-xl'}`}>•••• •••• •••• {c.last4}</p>
      {!small && <div className="mt-4 flex justify-between text-xs"><span className="uppercase opacity-80">{c.name}</span><span className="opacity-80">{c.exp}</span></div>}
    </div>
  )
}

/** Add a card. Only brand, last 4 digits, expiry and name are kept; the full number and CVV are never stored. */
export function AddCardSheet({ onClose, onAdded }: { onClose: () => void; onAdded?: (c: SavedCard) => void }) {
  const { s, set, toast } = useStore()
  const [f, setF] = useState({ name: '', num: '', exp: '', cvv: '' })
  const [busy, setBusy] = useState(false)
  const digits = f.num.replace(/\D/g, '')
  const errs = { num: digits.length >= 13 && !luhn(digits) ? 'Card number looks wrong' : '', exp: f.exp.length === 5 && !expValid(f.exp) ? 'Card expired or invalid date' : '' }
  const ok = f.name.trim().length > 2 && luhn(digits) && expValid(f.exp) && /^\d{3,4}$/.test(f.cvv)
  const dup = s.cards.some((c) => c.last4 === digits.slice(-4) && c.exp === f.exp)
  const save = async () => {
    setBusy(true)
    await new Promise((r) => setTimeout(r, 1200)) // demo: 3-D Secure + ₺1 verification charge (refunded)
    const c: SavedCard = { id: uid(), brand: brandOf(digits), last4: digits.slice(-4), exp: f.exp, name: f.name.trim(), isDefault: s.cards.length === 0 }
    set((p) => ({ ...p, cards: [...p.cards, c] }))
    toast({ title: `${c.brand} •••• ${c.last4} saved`, emoji: '💳' })
    onAdded?.(c); onClose()
  }
  const preview: SavedCard = { id: 'x', brand: brandOf(digits), last4: digits.slice(-4).padStart(4, '•'), exp: f.exp || 'MM/YY', name: f.name || 'YOUR NAME', isDefault: false }
  return (
    <Sheet open onClose={onClose} title="Add a bank card">
      <div className="flex flex-col gap-3">
        <motion.div layout><CardFace c={preview} /></motion.div>
        <input className="input" placeholder="Name on card" autoComplete="cc-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div><input className="input font-mono" placeholder="Card number" inputMode="numeric" autoComplete="cc-number" value={f.num}
          onChange={(e) => setF({ ...f, num: e.target.value.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim() })} />{errs.num && <p className="mt-1 text-xs text-rose-300">{errs.num}</p>}</div>
        <div className="grid grid-cols-2 gap-2">
          <div><input className="input" placeholder="MM/YY" inputMode="numeric" autoComplete="cc-exp" value={f.exp} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setF({ ...f, exp: v.length > 2 ? `${v.slice(0, 2)}/${v.slice(2)}` : v }) }} />{errs.exp && <p className="mt-1 text-xs text-rose-300">{errs.exp}</p>}</div>
          <input className="input" placeholder="CVV" type="password" inputMode="numeric" autoComplete="cc-csc" value={f.cvv} onChange={(e) => setF({ ...f, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
        </div>
        {dup && <p className="text-xs text-gold-300">This card is already saved.</p>}
        <p className="flex items-start gap-2 text-[11px] text-slate-500"><Lock size={12} className="mt-0.5 shrink-0" /> We confirm the card with 3-D Secure and a ₺1 check that's refunded instantly. Luda only keeps the last 4 digits; the full number and CVV stay with our PCI-certified card partner. Demo: try 4242 4242 4242 4242.</p>
        <button className="btn-primary py-4" disabled={!ok || dup || busy} onClick={save}>{busy ? 'Verifying with your bank…' : 'Save card'}</button>
      </div>
    </Sheet>
  )
}

/** Choose a saved card (or add one). */
export function CardPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { s } = useStore()
  const [adding, setAdding] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      {s.cards.map((c) => (
        <button key={c.id} onClick={() => onChange(c.id)} className={`glass flex items-center gap-3 rounded-2xl p-2.5 text-start ${value === c.id ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
          <div className={`grid h-8 w-12 place-items-center rounded-lg bg-gradient-to-br ${BRAND_STYLE[c.brand]} text-[9px] font-bold text-white`}>{c.brand}</div>
          <span className="flex-1 text-sm font-semibold">•••• {c.last4}<span className="ms-2 text-xs font-normal text-slate-400">{c.exp}</span></span>
          {c.isDefault && <Star size={14} className="text-gold-300" />}
        </button>
      ))}
      <button onClick={() => setAdding(true)} className="flex items-center gap-2 rounded-2xl border border-dashed border-fg/20 p-3 text-sm text-slate-300"><Plus size={16} /> Add a card</button>
      {adding && <AddCardSheet onClose={() => setAdding(false)} onAdded={(c) => onChange(c.id)} />}
    </div>
  )
}

export function CardsManager() {
  const { s, set, toast } = useStore()
  const [adding, setAdding] = useState(false)
  const makeDefault = (id: string) => set((p) => ({ ...p, cards: p.cards.map((c) => ({ ...c, isDefault: c.id === id })) }))
  const remove = (id: string) => { set((p) => { const left = p.cards.filter((c) => c.id !== id); if (left.length && !left.some((c) => c.isDefault)) left[0] = { ...left[0], isDefault: true }; return { ...p, cards: left } }); toast({ title: 'Card removed', emoji: '🗑️' }) }
  return (
    <div className="flex flex-col gap-3">
      {s.cards.map((c) => (
        <div key={c.id}>
          <CardFace c={c} />
          <div className="mt-2 flex gap-2">
            {!c.isDefault && <button className="chip bg-fg/5 py-1.5 text-slate-300" onClick={() => makeDefault(c.id)}><Star size={12} /> Make default</button>}
            <button className="chip bg-rose-500/10 py-1.5 text-rose-300" onClick={() => remove(c.id)}><Trash2 size={12} /> Remove</button>
          </div>
        </div>
      ))}
      {!s.cards.length && <div className="card flex flex-col items-center gap-2 py-8 text-center text-slate-400"><CreditCard size={32} /><p className="text-sm">No saved cards yet. Save one for 1-tap top-ups and tickets.</p></div>}
      <button className="btn-primary py-3.5" onClick={() => setAdding(true)}><Plus size={18} /> Add a card</button>
      {adding && <AddCardSheet onClose={() => setAdding(false)} />}
    </div>
  )
}
