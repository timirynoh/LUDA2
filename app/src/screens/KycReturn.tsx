import { CheckCircle2, Clock, Loader2, RotateCcw, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/ui'
import { api } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { NewCaseSheet } from '../components/LiveSupport'

interface Res { status: string; message?: string; name?: string | null; triesLeft?: number }
const WAIT_MS = 2 * 60_000 // owner's rule: stop waiting after 2 minutes and say what to do next

/** Where Didit sends people after the ID + selfie check. The result is asked from Didit by the server. */
export default function KycReturn() {
  const { refresh } = useLive()
  const [r, setR] = useState<Res | null>(null)
  const [gaveUp, setGaveUp] = useState(false)
  const [appeal, setAppeal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    let alive = true, timer = 0
    const t0 = Date.now()
    const poll = async () => {
      try {
        const x = await api<Res>('GET', 'kyc-status')
        if (!alive) return
        setR(x)
        if (x.status === 'verified' || x.status === 'failed') { refresh(); return }
      } catch { /* keep trying */ }
      if (!alive) return
      if (Date.now() - t0 >= WAIT_MS) { setGaveUp(true); refresh(); return }
      timer = window.setTimeout(poll, 4000)
    }
    void poll()
    return () => { alive = false; clearTimeout(timer) }
  }, [refresh])
  const retry = async () => {
    setBusy(true); setErr('')
    try { const x = await api<{ url?: string }>('POST', 'kyc-start'); if (x.url) window.location.assign(x.url) } catch (e) { setErr(e instanceof Error ? e.message : 'Try again later'); setBusy(false) }
  }
  const st = r?.status, left = r?.triesLeft ?? 0
  const Next = () => (
    <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
      {left > 0 ? <button className="btn-primary py-3.5" disabled={busy} onClick={() => void retry()}><RotateCcw size={16} /> Try again ({left} left today)</button>
        : <p className="rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100">You've used today's 2 ID checks. You can try again tomorrow.</p>}
      <button className="btn-ghost py-3 text-sm" onClick={() => setAppeal(true)}>Contact the Luda team with my ID</button>
      {err && <p className="text-xs text-rose-300">{err}</p>}
    </div>
  )
  return (
    <div>
      <Header back title="Identity check" />
      <div className="flex flex-col items-center gap-3 px-6 pt-10 text-center">
        {st === 'verified' ? <><CheckCircle2 size={56} className="text-mint-400" /><p className="text-xl font-extrabold">You're verified 🎉</p><p className="text-sm text-slate-400">{r?.name ? `Verified as ${r.name}. ` : ''}Withdrawals, sending money, jobs and P2P are now unlocked.</p></> :
          st === 'failed' ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">Not approved</p><p className="text-sm text-slate-400">{r?.message ?? 'Try again with a clear photo of a valid document.'}</p><Next /></> :
          gaveUp ? <><Clock size={56} className="text-gold-300" /><p className="text-lg font-bold">We couldn't confirm your ID yet</p>
            <p className="text-sm text-slate-400">Your check didn't come back in time. If it is approved later, you'll see ✅ Verified in your wallet. If you didn't finish the photo and selfie, try again.</p><Next /></> :
          <><Loader2 size={56} className="animate-spin text-violet-300" /><p className="text-lg font-bold">Checking your ID…</p><p className="text-sm text-slate-400">This usually takes under a minute. We'll wait up to 2 minutes.</p></>}
        <Link to="/wallet" className="btn-ghost mt-2 w-full max-w-xs py-3 text-sm">Go to my wallet</Link>
        {appeal && <NewCaseSheet category="kyc" subject="My ID check didn't go through" onClose={() => setAppeal(false)} />}
      </div>
    </div>
  )
}
