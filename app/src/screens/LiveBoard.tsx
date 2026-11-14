// Live: real community posts from the server (no sample data). One screen per kind: housing, jobs, events, news, promos, places.
import { useMemo, useState } from 'react'
import { Empty, Tabs, useApi } from '../components/LiveKit'
import { PostCard, PostForm, PostSheet, RulesCard } from '../components/LiveBoardKit'
import { Header } from '../components/ui'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store'
import { CITIES } from '../lib/data'
import { BOARD, type BoardFeed, type BoardKind, type BoardPost } from '../lib/board'

const SUB: Record<BoardKind, string> = {
  housing: 'Rooms, flats and dorms from verified people', job: 'Work from verified employers', event: 'Worship, culture, sports and meet-ups',
  news: 'Checked updates for students in North Cyprus', promo: 'Deals spotted by students', place: 'Places checked by the Luda team',
}

export default function LiveBoard({ kind }: { kind: BoardKind }) {
  const B = BOARD[kind]
  const { data, err, reload } = useApi<BoardFeed>(`board?kind=${kind}`)
  const [tab, setTab] = useState<'all' | 'mine'>('all')
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<BoardPost | null>(null)
  const [posting, setPosting] = useState(false)
  const { s } = useStore()
  // Quick paid jobs (Flash help) live on their own board; show them here too so nobody looking for work misses them.
  const flash = useApi<{ open: { id: string; title: string; reward_minor: number; city: string; poster_name?: string; mine: boolean }[] }>(kind === 'job' ? 'flash' : null).data
  const quick = (flash?.open ?? []).filter((j) => !j.mine).sort((a, b) => Number(b.city === s.city) - Number(a.city === s.city))
  const filterKey = kind === 'housing' ? 'type' : kind === 'job' ? 'jobType' : kind === 'event' || kind === 'news' || kind === 'place' ? 'category' : ''
  const options = B.fields.find((f) => f.key === filterKey)?.options ?? []
  const list = useMemo(() => {
    let l = tab === 'mine' ? data?.mine ?? [] : data?.items ?? []
    if (filter && tab === 'all') l = l.filter((p) => p.data?.[filterKey] === filter)
    if (kind === 'event' && tab === 'all') l = l.filter((p) => !p.data?.date || Date.parse(String(p.data.date)) > Date.now() - 3 * 3600e3).sort((a, b) => Date.parse(String(a.data?.date ?? a.created_at)) - Date.parse(String(b.data?.date ?? b.created_at)))
    return l
  }, [data, tab, filter, filterKey, kind])

  return (
    <div className="pb-8">
      <Header back title={B.label} sub={SUB[kind]} />
      <div className="flex flex-col gap-4 px-5">
        {data && <RulesCard kind={kind} rules={data.rules} why={data.why} canPost={data.canPost} onPost={() => setPosting(true)} />}
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'all', label: `${B.emoji} All` }, { value: 'mine', label: '⭐ Mine', badge: data?.mine.length || undefined }]} />
        {tab === 'all' && options.length > 0 && (
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {['', ...options].map((o) => <button key={o || 'all'} onClick={() => setFilter(o)} className={`chip shrink-0 py-2 ${filter === o ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/40' : 'bg-fg/[0.06] text-slate-300'}`}>{o || 'All'}</button>)}
          </div>
        )}
        {kind === 'job' && tab === 'all' && quick.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between"><p className="label">⚡ Quick paid jobs (Flash)</p><Link to="/flash" className="text-xs text-mint-300">See all</Link></div>
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
              {quick.slice(0, 8).map((j) => (
                <Link key={j.id} to="/flash" className="card flex w-56 shrink-0 flex-col gap-1.5">
                  <span className="chip self-start bg-gold-400/20 py-0.5 text-[11px] font-bold text-gold-200">₺{(j.reward_minor / 100).toLocaleString('en-US')} · paid via Luda</span>
                  <p className="line-clamp-2 text-sm font-bold">{j.title}</p>
                  <p className="text-[11px] text-slate-500">@{j.poster_name}{j.city ? ` · ${CITIES.find((c) => c.id === j.city)?.name ?? ''}` : ''}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
        {err && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-300">{err}</p>}
        {!data && !err && <div className="grid gap-3 tab:grid-cols-2">{[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-3xl bg-fg/[0.04]" />)}</div>}
        {data && list.length === 0 && (tab === 'mine'
          ? <Empty emoji="⭐" title="Nothing posted yet" sub={data.canPost ? `Post your first ${B.one}.` : data.why ?? ''} />
          : <Empty emoji={B.emoji} title={filter ? `No ${filter} right now` : 'Be the first'} sub={B.empty} action={data.canPost ? <button className="btn-primary mt-2 px-5 py-3" onClick={() => setPosting(true)}>Post a {B.one}</button> : undefined} />)}
        <div className="grid gap-3 tab:grid-cols-2 desk:grid-cols-3">{list.map((p) => <PostCard key={p.id} p={p} onOpen={() => setOpen(p)} />)}</div>
      </div>
      {open && <PostSheet p={open} onClose={() => setOpen(null)} onChange={reload} />}
      {posting && <PostForm kind={kind} onClose={() => setPosting(false)} onDone={reload} />}
    </div>
  )
}
