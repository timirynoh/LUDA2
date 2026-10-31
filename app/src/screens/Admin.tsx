import { motion } from 'framer-motion'
import { Check, FileCheck2, Flag, Image, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/ui'
import { useStore, type State } from '../lib/store'

type Kind = 'housing' | 'job' | 'event'
interface QItem { id: string; kind: Kind; title: string; who: string; detail: string; checks: [string, boolean][]; mine: boolean }

const SEEDED: QItem[] = [
  { id: 'q1', kind: 'housing', title: '2+1 flat near EMU, £420/mo', who: 'Hüseyin A.', detail: 'Owner · Koçan uploaded · 5 live photos', checks: [['ID verified', true], ['Phone verified', true], ['Title deed name matches ID', true], ['Photos taken live, not from the web', true]], mine: false },
  { id: 'q2', kind: 'housing', title: 'Luxury villa, £150/mo!!! WhatsApp only', who: 'New account', detail: 'Tenant · no landlord permission · 1 photo', checks: [['ID verified', false], ['Phone verified', true], ['Proof of right to rent', false], ['Photo found elsewhere online', false]], mine: false },
  { id: 'q3', kind: 'job', title: 'Data entry, ₺5,000/day, pay ₺500 registration', who: 'Unknown agency', detail: 'Individual · asks applicants for a fee', checks: [['Business registration', false], ['Asks workers for money', false]], mine: false },
]
const REASONS = ['Missing / unclear documents', 'Photos not real or not live', 'Looks like a scam', 'Duplicate post', 'Price or details misleading']

const kindOf = { housing: 'myListings', job: 'myJobs', event: 'myEvents' } as const

export default function Admin() {
  const { s, set, toast } = useStore()
  const [decided, setDecided] = useState<Record<string, 'approved' | 'rejected'>>({})
  const [rejecting, setRejecting] = useState<string | null>(null)

  if (!s.isAdmin) return (
    <div><Header back title="Admin" />
      <div className="card mx-5 text-center text-sm text-slate-400">Admin mode is off. Turn it on in <Link to="/profile" className="text-mint-300 underline">Profile</Link> (owner only).</div></div>
  )

  const mine: QItem[] = (['housing', 'job', 'event'] as Kind[]).flatMap((k) =>
    (s[kindOf[k]] as State['myListings']).filter((x) => x.status === 'pending').map((x) => ({
      id: x.id, kind: k, title: x.title, who: `${s.name} (you)`, mine: true,
      detail: k === 'housing' ? `${s.proofs.housing ?? 'owner'} · ${x.photos ?? 0} live photos` : k === 'job' ? (s.proofs.business ?? 'company') : 'Organiser',
      checks: [['Phone verified', s.phoneVerified], ['ID verified (optional)', s.verified], ...(k === 'housing' ? [['Bill / document on file', !!s.proofs.housing && s.proofs.housing !== 'photos'], ['3+ photos', (x.photos ?? 0) >= 3]] : [])] as [string, boolean][],
    })))
  const queue = [...mine, ...SEEDED.filter((q) => !decided[q.id])]

  const decide = (q: QItem, ok: boolean, reason?: string) => {
    if (q.mine) {
      const key = kindOf[q.kind]
      set((p) => ({ ...p, [key]: (p[key] as State['myListings']).map((x) => (x.id === q.id ? { ...x, status: ok ? 'live' : 'rejected', rejectReason: reason, confirmedAt: Date.now() } : x)) }))
    } else setDecided((d) => ({ ...d, [q.id]: ok ? 'approved' : 'rejected' }))
    toast({ title: ok ? `Approved: ${q.title}` : `Rejected: ${reason}`, emoji: ok ? '✅' : '⛔' })
    setRejecting(null)
  }

  const stats = [
    { n: queue.length, l: 'Waiting', c: 'text-gold-300' },
    { n: Object.values(decided).filter((x) => x === 'approved').length, l: 'Approved', c: 'text-mint-300' },
    { n: s.reports.length, l: 'Reports', c: 'text-rose-300' },
  ]

  return (
    <div>
      <Header back title="Admin console" sub="Review posts before they go live" right={<span className="chip bg-mint-400/15 py-2 text-mint-300"><ShieldCheck size={14} /> Owner</span>} />
      <div className="flex flex-col gap-4 px-5">
        <div className="grid grid-cols-3 gap-2">{stats.map((x) => <div key={x.l} className="card text-center"><p className={`text-2xl font-extrabold ${x.c}`}>{x.n}</p><p className="text-xs text-slate-400">{x.l}</p></div>)}</div>

        <section>
          <p className="label mb-2">Review queue</p>
          {!queue.length && <p className="card text-center text-sm text-slate-400">All caught up ✨</p>}
          {queue.map((q, i) => {
            const red = q.checks.filter(([, ok]) => !ok).length
            return (
              <motion.div key={q.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className={`card mb-3 ${red ? 'border-rose-400/30' : 'border-mint-400/20'}`}>
                <div className="flex items-start gap-2">
                  <span className="chip bg-fg/5 text-slate-300">{q.kind === 'housing' ? '🏠' : q.kind === 'job' ? '💼' : '🎉'} {q.kind}</span>
                  {red ? <span className="chip bg-rose-500/15 text-rose-300">{red} red flag{red > 1 ? 's' : ''}</span> : <span className="chip bg-mint-400/15 text-mint-300">All checks pass</span>}
                </div>
                <p className="mt-2 font-semibold">{q.title}</p>
                <p className="text-xs text-slate-400">by {q.who} · {q.detail}</p>
                <div className="mt-2 grid gap-1">
                  {q.checks.map(([label, ok]) => <p key={label} className={`flex items-center gap-2 text-xs ${ok ? 'text-mint-300' : 'text-rose-300'}`}>{ok ? <Check size={13} /> : <X size={13} />} {label}</p>)}
                </div>
                <div className="mt-2 flex gap-2 text-[11px] text-slate-500"><span className="flex items-center gap-1"><FileCheck2 size={12} /> Documents</span><span className="flex items-center gap-1"><Image size={12} /> Photos</span></div>
                {rejecting === q.id ? (
                  <div className="mt-3 flex flex-col gap-1.5">
                    {REASONS.map((r) => <button key={r} className="btn bg-rose-500/10 py-2 text-xs text-rose-300" onClick={() => decide(q, false, r)}>{r}</button>)}
                    <button className="text-xs text-slate-500" onClick={() => setRejecting(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="btn bg-rose-500/10 py-2.5 text-sm text-rose-300" onClick={() => setRejecting(q.id)}><X size={16} /> Reject</button>
                    <button className="btn-primary py-2.5 text-sm" onClick={() => decide(q, true)}><Check size={16} /> Approve</button>
                  </div>
                )}
              </motion.div>
            )
          })}
        </section>

        <section>
          <p className="label mb-2">User reports</p>
          {s.reports.length ? s.reports.map((id) => (
            <div key={id} className="card mb-2 flex items-center gap-3">
              <Flag size={16} className="text-rose-300" />
              <p className="min-w-0 flex-1 truncate text-sm">{id}</p>
              <button className="chip bg-fg/5 py-1.5 text-slate-300" onClick={() => set((p) => ({ ...p, reports: p.reports.filter((x) => x !== id) }))}>Dismiss</button>
            </div>
          )) : <p className="card text-center text-sm text-slate-400">No reports. Listings with repeated reports are auto-hidden until reviewed.</p>}
        </section>

        <section className="card">
          <p className="font-semibold">Post as Luda Official</p>
          <p className="mb-3 text-xs text-slate-400">As owner, your posts skip the checks and go live instantly with the official badge.</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Link to="/housing" className="btn-ghost px-2 py-2.5">🏠 House</Link>
            <Link to="/jobs" className="btn-ghost px-2 py-2.5">💼 Job</Link>
            <Link to="/community" className="btn-ghost px-2 py-2.5">🎉 Event</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
