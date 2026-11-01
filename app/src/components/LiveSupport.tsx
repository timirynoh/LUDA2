// Support cases / appeals (live mode): students explain a problem and attach photos; the Luda team replies.
import { Camera, FileText, Loader2, MessageCircle, Paperclip, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { errMsg } from './LiveMoney'
import { Sheet } from './ui'
import { api } from '../lib/live'

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
export interface UserCase { id: string; category: CaseCategory; subject: string; reference: string | null; status: string; created_at: string; updated_at: string; messages: CaseMsg[] }

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

export function NewCaseSheet({ category: initial = 'other', reference, subject: initialSubject = '', onClose, onCreated }: { category?: CaseCategory; reference?: string; subject?: string; onClose: () => void; onCreated?: () => void }) {
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
    <Sheet open onClose={onClose} title="Get help from the Luda team">
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
    </Sheet>
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

/** Help → My cases. */
export function MyCases() {
  const [cases, setCases] = useState<UserCase[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(async () => { try { setCases((await api<{ cases: UserCase[] }>('GET', 'cases')).cases); setErr('') } catch (e) { setErr(errMsg(e)) } }, [])
  useEffect(() => { void load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect
  const current = cases?.find((c) => c.id === open)
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center justify-between"><p className="font-semibold">My cases & appeals</p>
        <button className="chip bg-mint-400/15 text-mint-300" onClick={() => setCreating(true)}><Plus size={14} /> New</button></div>
      <p className="text-xs text-slate-400">Can't verify your ID, a payment didn't show up, or your account is stuck? Tell us here and attach photos.</p>
      {err && <p className="text-xs text-rose-300">{err}</p>}
      {cases?.length === 0 && <p className="text-sm text-slate-500">No cases yet.</p>}
      {cases?.map((c) => (
        <button key={c.id} className="glass flex items-center gap-3 rounded-2xl p-3 text-start" onClick={() => setOpen(c.id)}>
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.subject}</p><p className="truncate text-xs text-slate-500">{CATEGORY_LABEL[c.category]} · {new Date(c.updated_at).toLocaleDateString()}</p></div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_LABEL[c.status]?.c}`}>{STATUS_LABEL[c.status]?.t}</span>
        </button>
      ))}
      {creating && <NewCaseSheet onClose={() => setCreating(false)} onCreated={load} />}
      {current && <CaseSheet c={current} onClose={() => setOpen(null)} onChange={load} />}
    </section>
  )
}

function CaseSheet({ c, onClose, onChange }: { c: UserCase; onClose: () => void; onChange: () => void }) {
  const [msg, setMsg] = useState('')
  const [files, setFiles] = useState<Upload[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const send = async () => {
    setBusy(true); setErr('')
    try { await api('POST', 'case-reply', { caseId: c.id, message: msg, files: files.map(({ type, data, name }) => ({ type, data, name })) }); setMsg(''); setFiles([]); onChange() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title={c.subject}>
      <div className="flex flex-col gap-3">
        <span className={`self-start rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_LABEL[c.status]?.c}`}>{STATUS_LABEL[c.status]?.t}</span>
        {c.reference && <p className="text-xs text-slate-400">Reference: <span className="font-mono">{c.reference}</span></p>}
        <Thread messages={c.messages} />
        {c.status !== 'resolved' && <>
          <textarea className="input min-h-20" maxLength={2000} placeholder="Write a reply…" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <Attachments files={files} setFiles={setFiles} />
          {err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-3" disabled={busy || (!msg.trim() && !files.length)} onClick={send}>{busy && <Loader2 size={16} className="animate-spin" />} Send</button>
        </>}
      </div>
    </Sheet>
  )
}
