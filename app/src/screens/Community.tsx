import { motion } from 'framer-motion'
import { BadgeCheck, CalendarPlus, Clock, MapPin, Plus, Trash2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PostGate } from '../components/PostGate'
import { DemoNote, Header, Sheet, Success } from '../components/ui'
import { eventsFor, type Ev, type EvCat } from '../lib/community'
import { CITIES, SAFE_SPOTS } from '../lib/data'
import { downloadIcs } from '../lib/ics'
import { isVisible } from '../lib/posting'
import { uid, useStore } from '../lib/store'
import { StatusChip } from './Jobs'

const CATS: ('All' | EvCat)[] = ['All', 'Worship', 'Culture', 'Sports', 'Career', 'Help', 'Party']
const when = (ts: number) => new Date(ts).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function Community() {
  const { s, set, t } = useStore()
  const [cat, setCat] = useState<'All' | EvCat>('All')
  const [open, setOpen] = useState<Ev | null>(null)
  const [posting, setPosting] = useState(false)
  const city = CITIES.find((c) => c.id === s.city)!
  const events = useMemo(() => [...s.myEvents.filter((e) => e.city === s.city && isVisible(e)), ...eventsFor(s.city, (SAFE_SPOTS[s.city] ?? SAFE_SPOTS.lefkosa)[0])]
    .filter((e) => !s.reports.includes(e.id)).sort((a, b) => a.start - b.start), [s.city, s.myEvents, s.reports])
  const list = events.filter((e) => cat === 'All' || e.cat === cat)
  const going = events.filter((e) => s.rsvps.includes(e.id))

  return (
    <div>
      <Header back title={t('act.community')} sub={`📍 ${city.name} · services, culture & meetups`} />
      <div className="flex flex-col gap-3 px-5">
        {going.length > 0 && (
          <div className="card bg-gradient-to-br from-pink-500/15 to-transparent">
            <p className="label mb-2">You're going</p>
            {going.slice(0, 3).map((e) => <p key={e.id} className="flex items-center gap-2 py-1 text-sm"><span>{e.emoji}</span><span className="flex-1 truncate font-semibold">{e.title}</span><span className="text-xs text-slate-400">{when(e.start)}</span></p>)}
          </div>
        )}
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
          {CATS.map((x) => <button key={x} onClick={() => setCat(x)} className={`chip shrink-0 px-4 py-2 text-sm ${cat === x ? 'bg-gradient-to-r from-pink-400 to-rose-500 text-ink-950' : 'glass text-slate-300'}`}>{x}</button>)}
        </div>
        {cat === 'Worship' && <Link to="/nearby?cat=worship" className="card flex items-center gap-3 py-3 text-sm"><MapPin size={16} className="text-pink-300" /> Find churches & mosques near you on the map →</Link>}
        {list.map((e, i) => {
          const isGoing = s.rsvps.includes(e.id)
          return (
            <motion.button key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} onClick={() => setOpen(e)} className="card text-start">
              <div className="flex items-start gap-3">
                <div className="flex w-14 shrink-0 flex-col items-center rounded-2xl bg-pink-500/15 py-2 text-pink-200">
                  <span className="text-[10px] font-bold uppercase">{new Date(e.start).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span className="text-xl font-extrabold leading-tight">{new Date(e.start).getDate()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{e.emoji} {e.title}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-slate-400"><Clock size={11} /> {new Date(e.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}{e.weekly ? ' · weekly' : ''} · <MapPin size={11} /> {e.place}</p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">{e.verifiedOrg && <BadgeCheck size={12} className="text-mint-400" />}{e.official ? 'Luda Official' : e.organiser}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs text-slate-400"><Users size={13} /> {e.going + (isGoing ? 1 : 0)} going · {e.free ? 'Free' : 'Paid'}</span>
                {isGoing ? <span className="chip bg-mint-400/15 text-mint-300">✓ Going</span> : <span className="chip bg-pink-500/15 text-pink-200">RSVP</span>}
              </div>
            </motion.button>
          )
        })}

        {s.myEvents.length > 0 && (
          <section className="pt-2">
            <p className="label mb-2">Events I posted</p>
            {s.myEvents.map((e) => (
              <div key={e.id} className="card mb-2 flex items-center gap-3">
                <span className="text-2xl">{e.emoji}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{e.title}</p><StatusChip m={e} /></div>
                <button aria-label="Remove" onClick={() => set((p) => ({ ...p, myEvents: p.myEvents.filter((x) => x.id !== e.id) }))} className="text-slate-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </section>
        )}
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-30 mx-auto flex max-w-md justify-end px-5">
          <button onClick={() => setPosting(true)} className="btn-gold pointer-events-auto rounded-full px-5 shadow-2xl"><Plus size={18} /> Post event</button>
        </div>
      </div>
      <DemoNote />
      {open && <EventSheet ev={open} onClose={() => setOpen(null)} />}
      <PostEvent open={posting} onClose={() => setPosting(false)} />
    </div>
  )
}

function EventSheet({ ev: e, onClose }: { ev: Ev; onClose: () => void }) {
  const { s, set, reward, toast } = useStore()
  const isGoing = s.rsvps.includes(e.id)
  const rsvp = () => {
    set((p) => ({ ...p, rsvps: isGoing ? p.rsvps.filter((x) => x !== e.id) : [...p.rsvps, e.id] }))
    if (!isGoing) reward(s.quests.includes('event') ? 5 : 40, { quest: 'event', badge: 'social', title: "You're going!" })
  }
  const cal = () => {
    const ok = downloadIcs(e.title, [{ title: e.title, start: new Date(e.start), end: new Date(e.start + e.durMin * 60000), location: e.place, weekly: e.weekly, alarmMin: 60, desc: e.desc }])
    toast({ title: ok ? 'Calendar file downloaded' : 'Downloads are blocked in this preview', emoji: '📅' })
  }
  return (
    <Sheet open onClose={onClose} title={e.title}>
      <div className="flex flex-col gap-4">
        <div className="grid h-32 place-items-center rounded-3xl bg-gradient-to-br from-pink-500 to-rose-800 text-6xl">{e.emoji}</div>
        <div className="grid gap-2 text-sm">
          <p className="flex items-center gap-2"><Clock size={15} className="text-slate-400" /> {when(e.start)} · {Math.round(e.durMin / 60 * 10) / 10}h{e.weekly ? ' · every week' : ''}</p>
          <p className="flex items-center gap-2"><MapPin size={15} className="text-slate-400" /> {e.place}</p>
          <p className="flex items-center gap-2"><Users size={15} className="text-slate-400" /> {e.going + (isGoing ? 1 : 0)} going · {e.free ? 'Free entry' : 'Paid entry'}</p>
          <p className="flex items-center gap-2">{e.verifiedOrg ? <BadgeCheck size={15} className="text-mint-400" /> : <Users size={15} className="text-slate-400" />} {e.official ? 'Luda Official' : e.organiser}{e.verifiedOrg ? ' · verified organisation' : ' · ID-verified organiser'}</p>
        </div>
        <p className="rounded-2xl bg-fg/[0.03] p-3 text-sm text-slate-300">{e.desc}</p>
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <button className="btn-ghost" onClick={cal} aria-label="Add to calendar"><CalendarPlus size={18} /></button>
          <button className={isGoing ? 'btn-ghost py-4' : 'btn-primary py-4'} onClick={rsvp}>{isGoing ? "✓ Going (tap to cancel)" : "I'm going"}</button>
        </div>
        {!e.mine && <button className="text-xs text-slate-500 underline" onClick={() => { set((p) => ({ ...p, reports: [...p.reports, e.id] })); reward(10, { badge: 'guardian', title: 'Thanks for reporting' }); onClose() }}>Report this event</button>}
      </div>
    </Sheet>
  )
}

function PostEvent({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, set, toast } = useStore()
  const [f, setF] = useState({ title: '', cat: 'Culture' as EvCat, place: '', date: '', time: '18:00', desc: '', weekly: false, free: true })
  const [done, setDone] = useState(false)
  const close = () => { setDone(false); onClose() }
  const submit = () => {
    const now = Date.now()
    const e: Ev = {
      id: `myev-${uid()}`, title: f.title, cat: f.cat, city: s.city, place: f.place, start: new Date(`${f.date}T${f.time}`).getTime(), durMin: 120,
      organiser: s.name, verifiedOrg: s.isAdmin, going: 0, desc: f.desc || '—', emoji: { Worship: '🙏', Culture: '🌍', Sports: '⚽', Career: '💼', Party: '🎉', Help: '🤝' }[f.cat],
      weekly: f.weekly, free: f.free, mine: true, status: s.isAdmin ? 'live' : 'pending', official: s.isAdmin, createdAt: now, confirmedAt: now,
    }
    set((p) => ({ ...p, myEvents: [e, ...p.myEvents] }))
    toast({ title: s.isAdmin ? 'Event published' : 'Submitted for review', emoji: s.isAdmin ? '✅' : '⏳' })
    setDone(true)
  }
  return (
    <Sheet open={open} onClose={close} title="Post an event or service">
      {done ? <Success title={s.isAdmin ? 'Event is live 🎉' : 'Under review ⏳'} sub={s.isAdmin ? 'Published as Luda Official.' : 'We check events before they go live, usually within a few hours.'} onClose={close} /> : (
        <PostGate kind="event">
          <div className="flex flex-col gap-3">
            <input className="input" placeholder="Event name" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <div className="flex flex-wrap gap-2">{CATS.slice(1).map((c) => <button key={c} onClick={() => setF({ ...f, cat: c as EvCat })} className={`chip py-1.5 ${f.cat === c ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{c}</button>)}</div>
            <input className="input" placeholder="Place / address" value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              <input type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
            </div>
            <textarea className="input min-h-20" placeholder="What's happening?" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-emerald-500" checked={f.weekly} onChange={(e) => setF({ ...f, weekly: e.target.checked })} /> Repeats weekly</label>
              <label className="flex items-center gap-2"><input type="checkbox" className="size-4 accent-emerald-500" checked={f.free} onChange={(e) => setF({ ...f, free: e.target.checked })} /> Free entry</label>
            </div>
            <button className="btn-primary py-4" disabled={!f.title || !f.place || !f.date} onClick={submit}>{s.isAdmin ? 'Publish' : 'Submit for review'}</button>
          </div>
        </PostGate>
      )}
    </Sheet>
  )
}
