// Live group chats: real groups and real members from the server. Anyone signed in can join; verified people can create.
import { BadgeCheck, ChevronRight, Plus, Search, ShieldCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Empty, Tabs, ago, useApi } from '../components/LiveKit'
import { errMsg } from '../components/LiveMoney'
import { Header, Sheet } from '../components/ui'
import { api } from '../lib/live'
import { useStore } from '../lib/store'

export interface LiveGroup {
  id: string; name: string; about: string; emoji: string; city: string; official: boolean; created_at: string
  owner: string; mineOwner: boolean; members: number; joined: boolean; unread: number; last: { body: string; by: string; at: string } | null
}
interface GroupsRes { groups: LiveGroup[]; canCreate: boolean; why: string | null; official: boolean }

const TINTS = ['from-emerald-400 to-teal-600', 'from-sky-400 to-indigo-600', 'from-fuchsia-400 to-rose-600', 'from-amber-400 to-orange-600', 'from-violet-400 to-purple-700', 'from-lime-400 to-green-600']
export const tintOf = (id: string) => TINTS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length]
export const GroupAvatar = ({ g, size = 'size-12' }: { g: Pick<LiveGroup, 'id' | 'emoji'>; size?: string }) => <span className={`grid ${size} shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${tintOf(g.id)} text-2xl shadow-lg shadow-black/20`}>{g.emoji}</span>

export default function LiveChats() {
  const { data, err, reload } = useApi<GroupsRes>('groups')
  const [tab, setTab] = useState<'mine' | 'discover'>('mine')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const nav = useNavigate()
  const mine = useMemo(() => (data?.groups ?? []).filter((g) => g.joined), [data])
  const others = useMemo(() => (data?.groups ?? []).filter((g) => !g.joined && (!q || `${g.name} ${g.about}`.toLowerCase().includes(q.toLowerCase()))), [data, q])
  const join = async (g: LiveGroup) => { try { await api('POST', 'group-join', { id: g.id }); nav(`/chats/${g.id}`) } catch { /* shown in room */ } }

  return (
    <div className="pb-8">
      <Header back title="Chats" sub="Real groups, real people" right={data?.canCreate ? <button className="glass grid size-10 place-items-center rounded-2xl" aria-label="Create group" onClick={() => setCreating(true)}><Plus size={18} /></button> : undefined} />
      <div className="flex flex-col gap-4 px-5">
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'mine', label: '💬 My groups', badge: mine.reduce((a, g) => a + g.unread, 0) || undefined }, { value: 'discover', label: '🧭 Discover' }]} />
        {err && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-300">{err}</p>}
        {!data && !err && [0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-3xl bg-fg/[0.04]" />)}

        {data && tab === 'mine' && (mine.length === 0
          ? <Empty emoji="💬" title="No groups yet" sub="Find your people: country groups, your university, church or mosque, sports…" action={<button className="btn-primary mt-2 px-5 py-3" onClick={() => setTab('discover')}>Discover groups</button>} />
          : <div className="flex flex-col divide-y divide-fg/5 overflow-hidden rounded-3xl bg-fg/[0.03]">{mine.map((g) => (
            <Link key={g.id} to={`/chats/${g.id}`} className="flex items-center gap-3 px-4 py-3.5 transition active:bg-fg/[0.05]">
              <GroupAvatar g={g} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate font-semibold">{g.name}{g.official && <ShieldCheck size={14} className="shrink-0 text-mint-300" />}</p>
                <p className={`truncate text-xs ${g.unread ? 'font-semibold text-slate-200' : 'text-slate-400'}`}>{g.last ? `${g.last.by}: ${g.last.body || 'message deleted'}` : 'No messages yet. Say hi 👋'}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {g.last && <span className="text-[10px] text-slate-500">{ago(g.last.at)}</span>}
                {g.unread > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-mint-400 px-1.5 text-[11px] font-bold text-ink-950">{g.unread > 99 ? '99+' : g.unread}</span>}
              </div>
            </Link>
          ))}</div>)}

        {data && tab === 'discover' && <>
          <label className="glass flex items-center gap-2 rounded-2xl px-4 py-3"><Search size={16} className="text-slate-400" /><input className="flex-1 bg-transparent text-sm outline-none" placeholder="Search groups" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {others.length === 0 ? <Empty emoji="🧭" title={q ? 'No group with that name' : 'You’ve joined every group'} sub={data.canCreate ? 'Start one for your community.' : 'Verified members can start new groups.'} />
            : <div className="grid gap-3 tab:grid-cols-2">{others.map((g) => (
              <div key={g.id} className="card flex flex-col gap-3">
                <div className="flex items-center gap-3"><GroupAvatar g={g} />
                  <div className="min-w-0 flex-1"><p className="flex items-center gap-1 truncate font-semibold">{g.name}{g.official && <ShieldCheck size={14} className="shrink-0 text-mint-300" />}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-400"><Users size={12} /> {g.members} member{g.members === 1 ? '' : 's'} · by {g.official ? 'Luda' : `@${g.owner}`}</p></div></div>
                {g.about && <p className="line-clamp-2 text-xs text-slate-300">{g.about}</p>}
                <button className="btn-primary py-2.5 text-sm" onClick={() => void join(g)}>Join group</button>
              </div>
            ))}</div>}
        </>}

        {data && <div className="rounded-3xl border border-mint-400/20 bg-mint-400/[0.06] p-4">
          <div className="flex items-center gap-3"><BadgeCheck className="shrink-0 text-mint-300" />
            <div className="min-w-0 flex-1"><p className="text-sm font-bold">Start your own group</p><p className="text-xs text-slate-400">{data.canCreate ? 'Anyone can join. You can remove messages in your group.' : data.why}</p></div>
            {data.canCreate ? <button className="btn-primary shrink-0 px-4 py-2.5 text-sm" onClick={() => setCreating(true)}><Plus size={16} /> Create</button> : <Link to="/wallet" className="flex shrink-0 items-center text-xs font-semibold text-mint-300">Verify <ChevronRight size={14} /></Link>}
          </div>
          <ul className="mt-3 flex flex-col gap-1 text-xs text-slate-300">
            <li>✓ Anyone signed in can join groups and chat.</li>
            <li>✓ To create a group your ID must be verified, so every group has a real person behind it.</li>
            <li>✓ Up to 3 groups per person. Scam messages and insults are blocked automatically.</li>
          </ul>
        </div>}
      </div>
      {creating && data && <CreateGroup official={data.official} onClose={() => setCreating(false)} onDone={(id) => { reload(); nav(`/chats/${id}`) }} />}
    </div>
  )
}

const EMOJIS = ['💬', '🇳🇬', '🇬🇭', '🇰🇪', '🇨🇲', '🇿🇼', '🇿🇲', '🇺🇬', '🎓', '⛪', '🕌', '⚽', '🍲', '💼', '🎉', '🏠']
function CreateGroup({ official, onClose, onDone }: { official: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const { s } = useStore()
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [emoji, setEmoji] = useState('💬')
  const [asLuda, setAsLuda] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    try { const r = await api<{ group: { id: string } }>('POST', 'group-create', { name, about, emoji, city: s.city, official: asLuda }); onDone(r.group.id); onClose() } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title="New group">
      <div className="flex flex-col gap-3 pb-4">
        <div className="flex items-center gap-3"><GroupAvatar g={{ id: name || 'x', emoji }} size="size-16" /><input className="input flex-1 text-lg font-bold" maxLength={40} placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="flex flex-wrap gap-2">{EMOJIS.map((e) => <button key={e} onClick={() => setEmoji(e)} className={`grid size-10 place-items-center rounded-xl text-xl ${emoji === e ? 'bg-mint-400/25 ring-1 ring-mint-400/50' : 'bg-fg/[0.05]'}`}>{e}</button>)}</div>
        <label className="text-xs text-slate-400">What is it about?<textarea className="input mt-1 min-h-20" maxLength={200} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="e.g. Nigerians at NEU: help, food spots, events" /></label>
        {official && <label className="flex items-center gap-3 rounded-2xl bg-fg/[0.04] p-3 text-sm"><input type="checkbox" className="size-5 accent-emerald-400" checked={asLuda} onChange={(e) => setAsLuda(e.target.checked)} /> Create as a Luda Official group</label>}
        {err && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200">{err}</p>}
        <button className="btn-primary py-4" disabled={busy || name.trim().length < 3} onClick={() => void go()}>{busy ? 'Creating…' : 'Create group'}</button>
        <p className="text-center text-[11px] text-slate-500">Be kind. Groups that spread scams or hate are removed.</p>
      </div>
    </Sheet>
  )
}
