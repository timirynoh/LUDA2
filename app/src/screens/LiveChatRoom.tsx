// Live group chat room: messages come from the server (refreshed every few seconds). Only members can read and write.
import { motion } from 'framer-motion'
import { BadgeCheck, ChevronLeft, Info, LogOut, SendHorizontal, ShieldCheck, Trash2, Users } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useApi } from '../components/LiveKit'
import { errMsg } from '../components/LiveMoney'
import { Sheet } from '../components/ui'
import { api } from '../lib/live'
import { GroupAvatar, tintOf, type LiveGroup } from './LiveChats'

interface Msg { id: number; by: string; name: string; verified: boolean; mine: boolean; body: string; deleted: boolean; at: string }
const EMOJI_ROW = ['😀', '😂', '🙏🏾', '👍🏾', '🔥', '💯', '🎉', '❤️', '🤝🏾', '🇳🇬', '🇬🇭', '🇰🇪']

export default function LiveChatRoom() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { data, reload } = useApi<{ groups: LiveGroup[]; official: boolean }>('groups')
  const g = data?.groups.find((x) => x.id === id)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [warn, setWarn] = useState('')
  const [sending, setSending] = useState(false)
  const [picked, setPicked] = useState<Msg | null>(null)
  const [info, setInfo] = useState(false)
  const last = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  const pull = useCallback(async (full = false) => {
    try {
      const r = await api<{ messages: Msg[] }>('GET', `group-messages?id=${id}&after=${full ? 0 : last.current}`)
      if (!r.messages.length && !full) return
      setMsgs((old) => { const m = new Map((full ? [] : old).map((x) => [x.id, x])); for (const x of r.messages) m.set(x.id, x); const l = [...m.values()].sort((a, b) => a.id - b.id).slice(-300); last.current = l.at(-1)?.id ?? 0; return l })
    } catch { /* not a member yet */ }
  }, [id])
  useEffect(() => {
    if (!g?.joined) return
    void pull(true)
    const t = setInterval(() => { if (document.visibilityState === 'visible') void pull() }, 4000)
    return () => clearInterval(t)
  }, [g?.joined, pull])
  useLayoutEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [msgs.length])

  if (!data) return <div className="fixed inset-0 z-40 grid place-items-center bg-ink-950 text-sm text-slate-400">Loading…</div>
  if (!g) return <div className="p-10 text-center text-slate-400">This group isn’t available. <button className="underline" onClick={() => nav('/chats')}>Back to chats</button></div>

  const send = async () => {
    const body = text.trim()
    if (!body || sending) return
    setSending(true); setWarn('')
    try { await api('POST', 'group-send', { id, body }); setText(''); await pull() } catch (e) { setWarn(errMsg(e)) } finally { setSending(false) }
  }
  const join = async () => { try { await api('POST', 'group-join', { id }); reload() } catch (e) { setWarn(errMsg(e)) } }
  const leave = async () => { try { await api('POST', 'group-join', { id, join: false }); nav('/chats') } catch (e) { setWarn(errMsg(e)) } }
  const del = async (m: Msg) => { setPicked(null); try { await api('POST', 'group-delete-msg', { messageId: m.id }); await pull(true) } catch (e) { setWarn(errMsg(e)) } }
  const canDelete = (m: Msg) => !m.deleted && (m.mine || g.mineOwner || data.official)

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-app flex-col bg-ink-950 desk:inset-y-6 desk:overflow-hidden desk:rounded-[2.5rem] desk:border desk:border-fg/10">
      <div className="flex items-center gap-3 border-b border-fg/10 bg-ink-900/90 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl">
        <button onClick={() => nav('/chats')} className="grid size-10 place-items-center rounded-xl hover:bg-fg/5 rtl:rotate-180" aria-label="Back"><ChevronLeft size={22} /></button>
        <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => setInfo(true)}>
          <GroupAvatar g={g} size="size-10" />
          <div className="min-w-0"><p className="flex items-center gap-1 truncate font-bold leading-tight">{g.name}{g.official && <ShieldCheck size={14} className="shrink-0 text-mint-300" />}</p>
            <p className="truncate text-xs text-slate-400">{g.members} member{g.members === 1 ? '' : 's'}{g.about ? ` · ${g.about}` : ''}</p></div>
        </button>
        <button onClick={() => setInfo(true)} className="grid size-10 place-items-center rounded-xl hover:bg-fg/5" aria-label="Group info"><Info size={20} /></button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-4" onClick={() => setPicked(null)}>
        {!g.joined ? (
          <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-3 text-center">
            <GroupAvatar g={g} size="size-20" />
            <p className="text-xl font-extrabold">{g.name}</p>
            {g.about && <p className="text-sm text-slate-300">{g.about}</p>}
            <p className="flex items-center gap-1 text-xs text-slate-400"><Users size={13} /> {g.members} members · started by {g.official ? 'Luda' : `@${g.owner}`}</p>
            <button className="btn-primary mt-2 w-full py-3.5" onClick={() => void join()}>Join to read and chat</button>
          </div>
        ) : msgs.length === 0 ? (
          <p className="mt-16 text-center text-sm text-slate-400">No messages yet.<br />Be the first to say hi 👋</p>
        ) : msgs.map((m, i) => {
          const prev = msgs[i - 1], next = msgs[i + 1]
          const sep = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString()
          const first = !prev || prev.by !== m.by || sep, lastOfRun = !next || next.by !== m.by
          return (
            <div key={m.id}>
              {sep && <p className="my-3 text-center"><span className="rounded-full bg-fg/5 px-3 py-1 text-[11px] text-slate-400">{new Date(m.at).toDateString() === new Date().toDateString() ? 'Today' : new Date(m.at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</span></p>}
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex items-end gap-2 ${m.mine ? 'justify-end' : ''} ${lastOfRun ? 'mb-2' : 'mb-0.5'}`}>
                {!m.mine && <div className="w-8 shrink-0">{lastOfRun && <span className={`grid size-8 place-items-center rounded-full bg-gradient-to-br ${tintOf(m.by)} text-xs font-bold text-white`}>{(m.name || m.by).slice(0, 1).toUpperCase()}</span>}</div>}
                <button onClick={(e) => { e.stopPropagation(); if (canDelete(m)) setPicked(picked?.id === m.id ? null : m) }}
                  className={`max-w-[78%] px-3.5 py-2 text-start text-[15px] leading-snug shadow-sm ${m.mine ? 'rounded-2xl rounded-br-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white' : 'rounded-2xl rounded-bl-md bg-fg/[0.07]'} ${picked?.id === m.id ? 'ring-2 ring-mint-300' : ''}`}>
                  {!m.mine && first && <span className="mb-0.5 flex items-center gap-1 text-xs font-bold text-mint-300">{m.name || m.by}{m.verified && <BadgeCheck size={12} />}</span>}
                  {m.deleted ? <span className="italic text-slate-400">Message deleted</span> : <span className="selectable whitespace-pre-wrap break-words">{m.body}</span>}
                  <span className={`ms-2 inline-block translate-y-0.5 text-[10px] ${m.mine ? 'text-white/70' : 'text-slate-500'}`}>{new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </button>
              </motion.div>
              {picked?.id === m.id && <div className={`mb-2 flex ${m.mine ? 'justify-end' : 'ms-10'}`}><button onClick={() => void del(m)} className="chip bg-rose-500/15 py-1.5 text-rose-200"><Trash2 size={13} /> Delete</button></div>}
            </div>
          )
        })}
      </div>

      {g.joined && (
        <div className="border-t border-fg/10 bg-ink-900/90 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          {warn && <p className="mb-2 rounded-xl bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{warn}</p>}
          <div className="-mx-1 mb-2 flex gap-1 overflow-x-auto px-1">{EMOJI_ROW.map((e) => <button key={e} onClick={() => setText((t) => t + e)} className="grid size-8 shrink-0 place-items-center rounded-lg text-lg hover:bg-fg/5">{e}</button>)}</div>
          <div className="flex items-end gap-2">
            <textarea rows={1} value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              placeholder="Message" className="input max-h-32 min-h-11 flex-1 resize-none py-2.5" />
            <button disabled={!text.trim() || sending} onClick={() => void send()} className="grid size-11 shrink-0 place-items-center rounded-2xl bg-mint-400 text-ink-950 disabled:opacity-40 rtl:-scale-x-100" aria-label="Send"><SendHorizontal size={19} /></button>
          </div>
        </div>
      )}

      {info && <Sheet open onClose={() => setInfo(false)} title={g.name}>
        <div className="flex flex-col gap-3 pb-4">
          <div className="flex items-center gap-3"><GroupAvatar g={g} size="size-16" /><div><p className="text-sm text-slate-300">{g.about || 'No description'}</p><p className="mt-1 text-xs text-slate-400">{g.members} members · started by {g.official ? 'Luda' : `@${g.owner}`} · {new Date(g.created_at).toLocaleDateString()}</p></div></div>
          <div className="rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-300">
            <p className="mb-1 font-semibold text-slate-200">Group rules</p>
            <p>✓ Be respectful. Insults and hate are blocked.</p><p>✓ No scams, no “pay outside Luda”, no asking for PINs or codes.</p><p>✓ 5 messages per 10 seconds. The group creator can remove messages.</p>
          </div>
          {g.joined && !g.mineOwner && <button className="btn-ghost py-3 text-sm text-rose-300" onClick={() => void leave()}><LogOut size={15} /> Leave group</button>}
        </div>
      </Sheet>}
    </div>
  )
}
