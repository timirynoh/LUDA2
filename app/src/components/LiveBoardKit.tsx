// Live community posts: card, details sheet (report / remove), the posting form, and the "who can post" card.
import { BadgeCheck, Flag, MapPin, MessageCircle, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BOARD, rulesText, type BoardKind, type BoardPost, type BoardRules } from '../lib/board'
import { api } from '../lib/live'
import { ago } from './LiveKit'
import { errMsg } from './LiveMoney'
import { Attachments, type Upload } from './LiveSupport'
import { Sheet, Success } from './ui'

const val = (p: BoardPost, k: string) => p.data?.[k]
const tl = (n: unknown) => `₺${Number(n).toLocaleString('en-US')}`

/** The key facts of a post, as small chips. */
export function facts(p: BoardPost): string[] {
  const d = p.data ?? {}
  switch (p.kind) {
    case 'housing': return [d.type && String(d.type), d.price && `${tl(d.price)}/month`, d.furnished && 'Furnished', d.bills && 'Bills incl.', d.deposit && d.deposit !== 'None' && `${d.deposit} mo deposit`].filter(Boolean) as string[]
    case 'job': return [d.jobType && String(d.jobType), d.pay && `${tl(d.pay)}/${d.unit ?? 'hour'}`, d.permit && 'Permit help'].filter(Boolean) as string[]
    case 'event': return [d.category && String(d.category), d.date && new Date(String(d.date)).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), Number(d.price ?? 0) > 0 ? tl(d.price) : 'Free'].filter(Boolean) as string[]
    case 'news': return [d.category && String(d.category)].filter(Boolean) as string[]
    case 'promo': return [d.discount && String(d.discount), d.until && `until ${new Date(String(d.until)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`].filter(Boolean) as string[]
    default: return [d.category && String(d.category), d.hours && String(d.hours)].filter(Boolean) as string[]
  }
}
const place = (p: BoardPost) => String(val(p, 'area') ?? val(p, 'place') ?? val(p, 'shop') ?? val(p, 'company') ?? val(p, 'address') ?? '')

export function PostCard({ p, onOpen }: { p: BoardPost; onOpen: () => void }) {
  const B = BOARD[p.kind]
  const photo = p.photoUrls?.find(Boolean)
  return (
    <button onClick={onOpen} className="card flex flex-col gap-3 overflow-hidden p-0 text-start">
      {photo ? <img src={photo} alt="" loading="lazy" className="h-40 w-full object-cover" />
        : <div className={`flex h-20 items-center gap-3 bg-gradient-to-br ${B.tint} px-4 text-white`}><span className="text-3xl">{B.emoji}</span><span className="text-xs font-semibold uppercase tracking-wide text-white/80">{B.label}</span></div>}
      <div className="flex flex-col gap-2 px-4 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {p.official && <span className="chip bg-mint-400/20 py-0.5 text-[10px] text-mint-200"><ShieldCheck size={11} /> Luda Official</span>}
          {p.status === 'review' && <span className="chip bg-gold-400/15 py-0.5 text-[10px] text-gold-200">⏳ Waiting for review</span>}
          {facts(p).slice(0, 3).map((f) => <span key={f} className="chip bg-fg/[0.06] py-0.5 text-[10px] text-slate-300">{f}</span>)}
        </div>
        <p className="font-bold leading-snug">{p.title}</p>
        {p.body && <p className="line-clamp-2 text-xs text-slate-400">{p.body}</p>}
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1 truncate">{p.official ? 'Luda team' : `@${p.author}`}{p.authorVerified && !p.official && <BadgeCheck size={12} className="text-mint-300" />}</span>
          {place(p) && <span className="flex min-w-0 items-center gap-0.5 truncate"><MapPin size={11} /> {place(p)}</span>}
          <span className="ms-auto shrink-0">{ago(p.created_at)}</span>
        </div>
      </div>
    </button>
  )
}

export function PostSheet({ p, onClose, onChange }: { p: BoardPost; onClose: () => void; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [reporting, setReporting] = useState(false)
  const B = BOARD[p.kind]
  const contact = String(val(p, 'contact') ?? val(p, 'phone') ?? '')
  const wa = contact.replace(/[^\d+]/g, '')
  const act = async (route: string, body: Record<string, unknown>, done: string) => {
    setBusy(true); setMsg('')
    try { await api('POST', route, body); setMsg(done); onChange() } catch (e) { setMsg(errMsg(e)) } finally { setBusy(false) }
  }
  const rows = B.fields.filter((f) => val(p, f.key) !== undefined && val(p, f.key) !== '' && f.key !== 'contact').map((f) => {
    const v = val(p, f.key)
    return [f.label, f.type === 'bool' ? (v ? 'Yes' : 'No') : f.type === 'date' ? new Date(String(v)).toLocaleString() : f.type === 'number' && /₺/.test(f.label) ? tl(v) : String(v)] as [string, string]
  })
  return (
    <Sheet open onClose={onClose} title={B.label}>
      <div className="flex flex-col gap-3 pb-4">
        {p.photoUrls?.filter(Boolean).length > 0 && <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1">{p.photoUrls.filter(Boolean).map((u, i) => <img key={i} src={u!} alt="" className="h-48 w-[85%] shrink-0 snap-center rounded-2xl object-cover" />)}</div>}
        <div className="flex flex-wrap gap-1.5">{p.official && <span className="chip bg-mint-400/20 text-mint-200"><ShieldCheck size={12} /> Luda Official</span>}{facts(p).map((f) => <span key={f} className="chip bg-fg/[0.06] text-slate-300">{f}</span>)}</div>
        <h2 className="text-xl font-extrabold leading-tight">{p.title}</h2>
        {p.body && <p className="selectable whitespace-pre-line text-sm text-slate-300">{p.body}</p>}
        {rows.length > 0 && <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">{rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-4 py-2.5"><span className="text-slate-400">{k}</span><span className="selectable text-end font-medium">{v}</span></div>)}</div>}
        <div className="flex items-center gap-3 rounded-2xl bg-fg/[0.04] p-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-mint-400/30 to-emerald-700/40 text-sm font-bold">{p.official ? '✓' : (p.authorName || p.author).slice(0, 2).toUpperCase()}</span>
          <div className="min-w-0 flex-1 text-sm"><p className="flex items-center gap-1 font-semibold">{p.official ? 'Luda team' : p.authorName}{(p.authorVerified || p.official) && <BadgeCheck size={14} className="text-mint-300" />}</p>
            <p className="text-xs text-slate-400">{p.official ? 'Official post' : `@${p.author} · ${p.authorVerified ? 'ID verified' : 'not verified'}`} · {ago(p.created_at)}</p></div>
        </div>
        {contact && <a href={wa.length >= 8 ? `https://wa.me/${wa.replace(/^\+/, '')}` : `mailto:${contact}`} target="_blank" rel="noreferrer" className="btn-primary py-3.5"><MessageCircle size={17} /> Contact {wa.length >= 8 ? 'on WhatsApp' : ''}</a>}
        {p.kind === 'housing' && <p className="rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100">🛡️ Never send a deposit before you've seen the place and met the landlord in person.</p>}
        {p.status === 'review' && p.mine && <p className="rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100">⏳ A Luda team member is checking this. It will appear for everyone once approved.</p>}
        {p.review_note && p.mine && <p className="text-xs text-slate-400">Note from the team: {p.review_note}</p>}
        {msg && <p className="text-center text-sm text-slate-300">{msg}</p>}
        {p.mine ? <button disabled={busy} className="btn-ghost py-3 text-sm text-rose-300" onClick={() => void act('board-remove', { id: p.id }, 'Removed').then(onClose)}><Trash2 size={15} /> Remove my post</button>
          : !p.official && !p.reported && (reporting
            ? <div className="flex flex-wrap gap-2">{['Scam or fake', 'Wrong information', 'Already taken', 'Rude or offensive'].map((r) => <button key={r} disabled={busy} onClick={() => void act('board-report', { id: p.id, reason: r }, 'Thanks. The team will check it.')} className="chip bg-fg/[0.06] py-2 text-slate-300">{r}</button>)}</div>
            : <button className="btn-ghost py-3 text-sm text-slate-400" onClick={() => setReporting(true)}><Flag size={15} /> Report this post</button>)}
        {p.reported && !p.mine && <p className="text-center text-xs text-slate-500">You reported this post.</p>}
      </div>
    </Sheet>
  )
}

/** "Who can post" — always visible so people know what it takes and why. */
export function RulesCard({ kind, rules, why, canPost, onPost }: { kind: BoardKind; rules: BoardRules; why: string | null; canPost: boolean; onPost: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-3xl border border-mint-400/20 bg-mint-400/[0.06] p-4">
      <div className="flex items-center gap-3">
        <ShieldCheck className="shrink-0 text-mint-300" />
        <div className="min-w-0 flex-1"><p className="text-sm font-bold">Real people only</p><p className="text-xs text-slate-400">{canPost ? `You can post a ${BOARD[kind].one}.` : why}</p></div>
        {canPost ? <button className="btn-primary shrink-0 px-4 py-2.5 text-sm" onClick={onPost}><Plus size={16} /> Post</button> : <button className="shrink-0 text-xs font-semibold text-mint-300" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Why?'}</button>}
      </div>
      {(open || canPost) && <ul className="mt-3 flex flex-col gap-1.5 text-xs text-slate-300">{rulesText(kind, rules).map((r) => <li key={r} className="flex gap-2"><span className="text-mint-300">✓</span>{r}</li>)}</ul>}
    </div>
  )
}

/** The posting form for any kind. `official` = staff posting as Luda Official. */
export function PostForm({ kind, official, onClose, onDone }: { kind: BoardKind; official?: boolean; onClose: () => void; onDone: () => void }) {
  const B = BOARD[kind]
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [data, setData] = useState<Record<string, string | number | boolean>>({})
  const [files, setFiles] = useState<Upload[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const missing = B.fields.filter((f) => !f.optional && f.type !== 'bool' && (data[f.key] === undefined || data[f.key] === ''))
  const send = async () => {
    setBusy(true); setErr('')
    try {
      const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '').map(([k, v]) => [k, B.fields.find((f) => f.key === k)?.type === 'date' ? new Date(String(v)).toISOString() : v]))
      const r = await api<{ status: string }>('POST', 'board-post', { kind, title, body, data: clean, files: files.map(({ name, type, data }) => ({ name, type, data })), official: !!official })
      setDone(r.status); onDone()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title={official ? `Post ${B.one} as Luda Official` : `Post a ${B.one}`}>
      {done ? <Success title={done === 'review' ? 'Sent for review ⏳' : 'Posted ✨'} sub={done === 'review' ? 'A team member checks news before it goes public. You can see it under Mine.' : 'It’s live for everyone now.'} onClose={onClose} /> : (
        <div className="flex flex-col gap-3 pb-4">
          <label className="text-xs text-slate-400">Title<input className="input mt-1" maxLength={90} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={B.title} /></label>
          {B.fields.map((f) => (
            <label key={f.key} className="text-xs text-slate-400">{f.type !== 'bool' && <>{f.label}{f.optional && <span className="text-slate-500"> (optional)</span>}</>}
              {f.type === 'select' ? <div className="mt-1 flex flex-wrap gap-2">{f.options!.map((o) => <button type="button" key={o} onClick={() => setData((d) => ({ ...d, [f.key]: o }))} className={`chip py-2 ${data[f.key] === o ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/40' : 'bg-fg/[0.06] text-slate-300'}`}>{o}</button>)}</div>
                : f.type === 'bool' ? <span className="flex items-center gap-3 rounded-2xl bg-fg/[0.04] p-3 text-sm text-slate-200"><input type="checkbox" className="size-5 accent-emerald-400" checked={!!data[f.key]} onChange={(e) => setData((d) => ({ ...d, [f.key]: e.target.checked }))} />{f.label}</span>
                : <input className="input mt-1" type={f.type === 'date' ? 'datetime-local' : 'text'} inputMode={f.type === 'number' ? 'numeric' : f.type === 'tel' ? 'tel' : undefined} placeholder={f.placeholder}
                    value={String(data[f.key] ?? '')} onChange={(e) => setData((d) => ({ ...d, [f.key]: f.type === 'number' ? (e.target.value.replace(/\D/g, '') ? Number(e.target.value.replace(/\D/g, '')) : '') : e.target.value }))} />}
            </label>
          ))}
          <label className="text-xs text-slate-400">Details<textarea className="input mt-1 min-h-24" maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} placeholder={B.body} /></label>
          <div><p className="mb-1 text-xs text-slate-400">Photos (up to 4)</p><Attachments files={files} setFiles={(f) => setFiles(f.slice(0, 4))} /></div>
          {err && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200">{err}</p>}
          <button className="btn-primary py-4" disabled={busy || title.trim().length < 3 || missing.length > 0} onClick={() => void send()}>{busy ? 'Posting…' : missing.length ? `Add: ${missing[0].label}` : kind === 'news' && !official ? 'Send for review' : 'Post now'}</button>
          <p className="text-center text-[11px] text-slate-500">Your name and verified badge are shown with the post. Fake or scam posts get your account blocked.</p>
        </div>
      )}
    </Sheet>
  )
}

/** Home strip with the newest real posts of one kind (hidden when there are none). */
export function BoardStrip({ kind, title, to }: { kind: BoardKind; title: string; to: string }) {
  const [items, setItems] = useState<BoardPost[] | null>(null)
  const [open, setOpen] = useState<BoardPost | null>(null)
  useEffect(() => { api<{ items: BoardPost[] }>('GET', `board?kind=${kind}`).then((r) => setItems(r.items.slice(0, 6))).catch(() => setItems([])) }, [kind])
  if (!items?.length) return null
  return (
    <section>
      <div className="mb-2 flex items-center justify-between"><p className="label">{title}</p><Link to={to} className="text-xs text-mint-300">See all</Link></div>
      <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {items.map((p) => (
          <button key={p.id} onClick={() => setOpen(p)} className="card flex w-60 shrink-0 flex-col gap-1.5 text-start">
            <div className="flex flex-wrap gap-1">{p.official && <span className="chip bg-mint-400/20 py-0.5 text-[10px] text-mint-200"><ShieldCheck size={11} /> Official</span>}{facts(p).slice(0, 2).map((f) => <span key={f} className="chip bg-fg/[0.06] py-0.5 text-[10px] text-slate-300">{f}</span>)}</div>
            <p className="line-clamp-2 text-sm font-bold leading-snug">{p.title}</p>
            <p className="text-[11px] text-slate-500">{p.official ? 'Luda team' : `@${p.author}`} · {ago(p.created_at)}</p>
          </button>
        ))}
      </div>
      {open && <PostSheet p={open} onClose={() => setOpen(null)} onChange={() => {}} />}
    </section>
  )
}
