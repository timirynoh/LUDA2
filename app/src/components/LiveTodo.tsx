// "To do" on Home (v1.10.0, owner: 'always show what is pending and waiting for the user'). The list is built on the
// server from real state (P2P orders, Market, Flash, support replies, fee plan, ID check…); the phone only shows it.
// New items that need the user also arrive as a notification (inbox + phone), once each.
import { ChevronRight, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getSession, LIVE } from '../lib/live'
import { useStore } from '../lib/store'

export interface TodoItem { key: string; emoji: string; title: string; sub?: string; to: string; level: 'urgent' | 'action' | 'info' }

let last: { at: number; items: TodoItem[] } | null = null
const subs = new Set<(i: TodoItem[]) => void>()
async function fetchTodo(force = false) {
  if (!force && last && Date.now() - last.at < 20e3) return last.items
  const r = await api<{ items: TodoItem[] }>('GET', 'todo')
  last = { at: Date.now(), items: r.items }
  subs.forEach((f) => f(r.items))
  return r.items
}
export const refreshTodo = () => { if (LIVE && getSession()) void fetchTodo(true).catch(() => {}) }

/** A newer app version was published while this one was open. */
function useNewVersion() {
  const [fresh, setFresh] = useState(false)
  useEffect(() => {
    if (!LIVE) return
    const check = () => fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((v: { version?: string } | null) => { if (v?.version && v.version !== __VERSION__) setFresh(true) }).catch(() => {})
    void check()
    const t = setInterval(check, 15 * 60e3)
    const vis = () => { if (!document.hidden) void check() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [])
  return fresh
}

export function useTodo() {
  const [items, setItems] = useState<TodoItem[] | null>(last?.items ?? null)
  const load = useCallback((force = false) => { if (LIVE && getSession()) void fetchTodo(force).then(setItems).catch(() => {}) }, [])
  useEffect(() => {
    subs.add(setItems); load(true) // always fresh when Home opens
    const again = () => load(true) // after any wallet refresh (money moved, PIN set, ID checked…)
    window.addEventListener('luda:todo', again)
    return () => { subs.delete(setItems); window.removeEventListener('luda:todo', again) }
  }, [load])
  return { items, load }
}

/** Home card: everything waiting for you, most urgent first. Hidden when there's nothing to do. */
export function TodoCard() {
  const { items, load } = useTodo()
  const fresh = useNewVersion()
  const [all, setAll] = useState(false)
  if (!LIVE) return null
  const list = [...(fresh ? [{ key: 'update', emoji: '✨', title: 'A new version of Luda is ready', sub: 'Tap to update (takes a second)', to: '#update', level: 'action' as const }] : []), ...(items ?? [])]
  if (!list.length) return null
  const need = list.filter((i) => i.level !== 'info').length
  const shown = all ? list : list.slice(0, 3)
  const tint = { urgent: 'border-rose-400/40 bg-rose-500/10', action: 'border-gold-400/40 bg-gold-400/10', info: 'border-fg/10 bg-fg/[0.03]' }
  return (
    <section className="mx-5 mb-4" data-tour="todo">
      <div className="mb-2 flex items-center justify-between">
        <p className="label">{need ? `To do · ${need}` : 'In progress'}</p>
        <button className="text-slate-500" aria-label="Refresh" onClick={() => load(true)}><RefreshCw size={14} /></button>
      </div>
      <div className="flex flex-col gap-2">
        {shown.map((i) => {
          const body = (
            <>
              <span className="text-xl">{i.emoji}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{i.title}</p>{i.sub && <p className="truncate text-xs text-slate-400">{i.sub}</p>}</div>
              {i.level === 'urgent' && <span className="size-2 shrink-0 rounded-full bg-rose-400" />}
              <ChevronRight size={16} className="shrink-0 text-slate-500 rtl:rotate-180" />
            </>
          )
          const cls = `flex items-center gap-3 rounded-2xl border p-3 text-start ${tint[i.level]}`
          return i.to === '#update'
            ? <button key={i.key} className={cls} onClick={() => location.reload()}>{body}</button>
            : <Link key={i.key} to={i.to} className={cls}>{body}</Link>
        })}
      </div>
      {list.length > 3 && <button className="mt-2 w-full text-center text-xs text-mint-300" onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${list.length}`}</button>}
    </section>
  )
}

/** Checks every minute while the app is open; anything new that needs the user arrives as a notification, once. */
export function useTodoAlerts() {
  const { s, notify } = useStore()
  const who = s.account?.username ?? ''
  useEffect(() => {
    if (!LIVE || !who) return
    const key = `luda.todoSeen.${who}`
    let first = true
    const run = async () => {
      if (!getSession() || document.hidden) return
      const items = await fetchTodo(true).catch(() => null)
      if (!items) return
      let seen: string[] = []
      try { seen = JSON.parse(localStorage.getItem(key) || '[]') } catch { /* fresh */ }
      const fresh = items.filter((i) => i.level !== 'info' && !seen.includes(i.key))
      // The very first check on this phone just learns what's already there, so old items don't all buzz at once.
      if (!(first && !localStorage.getItem(key))) for (const i of fresh.slice(0, 3)) notify(i.emoji, i.title, i.to)
      first = false
      const keep = [...new Set([...items.map((i) => i.key), ...seen])].slice(0, 200)
      try { localStorage.setItem(key, JSON.stringify(keep)) } catch { /* private mode */ }
    }
    void run()
    const t = setInterval(() => void run(), 60e3)
    const vis = () => { if (!document.hidden) void run() }
    document.addEventListener('visibilitychange', vis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis) }
  }, [who, notify])
}
