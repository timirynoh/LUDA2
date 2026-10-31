import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { useState } from 'react'
import { PinPad } from '../components/ui'
import { hashPin, randomSecret } from '../lib/crypto'
import { CITIES, COUNTRIES } from '../lib/data'
import { useStore } from '../lib/store'

export default function Onboarding() {
  const { s, set, t, reward } = useStore()
  const [step, setStep] = useState(0)
  const next = () => setStep((x) => x + 1)

  const finish = async (pin: string) => {
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
        <h2 className="text-3xl font-extrabold">{t('onb.pin')}</h2>
        <p className="mt-2 text-sm text-slate-400">🔐 Hashed on-device. Needed for withdrawals and releasing escrow.</p>
      </div>
      <PinPad onDone={finish} />
    </div>,
  ]

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-8 sm:min-h-[calc(100dvh-3rem)]">
      <div className="flex gap-1.5 pt-6">
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
