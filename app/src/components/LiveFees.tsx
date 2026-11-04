// "Fees" page: every number comes from the server (GET config), so the app can never show a fee the server doesn't charge.
import { InfoTip } from './LiveGuides'
import { useEffect, useState } from 'react'
import { Sheet } from './ui'
import { liveConfig, money, type LiveConfig } from '../lib/live'

export function FeesSheet({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<LiveConfig | null>(null)
  useEffect(() => { liveConfig().then(setCfg).catch(() => {}) }, [])
  const f = cfg?.fees
  const pct = (n?: number) => (n === undefined ? '…' : `${+(n * 100).toFixed(2)}%`)
  const rows: [string, string, string][] = f ? [
    ['💳', 'Top up (Naira)', 'Free from Luda. Paystack adds its own small card/bank fee at checkout'],
    ['🌍', 'Top up (other currencies)', 'Flutterwave’s fee, shown before you pay'],
    ['🔁', 'Send to a Luda user', 'Free'],
    ['💱', 'Convert Naira ⇄ Lira', `${pct(f.fxMargin)} built into the rate. Banks and BDCs usually take 3–5%`],
    ['🏦', 'Withdraw to your bank', `${money(f.withdraw, 'TRY')} flat. Taken from your Lira wallet, or the same value in Naira if you have no lira`],
    ['🧾', 'Bill payment', f.billMinor !== undefined ? `${money(f.billMinor, 'TRY')} up to ${money(f.billStepMinor ?? 0, 'TRY')}, ${money(f.billHighMinor ?? 0, 'TRY')} above` : '…'],
    ['🛍️', 'Market sale', `${pct(f.marketPct)} from the seller. Buyers pay no fee`],
    ['⚡', 'Flash help', `${pct(f.flashPct)} from the helper. The poster pays no fee`],
    ['🤝', 'P2P exchange', f.p2pPct !== undefined ? `${pct(f.p2pPct)} of the trade in lira (min ${money(f.p2pMinMinor ?? 0, 'TRY')}, max ${money(f.p2pMaxMinor ?? 0, 'TRY')}), from whoever receives the Naira` : '…'],
    ['🚌', 'Bus tickets', 'No booking fee. Paying from Naira uses the conversion rate above'],
  ] : []
  return (
    <Sheet open onClose={onClose} title="Fees">
      <div className="flex flex-col gap-3">
        <p className="flex items-start gap-2 text-sm text-slate-400"><span className="flex-1">Simple, student-friendly fees, all in lira. You always see the exact fee before you confirm.</span><InfoTip slug="tip-fees" /></p>
        {!cfg && <p className="text-sm text-slate-500">Loading…</p>}
        <div className="flex flex-col divide-y divide-fg/5 rounded-2xl bg-fg/[0.03]">
          {rows.map(([e, k, v]) => (
            <div key={k} className="flex items-start gap-3 px-4 py-3">
              <span className="text-xl">{e}</span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{k}</p><p className="text-xs text-slate-400">{v}</p></div>
            </div>
          ))}
        </div>
        <p className="text-center text-[11px] text-slate-500">No monthly fees. No hidden charges.</p>
      </div>
    </Sheet>
  )
}
