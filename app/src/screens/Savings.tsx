import { motion } from 'framer-motion'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { DemoNote, Header, Ring, Sheet } from '../components/ui'
import { fmt } from '../lib/fx'
import type { Pot } from '../lib/savings'
import { uid, useStore } from '../lib/store'
import { daysUntil } from '../lib/uni'

const IDEAS: [string, string, number][] = [['🏠', 'Next rent', 6000], ['🎓', 'Tuition instalment', 40000], ['✈️', 'Ticket home', 25000], ['🪪', 'Residence permit', 8000], ['📱', 'New phone', 15000]]

export default function Savings() {
  const { s } = useStore()
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<Pot | null>(null)
  const total = s.pots.reduce((a, p) => a + p.saved, 0)
  return (
    <div>
      <Header back title="Savings pots" sub="Put money aside for what matters" right={<button className="btn-primary size-11 rounded-2xl p-0" aria-label="New pot" onClick={() => setCreating(true)}><Plus size={20} /></button>} />
      <div className="flex flex-col gap-3 px-5">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-pink-500 via-fuchsia-700 to-purple-950 p-5 text-white">
          <p className="text-sm text-white/70">Total saved</p><p className="text-4xl font-extrabold">{fmt(total, 'TRY')}</p>
          <p className="mt-1 text-sm text-white/70">{s.pots.length} pot{s.pots.length === 1 ? '' : 's'} · money in pots can't be spent by accident</p>
          <span className="absolute -right-4 -bottom-6 text-8xl opacity-20">🐷</span>
        </div>
        {s.pots.map((p, i) => {
          const pct = p.target ? p.saved / p.target : 0
          return (
            <motion.button key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} onClick={() => setOpen(p)} className="card flex items-center gap-4 text-start">
              <Ring value={pct} size={58} stroke={5}><span className="text-2xl">{p.emoji}</span></Ring>
              <div className="flex-1"><p className="font-semibold">{p.name}</p><p className="text-sm text-slate-400">{fmt(p.saved, 'TRY')} of {fmt(p.target, 'TRY')}</p>
                {p.deadline && <p className="text-xs text-slate-500">{Math.max(0, daysUntil(p.deadline))} days left</p>}</div>
              <span className={`text-lg font-extrabold ${pct >= 1 ? 'text-mint-300' : 'text-slate-300'}`}>{Math.round(pct * 100)}%</span>
            </motion.button>
          )
        })}
        {!s.pots.length && (
          <div className="card"><p className="mb-3 font-semibold">Start with an idea</p>
            <div className="flex flex-wrap gap-2">{IDEAS.map(([e, n]) => <button key={n} onClick={() => setCreating(true)} className="chip bg-fg/5 py-2 text-slate-300">{e} {n}</button>)}</div></div>
        )}
      </div>
      <DemoNote />
      {creating && <NewPot onClose={() => setCreating(false)} />}
      {open && <PotSheet id={open.id} onClose={() => setOpen(null)} />}
    </div>
  )
}

function NewPot({ onClose }: { onClose: () => void }) {
  const { set, gate } = useStore()
  const [f, setF] = useState({ emoji: '🏠', name: '', target: '', deadline: '' })
  const create = () => {
    if (!gate(2, 'Savings pots')) return
    set((p) => ({ ...p, pots: [...p.pots, { id: uid(), name: f.name.trim(), emoji: f.emoji, target: +f.target, saved: 0, deadline: f.deadline || undefined, createdAt: Date.now(), milestones: [] }] }))
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="New savings pot">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">{['🏠', '🎓', '✈️', '🪪', '📱', '🎁', '🚗', '💍', '🏥', '💼'].map((e) => <button key={e} onClick={() => setF({ ...f, emoji: e })} className={`grid size-11 place-items-center rounded-xl text-2xl ${f.emoji === e ? 'bg-mint-400/20 ring-1 ring-mint-400' : 'bg-fg/5'}`}>{e}</button>)}</div>
        <div className="flex flex-wrap gap-2">{IDEAS.map(([e, n, t]) => <button key={n} onClick={() => setF({ ...f, emoji: e, name: n, target: String(t) })} className="chip bg-fg/5 py-1.5 text-slate-300">{e} {n}</button>)}</div>
        <input className="input" placeholder="Name, e.g. Next rent" maxLength={30} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input" inputMode="numeric" placeholder="Target (₺)" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value.replace(/\D/g, '') })} />
        <label className="grid gap-1 text-xs text-slate-400">Deadline (optional)<input type="date" className="input" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></label>
        <button className="btn-primary py-4" disabled={!f.name.trim() || !+f.target} onClick={create}>Create pot</button>
      </div>
    </Sheet>
  )
}

function PotSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { s, set, addTx, reward, toast, gate } = useStore()
  const p = s.pots.find((x) => x.id === id)
  const [amount, setAmount] = useState('500')
  if (!p) return null
  const amt = +amount || 0
  const bal = s.balances.TRY ?? 0
  const move = (dir: 1 | -1) => {
    if (!gate(2, 'Savings pots')) return
    if (dir === 1 && amt > bal) return toast({ title: 'Not enough TL in your wallet', emoji: '⚠️' })
    if (dir === -1 && amt > p.saved) return toast({ title: 'Not that much in this pot', emoji: '⚠️' })
    const saved = p.saved + dir * amt
    const hit = [25, 50, 75, 100].filter((m) => saved / p.target * 100 >= m && !p.milestones.includes(m))
    set((st) => ({ ...st, balances: { ...st.balances, TRY: (st.balances.TRY ?? 0) - dir * amt }, pots: st.pots.map((x) => (x.id === id ? { ...x, saved, milestones: [...x.milestones, ...hit] } : x)) }))
    addTx({ type: 'reward', amount: -dir * amt, currency: 'TRY', label: `${dir === 1 ? 'Saved to' : 'Taken from'} ${p.emoji} ${p.name}` })
    if (hit.length) reward(hit.includes(100) ? 100 : 20, { badge: 'saver_pot', title: hit.includes(100) ? `🎉 Goal reached: ${p.name}!` : `${Math.max(...hit)}% of ${p.name} saved` })
  }
  const pct = Math.min(1, p.saved / p.target)
  return (
    <Sheet open onClose={onClose} title={`${p.emoji} ${p.name}`}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4"><Ring value={pct} size={96} stroke={8}><span className="text-xl font-extrabold">{Math.round(pct * 100)}%</span></Ring>
          <div><p className="text-3xl font-extrabold">{fmt(p.saved, 'TRY')}</p><p className="text-sm text-slate-400">of {fmt(p.target, 'TRY')} · {fmt(Math.max(0, p.target - p.saved), 'TRY')} to go</p></div></div>
        <div className="flex gap-2">{[100, 500, 1000, 2500].map((v) => <button key={v} onClick={() => setAmount(String(v))} className={`chip flex-1 justify-center py-2 ${amount === String(v) ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>₺{v}</button>)}</div>
        <input className="input text-xl font-bold" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost py-3.5" disabled={!amt || !p.saved} onClick={() => move(-1)}><Minus size={16} /> Take out</button>
          <button className="btn-primary py-3.5" disabled={!amt} onClick={() => move(1)}><Plus size={16} /> Add {amt ? `₺${amt}` : ''}</button>
        </div>
        <p className="text-center text-xs text-slate-400">Wallet: {fmt(bal, 'TRY')}</p>
        <button className="flex items-center justify-center gap-1 text-xs text-rose-300" onClick={() => { set((st) => ({ ...st, balances: { ...st.balances, TRY: (st.balances.TRY ?? 0) + p.saved }, pots: st.pots.filter((x) => x.id !== id) })); onClose() }}><Trash2 size={12} /> Delete pot (money returns to wallet)</button>
      </div>
    </Sheet>
  )
}
