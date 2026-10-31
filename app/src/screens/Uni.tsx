import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellOff, CalendarPlus, Camera, Check, ChevronRight, EyeOff, ImageUp, Loader2, Lock, Plus, Search, ShieldCheck, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DemoNote, Header, PinPad, Segmented, Sheet, Success } from '../components/ui'
import { downloadIcs } from '../lib/ics'
import { DAY_NAMES, readTimetable, type ClassItem } from '../lib/ocr'
import { askNotificationPermission, canNotify } from '../lib/reminders'
import { calendarFor, daysUntil, feesFor as feesForUni, nextClass, nextOccurrence, sampleScreenshot, UNIVERSITIES, type CalKind } from '../lib/uni'
import { fmt } from '../lib/fx'
import { uid, useStore } from '../lib/store'

type Tab = 'timetable' | 'deadlines' | 'fees'

export default function Uni() {
  const { s } = useStore()
  const [tab, setTab] = useState<Tab>('timetable')
  const [picking, setPicking] = useState(!s.university)
  const uni = UNIVERSITIES.find((u) => u.id === s.university)

  if (picking || !uni) return <Picker onDone={() => setPicking(false)} />
  return (
    <div>
      <Header back title={uni.short} sub={uni.name} right={<button className="chip glass py-2 text-slate-300" onClick={() => setPicking(true)}>Change</button>} />
      <div className="px-5"><Segmented value={tab} onChange={setTab} options={[{ value: 'timetable', label: '🗓️ Classes' }, { value: 'deadlines', label: '⏳ Deadlines' }, { value: 'fees', label: '💳 Fees' }]} /></div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {tab === 'timetable' && <Timetable />}
          {tab === 'deadlines' && <Deadlines uni={uni.id} />}
          {tab === 'fees' && <Fees uni={uni.id} />}
        </motion.div>
      </AnimatePresence>
      <DemoNote />
    </div>
  )
}

function Picker({ onDone }: { onDone: () => void }) {
  const { s, set } = useStore()
  const [q, setQ] = useState('')
  const list = UNIVERSITIES.filter((u) => `${u.name} ${u.short}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.city === s.city) - Number(a.city === s.city))
  return (
    <div>
      <Header back title="Your university" sub="We'll show only your school's deadlines & fees" />
      <div className="flex flex-col gap-2 px-5">
        <div className="relative mb-2"><Search size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input ps-11" placeholder="Search universities" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {list.map((u) => (
          <button key={u.id} onClick={() => {
            // Instalments already well past their due date are assumed paid at the school.
            const past = feesForUni(u.id).items.filter((f) => daysUntil(f.due) < -14).map((f) => f.id)
            set((p) => ({ ...p, university: u.id, paidFees: [...new Set([...p.paidFees, ...past])] })); onDone()
          }}
            className={`glass flex items-center gap-3 rounded-2xl p-4 text-start ${s.university === u.id ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
            <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-indigo-400 to-blue-700 text-xs font-black text-white">{u.short.slice(0, 4)}</div>
            <div className="flex-1"><p className="font-semibold">{u.name}</p>{u.city === s.city && <p className="text-xs text-mint-300">In your city</p>}</div>
            <ChevronRight size={18} className="text-slate-500 rtl:rotate-180" />
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------ Timetable ------------------------------ */

function Timetable() {
  const { s, set, reward, toast } = useStore()
  const [stage, setStage] = useState<'idle' | 'reading' | 'review'>('idle')
  const [progress, setProgress] = useState({ p: 0, label: '' })
  const [preview, setPreview] = useState('')
  const [draft, setDraft] = useState<ClassItem[]>([])
  const [day, setDay] = useState(() => (new Date().getDay() + 6) % 7)
  const [consent, setConsent] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const nc = useMemo(() => nextClass(s.classes), [s.classes])

  const read = async (file: Blob) => {
    const url = URL.createObjectURL(file)
    setPreview(url); setStage('reading'); setProgress({ p: 0, label: 'Starting on-device reader…' })
    try {
      const { classes } = await readTimetable(file, (p, status) => setProgress({ p, label: status.replace(/^./, (c) => c.toUpperCase()) }))
      setDraft(classes.length ? classes : [{ id: uid(), course: '', day: 0, start: '09:00', end: '09:50' }])
      if (!classes.length) toast({ title: "Couldn't read classes. Add them below", emoji: '✍️' })
      setStage('review')
    } catch {
      toast({ title: 'Reader unavailable here. Add classes manually', emoji: '✍️' })
      setDraft([{ id: uid(), course: '', day: 0, start: '09:00', end: '09:50' }]); setStage('review')
    } finally {
      // Privacy: the image is dropped as soon as reading is finished.
      setTimeout(() => { URL.revokeObjectURL(url); setPreview('') }, 400)
    }
  }

  const save = () => {
    const clean = draft.filter((c) => c.course.trim()).map((c) => ({ ...c, course: c.course.trim().toUpperCase() }))
    set((p) => ({ ...p, classes: clean }))
    setStage('idle')
    reward(s.quests.includes('uni') ? 10 : 100, { quest: 'uni', badge: 'scholar', title: 'Timetable saved' })
  }

  const exportCal = () => {
    const ok = downloadIcs('my-timetable', s.classes.map((c) => {
      const start = nextOccurrence(c), [eh, em] = c.end.split(':').map(Number)
      const end = new Date(start); end.setHours(eh, em)
      return { title: c.course, start, end, location: c.room, weekly: true, alarmMin: s.remind.on ? s.remind.minutes : undefined }
    }))
    toast({ title: ok ? 'Added: open the file to import into your calendar' : 'Downloads are blocked in this preview', emoji: '📅' })
  }

  if (stage === 'reading') return (
    <div className="flex flex-col items-center gap-4 px-5 pt-8 text-center">
      {preview && <img src={preview} alt="" className="max-h-44 rounded-2xl border border-fg/10 opacity-80" />}
      <Loader2 className="animate-spin text-indigo-300" size={36} />
      <p className="font-semibold">Reading your timetable on this phone…</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-fg/10"><div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-mint-400 transition-all" style={{ width: `${Math.max(5, progress.p * 100)}%` }} /></div>
      <p className="text-xs text-slate-400">{progress.label}</p>
      <p className="flex items-center gap-1 text-xs text-mint-300"><Lock size={12} /> Not uploaded. Nothing leaves your device.</p>
    </div>
  )

  if (stage === 'review') return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <div className="flex items-start gap-3 rounded-2xl bg-indigo-500/10 p-3 text-sm">
        <Wand2 size={18} className="mt-0.5 shrink-0 text-indigo-300" />
        <p>We found <b>{draft.filter((d) => d.course).length} classes</b>. Check them and fix anything we got wrong.</p>
      </div>
      {draft.map((c, i) => (
        <div key={c.id} className="card grid grid-cols-6 gap-2 p-3">
          <input className="input col-span-3 py-2 font-semibold uppercase" placeholder="Course" value={c.course} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, course: e.target.value } : x)))} />
          <select className="input col-span-2 py-2" value={c.day} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, day: +e.target.value } : x)))}>
            {DAY_NAMES.map((d, k) => <option key={d} value={k}>{d}</option>)}
          </select>
          <button aria-label="Remove" onClick={() => setDraft(draft.filter((_, j) => j !== i))} className="grid place-items-center text-slate-500"><Trash2 size={16} /></button>
          <input type="time" className="input col-span-2 px-2 py-2 text-sm" value={c.start} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
          <input type="time" className="input col-span-2 px-2 py-2 text-sm" value={c.end} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
          <input className="input col-span-2 px-2 py-2 text-sm" placeholder="Room" value={c.room ?? ''} onChange={(e) => setDraft(draft.map((x, j) => (j === i ? { ...x, room: e.target.value } : x)))} />
        </div>
      ))}
      <button className="btn-ghost" onClick={() => setDraft([...draft, { id: uid(), course: '', day, start: '09:00', end: '09:50' }])}><Plus size={16} /> Add a class</button>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-ghost" onClick={() => setStage('idle')}>Cancel</button>
        <button className="btn-primary" onClick={save}><Check size={16} /> Looks right</button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 px-5 pt-4">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = '' }} />

      {!s.classes.length ? (
        <>
          <button onClick={() => fileRef.current?.click()} className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-500 via-blue-700 to-indigo-950 p-6 text-start text-white">
            <div className="absolute -top-10 -right-10 size-40 rounded-full bg-white/10 blur-2xl" />
            <ImageUp size={34} />
            <p className="mt-3 text-xl font-extrabold">Upload your timetable screenshot</p>
            <p className="mt-1 text-sm text-indigo-100/80">We read your classes automatically, then you check them.</p>
            <span className="chip mt-4 bg-white/20 text-white"><Camera size={12} /> Screenshot or photo</span>
          </button>
          <div className="card grid gap-2 text-sm">
            <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={16} className="text-mint-300" /> Your privacy</p>
            <p className="flex gap-2 text-slate-300"><Lock size={14} className="mt-0.5 shrink-0 text-slate-400" /> <span>The screenshot is read <b>on your phone</b>. It is never uploaded.</span></p>
            <p className="flex gap-2 text-slate-300"><EyeOff size={14} className="mt-0.5 shrink-0 text-slate-400" /> <span>The image is deleted right after reading. Only course, day and time are kept.</span></p>
            <p className="flex gap-2 text-slate-300"><BellOff size={14} className="mt-0.5 shrink-0 text-slate-400" /> <span>No reminders are set unless you turn them on.</span></p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-ghost text-sm" onClick={async () => read(await sampleScreenshot())}><Sparkles size={16} /> Try a sample</button>
            <button className="btn-ghost text-sm" onClick={() => { setDraft([{ id: uid(), course: '', day: 0, start: '09:00', end: '09:50' }]); setStage('review') }}><Plus size={16} /> Add manually</button>
          </div>
        </>
      ) : (
        <>
          {nc && (
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-500 via-blue-700 to-indigo-950 p-5 text-white">
              <p className="text-xs text-indigo-100/80">Next class</p>
              <p className="text-3xl font-extrabold">{nc.c.course}</p>
              <p className="text-sm text-indigo-100/90">{nc.at.toLocaleDateString(undefined, { weekday: 'long' })} · {nc.c.start}–{nc.c.end}{nc.c.room ? ` · ${nc.c.room}` : ''}</p>
              <p className="mt-2 text-xs text-indigo-100/70">in {countdown(nc.at)}</p>
            </div>
          )}
          <div className="flex justify-between gap-1">
            {DAY_NAMES.map((d, i) => {
              const n = s.classes.filter((c) => c.day === i).length
              return (
                <button key={d} onClick={() => setDay(i)} className={`flex flex-1 flex-col items-center rounded-2xl py-2 text-xs ${day === i ? 'bg-indigo-500 text-white' : 'glass text-slate-300'}`}>
                  {d}<span className={`mt-1 size-1.5 rounded-full ${n ? (day === i ? 'bg-white' : 'bg-indigo-400') : 'bg-transparent'}`} />
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-2">
            {s.classes.filter((c) => c.day === day).sort((a, b) => a.start.localeCompare(b.start)).map((c) => (
              <div key={c.id} className="card flex items-center gap-3">
                <div className="w-14 text-center"><p className="text-sm font-bold">{c.start}</p><p className="text-[10px] text-slate-500">{c.end}</p></div>
                <div className="h-10 w-1 rounded-full bg-gradient-to-b from-indigo-400 to-mint-400" />
                <div className="flex-1"><p className="font-semibold">{c.course}</p>{c.room && <p className="text-xs text-slate-400">{c.room}</p>}</div>
              </div>
            ))}
            {!s.classes.some((c) => c.day === day) && <p className="card text-center text-sm text-slate-400">No classes. Enjoy your day 🌴</p>}
          </div>

          <div className="card flex items-center gap-3">
            <div className={`grid size-11 place-items-center rounded-2xl ${s.remind.on ? 'bg-mint-400/15 text-mint-300' : 'bg-fg/5 text-slate-400'}`}>{s.remind.on ? <Bell size={20} /> : <BellOff size={20} />}</div>
            <div className="flex-1"><p className="font-semibold">Class reminders</p><p className="text-xs text-slate-400">{s.remind.on ? `${s.remind.minutes} min before each class` : 'Off: only you can turn this on'}</p></div>
            <button onClick={() => (s.remind.on ? set((p) => ({ ...p, remind: { ...p.remind, on: false } })) : setConsent(true))}
              className={`relative h-7 w-12 rounded-full transition ${s.remind.on ? 'bg-mint-400' : 'bg-fg/15'}`} aria-label="Toggle reminders">
              <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${s.remind.on ? 'start-6' : 'start-1'}`} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button className="btn-ghost px-2 py-2.5" onClick={() => fileRef.current?.click()}><ImageUp size={14} /> Re-scan</button>
            <button className="btn-ghost px-2 py-2.5" onClick={() => { setDraft(s.classes); setStage('review') }}>✏️ Edit</button>
            <button className="btn-ghost px-2 py-2.5" onClick={exportCal}><CalendarPlus size={14} /> Calendar</button>
          </div>
          <button className="text-xs text-rose-300 underline" onClick={() => set((p) => ({ ...p, classes: [], remind: { ...p.remind, on: false } }))}>Delete my timetable from this device</button>
        </>
      )}
      <ReminderConsent open={consent} onClose={() => setConsent(false)} />
    </div>
  )
}

function countdown(at: Date) {
  const m = Math.max(0, Math.round((at.getTime() - Date.now()) / 60000))
  if (m < 60) return `${m} min`
  if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`
}

function ReminderConsent({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, set, toast } = useStore()
  const [mins, setMins] = useState(s.remind.minutes)
  const enable = async (system: boolean) => {
    let note = 'In-app reminders on'
    if (system) {
      const r = await askNotificationPermission()
      note = r === 'granted' ? 'Notifications allowed' : r === 'unsupported' ? 'This browser has no notifications. In-app reminders on' : 'Notifications blocked. In-app reminders on'
    }
    set((p) => ({ ...p, remind: { on: true, minutes: mins } }))
    toast({ title: note, emoji: '🔔' })
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Turn on class reminders?">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-300">Luda will remind you before each class. Reminders are worked out <b>on your phone</b>. Your timetable isn't shared with anyone, and you can switch this off any time.</p>
        <div>
          <p className="label mb-2">Remind me</p>
          <div className="flex gap-2">{[10, 15, 30, 60].map((m) => <button key={m} onClick={() => setMins(m)} className={`chip flex-1 justify-center py-2.5 ${mins === m ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{m} min</button>)}</div>
        </div>
        {canNotify() && <button className="btn-primary py-4" onClick={() => enable(true)}><Bell size={18} /> Allow phone notifications</button>}
        <button className="btn-ghost" onClick={() => enable(false)}>Only remind me inside the app</button>
        <p className="text-center text-[11px] text-slate-500">Tip: "Calendar" adds your classes with alarms to your phone's own calendar, which works even when Luda is closed.</p>
      </div>
    </Sheet>
  )
}

/* ------------------------------ Deadlines ------------------------------ */

const KIND: Record<CalKind, { c: string; e: string }> = {
  exam: { c: 'bg-rose-500/15 text-rose-300', e: '📝' }, fee: { c: 'bg-gold-400/15 text-gold-300', e: '💳' },
  deadline: { c: 'bg-fuchsia-500/15 text-fuchsia-300', e: '⏰' }, term: { c: 'bg-sky-400/15 text-sky-300', e: '🎓' },
}

function Deadlines({ uni }: { uni: string }) {
  const { toast } = useStore()
  const items = calendarFor(uni)
  const upcoming = items.filter((i) => daysUntil(i.end ?? i.start) >= 0)
  const past = items.filter((i) => daysUntil(i.end ?? i.start) < 0)
  const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const exportAll = () => {
    const ok = downloadIcs('uni-deadlines', upcoming.map((i) => ({ title: i.title, start: new Date(i.start + 'T09:00:00'), end: new Date((i.end ?? i.start) + 'T17:00:00'), alarmMin: 1440 })))
    toast({ title: ok ? 'Deadlines exported to calendar' : 'Downloads are blocked in this preview', emoji: '📅' })
  }
  return (
    <div className="flex flex-col gap-2 px-5 pt-4">
      <p className="rounded-2xl bg-fg/[0.03] p-3 text-[11px] text-slate-400">Showing <b>your school's</b> 2026–27 calendar. Sample dates in this demo; the live app syncs from the official academic calendar.</p>
      {upcoming.map((i, n) => {
        const d = daysUntil(i.start), ongoing = d < 0
        return (
          <motion.div key={i.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: n * 0.03 }} className={`card flex items-center gap-3 ${n === 0 ? 'border-indigo-400/40' : ''}`}>
            <div className={`grid size-11 place-items-center rounded-2xl text-lg ${KIND[i.kind].c}`}>{KIND[i.kind].e}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{i.title}</p><p className="text-xs text-slate-400">{fmtD(i.start)}{i.end ? ` – ${fmtD(i.end)}` : ''}</p></div>
            <div className={`text-end ${d <= 7 ? 'text-rose-300' : d <= 21 ? 'text-gold-300' : 'text-slate-300'}`}>
              <p className="text-lg font-extrabold leading-none">{ongoing ? 'Now' : d}</p><p className="text-[10px]">{ongoing ? 'ongoing' : d === 1 ? 'day' : 'days'}</p>
            </div>
          </motion.div>
        )
      })}
      <button className="btn-ghost mt-2" onClick={exportAll}><CalendarPlus size={16} /> Add all to my calendar</button>
      {past.length > 0 && <p className="mt-2 text-center text-xs text-slate-500">{past.length} past dates hidden</p>}
    </div>
  )
}

/* ------------------------------ Fees ------------------------------ */

function Fees({ uni }: { uni: string }) {
  const { s, set, addTx, reward, checkPin, gate } = useStore()
  const { yearly, items } = feesForUni(uni)
  const [paying, setPaying] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const paid = items.filter((f) => s.paidFees.includes(f.id))
  const fee = items.find((f) => f.id === paying)
  const usd = s.balances.USD ?? 0

  const pay = async (pin: string) => {
    if (!(await checkPin(pin))) return setErr('Wrong PIN')
    set((p) => ({ ...p, balances: { ...p.balances, USD: (p.balances.USD ?? 0) - fee!.amount }, paidFees: [...p.paidFees, fee!.id] }))
    addTx({ type: 'bill', amount: -fee!.amount, currency: 'USD', label: `Tuition · ${fee!.title}` })
    reward(30, { title: 'Tuition paid on time' })
    setDone(true)
  }
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <div className="card bg-gradient-to-br from-gold-400/15 to-transparent">
        <p className="label">Tuition 2026–27 · sample</p>
        <p className="mt-1 text-3xl font-extrabold">{fmt(yearly, 'USD')}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full bg-gradient-to-r from-gold-300 to-mint-400" style={{ width: `${(paid.length / items.length) * 100}%` }} /></div>
        <p className="mt-1 text-xs text-slate-400">{paid.length}/{items.length} instalments paid · wallet {fmt(usd, 'USD')}</p>
      </div>
      {items.map((f) => {
        const isPaid = s.paidFees.includes(f.id), d = daysUntil(f.due)
        return (
          <div key={f.id} className="card flex items-center gap-3">
            <div className={`grid size-10 place-items-center rounded-xl ${isPaid ? 'bg-mint-400/15 text-mint-300' : d < 0 ? 'bg-rose-500/15 text-rose-300' : 'bg-gold-400/15 text-gold-300'}`}>{isPaid ? <Check size={18} /> : '💳'}</div>
            <div className="flex-1"><p className="text-sm font-semibold">{f.title}</p><p className={`text-xs ${!isPaid && d < 0 ? 'text-rose-300' : 'text-slate-400'}`}>{isPaid ? 'Paid' : d < 0 ? `Overdue by ${-d} days` : `Due in ${d} days`} · {fmt(f.amount, 'USD')}</p></div>
            {!isPaid && <div className="flex flex-col items-end gap-1">
              <button className="btn-gold px-3 py-2 text-xs" onClick={() => { if (!gate(2, 'Pay tuition')) return; setPaying(f.id); setErr(''); setDone(false) }}>Pay</button>
              <button className="text-[10px] text-slate-500 underline" onClick={() => set((p) => ({ ...p, paidFees: [...p.paidFees, f.id] }))}>Paid elsewhere</button>
            </div>}
          </div>
        )
      })}
      <Sheet open={!!fee} onClose={() => setPaying(null)} title={fee?.title ?? ''}>
        {done ? <Success title="Tuition paid 🎓" sub="Receipt saved to your wallet activity." onClose={() => setPaying(null)} /> : fee && (
          usd < fee.amount ? (
            <div className="flex flex-col gap-3 text-center">
              <p className="text-sm text-slate-300">You need {fmt(fee.amount, 'USD')} in your USD wallet (you have {fmt(usd, 'USD')}).</p>
              <Link to="/exchange" className="btn-gold">Convert to USD</Link>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3"><p className="text-sm text-slate-300">Pay {fmt(fee.amount, 'USD')} to your university. Enter PIN.</p><PinPad error={err} onDone={pay} /></div>
          )
        )}
      </Sheet>
    </div>
  )
}
