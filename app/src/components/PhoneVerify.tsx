import { Loader2, Phone, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../lib/store'
import { LIVE, api } from '../lib/live'
import { useLive } from '../lib/liveStore'

/** One-time SMS check. Cheap for real users, expensive for spammers. */
export function PhoneVerify({ compact }: { compact?: boolean }) {
  if (LIVE) return <LivePhoneVerify compact={compact} />
  return <DemoPhoneVerify compact={compact} />
}

/** Live: a real SMS code (Twilio Verify). One Luda account per phone number. */
function LivePhoneVerify({ compact }: { compact?: boolean }) {
  const { s } = useStore()
  const { refresh } = useLive()
  const [phone, setPhone] = useState('+90 5')
  const [sent, setSent] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (s.phoneVerified) return <p className="flex items-center gap-1 text-xs text-mint-300"><ShieldCheck size={14} /> Phone verified</p>
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(''); try { await fn() } catch (e) { setErr(e instanceof Error ? e.message : 'Try again') } finally { setBusy(false) } }
  return (
    <div className="flex flex-col gap-2">
      {!compact && <p className="text-sm font-semibold">Verify your phone number (one time)</p>}
      {!sent ? (
        <div className="flex gap-2">
          <input className="input py-2.5" value={phone} onChange={(e) => { setPhone(e.target.value); setErr('') }} inputMode="tel" autoComplete="tel" aria-label="Phone number" />
          <button className="btn-primary shrink-0 px-3 py-2.5 text-sm" disabled={busy || phone.replace(/\D/g, '').length < 10} onClick={() => run(async () => { const r = await api('POST', 'phone-start', { phone }); setSent(r.phone) })}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Phone size={14} />} Send</button>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">Enter the code we texted to {sent}. <button className="underline" onClick={() => { setSent(''); setCode('') }}>Change number</button></p>
          <div className="flex gap-2">
            <input className="input py-2.5 font-mono tracking-widest" maxLength={8} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setErr('') }} inputMode="numeric" autoComplete="one-time-code" aria-label="SMS code" />
            <button className="btn-primary shrink-0 px-3 py-2.5 text-sm" disabled={busy || code.length < 4} onClick={() => run(async () => { await api('POST', 'phone-check', { phone: sent, code }); await refresh() })}>{busy ? <Loader2 size={14} className="animate-spin" /> : null} Verify</button>
          </div>
        </>
      )}
      {err && <p className="text-xs text-rose-300">{err}</p>}
      <p className="text-[11px] text-slate-500">One Luda account per phone number. We never show your number to others.</p>
    </div>
  )
}

function DemoPhoneVerify({ compact }: { compact?: boolean }) {
  const { s, set } = useStore()
  const [phone, setPhone] = useState('+90 5')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  if (s.phoneVerified) return <p className="flex items-center gap-1 text-xs text-mint-300"><ShieldCheck size={14} /> Phone verified</p>
  return (
    <div className="flex flex-col gap-2">
      {!compact && <p className="text-sm font-semibold">Verify your phone number (one time)</p>}
      {!sent ? (
        <div className="flex gap-2">
          <input className="input py-2.5" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" aria-label="Phone number" />
          <button className="btn-primary shrink-0 px-3 py-2.5 text-sm" disabled={phone.replace(/\D/g, '').length < 10} onClick={() => setSent(true)}><Phone size={14} /> Send</button>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-400">Enter the 6-digit SMS code. <span className="text-gold-300">Demo code: 482913</span></p>
          <div className="flex gap-2">
            <input className="input py-2.5 font-mono tracking-widest" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" aria-label="SMS code" />
            <button className="btn-primary shrink-0 px-3 py-2.5 text-sm" disabled={code !== '482913'} onClick={() => set((p) => ({ ...p, phoneVerified: true }))}>Verify</button>
          </div>
        </>
      )}
    </div>
  )
}
