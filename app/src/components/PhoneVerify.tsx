import { Phone, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useStore } from '../lib/store'

/** One-time SMS check. Cheap for real users, expensive for spammers. */
export function PhoneVerify({ compact }: { compact?: boolean }) {
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
