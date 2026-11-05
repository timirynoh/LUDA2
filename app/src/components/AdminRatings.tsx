// Luda HQ → Ratings (v1.18.0): how people rate the team (cases, bills) and each other (Market, Flash).
// Low ratings come first to follow up. Admin is English-only (owner's rule).
import { Loader2, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/live'
import { errMsg } from './LiveMoney'
import { StarsView, tagLabel, type RateKind } from './Ratings'

interface Item { id: number; kind: RateKind; ref: string; stars: number | null; good: boolean | null; tags: string[]; body: string; staff: string | null; by: string; target: string | null; at: string; low: boolean; title: string | null; caseStatus: string | null }
interface Data { days: number; summary: Partial<Record<RateKind, { n: number; avg: number | null; good: number; bad: number; low: number }>>; staff: { staff: string; n: number; avg: number }[]; reopened: number; items: Item[] }
const KIND: Record<RateKind, string> = { case: '💬 Support cases', bill: '🧾 Bills', market: '🛍️ Market', flash: '⚡ Flash' }

export function RatingsTab() {
  const [days, setDays] = useState(30)
  const [show, setShow] = useState<'low' | 'all' | RateKind>('low')
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => { try { setData(await api<Data>('GET', `admin-ratings?days=${days}`)); setErr('') } catch (e) { setErr(errMsg(e)) } }, [days])
  useEffect(() => { void load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect
  if (err) return <p className="text-sm text-rose-300">{err}</p>
  if (!data) return <Loader2 className="mx-auto animate-spin text-slate-500" />
  const s = data.summary
  const pct = (k: 'market' | 'flash') => { const x = s[k]; return x && x.good + x.bad ? Math.round((x.good / (x.good + x.bad)) * 100) : null }
  const list = data.items.filter((i) => show === 'all' ? true : show === 'low' ? i.low : i.kind === show)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto">
        {[7, 30, 90, 365].map((d) => <button key={d} onClick={() => setDays(d)} className={`chip shrink-0 px-3 py-2 text-xs ${days === d ? 'bg-mint-400 text-ink-950' : 'glass text-slate-300'}`}>{d === 365 ? '1 year' : `${d} days`}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['case', 'bill'] as const).map((k) => (
          <div key={k} className="card py-3">
            <p className="text-xs text-slate-400">{KIND[k]}</p>
            <p className="mt-1 text-2xl font-extrabold">{s[k]?.avg != null ? Number(s[k]!.avg).toFixed(1) : '–'} <span className="text-sm text-gold-300">★</span></p>
            <p className="text-[11px] text-slate-500">{s[k]?.n ?? 0} ratings · {s[k]?.low ?? 0} low</p>
          </div>
        ))}
        {(['market', 'flash'] as const).map((k) => (
          <div key={k} className="card py-3">
            <p className="text-xs text-slate-400">{KIND[k]}</p>
            <p className="mt-1 text-2xl font-extrabold">{pct(k) != null ? `${pct(k)}%` : '–'} <span className="text-sm">👍</span></p>
            <p className="text-[11px] text-slate-500">👍 {s[k]?.good ?? 0} · 👎 {s[k]?.bad ?? 0}</p>
          </div>
        ))}
      </div>
      <div className="card py-3">
        <div className="flex items-center justify-between"><p className="text-sm font-semibold">Team</p><p className="text-xs text-slate-400">🔁 {data.reopened} case{data.reopened === 1 ? '' : 's'} reopened</p></div>
        {data.staff.length ? data.staff.map((m) => (
          <div key={m.staff} className="mt-2 flex items-center gap-2 text-sm"><span className="flex-1">@{m.staff}</span><StarsView n={Math.round(Number(m.avg))} /><span className="w-10 text-end text-xs text-slate-400">{Number(m.avg).toFixed(1)}</span><span className="w-12 text-end text-xs text-slate-500">{m.n}×</span></div>
        )) : <p className="mt-1 text-xs text-slate-500">No team ratings yet.</p>}
      </div>
      <div className="flex gap-2 overflow-x-auto">
        {([['low', '⚠️ Low first'], ['all', 'All'], ['case', 'Cases'], ['bill', 'Bills'], ['market', 'Market'], ['flash', 'Flash']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setShow(v)} className={`chip shrink-0 px-3 py-2 text-xs ${show === v ? 'bg-mint-400 text-ink-950' : 'glass text-slate-300'}`}>{l}</button>
        ))}
      </div>
      {list.length === 0 && <p className="card text-center text-sm text-slate-400">{show === 'low' ? 'No low ratings in this period 🎉' : 'No ratings yet.'}</p>}
      {list.map((i) => (
        <div key={i.id} className={`card flex flex-col gap-1.5 py-3 ${i.low ? 'ring-1 ring-rose-400/40' : ''}`}>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{KIND[i.kind]}</span>
            <span className="ms-auto">{i.stars ? <StarsView n={i.stars} /> : i.good ? <ThumbsUp size={16} className="text-mint-300" /> : <ThumbsDown size={16} className="text-rose-300" />}</span>
          </div>
          {i.title && <p className="truncate text-sm font-semibold">{i.title}</p>}
          {i.tags.length > 0 && <div className="flex flex-wrap gap-1">{i.tags.map((t) => <span key={t} className="chip bg-fg/5 px-2 py-0.5 text-[10px] text-slate-300">{tagLabel(i.kind, t)}</span>)}</div>}
          {i.body && <p className="text-sm text-slate-200">“{i.body}”</p>}
          <p className="text-[11px] text-slate-500">
            by @{i.by}{i.target ? ` about @${i.target}` : ''}{i.staff ? ` · handled by @${i.staff}` : ''}{i.caseStatus ? ` · case ${i.caseStatus === 'open' || i.caseStatus === 'waiting_user' ? 'reopened' : i.caseStatus}` : ''} · {new Date(i.at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  )
}
