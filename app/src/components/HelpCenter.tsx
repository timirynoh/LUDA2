// Help Center (v1.19.0, owner: 'like professional apps: structured, nice, an easy flow'). Search first, then your
// open requests, quick actions, topics and articles. Articles come from the server (Luda HQ edits them), each one asks
// "Was this helpful?", and "No" leads straight to a message to the Luda team with the topic already filled in.
import { ChevronDown, ChevronRight, FileText, MessageCircle, Search, ShieldAlert, ShieldCheck, ThumbsDown, ThumbsUp, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api, LIVE, publicGet } from '../lib/live'
import { useStore } from '../lib/store'
import { GuideSheet } from './LiveGuides'
import { CasesHub, STATUS_LABEL, ticketNo, useCases, type CaseCategory } from './LiveSupport'
import { Sheet } from './ui'

export interface HelpTopic { id: string; emoji: string; title: string; category: CaseCategory }
export interface HelpArticle { slug: string; topic: string; sort: number; title: string; intro: string; steps: { title: string; body: string }[] }
interface HelpData { topics: HelpTopic[]; articles: HelpArticle[] }

let cache: HelpData | null = null
let pending: Promise<HelpData> | null = null
export function useHelp() {
  const [data, setData] = useState<HelpData | null>(cache)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (cache || !LIVE) return
    pending ??= publicGet<HelpData>('help').then((r) => (cache = r)).finally(() => { pending = null })
    pending.then(setData).catch(() => setErr('Couldn’t load help articles. Check your connection.'))
  }, [])
  return { data, err }
}

type Contact = { category: CaseCategory; subject?: string } | null

/** One question: tap to open, read, then "Was this helpful?". */
function Article({ a, topic, open, onToggle, onContact }: { a: HelpArticle; topic?: HelpTopic; open: boolean; onToggle: () => void; onContact: (c: Contact) => void }) {
  const [vote, setVote] = useState<boolean | null>(null)
  const send = (helpful: boolean) => { setVote(helpful); void api('POST', 'help-vote', { slug: a.slug, helpful }).catch(() => {}) }
  return (
    <div className={`overflow-hidden rounded-2xl transition ${open ? 'bg-fg/[0.06] ring-1 ring-fg/10' : 'bg-fg/[0.03]'}`}>
      <button className="flex w-full items-center gap-3 px-4 py-3.5 text-start" onClick={onToggle} aria-expanded={open}>
        <span className="flex-1 text-sm font-semibold">{a.title}</span>
        <ChevronDown size={16} className={`shrink-0 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {a.intro && <p className="text-sm leading-relaxed text-slate-300">{a.intro}</p>}
          {a.steps.length > 0 && <ol className="flex flex-col gap-2">
            {a.steps.map((s, i) => (
              <li key={i} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-mint-400 text-[11px] font-extrabold text-ink-950">{i + 1}</span>
                <div className="min-w-0"><p className="text-sm font-semibold">{s.title}</p><p className="text-sm text-slate-400">{s.body}</p></div></li>
            ))}
          </ol>}
          <div className="mt-1 border-t border-fg/5 pt-3">
            {vote === null ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs text-slate-400">Was this helpful?</span>
                <button className="chip bg-fg/5 px-3 py-1.5 text-xs text-slate-200" onClick={() => send(true)}><ThumbsUp size={13} /> Yes</button>
                <button className="chip bg-fg/5 px-3 py-1.5 text-xs text-slate-200" onClick={() => send(false)}><ThumbsDown size={13} /> No</button>
              </div>
            ) : vote ? <p className="text-xs text-mint-300">Thanks for letting us know 💚</p> : (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-slate-400">Sorry this didn’t answer it. The Luda team can help you directly.</p>
                <button className="btn-primary py-2.5 text-sm" onClick={() => onContact({ category: topic?.category ?? 'other', subject: a.title })}><MessageCircle size={15} /> Message the Luda team</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** All the questions of one topic, in a pop-up (also used by the "Help" buttons on other screens). */
export function TopicSheet({ topicId, onClose }: { topicId: string; onClose: () => void }) {
  const { data, err } = useHelp()
  const [open, setOpen] = useState<string | null>(null)
  const [contact, setContact] = useState<Contact>(null)
  const topic = data?.topics.find((t) => t.id === topicId)
  const list = (data?.articles ?? []).filter((a) => a.topic === topicId)
  if (contact) return <CasesHub start="new" category={contact.category} subject={contact.subject} onClose={() => { setContact(null); onClose() }} />
  return (
    <Sheet open onClose={onClose} title={topic ? `${topic.emoji} ${topic.title}` : 'Help'}>
      <div className="flex flex-col gap-2 pb-2">
        {err && <p className="text-sm text-rose-300">{err}</p>}
        {!data && !err && <p className="text-sm text-slate-500">Loading…</p>}
        {list.map((a, i) => <Article key={a.slug} a={a} topic={topic} open={open === a.slug || (open === null && i === 0 && list.length === 1)} onToggle={() => setOpen(open === a.slug ? '' : a.slug)} onContact={setContact} />)}
        {data && <button className="btn-ghost mt-2 py-3 text-sm" onClick={() => setContact({ category: topic?.category ?? 'other' })}><MessageCircle size={15} /> Still need help? Message us</button>}
      </div>
    </Sheet>
  )
}

/** Small "Help" button for screen headers: opens that screen's help topic. */
export function HelpChip({ topic }: { topic: string }) {
  const [open, setOpen] = useState(false)
  if (!LIVE) return null
  return (
    <>
      <button className="glass flex h-10 items-center gap-1.5 rounded-2xl px-3 text-xs font-semibold text-slate-200" onClick={() => setOpen(true)} aria-label="Help">
        <span className="grid size-5 place-items-center rounded-full bg-sky-400/20 text-[11px] font-extrabold text-sky-300">?</span> Help
      </button>
      {open && <TopicSheet topicId={topic} onClose={() => setOpen(false)} />}
    </>
  )
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** The Help page in the live app. */
export function HelpCenter() {
  const { s } = useStore()
  const loc = useLocation(), nav = useNavigate()
  const { data, err } = useHelp()
  const { cases } = useCases()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [topic, setTopic] = useState<string | null>(() => new URLSearchParams(loc.search).get('topic'))
  const [contact, setContact] = useState<Contact>(null)
  const [hub, setHub] = useState<null | { start: 'list' | 'new'; caseId?: string }>(null)
  const [legal, setLegal] = useState<null | 'terms' | 'privacy'>(null)
  const first = (s.name || '').split(' ')[0]
  const byTopic = (id: string) => (data?.articles ?? []).filter((a) => a.topic === id)
  const results = useMemo(() => {
    const words = norm(q).split(/\s+/).filter((w) => w.length > 1)
    if (!words.length || !data) return []
    return data.articles
      .map((a) => { const hay = norm(`${a.title} ${a.intro} ${a.steps.map((x) => `${x.title} ${x.body}`).join(' ')}`); return { a, score: words.reduce((n, w) => n + (norm(a.title).includes(w) ? 3 : hay.includes(w) ? 1 : 0), 0) } })
      .filter((x) => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 12).map((x) => x.a)
  }, [q, data])
  const active = (cases ?? []).filter((c) => c.status === 'open' || c.status === 'waiting_user')
  const recent = (cases ?? []).slice(0, 3)
  const popular = (data?.topics ?? []).map((t) => byTopic(t.id)[0]).filter(Boolean).slice(0, 5) as HelpArticle[]
  const closeTopic = () => { setTopic(null); if (new URLSearchParams(loc.search).get('topic')) nav('/help', { replace: true }) }

  return (
    <div className="flex flex-col gap-5 px-5 pb-10">
      {/* Search */}
      <div className="rounded-[1.75rem] bg-gradient-to-br from-emerald-500 via-emerald-700 to-teal-900 p-5 shadow-xl shadow-emerald-900/30">
        <p className="text-sm font-semibold text-emerald-100">{first ? `Hi ${first} 👋` : 'Hi 👋'}</p>
        <p className="mt-0.5 text-2xl font-extrabold tracking-tight text-white">How can we help?</p>
        <div className="relative mt-4">
          <Search size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="w-full rounded-2xl bg-white py-3.5 ps-11 pe-10 text-sm font-medium text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-4 focus:ring-white/30"
            placeholder="Search: top-up, withdraw, P2P, ID…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-500" onClick={() => setQ('')} aria-label="Clear"><X size={16} /></button>}
        </div>
      </div>

      {err && <p className="text-sm text-rose-300">{err}</p>}

      {q.trim() ? (
        <section className="flex flex-col gap-2">
          <p className="label">{results.length ? 'Answers' : 'No answers found'}</p>
          {results.map((a) => <Article key={a.slug} a={a} topic={data?.topics.find((t) => t.id === a.topic)} open={open === a.slug} onToggle={() => setOpen(open === a.slug ? null : a.slug)} onContact={setContact} />)}
          {!results.length && <div className="card flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-slate-400">{`We couldn’t find an answer for “${q}”. Ask the Luda team instead.`}</p>
            <button className="btn-primary mt-1 w-full py-3" onClick={() => setContact({ category: 'other', subject: q.slice(0, 80) })}><MessageCircle size={16} /> Message the Luda team</button>
          </div>}
        </section>
      ) : <>
        {/* Your requests */}
        {recent.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between"><p className="label">Your requests</p>
              <button className="text-xs font-semibold text-mint-300" onClick={() => setHub({ start: 'list' })}>See all{active.length ? ` · ${active.length} open` : ''}</button></div>
            {recent.map((c) => (
              <button key={c.id} className="card flex items-center gap-3 py-3 text-start" onClick={() => setHub({ start: 'list', caseId: c.id })}>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.subject}</p>
                  <p className="text-[11px] text-slate-500"><span translate="no" className="font-mono">{ticketNo(c.id)}</span> · {new Date(c.updated_at).toLocaleDateString()}</p></div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_LABEL[c.status]?.c}`}>{STATUS_LABEL[c.status]?.t}</span>
                <ChevronRight size={16} className="shrink-0 text-slate-600" />
              </button>
            ))}
          </section>
        )}

        {/* Quick actions */}
        <section className="grid grid-cols-2 gap-2">
          <button className="card flex flex-col items-start gap-2 py-4" onClick={() => setContact({ category: 'other' })}><span className="grid size-10 place-items-center rounded-2xl bg-mint-400/15 text-mint-300"><MessageCircle size={20} /></span><span className="text-sm font-semibold">Message us</span><span className="-mt-1 text-[11px] text-slate-500">Reply here in the app</span></button>
          <button className="card flex flex-col items-start gap-2 py-4" onClick={() => setHub({ start: 'list' })}><span className="grid size-10 place-items-center rounded-2xl bg-sky-400/15 text-sky-300"><FileText size={20} /></span><span className="text-sm font-semibold">My requests</span><span className="-mt-1 text-[11px] text-slate-500">{active.length ? `${active.length} open` : 'Track your requests'}</span></button>
          <Link to="/security" className="card flex flex-col items-start gap-2 py-4"><span className="grid size-10 place-items-center rounded-2xl bg-violet-400/15 text-violet-300"><ShieldCheck size={20} /></span><span className="text-sm font-semibold">Security</span><span className="-mt-1 text-[11px] text-slate-500">Freeze wallet, sign-ins</span></Link>
          <button className="card flex flex-col items-start gap-2 py-4" onClick={() => setContact({ category: 'other', subject: 'Report a scam' })}><span className="grid size-10 place-items-center rounded-2xl bg-rose-500/15 text-rose-300"><ShieldAlert size={20} /></span><span className="text-sm font-semibold">Report a scam</span><span className="-mt-1 text-[11px] text-slate-500">Someone asked for money?</span></button>
        </section>

        {/* Topics */}
        <section>
          <p className="label mb-2">Browse topics</p>
          <div className="grid grid-cols-3 gap-2">
            {(data?.topics ?? []).map((t) => (
              <button key={t.id} className="card flex flex-col items-center gap-1.5 px-2 py-4 text-center" onClick={() => setTopic(t.id)}>
                <span className="text-2xl">{t.emoji}</span><span className="text-xs font-semibold leading-tight">{t.title}</span>
              </button>
            ))}
            {!data && !err && Array.from({ length: 6 }, (_, i) => <div key={i} className="card h-24 animate-pulse" />)}
          </div>
        </section>

        {/* Popular */}
        {popular.length > 0 && (
          <section className="flex flex-col gap-2">
            <p className="label">Popular questions</p>
            {popular.map((a) => <Article key={a.slug} a={a} topic={data?.topics.find((t) => t.id === a.topic)} open={open === a.slug} onToggle={() => setOpen(open === a.slug ? null : a.slug)} onContact={setContact} />)}
          </section>
        )}

        {/* Still need help */}
        <section className="flex items-center gap-3 rounded-3xl bg-fg/[0.04] p-4 ring-1 ring-fg/10">
          <span className="text-3xl">🙋🏾</span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Still need help?</p><p className="text-xs text-slate-400">The Luda team replies in your requests. You’ll get a notification.</p></div>
          <button className="btn-primary shrink-0 px-4 py-2.5 text-sm" onClick={() => setContact({ category: 'other' })}>Message</button>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost text-sm" onClick={() => setLegal('terms')}><FileText size={16} /> Terms</button>
          <button className="btn-ghost text-sm" onClick={() => setLegal('privacy')}><FileText size={16} /> Privacy</button>
        </div>
        <p className="text-center text-[11px] text-slate-500">Emergency in TRNC: Police 155 · Ambulance 112 · Fire 199</p>
      </>}

      {topic && <TopicSheet topicId={topic} onClose={closeTopic} />}
      {contact && <CasesHub start="new" category={contact.category} subject={contact.subject} onClose={() => setContact(null)} />}
      {hub && <CasesHub start={hub.start} caseId={hub.caseId} onClose={() => setHub(null)} />}
      {legal && <GuideSheet slug={legal} onClose={() => setLegal(null)} />}
    </div>
  )
}
