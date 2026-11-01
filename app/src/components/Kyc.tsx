import { AnimatePresence, motion } from 'framer-motion'
import { BadgeCheck, Camera, Check, Clock, IdCard, Lock, ShieldCheck, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { COUNTRIES } from '../lib/data'
import { fmt } from '../lib/fx'
import { DOC_TYPES, KYC_LIMITS, type DocType } from '../lib/kyc'
import { useStore } from '../lib/store'
import { LIVE } from '../lib/live'
import { LiveKyc } from './LiveMoney'

const LIVENESS = ['Look straight at the camera', 'Slowly turn your head left', 'Now turn right', 'Give us a smile 😊']

/** Full KYC: document → front/back → liveness selfie → details → submit for review. */
export function KycFlow({ onDone }: { onDone?: () => void }) {
  if (LIVE) return <LiveKyc onDone={onDone} />
  return <DemoKycFlow onDone={onDone} />
}

function DemoKycFlow({ onDone }: { onDone?: () => void }) {
  const { s, set, notify } = useStore()
  const [step, setStep] = useState<'intro' | 'doc' | 'front' | 'back' | 'selfie' | 'details' | 'sent'>('intro')
  const [doc, setDoc] = useState<DocType>('passport')
  const [live, setLive] = useState(-1)
  const [d, setD] = useState({ fullName: s.account ? '' : s.name, dob: '', nationality: s.country })
  const sides = DOC_TYPES.find((x) => x.id === doc)!.sides

  useEffect(() => {
    if (live < 0 || live >= LIVENESS.length) return
    const t = setTimeout(() => setLive(live + 1), 1100)
    return () => clearTimeout(t)
  }, [live])

  if (s.kyc.status === 'verified') return <KycStatus />
  if (s.kyc.status === 'pending' || step === 'sent') return <KycStatus />

  const submit = () => {
    set((p) => ({ ...p, kyc: { status: 'pending', doc, fullName: d.fullName.trim(), dob: d.dob, nationality: d.nationality, submittedAt: Date.now() } }))
    notify('🕵🏾', 'KYC submitted. We’re reviewing your documents', '/profile')
    setStep('sent'); onDone?.()
  }
  const age = d.dob ? Math.floor((Date.now() - Date.parse(d.dob)) / (365.25 * 86_400_000)) : 0
  const photo = (next: typeof step) => (
    <label className="btn-primary cursor-pointer py-3.5"><Camera size={18} /> Take photo
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={() => setStep(next)} /></label>
  )
  const skip = (next: typeof step) => <button className="text-[11px] text-slate-500 underline" onClick={() => setStep(next)}>Skip (demo)</button>

  return (
    <AnimatePresence mode="wait">
      <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex flex-col gap-3">
        {step === 'intro' && <>
          <div className="flex items-center gap-3 rounded-2xl bg-mint-400/10 p-3"><ShieldCheck className="shrink-0 text-mint-300" /><p className="text-sm">KYC confirms you are who you say you are. It's required by law for withdrawals and keeps scammers out of Luda.</p></div>
          <ul className="grid gap-1.5 text-sm text-slate-300">
            <li>📄 A valid passport, TRNC residence permit or national ID</li><li>🤳 A quick selfie video check</li><li>⏱️ About 2 minutes · usually approved within minutes</li>
          </ul>
          <button className="btn-primary py-3.5" onClick={() => setStep('doc')}>Start KYC</button>
        </>}
        {step === 'doc' && <>
          <p className="text-sm font-semibold">Choose your document</p>
          {DOC_TYPES.map((x) => (
            <button key={x.id} onClick={() => setDoc(x.id)} className={`glass flex items-center gap-3 rounded-2xl p-3 text-start ${doc === x.id ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
              <span className="text-2xl">{x.emoji}</span><span className="flex-1 text-sm font-semibold">{x.label}</span>{doc === x.id && <Check size={16} className="text-mint-300" />}
            </button>
          ))}
          <button className="btn-primary py-3.5" onClick={() => setStep('front')}>Continue</button>
        </>}
        {(step === 'front' || step === 'back') && <>
          <p className="text-sm font-semibold">{step === 'front' ? (sides === 1 ? 'Photo page of your passport' : 'Front of your card') : 'Back of your card'}</p>
          <div className="relative grid h-40 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-mint-400/50 bg-fg/[0.03]">
            <IdCard size={48} className="text-mint-300/60" />
            <motion.div className="absolute inset-x-0 h-0.5 bg-mint-400 shadow-[0_0_12px] shadow-mint-400" animate={{ top: ['10%', '90%', '10%'] }} transition={{ repeat: Infinity, duration: 2.2 }} />
          </div>
          <p className="text-xs text-slate-400">Good light, all 4 corners visible, no glare.</p>
          {photo(step === 'front' && sides === 2 ? 'back' : 'selfie')}
          {skip(step === 'front' && sides === 2 ? 'back' : 'selfie')}
        </>}
        {step === 'selfie' && <>
          <p className="text-sm font-semibold">Liveness check</p>
          <div className="relative mx-auto grid size-44 place-items-center rounded-full border-4 border-mint-400/40 bg-fg/[0.03] text-6xl">
            <motion.span animate={live === 1 ? { rotateY: -35 } : live === 2 ? { rotateY: 35 } : { rotateY: 0 }}>{live >= 3 ? '😊' : '🙂'}</motion.span>
            {live >= 0 && <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" stroke="#34d399" strokeWidth="4" fill="none" strokeDasharray={295} strokeDashoffset={295 * (1 - Math.min(live, 4) / 4)} style={{ transition: 'stroke-dashoffset 1s' }} /></svg>}
          </div>
          <p className="text-center text-sm text-slate-300">{live < 0 ? 'We’ll ask you to move your head a little.' : live < LIVENESS.length ? LIVENESS[live] : '✅ Liveness confirmed'}</p>
          {live < 0 && <button className="btn-primary py-3.5" onClick={() => setLive(0)}><Camera size={18} /> Start selfie check</button>}
          {live >= LIVENESS.length && <button className="btn-primary py-3.5" onClick={() => setStep('details')}>Continue</button>}
        </>}
        {step === 'details' && <>
          <p className="text-sm font-semibold">Confirm your details (as on your document)</p>
          <input className="input" placeholder="Full legal name" value={d.fullName} onChange={(e) => setD({ ...d, fullName: e.target.value })} />
          <label className="grid gap-1 text-xs text-slate-400">Date of birth<input type="date" className="input" value={d.dob} onChange={(e) => setD({ ...d, dob: e.target.value })} /></label>
          <select className="input" value={d.nationality} onChange={(e) => setD({ ...d, nationality: e.target.value })}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}</select>
          {d.dob && age < 18 && <p className="text-xs text-rose-300">You must be 18 or older to use money features.</p>}
          <p className="flex items-start gap-2 text-[11px] text-slate-500"><Lock size={12} className="mt-0.5 shrink-0" /> Encrypted and shared only with our licensed verification partner. Never shown to other users.</p>
          <button className="btn-primary py-3.5" disabled={d.fullName.trim().split(' ').length < 2 || !d.dob || age < 18} onClick={submit}>Submit for review</button>
        </>}
      </motion.div>
    </AnimatePresence>
  )
}

/** Status card: what KYC unlocks and where you are. */
export function KycStatus({ compact }: { compact?: boolean }) {
  const { s } = useStore()
  if (LIVE) return <LiveKycStatus />
  const st = s.kyc.status
  const L = st === 'verified' ? KYC_LIMITS.verified : KYC_LIMITS.none
  const view = {
    none: { icon: <ShieldCheck />, c: 'border-gold-400/40 bg-gold-400/10 text-gold-300', t: 'KYC not done', sub: 'You can top up, but withdrawals are locked until you verify.' },
    pending: { icon: <Clock className="animate-pulse" />, c: 'border-sky-400/40 bg-sky-400/10 text-sky-300', t: 'KYC under review', sub: 'Usually a few minutes. We’ll notify you.' },
    verified: { icon: <BadgeCheck />, c: 'border-mint-400/40 bg-mint-400/10 text-mint-300', t: 'KYC verified', sub: 'Withdrawals and all money features unlocked.' },
    rejected: { icon: <XCircle />, c: 'border-rose-400/40 bg-rose-500/10 text-rose-300', t: 'KYC needs attention', sub: s.kyc.reason ?? 'Please try again with a clearer photo.' },
  }[st]
  return (
    <div className={`rounded-2xl border p-3 ${view.c}`}>
      <div className="flex items-center gap-3">{view.icon}<div className="flex-1"><p className="text-sm font-bold">{view.t}</p><p className="text-xs text-slate-400">{view.sub}</p></div></div>
      {!compact && (
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-300">
          <div className="rounded-xl bg-fg/5 p-2"><p className="text-slate-500">Top up / day</p><p className="font-bold">{fmt(L.depositPerDay, 'TRY')}</p></div>
          <div className="rounded-xl bg-fg/5 p-2"><p className="text-slate-500">Max balance</p><p className="font-bold">{fmt(L.maxBalance, 'TRY')}</p></div>
          <div className="rounded-xl bg-fg/5 p-2"><p className="text-slate-500">Withdraw</p><p className="font-bold">{L.withdraw ? '✅ Yes' : '🔒 No'}</p></div>
        </div>
      )}
    </div>
  )
}

/** Demo: the verification partner approves pending KYC after a short review. */
export function useKycReview() {
  const { s, set, reward, notify } = useStore()
  useEffect(() => {
    if (s.kyc.status !== 'pending') return
    const wait = Math.max(0, (s.kyc.submittedAt ?? Date.now()) + 6000 - Date.now())
    const t = setTimeout(() => {
      set((p) => ({ ...p, verified: true, kyc: { ...p.kyc, status: 'verified' } }))
      notify('✅', 'KYC approved! Withdrawals and money features are unlocked', '/wallet')
      reward(150, { quest: 'verify', badge: 'verified', title: 'KYC approved 🎉' })
    }, wait)
    return () => clearTimeout(t)
  }, [s.kyc.status, s.kyc.submittedAt, set, notify, reward])
}

function LiveKycStatus() {
  const { s } = useStore()
  const ok = s.kyc.status === 'verified'
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3 ${ok ? 'border-mint-400/40 bg-mint-400/10 text-mint-300' : 'border-gold-400/40 bg-gold-400/10 text-gold-300'}`}>
      {ok ? <BadgeCheck /> : <ShieldCheck />}
      <div className="flex-1"><p className="text-sm font-bold">{ok ? 'Identity verified' : 'Identity not verified'}</p>
        <p className="text-xs text-slate-400">{ok ? 'Withdrawals and sending money are unlocked.' : 'You can top up (up to ₦100,000/day) and pay for things. Verify with your NIN or BVN to withdraw and send.'}</p></div>
    </div>
  )
}
