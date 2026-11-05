import { Droplets, ExternalLink, Home, Receipt, Smartphone, Wifi, Zap, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Pill, ago, lira } from './LiveKit'
import { RateButton } from './Ratings'

export const BILL_ICON: Record<string, LucideIcon> = { electricity: Zap, water: Droplets, internet: Wifi, phone: Smartphone, rent: Home, other: Receipt }
export const BILL_TINT: Record<string, string> = { electricity: 'from-amber-400 to-orange-500', water: 'from-sky-400 to-blue-500', internet: 'from-violet-400 to-fuchsia-500', phone: 'from-yellow-300 to-amber-500', rent: 'from-emerald-400 to-teal-500', other: 'from-slate-400 to-slate-600' }

export const Ago = ({ iso }: { iso: string }) => <span>{ago(iso)}</span>

/** One bill with its status; used on the user's Bills screen. */
export function BillCard({ b, footer }: { b: { id: string; claimed_at?: string | null; auto?: { status: string } | null; eta_at?: string | null; created_at?: string; type: string; provider: string; account_ref: string; amount_minor: number; fee_minor: number; status: string; note: string | null; receiptUrls?: (string | null)[] }; footer?: ReactNode }) {
  const I = BILL_ICON[b.type] ?? Receipt
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={`grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${BILL_TINT[b.type] ?? BILL_TINT.other} text-white`}><I size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{b.provider}</p>
          <p className="truncate text-xs text-slate-400">No. ••{b.account_ref.slice(-4)} · fee {lira(b.fee_minor)}</p>
        </div>
        <p className="text-lg font-extrabold">{lira(b.amount_minor)}</p>
      </div>
      {b.status === 'pending' && (b.auto?.status === 'processing' ? <p className="text-xs text-mint-200">⚡ Sending your top-up… usually a few seconds.</p> : <BillProgress eta={b.eta_at ?? null} paying={!!b.claimed_at} />)}
      <div className="flex flex-wrap items-center gap-2">
        {b.status === 'pending' && <Pill tone="wait">{b.claimed_at ? 'Paying now' : 'Received'}</Pill>}
        {b.status === 'paid' && <Pill tone="ok">{b.auto?.status === 'paid' ? 'Topped up automatically' : 'Paid'}</Pill>}
        {b.status === 'refunded' && <Pill tone="back">Refunded to wallet</Pill>}
        {(b.receiptUrls ?? []).filter(Boolean).map((u, i) => <a key={i} href={u!} target="_blank" rel="noreferrer" className="chip bg-fg/[0.06] text-slate-200"><ExternalLink size={12} /> Receipt{i ? ` ${i + 1}` : ''}</a>)}
      </div>
      {b.status === 'refunded' && b.note && <p className="text-xs text-slate-400">Reason: {b.note}</p>}
      {(b.status === 'paid' || b.status === 'refunded') && <RateButton kind="bill" refId={b.id} title="Rate this bill payment" sub={b.provider} />}
      {footer}
    </div>
  )
}

/** Received → Paying → Receipt, with the promised time. */
function BillProgress({ eta, paying }: { eta: string | null; paying: boolean }) {
  const late = !!eta && Date.parse(eta) < Date.now()
  const at = eta ? new Date(eta) : null
  const today = at && at.toDateString() === new Date().toDateString()
  const label = at ? `${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${today ? ' today' : ` · ${at.toLocaleDateString([], { weekday: 'short' })}`}` : ''
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        {['Received', 'Paying', 'Receipt'].map((s, i) => (
          <div key={s} className="flex flex-1 flex-col gap-1">
            <div className={`h-1.5 rounded-full ${i === 0 ? 'bg-mint-400' : i === 1 ? (paying ? 'animate-pulse bg-mint-400/70' : 'bg-fg/10') : 'bg-fg/10'}`} />
            <span className={`text-[10px] ${i === 0 || (i === 1 && paying) ? 'text-mint-200' : 'text-slate-500'}`}>{s}</span>
          </div>
        ))}
      </div>
      {paying && <p className="text-xs text-mint-200">💳 A Luda team member is paying it right now.</p>}
      {eta && <p className="text-xs text-slate-300">{late ? '⏳ Taking a little longer than usual. The team is on it.' : <>⚡ Expected by <b>{label}</b></>}</p>}
    </div>
  )
}
