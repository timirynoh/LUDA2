import { motion } from 'framer-motion'
import { BadgeCheck, BellOff, Plus, Search, ShieldCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ExchangeHub } from '../components/ExchangeHub'
import { LIVE } from '../lib/live'
import { PhoneVerify } from '../components/PhoneVerify'
import { Header, Segmented, Sheet } from '../components/ui'
import { BASE_RULES, GROUPS, seedMessages, type Group, type GroupCat } from '../lib/chat'
import { checkText } from '../lib/moderation'
import { uid, useStore } from '../lib/store'

const CATS: ('All' | GroupCat)[] = ['All', 'Country', 'Campus', 'Faith', 'Housing', 'Jobs', 'Sports', 'Buy & Sell', 'Help']

export function useGroups() {
  const { s } = useStore()
  return useMemo(() => [...s.myGroups, ...GROUPS], [s.myGroups])
}

export function lastMessage(gid: string, chatMsgs: Record<string, import('../lib/chat').Msg[]>) {
  const all = [...seedMessages(gid), ...(chatMsgs[gid] ?? [])]
  return all[all.length - 1]
}

const ago = (ts: number) => {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  if (m < 1440) return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function GroupAvatar({ g, size = 'size-12' }: { g: Group; size?: string }) {
  return <div className={`grid ${size} shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${g.tone} text-2xl shadow-lg`}>{g.emoji}</div>
}

export default function Chats() {
  const { s, t, gate } = useStore()
  const groups = useGroups()
  const [tab, setTab] = useState<'mine' | 'discover'>(s.joinedGroups.length ? 'mine' : 'discover')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<'All' | GroupCat>('All')
  const [creating, setCreating] = useState(false)
  const [params, setParams] = useSearchParams()
  const section = params.get('tab') === 'exchange' ? 'exchange' : 'chat'
  const match = (g: Group) => !q || `${g.name} ${g.desc}`.toLowerCase().includes(q.toLowerCase())

  const mine = groups.filter((g) => s.joinedGroups.includes(g.id) && match(g))
    .map((g) => ({ g, last: lastMessage(g.id, s.chatMsgs) }))
    .sort((a, b) => (b.last?.ts ?? 0) - (a.last?.ts ?? 0))
  const discover = groups.filter((g) => !s.joinedGroups.includes(g.id) && match(g) && (cat === 'All' || g.cat === cat))
    .sort((a, b) => Number(b.city === s.city) - Number(a.city === s.city) || b.online - a.online)

  return (
    <div>
      <Header title={t('nav.chats')} sub="Groups for the community"
        right={<button onClick={() => gate(1, 'Create a group') && setCreating(true)} className="btn-primary size-11 rounded-2xl p-0" aria-label="Create group"><Plus size={20} /></button>} />
      <div className="flex flex-col gap-3 px-5">
        <div className="flex gap-2 rounded-2xl bg-fg/[0.03] p-1">
          {([['chat', '💬 Chats'], ['exchange', '💱 Exchange']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setParams(k === 'exchange' ? { tab: 'exchange' } : {})} className={`flex-1 rounded-xl py-3 text-sm font-bold transition ${section === k ? 'bg-gradient-to-r from-mint-400 to-emerald-500 text-ink-950 shadow-lg' : 'text-slate-400'}`}>{l}</button>
          ))}
        </div>
        {section === 'exchange' ? (LIVE ? <p className="mx-5 rounded-2xl bg-fg/[0.04] p-4 text-sm text-slate-400">🚧 Person-to-person exchange is coming soon. For now, convert Naira ⇄ Lira instantly in your <a href="/wallet?a=convert" className="text-mint-300 underline">wallet</a>.</p> : <ExchangeHub />) : <>
        <div className="relative"><Search size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input ps-11" placeholder="Search groups" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'mine', label: `💬 My groups${s.joinedGroups.length ? ` · ${s.joinedGroups.length}` : ''}` }, { value: 'discover', label: '🧭 Discover' }]} />

        {tab === 'mine' ? (
          <div className="card divide-y divide-fg/5 p-1">
            {mine.map(({ g, last }) => {
              const unread = [...seedMessages(g.id), ...(s.chatMsgs[g.id] ?? [])].filter((m) => !m.mine && m.ts > (s.lastRead[g.id] ?? 0)).length
              const muted = s.mutedGroups.includes(g.id)
              return (
                <Link key={g.id} to={`/chats/${g.id}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-fg/[0.03]">
                  <GroupAvatar g={g} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <p className="truncate font-semibold">{g.name}</p>
                      {(g.official || g.verified) && <BadgeCheck size={14} className={`shrink-0 ${g.official ? 'text-gold-300' : 'text-mint-400'}`} />}
                      {muted && <BellOff size={12} className="shrink-0 text-slate-500" />}
                    </div>
                    <p className="truncate text-sm text-slate-400">{last ? `${last.mine ? 'You' : last.from}: ${last.voice ? '🎙️ Voice note' : last.text}` : g.desc}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-[11px] ${unread && !muted ? 'text-mint-300' : 'text-slate-500'}`}>{last ? ago(last.ts) : ''}</span>
                    {unread > 0 && <span className={`grid min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold ${muted ? 'bg-fg/15 text-slate-300' : 'bg-mint-400 text-ink-950'}`}>{unread}</span>}
                  </div>
                </Link>
              )
            })}
            {!mine.length && <p className="p-6 text-center text-sm text-slate-400">No groups yet. Find one in Discover 🧭</p>}
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-2xl bg-mint-400/10 p-3 text-xs text-slate-300">
              <ShieldCheck size={18} className="mt-0.5 shrink-0 text-mint-300" />
              <span><b>Safe chats:</b> bad words are filtered automatically in 5 languages + Pidgin, scam messages are blocked, and you can report or block anyone with one tap.</span>
            </div>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
              {CATS.map((x) => <button key={x} onClick={() => setCat(x)} className={`chip shrink-0 px-4 py-2 text-sm ${cat === x ? 'bg-gradient-to-r from-mint-400 to-emerald-500 text-ink-950' : 'glass text-slate-300'}`}>{x}</button>)}
            </div>
            {discover.map((g, i) => <DiscoverCard key={g.id} g={g} i={i} />)}
            {!discover.length && <p className="card text-center text-sm text-slate-400">No groups match. Create one!</p>}
          </>
        )}
        </>}
      </div>
      {creating && <CreateGroup onClose={() => setCreating(false)} />}
    </div>
  )
}

function DiscoverCard({ g, i }: { g: Group; i: number }) {
  const { gate } = useStore()
  const [rules, setRules] = useState(false)
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} className="card">
      <div className="flex items-start gap-3">
        <GroupAvatar g={g} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 font-semibold">{g.name}{(g.official || g.verified) && <BadgeCheck size={14} className={g.official ? 'text-gold-300' : 'text-mint-400'} />}</p>
          <p className="line-clamp-2 text-xs text-slate-400">{g.desc}</p>
          <p className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1"><Users size={12} /> {g.members.toLocaleString()}</span>
            <span className="flex items-center gap-1"><span className="size-2 animate-pulse rounded-full bg-mint-400" /> {g.online} online</span>
            {g.official && <span className="chip bg-gold-400/15 text-gold-300">Official</span>}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link to={`/chats/${g.id}`} className="btn-ghost py-2.5 text-sm">Peek</Link>
        <button className="btn-primary py-2.5 text-sm" onClick={() => gate(1, 'Join group chats') && setRules(true)}>Join</button>
      </div>
      {rules && <JoinRules g={g} onClose={() => setRules(false)} />}
    </motion.div>
  )
}

export function JoinRules({ g, onClose, after }: { g: Group; onClose: () => void; after?: () => void }) {
  const { s, set, reward } = useStore()
  const nav = useNavigate()
  const join = () => {
    set((p) => ({ ...p, joinedGroups: p.joinedGroups.includes(g.id) ? p.joinedGroups : [...p.joinedGroups, g.id], lastRead: { ...p.lastRead, [g.id]: Date.now() - 3 * 3_600_000 } }))
    reward(s.quests.includes('chat') ? 5 : 30, { quest: 'chat', badge: 'chatter', title: `Joined ${g.name}` })
    onClose()
    if (after) after(); else nav(`/chats/${g.id}`)
  }
  return (
    <Sheet open onClose={onClose} title={`Join ${g.name}`}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3"><GroupAvatar g={g} size="size-14" /><p className="text-sm text-slate-300">{g.desc}</p></div>
        <div className="rounded-2xl bg-fg/[0.03] p-4">
          <p className="label mb-2">Group rules</p>
          <ol className="grid gap-2 text-sm">{g.rules.map((r, i) => <li key={r} className="flex gap-2"><span className="text-mint-300">{i + 1}.</span>{r}</li>)}</ol>
        </div>
        <p className="text-xs text-slate-400">Breaking the rules: messages get blocked, 3 strikes = temporary mute, serious cases = removed from Luda.</p>
        <button className="btn-primary py-4" onClick={join}>I agree, join group</button>
      </div>
    </Sheet>
  )
}

const EMOJIS = ['💬', '🌍', '🎓', '⛪', '🕌', '⚽', '🎶', '🍲', '💼', '🏠', '🛒', '🎮', '📚', '💃🏾', '🧑🏾‍💻', '🙌🏾']
const TONES = ['from-emerald-500 to-green-800', 'from-sky-500 to-blue-800', 'from-fuchsia-500 to-purple-800', 'from-amber-400 to-orange-700', 'from-rose-400 to-pink-800', 'from-cyan-400 to-sky-800']

function CreateGroup({ onClose }: { onClose: () => void }) {
  const { s, set, reward, allow } = useStore()
  const nav = useNavigate()
  const [f, setF] = useState({ name: '', desc: '', emoji: '💬', tone: TONES[0], cat: 'Country' as GroupCat, extra: '' })
  const [err, setErr] = useState('')
  const create = () => {
    const c = checkText(`${f.name} ${f.desc} ${f.extra}`)
    if (!c.ok) return setErr(c.scam ? `Blocked: ${c.scam}` : `Please remove inappropriate words (${c.bad.join(', ')})`)
    if (!allow('group', f.name)) return
    const g: Group = {
      id: `my-${uid()}`, name: f.name.trim(), desc: f.desc.trim() || 'A new Luda community group', emoji: f.emoji, tone: f.tone, cat: f.cat,
      members: 1, online: 1, mine: true, createdAt: Date.now(), official: s.isAdmin, city: s.city, rules: f.extra.trim() ? [...BASE_RULES, f.extra.trim()] : BASE_RULES,
    }
    set((p) => ({
      ...p, myGroups: [g, ...p.myGroups], joinedGroups: [...p.joinedGroups, g.id], lastRead: { ...p.lastRead, [g.id]: Date.now() },
      chatMsgs: { ...p.chatMsgs, [g.id]: [{ id: uid(), gid: g.id, from: 'Luda', flag: '🛡️', text: `${p.name} created this group. Share the rules and be kind 💚`, ts: Date.now(), system: true }] },
    }))
    reward(40, { badge: 'founder', title: 'Group created' })
    onClose(); nav(`/chats/${g.id}`)
  }
  return (
    <Sheet open onClose={onClose} title="Create a group">
      {!s.phoneVerified && !s.isAdmin ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-300">To stop spam groups, creators verify their phone number once.</p>
          <PhoneVerify compact />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className={`grid size-16 shrink-0 place-items-center rounded-3xl bg-gradient-to-br ${f.tone} text-3xl shadow-lg`}>{f.emoji}</div>
            <input className="input" placeholder="Group name" maxLength={40} value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setErr('') }} />
          </div>
          <div className="flex flex-wrap gap-1.5">{EMOJIS.map((e) => <button key={e} onClick={() => setF({ ...f, emoji: e })} className={`grid size-10 place-items-center rounded-xl text-xl ${f.emoji === e ? 'bg-mint-400/20 ring-1 ring-mint-400' : 'bg-fg/5'}`}>{e}</button>)}</div>
          <div className="flex gap-2">{TONES.map((c) => <button key={c} onClick={() => setF({ ...f, tone: c })} aria-label="Colour" className={`size-8 rounded-full bg-gradient-to-br ${c} ${f.tone === c ? 'ring-2 ring-mint-300 ring-offset-2 ring-offset-ink-900' : ''}`} />)}</div>
          <div className="flex flex-wrap gap-2">{CATS.slice(1).map((c) => <button key={c} onClick={() => setF({ ...f, cat: c as GroupCat })} className={`chip py-1.5 ${f.cat === c ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{c}</button>)}</div>
          <textarea className="input min-h-20" placeholder="What is this group about?" maxLength={160} value={f.desc} onChange={(e) => { setF({ ...f, desc: e.target.value }); setErr('') }} />
          <div className="rounded-2xl bg-fg/[0.03] p-3 text-xs text-slate-400">
            <p className="mb-1 font-semibold text-slate-300">Rules every group gets automatically:</p>
            {BASE_RULES.map((r) => <p key={r}>• {r}</p>)}
            <input className="input mt-2 py-2 text-sm" placeholder="Add your own rule (optional)" value={f.extra} onChange={(e) => setF({ ...f, extra: e.target.value })} />
          </div>
          {err && <p className="text-sm text-rose-300">⚠️ {err}</p>}
          <button className="btn-primary py-4" disabled={f.name.trim().length < 3} onClick={create}>Create group · +40 XP</button>
        </div>
      )}
    </Sheet>
  )
}
