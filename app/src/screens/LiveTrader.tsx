// Live trader profile (/u/:name): everything comes from the server — real completed orders, completion rate,
// release/send speed and reviews. Nothing here is typed by the person themselves.
import { Ban, BadgeCheck, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errMsg } from '../components/LiveMoney'
import { Header } from '../components/ui'
import { Presence } from '../components/Presence'
import { COUNTRIES } from '../lib/data'
import { api } from '../lib/live'

interface Trader {
  username: string; name: string; verified: boolean; country: string | null; since: string; ads: number; blocked: boolean; me: boolean; lastSeen?: string | null
  stats: { trades: number; rate: number | null; good?: number; bad?: number; releaseMin?: number | null; sendMin?: number | null }
  reviews: { good: boolean; body: string; at: string; by: string }[]
}

export function LiveTrader() {
  const { name = '' } = useParams()
  const [t, setT] = useState<Trader | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => { api<{ trader: Trader }>('GET', `trader?u=${encodeURIComponent(name)}`).then((r) => setT(r.trader)).catch((e) => setErr(errMsg(e))) }, [name])
  useEffect(() => { load() }, [load])
  if (!t) return <div><Header back title="Profile" /><p className="px-6 pt-10 text-center text-sm text-slate-400">{err || 'Loading…'}</p></div>
  const c = COUNTRIES.find((x) => x.code === t.country)
  const block = async (on: boolean) => { setBusy(true); try { await api('POST', 'p2p-block', { username: t.username, on }); load() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) } }
  const st = t.stats
  return (
    <div className="pb-10">
      <Header back title={t.name} sub={`@${t.username}`} />
      <div className="flex flex-col gap-3 px-5">
        <div className="card flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-violet-400/40 to-indigo-700/50 text-2xl font-extrabold">{t.name.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-lg font-bold">{t.name} {t.verified && <BadgeCheck size={18} className="text-mint-300" />}</p>
            <p className="text-xs text-slate-400">{c ? `${c.flag} ${c.name} · ` : ''}{`On Luda since ${new Date(t.since).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`}</p>
            <p className="text-xs text-slate-400">{t.verified ? 'ID verified' : 'ID not verified yet'}</p>
            {!t.me && <Presence at={t.lastSeen ?? null} />}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="card px-2 py-3"><p className="text-xl font-extrabold">{st.trades}</p><p className="text-[11px] text-slate-400">P2P trades</p></div>
          <div className="card px-2 py-3"><p className="text-xl font-extrabold">{st.rate == null ? '—' : `${st.rate}%`}</p><p className="text-[11px] text-slate-400">Completed</p></div>
          <div className="card px-2 py-3"><p className="text-xl font-extrabold">👍 {st.good ?? 0}</p><p className="text-[11px] text-slate-400">👎 {st.bad ?? 0}</p></div>
        </div>
        {(st.releaseMin != null || st.sendMin != null) && <div className="card text-sm">
          {st.releaseMin != null && <p>{`⏱ Usually releases in ~${Math.max(1, st.releaseMin)} min`}</p>}
          {st.sendMin != null && <p>{`⏱ Usually sends in ~${Math.max(1, st.sendMin)} min`}</p>}
        </div>}
        {t.ads > 0 && <Link to="/exchange?tab=p2p" className="btn-primary py-3 text-sm">See their offers in P2P</Link>}
        <section>
          <p className="label mb-2">Reviews</p>
          {t.reviews.length ? t.reviews.map((r, i) => (
            <div key={i} className="card mb-2 flex items-start gap-3 py-3">
              {r.good ? <ThumbsUp size={18} className="mt-0.5 shrink-0 text-mint-300" /> : <ThumbsDown size={18} className="mt-0.5 shrink-0 text-rose-300" />}
              <div className="min-w-0 flex-1"><p className="text-sm">{r.body || (r.good ? 'Good trade' : 'Bad trade')}</p><p className="text-[11px] text-slate-500">@{r.by} · {new Date(r.at).toLocaleDateString()}</p></div>
            </div>
          )) : <p className="card text-center text-sm text-slate-400">No reviews yet. Reviews appear after completed trades.</p>}
        </section>
        {!t.me && <button className="mx-auto flex items-center gap-1 text-xs text-slate-500" disabled={busy} onClick={() => void block(!t.blocked)}><Ban size={12} /> {t.blocked ? `Unblock @${t.username}` : `Block @${t.username}`}</button>}
        {err && <p className="text-center text-sm text-rose-300">{err}</p>}
      </div>
    </div>
  )
}
