// Guides, Terms & Conditions and ⓘ info tips (v1.12.0). The words live on the server (table `guides`), so the Luda
// team can edit them in Luda HQ without an app update, and accepting the terms is recorded on the server.
import { Eye, FileText, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, LIVE, publicGet, staffCan, type StaffPerms } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { Empty } from './LiveKit'
import { errMsg } from './LiveMoney'
import { Header, Sheet } from './ui'

export interface Guide { slug: string; kind: 'guide' | 'terms' | 'tip' | 'help' | 'privacy'; topic?: string | null; sort?: number; title: string; intro: string; steps: { title: string; body: string }[]; version: number; updated_at: string; updated_by?: string }

const cache: Record<string, Guide> = {}
let tipsLoaded: Promise<void> | null = null
export async function loadGuide(slug: string): Promise<Guide> {
  if (cache[slug]) return cache[slug]
  if (slug.startsWith('tip-')) {
    tipsLoaded ??= publicGet<{ guides: Guide[] }>('guides?kind=tip').then((r) => { r.guides.forEach((g) => { cache[g.slug] = g }) }).catch(() => { tipsLoaded = null })
    await tipsLoaded
    if (cache[slug]) return cache[slug]
  }
  const r = await publicGet<{ guide: Guide }>(`guide?slug=${slug}`)
  cache[slug] = r.guide
  return r.guide
}

export function useGuide(slug: string | null) {
  const [g, setG] = useState<Guide | null>(slug ? cache[slug] ?? null : null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!slug) return
    let alive = true
    loadGuide(slug).then((x) => alive && setG(x)).catch((e) => alive && setErr(errMsg(e)))
    return () => { alive = false }
  }, [slug])
  return { g, err }
}

export function GuideBody({ g }: { g: Guide }) {
  return (
    <div className="flex flex-col gap-3">
      {g.intro && <p className="text-sm leading-relaxed text-slate-300">{g.intro}</p>}
      {g.steps.length > 0 && <ol className="flex flex-col gap-2">
        {g.steps.map((st, i) => (
          <li key={i} className="flex gap-3 rounded-2xl bg-fg/[0.04] p-3">
            {g.kind !== 'terms' && <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint-400 text-xs font-extrabold text-ink-950">{i + 1}</span>}
            <div className="min-w-0"><p className="text-sm font-bold">{st.title}</p><p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{st.body}</p></div>
          </li>
        ))}
      </ol>}
      {g.kind === 'terms' && <p className="text-[11px] text-slate-500">Version {g.version} · updated {new Date(g.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
    </div>
  )
}

export function GuideSheet({ slug, onClose, onAgree }: { slug: string; onClose: () => void; onAgree?: () => void }) {
  const { g, err } = useGuide(slug)
  return (
    <Sheet open onClose={onClose} title={g?.title ?? ' '}>
      <div className="pb-4">{g ? <GuideBody g={g} /> : <p className="text-sm text-slate-500">{err || 'Loading…'}</p>}
        {g && onAgree && <button className="btn-primary mt-5 w-full py-4" onClick={() => { onAgree(); onClose() }}>I’ve read them and I agree</button>}
      </div>
    </Sheet>
  )
}

/** Full page: /guide/p2p-proof, /terms. Links can be shared and opened from Luda HQ messages. */
export function GuidePage({ slug }: { slug: string }) {
  const { g, err } = useGuide(slug)
  return (
    <div className="pb-10">
      <Header back title={g?.title ?? (slug === 'terms' ? 'Terms & Conditions' : 'Guide')} />
      <div className="px-5">{g ? <GuideBody g={g} /> : <p className="text-sm text-slate-500">{err || (LIVE ? 'Loading…' : 'Guides are available in the live app.')}</p>}</div>
    </div>
  )
}

/** ⓘ — a small circle with an eye. Tap it to see how something works. Used only where people often get stuck. */
export function InfoTip({ slug, label, className = '' }: { slug: string; label?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  if (!LIVE) return null
  return (
    <>
      <button type="button" aria-label={label ?? 'How this works'} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        className={`inline-grid size-6 shrink-0 place-items-center rounded-full border border-sky-400/50 bg-sky-400/10 align-middle text-sky-300 ${className}`}>
        <Eye size={13} strokeWidth={2.4} />
      </button>
      {open && <GuideSheet slug={slug} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Link to a guide that opens in a sheet (e.g. 'How to record proof'). */
export function GuideLink({ slug, children, className = '' }: { slug: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return <><button type="button" className={className} onClick={() => setOpen(true)}>{children}</button>{open && <GuideSheet slug={slug} onClose={() => setOpen(false)} />}</>
}

/** Signed in but the current terms aren't accepted yet (new account, or the terms changed): ask before anything else. */
export function TermsGate() {
  const { me, refresh } = useLive()
  const [ok, setOk] = useState(false)
  const [view, setView] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const p = me?.profile
  const need = LIVE && !!p && !!p.termsCurrent && (p.termsVersion ?? 0) < p.termsCurrent
  const { g: terms, err: termsErr } = useGuide(need ? 'terms' : null)
  if (!need || !p) return null
  const first = !p.termsVersion
  const accept = async () => {
    setBusy(true); setErr('')
    try { await api('POST', 'terms-accept', { version: p.termsCurrent }); await refresh() } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  // The full terms are shown right here (a pop-up used to open BEHIND this screen, so they couldn't be read).
  // The tick box and Accept sit at the end, after the text.
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setView(true) }
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="pt-safe flex h-[100dvh] w-full max-w-app flex-col bg-ink-900 shadow-2xl tab:h-[92dvh] tab:rounded-t-[2rem]">
        <div className="flex items-center gap-3 border-b border-fg/5 px-5 py-4"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-mint-400/15 text-mint-300"><FileText size={22} /></span>
          <div className="min-w-0"><p className="text-lg font-bold">{first ? 'Luda Terms & Conditions' : 'We updated our terms'}</p><p className="text-xs text-slate-400">{first ? 'Please read them, then accept at the end.' : 'Please read what changed, then accept at the end.'}</p></div></div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" onScroll={onScroll}>
          {terms ? <GuideBody g={terms} /> : <p className="text-sm text-slate-500">{termsErr || 'Loading…'}</p>}
          {terms && <div className="mt-6 flex flex-col gap-3 border-t border-fg/10 pt-5">
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-emerald-500" checked={ok} onChange={(e) => setOk(e.target.checked)} /> I have read and agree to Luda's Terms & Conditions.</label>
            {err && <p className="text-sm text-rose-300">{err}</p>}
            <button className="btn-primary pb-safe w-full py-4" disabled={!ok || busy} onClick={() => void accept()}>Accept and continue</button>
          </div>}
        </div>
        {terms && !view && <p className="pb-safe border-t border-fg/5 px-5 py-3 text-center text-xs text-slate-400">↓ Scroll to the end to accept</p>}
      </div>
    </div>
  )
}

/* ---------------- Luda HQ: edit guides, tips and the terms ---------------- */
export function GuidesTab({ staff }: { staff: StaffPerms | null }) {
  const [list, setList] = useState<Guide[] | null>(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState<Guide | null>(null)
  const load = useCallback(() => { api<{ guides: Guide[] }>('GET', 'admin-guides').then((r) => setList(r.guides)).catch((e) => setErr(errMsg(e))) }, [])
  useEffect(() => { load() }, [load])
  const canEdit = staffCan(staff, 'content', 'edit'), canTerms = staffCan(staff, 'content', 'full')
  const group = (k: Guide['kind']) => (list ?? []).filter((g) => g.kind === k).sort((a, b) => `${a.topic ?? ''}${String(a.sort ?? 0).padStart(3, '0')}`.localeCompare(`${b.topic ?? ''}${String(b.sort ?? 0).padStart(3, '0')}`))
  const [adding, setAdding] = useState(false)
  const del = async (g: Guide) => { if (!confirm(`Delete "${g.title}"?`)) return; try { await api('POST', 'admin-help-delete', { slug: g.slug }); load() } catch (e) { setErr(errMsg(e)) } }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-400">Everything users read in guides, the ⓘ tips and the Terms comes from here. Changes show in the app straight away (no update needed).</p>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {!list ? <p className="text-sm text-slate-500">Loading…</p> : list.length === 0 ? <Empty emoji="📘" title="No guides" /> : (['terms', 'privacy', 'help', 'guide', 'tip'] as const).map((k) => (
        <section key={k} className="flex flex-col gap-2">
          <div className="flex items-center justify-between"><p className="label">{k === 'terms' ? 'Terms & Conditions' : k === 'privacy' ? 'Privacy notice' : k === 'help' ? 'Help Center articles' : k === 'guide' ? 'Guides (send them in chats)' : 'ⓘ Info tips'}</p>
            {k === 'help' && canEdit && <button className="chip bg-mint-400/15 px-3 py-1.5 text-xs text-mint-200" onClick={() => setAdding(true)}><Plus size={13} /> New article</button>}</div>
          {group(k).map((g) => (
            <div key={g.slug} className="card flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{g.title}</p><p className="truncate text-[11px] text-slate-500">{g.kind === 'terms' ? `Version ${g.version} · ` : ''}{g.kind !== 'tip' ? `/${g.kind === 'terms' ? 'terms' : `guide/${g.slug}`} · ` : ''}updated {new Date(g.updated_at).toLocaleDateString()}{g.updated_by ? ` by @${g.updated_by}` : ''}</p></div>
              {(k === 'terms' || k === 'privacy' ? canTerms : canEdit) && <button className="text-mint-300" aria-label="Edit" onClick={() => setEdit(g)}><Pencil size={16} /></button>}
              {k === 'help' && canTerms && <button className="text-rose-300" aria-label="Delete" onClick={() => void del(g)}><Trash2 size={16} /></button>}
            </div>
          ))}
        </section>
      ))}
      {edit && <GuideEditor g={edit} onClose={() => setEdit(null)} onDone={() => { delete cache[edit.slug]; tipsLoaded = null; load() }} />}
      {adding && <NewHelpArticle onClose={() => setAdding(false)} onDone={(g) => { load(); setEdit(g) }} />}
    </div>
  )
}

const HELP_TOPIC_NAMES: [string, string][] = [['start', '🚀 Getting started'], ['wallet', '💰 Wallet & top-ups'], ['withdraw', '🏦 Withdrawals'], ['p2p', '🤝 P2P exchange'], ['bills', '🧾 Bills'], ['tickets', '🚌 Bus tickets'], ['market', '🛍️ Market & Flash'], ['kyc', '🪪 ID check'], ['account', '🔐 Account & security']]
function NewHelpArticle({ onClose, onDone }: { onClose: () => void; onDone: (g: Guide) => void }) {
  const [topic, setTopic] = useState('start')
  const [title, setTitle] = useState('')
  const [err, setErr] = useState('')
  const go = async () => { try { const r = await api<{ guide: Guide }>('POST', 'admin-help-create', { topic, title }); onClose(); onDone({ ...r.guide, steps: r.guide.steps ?? [] }) } catch (e) { setErr(errMsg(e)) } }
  return (
    <Sheet open onClose={onClose} title="New help article">
      <div className="flex flex-col gap-3 pb-4">
        <label className="text-xs text-slate-400">Topic<select className="input mt-1" value={topic} onChange={(e) => setTopic(e.target.value)}>{HELP_TOPIC_NAMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="text-xs text-slate-400">Question<input className="input mt-1" maxLength={120} placeholder="e.g. Why is my balance hidden?" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <p className="text-[11px] text-slate-500">Next you write the answer. New texts show in English until their translation is added to the app.</p>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-3.5" disabled={title.trim().length < 5} onClick={() => void go()}>Create and write the answer</button>
      </div>
    </Sheet>
  )
}

function GuideEditor({ g, onClose, onDone }: { g: Guide; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(g.title)
  const [intro, setIntro] = useState(g.intro)
  const [steps, setSteps] = useState(g.steps)
  const [bump, setBump] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    try { await api('POST', 'admin-guide-save', { slug: g.slug, title, intro, steps, bump }); onDone(); onClose() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const setStep = (i: number, k: 'title' | 'body', v: string) => setSteps((x) => x.map((s, j) => (j === i ? { ...s, [k]: v } : s)))
  return (
    <Sheet open onClose={onClose} title={`Edit · ${g.title}`}>
      <div className="flex flex-col gap-3 pb-4">
        <label className="text-xs text-slate-400">Title<input className="input mt-1" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="text-xs text-slate-400">Intro<textarea className="input mt-1 min-h-24" maxLength={1500} value={intro} onChange={(e) => setIntro(e.target.value)} /></label>
        {steps.map((st, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-2xl bg-fg/[0.04] p-3">
            <div className="flex items-center gap-2"><input className="input flex-1 py-2 text-sm font-semibold" maxLength={120} value={st.title} onChange={(e) => setStep(i, 'title', e.target.value)} placeholder={`Step ${i + 1} title`} />
              <button className="text-rose-300" aria-label="Remove step" onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}><Trash2 size={15} /></button></div>
            <textarea className="input min-h-20 text-sm" maxLength={1500} value={st.body} onChange={(e) => setStep(i, 'body', e.target.value)} />
          </div>
        ))}
        <button className="btn-ghost py-2.5 text-sm" onClick={() => setSteps((x) => [...x, { title: '', body: '' }])}><Plus size={15} /> Add a {g.kind === 'terms' ? 'section' : 'step'}</button>
        {g.kind === 'terms' && <label className="flex items-start gap-2 rounded-2xl border border-gold-400/40 bg-gold-400/10 p-3 text-xs"><input type="checkbox" className="mt-0.5 size-4" checked={bump} onChange={(e) => setBump(e.target.checked)} /> Important change: ask everyone to accept the terms again (version {g.version} → {g.version + 1}).</label>}
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-3.5" disabled={busy || title.trim().length < 2} onClick={() => void save()}>Save</button>
        {g.kind === 'guide' && <Link className="text-center text-xs text-mint-300" to={`/guide/${g.slug}`}>Open the page</Link>}
      </div>
    </Sheet>
  )
}
