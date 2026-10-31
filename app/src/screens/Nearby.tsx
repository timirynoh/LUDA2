import { motion } from 'framer-motion'
import { Clock, Globe, Loader2, MessageCircle, Navigation, Phone, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Header } from '../components/ui'
import { CITIES } from '../lib/data'
import { CATEGORIES, findPlaces, samplePlaces, type Place } from '../lib/places'
import { useStore } from '../lib/store'

const wa = (phone: string) => {
  let d = phone.replace(/[^\d+]/g, '')
  if (d.startsWith('0')) d = '90' + d.slice(1)
  return `https://wa.me/${d.replace('+', '')}`
}

export default function Nearby() {
  const { s, set, t, reward } = useStore()
  const city = CITIES.find((c) => c.id === s.city)!
  const [params] = useSearchParams()
  const [cat, setCat] = useState(() => (CATEGORIES.some((c) => c.id === params.get('cat')) ? params.get('cat')! : 'food'))
  const [places, setPlaces] = useState<Place[]>([])
  const [state, setState] = useState<'loading' | 'ok' | 'offline'>('loading')
  const [q, setQ] = useState('')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setState('loading')
    findPlaces(cat, city.lat, city.lon)
      .then((p) => { if (alive) { setPlaces(p); setState('ok') } })
      .catch(() => { if (alive) { setPlaces(samplePlaces(cat, city.lat, city.lon)); setState('offline') } })
    return () => { alive = false }
  }, [cat, city.lat, city.lon, nonce])

  const contact = () => {
    const n = s.contacted + 1
    set((p) => ({ ...p, contacted: n }))
    if (n === 3) reward(60, { quest: 'explore', badge: 'explorer', title: 'Local explorer!' })
    else reward(5, { title: 'Supporting local' })
  }

  const list = places.filter((p) => !q || `${p.name} ${p.cuisine ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div>
      <Header title={t('near.title')} sub={`📍 ${city.name} · ${city.en}`}
        right={<select value={s.city} onChange={(e) => set((p) => ({ ...p, city: e.target.value }))} className="input w-auto py-2 text-sm">
          {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>} />
      <div className="px-5">
        <div className="relative">
          <Search size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input ps-11" placeholder="Search jollof, pizza, pharmacy…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto px-5 py-4">
        {CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)}
            className={`chip shrink-0 px-4 py-2.5 text-sm ${cat === c.id ? 'bg-gradient-to-r from-mint-400 to-emerald-500 text-ink-950' : 'glass text-slate-300'}`}>{c.emoji} {c.label}</button>
        ))}
      </div>

      <div className="flex flex-col gap-3 px-5">
        {state === 'loading' && <div className="flex flex-col items-center gap-3 py-16 text-slate-400"><Loader2 className="animate-spin text-mint-300" size={32} />{t('near.loading')}</div>}
        {state === 'offline' && (
          <div className="flex items-center gap-3 rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-200">
            Live directory unreachable — showing sample listings.
            <button onClick={() => setNonce(nonce + 1)} className="chip ms-auto bg-gold-400/20"><RefreshCw size={12} /> Retry</button>
          </div>
        )}
        {state !== 'loading' && !list.length && <p className="py-12 text-center text-sm text-slate-400">{t('near.none')}</p>}
        {state !== 'loading' && list.slice(0, 40).map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }} className="card">
            <div className="flex items-start gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-ink-600 to-ink-800 text-xl">{CATEGORIES.find((c) => c.id === cat)?.emoji}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{p.name} {p.sample && <span className="chip bg-fg/5 text-[10px] text-slate-400">sample</span>}</p>
                <p className="truncate text-xs capitalize text-slate-400">{p.cuisine || p.kind} · {p.km.toFixed(1)} km</p>
                {p.hours && <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-500"><Clock size={11} /> {p.hours}</p>}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <a href={p.phone ? `tel:${p.phone.split(';')[0]}` : undefined} onClick={p.phone ? contact : undefined}
                className={`btn py-2.5 ${p.phone ? 'bg-mint-400/15 text-mint-200' : 'pointer-events-none bg-fg/[0.03] text-slate-600'}`}><Phone size={14} /> {t('near.call')}</a>
              <a href={p.phone ? wa(p.phone.split(';')[0]) : undefined} target="_blank" rel="noreferrer" onClick={p.phone ? contact : undefined}
                className={`btn py-2.5 ${p.phone ? 'bg-emerald-500/15 text-emerald-200' : 'pointer-events-none bg-fg/[0.03] text-slate-600'}`}><MessageCircle size={14} /> {t('near.whatsapp')}</a>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`} target="_blank" rel="noreferrer"
                className="btn bg-fg/5 py-2.5 text-slate-200"><Navigation size={14} /> {t('near.directions')}</a>
            </div>
            {p.phone && <p className="mt-2 text-xs text-slate-500" dir="ltr">📞 {p.phone}</p>}
            {p.website && <a href={p.website} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 text-xs text-sky-300"><Globe size={11} /> Website / menu</a>}
          </motion.div>
        ))}
        <p className="py-2 text-center text-[11px] text-slate-600">Directory data © OpenStreetMap contributors</p>
      </div>
    </div>
  )
}
