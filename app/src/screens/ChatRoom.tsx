import { AnimatePresence, motion } from 'framer-motion'
import { Ban, BellOff, BellRing, Check, CheckCheck, ChevronLeft, Copy, Flag, Info, LogOut, MoreVertical, Reply, SendHorizontal, ShieldAlert, Smile, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Sheet } from '../components/ui'
import { colorFor, demoReply, seedMessages, type Msg } from '../lib/chat'
import { checkText, rateLimited } from '../lib/moderation'
import { uid, useStore } from '../lib/store'
import { GroupAvatar, JoinRules, useGroups } from './Chats'
import { MicButton, RecordingBar, useRecorder, VoiceBubble } from '../components/Voice'

const QUICK = ['👍', '❤️', '😂', '🙏', '🔥', '😮']
const EMOJI_ROW = ['😀', '😂', '🥹', '😍', '🙏🏾', '👍🏾', '🔥', '💯', '🎉', '😢', '🤝🏾', '❤️', '🇳🇬', '🇨🇲', '🇿🇼', '🇬🇭', '🇰🇪', '🇨🇩']
const STRIKE_LIMIT = 3, MUTE_MS = 10 * 60_000

export default function ChatRoom() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const { s, set, toast, reward, gate } = useStore()
  const g = useGroups().find((x) => x.id === id)
  const joined = s.joinedGroups.includes(id)
  const [text, setText] = useState('')
  const [warn, setWarn] = useState<string | null>(null)
  const [typing, setTyping] = useState<string | null>(null)
  const [picked, setPicked] = useState<Msg | null>(null)
  const [replyTo, setReplyTo] = useState<Msg | null>(null)
  const [emoji, setEmoji] = useState(false)
  const [menu, setMenu] = useState(false)
  const [rules, setRules] = useState(false)
  const [, tick] = useState(0)
  const sentTimes = useRef<number[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const msgs = useMemo(() => [...seedMessages(id), ...(s.chatMsgs[id] ?? [])]
    .filter((m) => !s.blockedUsers.includes(m.from) && !s.hiddenMsgs.includes(m.id)), [id, s.chatMsgs, s.blockedUsers, s.hiddenMsgs])
  const muted = s.chatStrikes.until > Date.now()
  const recorder = useRecorder((url, dur) => {
    set((p) => ({ ...p, chatMsgs: { ...p.chatMsgs, [id]: [...(p.chatMsgs[id] ?? []), { id: uid(), gid: id, from: p.name, flag: '', text: '', voice: url, dur, ts: Date.now(), mine: true }].slice(-200) } }))
    setTimeout(() => setTyping('Tolu'), 900)
    setTimeout(() => { setTyping(null); set((p) => ({ ...p, chatMsgs: { ...p.chatMsgs, [id]: [...(p.chatMsgs[id] ?? []), { id: uid(), gid: id, from: 'Tolu', flag: '🇳🇬', text: '🎧 Nice voice note!', ts: Date.now() }] } })) }, 2600)
  }, (msg) => toast({ title: msg, emoji: '🎙️' }))

  useLayoutEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs.length, typing])
  useEffect(() => { if (joined) set((p) => ({ ...p, lastRead: { ...p.lastRead, [id]: Date.now() } })) }, [msgs.length, joined, id, set])
  useEffect(() => { if (!muted) return; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t) }, [muted])

  if (!g) return <div className="p-10 text-center text-slate-400">Group not found. <button className="underline" onClick={() => nav('/chats')}>Back to chats</button></div>

  const push = (m: Msg) => set((p) => ({ ...p, chatMsgs: { ...p.chatMsgs, [id]: [...(p.chatMsgs[id] ?? []), m].slice(-200) } }))

  const send = () => {
    const body = text.trim()
    if (!body || muted) return
    if (rateLimited(sentTimes.current)) return setWarn('🐢 Slow down: max 5 messages every 10 seconds.')
    const lastMine = [...(s.chatMsgs[id] ?? [])].reverse().find((m) => m.mine)
    if (lastMine && lastMine.text.trim().toLowerCase() === body.toLowerCase() && Date.now() - lastMine.ts < 5 * 60_000) return setWarn('🔁 You just sent that. Repeating messages counts as spam.')
    const c = checkText(body)
    if (!c.ok) {
      const count = s.chatStrikes.count + 1
      const mute = count >= STRIKE_LIMIT
      set((p) => ({ ...p, chatStrikes: { count: mute ? 0 : count, until: mute ? Date.now() + MUTE_MS : p.chatStrikes.until } }))
      setWarn(c.scam
        ? `🛡️ Not sent: this looks like a scam (${c.scam}). ${mute ? 'You are muted for 10 minutes.' : `Strike ${count}/${STRIKE_LIMIT}.`}`
        : `⚠️ Not sent: please keep it respectful ("${c.masked}"). ${mute ? 'You are muted for 10 minutes.' : `Strike ${count}/${STRIKE_LIMIT}.`}`)
      return
    }
    sentTimes.current = [...sentTimes.current.filter((t) => Date.now() - t < 10_000), Date.now()]
    const m: Msg = { id: uid(), gid: id, from: s.name, flag: '', text: body, ts: Date.now(), mine: true, replyTo: replyTo ? { from: replyTo.mine ? 'You' : replyTo.from, text: replyTo.text } : undefined }
    push(m); setText(''); setReplyTo(null); setWarn(null); setEmoji(false)
    inputRef.current?.focus()
    if ((s.chatMsgs[id] ?? []).filter((x) => x.mine).length === 0) reward(10, { title: 'First message sent' })
    // Demo: a member replies
    const r = demoReply(id, body)
    setTimeout(() => setTyping(r.from), 900)
    setTimeout(() => { setTyping(null); push({ id: uid(), gid: id, ...r, ts: Date.now(), replyTo: { from: 'You', text: body } }) }, 2600)
  }

  const react = (m: Msg, e: string) => {
    set((p) => ({ ...p, reacts: { ...p.reacts, [m.id]: p.reacts[m.id] === e ? '' : e } }))
    setPicked(null)
  }
  const report = (m: Msg) => { set((p) => ({ ...p, hiddenMsgs: [...p.hiddenMsgs, m.id] })); toast({ title: 'Reported. Moderators will review it', emoji: '🛡️' }); setPicked(null) }
  const block = (m: Msg) => { set((p) => ({ ...p, blockedUsers: [...p.blockedUsers, m.from] })); toast({ title: `${m.from} blocked`, emoji: '🚫' }); setPicked(null) }
  const del = (m: Msg) => { set((p) => ({ ...p, chatMsgs: { ...p.chatMsgs, [id]: (p.chatMsgs[id] ?? []).filter((x) => x.id !== m.id) } })); setPicked(null) }

  const isMutedGroup = s.mutedGroups.includes(id)
  let lastDay = ''

  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-md flex-col bg-ink-950 sm:inset-y-6 sm:rounded-[2.5rem] sm:border sm:border-fg/10 sm:overflow-hidden">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-fg/10 bg-ink-900/90 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl">
        <button onClick={() => nav('/chats')} className="grid size-10 place-items-center rounded-xl hover:bg-fg/5 rtl:rotate-180" aria-label="Back"><ChevronLeft size={22} /></button>
        <button className="flex min-w-0 flex-1 items-center gap-3 text-start" onClick={() => setMenu(true)}>
          <GroupAvatar g={g} size="size-10" />
          <div className="min-w-0">
            <p className="truncate font-bold leading-tight">{g.name}</p>
            <p className="truncate text-xs text-slate-400">{typing ? <span className="text-mint-300">{typing} is typing…</span> : <><span className="text-mint-300">● {g.online} online</span> · {g.members.toLocaleString()} members</>}</p>
          </div>
        </button>
        <button onClick={() => setMenu(true)} className="grid size-10 place-items-center rounded-xl hover:bg-fg/5" aria-label="Group menu"><MoreVertical size={20} /></button>
      </div>

      {/* messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3" onClick={() => setPicked(null)}>
        <div className="mx-auto mb-3 flex w-fit items-center gap-2 rounded-full bg-gold-400/10 px-3 py-1.5 text-[11px] text-gold-200">
          <ShieldAlert size={12} /> Never send money, PINs or codes in chat. Use SafeSwap.
        </div>
        {msgs.map((m, i) => {
          const day = new Date(m.ts).toDateString()
          const sep = day !== lastDay ? (lastDay = day) : null
          const prev = msgs[i - 1], next = msgs[i + 1]
          const firstOfRun = !prev || prev.from !== m.from || !!sep || prev.system
          const lastOfRun = !next || next.from !== m.from || new Date(next.ts).toDateString() !== day
          const myR = s.reacts[m.id]
          const reactions = { ...(m.reactions ?? {}) }
          if (myR) reactions[myR] = (reactions[myR] ?? 0) + 1
          return (
            <div key={m.id}>
              {sep && <p className="my-3 text-center"><span className="rounded-full bg-fg/5 px-3 py-1 text-[11px] text-slate-400">{new Date(m.ts).toDateString() === new Date().toDateString() ? 'Today' : new Date(m.ts).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}</span></p>}
              {m.system ? (
                <p className="my-2 text-center text-[11px] text-slate-400">{m.text}</p>
              ) : (
                <motion.div initial={m.mine ? { opacity: 0, y: 12, scale: 0.96 } : { opacity: 0, x: -8 }} animate={{ opacity: 1, y: 0, x: 0, scale: 1 }} transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                  className={`flex items-end gap-2 ${m.mine ? 'justify-end' : ''} ${lastOfRun ? 'mb-2' : 'mb-0.5'}`}>
                  {!m.mine && <div className="w-8 shrink-0">{lastOfRun && <div className="grid size-8 place-items-center rounded-full bg-ink-700 text-base">{m.flag || m.from[0]}</div>}</div>}
                  <div className={`relative max-w-[78%] ${Object.keys(reactions).length ? 'mb-3' : ''}`}>
                    <button onClick={(e) => { e.stopPropagation(); setPicked(picked?.id === m.id ? null : m) }} onDoubleClick={() => react(m, '❤️')}
                      className={`block w-full px-3.5 py-2 text-start text-[15px] leading-snug shadow-sm ${m.mine
                        ? `bg-gradient-to-br from-mint-400 to-emerald-500 text-ink-950 ${firstOfRun ? 'rounded-2xl' : 'rounded-2xl rounded-tr-md'} ${lastOfRun ? 'rounded-br-md' : ''}`
                        : `border border-fg/5 bg-ink-800 ${firstOfRun ? 'rounded-2xl' : 'rounded-2xl rounded-tl-md'} ${lastOfRun ? 'rounded-bl-md' : ''}`} ${picked?.id === m.id ? 'ring-2 ring-gold-300' : ''}`}>
                      {!m.mine && firstOfRun && <p className={`mb-0.5 text-xs font-bold ${colorFor(m.from)}`}>{m.from}</p>}
                      {m.replyTo && <div className={`mb-1.5 rounded-lg border-s-4 px-2 py-1 text-xs ${m.mine ? 'border-ink-950/40 bg-ink-950/10' : 'border-mint-400 bg-fg/5'}`}><p className="font-bold">{m.replyTo.from}</p><p className="line-clamp-1 opacity-80">{m.replyTo.text}</p></div>}
                      {m.voice ? <VoiceBubble src={m.voice} dur={m.dur ?? 1} mine={m.mine} seed={m.id} /> : <span className="whitespace-pre-wrap break-words">{m.text}</span>}
                      <span className={`ms-2 inline-flex translate-y-0.5 items-center gap-0.5 text-[10px] ${m.mine ? 'text-ink-950/60' : 'text-slate-500'}`}>
                        {new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {m.mine && (Date.now() - m.ts > 2500 ? <CheckCheck size={13} className="text-sky-800" /> : <Check size={13} />)}
                      </span>
                    </button>
                    {Object.keys(reactions).length > 0 && (
                      <div className={`absolute -bottom-3.5 flex gap-0.5 rounded-full border border-fg/10 bg-ink-800 px-1.5 py-0.5 text-xs shadow ${m.mine ? 'end-2' : 'start-2'}`}>
                        {Object.entries(reactions).map(([e, n]) => <span key={e} className={myR === e ? 'font-bold' : ''}>{e}{n > 1 ? <span className="text-[10px] text-slate-400"> {n}</span> : ''}</span>)}
                      </div>
                    )}
                    <AnimatePresence>
                      {picked?.id === m.id && (
                        <motion.div initial={{ opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} onClick={(e) => e.stopPropagation()}
                          className={`absolute bottom-full z-10 mb-2 flex flex-col gap-1 rounded-2xl border border-fg/10 bg-ink-800 p-1.5 shadow-2xl ${m.mine ? 'end-0' : 'start-0'}`}>
                          <div className="flex gap-0.5">{QUICK.map((e) => <button key={e} onClick={() => react(m, e)} className={`grid size-9 place-items-center rounded-xl text-xl transition hover:scale-125 ${myR === e ? 'bg-mint-400/20' : ''}`}>{e}</button>)}</div>
                          <div className="flex gap-1 text-xs">
                            <button className="btn flex-1 bg-fg/5 px-2 py-1.5" onClick={() => { setReplyTo(m); setPicked(null); inputRef.current?.focus() }}><Reply size={13} /> Reply</button>
                            <button className="btn flex-1 bg-fg/5 px-2 py-1.5" onClick={() => { navigator.clipboard?.writeText(m.text).catch(() => {}); setPicked(null); toast({ title: 'Copied', emoji: '📋' }) }}><Copy size={13} /></button>
                            {m.mine ? <button className="btn flex-1 bg-rose-500/10 px-2 py-1.5 text-rose-300" onClick={() => del(m)}><Trash2 size={13} /></button> : <>
                              <button className="btn flex-1 bg-rose-500/10 px-2 py-1.5 text-rose-300" onClick={() => report(m)}><Flag size={13} /></button>
                              <button className="btn flex-1 bg-rose-500/10 px-2 py-1.5 text-rose-300" onClick={() => block(m)}><Ban size={13} /></button>
                            </>}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </div>
          )
        })}
        <AnimatePresence>
          {typing && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mb-2 flex items-end gap-2">
              <div className="w-8" />
              <div className="flex gap-1 rounded-2xl rounded-bl-md border border-fg/5 bg-ink-800 px-4 py-3">
                {[0, 1, 2].map((d) => <motion.span key={d} className="size-2 rounded-full bg-slate-400" animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: d * 0.15 }} />)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* composer */}
      {!joined ? (
        <div className="border-t border-fg/10 bg-ink-900/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button className="btn-primary w-full py-4" onClick={() => gate(1, 'Join group chats') && setRules(true)}>Join {g.name} to chat</button>
        </div>
      ) : (
        <div className="border-t border-fg/10 bg-ink-900/90 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <AnimatePresence>
            {warn && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mb-2 flex items-start gap-2 rounded-2xl bg-rose-500/10 p-2.5 text-xs text-rose-200">
                <span className="flex-1">{warn}</span><button onClick={() => setWarn(null)} aria-label="Dismiss"><X size={14} /></button>
              </motion.div>
            )}
          </AnimatePresence>
          {replyTo && (
            <div className="mb-2 flex items-center gap-2 rounded-2xl border-s-4 border-mint-400 bg-fg/5 px-3 py-2 text-xs">
              <Reply size={14} className="text-mint-300" />
              <div className="min-w-0 flex-1"><p className="font-bold">{replyTo.mine ? 'You' : replyTo.from}</p><p className="truncate text-slate-400">{replyTo.text}</p></div>
              <button onClick={() => setReplyTo(null)} aria-label="Cancel reply"><X size={14} /></button>
            </div>
          )}
          {emoji && <div className="mb-2 flex flex-wrap gap-1">{EMOJI_ROW.map((e) => <button key={e} onClick={() => setText((t) => t + e)} className="grid size-9 place-items-center rounded-xl text-xl hover:bg-fg/5">{e}</button>)}</div>}
          {muted ? (
            <p className="rounded-2xl bg-fg/5 p-3 text-center text-sm text-slate-400">🔇 Muted for breaking the rules · {Math.ceil((s.chatStrikes.until - Date.now()) / 1000 / 60)} min left</p>
          ) : (
            recorder.rec ? <RecordingBar sec={recorder.sec} onSend={recorder.stop} onCancel={recorder.cancel} /> :
            <div className="flex items-end gap-2">
              <button onClick={() => setEmoji(!emoji)} className={`grid size-11 shrink-0 place-items-center rounded-2xl ${emoji ? 'bg-mint-400/20 text-mint-300' : 'bg-fg/5 text-slate-400'}`} aria-label="Emoji"><Smile size={20} /></button>
              <textarea ref={inputRef} rows={1} value={text} placeholder="Message" maxLength={1000}
                onChange={(e) => { setText(e.target.value); if (warn) setWarn(null); e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px` }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                className="max-h-30 min-h-11 flex-1 resize-none rounded-2xl border border-fg/10 bg-ink-800 px-4 py-2.5 text-[15px] outline-none focus:border-mint-400/50" />
              {!text.trim() ? <MicButton onClick={recorder.start} /> : <motion.button whileTap={{ scale: 0.85, rotate: -15 }} onClick={send} disabled={!text.trim()} aria-label="Send"
                className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-mint-400 to-emerald-500 text-ink-950 shadow-lg shadow-emerald-500/30 transition disabled:opacity-30 disabled:shadow-none">
                <SendHorizontal size={20} className="rtl:rotate-180" />
              </motion.button>}
            </div>
          )}
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={g.name}>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3"><GroupAvatar g={g} size="size-16" /><div><p className="text-sm text-slate-300">{g.desc}</p><p className="mt-1 text-xs text-slate-500">{g.members.toLocaleString()} members · {g.cat}</p></div></div>
          <div className="rounded-2xl bg-fg/[0.03] p-4"><p className="label mb-2 flex items-center gap-1"><Info size={12} /> Rules</p>{g.rules.map((r, i) => <p key={r} className="text-sm">{i + 1}. {r}</p>)}</div>
          {joined && <>
            <button className="btn-ghost justify-start" onClick={() => set((p) => ({ ...p, mutedGroups: isMutedGroup ? p.mutedGroups.filter((x) => x !== id) : [...p.mutedGroups, id] }))}>
              {isMutedGroup ? <><BellRing size={18} /> Unmute notifications</> : <><BellOff size={18} /> Mute notifications</>}
            </button>
            <button className="btn-ghost justify-start text-rose-300" onClick={() => { set((p) => ({ ...p, joinedGroups: p.joinedGroups.filter((x) => x !== id) })); setMenu(false); nav('/chats') }}><LogOut size={18} /> Leave group</button>
          </>}
          <button className="btn-ghost justify-start text-rose-300" onClick={() => { setMenu(false); toast({ title: 'Group reported to Luda moderators', emoji: '🛡️' }) }}><Flag size={18} /> Report group</button>
          {s.blockedUsers.length > 0 && <button className="text-xs text-slate-400 underline" onClick={() => set((p) => ({ ...p, blockedUsers: [] }))}>Unblock {s.blockedUsers.length} user(s)</button>}
        </div>
      </Sheet>
      {rules && <JoinRules g={g} onClose={() => setRules(false)} after={() => {}} />}
    </div>
  )
}
