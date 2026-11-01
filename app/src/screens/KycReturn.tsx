import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from '../components/ui'
import { api } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { NewCaseSheet } from '../components/LiveSupport'

/** Where Didit sends people after the ID + selfie check. The result is asked from Didit by the server. */
export default function KycReturn() {
  const { refresh } = useLive()
  const [r, setR] = useState<{ status: string; message?: string; name?: string | null } | null>(null)
  const [tries, setTries] = useState(0)
  const [appeal, setAppeal] = useState(false)
  useEffect(() => {
    let alive = true, timer = 0
    const poll = async (n: number) => {
      try {
        const x = await api<{ status: string; message?: string; name?: string | null }>('GET', 'kyc-status')
        if (!alive) return
        setR(x); setTries(n)
        if ((x.status === 'pending' || x.status === 'none') && n < 12) timer = window.setTimeout(() => poll(n + 1), 4000)
        else refresh()
      } catch { if (alive && n < 12) timer = window.setTimeout(() => poll(n + 1), 4000) }
    }
    poll(1)
    return () => { alive = false; clearTimeout(timer) }
  }, [refresh])
  const st = r?.status
  return (
    <div>
      <Header back title="Identity check" />
      <div className="flex flex-col items-center gap-3 px-6 pt-10 text-center">
        {st === 'verified' ? <><CheckCircle2 size={56} className="text-mint-400" /><p className="text-xl font-extrabold">You're verified 🎉</p><p className="text-sm text-slate-400">{r?.name ? `Verified as ${r.name}. ` : ''}Withdrawals and sending money are now unlocked.</p></> :
          st === 'failed' ? <><XCircle size={56} className="text-rose-400" /><p className="text-lg font-bold">Not approved</p><p className="text-sm text-slate-400">{r?.message ?? 'Try again with a clear photo of a valid document.'}</p>
            <button className="btn-ghost mt-2 text-sm" onClick={() => setAppeal(true)}>Send my ID to the Luda team instead</button></> :
          tries >= 12 ? <><Clock size={56} className="text-gold-300" /><p className="text-lg font-bold">Still being checked</p><p className="text-sm text-slate-400">Some checks take a few minutes. You'll see the result in your wallet; you can leave this page.</p></> :
          <><Loader2 size={56} className="animate-spin text-violet-300" /><p className="text-lg font-bold">Checking your ID…</p><p className="text-sm text-slate-400">This usually takes under a minute.</p></>}
        <Link to="/wallet" className="btn-primary mt-4 w-full max-w-xs py-4">Go to my wallet</Link>
        {appeal && <NewCaseSheet category="kyc" subject="My ID check was not approved" onClose={() => setAppeal(false)} />}
      </div>
    </div>
  )
}
