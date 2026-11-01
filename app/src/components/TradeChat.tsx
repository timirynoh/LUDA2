import { ImagePlus, SendHorizontal, ShieldAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { checkText } from '../lib/moderation'
import { uid, useStore } from '../lib/store'
import { counterReply, thumb, type ThreadMsg } from '../lib/threads'

/** Private chat between the two sides of a trade or job, with photo sharing and an appeal shortcut. */
export function TradeChat({ threadKey, name, flag, onAppeal, intro }: { threadKey: string; name: string; flag?: string; onAppeal?: () => void; intro?: string }) {
  const { s, set, toast } = useStore()
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const msgs: ThreadMsg[] = s.threads[threadKey] ?? []
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [msgs.length, typing])
  const push = (m: ThreadMsg) => set((p) => ({ ...p, threads: { ...p.threads, [threadKey]: [...(p.threads[threadKey] ?? []), m].slice(-150) } }))
  const reply = (t: string) => { setTyping(true); setTimeout(() => { setTyping(false); push({ id: uid(), from: 'them', text: counterReply(t), ts: Date.now() }) }, 1600) }
  const send = () => {
    const body = text.trim(); if (!body) return
    const c = checkText(body)
    if (!c.ok) return toast({ title: c.scam ? `Not sent: ${c.scam}` : 'Not sent: keep it respectful', emoji: '⚠️' })
    push({ id: uid(), from: 'me', text: body, ts: Date.now() }); setText(''); reply(body)
  }
  const attach = async (f?: File) => { if (!f) return; push({ id: uid(), from: 'me', text: '', img: await thumb(f), ts: Date.now() }); reply('photo') }

  return (
    <div className="overflow-hidden rounded-3xl border border-fg/10 bg-ink-800/60">
      <div className="flex items-center gap-2 border-b border-fg/10 px-3 py-2">
        <span className="grid size-8 place-items-center rounded-full bg-ink-700">{flag ?? name[0]}</span>
        <div className="flex-1"><p className="text-sm font-semibold">{name}</p><p className="text-[10px] text-mint-300">{typing ? 'typing…' : '● online · chat is recorded for your safety'}</p></div>
        {onAppeal && <button onClick={onAppeal} className="chip bg-rose-500/15 py-1.5 text-rose-300"><ShieldAlert size={12} /> Appeal</button>}
      </div>
      <div ref={box} className="flex max-h-64 min-h-32 flex-col gap-1.5 overflow-y-auto p-3">
        <p className="mx-auto mb-1 rounded-full bg-gold-400/10 px-3 py-1 text-center text-[10px] text-gold-200">{intro ?? 'Keep all talk & payments inside Luda. Never share PINs or codes.'}</p>
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-sm ${m.from === 'me' ? 'rounded-br-md bg-gradient-to-br from-mint-400 to-emerald-500 text-ink-950' : 'rounded-bl-md bg-ink-700'}`}>
              {m.img && <img src={m.img} alt="Shared" className="mb-1 max-h-40 rounded-xl" />}
              {m.text}<span className="ms-2 text-[9px] opacity-60">{new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        ))}
        {typing && <div className="w-fit rounded-2xl rounded-bl-md bg-ink-700 px-3 py-2 text-xs text-slate-400">• • •</div>}
      </div>
      <div className="flex items-center gap-2 border-t border-fg/10 p-2">
        <label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl bg-fg/5 text-slate-400" aria-label="Send photo"><ImagePlus size={18} />
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { attach(e.target.files?.[0]); e.target.value = '' }} /></label>
        <input className="input py-2.5" placeholder={`Message ${name.split(' ')[0]}`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button onClick={send} disabled={!text.trim()} aria-label="Send" className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-mint-400 to-emerald-500 text-ink-950 disabled:opacity-30"><SendHorizontal size={18} /></button>
      </div>
    </div>
  )
}
