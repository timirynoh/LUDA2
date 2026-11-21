import { motion } from 'framer-motion'
import { BadgeCheck, Car, CheckCircle2, Clock, MessageCircle, Phone, Share2, ShieldAlert, ShieldCheck, Siren, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { handshakeCode, randomSecret, verifyHandshake } from '../lib/crypto'
import { fmt } from '../lib/fx'
import { useStore, type Trade } from '../lib/store'
import { ConfirmSheet } from './Confirm'

export type HandoverMode = NonNullable<Trade['handover']>

const MODES: { k: HandoverMode; emoji: string; title: string; sub: string }[] = [
  { k: 'person', emoji: '🤝', title: 'Meet in person', sub: 'You and the trader meet at a Safe Spot' },
  { k: 'courier', emoji: '🚕', title: 'Courier brings the cash', sub: 'The trader sends a driver/rider to you' },
  { k: 'delegate', emoji: '🙋🏾', title: 'Someone collects for me', sub: 'Send a friend or taxi with a one-time code' },
]

function useTradePatch(t: Trade) {
  const { set } = useStore()
  return (patch: Partial<Trade>) => set((p) => ({ ...p, trades: p.trades.map((x) => (x.id === t.id ? { ...x, ...patch } : x)) }))
}

export function HandoverPicker({ t }: { t: Trade }) {
  const patch = useTradePatch(t)
  const mode = t.handover ?? 'person'
  const locked = !!t.courier || !!t.delegate
  return (
    <div>
      <p className="label mb-2">How will the cash reach you?</p>
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => (
          <button key={m.k} disabled={locked && m.k !== mode} onClick={() => patch({ handover: m.k })}
            className={`flex flex-col items-center gap-1 rounded-2xl p-2.5 text-center text-[11px] font-semibold leading-tight transition disabled:opacity-30 ${mode === m.k ? 'bg-mint-400/15 text-mint-200 ring-1 ring-mint-400/50' : 'bg-fg/[0.04] text-slate-400'}`}>
            <span className="text-2xl">{m.emoji}</span>{m.title}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">{MODES.find((m) => m.k === mode)?.sub}. Escrow is only ever paid to {t.trader}, never to a courier.</p>
    </div>
  )
}

const RULES = ['Escrow goes only to the verified trader, never to the courier', 'Never give the courier money, codes or your PIN', 'Check the delivery code before taking the cash', 'Count the cash in front of the courier before releasing']

/** The trader sends a courier: verify the courier with a rotating code, then release. */
export function CourierPanel({ t, onVerified }: { t: Trade; onVerified: () => void }) {
  const { toast, notify } = useStore()
  const patch = useTradePatch(t)
  const [, tick] = useState(0)
  const [code, setCode] = useState('')
  const [shown, setShown] = useState('')
  const [bad, setBad] = useState(false)
  // Demo: the trader assigns their courier a few seconds after you choose this option.
  useEffect(() => {
    if (t.courier) return
    const id = setTimeout(() => {
      patch({ courier: { name: 'Musa K.', flag: '🇳🇬', vehicle: 'Taxi · white Toyota Corolla', plate: 'TAK 482', phone: '+90 533 482 1100', rating: 4.8, verified: true, assignedAt: Date.now(), etaSec: 20, secret: randomSecret() } })
      notify('🚕', `${t.trader} assigned courier Musa K. (TAK 482)`, '/exchange?tab=p2p')
    }, 3000)
    return () => clearTimeout(id)
  }, [t.courier]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i) }, [])
  useEffect(() => {
    if (!t.courier) return
    let alive = true
    const upd = async () => { const c = await handshakeCode(t.courier!.secret, t.id); if (alive) setShown(c) }
    upd(); const i = setInterval(upd, 1000)
    return () => { alive = false; clearInterval(i) }
  }, [t.courier, t.id])

  if (!t.courier) return (
    <div className="flex items-center gap-3 rounded-2xl bg-fg/[0.04] p-4 text-sm"><Car className="animate-pulse text-gold-300" /> Waiting for {t.trader} to assign their courier…</div>
  )
  const c = t.courier
  const left = Math.max(0, Math.round((c.assignedAt + c.etaSec * 1000 - Date.now()) / 1000))
  const arrived = left === 0
  const pct = 1 - left / c.etaSec
  const check = async () => {
    if (await verifyHandshake(c.secret, t.id, code)) { toast({ title: `Courier verified: ${c.name}`, emoji: '✅' }); onVerified() }
    else setBad(true)
  }
  const shareMsg = `🚕 Cash delivery for my Luda SafeSwap. Courier: ${c.name}, ${c.vehicle}, plate ${c.plate}. Meeting: ${t.spot}.`
  return (
    <div className="flex flex-col gap-3">
      <div className="card">
        <div className="flex items-center gap-3">
          <div className="relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-yellow-300 to-amber-600 text-3xl">🚕<span className="absolute -end-1 -bottom-1 grid size-6 place-items-center rounded-full bg-ink-900 text-sm">{c.flag}</span></div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 font-bold">{c.name}{c.verified && <BadgeCheck size={16} className="text-mint-400" />}</p>
            <p className="truncate text-xs text-slate-400">{c.vehicle}</p>
            <p className="font-mono text-sm font-bold tracking-wider">{c.plate} <span className="font-sans text-xs font-normal text-slate-400">· ⭐ {c.rating}</span></p>
          </div>
          <a href={`tel:${c.phone}`} className="grid size-10 place-items-center rounded-xl bg-mint-400/15 text-mint-300" aria-label="Call courier"><Phone size={18} /></a>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">✓ Courier registered by {t.trader} with phone & ID. Carrying {fmt(t.get, 'TRY')} cash for you.</p>
        <div className="mt-3">
          <div className="flex justify-between text-xs"><span className={arrived ? 'text-mint-300' : 'text-slate-300'}>{arrived ? '📍 Courier has arrived' : '🚗 On the way'}</span><span className="text-slate-400"><Clock size={11} className="inline" /> {arrived ? 'now' : `${left}s (demo ETA)`}</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-fg/10"><motion.div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-mint-400" animate={{ width: `${pct * 100}%` }} /></div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <a href={`https://wa.me/?text=${encodeURIComponent(shareMsg)}`} target="_blank" rel="noreferrer" className="btn bg-fg/5 py-2 text-slate-200"><Share2 size={14} /> Share trip</a>
          <a href="tel:155" className="btn bg-rose-500/15 py-2 text-rose-300"><Siren size={14} /> SOS 155</a>
        </div>
      </div>

      {arrived && (
        <div className="card border-mint-400/30">
          <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={18} className="text-mint-300" /> Verify the courier before taking the cash</p>
          <p className="mt-1 text-xs text-slate-400">Ask {c.name.split(' ')[0]} to show the 6-digit code on their phone. It changes every 30 seconds and only works for this trade.</p>
          <div className="mt-2 flex gap-2">
            <input className="input py-3 font-mono text-xl tracking-[0.3em]" inputMode="numeric" maxLength={6} placeholder="••••••" value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setBad(false) }} />
            <button className="btn-primary shrink-0 px-4" disabled={code.length !== 6} onClick={check}>Verify</button>
          </div>
          {bad && <p className="mt-2 flex items-start gap-2 rounded-xl bg-rose-500/10 p-2 text-xs text-rose-200"><ShieldAlert size={14} className="mt-0.5 shrink-0" /> Code doesn't match. Don't accept anything. This may not be the real courier. Call {t.trader} in the chat or open an appeal.</p>}
          <p className="mt-2 rounded-xl bg-fg/[0.04] p-2 text-[11px] text-slate-400">Demo: the courier's phone currently shows <b className="font-mono text-slate-200">{shown}</b></p>
        </div>
      )}
      <ul className="grid gap-1 text-[11px] text-slate-500">{RULES.map((r) => <li key={r}>🛡️ {r}</li>)}</ul>
    </div>
  )
}

/** You send someone (friend/taxi) to collect the cash with a one-time pickup code. */
export function DelegatePanel({ t, onReady }: { t: Trade; onReady: () => void }) {
  const { notify, toast } = useStore()
  const patch = useTradePatch(t)
  const [f, setF] = useState({ name: '', phone: '+90 5', plate: '' })
  const [ask, setAsk] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i) }, [])
  const d = t.delegate
  // Demo: the trader verifies the code at handover, then your person confirms the cash.
  useEffect(() => {
    if (!d || d.receivedAt) return
    const id = setTimeout(() => {
      if (!d.traderVerifiedAt) { patch({ delegate: { ...d, traderVerifiedAt: Date.now() } }); notify('🔐', `${t.trader} verified ${d.name}'s pickup code`, '/exchange?tab=p2p') }
    }, d.traderVerifiedAt ? 0 : 7000)
    return () => clearTimeout(id)
  }, [d]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) {
    const create = () => {
      const code = String(Math.floor(100000 + Math.random() * 900000))
      patch({ delegate: { name: f.name.trim(), phone: f.phone.trim(), plate: f.plate.trim() || undefined, code, expires: Date.now() + 2 * 3_600_000, createdAt: Date.now() } })
      toast({ title: 'Pickup code created. Send it to your person', emoji: '🔐' })
    }
    return (
      <div className="card flex flex-col gap-2">
        <p className="font-semibold">Who is collecting the cash for you?</p>
        <input className="input py-2.5" placeholder="Their name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className="input py-2.5" inputMode="tel" placeholder="Their phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <input className="input py-2.5 uppercase" placeholder="Taxi plate (optional)" value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} />
        <button className="btn-primary py-3" disabled={f.name.trim().length < 2 || f.phone.replace(/\D/g, '').length < 10} onClick={create}><UserRound size={16} /> Create one-time pickup code</button>
        <p className="text-[11px] text-slate-500">Only send someone you trust. They never get access to your account or escrow.</p>
      </div>
    )
  }
  const minsLeft = Math.max(0, Math.round((d.expires - Date.now()) / 60000))
  const msg = `Hi ${d.name}, please collect ${fmt(t.get, 'TRY')} cash for me from ${t.trader} at ${t.spot}. Give them this Luda pickup code: ${d.code} (valid ${minsLeft} min). Call me before you leave with the cash.`
  const steps = [
    { k: 'Pickup code sent to ' + d.name, ok: true },
    { k: `${t.trader} checked the code at handover`, ok: !!d.traderVerifiedAt },
    { k: `${d.name} confirmed they have the cash`, ok: !!d.receivedAt },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-center gap-2 rounded-3xl bg-white p-5 text-ink-950">
        <p className="text-sm font-semibold">Pickup code for {d.name}</p>
        <p className="font-mono text-4xl font-black tracking-[0.3em]">{d.code}</p>
        <p className="text-xs text-slate-500">One-time · expires in {minsLeft} min · {t.trader} must check it before handing over</p>
        <a href={`https://wa.me/${d.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="btn bg-emerald-600 py-2 text-sm text-white"><MessageCircle size={16} /> Send to {d.name} on WhatsApp</a>
      </div>
      <ol className="grid gap-2">{steps.map((x) => <li key={x.k} className="flex items-center gap-2 text-sm"><CheckCircle2 size={18} className={x.ok ? 'text-mint-400' : 'text-slate-600'} /><span className={x.ok ? '' : 'text-slate-500'}>{x.k}</span></li>)}</ol>
      {d.traderVerifiedAt && !d.receivedAt && (
        <div className="card border-gold-400/30">
          <p className="text-sm">📞 Call <b>{d.name}</b> ({d.phone}) and confirm they counted {fmt(t.get, 'TRY')} before you release.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <a href={`tel:${d.phone}`} className="btn-ghost py-2.5 text-sm"><Phone size={14} /> Call</a>
            <button className="btn-primary py-2.5 text-sm" onClick={() => setAsk(true)}>They have the cash</button>
          </div>
        </div>
      )}
      {!d.receivedAt && <button className="text-xs text-slate-500 underline" onClick={() => patch({ delegate: undefined })}>Cancel this pickup code</button>}
      {ask && <ConfirmSheet title={`Did ${d.name} get the cash?`} confirmLabel="Yes, they have it" onClose={() => setAsk(false)} onConfirm={() => { setAsk(false); patch({ delegate: { ...d, receivedAt: Date.now() } }); onReady() }}
        warning={`Only confirm after speaking to ${d.name} yourself. Messages can be faked; a phone call is safer.`}
        summary={[['Collected by', `${d.name} · ${d.phone}`], ['Cash amount', fmt(t.get, 'TRY')], ['From', t.trader]]}
        checks={[`I called ${d.name} myself on ${d.phone}`, `${d.name} counted ${fmt(t.get, 'TRY')} and it is all there`, `${d.name} is now away from the meeting point with the cash`]} />}
    </div>
  )
}
