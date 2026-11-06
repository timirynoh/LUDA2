// 6-digit sign-in code (v1.13.0, owner: '6 digits to sign in, 4 digits only for payments'). The code lives only on
// the server (hashed; 5 wrong = locked 15 minutes). The 4-digit PIN keeps approving payments.
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { api, LIVE } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { PinPad, Sheet } from './ui'

/** Create (or change) the sign-in code: [current code or payment PIN] → new 6 digits → same again. */
export function PasscodeSetup({ pin: knownPin, change, onDone }: { pin?: string; change?: boolean; onDone: () => void }) {
  const { refresh } = useLive()
  const [step, setStep] = useState<'proof' | 'new' | 'again'>(knownPin ? 'new' : 'proof')
  const [proof, setProof] = useState(knownPin ?? '')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const title = step === 'proof' ? (change ? 'Enter your current 6-digit code' : 'Enter your 4-digit payment PIN') : step === 'new' ? 'Create your 6-digit sign-in code' : 'Type the same 6 digits again'
  const done = async (v: string) => {
    setErr('')
    if (step === 'proof') { setProof(v); return setStep('new') }
    if (step === 'new') {
      if (/^(\d)\1{5}$/.test(v) || '0123456789'.includes(v) || '9876543210'.includes(v)) return setErr('Too easy to guess. Try another code.')
      setCode(v); return setStep('again')
    }
    if (v !== code) { setStep('new'); return setErr('The two codes were different. Start again.') }
    try {
      await api('POST', 'passcode', change ? { code: v, oldCode: proof } : { code: v, pin: proof })
      await refresh(); onDone()
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Try again'
      setStep(/wrong|pin|too many|code first/i.test(m) && !/guess/i.test(m) ? (knownPin && !change ? 'new' : 'proof') : 'new'); setErr(m)
    }
  }
  return (
    <div className="flex flex-col items-center gap-4 pb-4">
      <p className="text-center text-lg font-bold">{title}</p>
      <p className="text-center text-xs text-slate-400">{step === 'proof' ? (change ? 'To change it, first type the code you use now.' : 'To prove it\'s you.') : 'You\'ll type these 6 digits to open Luda. Your 4-digit PIN stays for approving payments.'}</p>
      <PinPad key={step} length={step === 'proof' && !change ? 4 : 6} error={err} onDone={(v) => void done(v)} />
    </div>
  )
}

export function PasscodeSheet({ onClose }: { onClose: () => void }) {
  const { me } = useLive()
  return <Sheet open onClose={onClose} title={me?.profile.hasPasscode ? 'Change sign-in code' : 'Set your sign-in code'}><PasscodeSetup change={!!me?.profile.hasPasscode} onDone={onClose} /></Sheet>
}

/** Existing users: once per visit, explain the update and let them set the code in a few seconds. */
export function PasscodeNudge() {
  const { me } = useLive()
  const [open, setOpen] = useState(() => { try { return !sessionStorage.getItem('luda.passcodeNudge') } catch { return true } })
  const [setting, setSetting] = useState(false)
  if (!LIVE || !open || !me?.profile.hasPin || me.profile.hasPasscode) return null
  const later = () => { try { sessionStorage.setItem('luda.passcodeNudge', '1') } catch { /* ignore */ }; setOpen(false) }
  return (
    <Sheet open onClose={later} title={setting ? 'Sign-in code' : 'New in Luda'}>
      {setting ? <PasscodeSetup onDone={later} /> : (
        <div className="flex flex-col gap-3 pb-4">
          <div className="flex items-start gap-3 rounded-2xl bg-mint-400/10 p-3"><ShieldCheck className="shrink-0 text-mint-300" /><p className="text-sm">To keep your money safer, Luda now uses a <b>6-digit code to open the app</b>. Your <b>4-digit PIN</b> is still the one that approves payments.</p></div>
          <p className="text-xs text-slate-400">It takes 10 seconds: type your payment PIN once, then choose 6 digits.</p>
          <button className="btn-primary py-4" onClick={() => setSetting(true)}><KeyRound size={17} /> Set my 6-digit code</button>
          <button className="btn-ghost py-3 text-sm" onClick={later}>Later</button>
        </div>
      )}
    </Sheet>
  )
}
