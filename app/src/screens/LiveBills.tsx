// Live: assisted bill pay. The bill amount + service fee leaves the Lira wallet (held), the Luda team pays it on the
// official site and posts the receipt here. If it can't be paid, everything comes back automatically.
import { Droplets, FileText, Flame, Home, LifeBuoy, Smartphone, Wifi, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ago, BillCard } from '../components/LiveBillCard'
import { Empty, Steps, lira, toMinor, useApi } from '../components/LiveKit'
import { ReviewAndPin } from '../components/LiveMoney'
import { Attachments, CasesHub, type Upload } from '../components/LiveSupport'
import { Header, Sheet, Success } from '../components/ui'
import { BILLERS, CITIES, type BillCategory } from '../lib/data'
import { api } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { useStore } from '../lib/store'

const ICONS: Record<BillCategory, typeof Zap> = { electricity: Zap, water: Droplets, gas: Flame, internet: Wifi, mobile: Smartphone, rent: Home }
const SERVER_TYPE: Record<BillCategory, string> = { electricity: 'electricity', water: 'water', gas: 'other', internet: 'internet', mobile: 'phone', rent: 'rent' }
const SAVED = 'luda.billAccounts'
const saved = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SAVED) ?? '{}') } catch { return {} } }

export interface LiveBill { id: string; type: string; provider: string; account_ref: string; amount_minor: number; fee_minor: number; status: 'pending' | 'paid' | 'refunded'; note: string | null; created_at: string; updated_at: string; receiptUrls: (string | null)[]; photoUrls: (string | null)[] }

export default function LiveBills() {
  const { s } = useStore()
  const { me, refresh } = useLive()
  const { data, reload } = useApi<{ bills: LiveBill[]; fees: { billMinor: number } }>('features')
  const [biller, setBiller] = useState<string | null>(null)
  const [help, setHelp] = useState<string | null>(null)
  const city = CITIES.find((c) => c.id === s.city)
  const fee = data?.fees.billMinor ?? 10_00
  const name = (id: string, n: string) => (id === 'water' ? `${city?.name ?? ''} Municipality Water`.trim() : n)
  const pending = (data?.bills ?? []).filter((b) => b.status === 'pending')

  return (
    <div className="pb-8">
      <Header back title="Pay bills" sub="From your Lira wallet · receipt in the app" />
      <div className="flex flex-col gap-4 px-5">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 p-5 text-white">
          <div className="absolute -end-8 -top-8 size-32 rounded-full bg-white/15 blur-2xl" />
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Lira wallet</p>
          <p className="text-3xl font-extrabold">{lira(me?.balances.TRY ?? 0)}</p>
          <p className="mt-1 text-sm text-white/85">KIB-TEK, water, phone, internet and rent, paid for you by the Luda team. Service fee {lira(fee)}.</p>
        </div>
        <Steps steps={[['🧾', 'Enter the bill number & amount'], ['🙌', 'Luda pays it on the official site'], ['✅', 'You get the receipt here']]} />

        <p className="label">Choose a bill</p>
        <div className="grid grid-cols-2 gap-2.5 tab:grid-cols-3">
          {BILLERS.map((b) => { const I = ICONS[b.category]; return (
            <button key={b.id} onClick={() => setBiller(b.id)} className="card flex items-center gap-3 text-start">
              <span className={`grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${b.color} text-white`}><I size={20} /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{name(b.id, b.name)}</span>{saved()[b.id] && <span className="block truncate text-[11px] text-slate-400">••{saved()[b.id].slice(-4)}</span>}</span>
            </button>
          ) })}
        </div>

        <div className="flex items-center justify-between"><p className="label">My bills</p>{pending.length > 0 && <span className="text-xs text-gold-200">{pending.length} being paid</span>}</div>
        {!data ? <p className="text-sm text-slate-500">Loading…</p> : data.bills.length === 0
          ? <Empty emoji="🧾" title="No bills yet" sub="Pay your first bill above. You'll see its status and receipt here." />
          : data.bills.map((b) => <BillCard key={b.id} b={b} footer={
            <div className="flex items-center justify-between text-xs text-slate-500"><Ago iso={b.created_at} />
              <button className="flex items-center gap-1 text-slate-400" onClick={() => setHelp(b.id)}><LifeBuoy size={13} /> Problem?</button></div>} />)}
      </div>
      {biller && <PaySheet billerId={biller} label={name(biller, BILLERS.find((x) => x.id === biller)!.name)} fee={fee} onClose={() => setBiller(null)} onDone={() => { reload(); void refresh() }} />}
      {help && <CasesHub start="new" category="payment" reference={help} subject="Problem with a bill payment" onClose={() => setHelp(null)} />}
    </div>
  )
}

function PaySheet({ billerId, label, fee, onClose, onDone }: { billerId: string; label: string; fee: number; onClose: () => void; onDone: () => void }) {
  const { me } = useLive()
  const b = BILLERS.find((x) => x.id === billerId)!
  const [account, setAccount] = useState(saved()[billerId] ?? '')
  const [amt, setAmt] = useState('')
  const [files, setFiles] = useState<Upload[]>([])
  const [review, setReview] = useState(false)
  const amount = toMinor(amt), total = amount + fee, bal = me?.balances.TRY ?? 0
  const ok = account.replace(/\s/g, '').length >= 3 && amount >= 10_00 && amount % 100 === 0 && total <= bal
  return (
    <Sheet open onClose={onClose} title={label}>
      {review ? (
        <ReviewAndPin holdLabel={`Hold to pay ${lira(total)}`} onClose={() => setReview(false)}
          rows={[['Bill', label], [b.hint, <span key="a" className="selectable">{account}</span>], ['Bill amount', lira(amount)], ['Service fee', lira(fee)], ['From Lira wallet', <b key="t">{lira(total)}</b>]]}
          warning="The Luda team pays this on the official site, usually the same day. If it can't be paid, the full amount and fee come back to your wallet."
          run={async (auth) => {
            await api('POST', 'bill-create', { type: SERVER_TYPE[b.category], provider: label, account: account.replace(/\s/g, ''), amountMinor: amount, files: files.map(({ name, type, data }) => ({ name, type, data })), ...auth })
            try { localStorage.setItem(SAVED, JSON.stringify({ ...saved(), [billerId]: account.replace(/\s/g, '') })) } catch { /* ignore */ }
            onDone()
          }}
          done={<Success title="Bill sent to the Luda team" sub={`We'll pay ${lira(amount)} to ${label} and post the receipt in My bills.`} onClose={onClose} />} />
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <label className="text-xs text-slate-400">{b.hint}<input className="input mt-1" value={account} onChange={(e) => setAccount(e.target.value)} placeholder={b.hint} inputMode={b.category === 'mobile' ? 'tel' : 'text'} /></label>
          <label className="text-xs text-slate-400">Amount on the bill (₺)<input className="input mt-1 text-lg font-bold" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="e.g. 640" inputMode="numeric" /></label>
          <div><p className="mb-1 text-xs text-slate-400">Photo of the bill (optional, helps us pay faster)</p><Attachments files={files} setFiles={(f) => setFiles(f.slice(0, 2))} /></div>
          {amount > 0 && <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
            <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Bill</span><span>{lira(amount)}</span></div>
            <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Service fee</span><span>{lira(fee)}</span></div>
            <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Total</span><b className="text-mint-300">{lira(total)}</b></div>
          </div>}
          {amount > 0 && total > bal && <p className="flex items-center gap-2 rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-200"><FileText size={14} /> Not enough in your Lira wallet ({lira(bal)}). <Link to="/exchange" className="underline">Convert Naira</Link> or <Link to="/wallet" className="underline">top up</Link>.</p>}
          <button className="btn-primary py-4" disabled={!ok} onClick={() => setReview(true)}>Review payment</button>
        </div>
      )}
    </Sheet>
  )
}
