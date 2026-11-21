// University calendars (live, v1.10.0). The Luda team enters each university's official dates in Luda HQ (with the
// link they came from); students see their own university's dates, get reminders, and keep a private fee plan.
// Luda doesn't take tuition: fee plans are reminders only.
import { CalendarPlus, Check, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { downloadIcs } from '../lib/ics'
import { api, getSession, LIVE, staffCan, type StaffPerms } from '../lib/live'
import { useStore } from '../lib/store'
import { daysUntil, UNIVERSITIES } from '../lib/uni'
import { Empty } from './LiveKit'
import { errMsg } from './LiveMoney'
import { Sheet } from './ui'

export type UniKind = 'term' | 'deadline' | 'exam' | 'fee' | 'holiday'
export interface UniDate { id: string; title: string; kind: UniKind; start: string; end: string | null; source: string | null; note: string | null; updatedAt: string; by?: string }
export interface FeeItem { id: string; title: string; due: string; amountMinor: number; currency: 'TRY' | 'USD' | 'EUR' | 'GBP'; paidAt: string | null }

export const UNI_KIND: Record<UniKind, { label: string; e: string; c: string }> = {
  term: { label: 'Term', e: '🎓', c: 'bg-sky-400/15 text-sky-300' },
  deadline: { label: 'Deadline', e: '⏰', c: 'bg-fuchsia-500/15 text-fuchsia-300' },
  exam: { label: 'Exams', e: '📝', c: 'bg-rose-500/15 text-rose-300' },
  fee: { label: 'Fees', e: '💳', c: 'bg-gold-400/15 text-gold-300' },
  holiday: { label: 'Holiday', e: '🌴', c: 'bg-mint-400/15 text-mint-300' },
}
const SYM: Record<FeeItem['currency'], string> = { TRY: '₺', USD: '$', EUR: '€', GBP: '£' }
export const feeMoney = (minor: number, cur: FeeItem['currency']) => `${SYM[cur]}${(minor / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const fmtShort = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const dayWord = (n: number) => (n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : null)

/* ---------------- shared loaders (cached per visit so Home + Uni + reminders share one request) ---------------- */
const cache: Record<string, { at: number; v: unknown }> = {}
async function cached<T>(key: string, load: () => Promise<T>, maxAge = 5 * 60e3): Promise<T> {
  const c = cache[key]
  if (c && Date.now() - c.at < maxAge) return c.v as T
  const v = await load(); cache[key] = { at: Date.now(), v }; return v
}
const forget = (key: string) => { delete cache[key] }
export const loadUniDates = (uni: string) => cached(`uni:${uni}`, () => api<{ dates: UniDate[] }>('GET', `uni?u=${uni}`).then((r) => r.dates))
export const loadFeePlan = () => cached('feeplan', () => api<{ items: FeeItem[] }>('GET', 'fee-plan').then((r) => r.items))

export function useUniDates(uni: string | undefined) {
  const [dates, setDates] = useState<UniDate[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    if (!LIVE || !uni) return
    let alive = true
    loadUniDates(uni).then((d) => alive && setDates(d)).catch((e) => alive && setErr(errMsg(e)))
    return () => { alive = false }
  }, [uni])
  return { dates, err }
}

/* ---------------- student: calendar ---------------- */
export function LiveDeadlines({ uni }: { uni: string }) {
  const { toast } = useStore()
  const { dates, err } = useUniDates(uni)
  const u = UNIVERSITIES.find((x) => x.id === uni)
  if (err) return <p className="px-5 pt-4 text-sm text-rose-300">{err}</p>
  if (!dates) return <p className="px-5 pt-4 text-sm text-slate-500">Loading…</p>
  if (!dates.length) return (
    <div className="px-5 pt-4"><Empty emoji="📅" title={`${u?.short ?? 'Your university'}'s calendar is coming soon`} sub="The Luda team adds each university's official dates (registration, exams, holidays, fee deadlines). You'll get a reminder before each one once it's here." /></div>
  )
  const upcoming = dates.filter((i) => daysUntil(i.end ?? i.start) >= 0)
  const past = dates.length - upcoming.length
  const sources = [...new Set(dates.map((i) => i.source).filter(Boolean))] as string[]
  const exportAll = () => {
    const ok = downloadIcs(`${uni}-calendar`, upcoming.map((i) => ({ title: `${u?.short ?? ''} · ${i.title}`, start: new Date(i.start + 'T09:00:00'), end: new Date((i.end ?? i.start) + 'T17:00:00'), alarmMin: 1440, desc: i.note ?? undefined })))
    toast({ title: ok ? 'Added to your calendar file' : 'Downloads are blocked here', emoji: '📅' })
  }
  return (
    <div className="flex flex-col gap-2 px-5 pt-4">
      <p className="rounded-2xl bg-fg/[0.03] p-3 text-[11px] text-slate-400">Official dates for <b>{u?.name}</b>, checked by the Luda team. You'll get a reminder 7 days, 3 days and 1 day before. Always confirm with your faculty if something changes.</p>
      {upcoming.map((i, n) => {
        const d = daysUntil(i.start), ongoing = d < 0, k = UNI_KIND[i.kind]
        return (
          <div key={i.id} className={`card flex items-center gap-3 ${n === 0 ? 'border-indigo-400/40' : ''}`}>
            <div className={`grid size-11 shrink-0 place-items-center rounded-2xl text-lg ${k.c}`}>{k.e}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{i.title}</p>
              <p className="text-xs text-slate-400">{fmtShort(i.start)}{i.end && i.end !== i.start ? ` – ${fmtShort(i.end)}` : ''} · {k.label}</p>
              {i.note && <p className="text-[11px] text-slate-500">{i.note}</p>}</div>
            <div className={`shrink-0 text-end ${d <= 7 ? 'text-rose-300' : d <= 21 ? 'text-gold-300' : 'text-slate-300'}`}>
              {ongoing ? <p className="text-sm font-extrabold">Now</p> : dayWord(d) ? <p className="text-sm font-extrabold">{dayWord(d)}</p> : <><p className="text-lg font-extrabold leading-none">{d}</p><p className="text-[10px]">days</p></>}
            </div>
          </div>
        )
      })}
      {upcoming.length > 0 && <button className="btn-ghost mt-2" onClick={exportAll}><CalendarPlus size={16} /> Add all to my phone's calendar</button>}
      {past > 0 && <p className="text-center text-xs text-slate-500">{past} past dates hidden</p>}
      {sources.map((src) => <a key={src} href={src} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-xs text-mint-300"><ExternalLink size={12} /> Official calendar</a>)}
    </div>
  )
}

/* ---------------- student: personal fee plan ---------------- */
export function LiveFeePlan({ uni }: { uni: string }) {
  const { toast } = useStore()
  const { dates } = useUniDates(uni)
  const [items, setItems] = useState<FeeItem[] | null>(null)
  const [edit, setEdit] = useState<Partial<FeeItem> | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(() => { forget('feeplan'); loadFeePlan().then(setItems).catch((e) => setErr(errMsg(e))) }, [])
  useEffect(() => { load() }, [load])
  const uniFees = (dates ?? []).filter((i) => i.kind === 'fee' && daysUntil(i.end ?? i.start) >= 0)
  const open = (items ?? []).filter((i) => !i.paidAt)
  const next = open[0]
  const left = open.reduce<Record<string, number>>((a, i) => ({ ...a, [i.currency]: (a[i.currency] ?? 0) + i.amountMinor }), {})
  const mark = async (i: FeeItem) => {
    try { await api('POST', 'fee-plan-paid', { id: i.id, paid: !i.paidAt }); toast({ title: i.paidAt ? 'Marked as not paid' : 'Marked as paid ✓', emoji: '💳' }); load() } catch (e) { setErr(errMsg(e)) }
  }
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      {next ? (
        <div className="card bg-gradient-to-br from-gold-400/15 to-transparent">
          <p className="text-xs text-slate-400">Next payment</p>
          <p className="text-2xl font-extrabold">{feeMoney(next.amountMinor, next.currency)}</p>
          <p className="text-sm">{next.title} · <span className={daysUntil(next.due) < 0 ? 'text-rose-300' : daysUntil(next.due) <= 7 ? 'text-gold-300' : 'text-slate-300'}>
            {daysUntil(next.due) < 0 ? `overdue since ${fmtShort(next.due)}` : `due ${fmtD(next.due)}${dayWord(daysUntil(next.due)) ? ` (${dayWord(daysUntil(next.due))})` : ` · in ${daysUntil(next.due)} days`}`}</span></p>
          <p className="mt-1 text-[11px] text-slate-500">Still to pay: {Object.entries(left).map(([c, v]) => feeMoney(v, c as FeeItem['currency'])).join(' + ')}</p>
        </div>
      ) : items && <Empty emoji="💳" title={items.length ? 'All paid 🎉' : 'Add your fee plan'} sub="Type in your instalments once (amount and due date, from your offer letter or the finance office). Luda reminds you before each one." />}
      <button className="btn-primary py-3 text-sm" onClick={() => setEdit({ currency: 'USD' })}><Plus size={16} /> Add a payment</button>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {(items ?? []).map((i) => {
        const d = daysUntil(i.due)
        return (
          <div key={i.id} className={`card flex items-center gap-3 ${i.paidAt ? 'opacity-60' : ''}`}>
            <button onClick={() => void mark(i)} aria-label={i.paidAt ? 'Mark as not paid' : 'Mark as paid'} className={`grid size-8 shrink-0 place-items-center rounded-full ${i.paidAt ? 'bg-mint-400 text-ink-950' : 'border border-fg/25'}`}>{i.paidAt && <Check size={16} />}</button>
            <div className="min-w-0 flex-1"><p className={`truncate text-sm font-semibold ${i.paidAt ? 'line-through' : ''}`}>{i.title}</p>
              <p className={`text-xs ${i.paidAt ? 'text-slate-500' : d < 0 ? 'text-rose-300' : d <= 7 ? 'text-gold-300' : 'text-slate-400'}`}>{i.paidAt ? 'Paid' : d < 0 ? 'Overdue' : 'Due'} · {fmtD(i.due)}</p></div>
            <p className="shrink-0 font-bold">{feeMoney(i.amountMinor, i.currency)}</p>
            <button className="shrink-0 text-slate-500" aria-label="Edit" onClick={() => setEdit(i)}><Pencil size={15} /></button>
          </div>
        )
      })}
      {uniFees.length > 0 && <section className="mt-1">
        <p className="label mb-2">From your university's calendar</p>
        {uniFees.map((i) => <p key={i.id} className="flex items-center justify-between gap-2 py-1 text-sm"><span className="min-w-0 truncate">💳 {i.title}</span><span className="shrink-0 text-slate-400">{fmtShort(i.start)}</span></p>)}
      </section>}
      <p className="text-[11px] text-slate-500">Your fee plan is private: only you see it. Pay tuition on your university's portal or at its finance office; Luda only reminds you.</p>
      {edit && <FeeEditor item={edit} onClose={() => setEdit(null)} onDone={load} />}
    </div>
  )
}

function FeeEditor({ item, onClose, onDone }: { item: Partial<FeeItem>; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(item.title ?? '')
  const [due, setDue] = useState(item.due ?? '')
  const [amount, setAmount] = useState(item.amountMinor ? String(item.amountMinor / 100) : '')
  const [currency, setCurrency] = useState<FeeItem['currency']>(item.currency ?? 'USD')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true); setErr('')
    try { await api('POST', 'fee-plan-save', { item: { id: item.id, title, due, amountMinor: Math.round(Number(amount) * 100), currency } }); onDone(); onClose() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const del = async () => { setBusy(true); try { await api('POST', 'fee-plan-remove', { id: item.id }); onDone(); onClose() } catch (e) { setErr(errMsg(e)); setBusy(false) } }
  return (
    <Sheet open onClose={onClose} title={item.id ? 'Edit payment' : 'Add a payment'}>
      <div className="flex flex-col gap-3 pb-4">
        <label className="text-xs text-slate-400">Name<input className="input mt-1" maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 2nd instalment, Dorm fee" /></label>
        <label className="text-xs text-slate-400">Due date<input className="input mt-1" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-slate-400">Amount<input className="input mt-1" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="1750" /></label>
          <label className="w-28 text-xs text-slate-400">Currency<select className="input mt-1" value={currency} onChange={(e) => setCurrency(e.target.value as FeeItem['currency'])}>{(['USD', 'EUR', 'GBP', 'TRY'] as const).map((c) => <option key={c} value={c}>{SYM[c]} {c}</option>)}</select></label>
        </div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-3.5" disabled={busy || title.trim().length < 2 || !due || !(Number(amount) > 0)} onClick={() => void save()}>Save</button>
        {item.id && <button className="btn-ghost py-3 text-sm text-rose-300" disabled={busy} onClick={() => void del()}><Trash2 size={15} /> Delete</button>}
      </div>
    </Sheet>
  )
}

/* ---------------- reminders: 7, 3, 1 days before and on the day (inbox + phone notification) ---------------- */
const SEEN = 'luda.uniNotified'
export function useUniReminders() {
  const { s, notify } = useStore()
  const uni = s.university, on = s.notifPrefs.classes !== false
  useEffect(() => {
    if (!LIVE || !getSession() || !on) return
    let alive = true
    const run = async () => {
      let seen: Record<string, number> = {}
      try { seen = JSON.parse(localStorage.getItem(SEEN) || '{}') } catch { /* fresh */ }
      const hit = (key: string, emoji: string, text: string, to: string) => { if (seen[key]) return; seen[key] = Date.now(); notify(emoji, text, to) }
      const when = (d: number) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`)
      const [dates, fees] = await Promise.all([uni ? loadUniDates(uni).catch(() => []) : Promise.resolve([] as UniDate[]), loadFeePlan().catch(() => [] as FeeItem[])])
      if (!alive) return
      const short = UNIVERSITIES.find((x) => x.id === uni)?.short ?? 'Uni'
      for (const i of dates) {
        const d = daysUntil(i.start)
        if (i.kind !== 'holiday' && [7, 3, 1, 0].includes(d)) hit(`d:${i.id}:${d}`, UNI_KIND[i.kind].e, `${short}: ${i.title} ${when(d)}`, '/uni')
        if (i.kind === 'holiday' && d === 1) hit(`d:${i.id}:1`, '🌴', `${short}: ${i.title} starts tomorrow`, '/uni')
      }
      for (const f of fees) {
        if (f.paidAt) continue
        const d = daysUntil(f.due)
        if ([7, 3, 1, 0].includes(d)) hit(`f:${f.id}:${f.due}:${d}`, '💳', `${f.title}: ${feeMoney(f.amountMinor, f.currency)} due ${when(d)}`, '/uni?tab=fees')
        if (d === -1) hit(`f:${f.id}:${f.due}:late`, '⚠️', `${f.title} was due yesterday. Mark it paid in Luda once it's done.`, '/uni?tab=fees')
      }
      const cutoff = Date.now() - 400 * 86400e3
      for (const k of Object.keys(seen)) if (seen[k] < cutoff) delete seen[k]
      try { localStorage.setItem(SEEN, JSON.stringify(seen)) } catch { /* private mode */ }
    }
    void run()
    const t = setInterval(() => void run(), 3 * 3600e3)
    return () => { alive = false; clearInterval(t) }
  }, [uni, on, notify])
}

/* ---------------- Luda HQ: enter official dates ---------------- */
const blankDate = (uni: string): Partial<UniDate> & { uni: string } => ({ uni, title: '', kind: 'term', start: '', end: null, source: '', note: '' })

export function UniAdminTab({ staff }: { staff: StaffPerms | null }) {
  const [uni, setUni] = useState('neu')
  const [data, setData] = useState<{ dates: UniDate[]; coverage: Record<string, number>; students: Record<string, number> } | null>(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState<(Partial<UniDate> & { uni: string }) | null>(null)
  const [copying, setCopying] = useState(false)
  const canEdit = staffCan(staff, 'content', 'edit')
  const load = useCallback(() => { setErr(''); api<typeof data>('GET', `admin-uni?u=${uni}`).then(setData).catch((e) => setErr(errMsg(e))) }, [uni])
  useEffect(() => { load() }, [load])
  const now = new Date(), a = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1 // academic year starts in August
  const copy = async () => {
    setCopying(false)
    try { const r = await api<{ copied: number }>('POST', 'admin-uni-copy', { uni, from: `${a - 1}-08-01`, to: `${a}-07-31` }); setErr(`Copied ${r.copied} dates. Check each one against the official calendar and fix the ones that moved.`); load() } catch (e) { setErr(errMsg(e)) }
  }
  const u = UNIVERSITIES.find((x) => x.id === uni)!
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-400">Enter each university's official dates once a year. Students of that university see them in University → Deadlines and get reminders 7, 3 and 1 days before. Add the link to the official calendar so anyone can check.</p>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
        {UNIVERSITIES.map((x) => {
          const n = data?.coverage[x.id] ?? 0
          return (
            <button key={x.id} onClick={() => setUni(x.id)} className={`flex shrink-0 flex-col items-start rounded-2xl px-3 py-2 text-start ${uni === x.id ? 'bg-mint-400 text-ink-950' : 'glass'}`}>
              <span className="text-sm font-bold">{x.short}</span>
              <span className={`text-[10px] ${uni === x.id ? 'text-ink-950/70' : n ? 'text-mint-300' : 'text-rose-300'}`}>{n ? `${n} upcoming` : 'no dates'} · {data?.students[x.id] ?? 0} students</span>
            </button>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 font-bold">{u.name}</p>
        {canEdit && <button className="btn-ghost px-3 py-2 text-xs" onClick={() => setCopying(true)}>Copy {a - 1}–{String(a).slice(2)} dates to {a}–{String(a + 1).slice(2)}</button>}
        {canEdit && <button className="btn-primary px-4 py-2.5 text-sm" onClick={() => setEdit(blankDate(uni))}><Plus size={16} /> New date</button>}
      </div>
      {copying && (
        <div className="rounded-2xl border border-gold-400/40 bg-gold-400/10 p-3 text-sm">
          <p>Copy every {u.short} date from {a - 1}–{a} to the same days next year? They're marked "Copied from last year: check against the official calendar" until you edit them.</p>
          <div className="mt-2 flex gap-2"><button className="btn-primary px-4 py-2 text-sm" onClick={() => void copy()}>Copy</button><button className="btn-ghost px-4 py-2 text-sm" onClick={() => setCopying(false)}>Cancel</button></div>
        </div>
      )}
      {err && <p className="rounded-2xl bg-fg/[0.04] p-3 text-sm text-slate-300">{err}</p>}
      {data && data.dates.length === 0 && <Empty emoji="📅" title={`No dates for ${u.short} yet`} sub="Students see 'calendar coming soon' until you add some." />}
      {data?.dates.map((i) => {
        const k = UNI_KIND[i.kind], gone = daysUntil(i.end ?? i.start) < 0
        return (
          <div key={i.id} className={`card flex items-center gap-3 ${gone ? 'opacity-50' : ''}`}>
            <div className={`grid size-10 shrink-0 place-items-center rounded-xl ${k.c}`}>{k.e}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{i.title}</p>
              <p className="text-xs text-slate-400">{fmtD(i.start)}{i.end && i.end !== i.start ? ` – ${fmtD(i.end)}` : ''} · {k.label}</p>
              <p className={`truncate text-[11px] ${i.source ? 'text-slate-500' : 'text-gold-300'}`}>{i.source ? `Source: ${i.source}` : 'No source link yet'}{i.by ? ` · by @${i.by}` : ''}</p>
              {i.note && <p className="text-[11px] text-slate-500">{i.note}</p>}</div>
            {canEdit && <button className="shrink-0 text-mint-300" aria-label="Edit" onClick={() => setEdit({ ...i, uni })}><Pencil size={16} /></button>}
          </div>
        )
      })}
      {edit && <UniDateEditor d={edit} onClose={() => setEdit(null)} onDone={load} />}
    </div>
  )
}

function UniDateEditor({ d, onClose, onDone }: { d: Partial<UniDate> & { uni: string }; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState(d)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sure, setSure] = useState(false)
  const set = <K extends keyof UniDate>(k: K, v: UniDate[K]) => setF((x) => ({ ...x, [k]: v }))
  const save = async () => {
    setBusy(true); setErr('')
    try { await api('POST', 'admin-uni-save', { date: { id: f.id, uni: f.uni, title: f.title, kind: f.kind, start: f.start, end: f.end || '', source: f.source || '', note: f.note || '' } }); onDone(); onClose() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const del = async () => { setBusy(true); try { await api('POST', 'admin-uni-delete', { id: f.id }); onDone(); onClose() } catch (e) { setErr(errMsg(e)); setBusy(false) } }
  const u = UNIVERSITIES.find((x) => x.id === f.uni)
  return (
    <Sheet open onClose={onClose} title={`${f.id ? 'Edit' : 'New'} date · ${u?.short ?? ''}`}>
      <div className="flex flex-col gap-3 pb-4">
        <label className="text-xs text-slate-400">Title<input className="input mt-1" maxLength={80} value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Fall classes start, Final exams, Tuition 1st instalment" /></label>
        <div className="flex flex-wrap gap-2">{(Object.keys(UNI_KIND) as UniKind[]).map((k) => (
          <button key={k} onClick={() => set('kind', k)} className={`chip px-3 py-2 ${f.kind === k ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{UNI_KIND[k].e} {UNI_KIND[k].label}</button>
        ))}</div>
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-slate-400">Starts<input className="input mt-1" type="date" value={f.start ?? ''} onChange={(e) => set('start', e.target.value)} /></label>
          <label className="flex-1 text-xs text-slate-400">Ends (optional)<input className="input mt-1" type="date" value={f.end ?? ''} onChange={(e) => set('end', e.target.value || null)} /></label>
        </div>
        <label className="text-xs text-slate-400">Link to the official calendar<input className="input mt-1" inputMode="url" value={f.source ?? ''} onChange={(e) => set('source', e.target.value.trim())} placeholder="https://…" /></label>
        <label className="text-xs text-slate-400">Note for students (optional)<input className="input mt-1" maxLength={200} value={f.note ?? ''} onChange={(e) => set('note', e.target.value)} placeholder="e.g. Late registration costs extra" /></label>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-3.5" disabled={busy || (f.title ?? '').trim().length < 2 || !f.start} onClick={() => void save()}>Save</button>
        {f.id && (sure
          ? <button className="btn py-3 text-sm bg-rose-500 text-white" disabled={busy} onClick={() => void del()}>Yes, delete this date</button>
          : <button className="btn-ghost py-3 text-sm text-rose-300" onClick={() => setSure(true)}><Trash2 size={15} /> Delete</button>)}
      </div>
    </Sheet>
  )
}
