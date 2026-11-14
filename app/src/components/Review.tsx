import { Star } from 'lucide-react'
import { useState } from 'react'
import { checkText } from '../lib/moderation'
import { REVIEW_TAGS } from '../lib/social'
import { useStore } from '../lib/store'
import { Sheet } from './ui'

export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return <span className="inline-flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={size} className={n <= Math.round(value) ? 'fill-gold-400 text-gold-400' : 'text-slate-600'} />)}</span>
}

/** Leave a review after a trade, job or purchase. One review per completed deal. */
export function ReviewSheet({ about, context, refId, onClose }: { about: string; context: string; refId: string; onClose: () => void }) {
  const { s, set, reward, allow, toast } = useStore()
  const done = s.reviews.some((r) => r.id === refId)
  const [stars, setStars] = useState(5)
  const [tags, setTags] = useState<string[]>([])
  const [text, setText] = useState('')
  const save = () => {
    if (text && !checkText(text).ok) return toast({ title: 'Please keep reviews respectful', emoji: '⚠️' })
    if (!allow('review')) return
    set((p) => ({ ...p, reviews: [{ id: refId, about, by: p.name, stars, text: text.trim(), tags, ts: Date.now(), context }, ...p.reviews] }))
    reward(15, { badge: 'critic', title: 'Thanks for your review ⭐' }); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={`Rate ${about}`}>
      {done ? <p className="py-6 text-center text-sm text-slate-400">You already reviewed this {context.toLowerCase()} ✓</p> : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-400">{context}: your honest review helps everyone trade safely.</p>
          <div className="flex justify-center gap-2">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setStars(n)} aria-label={`${n} stars`}><Star size={38} className={n <= stars ? 'fill-gold-400 text-gold-400' : 'text-slate-600'} /></button>)}</div>
          <div className="flex flex-wrap justify-center gap-2">{REVIEW_TAGS.map((t) => <button key={t} onClick={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])} className={`chip py-1.5 ${tags.includes(t) ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{t}</button>)}</div>
          <textarea className="input min-h-20" placeholder="Anything to add? (optional)" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn-primary py-4" onClick={save}>Post review</button>
        </div>
      )}
    </Sheet>
  )
}
