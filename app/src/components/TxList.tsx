import { ArrowDownLeft, ArrowUpRight, Gift, Handshake, Repeat, Zap } from 'lucide-react'
import { fmt } from '../lib/fx'
import type { Tx } from '../lib/store'

const ICON = { deposit: ArrowDownLeft, withdraw: ArrowUpRight, convert: Repeat, bill: Zap, p2p: Handshake, reward: Gift }
const COLOR = {
  deposit: 'bg-mint-400/15 text-mint-300', withdraw: 'bg-sky-400/15 text-sky-300', convert: 'bg-gold-400/15 text-gold-300',
  bill: 'bg-orange-400/15 text-orange-300', p2p: 'bg-fuchsia-400/15 text-fuchsia-300', reward: 'bg-violet-400/15 text-violet-300',
}

export function TxList({ txs, empty }: { txs: Tx[]; empty: string }) {
  if (!txs.length) return <div className="card py-10 text-center text-sm text-slate-400">✨ {empty}</div>
  return (
    <div className="card divide-y divide-white/5 p-2">
      {txs.map((x) => {
        const Icon = ICON[x.type]
        return (
          <div key={x.id} className="flex items-center gap-3 px-2 py-3">
            <div className={`grid size-10 place-items-center rounded-xl ${COLOR[x.type]}`}><Icon size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{x.label}</p>
              <p className="truncate text-xs text-slate-500">{new Date(x.ts).toLocaleString()}{x.meta ? ` · ${x.meta}` : ''}</p>
            </div>
            <p className={`text-sm font-bold ${x.amount >= 0 ? 'text-mint-300' : 'text-slate-200'}`} dir="ltr">
              {x.amount >= 0 ? '+' : '−'}{fmt(Math.abs(x.amount), x.currency)}
            </p>
          </div>
        )
      })}
    </div>
  )
}
