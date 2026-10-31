import { Bell, CheckCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Header } from '../components/ui'
import { useStore } from '../lib/store'

export default function Inbox() {
  const { s, set } = useStore()
  const unread = s.inbox.filter((n) => !n.read).length
  return (
    <div>
      <Header back title="Notifications" sub={unread ? `${unread} new` : 'You’re all caught up'}
        right={unread ? <button className="chip glass py-2 text-slate-300" onClick={() => set((p) => ({ ...p, inbox: p.inbox.map((n) => ({ ...n, read: true })) }))}><CheckCheck size={14} /> Read all</button> : undefined} />
      <div className="px-5">
        {s.inbox.length ? (
          <div className="card divide-y divide-fg/5 p-1">
            {s.inbox.map((n) => {
              const body = (
                <div className={`flex items-start gap-3 rounded-2xl px-3 py-3 ${n.read ? '' : 'bg-mint-400/5'}`}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-fg/5 text-lg">{n.emoji}</span>
                  <div className="min-w-0 flex-1"><p className={`text-sm ${n.read ? 'text-slate-300' : 'font-semibold'}`}>{n.title}</p><p className="text-xs text-slate-500">{new Date(n.ts).toLocaleString()}</p></div>
                  {!n.read && <span className="mt-1.5 size-2 rounded-full bg-mint-400" />}
                </div>
              )
              const mark = () => set((p) => ({ ...p, inbox: p.inbox.map((x) => (x.id === n.id ? { ...x, read: true } : x)) }))
              return n.to ? <Link key={n.id} to={n.to} onClick={mark}>{body}</Link> : <button key={n.id} className="block w-full text-start" onClick={mark}>{body}</button>
            })}
          </div>
        ) : <div className="card flex flex-col items-center gap-2 py-12 text-center text-slate-400"><Bell size={32} /><p className="text-sm">Payments, sign-ins and updates will show up here.</p></div>}
      </div>
    </div>
  )
}
