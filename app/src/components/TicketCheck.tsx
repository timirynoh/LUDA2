// Luda HQ → Ticket check (v1.12.0). Drivers / Luda staff with the 'tickets' role scan a passenger's live ticket QR.
// The server makes the 30-second code and checks it (valid today, not used, not refunded), so screenshots and old
// tickets fail. Phones without a camera scanner can type the ticket code instead (then check the name and ID).
import { Camera, CameraOff, CheckCircle2, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/live'
import { errMsg } from './LiveMoney'

interface Result { ok: boolean; verdict: string; ticket?: { code: string; holder: string; username: string; verified: boolean; from: string; to: string; date: string; time: string; returnDate: string | null; returnTime: string | null; pax: number } }
type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }

export function TicketCheck() {
  const [res, setRes] = useState<Result | null>(null)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [cam, setCam] = useState(false)
  const busy = useRef(false)
  const video = useRef<HTMLVideoElement>(null)
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window

  const check = useCallback(async (payload: string) => {
    if (busy.current) return
    busy.current = true; setErr('')
    try { setRes(await api<Result>('POST', 'ticket-check', payload.startsWith('luda://') ? { payload } : { code: payload })); navigator.vibrate?.(120) }
    catch (e) { setErr(errMsg(e)) }
    finally { setTimeout(() => { busy.current = false }, 2500) }
  }, [])

  useEffect(() => {
    if (!cam) return
    let stream: MediaStream | null = null, timer = 0, alive = true
    const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector
    const det = new Ctor({ formats: ['qr_code'] })
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then((s) => {
      if (!alive) { s.getTracks().forEach((t) => t.stop()); return }
      stream = s
      if (video.current) { video.current.srcObject = s; void video.current.play() }
      const loop = async () => {
        if (!alive) return
        if (video.current && video.current.readyState >= 2 && !busy.current) {
          const hits = await det.detect(video.current).catch(() => [])
          const v = hits.find((h) => h.rawValue.startsWith('luda://ticket/'))?.rawValue
          if (v) void check(v)
        }
        timer = window.setTimeout(loop, 300)
      }
      void loop()
    }).catch(() => { setErr('Camera not available. Allow the camera, or type the ticket code below.'); setCam(false) })
    return () => { alive = false; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [cam, check])

  const t = res?.ticket
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-400">Scan the passenger's ticket in their Luda app (the QR changes every 30 seconds, so screenshots fail). Each ticket can be used once (a return ticket twice: once each way, on its dates).</p>
      {canScan ? (
        <button className={`btn py-4 ${cam ? 'bg-rose-500 text-white' : 'btn-primary'}`} onClick={() => setCam(!cam)}>{cam ? <><CameraOff size={18} /> Stop camera</> : <><Camera size={18} /> Scan a ticket</>}</button>
      ) : <p className="rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100">This browser can't scan QR codes. Use Chrome on Android, or type the ticket code.</p>}
      {cam && <video ref={video} playsInline muted className="aspect-square w-full rounded-3xl bg-black object-cover" />}
      <div className="flex gap-2">
        <input className="input flex-1 font-mono uppercase tracking-widest" placeholder="Ticket code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} />
        <button className="btn-ghost px-4" disabled={code.length < 4} onClick={() => void check(code)}>Check</button>
      </div>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {res && (
        <div className={`rounded-3xl p-5 text-center ${res.ok ? 'bg-mint-400/15 ring-2 ring-mint-400/60' : 'bg-rose-500/15 ring-2 ring-rose-400/60'}`}>
          {res.ok ? <CheckCircle2 size={56} className="mx-auto text-mint-300" /> : <XCircle size={56} className="mx-auto text-rose-300" />}
          <p className={`mt-2 text-xl font-extrabold ${res.ok ? 'text-mint-200' : 'text-rose-200'}`}>{res.verdict}</p>
          {t && <div className="mt-3 rounded-2xl bg-fg/[0.06] p-3 text-start text-sm">
            <p className="text-lg font-bold">{t.holder}{t.verified ? ' ✓' : ''} <span className="text-xs font-normal text-slate-400">@{t.username}</span></p>
            <p>{t.from} → {t.to}{t.pax > 1 ? ` · ${t.pax} people` : ''}</p>
            <p className="text-xs text-slate-400">{t.date} {t.time}{t.returnDate ? ` · return ${t.returnDate} ${t.returnTime ?? ''}` : ''} · {t.code}</p>
          </div>}
        </div>
      )}
    </div>
  )
}
