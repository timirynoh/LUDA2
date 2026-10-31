import { AnimatePresence, motion } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { FlashBubble, useFlashFeed } from '../screens/Flash'

/** Story-style bubble row of live help requests nearby. */
export function FlashBubbles() {
  const { t } = useStore()
  const { all } = useFlashFeed()
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <p className="label flex items-center gap-1">⚡ {t('act.flash')} nearby</p>
        <Link to="/flash" className="text-xs text-mint-300">See all</Link>
      </div>
      <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
        <Link to="/flash?new=1" className="flex w-[72px] shrink-0 flex-col items-center gap-1 text-center">
          <div className="grid size-[72px] place-items-center rounded-full border-2 border-dashed border-gold-400/60 bg-gold-400/10 text-gold-300"><Plus size={26} /></div>
          <span className="text-[11px] font-semibold text-gold-300">Need help?</span>
        </Link>
        {all.slice(0, 10).map((f, i) => (
          <motion.div key={f.id} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05, type: 'spring' }}>
            <Link to={`/flash?id=${f.id}`} className="flex w-[72px] shrink-0 flex-col items-center gap-1 text-center">
              <FlashBubble f={f} />
              <span className="line-clamp-1 w-full text-[11px] text-slate-300">{f.mine ? 'You' : f.from}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

/** A gentle "flash" pop-up that slides in every so often with a new request nearby. */
export function FlashPop() {
  const { others } = useFlashFeed()
  const nav = useNavigate()
  const [i, setI] = useState(-1)
  const [closed, setClosed] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (closed || !others.length) return
    const first = window.setTimeout(() => setI(0), 4000)
    timer.current = window.setInterval(() => setI((x) => (x + 1) % (others.length * 2)), 9000)
    return () => { clearTimeout(first); clearInterval(timer.current) }
  }, [closed, others.length])
  const f = i >= 0 && i % 2 === 0 ? others[(i / 2) % others.length] : null // show, then hide, alternating
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-30 mx-auto flex max-w-md justify-center px-4">
      <AnimatePresence>
        {f && !closed && (
          <motion.div key={f.id} initial={{ y: 80, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', damping: 18 }}
            className="pointer-events-auto flex w-full items-center gap-3 rounded-full border border-gold-400/30 bg-ink-800/95 py-1.5 ps-1.5 pe-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => nav(`/flash?id=${f.id}`)}>
              <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-yellow-300 to-orange-500 text-xl">
                {f.emoji}<span className="absolute -top-0.5 -right-0.5 size-3 animate-ping rounded-full bg-rose-500" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{f.flag} {f.from} needs help{f.budget ? ` · ₺${f.budget}` : ''}</span>
                <span className="block truncate text-xs text-slate-400">{f.text}</span>
              </span>
            </button>
            <button onClick={() => setClosed(true)} className="text-slate-500" aria-label="Hide flash alerts"><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
