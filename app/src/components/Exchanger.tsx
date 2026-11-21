// Verified Exchanger (v1.21.0, owner's program): trusted P2P traders post up to 5 ads of up to ₺50,000 each and get a
// 🏅 badge, after a ₺2,000 bond held by Luda (returned when they leave in good standing). Everything is decided on the
// server: requirements, the bond (escrow), limits and the badge. The Luda team approves in Luda HQ.
import { Award, Check, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api, money } from '../lib/live'
import { errMsg, ReviewAndPin } from './LiveMoney'
import { Sheet, Success } from './ui'

interface ExMe { status: 'pending' | 'approved' | 'rejected' | 'removed' | 'left'; note: string | null; applied_at: string; decided_at: string | null }
interface ExData { me: ExMe | null; rules: { maxAds: number; maxTry: number; minTrades: number; minRate: number; bond: number; member: { maxAds: number; maxTry: number } }; stats: { trades: number; rate: number | null }; checks: { kyc: boolean; trades: boolean; rate: boolean }; eligible: boolean }

export const ExchangerBadge = ({ small }: { small?: boolean }) => (
  <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-md bg-gradient-to-r from-gold-300 to-amber-500 font-bold text-ink-950 ${small ? 'px-1 text-[9px]' : 'px-1.5 py-0.5 text-[10px]'}`} title="Verified Exchanger">🏅 Exchanger</span>
)

function useExchanger(open: boolean) {
  const [d, setD] = useState<ExData | null>(null)
  const [err, setErr] = useState('')
  const load = useCallback(async () => { try { setD(await api<ExData>('GET', 'exchanger')); setErr('') } catch (e) { setErr(errMsg(e)) } }, [])
  useEffect(() => { if (open) void load() }, [open, load]) // eslint-disable-line react-hooks/set-state-in-effect
  return { d, err, load }
}

/** Card on the P2P screen: what the program gives, and your status. */
export function ExchangerCard() {
  const [open, setOpen] = useState(false)
  const { d, load } = useExchanger(true)
  const st = d?.me?.status
  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-3 rounded-3xl bg-gradient-to-r from-gold-400/15 to-amber-600/10 p-4 text-start ring-1 ring-gold-400/30">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-gold-300 to-amber-500 text-xl">🏅</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{st === 'approved' ? 'You’re a Verified Exchanger' : st === 'pending' ? 'Exchanger application in review' : 'Become a Verified Exchanger'}</span>
          <span className="block text-xs text-slate-400">{st === 'approved' ? `Up to ${d?.rules.maxAds ?? 5} ads of ${money(d?.rules.maxTry ?? 5_000_000, 'TRY')} each` : st === 'pending' ? 'The Luda team will reply soon' : `${d?.rules.maxAds ?? 5} ads up to ${money(d?.rules.maxTry ?? 5_000_000, 'TRY')} · 🏅 badge`}</span>
        </span>
      </button>
      {open && <ExchangerSheet onClose={() => { setOpen(false); void load() }} />}
    </>
  )
}

function ExchangerSheet({ onClose }: { onClose: () => void }) {
  const { d, err, load } = useExchanger(true)
  const [step, setStep] = useState<'info' | 'apply' | 'leave'>('info')
  if (step === 'apply' && d) return (
    <Sheet open onClose={onClose} title="Apply · Verified Exchanger">
      <ReviewAndPin holdLabel={`Hold to put ${money(d.rules.bond, 'TRY')} as bond`} onClose={onClose}
        rows={[['Bond (held by Luda)', money(d.rules.bond, 'TRY')], ['From', 'Your Lira wallet'], ['Returned', 'When you leave the program in good standing, or if you’re not approved']]}
        warning="Luda may keep the bond only if you cause a loss to another user (for example, not sending lira you were paid for)."
        run={async (auth) => { await api('POST', 'exchanger-apply', auth); await load() }}
        done={<Success title="Application sent 🏅" sub="Your bond is held safely. The Luda team will review your trading record and reply in your notifications." onClose={onClose} />} />
    </Sheet>
  )
  if (step === 'leave' && d) return (
    <Sheet open onClose={onClose} title="Leave the program">
      <ReviewAndPin holdLabel="Hold to leave and get the bond back" onClose={onClose}
        rows={[['Bond back to your wallet', money(d.rules.bond, 'TRY')], ['Your ads', `Back to ${d.rules.member.maxAds} ad up to ${money(d.rules.member.maxTry, 'TRY')}; others are paused`]]}
        run={async (auth) => { await api('POST', 'exchanger-leave', auth); await load() }}
        done={<Success title="You left the program" sub="Your bond is back in your Lira wallet." onClose={onClose} />} />
    </Sheet>
  )
  const st = d?.me?.status
  const Row = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
    <p className="flex items-center gap-2 text-sm">{ok ? <Check size={16} className="shrink-0 text-mint-300" /> : <X size={16} className="shrink-0 text-rose-300" />}<span className={ok ? '' : 'text-slate-400'}>{children}</span></p>
  )
  return (
    <Sheet open onClose={onClose} title="🏅 Verified Exchanger">
      {!d ? (err ? <p className="text-sm text-rose-300">{err}</p> : <Loader2 className="mx-auto animate-spin text-slate-500" />) : (
        <div className="flex flex-col gap-4 pb-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-fg/[0.05] p-3"><p className="text-xl font-extrabold">{d.rules.maxAds}</p><p className="text-[11px] text-slate-400">ads at once</p></div>
            <div className="rounded-2xl bg-fg/[0.05] p-3"><p className="text-xl font-extrabold">{money(d.rules.maxTry, 'TRY')}</p><p className="text-[11px] text-slate-400">per ad</p></div>
            <div className="rounded-2xl bg-fg/[0.05] p-3"><p className="text-xl">🏅</p><p className="text-[11px] text-slate-400">badge on your ads</p></div>
          </div>
          <p className="text-sm text-slate-300">{`Members can post ${d.rules.member.maxAds} ad up to ${money(d.rules.member.maxTry, 'TRY')}. Verified Exchangers are trusted traders checked by the Luda team, so buyers and sellers can pick them with confidence.`}</p>
          {st === 'approved' && <p className="rounded-2xl bg-mint-400/10 p-3 text-sm text-mint-100"><Award size={16} className="me-1 inline" /> {`You’re a Verified Exchanger. Your bond of ${money(d.rules.bond, 'TRY')} is held by Luda.`}</p>}
          {st === 'pending' && <p className="rounded-2xl bg-sky-400/10 p-3 text-sm text-sky-100">Your application is with the Luda team. Your bond is held safely and comes back if you’re not approved.</p>}
          {(st === 'rejected' || st === 'removed') && d.me?.note && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-100">{st === 'rejected' ? 'Not approved' : 'Removed'} · {d.me.note}</p>}
          {st !== 'approved' && st !== 'pending' && <>
            <div className="flex flex-col gap-2 rounded-2xl bg-fg/[0.04] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">To apply</p>
              <Row ok={d.checks.kyc}>ID verified</Row>
              <Row ok={d.checks.trades}>{`At least ${d.rules.minTrades} completed P2P trades (you have ${d.stats.trades})`}</Row>
              <Row ok={d.checks.rate}>{`${d.rules.minRate}% or more completed (yours: ${d.stats.rate ?? 0}%)`}</Row>
              <Row ok>{`A ${money(d.rules.bond, 'TRY')} bond from your Lira wallet, held by Luda`}</Row>
            </div>
            <button className="btn-primary py-3.5" disabled={!d.eligible} onClick={() => setStep('apply')}>{d.eligible ? 'Apply now' : 'Keep trading to unlock'}</button>
          </>}
          {(st === 'approved' || st === 'pending') && <button className="btn-ghost py-3 text-sm" onClick={() => setStep('leave')}>{st === 'pending' ? 'Cancel my application' : 'Leave the program'}</button>}
        </div>
      )}
    </Sheet>
  )
}

/* ---------------- Luda HQ → Exchangers ---------------- */
interface AdminEx { username: string; name: string; status: string; note: string | null; appliedAt: string; decidedBy: string | null; stats: { trades: number; rate: number | null; good?: number; bad?: number }; kyc: string; bond: { amount: number; status: string } | null; ads: number }
export function ExchangersTab({ canDecide }: { canDecide: boolean }) {
  const [list, setList] = useState<AdminEx[] | null>(null)
  const [err, setErr] = useState('')
  const [act, setAct] = useState<{ x: AdminEx; action: 'approve' | 'reject' | 'remove' } | null>(null)
  const load = useCallback(async () => { try { setList((await api<{ exchangers: AdminEx[] }>('GET', 'admin-exchangers')).exchangers); setErr('') } catch (e) { setErr(errMsg(e)) } }, [])
  useEffect(() => { void load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-slate-400">Applications to the Verified Exchanger program. Check the trading record before approving. Approved traders get 5 ads up to ₺50,000 and the 🏅 badge.</p>
      {err && <p className="text-sm text-rose-300">{err}</p>}
      {!list ? <Loader2 className="mx-auto animate-spin text-slate-500" /> : list.length === 0 ? <p className="card text-center text-sm text-slate-400">No applications yet.</p> : list.map((x) => (
        <div key={x.username} className={`card flex flex-col gap-2 py-3 ${x.status === 'pending' ? 'ring-1 ring-gold-400/40' : ''}`}>
          <div className="flex items-center gap-2"><p className="flex-1 font-semibold">{x.name} <span className="text-xs font-normal text-slate-400">@{x.username}</span></p><span className="chip bg-fg/5 text-[11px]">{x.status}</span></div>
          <p className="text-xs text-slate-400">{x.stats.trades} trades · {x.stats.rate ?? 0}% completed · 👍 {x.stats.good ?? 0} 👎 {x.stats.bad ?? 0} · ID {x.kyc} · {x.ads} active ads</p>
          <p className="text-xs text-slate-400">Bond: {x.bond ? `${money(x.bond.amount, 'TRY')} (${x.bond.status})` : '–'} · applied {new Date(x.appliedAt).toLocaleDateString()}{x.decidedBy ? ` · by @${x.decidedBy}` : ''}</p>
          {x.note && <p className="text-xs text-slate-300">“{x.note}”</p>}
          {canDecide && x.status === 'pending' && <div className="grid grid-cols-2 gap-2"><button className="btn-primary py-2.5 text-sm" onClick={() => setAct({ x, action: 'approve' })}>Approve</button><button className="btn-ghost py-2.5 text-sm" onClick={() => setAct({ x, action: 'reject' })}>Reject</button></div>}
          {canDecide && x.status === 'approved' && <button className="btn-ghost py-2.5 text-sm text-rose-300" onClick={() => setAct({ x, action: 'remove' })}>Remove from the program</button>}
        </div>
      ))}
      {act && <DecideSheet {...act} onClose={() => setAct(null)} onDone={() => { setAct(null); void load() }} />}
    </div>
  )
}

function DecideSheet({ x, action, onClose, onDone }: { x: AdminEx; action: 'approve' | 'reject' | 'remove'; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('')
  const [keep, setKeep] = useState(false)
  const [go, setGo] = useState(false)
  const title = action === 'approve' ? `Approve @${x.username}` : action === 'reject' ? `Reject @${x.username}` : `Remove @${x.username}`
  return (
    <Sheet open onClose={onClose} title={title}>
      {go ? (
        <ReviewAndPin holdLabel={action === 'approve' ? 'Hold to approve' : action === 'reject' ? 'Hold to reject and refund the bond' : keep ? 'Hold to remove and keep the bond' : 'Hold to remove and refund the bond'} onClose={onClose}
          rows={[['Trader', `@${x.username}`], ['Bond', x.bond ? money(x.bond.amount, 'TRY') : '–'], ...(note ? [['Reason (they see it)', note] as [string, string]] : [])]}
          run={async (auth) => { await api('POST', 'admin-exchanger', { username: x.username, action, note, keepBond: keep, ...auth }) }}
          done={<Success title="Done" onClose={onDone} />} />
      ) : (
        <div className="flex flex-col gap-3 pb-2">
          {action !== 'approve' && <textarea className="input min-h-24" maxLength={300} placeholder="Reason (the trader sees it)" value={note} onChange={(e) => setNote(e.target.value)} />}
          {action === 'remove' && <label className="flex items-start gap-2 rounded-2xl bg-rose-500/10 p-3 text-xs"><input type="checkbox" className="mt-0.5 size-4" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Keep the bond (only to cover a loss this trader caused).</label>}
          <button className="btn-primary py-3.5" disabled={action !== 'approve' && note.trim().length < 3} onClick={() => setGo(true)}>Continue</button>
        </div>
      )}
    </Sheet>
  )
}
