import { motion } from 'framer-motion'
import { Check, ImagePlus, SendHorizontal, ShieldAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Header, Sheet } from '../components/ui'
import { REASONS, STATUS_STEPS, type Dispute } from '../lib/disputes'
import { fmt } from '../lib/fx'
import { checkText } from '../lib/moderation'
import { uid, useStore } from '../lib/store'
import { thumb, type ThreadMsg } from '../lib/threads'

const caseNo = (id: string) => `LUD-${id.slice(0, 6).toUpperCase()}`
const STATUS_STYLE: Record<Dispute['status'], string> = {
  submitted: 'bg-gold-400/15 text-gold-300', review: 'bg-sky-400/15 text-sky-300', info: 'bg-fuchsia-500/15 text-fuchsia-300', resolved: 'bg-mint-400/15 text-mint-300',
}

/** Bybit-style appeal: reason → details → evidence → support handles the case. Funds stay frozen meanwhile. */
export function OpenDispute({ kind, refId, title, counterparty, amount, cur, onClose, onOpened }: {
  kind: Dispute['kind']; refId: string; title: string; counterparty: string; amount: number; cur: string; onClose: () => void; onOpened?: (id: string) => void
}) {
  const { s, set, notify, allow } = useStore()
  const nav = useNavigate()
  const existing = s.disputes.find((d) => d.refId === refId && d.status !== 'resolved')
  const [reason, setReason] = useState('')
  const [desc, setDesc] = useState('')
  const [ev, setEv] = useState<string[]>([])
  const [err, setErr] = useState('')
  const add = async (files: FileList | null) => { if (!files) return; const t = await Promise.all([...files].slice(0, 6 - ev.length).map((f) => thumb(f))); setEv([...ev, ...t]) }
  const submit = () => {
    if (!checkText(desc).ok) return setErr('Please keep the description respectful.')
    if (!allow('report')) return
    const id = uid(), now = Date.now()
    const d: Dispute = { id, kind, refId, title, counterparty, amount, cur, reason, desc: desc.trim(), evidence: ev, status: 'submitted', createdAt: now, updatedAt: now, userReplied: ev.length > 0 }
    set((p) => ({ ...p, disputes: [d, ...p.disputes], threads: { ...p.threads, [`case-${id}`]: [
      { id: uid(), from: 'system', text: `Case ${caseNo(id)} opened. ${fmt(amount, cur)} is frozen until it's resolved.`, ts: now },
      { id: uid(), from: 'me', text: `${reason}. ${desc.trim()}`, ts: now },
      ...ev.map((img) => ({ id: uid(), from: 'me' as const, text: '', img, ts: now })),
    ] } }))
    notify('🛡️', `Appeal ${caseNo(id)} opened. Support will reply shortly`, `/disputes/${id}`)
    onOpened?.(id); onClose(); nav(`/disputes/${id}`)
  }
  if (existing) return (
    <Sheet open onClose={onClose} title="Appeal already open">
      <div className="flex flex-col gap-3"><p className="text-sm text-slate-300">Case {caseNo(existing.id)} is being handled.</p><Link to={`/disputes/${existing.id}`} onClick={onClose} className="btn-primary py-3.5">Open case</Link></div>
    </Sheet>
  )
  return (
    <Sheet open onClose={onClose} title="🛡️ Open an appeal">
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-fg/[0.03] p-3 text-sm"><p className="font-semibold">{title}</p><p className="text-xs text-slate-400">with {counterparty} · {fmt(amount, cur)} will stay frozen during review</p></div>
        <div>
          <p className="label mb-2">What happened?</p>
          <div className="flex flex-col gap-1.5">{REASONS[kind].map((r) => (
            <button key={r} onClick={() => setReason(r)} className={`glass flex items-center gap-2 rounded-xl p-3 text-start text-sm ${reason === r ? 'border-rose-400/60 bg-rose-500/10' : ''}`}>{reason === r ? <Check size={14} className="text-rose-300" /> : <span className="size-3.5" />}{r}</button>
          ))}</div>
        </div>
        <textarea className="input min-h-24" placeholder="Describe what happened: times, amounts, what was said…" value={desc} maxLength={1000} onChange={(e) => { setDesc(e.target.value); setErr('') }} />
        <div>
          <p className="label mb-2">Evidence (photos, receipts, screenshots) · {ev.length}/6</p>
          <div className="flex flex-wrap gap-2">
            {ev.map((src, i) => <div key={i} className="relative"><img src={src} alt="Evidence" className="size-20 rounded-xl object-cover" /><button onClick={() => setEv(ev.filter((_, j) => j !== i))} className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-rose-500 text-white" aria-label="Remove"><X size={12} /></button></div>)}
            {ev.length < 6 && <label className="grid size-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-fg/15 text-slate-500"><ImagePlus size={22} /><input type="file" accept="image/*" multiple className="hidden" onChange={(e) => add(e.target.files)} /></label>}
          </div>
        </div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn bg-rose-500 py-4 text-white" disabled={!reason || desc.trim().length < 10} onClick={submit}><ShieldAlert size={18} /> Submit appeal</button>
        <p className="text-center text-[11px] text-slate-500">False appeals can lead to account restrictions. Support usually replies within 15 minutes.</p>
      </div>
    </Sheet>
  )
}

export function DisputeList() {
  const { s } = useStore()
  return (
    <div>
      <Header back title="Appeals & support cases" sub="Disputes, reports and their progress" />
      <div className="flex flex-col gap-2 px-5">
        {s.disputes.length ? s.disputes.map((d) => (
          <Link key={d.id} to={`/disputes/${d.id}`} className="card flex items-center gap-3">
            <ShieldAlert className={d.status === 'resolved' ? 'text-mint-300' : 'text-rose-300'} />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{d.title}</p><p className="text-xs text-slate-400">{caseNo(d.id)} · {d.reason}</p></div>
            <span className={`chip ${STATUS_STYLE[d.status]}`}>{STATUS_STEPS.find((x) => x.key === d.status)?.label}</span>
          </Link>
        )) : <p className="card text-center text-sm text-slate-400">No cases. If a trade or job goes wrong, tap “Appeal” in its chat.</p>}
      </div>
    </div>
  )
}

export function DisputeView() {
  const { id = '' } = useParams()
  const { s, set } = useStore()
  const d = s.disputes.find((x) => x.id === id)
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const key = `case-${id}`
  const msgs: ThreadMsg[] = s.threads[key] ?? []
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [msgs.length])
  if (!d) return <div><Header back title="Case not found" /></div>
  const idx = STATUS_STEPS.findIndex((x) => x.key === d.status)
  const push = (m: Omit<ThreadMsg, 'id' | 'ts'>) => set((p) => ({
    ...p, threads: { ...p.threads, [key]: [...(p.threads[key] ?? []), { ...m, id: uid(), ts: Date.now() }] },
    disputes: p.disputes.map((x) => (x.id === id ? { ...x, userReplied: true, updatedAt: Date.now(), evidence: m.img ? [...x.evidence, m.img] : x.evidence } : x)),
  }))
  const send = () => { if (!text.trim() || !checkText(text).ok) return; push({ from: 'me', text: text.trim() }); setText('') }
  return (
    <div>
      <Header back title={`Case ${caseNo(d.id)}`} sub={d.title} right={<span className={`chip ${STATUS_STYLE[d.status]}`}>{STATUS_STEPS[idx].label}</span>} />
      <div className="flex flex-col gap-3 px-5">
        <div className="card">
          <div className="flex justify-between">{STATUS_STEPS.map((st, i) => (
            <div key={st.key} className="flex flex-1 flex-col items-center gap-1">
              <motion.span animate={{ scale: i === idx ? [1, 1.15, 1] : 1 }} transition={{ repeat: i === idx && d.status !== 'resolved' ? Infinity : 0, duration: 1.5 }}
                className={`grid size-7 place-items-center rounded-full text-xs font-bold ${i <= idx ? 'bg-mint-400 text-ink-950' : 'bg-fg/10 text-slate-500'}`}>{i < idx || d.status === 'resolved' ? <Check size={14} /> : i + 1}</motion.span>
              <span className={`text-[10px] ${i <= idx ? 'text-slate-200' : 'text-slate-500'}`}>{st.label}</span>
            </div>
          ))}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-fg/5 p-2"><p className="text-slate-500">Amount {d.status === 'resolved' ? '' : 'frozen'}</p><p className="font-bold">{fmt(d.amount, d.cur)}</p></div>
            <div className="rounded-xl bg-fg/5 p-2"><p className="text-slate-500">Other party</p><p className="font-bold">{d.counterparty}</p></div>
          </div>
          {d.outcome && <p className="mt-3 rounded-2xl bg-mint-400/10 p-3 text-sm text-mint-100">✅ {d.outcome}</p>}
        </div>
        <div ref={box} className="flex max-h-[45dvh] flex-col gap-2 overflow-y-auto">
          {msgs.map((m) => m.from === 'system' ? <p key={m.id} className="mx-auto rounded-full bg-fg/5 px-3 py-1 text-center text-[11px] text-slate-400">{m.text}</p> : (
            <div key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.from === 'me' ? 'rounded-br-md bg-gradient-to-br from-mint-400 to-emerald-500 text-ink-950' : 'rounded-bl-md border border-sky-400/20 bg-sky-500/10'}`}>
                {m.from === 'support' && <p className="mb-0.5 text-xs font-bold text-sky-300">🛡️ Amina · Luda Support</p>}
                {m.img && <img src={m.img} alt="Evidence" className="mb-1 max-h-48 rounded-xl" />}{m.text}
                <span className="ms-2 text-[9px] opacity-60">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          ))}
        </div>
        {d.status !== 'resolved' && (
          <div className="flex items-center gap-2">
            <label className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-fg/5 text-slate-400" aria-label="Add evidence"><ImagePlus size={18} />
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) push({ from: 'me', text: '', img: await thumb(f) }); e.target.value = '' }} /></label>
            <input className="input py-2.5" placeholder="Reply to support…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
            <button onClick={send} disabled={!text.trim()} aria-label="Send" className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-mint-400 to-emerald-500 text-ink-950 disabled:opacity-30"><SendHorizontal size={18} /></button>
          </div>
        )}
      </div>
    </div>
  )
}
