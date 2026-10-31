import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check } from 'lucide-react'
import { useState } from 'react'
import { PinPad } from '../components/ui'
import { hashPin, randomSecret } from '../lib/crypto'
import { CITIES, COUNTRIES, LANGS } from '../lib/data'
import { useStore } from '../lib/store'

export default function Onboarding() {
  const { s, set, t, reward } = useStore()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const next = () => setStep((x) => x + 1)

  const finish = async (pin: string) => {
    const salt = randomSecret(8)
    const pinHash = await hashPin(pin, salt)
    set((p) => ({ ...p, name: name.trim() || 'Friend', salt, pinHash, onboarded: true }))
    reward(50, { badge: 'welcome', title: `Welcome to Luda, ${name.trim() || 'Friend'}!` })
  }

  const steps = [
    <div key="0" className="flex flex-col gap-6">
      <div className="flex flex-col items-center pt-10 text-center">
        <motion.div initial={{ scale: 0.6, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring' }}
          className="mb-6 grid size-24 place-items-center rounded-[2rem] bg-gradient-to-br from-mint-400 via-emerald-500 to-gold-400 text-5xl font-black text-ink-950 shadow-2xl shadow-emerald-500/30">L</motion.div>
        <h1 className="text-5xl font-extrabold tracking-tight"><span className="text-gradient">Luda</span></h1>
        <p className="mt-3 max-w-xs text-slate-400">{t('onb.tag')}</p>
      </div>
      <p className="label">{t('onb.lang')}</p>
      <div className="grid gap-2">
        {LANGS.map((l) => (
          <button key={l.code} onClick={() => set((p) => ({ ...p, lang: l.code }))}
            className={`glass flex items-center gap-3 rounded-2xl px-4 py-3.5 text-start transition ${s.lang === l.code ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
            <span className="text-2xl">{l.flag}</span>
            <span className="flex-1 font-semibold">{l.native}</span>
            {s.lang === l.code && <Check size={18} className="text-mint-300" />}
          </button>
        ))}
      </div>
    </div>,
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
    <div key="3" className="flex flex-col gap-4">
      <h2 className="pt-8 text-3xl font-extrabold">{t('onb.name')}</h2>
      <input autoFocus className="input text-lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada, Kwame, Grace…" maxLength={24} />
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
      {step < 4 && (
        <div className="flex gap-3 pt-6">
          {step > 0 && <button className="btn-ghost" onClick={() => setStep(step - 1)}>{t('common.back')}</button>}
          <button className="btn-primary flex-1" onClick={next}>{step === 3 ? t('onb.go') : t('onb.next')} <ArrowRight size={18} className="rtl:rotate-180" /></button>
        </div>
      )}
    </div>
  )
}
