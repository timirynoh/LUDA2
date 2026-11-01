import { Check, ChevronRight } from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from '../lib/store'
import { Ring } from './ui'

/** What makes a profile complete. A complete profile earns trust (and a badge). */
export function useProfileSteps() {
  const { s } = useStore()
  return [
    { key: 'photo', label: 'Add a profile photo', done: !!s.avatar },
    { key: 'bio', label: 'Write a short bio', done: (s.bio ?? '').trim().length >= 10 },
    { key: 'phone', label: 'Verify your phone', done: s.phoneVerified },
    { key: 'kyc', label: 'Complete KYC (ID + selfie)', done: s.kyc.status === 'verified' },
    { key: 'email', label: 'Account with email & username', done: !!s.account },
    { key: 'security', label: 'Turn on PIN lock or 2-step sign-in', done: s.lockOnOpen || s.security.twoStep },
  ]
}

export function ProfileComplete({ onStep }: { onStep: (key: string) => void }) {
  const { s, reward } = useStore()
  const steps = useProfileSteps()
  const done = steps.filter((x) => x.done).length
  const pct = done / steps.length
  useEffect(() => { if (pct === 1 && !s.badges.includes('allstar')) reward(100, { badge: 'allstar', title: 'Profile 100% complete 🌟' }) }, [pct, s.badges, reward])
  if (pct === 1) return <div className="card flex items-center gap-3 border-mint-400/30 bg-mint-400/5"><span className="text-2xl">🌟</span><p className="text-sm font-semibold">All-Star profile: people trust you more</p></div>
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <Ring value={pct} size={56} stroke={5}><span className="text-sm font-extrabold">{Math.round(pct * 100)}%</span></Ring>
        <div className="flex-1"><p className="font-bold">Complete your profile</p><p className="text-xs text-slate-400">Complete profiles get more replies, faster trades and +100 XP</p></div>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {steps.map((x) => (
          <button key={x.key} disabled={x.done} onClick={() => onStep(x.key)} className="flex items-center gap-3 rounded-xl px-2 py-2 text-start text-sm hover:bg-fg/[0.03] disabled:opacity-60">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full ${x.done ? 'bg-mint-400 text-ink-950' : 'border border-fg/20'}`}>{x.done && <Check size={14} />}</span>
            <span className={`flex-1 ${x.done ? 'text-slate-500 line-through' : ''}`}>{x.label}</span>
            {!x.done && <ChevronRight size={16} className="text-slate-500 rtl:rotate-180" />}
          </button>
        ))}
      </div>
    </div>
  )
}
