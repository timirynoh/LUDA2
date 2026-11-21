// Live: savings pots. Money moves between the wallet and a pot on the server (PIN / fingerprint each time).
import { Lock, Plus } from 'lucide-react'
import { useState } from 'react'
import { Empty, toMinor, useApi } from '../components/LiveKit'
import { ReviewAndPin, errMsg } from '../components/LiveMoney'
import { Header, Ring, Segmented, Sheet, Success } from '../components/ui'
import { api, money, type Cur } from '../lib/live'
import { useLive } from '../lib/liveStore'

interface Pot { id: string; name: string; emoji: string; currency: Cur; goal_minor: number; balance_minor: number; locked_until: string | null; created_at: string }
const EMOJIS = ['🎯', '🏠', '✈️', '🎓', '📱', '🚗', '💍', '🎁', '🩺', '💻']
const locked = (p: Pot) => !!p.locked_until && Date.parse(p.locked_until) > Date.now()

export default function LiveSavings() {
  const { me, refresh } = useLive()
  const { data, reload } = useApi<{ pots: Pot[] }>('features')
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState<Pot | null>(null)
  const pots = data?.pots ?? []
  const total = (c: Cur) => pots.filter((p) => p.currency === c).reduce((a, p) => a + p.balance_minor, 0)
  const done = () => { reload(); void refresh() }

  return (
    <div className="pb-8">
      <Header back title="Savings pots" sub="Put money aside for what matters" right={<button className="btn-primary px-4 py-2.5 text-sm" onClick={() => setCreating(true)}><Plus size={16} /> New</button>} />
      <div className="flex flex-col gap-4 px-5">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-800 p-5 text-white">
          <div className="absolute -end-10 -top-10 size-40 rounded-full bg-white/10 blur-2xl" />
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Saved in pots</p>
          <p className="text-3xl font-extrabold">{money(total('TRY'), 'TRY')}</p>
          {total('NGN') > 0 && <p className="text-lg font-bold text-white/90">+ {money(total('NGN'), 'NGN')}</p>}
          <p className="mt-1 text-sm text-white/80">Your pots are kept by Luda's server, separate from your spending money.</p>
        </div>
        {!data ? <p className="text-sm text-slate-500">Loading…</p> : pots.length === 0
          ? <Empty emoji="🐷" title="No pots yet" sub="Save for rent, fees or a flight home. Lock a pot so you're not tempted." action={<button className="btn-primary mt-2 px-5 py-3" onClick={() => setCreating(true)}><Plus size={16} /> Create a pot</button>} />
          : <div className="grid gap-3 tab:grid-cols-2">{pots.map((p) => {
            const pct = p.goal_minor ? Math.min(100, Math.round((p.balance_minor / p.goal_minor) * 100)) : 0
            return (
              <button key={p.id} className="card flex items-center gap-4 text-start" onClick={() => setOpen(p)}>
                <Ring value={pct / 100} size={60}><span className="text-2xl">{p.emoji}</span></Ring>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p.name}</p>
                  <p className="text-lg font-extrabold text-mint-300">{money(p.balance_minor, p.currency)}</p>
                  <p className="text-xs text-slate-400">{p.goal_minor ? `${pct}% of ${money(p.goal_minor, p.currency)}` : 'No goal set'}{locked(p) ? ` · 🔒 until ${new Date(p.locked_until!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</p>
                </div>
              </button>
            )
          })}</div>}
      </div>
      {creating && <CreatePot onClose={() => setCreating(false)} onDone={done} />}
      {open && <PotSheet pot={pots.find((p) => p.id === open.id) ?? open} wallet={me?.balances[open.currency] ?? 0} onClose={() => setOpen(null)} onDone={done} />}
    </div>
  )
}

function CreatePot({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🎯')
  const [cur, setCur] = useState<Cur>('TRY')
  const [goal, setGoal] = useState('')
  const [lock, setLock] = useState('0')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true); setErr('')
    try { await api('POST', 'pot-create', { name, emoji, currency: cur, goalMinor: toMinor(goal), lockDays: Number(lock) }); onDone(); onClose() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title="New savings pot">
      <div className="flex flex-col gap-3 pb-4">
        <div className="flex flex-wrap gap-2">{EMOJIS.map((e) => <button key={e} onClick={() => setEmoji(e)} className={`grid size-11 place-items-center rounded-2xl text-xl ${emoji === e ? 'bg-mint-400/25 ring-2 ring-mint-400' : 'bg-fg/[0.05]'}`}>{e}</button>)}</div>
        <input className="input" placeholder="Name (e.g. Rent January)" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <Segmented value={cur} onChange={setCur} options={[{ value: 'TRY', label: '🇹🇷 Lira' }, { value: 'NGN', label: '🇳🇬 Naira' }]} />
        <input className="input" placeholder={`Goal (optional), e.g. ${cur === 'TRY' ? '₺5,000' : '₦200,000'}`} value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="numeric" />
        <p className="label">Lock it?</p>
        <Segmented value={lock} onChange={setLock} options={[{ value: '0', label: 'No lock' }, { value: '30', label: '1 month' }, { value: '90', label: '3 months' }, { value: '180', label: '6 months' }]} />
        {lock !== '0' && <p className="flex items-center gap-2 text-xs text-gold-200"><Lock size={13} /> You can add money any time but can't take it out until the lock ends.</p>}
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-4" disabled={name.trim().length < 2 || busy} onClick={create}>Create pot</button>
      </div>
    </Sheet>
  )
}

function PotSheet({ pot, wallet, onClose, onDone }: { pot: Pot; wallet: number; onClose: () => void; onDone: () => void }) {
  const [dir, setDir] = useState<'in' | 'out'>('in')
  const [amt, setAmt] = useState('')
  const [review, setReview] = useState(false)
  const [err, setErr] = useState('')
  const a = toMinor(amt), max = dir === 'in' ? wallet : pot.balance_minor
  const isLocked = locked(pot)
  const close = async () => { try { await api('POST', 'pot-close', { potId: pot.id }); onDone(); onClose() } catch (e) { setErr(errMsg(e)) } }
  return (
    <Sheet open onClose={onClose} title={`${pot.emoji} ${pot.name}`}>
      {review ? (
        <ReviewAndPin holdLabel={dir === 'in' ? 'Hold to save' : 'Hold to move back'} onClose={() => setReview(false)}
          rows={[[dir === 'in' ? 'From your wallet' : 'Back to your wallet', <b key="a">{money(a, pot.currency)}</b>], ['Pot after', money(pot.balance_minor + (dir === 'in' ? a : -a), pot.currency)]]}
          run={async (auth) => { await api('POST', 'pot-move', { potId: pot.id, amountMinor: dir === 'in' ? a : -a, ...auth }); onDone() }}
          done={<Success title={dir === 'in' ? 'Saved 🎉' : 'Moved to your wallet'} onClose={onClose} />} />
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <p className="text-center text-3xl font-extrabold text-mint-300">{money(pot.balance_minor, pot.currency)}</p>
          {pot.goal_minor > 0 && <p className="text-center text-xs text-slate-400">Goal {money(pot.goal_minor, pot.currency)}</p>}
          <Segmented value={dir} onChange={setDir} options={[{ value: 'in', label: 'Add money' }, { value: 'out', label: 'Take out' }]} />
          {dir === 'out' && isLocked ? <p className="rounded-2xl bg-gold-400/10 p-3 text-sm text-gold-100">🔒 Locked until {new Date(pot.locked_until!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.</p> : <>
            <input className="input text-lg font-bold" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="numeric" />
            <p className="text-xs text-slate-400">{dir === 'in' ? 'Wallet' : 'In pot'}: {money(max, pot.currency)}</p>
            <button className="btn-primary py-4" disabled={!a || a % 100 !== 0 || a > max} onClick={() => setReview(true)}>Continue</button>
          </>}
          {pot.balance_minor === 0 && <button className="text-xs text-slate-500 underline" onClick={close}>Close this pot</button>}
          {err && <p className="text-sm text-rose-300">{err}</p>}
        </div>
      )}
    </Sheet>
  )
}
