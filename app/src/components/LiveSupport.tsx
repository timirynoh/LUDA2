// Support cases / appeals (live mode): students explain a problem and attach photos; the Luda team replies.
import { Camera, FileText, Loader2, MessageCircle, Paperclip, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { errMsg } from './LiveMoney'
import { Sheet } from './ui'
import { api } from '../lib/live'
import { RateSheet, ReopenSheet, StarsView, useMyRatings } from './Ratings'

export type CaseCategory = 'kyc' | 'payment' | 'withdrawal' | 'account' | 'other'
export const CATEGORY_LABEL: Record<CaseCategory, string> = {
  kyc: '🪪 Identity check (ID / selfie)', payment: '💳 Top-up or payment', withdrawal: '🏦 Withdrawal', account: '🔐 Account / frozen / sign-in', other: '💬 Something else',
}
export const STATUS_LABEL: Record<string, { t: string; c: string }> = {
  open: { t: 'With the Luda team', c: 'bg-sky-400/15 text-sky-300' },
  waiting_user: { t: 'Waiting for your reply', c: 'bg-gold-400/15 text-gold-300' },
  resolved: { t: 'Resolved', c: 'bg-mint-400/15 text-mint-300' },
  rejected: { t: 'Closed', c: 'bg-fg/10 text-slate-400' },
}
export interface CaseFile { name?: string; url: string | null }
export interface CaseMsg { id: number; author: 'user' | 'admin'; authorName: string | null; body: string; at: string; files: CaseFile[] }
export interface UserCase { id: string; category: CaseCategory; subject: string; reference: string | null; status: string; created_at: string; updated_at: string; closed_at?: string | null; reopens?: number; messages: CaseMsg[] }

export interface Upload { name: string; type: string; data: string; preview?: string }

/** Shrinks photos before upload (max 1600px, JPEG) so they send fast on mobile data; PDFs go as they are. */
export async function prepareFile(file: File): Promise<Upload> {
  if (file.type === 'application/pdf') {
    if (file.size > 1_900_000) throw new Error('PDF must be under 2 MB')
    const u8 = new Uint8Array(await file.arrayBuffer()); let bin = ''
    for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000)) // chunked: big files would overflow the stack
    const data = btoa(bin)
    return { name: file.name, type: file.type, data }
  }
  if (!file.type.startsWith('image/')) throw new Error('Attach a photo or a PDF')
  const img = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
  const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  const url = c.toDataURL('image/jpeg', 0.82)
  return { name: file.name.replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg', data: url.split(',')[1], preview: url }
}

export function Attachments({ files, setFiles, hint }: { files: Upload[]; setFiles: (f: Upload[]) => void; hint?: string }) {
  const [err, setErr] = useState('')
  const add = async (list: FileList | null) => {
    setErr('')
    try { const next = [...files]; for (const f of Array.from(list ?? [])) { if (next.length >= 4) break; next.push(await prepareFile(f)) } setFiles(next) } catch (e) { setErr(errMsg(e)) }
  }
  return (
    <div className="flex flex-col gap-2">
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <div key={i} className="relative size-16 overflow-hidden rounded-xl bg-fg/5">
            {f.preview ? <img src={f.preview} alt="" className="size-full object-cover" /> : <FileText className="m-auto mt-4 text-slate-400" />}
            <button className="absolute end-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/60" aria-label="Remove" onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={12} /></button>
          </div>
        ))}
        {files.length < 4 && <>
          <label className="grid size-16 cursor-pointer place-items-center rounded-xl border border-dashed border-fg/20 text-slate-400" aria-label="Take photo"><Camera size={18} />
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => add(e.target.files)} /></label>
          <label className="grid size-16 cursor-pointer place-items-center rounded-xl border border-dashed border-fg/20 text-slate-400" aria-label="Attach file"><Paperclip size={18} />
            <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => add(e.target.files)} /></label>
        </>}
      </div>
      {err && <p className="text-xs text-rose-300">{err}</p>}
    </div>
  )
}

const HINT: Partial<Record<CaseCategory, string>> = {
  kyc: 'Attach: 1) front of your passport / ID / residence permit, 2) the back (if it has one), 3) a selfie holding the document next to your face. Make sure all text is readable.',
  payment: 'Attach a screenshot of the payment or bank debit, if you have one.',
  withdrawal: 'Attach a screenshot of your bank statement, if relevant.',
}

export function NewCaseSheet(props: { category?: CaseCategory; reference?: string; subject?: string; onClose: () => void; onCreated?: () => void }) {
  return <Sheet open onClose={props.onClose} title="Get help from the Luda team"><NewCaseForm {...props} /></Sheet>
}

export function NewCaseForm({ category: initial = 'other', reference, subject: initialSubject = '', onClose, onCreated }: { category?: CaseCategory; reference?: string; subject?: string; onClose: () => void; onCreated?: () => void }) {
  const [category, setCategory] = useState<CaseCategory>(initial)
  const [subject, setSubject] = useState(initialSubject)
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<Upload[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const send = async () => {
    setBusy(true); setErr('')
    try { await api('POST', 'case-create', { category, subject, message, reference, files: files.map(({ type, data, name }) => ({ type, data, name })) }); setDone(true); onCreated?.() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <>
      {done ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center"><MessageCircle size={48} className="text-mint-300" /><p className="text-lg font-bold">Sent ✅</p>
          <p className="text-sm text-slate-400">The Luda team will reply here, usually within a few hours. Find it under <b>Help → My cases</b>.</p><button className="btn-primary w-full py-3" onClick={onClose}>OK</button></div>
      ) : (
        <div className="flex flex-col gap-3">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as CaseCategory)} aria-label="Problem type">
            {(Object.keys(CATEGORY_LABEL) as CaseCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
          <input className="input" maxLength={80} placeholder="Short title, e.g. ID page won't open" value={subject} onChange={(e) => setSubject(e.target.value)} />
          {reference && <p className="rounded-xl bg-fg/[0.04] px-3 py-2 text-xs text-slate-400">Reference: <span className="font-mono">{reference}</span></p>}
          <textarea className="input min-h-28" maxLength={2000} placeholder="What happened? What did you try?" value={message} onChange={(e) => setMessage(e.target.value)} />
          <Attachments files={files} setFiles={setFiles} hint={HINT[category]} />
          {err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-4" disabled={busy || subject.trim().length < 3 || message.trim().length < 5} onClick={send}>{busy && <Loader2 size={18} className="animate-spin" />} Send to the Luda team</button>
          <p className="text-center text-[11px] text-slate-500">🔒 Photos are private: only the Luda team can see them.</p>
        </div>
      )}
    </>
  )
}

export function Thread({ messages }: { messages: CaseMsg[] }) {
  return (
    <div className="flex flex-col gap-2">
      {messages.map((m) => (
        <div key={m.id} className={`max-w-[88%] rounded-2xl px-3 py-2 text-sm ${m.author === 'admin' ? 'self-start bg-mint-400/10' : 'self-end bg-fg/[0.06]'}`}>
          <p className="text-[10px] font-semibold text-slate-400">{m.author === 'admin' ? 'Luda team' : m.authorName ?? 'You'} · {new Date(m.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
          <p className="whitespace-pre-wrap">{m.body}</p>
          {m.files.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{m.files.map((f, i) => f.url
            ? (/\.pdf/i.test(f.name ?? '') ? <a key={i} href={f.url} target="_blank" rel="noreferrer" className="chip bg-fg/5 text-xs"><FileText size={12} /> PDF</a>
              : <a key={i} href={f.url} target="_blank" rel="noreferrer"><img src={f.url} alt="attachment" className="size-24 rounded-xl object-cover" /></a>)
            : <span key={i} className="text-[11px] text-slate-500">file unavailable</span>)}</div>}
        </div>
      ))}
    </div>
  )
}

export function useCases(active = true) {
  const [cases, setCases] = useState<UserCase[] | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => { try { setCases((await api<{ cases: UserCase[] }>('GET', 'cases')).cases); setErr('') } catch (e) { setErr(errMsg(e)) } }, [])
  useEffect(() => { if (active) void load() }, [load, active]) // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { const on = () => void load(); window.addEventListener('luda:cases', on); return () => window.removeEventListener('luda:cases', on) }, [load])
  return { cases, err, load }
}
export const ticketNo = (id: string) => `#${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
export const openCount = (cases: UserCase[] | null) => (cases ?? []).filter((c) => c.status === 'open' || c.status === 'waiting_user').length
const waitingOnMe = (cases: UserCase[] | null) => (cases ?? []).filter((c) => c.status === 'waiting_user').length

/** The appeals pop-up: "My cases" and "New appeal" in one place, with each conversation inside. */
export function CasesHub({ onClose, start = 'list', category, reference, subject, caseId }: { onClose: () => void; start?: 'list' | 'new'; category?: CaseCategory; reference?: string; subject?: string; caseId?: string }) {
  const { cases, err, load } = useCases()
  const [view, setView] = useState<'list' | 'new'>(start)
  const [openId, setOpenId] = useState<string | null>(caseId ?? null)
  const current = cases?.find((c) => c.id === openId)
  return (
    <Sheet open onClose={onClose} title={current ? current.subject : 'Appeals & help'}>
      {current ? (
        <CaseThread c={current} onBack={() => setOpenId(null)} onChange={load} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="glass grid grid-cols-2 gap-1 rounded-2xl p-1">
            {(['list', 'new'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`rounded-xl py-2.5 text-sm font-semibold transition ${view === v ? 'bg-mint-400 text-ink-950' : 'text-slate-300'}`}>
                {v === 'list' ? `My cases${openCount(cases) ? ` (${openCount(cases)})` : ''}` : '+ New appeal'}
              </button>
            ))}
          </div>
          {view === 'new' ? <NewCaseForm category={category} reference={reference} subject={subject} onClose={() => { setView('list'); void load() }} onCreated={load} /> : <>
            {err && <p className="text-xs text-rose-300">{err}</p>}
            {!cases && !err && <Loader2 className="mx-auto animate-spin text-slate-500" />}
            {cases?.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6 text-center"><MessageCircle size={36} className="text-slate-500" />
                <p className="text-sm text-slate-400">No cases yet. If something isn't working (ID check, a payment, your account), open an appeal and the Luda team will help.</p>
                <button className="btn-primary mt-2 w-full py-3" onClick={() => setView('new')}>Open an appeal</button></div>
            )}
            {cases?.map((c) => (
              <button key={c.id} className="glass flex items-center gap-3 rounded-2xl p-3 text-start" onClick={() => setOpenId(c.id)}>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.subject}</p><p className="truncate text-xs text-slate-500"><span translate="no" className="font-mono">{ticketNo(c.id)}</span> · {CATEGORY_LABEL[c.category]} · {new Date(c.updated_at).toLocaleDateString()}</p></div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_LABEL[c.status]?.c}`}>{STATUS_LABEL[c.status]?.t}</span>
              </button>
            ))}
          </>}
        </div>
      )}
    </Sheet>
  )
}

function CaseThread({ c, onBack, onChange }: { c: UserCase; onBack: () => void; onChange: () => void }) {
  const [msg, setMsg] = useState('')
  const [files, setFiles] = useState<Upload[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const send = async () => {
    setBusy(true); setErr('')
    try { await api('POST', 'case-reply', { caseId: c.id, message: msg, files: files.map(({ type, data, name }) => ({ type, data, name })) }); setMsg(''); setFiles([]); onChange() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-3">
      <button className="self-start text-sm text-mint-300" onClick={onBack}>← All cases</button>
      <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_LABEL[c.status]?.c}`}>{STATUS_LABEL[c.status]?.t}</span><span translate="no" className="font-mono text-xs text-slate-500">{ticketNo(c.id)}</span></div>
      {c.reference && <p className="text-xs text-slate-400">Reference: <span className="selectable font-mono">{c.reference}</span></p>}
      <Thread messages={c.messages} />
      {(c.status === 'resolved' || c.status === 'rejected') && <ClosedCase c={c} onChange={onChange} />}
      {(c.status === 'open' || c.status === 'waiting_user') && <>
        <textarea className="input min-h-20" maxLength={2000} placeholder="Write a reply…" value={msg} onChange={(e) => setMsg(e.target.value)} />
        <Attachments files={files} setFiles={setFiles} />
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-3" disabled={busy || (!msg.trim() && !files.length)} onClick={send}>{busy && <Loader2 size={16} className="animate-spin" />} Send</button>
      </>}
    </div>
  )
}

/** A closed case: rate how the team did, or reopen it (within 7 days, twice at most). */
function ClosedCase({ c, onChange }: { c: UserCase; onChange: () => void }) {
  const { find } = useMyRatings()
  const [rate, setRate] = useState(false)
  const [reopen, setReopen] = useState(false)
  const r = find('case', c.id)
  const closed = Date.parse(c.closed_at ?? c.updated_at)
  const [now] = useState(() => Date.now())
  const canReopen = (c.reopens ?? 0) < 2 && now - closed < 7 * 86400e3
  return (
    <div className="flex flex-col gap-2 rounded-3xl bg-gradient-to-br from-gold-400/10 to-mint-400/5 p-4 ring-1 ring-gold-400/20">
      {r?.stars ? (
        <div className="flex items-center gap-2 text-sm"><span className="text-slate-300">You rated</span><StarsView n={r.stars} /><button className="ms-auto text-xs text-mint-300" onClick={() => setRate(true)}>Edit</button></div>
      ) : (
        <>
          <p className="text-sm font-semibold">How did the Luda team do?</p>
          <button className="flex justify-center gap-1.5 py-1" onClick={() => setRate(true)} aria-label="Rate this case"><StarsView n={0} size={30} /></button>
        </>
      )}
      {canReopen ? (
        <button className="btn-ghost py-2.5 text-sm" onClick={() => setReopen(true)}><RotateCcw size={15} /> Not solved? Reopen the case</button>
      ) : <p className="text-[11px] text-slate-500">This case can't be reopened anymore. Open a new appeal if you still need help.</p>}
      {rate && <RateSheet kind="case" refId={c.id} title="How did the Luda team do?" sub={c.subject} initial={r} onClose={() => setRate(false)} onSaved={onChange} />}
      {reopen && <ReopenSheet caseId={c.id} onClose={() => setReopen(false)} onDone={onChange} />}
    </div>
  )
}

/** Big, easy-to-tap card on the Help page. */
export function AppealsCard() {
  const { cases } = useCases()
  const [open, setOpen] = useState<null | 'list' | 'new'>(null)
  const n = openCount(cases), mine = waitingOnMe(cases)
  return (
    <>
      <div className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-violet-500 via-indigo-600 to-indigo-900 p-5 text-white shadow-xl shadow-indigo-900/30">
        <p className="flex items-center gap-2 text-lg font-extrabold"><MessageCircle size={22} /> Appeals & help</p>
        <p className="mt-1 text-sm text-white/80">ID check not working? Payment missing? Account stuck? Send it to the Luda team, with photos.</p>
        {mine > 0 && <p className="mt-2 inline-block rounded-full bg-gold-400 px-3 py-1 text-xs font-bold text-ink-950">{mine} case{mine > 1 ? 's' : ''} waiting for your reply</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="rounded-2xl bg-white py-3.5 text-sm font-bold text-indigo-900" onClick={() => setOpen('new')}>+ New appeal</button>
          <button className="rounded-2xl bg-white/15 py-3.5 text-sm font-bold" onClick={() => setOpen('list')}>My cases{n ? ` (${n})` : ''}</button>
        </div>
      </div>
      {open && <CasesHub start={open} onClose={() => setOpen(null)} />}
    </>
  )
}

/** Floating "Appeals & help" button that stays reachable however far you scroll. */
export function HelpFab() {
  const { cases } = useCases()
  const [open, setOpen] = useState(false)
  const mine = waitingOnMe(cases)
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Appeals and help"
        className="fixed end-4 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-xl shadow-indigo-900/40 active:scale-95 desk:end-[calc(50%-12rem)]">
        <MessageCircle size={18} /> Appeals
        {mine > 0 && <span className="grid size-5 place-items-center rounded-full bg-gold-400 text-[11px] text-ink-950">{mine}</span>}
      </button>
      {open && <CasesHub onClose={() => setOpen(false)} />}
    </>
  )
}
