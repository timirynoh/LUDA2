import { BadgeCheck, Clock, Flag, MessageCircle, Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Stars } from '../components/Review'
import { TradeChat } from '../components/TradeChat'
import { Header, Sheet } from '../components/ui'
import { personOf, SAMPLE_REVIEWS } from '../lib/social'
import { useStore } from '../lib/store'

/** Public profile for fixers, exchangers and sellers: trust at a glance. */
export default function Person() {
  const { name: raw = '' } = useParams()
  const name = decodeURIComponent(raw)
  const { s, set, toast, allow } = useStore()
  const p = personOf(name)
  const [chat, setChat] = useState(false)
  const mine = s.reviews.filter((r) => r.about === name)
  const count = p.reviews + mine.length
  const avg = (p.rating * p.reviews + mine.reduce((a, r) => a + r.stars, 0)) / count
  const roleLabel = p.roles.includes('fixer') ? 'Fixer' : 'Exchanger & seller'
  return (
    <div>
      <Header back title={name} sub={`@${p.username} · ${roleLabel}`} />
      <div className="flex flex-col gap-4 px-5">
        <div className="card flex items-center gap-4">
          <div className="grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-ink-600 to-ink-800 text-4xl">{p.flag}</div>
          <div className="flex-1">
            <p className="flex items-center gap-1 text-lg font-bold">{name}{p.kyc && <BadgeCheck size={18} className="text-mint-400" />}</p>
            <p className="flex items-center gap-1 text-sm"><Stars value={avg} size={14} /> <b>{avg.toFixed(2)}</b> <span className="text-slate-400">({count})</span></p>
            <p className="text-xs text-slate-400">{p.city} · joined {p.joined}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="card p-3"><p className="text-xl font-extrabold">{p.jobs || p.trades}</p><p className="text-[11px] text-slate-400">{p.jobs ? 'jobs done' : 'trades'}</p></div>
          <div className="card p-3"><p className="flex items-center justify-center gap-1 text-xl font-extrabold"><Clock size={14} />{p.response}</p><p className="text-[11px] text-slate-400">reply time</p></div>
          <div className="card p-3"><p className="text-xl font-extrabold">{Math.round(avg * 20)}%</p><p className="text-[11px] text-slate-400">positive</p></div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {p.kyc && <span className="chip bg-mint-400/15 text-mint-300">✓ KYC verified</span>}
          {p.verified && <span className="chip bg-sky-400/15 text-sky-300">📱 Phone verified</span>}
          {p.roles.includes('exchanger') && <span className="chip bg-gold-400/15 text-gold-300">🏪 Exchanger</span>}
          {p.skills.map((k) => <span key={k} className="chip bg-fg/5 text-slate-300">{k}</span>)}
        </div>
        {p.gallery.length > 0 && (
          <section><p className="label mb-2">Past jobs</p>
            <div className="grid grid-cols-4 gap-2">{p.gallery.map((g, i) => <div key={i} className="grid aspect-square place-items-center rounded-2xl bg-gradient-to-br from-ink-600 to-ink-800 text-3xl">{g}</div>)}</div></section>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary py-3.5" onClick={() => setChat(true)}><MessageCircle size={18} /> Message</button>
          <Link to="/send" className="btn-ghost py-3.5"><Send size={18} /> Send money</Link>
        </div>
        <section>
          <p className="label mb-2">Reviews</p>
          {[...mine.map((r) => [r.by + ' (you)', r.stars, r.text || r.tags.join(', '), r.tags] as const), ...SAMPLE_REVIEWS].map(([who, st, txt, tags], i) => (
            <div key={i} className="card mb-2">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold">{who}</p><Stars value={st} size={12} /></div>
              <p className="mt-1 text-sm text-slate-300">{txt}</p>
              {tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{tags.map((t) => <span key={t} className="chip bg-fg/5 text-[10px] text-slate-400">{t}</span>)}</div>}
            </div>
          ))}
        </section>
        <button className="flex items-center justify-center gap-1 text-xs text-slate-500 underline" onClick={() => { if (!allow('report')) return; set((st) => ({ ...st, reports: [...st.reports, `user:${name}`] })); toast({ title: 'Reported. Our safety team will review', emoji: '🛡️' }) }}><Flag size={12} /> Report {name.split(' ')[0]}</button>
      </div>
      {chat && <Sheet open onClose={() => setChat(false)} title={`Message ${name}`}><TradeChat threadKey={`dm-${name}`} name={name} flag={p.flag} /></Sheet>}
    </div>
  )
}
