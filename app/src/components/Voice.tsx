import { motion } from 'framer-motion'
import { Mic, Pause, Play, SendHorizontal, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const MAX_SEC = 60

/** Tap mic → record → send / cancel. Returns a data: URL (audio) + duration. */
export function useRecorder(onDone: (url: string, dur: number) => void, onError: (msg: string) => void) {
  const [rec, setRec] = useState(false)
  const [sec, setSec] = useState(0)
  const mr = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const cancelled = useRef(false)
  const started = useRef(0)
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const m = new MediaRecorder(stream)
      chunks.current = []; cancelled.current = false
      m.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      m.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const dur = Math.max(1, Math.round((Date.now() - started.current) / 1000))
        if (cancelled.current || !chunks.current.length) return
        const r = new FileReader(); r.onload = () => onDone(String(r.result), dur); r.readAsDataURL(new Blob(chunks.current, { type: m.mimeType }))
      }
      mr.current = m; started.current = Date.now(); setSec(0); m.start(); setRec(true)
    } catch { onError('Microphone not available. Allow mic access in your browser settings.') }
  }
  function stop() { if (mr.current?.state === 'recording') mr.current.stop(); setRec(false) }
  const cancel = () => { cancelled.current = true; stop() }
  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => { const s = Math.floor((Date.now() - started.current) / 1000); setSec(s); if (s >= MAX_SEC) stop() }, 250)
    return () => clearInterval(t)
  })
  return { rec, sec, start, stop, cancel }
}

export function RecordingBar({ sec, onSend, onCancel }: { sec: number; onSend: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-1 items-center gap-3">
      <button onClick={onCancel} aria-label="Cancel recording" className="grid size-11 place-items-center rounded-2xl bg-rose-500/15 text-rose-300"><Trash2 size={18} /></button>
      <div className="flex flex-1 items-center gap-2 rounded-2xl border border-rose-400/30 bg-rose-500/5 px-4 py-3">
        <motion.span className="size-2.5 rounded-full bg-rose-500" animate={{ opacity: [1, 0.2, 1] }} transition={{ repeat: Infinity, duration: 1 }} />
        <span className="font-mono text-sm">{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}</span>
        <div className="flex flex-1 items-center justify-end gap-0.5">{Array.from({ length: 18 }).map((_, i) => <motion.span key={i} className="w-1 rounded-full bg-rose-400/70" animate={{ height: [4, 6 + ((i * 7) % 14), 4] }} transition={{ repeat: Infinity, duration: 0.6 + (i % 4) * 0.1 }} />)}</div>
      </div>
      <button onClick={onSend} aria-label="Send voice note" className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-mint-400 to-emerald-500 text-ink-950"><SendHorizontal size={18} /></button>
    </div>
  )
}

export function MicButton({ onClick }: { onClick: () => void }) {
  return <motion.button whileTap={{ scale: 0.85 }} onClick={onClick} aria-label="Record voice note" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-mint-400 to-emerald-500 text-ink-950 shadow-lg shadow-emerald-500/30"><Mic size={20} /></motion.button>
}

/** Playable voice note with a simple waveform. */
export function VoiceBubble({ src, dur, mine, seed }: { src: string; dur: number; mine?: boolean; seed: string }) {
  const [playing, setPlaying] = useState(false)
  const [pos, setPos] = useState(0)
  const a = useRef<HTMLAudioElement | null>(null)
  const bars = Array.from({ length: 26 }, (_, i) => 6 + ((seed.charCodeAt(i % seed.length) * (i + 3)) % 18))
  const toggle = () => {
    if (!a.current) {
      a.current = new Audio(src)
      a.current.ontimeupdate = () => setPos(a.current!.currentTime / (a.current!.duration || dur))
      a.current.onended = () => { setPlaying(false); setPos(0) }
    }
    if (playing) { a.current.pause(); setPlaying(false) } else { a.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false)) }
  }
  useEffect(() => () => a.current?.pause(), [])
  return (
    <div className="flex min-w-48 items-center gap-2">
      <button onClick={(e) => { e.stopPropagation(); toggle() }} aria-label={playing ? 'Pause' : 'Play'} className={`grid size-9 shrink-0 place-items-center rounded-full ${mine ? 'bg-ink-950/20' : 'bg-mint-400/20 text-mint-300'}`}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
      <div className="flex flex-1 items-center gap-0.5">{bars.map((h, i) => <span key={i} className={`w-1 rounded-full ${i / bars.length < pos ? (mine ? 'bg-ink-950' : 'bg-mint-300') : mine ? 'bg-ink-950/35' : 'bg-slate-500'}`} style={{ height: h }} />)}</div>
      <span className="text-[11px] opacity-70">{Math.floor(dur / 60)}:{String(dur % 60).padStart(2, '0')}</span>
    </div>
  )
}
