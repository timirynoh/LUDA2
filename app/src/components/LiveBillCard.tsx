import { Droplets, ExternalLink, Home, Receipt, Smartphone, Wifi, Zap, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Pill, ago, lira } from './LiveKit'

export const BILL_ICON: Record<string, LucideIcon> = { electricity: Zap, water: Droplets, internet: Wifi, phone: Smartphone, rent: Home, other: Receipt }
export const BILL_TINT: Record<string, string> = { electricity: 'from-amber-400 to-orange-500', water: 'from-sky-400 to-blue-500', internet: 'from-violet-400 to-fuchsia-500', phone: 'from-yellow-300 to-amber-500', rent: 'from-emerald-400 to-teal-500', other: 'from-slate-400 to-slate-600' }

export const Ago = ({ iso }: { iso: string }) => <span>{ago(iso)}</span>

/** One bill with its status; used on the user's Bills screen. */
export function BillCard({ b, footer }: { b: { type: string; provider: string; account_ref: string; amount_minor: number; fee_minor: number; status: string; note: string | null; receiptUrls?: (string | null)[] }; footer?: ReactNode }) {
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
      <div className="flex flex-wrap items-center gap-2">
        {b.status === 'pending' && <Pill tone="wait">Being paid by Luda</Pill>}
        {b.status === 'paid' && <Pill tone="ok">Paid</Pill>}
        {b.status === 'refunded' && <Pill tone="back">Refunded to wallet</Pill>}
        {(b.receiptUrls ?? []).filter(Boolean).map((u, i) => <a key={i} href={u!} target="_blank" rel="noreferrer" className="chip bg-fg/[0.06] text-slate-200"><ExternalLink size={12} /> Receipt{i ? ` ${i + 1}` : ''}</a>)}
      </div>
      {b.status === 'refunded' && b.note && <p className="text-xs text-slate-400">Reason: {b.note}</p>}
      {footer}
    </div>
  )
}
