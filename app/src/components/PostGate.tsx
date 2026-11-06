import { BadgeCheck, Camera, Check, FileUp, Lock, ShieldCheck, Zap } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { postLimit, PROOF_TEXT, type PostKind, type ProofKind } from '../lib/posting'
import { useStore } from '../lib/store'
import { PhoneVerify } from './PhoneVerify'

/**
 * Light, fast checks before posting:
 *  - everyone: phone number (one-time SMS) + "this is real" declaration
 *  - houses: a utility bill / deed / licence → goes live instantly; photos only → admin review
 *  - jobs (full listing): business document → live instantly; individual → admin review
 * ID verification is optional and adds a ✓ badge. The app owner skips all checks.
 */
export function PostGate({ kind, children }: { kind: PostKind; children: ReactNode }) {
  const { s, set, level, reward } = useStore()
  const [agree, setAgree] = useState(false)
  const [biz, setBiz] = useState({ name: '', tax: '' })
  const limit = postLimit(s, kind, level.idx)

  if (s.isAdmin) return (
    <>
      <div className="mb-4 flex items-center gap-2 rounded-2xl bg-mint-400/10 p-3 text-xs text-mint-200"><ShieldCheck size={16} /> Posting as <b>Luda Official</b>: live instantly.</div>
      {children}
    </>
  )

  const proofOk = kind === 'housing' ? !!s.proofs.housing : kind === 'job' ? !!s.proofs.business : true
  const ready = s.phoneVerified && proofOk && agree
  if (ready && limit.used >= limit.max) return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-gold-400/15 text-3xl">⏳</div>
      <p className="font-bold">Posting limit reached ({limit.used}/{limit.max})</p>
      <p className="text-sm text-slate-400">{limit.max === 1 ? 'New posters can have 1 active post. Once a post is live, your limit grows with your level.' : 'Level up or close an old post to post more.'}</p>
    </div>
  )
  if (ready) return (
    <>
      {kind === 'housing' && <p className={`mb-3 flex items-center gap-2 rounded-2xl p-3 text-xs ${PROOF_TEXT[s.proofs.housing!].instant ? 'bg-mint-400/10 text-mint-200' : 'bg-gold-400/10 text-gold-200'}`}>
        {PROOF_TEXT[s.proofs.housing!].instant ? <><Zap size={14} /> Document on file: your house goes live instantly.</> : <>⏳ Photos only: an admin approves it first (usually within 24h).</>}
        <button className="ms-auto underline" onClick={() => set((p) => ({ ...p, proofs: { ...p.proofs, housing: undefined } }))}>Change</button></p>}
      {children}
    </>
  )

  const proved = (fn: () => void) => { fn(); if (!s.badges.includes('trusted_poster')) reward(40, { badge: 'trusted_poster', title: 'Verified poster' }) }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-2xl bg-fuchsia-500/10 p-3">
        <ShieldCheck className="mt-0.5 shrink-0 text-fuchsia-300" size={20} />
        <p className="text-xs text-slate-300"><b>Quick check before you post.</b> It keeps fake {kind === 'housing' ? 'houses' : kind === 'job' ? 'jobs' : 'events'} and scammers out. It takes about a minute, one time only.</p>
      </div>

      <Step ok={s.phoneVerified} n={1} title="Verify your phone number"><PhoneVerify compact /></Step>

      {kind === 'housing' && (
        <Step ok={!!s.proofs.housing} n={2} title="Show the house is real">
          <div className="flex flex-col gap-2">
            {(Object.keys(PROOF_TEXT) as ProofKind[]).map((k) => (
              <label key={k} className={`glass flex cursor-pointer items-center gap-3 rounded-xl p-3 text-start ${k === 'resident' ? 'border-mint-400/40' : ''}`}>
                {k === 'photos' ? <Camera size={16} className="shrink-0 text-gold-300" /> : <FileUp size={16} className="shrink-0 text-mint-300" />}
                <span className="flex-1">
                  <span className="flex items-center gap-2 text-sm font-semibold">{PROOF_TEXT[k].label}{PROOF_TEXT[k].instant ? <span className="chip bg-mint-400/15 py-0.5 text-[10px] text-mint-300">⚡ Live instantly</span> : <span className="chip bg-gold-400/15 py-0.5 text-[10px] text-gold-300">Admin review</span>}</span>
                  <span className="text-xs text-slate-400">{PROOF_TEXT[k].doc}</span>
                </span>
                {k === 'photos'
                  ? <input type="checkbox" className="hidden" onChange={() => proved(() => set((p) => ({ ...p, proofs: { ...p.proofs, housing: k } })))} />
                  : <input type="file" accept="image/*,application/pdf" className="hidden" onChange={() => proved(() => set((p) => ({ ...p, proofs: { ...p.proofs, housing: k } })))} />}
              </label>
            ))}
            <p className="flex items-center gap-1 text-[11px] text-slate-500"><Lock size={10} /> Bills and documents are only seen by Luda's safety team, never shown publicly.</p>
          </div>
        </Step>
      )}

      {kind === 'job' && (
        <Step ok={!!s.proofs.business} n={2} title="Who's hiring?">
          <div className="flex flex-col gap-2">
            <input className="input py-2.5" placeholder="Business name" value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} />
            <input className="input py-2.5" placeholder="Tax / registration no. (Vergi No)" value={biz.tax} onChange={(e) => setBiz({ ...biz, tax: e.target.value })} />
            <label className={`btn-primary cursor-pointer py-2.5 text-sm ${biz.name && biz.tax.length >= 5 ? '' : 'pointer-events-none opacity-40'}`}><FileUp size={14} /> Upload registration (live instantly)
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={() => proved(() => set((p) => ({ ...p, proofs: { ...p.proofs, business: 'company' } })))} /></label>
            <button className="text-xs text-slate-400 underline" onClick={() => proved(() => set((p) => ({ ...p, proofs: { ...p.proofs, business: 'individual' } })))}>I'm an individual (admin approves my posts)</button>
          </div>
        </Step>
      )}

      {!s.verified && (
        <Link to="/profile" className="flex items-center gap-3 rounded-2xl border border-fg/10 bg-fg/[0.03] p-3 text-xs text-slate-400">
          <BadgeCheck size={16} className="shrink-0 text-slate-500" /> Optional: verify your ID in Profile to get the ✓ badge people trust most.
        </Link>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-fg/[0.03] p-3">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 size-4 accent-emerald-500" />
        <span className="text-xs text-slate-300">I confirm this post is <b>real, available and legal</b>. Fake or misleading posts get the account banned.</span>
      </label>
    </div>
  )
}

function Step({ ok, n, title, children }: { ok: boolean; n: number; title: string; children?: ReactNode }) {
  return (
    <div className={`rounded-2xl border p-3 ${ok ? 'border-mint-400/30 bg-mint-400/5' : 'border-fg/10 bg-fg/[0.03]'}`}>
      <div className="flex items-center gap-3">
        <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${ok ? 'bg-mint-400 text-ink-950' : 'bg-fg/10'}`}>{ok ? <Check size={14} /> : n}</span>
        <p className="flex-1 text-sm font-semibold">{title}</p>
      </div>
      {!ok && children && <div className="mt-3 ps-10">{children}</div>}
    </div>
  )
}
