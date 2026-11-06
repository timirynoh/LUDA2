// Luda HQ: Content (review reported/news posts, post as Luda Official), Banners (Home carousel), Team (owner gives staff roles by email).
import { Eye, EyeOff, Megaphone, Pencil, Plus, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { BOARD, type BoardKind, type BoardPost } from '../lib/board'
import { api, staffCan, type StaffArea, type StaffLevel, type StaffPerms } from '../lib/live'
import { BannerCard, THEMES, type Banner } from './Banners'
import { facts, PostForm } from './LiveBoardKit'
import { Empty, Tabs, ago } from './LiveKit'
import { ReviewAndPin, errMsg } from './LiveMoney'
import { Sheet, Success } from './ui'

function useGet<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => { api<T>('GET', path).then((r) => { setData(r); setErr('') }).catch((e) => setErr(errMsg(e))) }, [path])
  useEffect(() => { load() }, [load])
  return { data, err, load }
}

/* ------------------------------- Content ------------------------------- */
export function ContentTab({ staff }: { staff: StaffPerms | null }) {
  const [status, setStatus] = useState<'review' | 'live' | 'removed'>('review')
  const { data, err, load } = useGet<{ posts: BoardPost[] }>(`admin-board?status=${status}`)
  const [posting, setPosting] = useState<BoardKind | null>(null)
  const [msg, setMsg] = useState('')
  const canAct = staffCan(staff, 'content', 'edit')
  const review = async (p: BoardPost, approve: boolean, note = '') => {
    setMsg('')
    try { await api('POST', 'admin-board-review', { id: p.id, approve, note }); setMsg(approve ? 'Approved: it’s live now' : 'Removed'); load() } catch (e) { setMsg(errMsg(e)) }
  }
  return (
    <div className="flex flex-col gap-4">
      {canAct && <div className="rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-700/10 p-4">
        <p className="flex items-center gap-2 font-bold"><ShieldCheck size={18} className="text-mint-300" /> Post as Luda Official</p>
        <p className="mt-1 text-xs text-slate-400">Goes live straight away with the Official badge, pinned to the top.</p>
        <div className="mt-3 grid grid-cols-3 gap-2">{(Object.keys(BOARD) as BoardKind[]).map((k) => <button key={k} onClick={() => setPosting(k)} className="glass flex flex-col items-center gap-1 rounded-2xl py-3 text-xs font-semibold"><span className="text-2xl">{BOARD[k].emoji}</span>{BOARD[k].label}</button>)}</div>
      </div>}
      <Tabs value={status} onChange={setStatus} tabs={[{ value: 'review', label: '⏳ To check', badge: status === 'review' ? data?.posts.length : undefined }, { value: 'live', label: '🟢 Live' }, { value: 'removed', label: '🗑️ Removed' }]} />
      {msg && <p className="rounded-2xl bg-fg/[0.05] p-3 text-center text-sm">{msg}</p>}
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {data && data.posts.length === 0 && <Empty emoji={status === 'review' ? '✅' : '🗂️'} title={status === 'review' ? 'Nothing to check' : 'Nothing here'} sub={status === 'review' ? 'News waiting for approval and posts hidden by 3 reports show up here.' : undefined} />}
      {data?.posts.map((p) => <ReviewCard key={p.id} p={p} canAct={canAct} status={status} onReview={review} />)}
      {posting && <PostForm kind={posting} official onClose={() => setPosting(null)} onDone={load} />}
    </div>
  )
}

const REMOVE = ['Fake or scam', 'Wrong information', 'Duplicate', 'Not allowed on Luda']
function ReviewCard({ p, canAct, status, onReview }: { p: BoardPost; canAct: boolean; status: string; onReview: (p: BoardPost, approve: boolean, note?: string) => Promise<void> }) {
  const [removing, setRemoving] = useState(false)
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="chip bg-fg/[0.06] py-0.5">{BOARD[p.kind].emoji} {BOARD[p.kind].label}</span>
        {p.official && <span className="chip bg-mint-400/20 py-0.5 text-mint-200">Official</span>}
        {!!p.reports && <span className="chip bg-rose-500/15 py-0.5 text-rose-200">🚩 {p.reports} report{p.reports === 1 ? '' : 's'}</span>}
        {facts(p).slice(0, 2).map((f) => <span key={f} className="chip bg-fg/[0.06] py-0.5 text-slate-300">{f}</span>)}
        <span className="ms-auto text-slate-500">{ago(p.created_at)}</span>
      </div>
      <p className="font-bold">{p.title}</p>
      {p.body && <p className="selectable whitespace-pre-line text-sm text-slate-300">{p.body}</p>}
      {Object.entries(p.data ?? {}).length > 0 && <p className="selectable text-xs text-slate-400">{Object.entries(p.data).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
      {p.photoUrls?.filter(Boolean).length > 0 && <div className="flex gap-2">{p.photoUrls.filter(Boolean).map((u, i) => <a key={i} href={u!} target="_blank" rel="noreferrer"><img src={u!} alt="" className="size-16 rounded-xl object-cover" /></a>)}</div>}
      <p className="text-xs text-slate-400">By @{p.author} ({p.authorName}) · {p.authorVerified ? 'ID verified' : 'not verified'}{p.reasons?.length ? ` · reasons: ${p.reasons.filter(Boolean).join(', ')}` : ''}</p>
      {canAct && status !== 'removed' && (removing
        ? <div className="flex flex-wrap gap-2">{REMOVE.map((r) => <button key={r} onClick={() => void onReview(p, false, r)} className="chip bg-rose-500/15 py-2 text-rose-200">{r}</button>)}<button onClick={() => setRemoving(false)} className="chip bg-fg/[0.06] py-2">Cancel</button></div>
        : <div className="grid grid-cols-2 gap-2">
          {status === 'review' ? <button className="btn-primary py-2.5 text-sm" onClick={() => void onReview(p, true)}><Eye size={15} /> Approve</button> : <span />}
          <button className="btn-ghost py-2.5 text-sm text-rose-300" onClick={() => setRemoving(true)}><EyeOff size={15} /> Remove</button>
        </div>)}
    </div>
  )
}

/* ------------------------------- Banners ------------------------------- */
const LINKS: [string, string][] = [['/transport', 'Bus tickets'], ['/bills', 'Pay bills'], ['/wallet', 'Wallet'], ['/exchange', 'Exchange'], ['/savings', 'Savings'], ['/market', 'Market'], ['/flash', 'Flash help'],
  ['/invite', 'Invite friends'], ['/housing', 'Housing'], ['/jobs', 'Jobs'], ['/community', 'Events'], ['/news', 'News'], ['/promos', 'Deals'], ['/chats', 'Chats'], ['/uni', 'University'], ['/residency', 'Residency']]
type BannerRow = Banner & { active: boolean; starts_at: string | null; ends_at: string | null; sort: number }
const blank: BannerRow = { id: '', title: '', body: '', cta: 'Open', link: '/transport', emoji: '✨', theme: 'mint', active: true, starts_at: null, ends_at: null, sort: 0 }
const local = (iso: string | null) => (iso ? new Date(Date.parse(iso) - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
const state = (b: BannerRow) => !b.active ? 'Off' : b.starts_at && Date.parse(b.starts_at) > Date.now() ? 'Scheduled' : b.ends_at && Date.parse(b.ends_at) < Date.now() ? 'Ended' : 'Live'

export function BannersTab({ staff }: { staff: StaffPerms | null }) {
  const { data, err, load } = useGet<{ banners: BannerRow[] }>('admin-banners')
  const [edit, setEdit] = useState<BannerRow | null>(null)
  const canEdit = staffCan(staff, 'banners', 'edit')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between"><p className="text-sm text-slate-400">Banners rotate on everyone’s Home. People can hide any banner with ✕.</p>
        {canEdit && <button className="btn-primary shrink-0 px-4 py-2.5 text-sm" onClick={() => setEdit(blank)}><Plus size={16} /> New</button>}</div>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {data && data.banners.length === 0 && <Empty emoji="📣" title="No banners yet" sub="Until you add one, Home shows Luda’s built-in offers (bus tickets, bills, invite, savings)." />}
      {data?.banners.map((b) => (
        <div key={b.id} className="flex flex-col gap-2">
          <BannerCard b={b} preview />
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className={`rounded-full px-2 py-0.5 font-semibold ${state(b) === 'Live' ? 'bg-mint-400/15 text-mint-300' : 'bg-fg/10'}`}>{state(b)}</span>
            <span className="truncate">→ {b.link}{b.ends_at ? ` · until ${new Date(b.ends_at).toLocaleDateString()}` : ''}</span>
            {canEdit && <button className="ms-auto flex items-center gap-1 font-semibold text-mint-300" onClick={() => setEdit(b)}><Pencil size={13} /> Edit</button>}
          </div>
        </div>
      ))}
      {edit && <BannerEditor b={edit} canDelete={staffCan(staff, 'banners', 'full')} onClose={() => setEdit(null)} onDone={load} />}
    </div>
  )
}

function BannerEditor({ b, canDelete, onClose, onDone }: { b: BannerRow; canDelete: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState(b)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof BannerRow>(k: K, v: BannerRow[K]) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    setBusy(true); setErr('')
    try { await api('POST', 'admin-banner-save', { banner: { id: f.id || undefined, title: f.title, body: f.body, cta: f.cta, link: f.link, emoji: f.emoji, theme: f.theme, active: f.active, sort: f.sort, startsAt: f.starts_at ?? '', endsAt: f.ends_at ?? '' } }); onDone(); onClose() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const del = async () => { setBusy(true); try { await api('POST', 'admin-banner-delete', { id: f.id }); onDone(); onClose() } catch (e) { setErr(errMsg(e)); setBusy(false) } }
  return (
    <Sheet open onClose={onClose} title={f.id ? 'Edit banner' : 'New banner'}>
      <div className="flex flex-col gap-3 pb-4">
        <p className="label">Preview</p>
        <BannerCard b={{ ...f, title: f.title || 'Your title', body: f.body }} preview />
        <label className="text-xs text-slate-400">Title<input className="input mt-1" maxLength={60} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Skip the bus queue" /></label>
        <label className="text-xs text-slate-400">Line of text<input className="input mt-1" maxLength={120} value={f.body} onChange={(e) => set('body', e.target.value)} placeholder="e.g. Buy Girne ⇄ Lefkoşa tickets in Luda" /></label>
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <label className="text-xs text-slate-400">Button text<input className="input mt-1" maxLength={24} value={f.cta} onChange={(e) => set('cta', e.target.value)} /></label>
          <label className="text-xs text-slate-400">Emoji<input className="input mt-1 text-center text-xl" maxLength={8} value={f.emoji} onChange={(e) => set('emoji', e.target.value)} /></label>
        </div>
        <p className="text-xs text-slate-400">Button opens</p>
        <div className="flex flex-wrap gap-2">{LINKS.map(([l, n]) => <button key={l} onClick={() => set('link', l)} className={`chip py-2 ${f.link === l ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/40' : 'bg-fg/[0.06] text-slate-300'}`}>{n}</button>)}</div>
        <p className="text-xs text-slate-400">Colour</p>
        <div className="flex flex-wrap gap-2">{Object.entries(THEMES).map(([k, t]) => <button key={k} onClick={() => set('theme', k)} aria-label={t.name} className={`size-10 rounded-full bg-gradient-to-br ${t.bg} ${f.theme === k ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : ''}`} />)}</div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-400">Starts (optional)<input type="datetime-local" className="input mt-1 text-sm" value={local(f.starts_at)} onChange={(e) => set('starts_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>
          <label className="text-xs text-slate-400">Ends (optional)<input type="datetime-local" className="input mt-1 text-sm" value={local(f.ends_at)} onChange={(e) => set('ends_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-3 rounded-2xl bg-fg/[0.04] p-3 text-sm"><input type="checkbox" className="size-5 accent-emerald-400" checked={f.active} onChange={(e) => set('active', e.target.checked)} /> Show it</label>
          <label className="text-xs text-slate-400">Order (lower first)<input className="input mt-1" inputMode="numeric" value={f.sort} onChange={(e) => set('sort', Number(e.target.value.replace(/[^\d-]/g, '')) || 0)} /></label>
        </div>
        {err && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200">{err}</p>}
        <button className="btn-primary py-4" disabled={busy || f.title.trim().length < 2} onClick={() => void save()}><Megaphone size={17} /> {f.id ? 'Save banner' : 'Publish banner'}</button>
        {f.id && canDelete && <button className="btn-ghost py-3 text-sm text-rose-300" disabled={busy} onClick={() => void del()}><Trash2 size={15} /> Delete banner</button>}
      </div>
    </Sheet>
  )
}

/* -------------------------------- Team -------------------------------- */
export const AREA_INFO: Record<Exclude<StaffArea, 'team'>, { label: string; view: string; edit: string; full: string }> = {
  overview: { label: 'Home dashboard', view: 'See the to-do list and counts', edit: '—', full: '—' },
  users: { label: 'Users', view: 'Look up accounts', edit: 'Look up accounts', full: 'Also freeze / unfreeze accounts' },
  kyc: { label: 'ID checks', view: 'See ID check status', edit: 'Approve or reject IDs', full: 'Also reset someone’s ID check' },
  money: { label: 'Top-ups & payouts', view: 'See top-ups, payouts and money totals', edit: 'Re-check stuck payments', full: 'Also refund bus tickets' },
  bills: { label: 'Bills', view: 'See bills to pay', edit: 'Mark bills as paid (with receipt)', full: 'Also refund bills' },
  disputes: { label: 'Held money', view: 'See Market / Flash payments on hold', edit: 'See them', full: 'Decide disputes (pay or refund)' },
  cases: { label: 'Support cases', view: 'Read cases', edit: 'Reply to cases', full: 'Reply to cases' },
  content: { label: 'Posts, guides & calendars', view: 'See reported posts and guides', edit: 'Approve / remove posts, post as Official, edit guides, tips and uni calendars', full: 'Also remove whole groups and change the Terms' },
  banners: { label: 'Banners', view: 'See banners', edit: 'Create and edit banners', full: 'Also delete banners' },
  tickets: { label: 'Bus ticket check', view: '—', edit: 'Scan and check passengers\' tickets (drivers)', full: 'Scan and check tickets' },
}
interface StaffRow { email: string; roles: Partial<Record<StaffArea, StaffLevel>>; note: string | null; username: string | null; created_at: string }

export function TeamTab() {
  const { data, err, load } = useGet<{ staff: StaffRow[] }>('admin-staff')
  const [edit, setEdit] = useState<StaffRow | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl bg-gradient-to-br from-violet-500/20 to-indigo-700/10 p-4 text-sm">
        <p className="font-bold">Your team</p>
        <p className="mt-1 text-xs text-slate-400">You (the owner) can do everything. Add a teammate by the email of their Luda account and choose, for each area, whether they can only <b>view</b>, <b>act</b> (edit) or have <b>full</b> control. They only see the tabs you give them, and the server checks every action.</p>
        <button className="btn-primary mt-3 w-full py-3 text-sm" onClick={() => setEdit({ email: '', roles: {}, note: null, username: null, created_at: '' })}><UserPlus size={16} /> Add a teammate</button>
      </div>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {data && data.staff.length === 0 && <Empty emoji="👥" title="Just you for now" sub="Add someone to help with bills, ID checks or support." />}
      {data?.staff.map((m) => (
        <button key={m.email} onClick={() => setEdit(m)} className="card flex flex-col gap-2 text-start">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-violet-400/40 to-indigo-700/40 font-bold">{m.email.slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.email}</p><p className="text-xs text-slate-400">{m.username ? `@${m.username}` : 'No Luda account with this email yet'}{m.note ? ` · ${m.note}` : ''}</p></div><Pencil size={15} className="text-slate-500" /></div>
          <div className="flex flex-wrap gap-1.5">{Object.entries(m.roles).map(([a, l]) => <span key={a} className="chip bg-fg/[0.06] py-0.5 text-[11px]">{AREA_INFO[a as Exclude<StaffArea, 'team'>]?.label ?? a}: <b className={l === 'full' ? 'text-gold-200' : l === 'edit' ? 'text-mint-200' : 'text-slate-300'}>{l === 'edit' ? 'act' : l}</b></span>)}</div>
        </button>
      ))}
      {edit && <StaffEditor m={edit} onClose={() => setEdit(null)} onDone={load} />}
    </div>
  )
}

function StaffEditor({ m, onClose, onDone }: { m: StaffRow; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState(m.email)
  const [note, setNote] = useState(m.note ?? '')
  const [roles, setRoles] = useState(m.roles)
  const [mode, setMode] = useState<'form' | 'save' | 'remove'>('form')
  const areas = Object.keys(AREA_INFO) as Exclude<StaffArea, 'team'>[]
  const count = Object.keys(roles).length
  if (mode !== 'form') return (
    <Sheet open onClose={onClose} title={mode === 'save' ? 'Confirm team change' : 'Remove teammate'}>
      <ReviewAndPin holdLabel={mode === 'save' ? 'Hold to save' : 'Hold to remove'} onClose={() => setMode('form')}
        rows={mode === 'save' ? [['Email', email], ...Object.entries(roles).map(([a, l]) => [AREA_INFO[a as Exclude<StaffArea, 'team'>].label, l === 'edit' ? 'act' : l] as [string, string])] : [['Email', email], ['Access', 'Removed from Luda HQ']]}
        run={async (auth) => { await api('POST', mode === 'save' ? 'admin-staff-set' : 'admin-staff-remove', { email, roles, note, ...auth }); onDone() }}
        done={<Success title={mode === 'save' ? 'Saved ✅' : 'Removed'} sub={mode === 'save' ? 'They’ll see their tabs next time they open Luda HQ.' : 'They can no longer open Luda HQ.'} onClose={onClose} />} />
    </Sheet>
  )
  return (
    <Sheet open onClose={onClose} title={m.email ? 'Teammate' : 'Add a teammate'}>
      <div className="flex flex-col gap-3 pb-4">
        <label className="text-xs text-slate-400">Email of their Luda account<input className="input mt-1" type="email" value={email} disabled={!!m.email} onChange={(e) => setEmail(e.target.value.trim())} placeholder="name@example.com" /></label>
        <label className="text-xs text-slate-400">Note (optional)<input className="input mt-1" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bills, weekdays" /></label>
        <p className="label">What they can do</p>
        {areas.map((a) => {
          const cur = roles[a]
          const levels: (StaffLevel | undefined)[] = a === 'overview' ? [undefined, 'view'] : [undefined, 'view', 'edit', 'full']
          return (
            <div key={a} className="rounded-2xl bg-fg/[0.04] p-3">
              <p className="text-sm font-semibold">{AREA_INFO[a].label}</p>
              <p className="text-[11px] text-slate-400">{cur ? AREA_INFO[a][cur] : 'No access'}</p>
              <div className="mt-2 flex gap-1 rounded-xl bg-fg/[0.05] p-1">{levels.map((l) => <button key={l ?? 'none'} onClick={() => setRoles((r) => { const n = { ...r }; if (l) n[a] = l; else delete n[a]; return n })}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${cur === l ? (l === 'full' ? 'bg-gold-400/30 text-gold-100' : l ? 'bg-mint-400/25 text-mint-100' : 'bg-fg/10 text-slate-200') : 'text-slate-400'}`}>{l === undefined ? 'None' : l === 'edit' ? 'Act' : l === 'view' ? 'View' : 'Full'}</button>)}</div>
            </div>
          )
        })}
        <button className="btn-primary py-4" disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !count} onClick={() => setMode('save')}>Save ({count} area{count === 1 ? '' : 's'})</button>
        {m.email && <button className="btn-ghost py-3 text-sm text-rose-300" onClick={() => setMode('remove')}><Trash2 size={15} /> Remove from team</button>}
      </div>
    </Sheet>
  )
}
