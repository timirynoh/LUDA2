import { motion } from 'framer-motion'
import { Bookmark, Camera, Check, Clock, LocateFixed, MapPin, Navigation, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Header, Segmented, Sheet, Success } from '../components/ui'
import { CITIES } from '../lib/data'
import { fmt } from '../lib/fx'
import { AREAS } from '../lib/housing'
import { checkText } from '../lib/moderation'
import { expired, hidden, isFree, pctOff, PROMO_POINTS, samplePromos, type Promo, type PromoCat } from '../lib/promos'
import { uid, useStore } from '../lib/store'
import { thumb } from '../lib/threads'
import { km } from '../lib/transport'

const CATS: ('All' | PromoCat)[] = ['All', 'Groceries', 'Food & drinks', 'Household', 'Toiletries', 'Electronics', 'Clothing', 'Other']
const EMOJI: Record<PromoCat, string> = { Groceries: '🛒', 'Food & drinks': '🥤', Household: '🧽', Toiletries: '🧴', Electronics: '🔌', Clothing: '👕', Other: '🏷️' }
const ago = (ts: number) => { const m = Math.round((Date.now() - ts) / 60000); return m < 60 ? `${Math.max(1, m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago` }

export function usePromos() {
  const { s } = useStore()
  return useMemo(() => {
    const base = [...s.myPromos.filter((p) => p.city === s.city), ...samplePromos(s.city, AREAS[s.city] ?? AREAS.lefkosa)]
    return base.map((p) => {
      const v = s.promoVotes[p.id]
      return v ? { ...p, still: p.still + (v === 'still' ? 1 : 0), gone: p.gone + (v === 'gone' ? 1 : 0) } : p
    }).filter((p) => !expired(p) && !hidden(p) && !s.reports.includes(p.id))
  }, [s.myPromos, s.city, s.promoVotes, s.reports])
}

const priceTag = (p: Promo) => isFree(p) ? <span className="text-xl font-black text-mint-300">FREE</span> : <span className="text-xl font-extrabold">{fmt(p.price, 'TRY')}</span>

export default function Promos() {
  const { s, gate, toast } = useStore()
  const all = usePromos()
  const [sort, setSort] = useState<'discount' | 'new' | 'near'>('discount')
  const [cat, setCat] = useState<'All' | PromoCat>('All')
  const [freeOnly, setFreeOnly] = useState(false)
  const [q, setQ] = useState('')
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null)
  const [snap, setSnap] = useState(false)
  const [tab, setTab] = useState<'feed' | 'saved' | 'mine'>('feed')
  const city = CITIES.find((c) => c.id === s.city)!
  const dist = (p: Promo) => (p.lat && p.lon && me ? km(me, { lat: p.lat, lon: p.lon }) : km(city, { lat: city.lat + 0.01, lon: city.lon }))
  const list = all
    .filter((p) => (tab === 'saved' ? s.savedPromos.includes(p.id) : tab === 'mine' ? p.mine : true))
    .filter((p) => (cat === 'All' || p.cat === cat) && (!freeOnly || isFree(p)) && (!q || `${p.title} ${p.store}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => sort === 'new' ? b.ts - a.ts : sort === 'near' ? dist(a) - dist(b) : (isFree(b) ? 101 : pctOff(b)) - (isFree(a) ? 101 : pctOff(a)))
  const myPts = s.myPromos.reduce((a, p) => a + PROMO_POINTS.post + p.still * PROMO_POINTS.confirm, 0)
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => { setMe({ lat: p.coords.latitude, lon: p.coords.longitude }); setSort('near') }, () => toast({ title: 'Location not available. Sorting by area', emoji: '📍' }))
  const board = [{ n: 'Amara 🇳🇬', p: 340 }, { n: 'Kofi 🇬🇭', p: 285 }, { n: 'Tendai 🇿🇼', p: 210 }, { n: `${s.name} (you)`, p: myPts, me: true }, { n: 'Grâce 🇨🇩', p: 120 }].sort((a, b) => b.p - a.p)

  return (
    <div>
      <Header back title="🔥 Promo Spotter" sub={`Cheap & free finds in ${city.name}`} right={<button className="btn-gold px-3 py-2 text-sm" onClick={() => gate(1, 'Share promos') && setSnap(true)}><Camera size={16} /> Snap</button>} />
      <div className="flex flex-col gap-3 px-5">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-red-500 via-orange-600 to-amber-700 p-4 text-white">
          <span className="absolute -right-3 -bottom-5 text-7xl opacity-25">📸</span>
          <p className="font-extrabold">See a promo in a shop? Snap it!</p>
          <p className="text-sm text-white/85">+{PROMO_POINTS.post} points per promo, +{PROMO_POINTS.confirm} every time someone confirms it's still there. Points turn into wallet credit.</p>
          <p className="mt-2 text-sm font-bold">🪙 You've earned {myPts} pts from promos</p>
        </div>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'feed', label: `🔥 Near you · ${all.length}` }, { value: 'saved', label: `🔖 Saved` }, { value: 'mine', label: `📸 Mine · ${s.myPromos.length}` }]} />
        <div className="relative"><Search size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500" /><input className="input ps-11" placeholder="Rice, oil, chicken, charger…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="flex flex-wrap items-center gap-2">
          {([['discount', '💥 Biggest %'], ['new', '🆕 Newest'], ['near', '📍 Nearest']] as const).map(([k, l]) => (
            <button key={k} onClick={() => (k === 'near' && !me ? locate() : setSort(k))} className={`chip py-2 ${sort === k ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{l}</button>
          ))}
          <button onClick={() => setFreeOnly(!freeOnly)} className={`chip py-2 ${freeOnly ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>🆓 Free only</button>
        </div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5">{CATS.map((c) => <button key={c} onClick={() => setCat(c)} className={`chip shrink-0 px-4 py-2 text-sm ${cat === c ? 'bg-gradient-to-r from-red-400 to-orange-500 text-white' : 'glass text-slate-300'}`}>{c}</button>)}</div>
        <div className="grid grid-cols-1 gap-3 tab:grid-cols-2">
          {list.map((p, i) => <PromoCard key={p.id} p={p} i={i} />)}
        </div>
        {!list.length && <p className="card text-center text-sm text-slate-400">{tab === 'mine' ? 'You haven’t snapped any promos yet. Tap Snap in a shop!' : 'No promos match. Be the first to snap one!'}</p>}
        <section className="card">
          <p className="mb-2 font-bold">🏆 Top spotters this week</p>
          {board.map((r, i) => (
            <div key={r.n} className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${r.me ? 'bg-mint-400/10' : ''}`}><span className={`w-5 text-center font-bold ${i < 3 ? 'text-gold-300' : 'text-slate-500'}`}>{i + 1}</span><span className="flex-1 text-sm font-semibold">{r.n}</span><span className="text-sm text-slate-400">{r.p} pts</span></div>
          ))}
          <Link to="/rewards" className="mt-2 block text-center text-xs text-mint-300">Turn points into wallet credit ›</Link>
        </section>
        <p className="text-center text-[11px] text-slate-500">Prices are shared by students. Check in store; promos end on their date or when people mark them gone.</p>
      </div>
      {snap && <SnapSheet onClose={() => setSnap(false)} />}
    </div>
  )
}

function PromoCard({ p, i }: { p: Promo; i: number }) {
  const { s, set, allow, toast, gate } = useStore()
  const vote = s.promoVotes[p.id]
  const saved = s.savedPromos.includes(p.id)
  const off = pctOff(p)
  const castVote = (v: 'still' | 'gone') => {
    if (p.mine || vote || !gate(1, 'Confirm promos') || !allow('vote')) return
    set((st) => ({ ...st, promoVotes: { ...st.promoVotes, [p.id]: v }, points: st.points + PROMO_POINTS.voter }))
    toast({ title: v === 'still' ? `Thanks! +${PROMO_POINTS.voter} pts` : `Marked as gone. +${PROMO_POINTS.voter} pts`, emoji: v === 'still' ? '✅' : '👋' })
  }
  const maps = p.lat && p.lon ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.store} ${p.area} ${CITIES.find((c) => c.id === p.city)?.name ?? ''}`)}`
  const daysLeft = Math.max(0, Math.ceil((new Date(p.validUntil + 'T23:59:59').getTime() - Date.now()) / 86_400_000))
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} className="card overflow-hidden p-0">
      <div className="relative grid h-36 place-items-center bg-gradient-to-br from-ink-600 to-ink-800 text-6xl">
        {p.photo ? <img src={p.photo} alt={p.title} className="size-full object-cover" /> : p.emoji}
        {isFree(p) ? <span className="chip absolute start-3 top-3 bg-mint-400 text-ink-950">🆓 FREE</span> : off > 0 && <span className="chip absolute start-3 top-3 bg-rose-500 text-white">−{off}%</span>}
        <button onClick={() => set((st) => ({ ...st, savedPromos: saved ? st.savedPromos.filter((x) => x !== p.id) : [...st.savedPromos, p.id] }))} aria-label="Save promo" className="absolute end-3 top-3 grid size-8 place-items-center rounded-full bg-black/40"><Bookmark size={16} className={saved ? 'fill-gold-400 text-gold-400' : 'text-white'} /></button>
        {p.mine && <span className="chip absolute end-3 bottom-3 bg-gold-400 text-ink-950">Yours</span>}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2"><p className="font-semibold">{p.title}</p><div className="text-end">{priceTag(p)}{p.was ? <p className="text-xs text-slate-500 line-through">{fmt(p.was, 'TRY')}</p> : null}</div></div>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400"><span className="flex items-center gap-1"><MapPin size={11} /> {p.store} · {p.area}</span><span className="flex items-center gap-1"><Clock size={11} /> {daysLeft ? `${daysLeft}d left` : 'ends today'}</span></p>
        <p className="mt-1 text-[11px] text-slate-500">by {p.flag} {p.mine ? 'you' : p.by} · {ago(p.ts)} · ✅ {p.still} still there{p.gone ? ` · ❌ ${p.gone} gone` : ''}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <button disabled={p.mine || !!vote} onClick={() => castVote('still')} className={`btn py-2 ${vote === 'still' ? 'bg-mint-400 text-ink-950' : 'bg-mint-400/10 text-mint-200'} disabled:opacity-60`}><Check size={14} /> Still there</button>
          <button disabled={p.mine || !!vote} onClick={() => castVote('gone')} className={`btn py-2 ${vote === 'gone' ? 'bg-rose-500 text-white' : 'bg-rose-500/10 text-rose-300'} disabled:opacity-60`}><X size={14} /> Gone</button>
          <a href={maps} target="_blank" rel="noreferrer" className="btn bg-fg/5 py-2 text-slate-200"><Navigation size={14} /> Go</a>
        </div>
      </div>
    </motion.div>
  )
}

function SnapSheet({ onClose }: { onClose: () => void }) {
  const { s, set, reward, allow, toast } = useStore()
  const areas = AREAS[s.city] ?? AREAS.lefkosa
  const [f, setF] = useState({ title: '', price: '', was: '', free: false, store: '', area: areas[0], cat: 'Groceries' as PromoCat, days: 3, photo: '' })
  const [loc, setLoc] = useState<{ lat: number; lon: number } | null>(null)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const price = f.free ? 0 : +f.price
  const was = +f.was || undefined
  const off = was && price < was ? Math.round((1 - price / was) * 100) : 0
  const locate = () => navigator.geolocation?.getCurrentPosition((p) => setLoc({ lat: p.coords.latitude, lon: p.coords.longitude }), () => toast({ title: 'Location blocked. Area & shop name are enough', emoji: '📍' }), { enableHighAccuracy: true, timeout: 8000 })
  const post = () => {
    setErr('')
    const c = checkText(`${f.title} ${f.store}`)
    if (!c.ok) return setErr(c.scam ? `Blocked: ${c.scam}` : 'Please keep it respectful')
    if (was && price >= was) return setErr('The promo price should be lower than the normal price')
    if (s.myPromos.some((p) => p.title.toLowerCase() === f.title.trim().toLowerCase() && p.store.toLowerCase() === f.store.trim().toLowerCase() && Date.now() - p.ts < 86_400_000)) return setErr('You already posted this promo today')
    if (!allow('promo', `${f.title} ${f.store} ${price}`)) return
    const valid = new Date(); valid.setDate(valid.getDate() + f.days - 1)
    const p: Promo = { id: uid(), title: f.title.trim(), price, was, store: f.store.trim(), area: f.area, city: s.city, cat: f.cat, photo: f.photo, emoji: EMOJI[f.cat], lat: loc?.lat, lon: loc?.lon, validUntil: valid.toISOString().slice(0, 10), by: s.name, flag: '', ts: Date.now(), still: 0, gone: 0, mine: true }
    set((st) => ({ ...st, myPromos: [p, ...st.myPromos], points: st.points + PROMO_POINTS.post }))
    reward(s.quests.includes('promo') ? 10 : 30, { quest: 'promo', badge: 'spotter', title: `Promo shared! +${PROMO_POINTS.post} pts` })
    setDone(true)
  }
  return (
    <Sheet open onClose={onClose} title="📸 Snap a promo">
      {done ? <Success title="Shared with everyone 🔥" sub={`+${PROMO_POINTS.post} points now, +${PROMO_POINTS.confirm} each time a student confirms it's still there.`} onClose={onClose} /> : (
        <div className="flex flex-col gap-3">
          <label className={`relative grid h-40 cursor-pointer place-items-center overflow-hidden rounded-3xl border-2 border-dashed ${f.photo ? 'border-transparent' : 'border-fg/20'} bg-fg/[0.03]`}>
            {f.photo ? <img src={f.photo} alt="" className="size-full object-cover" /> : <span className="flex flex-col items-center gap-1 text-slate-400"><Camera size={30} /><span className="text-sm">Photo of the product & price tag</span></span>}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setF({ ...f, photo: await thumb(file, 640) }) }} />
          </label>
          <input className="input" placeholder="Product, e.g. Basmati rice 5kg" maxLength={50} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-slate-400">Promo price (₺)<input className="input" inputMode="decimal" disabled={f.free} placeholder={f.free ? 'FREE' : '0'} value={f.free ? '' : f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^\d.]/g, '') })} /></label>
            <label className="grid gap-1 text-xs text-slate-400">Normal price (optional)<input className="input" inputMode="decimal" placeholder="₺" value={f.was} onChange={(e) => setF({ ...f, was: e.target.value.replace(/[^\d.]/g, '') })} /></label>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setF({ ...f, free: !f.free })} className={`chip py-2 ${f.free ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>🆓 It's free</button>
            {off > 0 && <span className="chip bg-rose-500 py-2 text-white">−{off}%</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Shop name" maxLength={40} value={f.store} onChange={(e) => setF({ ...f, store: e.target.value })} />
            <select className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} aria-label="Area">{areas.map((a) => <option key={a}>{a}</option>)}</select>
          </div>
          <button onClick={locate} className={`chip w-fit py-2 ${loc ? 'bg-mint-400/15 text-mint-300' : 'bg-fg/5 text-slate-300'}`}><LocateFixed size={14} /> {loc ? 'Exact location added ✓' : 'Add my exact location (optional)'}</button>
          <div className="flex flex-wrap gap-2">{CATS.slice(1).map((c) => <button key={c} onClick={() => setF({ ...f, cat: c as PromoCat })} className={`chip py-1.5 ${f.cat === c ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{EMOJI[c as PromoCat]} {c}</button>)}</div>
          <div><p className="label mb-1">Promo ends</p><div className="flex gap-2">{[[1, 'Today'], [3, '3 days'], [7, '1 week']].map(([d, l]) => <button key={d} onClick={() => setF({ ...f, days: d as number })} className={`chip flex-1 justify-center py-2 ${f.days === d ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{l}</button>)}</div></div>
          {err && <p className="text-sm text-rose-300">⚠️ {err}</p>}
          <button className="btn-gold py-4" disabled={!f.photo || f.title.trim().length < 3 || f.store.trim().length < 2 || (!f.free && !(+f.price > 0))} onClick={post}><Camera size={18} /> Share promo · +{PROMO_POINTS.post} pts</button>
          <p className="text-center text-[11px] text-slate-500">Photo required so people can trust it. Fake prices get removed and lower your trust score.</p>
        </div>
      )}
    </Sheet>
  )
}

/** Demo: other students confirm your promos over time (+5 pts each). */
export function usePromoConfirms() {
  const { s, set, notify, reward } = useStore()
  useEffect(() => {
    const pending = s.myPromos.filter((p) => p.still < 3 && !expired(p))
    if (!pending.length) return
    const t = setInterval(() => {
      const p = pending.find((x) => Date.now() - x.ts > 8000 * (x.still + 1))
      if (!p) return
      set((st) => ({ ...st, points: st.points + PROMO_POINTS.confirm, myPromos: st.myPromos.map((x) => (x.id === p.id ? { ...x, still: x.still + 1 } : x)) }))
      notify('✅', `A student confirmed your promo "${p.title}" is still there. +${PROMO_POINTS.confirm} pts`, '/promos')
      const total = s.myPromos.reduce((a, x) => a + x.still, 0) + 1
      if (total >= 10 && !s.badges.includes('eagle_eye')) reward(50, { badge: 'eagle_eye', title: '10 confirmations on your promos!' })
    }, 2000)
    return () => clearInterval(t)
  }, [s.myPromos, s.badges, set, notify, reward])
}

/** Small horizontal strip for Home. */
export function PromoStrip() {
  const all = usePromos()
  const top = [...all].sort((a, b) => (isFree(b) ? 101 : pctOff(b)) - (isFree(a) ? 101 : pctOff(a))).slice(0, 6)
  if (!top.length) return null
  return (
    <section>
      <div className="mb-2 flex items-center justify-between"><p className="label">🔥 Promos near you</p><Link to="/promos" className="text-xs text-mint-300">See all · Snap one</Link></div>
      <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        {top.map((p) => (
          <Link key={p.id} to="/promos" className="w-36 shrink-0 overflow-hidden rounded-2xl border border-fg/10 bg-ink-800">
            <div className="relative grid h-20 place-items-center bg-gradient-to-br from-ink-600 to-ink-800 text-4xl">{p.photo ? <img src={p.photo} alt="" className="size-full object-cover" /> : p.emoji}
              {isFree(p) ? <span className="chip absolute start-1.5 top-1.5 bg-mint-400 py-0.5 text-[10px] text-ink-950">FREE</span> : pctOff(p) > 0 && <span className="chip absolute start-1.5 top-1.5 bg-rose-500 py-0.5 text-[10px] text-white">−{pctOff(p)}%</span>}</div>
            <div className="p-2"><p className="line-clamp-1 text-xs font-semibold">{p.title}</p><p className="text-sm font-extrabold">{isFree(p) ? 'FREE' : fmt(p.price, 'TRY')}</p><p className="line-clamp-1 text-[10px] text-slate-500">{p.store}</p></div>
          </Link>
        ))}
      </div>
    </section>
  )
}
