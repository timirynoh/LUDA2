import { AnimatePresence, motion } from 'framer-motion'
import { Bath, BadgeCheck, BedDouble, CalendarCheck, Camera, Flag, GraduationCap, Heart, MapPin, MessageCircle, Plus, ShieldAlert, Star, Trash2, UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PostGate } from '../components/PostGate'
import { DemoNote, Header, Segmented, Sheet, Success } from '../components/ui'
import { isVisible } from '../lib/posting'
import { StatusChip } from './Jobs'
import { AREAS, listingsFor, REVIEWS, roommatesFor, type HomeType, type Listing } from '../lib/housing'
import { CITIES } from '../lib/data'
import { convert, fmt, useRates } from '../lib/fx'
import { uid, useStore } from '../lib/store'

type Tab = 'homes' | 'roommates' | 'mine'
const TYPES: ('All' | HomeType)[] = ['All', 'Room', 'Studio', '1+1', '2+1', 'Dorm']

export default function Housing() {
  const { s, t } = useStore()
  const [tab, setTab] = useState<Tab>('homes')
  const city = CITIES.find((c) => c.id === s.city)!
  return (
    <div>
      <Header back title={t('act.housing')} sub={`📍 ${city.name} · rooms, flats & roommates`} />
      <div className="px-5">
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'homes', label: '🏠 Homes' }, { value: 'roommates', label: '🤝 Roommates' },
          { value: 'mine', label: `⭐ Mine${s.viewings.length + s.savedHomes.length ? ` · ${s.viewings.length + s.savedHomes.length}` : ''}` },
        ]} />
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {tab === 'homes' && <Homes />}
          {tab === 'roommates' && <Roommates />}
          {tab === 'mine' && <Mine />}
        </motion.div>
      </AnimatePresence>
      <DemoNote />
    </div>
  )
}

function Price({ gbp, big }: { gbp: number; big?: boolean }) {
  const { rates } = useRates()
  return (
    <span>
      <span className={big ? 'text-3xl font-extrabold' : 'text-lg font-extrabold'}>£{gbp}</span>
      <span className="text-xs text-slate-400">/mo · ≈{fmt(convert(rates, gbp, 'GBP', 'TRY'), 'TRY')}</span>
    </span>
  )
}

function useAllListings() {
  const { s } = useStore()
  return useMemo(() => [...s.myListings.filter((l) => l.city === s.city && isVisible(l)), ...listingsFor(s.city)].filter((l) => !s.reports.includes(l.id)), [s.city, s.myListings, s.reports])
}

function Homes() {
  const { s, set } = useStore()
  const all = useAllListings()
  const [type, setType] = useState<'All' | HomeType>('All')
  const [furnished, setFurnished] = useState(false)
  const [bills, setBills] = useState(false)
  const [max, setMax] = useState(700)
  const [open, setOpen] = useState<Listing | null>(null)
  const [posting, setPosting] = useState(false)

  const list = all.filter((l) => (type === 'All' || l.type === type) && (!furnished || l.furnished) && (!bills || l.bills) && l.price <= max)
  const toggleSave = (id: string) => set((p) => ({ ...p, savedHomes: p.savedHomes.includes(id) ? p.savedHomes.filter((x) => x !== id) : [...p.savedHomes, id] }))

  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <div className="flex items-start gap-3 rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100">
        <ShieldAlert size={18} className="mt-0.5 shrink-0 text-gold-300" />
        <span><b>Scam check:</b> never send a deposit before viewing in person. Look for the <BadgeCheck size={12} className="inline text-mint-400" /> verified landlord badge.</span>
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
        {TYPES.map((x) => (
          <button key={x} onClick={() => setType(x)} className={`chip shrink-0 px-4 py-2 text-sm ${type === x ? 'bg-gradient-to-r from-mint-400 to-emerald-500 text-ink-950' : 'glass text-slate-300'}`}>{x}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFurnished(!furnished)} className={`chip py-1.5 ${furnished ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/5 text-slate-400'}`}>🛋️ Furnished</button>
        <button onClick={() => setBills(!bills)} className={`chip py-1.5 ${bills ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/5 text-slate-400'}`}>💡 Bills included</button>
        <label className="ms-auto flex items-center gap-2 text-xs text-slate-400">≤ £{max}
          <input type="range" min={120} max={700} step={10} value={max} onChange={(e) => setMax(+e.target.value)} className="w-24 accent-emerald-400" />
        </label>
      </div>

      <p className="text-xs text-slate-500">{list.length} places</p>
      {list.map((l, i) => (
        <motion.div key={l.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}
          className="card overflow-hidden p-0">
          <button onClick={() => setOpen(l)} className="block w-full text-start">
            <div className={`relative grid h-32 place-items-center bg-gradient-to-br ${l.tone}`}>
              <span className="text-6xl drop-shadow-lg">{l.emoji}</span>
              <span className="chip absolute start-3 top-3 bg-black/40 text-white backdrop-blur">{l.type}</span>
              {l.mine && <span className="chip absolute end-3 top-3 bg-gold-400 text-ink-950">Your listing</span>}
              {!l.mine && l.posted <= 2 && <span className="chip absolute end-3 top-3 bg-mint-400 text-ink-950">New</span>}
            </div>
            <div className="p-4 pb-2">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{l.title}</p>
                <Price gbp={l.price} />
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-slate-400"><MapPin size={12} /> {l.area} · <BedDouble size={12} /> {l.beds} · <Bath size={12} /> {l.baths}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {l.furnished && <span className="chip bg-fg/5 text-slate-300">Furnished</span>}
                {l.bills && <span className="chip bg-fg/5 text-slate-300">Bills incl.</span>}
                {l.uni && <span className="chip bg-sky-400/10 text-sky-200"><GraduationCap size={11} /> Near campus</span>}
              </div>
            </div>
          </button>
          <div className="flex items-center justify-between px-4 pb-4">
            <p className="flex items-center gap-1 text-xs text-slate-400">
              {l.verified && <BadgeCheck size={14} className="text-mint-400" />}{l.landlord} · <Star size={11} className="fill-gold-400 text-gold-400" /> {l.rating}
            </p>
            <button onClick={() => toggleSave(l.id)} aria-label="Save" className="grid size-9 place-items-center rounded-xl bg-fg/5">
              <Heart size={18} className={s.savedHomes.includes(l.id) ? 'fill-rose-500 text-rose-500' : 'text-slate-400'} />
            </button>
          </div>
        </motion.div>
      ))}
      {!list.length && <p className="py-10 text-center text-sm text-slate-400">No places match. Try widening your filters.</p>}

      <div className="pointer-events-none fixed inset-x-0 bottom-28 z-30 mx-auto flex max-w-md justify-end px-5">
        <button onClick={() => setPosting(true)} className="btn-gold pointer-events-auto rounded-full px-5 shadow-2xl"><Plus size={18} /> List a room</button>
      </div>

      {open && <ListingSheet listing={open} onClose={() => setOpen(null)} />}
      <PostSheet open={posting} onClose={() => setPosting(false)} />
    </div>
  )
}

function ListingSheet({ listing: l, onClose }: { listing: Listing; onClose: () => void }) {
  const { s, set, reward, toast } = useStore()
  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i + 1); return d }), [])
  const [day, setDay] = useState(0)
  const [time, setTime] = useState('17:00')
  const [booked, setBooked] = useState(false)
  const [reporting, setReporting] = useState(false)
  const confirmedDays = l.mine ? Math.floor((Date.now() - (l.confirmedAt ?? Date.now())) / 86_400_000) : l.posted % 7
  const report = (why: string) => {
    set((p) => ({ ...p, reports: [...p.reports, l.id] }))
    reward(10, { badge: 'guardian', title: `Reported: ${why}` })
    toast({ title: 'Hidden for you. Luda will check it', emoji: '🛡️' })
    onClose()
  }

  const book = () => {
    const date = `${days[day].toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`
    set((p) => ({ ...p, viewings: [...p.viewings, { id: uid(), listingId: l.id, title: `${l.title} · ${l.area}`, date }] }))
    reward(s.quests.includes('housing') ? 10 : 70, { quest: 'housing', badge: 'home_sweet', title: 'Viewing booked' })
    setBooked(true)
  }

  return (
    <Sheet open onClose={onClose} title={l.title}>
      {booked ? <Success title="Viewing booked 🏡" sub={`${l.landlord} will confirm by message. Find it under "Mine".`} onClose={onClose} /> : (
        <div className="flex flex-col gap-4">
          <div className={`grid h-40 place-items-center rounded-3xl bg-gradient-to-br ${l.tone}`}><span className="text-7xl">{l.emoji}</span></div>
          <div className="flex items-end justify-between">
            <div><p className="flex items-center gap-1 text-sm text-slate-400"><MapPin size={14} /> {l.area}</p><Price gbp={l.price} big /></div>
            <span className="chip bg-fg/5 text-slate-300">{l.deposit} month deposit</span>
          </div>
          <p className="-mt-2 flex items-center gap-1 text-xs text-mint-300">● Availability confirmed {confirmedDays === 0 ? 'today' : `${confirmedDays} day${confirmedDays > 1 ? 's' : ''} ago`}{l.official ? ' · Luda Official' : ''}</p>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-2xl bg-fg/[0.04] p-3"><BedDouble size={18} className="mx-auto mb-1 text-slate-300" />{l.beds} bed</div>
            <div className="rounded-2xl bg-fg/[0.04] p-3"><Bath size={18} className="mx-auto mb-1 text-slate-300" />{l.baths} bath</div>
            <div className="rounded-2xl bg-fg/[0.04] p-3"><span className="mb-1 block text-lg leading-none">{l.bills ? '💡' : '🧾'}</span>{l.bills ? 'Bills incl.' : 'Bills extra'}</div>
          </div>
          {l.uni && <p className="flex items-center gap-2 rounded-2xl bg-sky-400/10 p-3 text-sm text-sky-100"><GraduationCap size={18} /> Close to {l.uni}</p>}

          <div className="card flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-ink-600 font-bold">{l.landlord[0]}</div>
            <div className="flex-1">
              <p className="flex items-center gap-1 font-semibold">{l.landlord}{l.verified && <BadgeCheck size={16} className="text-mint-400" />}</p>
              <p className="flex items-center gap-1 text-xs text-slate-400"><Star size={11} className="fill-gold-400 text-gold-400" /> {l.rating} · {l.reviews} reviews {l.verified ? '· ID & title deed checked' : '· not yet verified'}</p>
            </div>
          </div>
          {!l.mine && (
            <div className="flex flex-col gap-2">
              {REVIEWS.slice(0, 2).map(([who, stars, txt]) => (
                <div key={who} className="rounded-2xl bg-fg/[0.03] p-3 text-sm">
                  <p className="text-xs text-slate-400">{who} · {'★'.repeat(stars)}</p><p className="mt-1 text-slate-200">{txt}</p>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="label mb-2">Book a viewing</p>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
              {days.map((d, i) => (
                <button key={i} onClick={() => setDay(i)} className={`flex min-w-14 flex-col items-center rounded-2xl px-3 py-2 text-xs ${day === i ? 'bg-mint-400 text-ink-950' : 'glass text-slate-300'}`}>
                  <span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span><span className="text-lg font-bold">{d.getDate()}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              {['10:00', '13:00', '17:00', '19:00'].map((x) => (
                <button key={x} onClick={() => setTime(x)} className={`chip py-2 ${time === x ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{x}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <button className="btn-ghost" onClick={() => toast({ title: `Message sent to ${l.landlord}`, emoji: '💬' })}><MessageCircle size={18} /></button>
            <button className="btn-primary py-4" disabled={l.mine} onClick={book}><CalendarCheck size={18} /> Book viewing</button>
          </div>
          <p className="text-center text-[11px] text-slate-500">🔒 Coming soon: pay your deposit into Luda escrow. It's released to the landlord only after you get the keys.</p>
          {!l.mine && (reporting ? (
            <div className="grid grid-cols-3 gap-2 text-xs">
              {['Already taken', 'Fake / scam', 'Wrong info'].map((w) => <button key={w} className="btn bg-rose-500/10 py-2 text-rose-300" onClick={() => report(w)}>{w}</button>)}
            </div>
          ) : <button className="flex items-center justify-center gap-1 text-xs text-slate-500 underline" onClick={() => setReporting(true)}><Flag size={12} /> Report this listing</button>)}
        </div>
      )}
    </Sheet>
  )
}

function PostSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, set, reward } = useStore()
  const areas = AREAS[s.city] ?? AREAS.lefkosa
  const [f, setF] = useState({ type: 'Room' as HomeType, area: areas[0], price: '200', furnished: true, bills: false, note: '', address: '', photos: 0 })
  const [done, setDone] = useState(false)

  const submit = () => {
    const now = Date.now()
    const l: Listing = {
      status: s.isAdmin ? 'live' : 'pending', official: s.isAdmin, createdAt: now, confirmedAt: now, photos: f.photos,
      id: `mine-${uid()}`, title: f.note.trim() || `${f.type === 'Room' ? 'Room in my flat' : f.type + ' for rent'}`, type: f.type, city: s.city, area: f.area,
      price: +f.price || 0, deposit: 1, furnished: f.furnished, bills: f.bills, beds: f.type === '2+1' ? 2 : 1, baths: 1,
      landlord: s.isAdmin ? 'Luda Official' : s.name, verified: s.verified || s.isAdmin, rating: 5, reviews: 0, posted: 0, emoji: '✨', tone: 'from-gold-400 to-amber-700', mine: true,
    }
    set((p) => ({ ...p, myListings: [l, ...p.myListings] }))
    reward(30, { badge: 'good_neighbour', title: s.isAdmin ? 'Listing published' : 'Submitted for review' })
    setDone(true)
  }
  const close = () => { setDone(false); onClose() }

  return (
    <Sheet open={open} onClose={close} title="List a room or flat">
      {done ? <Success title={s.isAdmin ? "It's live ✨" : 'Under review ⏳'} sub={s.isAdmin ? 'Published as Luda Official.' : 'Luda checks your documents and photos, usually within 24 hours. Track it under "Mine".'} onClose={close} /> : (
        <PostGate kind="housing">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {(['Room', 'Studio', '1+1', '2+1'] as HomeType[]).map((x) => (
              <button key={x} onClick={() => setF({ ...f, type: x })} className={`chip py-2 ${f.type === x ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{x}</button>
            ))}
          </div>
          <input className="input" placeholder="Short title, e.g. Room near NEU, own bathroom" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={50} />
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>{areas.map((a) => <option key={a}>{a}</option>)}</select>
            <div className="relative"><span className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-400">£</span>
              <input inputMode="numeric" className="input ps-8" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, '') })} /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setF({ ...f, furnished: !f.furnished })} className={`chip py-2 ${f.furnished ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/5 text-slate-400'}`}>🛋️ Furnished</button>
            <button onClick={() => setF({ ...f, bills: !f.bills })} className={`chip py-2 ${f.bills ? 'bg-mint-400/20 text-mint-200' : 'bg-fg/5 text-slate-400'}`}>💡 Bills included</button>
          </div>
          <input className="input" placeholder="Exact address (only shown after a viewing is booked)" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
          <label className={`glass flex cursor-pointer items-center gap-3 rounded-2xl p-3 ${f.photos >= 3 ? 'border-mint-400/40' : ''}`}>
            <Camera size={20} className={f.photos >= 3 ? 'text-mint-300' : 'text-slate-400'} />
            <span className="flex-1 text-sm"><b>Live photos</b> ({f.photos}/3 minimum)<span className="block text-xs text-slate-400">Taken now with your camera, so we know the place is real and current</span></span>
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => setF({ ...f, photos: f.photos + (e.target.files?.length ?? 0) })} />
          </label>
          <p className="text-[11px] text-slate-500">You'll be asked every {7} days to confirm it's still available, or it's hidden automatically.</p>
          <button className="btn-primary py-4" disabled={!+f.price || (!s.isAdmin && (f.photos < 3 || f.address.length < 5))} onClick={submit}>{s.isAdmin ? 'Publish' : 'Submit for review'} · +30 XP</button>
        </div>
        </PostGate>
      )}
    </Sheet>
  )
}

function Roommates() {
  const { s, set, reward } = useStore()
  const people = useMemo(() => roommatesFor(s.city), [s.city])
  const connect = (id: string, name: string) => {
    if (s.connections.includes(id)) return
    set((p) => ({ ...p, connections: [...p.connections, id] }))
    reward(15, { badge: 'good_neighbour', title: `Request sent to ${name}` })
  }
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <p className="text-sm text-slate-400">Split the rent with someone verified. Matches are based on budget, campus and lifestyle.</p>
      {people.map((p, i) => {
        const sent = s.connections.includes(p.id)
        return (
          <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="card">
            <div className="flex items-center gap-3">
              <div className="relative grid size-12 place-items-center rounded-2xl bg-ink-600 text-2xl">{p.flag}</div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.name}</p>
                <p className="truncate text-xs text-slate-400">{p.uni} · £{p.budget}/mo · {p.moveIn}</p>
              </div>
              <div className={`text-end ${p.match >= 85 ? 'text-mint-300' : 'text-gold-300'}`}><p className="text-xl font-extrabold">{p.match}%</p><p className="text-[10px]">match</p></div>
            </div>
            <p className="mt-2 text-sm text-slate-300">{p.bio}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">{p.tags.map((x) => <span key={x} className="chip bg-fg/5 text-slate-300">{x}</span>)}</div>
            <button onClick={() => connect(p.id, p.name)} disabled={sent} className={`mt-3 w-full ${sent ? 'btn-ghost' : 'btn-primary'} py-2.5 text-sm`}>
              {sent ? '✓ Request sent' : <><UserPlus size={16} /> Connect</>}
            </button>
          </motion.div>
        )
      })}
    </div>
  )
}

function Mine() {
  const { s, set } = useStore()
  const all = useAllListings()
  const saved = all.filter((l) => s.savedHomes.includes(l.id))
  return (
    <div className="flex flex-col gap-5 px-5 pt-4">
      <section>
        <p className="label mb-2">Upcoming viewings</p>
        {s.viewings.length ? s.viewings.map((v) => (
          <div key={v.id} className="card mb-2 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-mint-400/15 text-mint-300"><CalendarCheck size={18} /></div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{v.title}</p><p className="text-xs text-slate-400">{v.date}</p></div>
            <button aria-label="Cancel viewing" onClick={() => set((p) => ({ ...p, viewings: p.viewings.filter((x) => x.id !== v.id) }))} className="text-slate-500"><Trash2 size={16} /></button>
          </div>
        )) : <p className="card text-center text-sm text-slate-400">No viewings yet. Open a home and book one.</p>}
      </section>
      <section>
        <p className="label mb-2">Saved homes</p>
        {saved.length ? saved.map((l) => (
          <div key={l.id} className="card mb-2 flex items-center gap-3">
            <div className={`grid size-10 place-items-center rounded-xl bg-gradient-to-br ${l.tone}`}>{l.emoji}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{l.title}</p><p className="text-xs text-slate-400">{l.area} · £{l.price}/mo</p></div>
            <button aria-label="Unsave" onClick={() => set((p) => ({ ...p, savedHomes: p.savedHomes.filter((x) => x !== l.id) }))}><Heart size={18} className="fill-rose-500 text-rose-500" /></button>
          </div>
        )) : <p className="card text-center text-sm text-slate-400">Tap ♥ on a home to save it.</p>}
      </section>
      <section>
        <p className="label mb-2">My listings</p>
        {s.myListings.length ? s.myListings.map((l) => (
          <div key={l.id} className="card mb-2">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-gold-400/20">✨</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{l.title}</p><p className="text-xs text-slate-400">{l.area} · £{l.price}/mo{l.status === 'live' ? ` · ${3 + (l.price % 7)} views` : ''}</p></div>
              <button aria-label="Remove listing" onClick={() => set((p) => ({ ...p, myListings: p.myListings.filter((x) => x.id !== l.id) }))} className="text-slate-500"><Trash2 size={16} /></button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <StatusChip m={l} />
              {l.status === 'live' && <div className="flex gap-2">
                <button className="chip bg-mint-400/15 py-1.5 text-mint-300" onClick={() => set((p) => ({ ...p, myListings: p.myListings.map((x) => (x.id === l.id ? { ...x, confirmedAt: Date.now() } : x)) }))}>✓ Still available</button>
                <button className="chip bg-fg/5 py-1.5 text-slate-300" onClick={() => set((p) => ({ ...p, myListings: p.myListings.filter((x) => x.id !== l.id) }))}>Taken</button>
              </div>}
              {l.status === 'rejected' && l.rejectReason && <p className="w-full text-xs text-rose-300">Reason: {l.rejectReason}</p>}
            </div>
          </div>
        )) : <p className="card text-center text-sm text-slate-400">Have a spare room? Use "List a room" on the Homes tab.</p>}
      </section>
    </div>
  )
}
