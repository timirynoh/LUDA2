// Home offer banners: a swipeable, auto-rotating carousel. Live banners come from Luda HQ (server); each one can be hidden with ✕.
import { ArrowRight, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { LIVE, api } from '../lib/live'

export interface Banner { id: string; title: string; body: string; cta: string; link: string; emoji: string; theme: string }
export const THEMES: Record<string, { bg: string; glow: string; name: string }> = {
  mint: { bg: 'from-emerald-400 via-teal-500 to-cyan-700', glow: 'bg-lime-200/40', name: 'Mint' },
  sunset: { bg: 'from-amber-400 via-orange-500 to-rose-600', glow: 'bg-yellow-200/40', name: 'Sunset' },
  ocean: { bg: 'from-sky-400 via-blue-600 to-indigo-800', glow: 'bg-cyan-200/40', name: 'Ocean' },
  grape: { bg: 'from-fuchsia-500 via-purple-600 to-indigo-800', glow: 'bg-pink-200/40', name: 'Grape' },
  gold: { bg: 'from-yellow-300 via-amber-500 to-orange-700', glow: 'bg-white/40', name: 'Gold' },
  night: { bg: 'from-slate-700 via-slate-800 to-ink-950', glow: 'bg-mint-400/30', name: 'Night' },
}
/** Luda's own offers (shown when the team hasn't posted any banners). Owner picked: bus tickets, bills, invite & savings. */
export const DEFAULT_BANNERS: Banner[] = [
  { id: 'd-bus', title: 'Skip the bus queue', body: 'Girne ⇄ Lefkoşa tickets on your phone. VirgoBus & Girneliler.', cta: 'Buy a ticket', link: '/transport', emoji: '🚌', theme: 'ocean' },
  { id: 'd-bills', title: 'Bills paid for you', body: 'KIB-TEK, water, internet, rent. Usually done within 2 hours.', cta: 'Pay a bill', link: '/bills', emoji: '⚡', theme: 'sunset' },
  { id: 'd-invite', title: 'Invite friends, earn ₺50', body: 'When they verify, you both get a bonus.', cta: 'Invite', link: '/invite', emoji: '🎁', theme: 'grape' },
  { id: 'd-save', title: 'Save for rent, stress-free', body: 'Lock money in a pot until the date you choose.', cta: 'Start saving', link: '/savings', emoji: '🐷', theme: 'mint' },
]
const HIDDEN = 'luda.bannersHidden'
const hidden = (): string[] => { try { return JSON.parse(localStorage.getItem(HIDDEN) ?? '[]') } catch { return [] } }

export function BannerCard({ b, onHide, preview }: { b: Banner; onHide?: () => void; preview?: boolean }) {
  const t = THEMES[b.theme] ?? THEMES.mint
  const inner = (
    <div className={`relative flex h-full min-h-[132px] items-center gap-3 overflow-hidden rounded-[1.75rem] bg-gradient-to-br ${t.bg} p-4 pe-10 text-white shadow-xl shadow-black/20`}>
      <div className={`pointer-events-none absolute -end-8 -top-10 size-36 rounded-full ${t.glow} blur-2xl`} />
      <div className="pointer-events-none absolute -bottom-12 start-1/3 size-28 rounded-full bg-white/10 blur-2xl" />
      <div className="relative min-w-0 flex-1">
        <p className="text-lg font-extrabold leading-tight drop-shadow-sm">{b.title}</p>
        {b.body && <p className="mt-1 line-clamp-2 text-xs text-white/85">{b.body}</p>}
        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-3.5 py-1.5 text-xs font-bold text-ink-950 shadow">{b.cta || 'Open'} <ArrowRight size={13} className="rtl:rotate-180" /></span>
      </div>
      <span className="relative shrink-0 text-5xl drop-shadow-lg" aria-hidden>{b.emoji}</span>
    </div>
  )
  return (
    <div className="relative h-full">
      {preview ? inner : <Link to={b.link} className="block h-full">{inner}</Link>}
      {onHide && <button onClick={onHide} aria-label="Hide this offer" className="absolute end-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-black/25 text-white/90 backdrop-blur hover:bg-black/40"><X size={14} /></button>}
    </div>
  )
}

export function HomeBanners() {
  const [server, setServer] = useState<Banner[] | null>(LIVE ? null : [])
  const [gone, setGone] = useState<string[]>(hidden)
  const [i, setI] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const paused = useRef(false)
  useEffect(() => { if (LIVE) api<{ banners: Banner[] }>('GET', 'banners').then((r) => setServer(r.banners)).catch(() => setServer([])) }, [])
  const list = useMemo(() => (server === null ? [] : (server.length ? server : DEFAULT_BANNERS)).filter((b) => !gone.includes(b.id)), [server, gone])
  useEffect(() => {
    if (list.length < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      const el = ref.current
      if (!el || paused.current || document.visibilityState !== 'visible') return
      const next = (Math.round(Math.abs(el.scrollLeft) / el.clientWidth) + 1) % list.length
      el.scrollTo({ left: (document.dir === 'rtl' ? -1 : 1) * next * el.clientWidth, behavior: 'smooth' })
    }, 5500)
    return () => clearInterval(t)
  }, [list.length])
  if (!list.length) return null
  const hide = (id: string) => { const n = [...gone, id]; setGone(n); try { localStorage.setItem(HIDDEN, JSON.stringify(n.slice(-50))) } catch { /* ignore */ } }
  return (
    <section aria-label="Offers" className="flex flex-col gap-2">
      <div ref={ref} onScroll={(e) => setI(Math.round(Math.abs(e.currentTarget.scrollLeft) / e.currentTarget.clientWidth))}
        onPointerDown={() => { paused.current = true }} onPointerUp={() => { setTimeout(() => { paused.current = false }, 4000) }}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((b) => <div key={b.id} className="w-full shrink-0 snap-center px-0.5"><BannerCard b={b} onHide={() => hide(b.id)} /></div>)}
      </div>
      {list.length > 1 && <div className="flex justify-center gap-1.5">{list.map((b, k) => <span key={b.id} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-mint-300' : 'w-1.5 bg-fg/20'}`} />)}</div>}
    </section>
  )
}
