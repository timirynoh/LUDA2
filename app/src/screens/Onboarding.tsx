import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PinPad } from '../components/ui'
import { PasscodeSetup } from '../components/Passcode'
import { hashPin, randomSecret } from '../lib/crypto'
import { CITIES, COUNTRIES } from '../lib/data'
import { useStore } from '../lib/store'
import { LIVE, api, type Me } from '../lib/live'

export default function Onboarding() {
  const { s, set, t, reward } = useStore()
  const [step, setStep] = useState(0)
  const next = () => setStep((x) => x + 1)

  const [pinErr, setPinErr] = useState('')
  const [hasServerPin, setHasServerPin] = useState<boolean | null>(LIVE ? null : false)
  const [hasCode, setHasCode] = useState(false)
  const [codePin, setCodePin] = useState<string | null>(null) // live: PIN accepted, now create the 6-digit sign-in code
  useEffect(() => { if (LIVE) api<Me>('GET', 'me').then((m) => { setHasServerPin(m.profile.hasPin); setHasCode(!!m.profile.hasPasscode) }).catch(() => setHasServerPin(false)) }, [])
  const complete = () => {
    set((p) => ({ ...p, name: p.name || 'Friend', salt: '', pinHash: 'server', onboarded: true, createdAt: Date.now() }))
    reward(50, { badge: 'welcome', title: `Welcome to Luda, ${s.name || 'Friend'}!` })
  }
  const finish = async (pin: string) => {
    if (LIVE) {
      // The real PIN lives on the server (it approves every payment). On a new phone, re-enter the existing one.
      if (hasServerPin === null) { setPinErr('One moment, loading your account…'); return }
      try { await api('POST', hasServerPin ? 'pin-check' : 'pin', { pin }) } catch (e) { setPinErr(e instanceof Error ? e.message : 'Try again'); return }
      // No PIN (or hash of it) is kept on the phone in live mode. Next: the 6-digit code that opens the app.
      if (!hasCode) { setCodePin(pin); return }
      complete()
      return
    }
    const salt = randomSecret(8)
    const pinHash = await hashPin(pin, salt)
    set((p) => ({ ...p, name: p.name || 'Friend', salt, pinHash, onboarded: true, createdAt: Date.now() }))
    reward(50, { badge: 'welcome', title: `Welcome to Luda, ${s.name || 'Friend'}!` })
  }

  const steps = [
    <div key="1" className="flex flex-col gap-4">
      <h2 className="pt-8 text-3xl font-extrabold">{t('onb.country')}</h2>
      <div className="grid grid-cols-2 gap-2">
        {COUNTRIES.map((c) => (
          <button key={c.code} onClick={() => set((p) => ({ ...p, country: c.code }))}
            className={`glass flex flex-col items-start gap-1 rounded-2xl p-4 text-start transition ${s.country === c.code ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
            <span className="text-3xl">{c.flag}</span>
            <span className="font-semibold">{c.name}</span>
            <span className="text-xs text-slate-500">{c.currency}</span>
          </button>
        ))}
      </div>
    </div>,
    <div key="2" className="flex flex-col gap-4">
      <h2 className="pt-8 text-3xl font-extrabold">{t('onb.city')}</h2>
      <div className="grid gap-2">
        {CITIES.map((c) => (
          <button key={c.id} onClick={() => set((p) => ({ ...p, city: c.id }))}
            className={`glass flex items-center justify-between rounded-2xl px-4 py-4 text-start transition ${s.city === c.id ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
            <span><span className="font-semibold">{c.name}</span> <span className="text-slate-500">· {c.en}</span></span>
            {s.city === c.id && <Check size={18} className="text-mint-300" />}
          </button>
        ))}
      </div>
    </div>,
    <div key="4" className="flex flex-col gap-8">
      <div className="pt-8">
        <h2 className="text-3xl font-extrabold">{codePin ? 'One more: your sign-in code' : hasServerPin ? 'Enter your Luda PIN' : t('onb.pin')}</h2>
        <p className="mt-2 text-sm text-slate-400">{codePin ? '🔐 6 digits to open Luda. Your 4-digit PIN is only for payments.' : LIVE ? (hasServerPin ? '🔐 The PIN you already use for Luda payments.' : '🔐 You\'ll use it to approve every payment. Avoid 1234 or your birthday.') : '🔐 Hashed on-device. Needed for withdrawals and releasing escrow.'}</p>
      </div>
      {codePin ? <PasscodeSetup pin={codePin} onDone={complete} /> : <PinPad error={pinErr} onDone={(p) => { setPinErr(''); return finish(p) }} />}
    </div>,
  ]

  return (
    <div className="pb-safe flex min-h-dvh flex-col px-5 desk:min-h-[calc(100dvh-3rem)]">
      <div className="pt-safe flex gap-1.5">
        {steps.map((_, i) => <div key={i} className={`h-1 flex-1 rounded-full transition ${i <= step ? 'bg-mint-400' : 'bg-fg/10'}`} />)}
      </div>
      <div className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>{steps[step]}</motion.div>
        </AnimatePresence>
      </div>
      {step < 2 && (
        <div className="flex gap-3 pt-6">
          {step > 0 && <button className="btn-ghost" onClick={() => setStep(step - 1)}>{t('common.back')}</button>}
          <button className="btn-primary flex-1" onClick={next}>{t('onb.next')} <ArrowRight size={18} className="rtl:rotate-180" /></button>
        </div>
      )}
    </div>
  )
}
