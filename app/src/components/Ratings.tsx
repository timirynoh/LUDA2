// Ratings (v1.18.0, owner: 'rate after cases are done, professionally; reopen if not okay').
// Support cases and bills paid by Luda: 1–5 stars + quick tags + comment. Market & Flash: 👍/👎 for the other person
// (shown on their profile). Everything is checked and stored on the server; this file only shows and sends.
import { Loader2, RotateCcw, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, LIVE } from '../lib/live'
import { useStore } from '../lib/store'
import { errMsg } from './LiveMoney'
import { NewCaseSheet } from './LiveSupport'
import { Sheet } from './ui'

export type RateKind = 'case' | 'bill' | 'market' | 'flash'
export interface MyRating { kind: RateKind; ref: string; stars: number | null; good: boolean | null; tags: string[]; body: string }
type Pending = Record<'cases' | 'bills' | 'market' | 'flash', { id: string; subject?: string; provider?: string; title?: string; other?: string }[]>

/** Quick tags (same list as the server's RATE_TAGS). First half = good, second half = not good. */
export const RATE_TAGS: Record<RateKind, { good: [string, string][]; bad: [string, string][] }> = {
  case: { good: [['fast', '⚡ Fast'], ['helpful', '🙌 Helpful'], ['polite', '😊 Polite'], ['clear', '💡 Clear answer'], ['solved', '✅ Solved it']], bad: [['slow', '🐢 Slow'], ['not_solved', '❌ Not solved'], ['unclear', '😕 Unclear'], ['unhelpful', '👎 Unhelpful']] },
  bill: { good: [['fast', '⚡ Fast'], ['correct', '✅ Correct amount'], ['clear_receipt', '🧾 Clear receipt'], ['easy', '👌 Easy']], bad: [['slow', '🐢 Slow'], ['wrong_amount', '❌ Wrong amount'], ['no_receipt', '🧾 No receipt'], ['confusing', '😕 Confusing']] },
  market: { good: [['friendly', '😊 Friendly'], ['on_time', '⏰ On time'], ['as_described', '✅ As described'], ['smooth', '👌 Smooth']], bad: [['late', '🐢 Late'], ['no_show', '🚫 Didn’t show up'], ['not_as_described', '❌ Not as described'], ['rude', '😠 Rude']] },
  flash: { good: [['friendly', '😊 Friendly'], ['on_time', '⏰ On time'], ['good_work', '💪🏿 Great work'], ['smooth', '👌 Smooth']], bad: [['late', '🐢 Late'], ['no_show', '🚫 Didn’t show up'], ['poor_work', '❌ Poor work'], ['rude', '😠 Rude']] },
}
const STAR_WORD = ['', 'Terrible', 'Bad', 'Okay', 'Good', 'Excellent']
export const tagLabel = (kind: RateKind, t: string) => [...RATE_TAGS[kind].good, ...RATE_TAGS[kind].bad].find((x) => x[0] === t)?.[1] ?? t

/** The person's own ratings + what's waiting to be rated (shared by every page; refreshed on 'luda:ratings'). */
let cache: { ratings: MyRating[]; pending: Pending } | null = null
export function useMyRatings() {
  const [data, setData] = useState(cache)
  const load = useCallback(async () => {
    if (!LIVE) return
    try { cache = await api<{ ratings: MyRating[]; pending: Pending }>('GET', 'ratings-mine'); setData(cache) } catch { /* offline: keep what we had */ }
  }, [])
  useEffect(() => {
    if (!cache) void load()
    const on = () => void load()
    window.addEventListener('luda:ratings', on)
    return () => window.removeEventListener('luda:ratings', on)
  }, [load])
  const find = (kind: RateKind, ref: string) => data?.ratings.find((r) => r.kind === kind && r.ref === ref) ?? null
  return { data, find, load }
}

export function StarsView({ n, size = 14 }: { n: number; size?: number }) {
  return <span className="inline-flex gap-0.5 align-middle" aria-label={`${n} of 5`}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={i <= n ? 'fill-gold-400 text-gold-400' : 'text-slate-600'} />)}</span>
}

function StarsInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" aria-label={`${i} stars`} onClick={() => onChange(i)} className="rounded-xl p-1 transition active:scale-90">
            <Star size={38} className={i <= value ? 'fill-gold-400 text-gold-400 drop-shadow-[0_4px_12px_rgba(251,191,36,.45)]' : 'text-slate-600'} />
          </button>
        ))}
      </div>
      <p className="h-5 text-sm font-semibold text-gold-200">{STAR_WORD[value]}</p>
    </div>
  )
}

/** The rating pop-up. Low marks offer the next step: reopen the case, or report a problem. */
export function RateSheet({ kind, refId, title, sub, initial, onClose, onSaved }: {
  kind: RateKind; refId: string; title: string; sub?: string; initial?: MyRating | null; onClose: () => void; onSaved?: () => void
}) {
  const { toast } = useStore()
  const people = kind === 'market' || kind === 'flash'
  const [stars, setStars] = useState(initial?.stars ?? 0)
  const [good, setGood] = useState<boolean | null>(initial?.good ?? null)
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [body, setBody] = useState(initial?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [next, setNext] = useState<'reopen' | 'report' | null>(null)
  const low = people ? good === false : stars > 0 && stars <= 2
  const chosen = people ? good !== null : stars > 0
  const options = people ? (good === null ? [] : good ? RATE_TAGS[kind].good : RATE_TAGS[kind].bad) : stars === 0 ? [] : stars >= 4 ? RATE_TAGS[kind].good : stars <= 2 ? RATE_TAGS[kind].bad : [...RATE_TAGS[kind].good, ...RATE_TAGS[kind].bad]
  const pickStars = (n: number) => { setStars(n); setTags([]) }
  const pickGood = (g: boolean) => { setGood(g); setTags([]) }
  const save = async (then?: 'reopen' | 'report') => {
    setBusy(true); setErr('')
    try {
      await api('POST', 'rate', { kind, ref: refId, ...(people ? { good } : { stars }), tags, body })
      window.dispatchEvent(new Event('luda:ratings')); window.dispatchEvent(new Event('luda:todo'))
      onSaved?.()
      if (then) setNext(then)
      else { toast({ title: 'Thanks for your rating', emoji: '⭐' }); onClose() }
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  if (next === 'reopen') return <ReopenSheet caseId={refId} onClose={onClose} />
  if (next === 'report') return <NewCaseSheet category={kind === 'bill' ? 'payment' : 'other'} reference={refId} subject={kind === 'bill' ? 'Problem with my bill payment' : `Problem with ${title.replace(/^How (was|did) /, '').replace(/\?$/, '')}`} onClose={onClose} />
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        {sub && <p className="text-center text-sm text-slate-400">{sub}</p>}
        {people ? (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => pickGood(true)} className={`flex flex-col items-center gap-1 rounded-3xl py-5 font-semibold transition ${good === true ? 'bg-mint-400/20 text-mint-200 ring-2 ring-mint-400/60' : 'glass text-slate-300'}`}><ThumbsUp size={30} />Good</button>
            <button onClick={() => pickGood(false)} className={`flex flex-col items-center gap-1 rounded-3xl py-5 font-semibold transition ${good === false ? 'bg-rose-500/20 text-rose-200 ring-2 ring-rose-400/60' : 'glass text-slate-300'}`}><ThumbsDown size={30} />Not good</button>
          </div>
        ) : <StarsInput value={stars} onChange={pickStars} />}
        {options.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{low ? 'What went wrong?' : 'What stood out?'}</p>
            <div className="flex flex-wrap gap-2">
              {options.map(([k, label]) => (
                <button key={k} onClick={() => setTags(tags.includes(k) ? tags.filter((x) => x !== k) : [...tags, k])}
                  className={`chip px-3 py-2 text-xs font-semibold ${tags.includes(k) ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/50' : 'bg-fg/5 text-slate-300'}`}>{label}</button>
              ))}
            </div>
          </div>
        )}
        {chosen && <textarea className="input min-h-20" maxLength={300} placeholder={people ? 'A short review others will see (optional)' : 'Anything else to tell the team? (optional)'} value={body} onChange={(e) => setBody(e.target.value)} />}
        {people && chosen && <p className="-mt-2 text-[11px] text-slate-500">Your review shows on their Luda profile with your username.</p>}
        {err && <p className="text-sm text-rose-300">{err}</p>}
        {low && kind === 'case' && (
          <div className="rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100">
            <p className="font-semibold">Not solved?</p>
            <p className="mt-0.5">Send your rating and reopen the case: the same team member picks it up again with your note.</p>
            <button className="btn mt-2 w-full bg-gold-400 py-2.5 text-sm font-bold text-ink-950" disabled={busy} onClick={() => void save('reopen')}><RotateCcw size={15} /> Send rating & reopen the case</button>
          </div>
        )}
        {low && kind !== 'case' && (
          <div className="rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-100">
            <p>{kind === 'bill' ? 'Something wrong with this payment?' : 'Something went wrong?'} The Luda team can look into it.</p>
            <button className="btn mt-2 w-full bg-rose-500/80 py-2.5 text-sm font-bold text-white" disabled={busy} onClick={() => void save('report')}>Send rating & report a problem</button>
          </div>
        )}
        <button className="btn-primary py-3.5" disabled={busy || !chosen} onClick={() => void save()}>{busy && <Loader2 size={16} className="animate-spin" />} {initial ? 'Update rating' : 'Send rating'}</button>
      </div>
    </Sheet>
  )
}

/** Reopen a closed case with a note (server rules: within 7 days, twice at most). */
export function ReopenSheet({ caseId, onClose, onDone }: { caseId: string; onClose: () => void; onDone?: () => void }) {
  const { toast } = useStore()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    try {
      await api('POST', 'case-reopen', { caseId, reason })
      toast({ title: 'Case reopened. The Luda team will reply here', emoji: '🔁' })
      window.dispatchEvent(new Event('luda:cases')); window.dispatchEvent(new Event('luda:todo'))
      onDone?.(); onClose()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title="Reopen this case">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-400">Tell the team what is still wrong. You can reopen a case within 7 days of it being closed, up to 2 times.</p>
        <textarea className="input min-h-28" maxLength={500} placeholder="What is still not right?" value={reason} onChange={(e) => setReason(e.target.value)} />
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-3.5" disabled={busy || reason.trim().length < 5} onClick={() => void go()}>{busy && <Loader2 size={16} className="animate-spin" />}<RotateCcw size={16} /> Reopen the case</button>
      </div>
    </Sheet>
  )
}

/** Small row under a finished item: "⭐ Rate @kwame" or "You rated 👍 · Edit". */
export function RateButton({ kind, refId, title, sub }: { kind: RateKind; refId: string; title: string; sub?: string }) {
  const { find } = useMyRatings()
  const [open, setOpen] = useState(false)
  if (!LIVE) return null
  const r = find(kind, refId)
  return (
    <>
      {r ? (
        <button className="flex items-center gap-2 self-start rounded-full bg-fg/5 px-3 py-1.5 text-xs text-slate-300" onClick={() => setOpen(true)}>
          You rated {r.stars ? <StarsView n={r.stars} size={12} /> : r.good ? '👍' : '👎'} <span className="text-mint-300">Edit</span>
        </button>
      ) : (
        <button className="flex items-center justify-center gap-2 rounded-2xl bg-gold-400/15 py-2.5 text-sm font-semibold text-gold-200 ring-1 ring-gold-400/30" onClick={() => setOpen(true)}>
          <Star size={15} className="fill-gold-400 text-gold-400" /> {title}
        </button>
      )}
      {open && <RateSheet kind={kind} refId={refId} title={title} sub={sub} initial={r} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Opens the rating pop-up from links like /help?rate=case:<id> (To do items and notifications). */
export function RateFromLink() {
  const loc = useLocation(), nav = useNavigate()
  const { data, find, load } = useMyRatings()
  const raw = new URLSearchParams(loc.search).get('rate') ?? ''
  const [kind, refId] = raw.split(':') as [RateKind, string]
  useEffect(() => { if (raw && LIVE) void load() }, [raw, load])
  if (!LIVE || !raw || !RATE_TAGS[kind] || !/^[0-9a-f-]{36}$/.test(refId ?? '')) return null
  const close = () => { const q = new URLSearchParams(loc.search); q.delete('rate'); nav({ pathname: loc.pathname, search: q.toString() ? `?${q}` : '' }, { replace: true }) }
  const p = data?.pending
  const item = kind === 'case' ? p?.cases.find((x) => x.id === refId) : kind === 'bill' ? p?.bills.find((x) => x.id === refId) : kind === 'market' ? p?.market.find((x) => x.id === refId) : p?.flash.find((x) => x.id === refId)
  if (!data) return null
  const title = kind === 'case' ? 'How did the Luda team do?' : kind === 'bill' ? 'How was your bill payment?' : item?.other ? `How was @${item.other}?` : 'How did it go?'
  const sub = item?.subject ?? item?.provider ?? item?.title
  return <RateSheet kind={kind} refId={refId} title={title} sub={sub} initial={find(kind, refId)} onClose={close} />
}
