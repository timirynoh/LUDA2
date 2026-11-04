// Live: a gentle reminder for people who haven't verified their ID yet: "there are paid jobs / offers waiting for you".
// Owner's rule 8 (no nagging): at most once per visit, never on the first visit (the tour shows then), and
// "Don't remind me" turns it off for good.
import { AnimatePresence, motion } from 'framer-motion'
import { ShieldCheck, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LIVE, api } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { useStore } from '../lib/store'

const OFF = 'luda.oppNudge', SEEN = 'luda.oppNudgeSeen'

export function OpportunityNudge() {
  const { s } = useStore()
  const { me } = useLive()
  const [counts, setCounts] = useState<{ jobs: number; posts: number; deals: number; p2p: number } | null>(null)
  const [show, setShow] = useState(false)
  const unverified = LIVE && !!me && me.profile.kyc !== 'verified'
  useEffect(() => {
    if (!unverified || !s.toured) return
    try { if (localStorage.getItem(OFF) || sessionStorage.getItem(SEEN)) return } catch { return }
    let alive = true
    Promise.all([
      api<{ open: unknown[] }>('GET', 'flash').then((r) => r.open.length).catch(() => 0),
      api<{ items: unknown[] }>('GET', 'board?kind=job').then((r) => r.items.length).catch(() => 0),
      api<{ items: unknown[] }>('GET', 'board?kind=promo').then((r) => r.items.length).catch(() => 0),
      api<{ ads: unknown[] }>('GET', 'p2p?want=buy').then((r) => r.ads.length).catch(() => 0),
    ]).then(([jobs, posts, deals, p2p]) => {
      if (!alive || jobs + posts + deals + p2p === 0) return
      setCounts({ jobs, posts, deals, p2p })
      const t = setTimeout(() => { setShow(true); try { sessionStorage.setItem(SEEN, '1') } catch { /* ignore */ } }, 7000)
      return () => clearTimeout(t)
    })
    return () => { alive = false }
  }, [unverified, s.toured])
  if (!counts) return null
  const close = (forever: boolean) => { setShow(false); if (forever) try { localStorage.setItem(OFF, '1') } catch { /* ignore */ } }
  const lines = [
    counts.jobs + counts.posts > 0 && `💼 Jobs you could take: ${counts.jobs + counts.posts}`,
    counts.p2p > 0 && `🤝 P2P offers to get lira: ${counts.p2p}`,
    counts.deals > 0 && `🔥 Deals near you: ${counts.deals}`,
  ].filter(Boolean) as string[]
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          className="fixed inset-x-0 bottom-24 z-50 mx-auto w-[min(92vw,26rem)] rounded-3xl border border-mint-400/30 bg-ink-900/95 p-4 shadow-2xl backdrop-blur-xl" role="dialog" aria-label="Opportunities waiting">
          <button onClick={() => close(false)} aria-label="Close" className="absolute end-3 top-3 grid size-8 place-items-center rounded-full bg-fg/[0.06]"><X size={15} /></button>
          <p className="flex items-center gap-2 pe-8 font-bold"><ShieldCheck size={18} className="text-mint-300" /> Opportunities are waiting for you</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-slate-300">{lines.map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-2 text-xs text-slate-400">Verify your ID once (about 2 minutes) to take jobs, trade P2P and get paid.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button className="btn-ghost py-2.5 text-xs" onClick={() => close(true)}>Don't remind me</button>
            <Link to="/wallet" onClick={() => close(false)} className="btn-primary py-2.5 text-xs">Verify now</Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
