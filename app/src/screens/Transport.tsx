import { motion } from 'framer-motion'
import { AlertTriangle, ArrowRight, Bus, Car, Clock, MapPin, Plane, Share2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DemoNote, Header, Segmented } from '../components/ui'
import { CITIES, SAFE_SPOTS } from '../lib/data'
import { useStore } from '../lib/store'
import { ERCAN, km, poolFor, routesFrom, taxiFare } from '../lib/transport'

type Tab = 'bus' | 'airport' | 'taxi'

export default function Transport() {
  const { t } = useStore()
  const [tab, setTab] = useState<Tab>('bus')
  return (
    <div>
      <Header back title={t('act.transport')} sub="Buses, airport & taxis" />
      <div className="px-5"><Segmented value={tab} onChange={setTab} options={[{ value: 'bus', label: '🚌 Buses' }, { value: 'airport', label: '✈️ Airport' }, { value: 'taxi', label: '🚕 Taxi' }]} /></div>
      {tab === 'bus' && <Buses />}
      {tab === 'airport' && <Airport />}
      {tab === 'taxi' && <Taxi />}
      <DemoNote />
    </div>
  )
}

function Buses() {
  const { s } = useStore()
  const routes = useMemo(() => routesFrom(s.city), [s.city])
  const city = CITIES.find((c) => c.id === s.city)!
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <p className="text-sm text-slate-400">Intercity buses & dolmuş from <b className="text-slate-200">{city.name}</b>. Pay the driver in cash (TL).</p>
      {routes.map((r, i) => (
        <motion.div key={r.to.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="card">
          <div className="flex items-center gap-2 font-semibold">{city.name} <ArrowRight size={14} className="text-slate-500 rtl:rotate-180" /> {r.to.name}<span className="ms-auto text-lg font-extrabold text-cyan-300">~₺{r.fare}</span></div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <span className="chip bg-fg/5 text-slate-300"><Clock size={11} /> ~{r.mins} min</span>
            <span className="chip bg-fg/5 text-slate-300"><Bus size={11} /> {r.every}</span>
            <span className="chip bg-fg/5 text-slate-300">{r.firstLast}</span>
          </div>
          <p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin size={11} /> From {r.from}</p>
        </motion.div>
      ))}
      <p className="text-center text-[11px] text-slate-500">Times and fares are estimates. Check at the terminal; live timetables come in the full version.</p>
    </div>
  )
}

function Airport() {
  const { s, reward } = useStore()
  const city = CITIES.find((c) => c.id === s.city)!
  const d = Math.round(km(city, ERCAN))
  const [date, setDate] = useState('')
  const [joined, setJoined] = useState(false)
  const riders = poolFor(city.name, date)
  const taxi = taxiFare(d)
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-cyan-500 via-sky-700 to-sky-950 p-5 text-white">
        <Plane className="absolute -right-2 -bottom-2 size-28 rotate-12 text-white/10" />
        <p className="text-xs text-cyan-100/80">{ERCAN.name} → {city.name}</p>
        <p className="text-3xl font-extrabold">~{d} km</p>
        <p className="text-sm text-cyan-50/80">≈ {Math.round(d / 55 * 60 + 10)} min by road</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="card"><Bus className="text-cyan-300" size={20} /><p className="mt-2 text-sm font-semibold">Airport shuttle</p><p className="text-xs text-slate-400">Timed to flights · ~₺{Math.round((60 + d * 1.5) / 10) * 10}</p></div>
        <div className="card"><Car className="text-gold-300" size={20} /><p className="mt-2 text-sm font-semibold">Taxi</p><p className="text-xs text-slate-400">~₺{taxi.toLocaleString()} · up to 4 people</p></div>
      </div>

      <div className="card">
        <p className="flex items-center gap-2 font-bold"><Users size={18} className="text-fuchsia-300" /> Split a taxi from the airport</p>
        <p className="mt-1 text-xs text-slate-400">Landing soon? Find verified Luda users on similar flights and share the ride.</p>
        <input type="date" className="input mt-3" value={date} onChange={(e) => { setDate(e.target.value); setJoined(false) }} />
        {date && (
          <div className="mt-3 flex flex-col gap-2">
            {riders.map((r) => (
              <div key={r.name} className="flex items-center gap-3 rounded-2xl bg-fg/[0.03] p-3 text-sm">
                <span className="text-xl">{r.flag}</span><span className="flex-1 font-semibold">{r.name}</span><span className="text-xs text-slate-400">lands {r.time} · {r.bags} bag{r.bags > 1 ? 's' : ''}</span>
              </div>
            ))}
            <p className="text-center text-xs text-slate-400">Shared 4 ways ≈ <b className="text-mint-300">₺{Math.round(taxi / 4)}</b> each instead of ₺{taxi}</p>
            <button className={joined ? 'btn-ghost' : 'btn-primary'} disabled={joined} onClick={() => { setJoined(true); reward(20, { title: 'Joined airport ride pool' }) }}>{joined ? '✓ You’re in the pool: we’ll match you' : 'Join the ride pool'}</button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-gold-300" />
        <span><b>Flying via Larnaca (south)?</b> You must cross into the Republic of Cyprus, and many African passports need a visa for that. Check before booking.</span>
      </div>
    </div>
  )
}

function Taxi() {
  const { s, toast } = useStore()
  const city = CITIES.find((c) => c.id === s.city)!
  const dests = useMemo(() => [
    ...(SAFE_SPOTS[s.city] ?? []).map((n, i) => ({ name: n.split('·')[0].trim(), d: 2 + i * 2.5 })),
    ...CITIES.filter((c) => c.id !== s.city).slice(0, 3).map((c) => ({ name: c.name, d: km(city, c) })),
    { name: 'Ercan Airport', d: km(city, ERCAN) },
  ], [s.city, city])
  const [dest, setDest] = useState(0)
  const [plate, setPlate] = useState('')
  const fare = taxiFare(dests[dest].d)
  const msg = `🚕 I'm in a taxi from ${city.name} to ${dests[dest].name}. Plate: ${plate || '—'}. Left at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Sent via Luda.`
  const share = async () => {
    try { await navigator.clipboard.writeText(msg); toast({ title: 'Trip details copied. Paste to a friend', emoji: '📋' }) }
    catch { toast({ title: 'Copy blocked. Use WhatsApp share', emoji: 'ℹ️' }) }
  }
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <div className="card">
        <p className="label mb-2">Fare estimate from {city.name}</p>
        <div className="flex flex-wrap gap-2">{dests.map((x, i) => <button key={x.name} onClick={() => setDest(i)} className={`chip py-2 ${dest === i ? 'bg-gold-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{x.name}</button>)}</div>
        <p className="mt-4 text-4xl font-extrabold">~₺{fare.toLocaleString()}</p>
        <p className="text-xs text-slate-400">{Math.round(dests[dest].d)} km · agree the price <b>before</b> you get in. Taxis in North Cyprus rarely use meters.</p>
      </div>
      <Link to="/nearby?cat=taxi" className="btn-gold"><Car size={18} /> Find taxi ranks near me</Link>
      <div className="card">
        <p className="flex items-center gap-2 font-bold"><Share2 size={18} className="text-mint-300" /> Share my trip (safety)</p>
        <p className="mt-1 text-xs text-slate-400">Send your route and the taxi's plate number to a friend before you ride.</p>
        <input className="input mt-3 uppercase" placeholder="Plate number, e.g. TAK 123" value={plate} onChange={(e) => setPlate(e.target.value)} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="btn-ghost text-sm" onClick={share}>Copy</button>
          <a className="btn-primary text-sm" href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
      </div>
    </div>
  )
}
