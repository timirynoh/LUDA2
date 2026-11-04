import { Search as SearchIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/ui'
import { ACTIONS } from '../lib/actions'
import { GROUPS } from '../lib/chat'
import { eventsFor } from '../lib/community'
import { SAFE_SPOTS } from '../lib/data'
import { AREAS, listingsFor } from '../lib/housing'
import { jobsFor } from '../lib/jobs'
import { useStore } from '../lib/store'
import { api, LIVE } from '../lib/live'

const EXTRA = [
  { label: 'Security Center', to: '/security', emoji: '🛡️', kw: 'freeze pin password lock safety' },
  { label: 'Help & Support', to: '/help', emoji: '💬', kw: 'faq contact problem support' },
  { label: 'Notifications', to: '/inbox', emoji: '🔔', kw: 'alerts inbox' },
  { label: 'Profile & settings', to: '/profile', emoji: '👤', kw: 'language theme city account' },
  { label: 'Residency portal', to: '/residency', emoji: '🪪', kw: 'ikamet permit visa immigration' },
  { label: 'Appeals & support cases', to: '/disputes', emoji: '🛡️', kw: 'dispute appeal case refund complaint' },
  { label: 'P2P exchange / my ad', to: LIVE ? '/exchange?tab=p2p' : '/chats?tab=exchange', emoji: '🏪', kw: 'exchanger merchant ad exchange p2p naira lira dollar' },
  ...(LIVE ? [{ label: 'Terms & Conditions', to: '/terms', emoji: '📄', kw: 'terms conditions rules privacy policy' }, { label: 'How to record proof', to: '/guide/p2p-proof', emoji: '📹', kw: 'proof video appeal record screen statement' }]
    : [{ label: 'Saved cards', to: '/wallet', emoji: '💳', kw: 'card bank visa mastercard' }]),
  { label: 'Notification settings', to: '/security', emoji: '🔔', kw: 'notification push alert' },
  { label: 'Daily spin', to: '/', emoji: '🎡', kw: 'spin wheel check-in daily reward' },
  { label: 'Promo Spotter', to: '/promos', emoji: '🔥', kw: 'promo discount cheap free sale market shop price' },
]

/** One search box for features, houses, jobs, events and groups. */
export default function Search() {
  const { s, t } = useStore()
  const [q, setQ] = useState('')
  // Live: houses, jobs, events, Flash jobs, Market items, groups and traders come from the server (real posts only).
  const [live, setLive] = useState<{ type: string; emoji: string; label: string; to: string }[]>([])
  useEffect(() => {
    if (!LIVE) return
    const term = q.trim()
    if (term.length < 2) { setLive([]); return }
    const t = setTimeout(() => {
      api<{ posts: { id: string; kind: string; title: string }[]; flash: { id: string; title: string; reward: number }[]; market: { id: string; title: string; price: number }[]; groups: { id: string; name: string; emoji: string }[]; people: { username: string; name: string; verified: boolean }[] }>('GET', `search?q=${encodeURIComponent(term)}`)
        .then((r) => {
          const K: Record<string, [string, string, string]> = { housing: ['Home', '🏠', '/housing'], job: ['Job', '💼', '/jobs'], event: ['Event', '🎉', '/community'], news: ['News', '📰', '/news'], promo: ['Deal', '🔥', '/promos'], place: ['Place', '📍', '/places'] }
          setLive([
            ...r.posts.map((x) => ({ type: K[x.kind]?.[0] ?? 'Post', emoji: K[x.kind]?.[1] ?? '📌', label: x.title, to: K[x.kind]?.[2] ?? '/' })),
            ...r.flash.map((x) => ({ type: 'Flash job', emoji: '⚡', label: `${x.title} · ₺${(x.reward / 100).toLocaleString('en-US')}`, to: '/flash' })),
            ...r.market.map((x) => ({ type: 'Market', emoji: '🛍️', label: `${x.title} · ₺${(x.price / 100).toLocaleString('en-US')}`, to: '/market' })),
            ...r.groups.map((x) => ({ type: 'Group', emoji: x.emoji, label: x.name, to: `/chats/${x.id}` })),
            ...r.people.map((x) => ({ type: 'Trader', emoji: x.verified ? '✅' : '👤', label: `${x.name} @${x.username}`, to: `/u/${x.username}` })),
          ])
        }).catch(() => setLive([]))
    }, 300)
    return () => clearTimeout(t)
  }, [q])
  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    const areas = AREAS[s.city] ?? AREAS.lefkosa
    const has = (...x: (string | undefined)[]) => x.join(' ').toLowerCase().includes(term)
    return [
      ...ACTIONS.filter((a) => !a.admin && has(t(a.key), a.id)).map((a) => ({ type: 'Feature', emoji: '✨', label: t(a.key), to: a.to })),
      ...EXTRA.filter((e) => has(e.label, e.kw)).map((e) => ({ type: 'Feature', emoji: e.emoji, label: e.label, to: e.to })),
      ...(LIVE ? [] : listingsFor(s.city).filter((l) => has(l.title, l.area, l.type)).map((l) => ({ type: 'Home', emoji: l.emoji, label: `${l.title} · ${l.area} · £${l.price}`, to: '/housing' }))),
      ...(LIVE ? [] : jobsFor(s.city, areas).filter((j) => has(j.title, j.company, j.cat)).map((j) => ({ type: 'Job', emoji: j.emoji, label: `${j.title} · ${j.company}`, to: '/jobs' }))),
      ...(LIVE ? [] : eventsFor(s.city, (SAFE_SPOTS[s.city] ?? SAFE_SPOTS.lefkosa)[0]).filter((e) => has(e.title, e.cat, e.organiser)).map((e) => ({ type: 'Event', emoji: e.emoji, label: e.title, to: '/community' }))),
      ...(LIVE ? [] : GROUPS.filter((g) => has(g.name, g.desc, g.cat)).map((g) => ({ type: 'Group', emoji: g.emoji, label: g.name, to: `/chats/${g.id}` }))),
      ...live,
    ].slice(0, 40)
  }, [q, s.city, t, live])
  return (
    <div>
      <Header back title="Search" />
      <div className="flex flex-col gap-3 px-5">
        <div className="relative"><SearchIcon size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input autoFocus className="input ps-11 text-base" placeholder="Rooms, jobs, bills, chats, residency…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {!q && <div className="flex flex-wrap gap-2">{['room', 'barista', 'electricity', 'naira', 'football', 'residency', 'ticket'].map((x) => <button key={x} onClick={() => setQ(x)} className="chip bg-fg/5 py-2 text-slate-300">{x}</button>)}</div>}
        {results.map((r, i) => (
          <Link key={i} to={r.to} className="card flex items-center gap-3 py-3">
            <span className="text-2xl">{r.emoji}</span><span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.label}</span><span className="chip bg-fg/5 text-slate-400">{r.type}</span>
          </Link>
        ))}
        {q.trim().length >= 2 && !results.length && <p className="card text-center text-sm text-slate-400">Nothing found for “{q}”.</p>}
      </div>
    </div>
  )
}
