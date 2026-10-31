import { BadgeCheck, Check, FileUp, Lock, Phone, ShieldCheck } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { postLimit, PROOF_TEXT, type PostKind } from '../lib/posting'
import { useStore } from '../lib/store'

/**
 * Everyone who posts (houses, jobs, events) must pass these checks first.
 * The app owner (admin) skips them and posts as "Luda Official".
 */
export function PostGate({ kind, children }: { kind: PostKind; children: ReactNode }) {
  const { s, set, level, reward } = useStore()
  const [agree, setAgree] = useState(false)
  const [phone, setPhone] = useState('+90 533 ')
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [biz, setBiz] = useState({ name: '', tax: '' })
  const limit = postLimit(s, kind, level.idx)

  if (s.isAdmin) return (
    <>
      <div className="mb-4 flex items-center gap-2 rounded-2xl bg-mint-400/10 p-3 text-xs text-mint-200"><ShieldCheck size={16} /> Posting as <b>Luda Official</b>: approved instantly.</div>
      {children}
    </>
  )

  const proofOk = kind === 'housing' ? !!s.proofs.housing : kind === 'job' ? !!s.proofs.business : true
  const ready = s.verified && s.phoneVerified && proofOk && agree
  if (ready && limit.used >= limit.max) return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-gold-400/15 text-3xl">⏳</div>
      <p className="font-bold">Posting limit reached ({limit.used}/{limit.max})</p>
      <p className="text-sm text-slate-400">{limit.max === 1 ? 'New posters can have 1 active post. Once your first post is approved, your limit grows with your level.' : 'Level up or close an old post to post more.'}</p>
    </div>
  )
  if (ready) return <>{children}</>

  const finishProof = (fn: () => void) => {
    fn()
    if (s.verified && s.phoneVerified && !s.badges.includes('trusted_poster')) reward(40, { badge: 'trusted_poster', title: 'Verified poster' })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-2xl bg-fuchsia-500/10 p-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-fuchsia-300" size={20} />
        <p className="text-xs text-slate-300"><b>Before you post:</b> to keep Luda free of fake {kind === 'housing' ? 'houses' : kind === 'job' ? 'jobs' : 'events'} and scams, every poster is verified and every post is reviewed before it goes live.</p>
      </div>

      <Step ok={s.verified} n={1} title="Verify your identity (ID + selfie)">
        <Link to="/profile" className="btn-primary w-full py-2.5 text-sm">Verify in Profile</Link>
      </Step>

      <Step ok={s.phoneVerified} n={2} title="Verify your phone number">
        {!codeSent ? (
          <div className="flex gap-2">
            <input className="input py-2.5" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
            <button className="btn-primary shrink-0 px-3 py-2.5 text-sm" disabled={phone.replace(/\D/g, '').length < 10} onClick={() => setCodeSent(true)}><Phone size={14} /> Send</button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-slate-400">Enter the 6-digit SMS code. <span className="text-gold-300">Demo code: 482913</span></p>
            <div className="flex gap-2">
              <input className="input py-2.5 font-mono tracking-widest" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" />
              <button className="btn-primary shrink-0 px-3 py-2.5 text-sm" disabled={code !== '482913'} onClick={() => finishProof(() => set((p) => ({ ...p, phoneVerified: true })))}>Verify</button>
            </div>
          </div>
        )}
      </Step>

      {kind === 'housing' && (
        <Step ok={!!s.proofs.housing} n={3} title="Prove you're allowed to rent it out">
          <div className="flex flex-col gap-2">
            {(Object.keys(PROOF_TEXT) as (keyof typeof PROOF_TEXT)[]).map((k) => (
              <label key={k} className="glass flex cursor-pointer items-center gap-3 rounded-xl p-3 text-start">
                <FileUp size={16} className="shrink-0 text-mint-300" />
                <span className="flex-1"><span className="block text-sm font-semibold">{PROOF_TEXT[k].label}</span><span className="text-xs text-slate-400">Upload: {PROOF_TEXT[k].doc}</span></span>
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={() => finishProof(() => set((p) => ({ ...p, proofs: { ...p.proofs, housing: k } })))} />
              </label>
            ))}
            <p className="flex items-center gap-1 text-[11px] text-slate-500"><Lock size={10} /> Documents are only seen by Luda's review team, never shown publicly.</p>
          </div>
        </Step>
      )}

      {kind === 'job' && (
        <Step ok={!!s.proofs.business} n={3} title="Who's hiring?">
          <div className="flex flex-col gap-2">
            <input className="input py-2.5" placeholder="Business name" value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} />
            <input className="input py-2.5" placeholder="Tax / registration no. (Vergi No)" value={biz.tax} onChange={(e) => setBiz({ ...biz, tax: e.target.value })} />
            <label className={`btn-primary cursor-pointer py-2.5 text-sm ${biz.name && biz.tax.length >= 5 ? '' : 'pointer-events-none opacity-40'}`}><FileUp size={14} /> Upload registration document
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={() => finishProof(() => set((p) => ({ ...p, proofs: { ...p.proofs, business: 'company' } })))} /></label>
            <button className="text-xs text-slate-400 underline" onClick={() => finishProof(() => set((p) => ({ ...p, proofs: { ...p.proofs, business: 'individual' } })))}>I'm an individual posting a small gig (shown as "Individual")</button>
          </div>
        </Step>
      )}

      {kind === 'event' && (
        <Step ok n={3} title="Organiser: individuals can post. Churches, mosques & associations can upload a letter for the verified badge." />
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-fg/[0.03] p-3">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 size-4 accent-emerald-500" />
        <span className="text-xs text-slate-300">I confirm this post is <b>real, available and legal</b>. I'll keep it up to date. Fake or misleading posts get the account permanently banned.</span>
      </label>
      {s.verified && s.phoneVerified && proofOk && !agree && <p className="flex items-center gap-1 text-xs text-mint-300"><BadgeCheck size={14} /> Almost there: tick the box above to continue.</p>}
    </div>
  )
}

function Step({ ok, n, title, children: body }: { ok: boolean; n: number; title: string; children?: ReactNode }) {
return (
  <div className={`rounded-2xl border p-3 ${ok ? 'border-mint-400/30 bg-mint-400/5' : 'border-fg/10 bg-fg/[0.03]'}`}>
    <div className="flex items-center gap-3">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${ok ? 'bg-mint-400 text-ink-950' : 'bg-fg/10'}`}>{ok ? <Check size={14} /> : n}</span>
      <p className="flex-1 text-sm font-semibold">{title}</p>
    </div>
    {!ok && body && <div className="mt-3 ps-10">{body}</div>}
  </div>
)
}
