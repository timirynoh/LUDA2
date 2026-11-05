import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/ui'
import { api, LIVE } from '../lib/live'
import { useStore } from '../lib/store'

// v1.20.0: in the live app the 🔔 inbox comes from the server (every money movement, P2P/Market/Flash steps, replies
// from the Luda team, sign-ins…), so it's complete and follows the account to any phone. Reminders made on this
// phone (deadlines, To do alerts) are shown with them.
interface Item { key: string; serverId?: number; localId?: string; emoji: string; title: string; body?: string | null; to?: string | null; read: boolean; at: number }

const dayLabel = (t: number) => {
  const d = new Date(t), now = new Date()
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.toDateString() === now.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return 'Earlier'
}

export default function Inbox() {
  const { s, set } = useStore()
  const [server, setServer] = useState<{ id: number; emoji: string; title: string; body: string | null; url: string | null; read: boolean; at: string }[] | null>(LIVE ? null : [])
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    if (!LIVE) return
    try { setServer((await api<{ items: NonNullable<typeof server> }>('GET', 'inbox')).items); setErr('') } catch { setErr('Couldn’t load your notifications. Pull down or try again.') }
  }, [])
  useEffect(() => {
    void load() // eslint-disable-line react-hooks/set-state-in-effect -- fetching from the server
    const on = () => void load()
    window.addEventListener('luda:inbox', on)
    return () => window.removeEventListener('luda:inbox', on)
  }, [load])

  const items: Item[] = [
    ...(server ?? []).map((n) => ({ key: `s${n.id}`, serverId: n.id, emoji: n.emoji, title: n.title, body: n.body, to: n.url, read: n.read, at: Date.parse(n.at) })),
    ...s.inbox.map((n) => ({ key: `l${n.id}`, localId: n.id, emoji: n.emoji, title: n.title, to: n.to, read: n.read, at: n.ts })),
  ].sort((a, b) => b.at - a.at)
  const unread = items.filter((n) => !n.read).length

  const markRead = (n?: Item) => {
    if (!n || n.serverId) {
      setServer((x) => x?.map((y) => (!n || y.id === n.serverId ? { ...y, read: true } : y)) ?? x)
      if (LIVE) void api('POST', 'inbox-read', n ? { ids: [n.serverId] } : {}).then(() => window.dispatchEvent(new Event('luda:inbox'))).catch(() => {})
    }
    if (!n || n.localId) set((p) => ({ ...p, inbox: p.inbox.map((x) => (!n || x.id === n.localId ? { ...x, read: true } : x)) }))
  }

  let lastDay = ''
  return (
    <div>
      <Header back title="Notifications" sub={unread ? `${unread} new` : 'You’re all caught up'}
        right={unread ? <button className="chip glass py-2 text-slate-300" onClick={() => markRead()}><CheckCheck size={14} /> Read all</button> : undefined} />
      <div className="px-5 pb-8">
        {err && <p className="mb-3 rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-300">{err}</p>}
        {server === null && !err ? <Loader2 className="mx-auto mt-10 animate-spin text-slate-500" /> : items.length ? (
          <div className="flex flex-col gap-1">
            {items.map((n) => {
              const day = dayLabel(n.at), head = day !== lastDay ? (lastDay = day) : null
              const body = (
                <div className={`flex items-start gap-3 rounded-2xl px-3 py-3 transition ${n.read ? 'bg-fg/[0.02]' : 'bg-mint-400/[0.07] ring-1 ring-mint-400/15'}`}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-fg/5 text-lg">{n.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.read ? 'text-slate-300' : 'font-semibold'}`}>{n.title}</p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{n.body}</p>}
                    <p className="mt-0.5 text-[11px] text-slate-500">{new Date(n.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-mint-400" />}
                </div>
              )
              return (
                <div key={n.key}>
                  {head && <p className="label mb-1.5 mt-3 first:mt-0">{head}</p>}
                  {n.to ? <Link to={n.to} onClick={() => markRead(n)}>{body}</Link> : <button className="block w-full text-start" onClick={() => markRead(n)}>{body}</button>}
                </div>
              )
            })}
          </div>
        ) : <div className="card flex flex-col items-center gap-2 py-12 text-center text-slate-400"><Bell size={32} /><p className="text-sm">Payments, messages, sign-ins and updates will show up here.</p></div>}
      </div>
    </div>
  )
}
