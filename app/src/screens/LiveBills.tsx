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
import { BILLERS, BILL_FIELDS, CITIES, type BillCategory } from '../lib/data'
import { api } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { useStore } from '../lib/store'
import { HelpChip } from '../components/HelpCenter'

const ICONS: Record<BillCategory, typeof Zap> = { electricity: Zap, water: Droplets, gas: Flame, internet: Wifi, mobile: Smartphone, rent: Home }
const SERVER_TYPE: Record<BillCategory, string> = { electricity: 'electricity', water: 'water', gas: 'other', internet: 'internet', mobile: 'phone', rent: 'rent' }
const SAVED = 'luda.billAccounts'
const saved = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SAVED) ?? '{}') } catch { return {} } }

export interface LiveBill { details?: Record<string, string>; eta_at?: string | null; id: string; type: string; provider: string; account_ref: string; amount_minor: number; fee_minor: number; status: 'pending' | 'paid' | 'refunded'; note: string | null; created_at: string; updated_at: string; receiptUrls: (string | null)[]; photoUrls: (string | null)[] }

export default function LiveBills() {
  const { s } = useStore()
  const { me, refresh } = useLive()
  const { data, reload } = useApi<{ bills: LiveBill[]; fees: { billMinor: number; billHighMinor?: number; billStepMinor?: number } }>('features')
  const [biller, setBiller] = useState<string | null>(null)
  const [help, setHelp] = useState<string | null>(null)
  const city = CITIES.find((c) => c.id === s.city)
  const fees = data?.fees
  const fee = fees?.billMinor ?? 10_00
  // display only: the server charges the real fee (same rule) when the bill is sent
  const feeFor = (amount: number) => (fees?.billStepMinor && fees.billHighMinor && amount > fees.billStepMinor ? fees.billHighMinor : fee)
  const name = (id: string, n: string) => (id === 'water' ? `${city?.name ?? ''} Municipality Water`.trim() : n)
  const pending = (data?.bills ?? []).filter((b) => b.status === 'pending')

  return (
    <div className="pb-8">
      <Header back title="Pay bills" sub="From your Lira wallet · receipt in the app" right={<HelpChip topic="bills" />} />
      <div className="flex flex-col gap-4 px-5">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 p-5 text-white">
          <div className="absolute -end-8 -top-8 size-32 rounded-full bg-white/15 blur-2xl" />
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Lira wallet</p>
          <p className="text-3xl font-extrabold">{lira(me?.balances.TRY ?? 0)}</p>
          <p className="mt-1 text-sm text-white/85">KIB-TEK, water, phone, internet and rent, paid for you by the Luda team. Service fee from {lira(fee)}. Usually paid within 2 hours.</p>
        </div>
        <Steps steps={[['🧾', 'Enter the bill details'], ['⚡', 'Luda pays it, usually within 2 hours'], ['✅', 'Receipt lands here']]} />

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
      {biller && <PaySheet billerId={biller} label={name(biller, BILLERS.find((x) => x.id === biller)!.name)} feeFor={feeFor} onClose={() => setBiller(null)} onDone={() => { reload(); void refresh() }} />}
      {help && <CasesHub start="new" category="payment" reference={help} subject="Problem with a bill payment" onClose={() => setHelp(null)} />}
    </div>
  )
}

function PaySheet({ billerId, label, feeFor, onClose, onDone }: { billerId: string; label: string; feeFor: (amount: number) => number; onClose: () => void; onDone: () => void }) {
  const { me } = useLive()
  const b = BILLERS.find((x) => x.id === billerId)!
  const spec = BILL_FIELDS[billerId] ?? { account: b.hint, accountPlaceholder: b.hint, fields: [] }
  const [account, setAccount] = useState(saved()[billerId] ?? '')
  const [details, setDetails] = useState<Record<string, string>>(() => savedDetails()[billerId] ?? {})
  const [amt, setAmt] = useState('')
  const [files, setFiles] = useState<Upload[]>([])
  const [step, setStep] = useState<'form' | 'check' | 'pay'>('form')
  const [sure, setSure] = useState(false)
  const amount = toMinor(amt), fee = feeFor(amount), total = amount + fee, bal = me?.balances.TRY ?? 0
  const missing = spec.fields.filter((f) => !f.optional && !(details[f.key] ?? '').trim())
  const ibanBad = !!details.iban && !/^TR\d{24}$/.test(details.iban.replace(/\s+/g, '').toUpperCase())
  const ok = account.replace(/\s/g, '').length >= 3 && amount >= 10_00 && amount % 100 === 0 && total <= bal && !missing.length && !ibanBad
  const filled = spec.fields.filter((f) => (details[f.key] ?? '').trim()).map((f) => [f.label, details[f.key].trim()] as [string, string])
  const eta = etaText()
  return (
    <Sheet open onClose={onClose} title={label}>
      {step === 'pay' ? (
        <ReviewAndPin holdLabel={`Hold to pay ${lira(total)}`} onClose={() => setStep('check')}
          rows={[['Bill', label], [spec.account, <span key="a" className="selectable">{account}</span>], ['Bill amount', lira(amount)], ['Service fee', lira(fee)], ['From Lira wallet', <b key="t">{lira(total)}</b>], ['Ready by', eta]]}
          warning="If the bill can't be paid, the full amount and the fee come back to your wallet automatically."
          run={async (auth) => {
            const clean = Object.fromEntries(Object.entries(details).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
            await api('POST', 'bill-create', { type: SERVER_TYPE[b.category], provider: label, account: account.replace(/\s/g, ''), amountMinor: amount, details: clean, confirmed: true, files: files.map(({ name, type, data }) => ({ name, type, data })), ...auth })
            try {
              localStorage.setItem(SAVED, JSON.stringify({ ...saved(), [billerId]: account.replace(/\s/g, '') }))
              const keep = Object.fromEntries(Object.entries(clean).filter(([k]) => k !== 'period' && k !== 'reference'))
              localStorage.setItem(SAVED_DETAILS, JSON.stringify({ ...savedDetails(), [billerId]: keep }))
            } catch { /* ignore */ }
            onDone()
          }}
          done={<Success title="Your bill is being paid ⚡" sub={`We're paying ${lira(amount)} to ${label}. Expected ${eta}. The receipt will appear in My bills.`} onClose={onClose} />} />
      ) : step === 'check' ? (
        <div className="flex flex-col gap-3 pb-4">
          <p className="text-sm text-slate-300">Check every detail. We pay <b>exactly</b> what you entered.</p>
          <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
            {([[spec.account, account], ...filled, ['Amount on the bill', lira(amount)]] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-4 py-2.5"><span className="text-slate-400">{k}</span><span className="selectable text-end font-semibold">{v}</span></div>
            ))}
          </div>
          <label className="flex items-start gap-3 rounded-2xl bg-mint-400/10 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-emerald-400" checked={sure} onChange={(e) => setSure(e.target.checked)} />
            <span>These details are correct and match my bill.</span>
          </label>
          <button className="btn-primary py-4" disabled={!sure} onClick={() => setStep('pay')}>Continue to pay {lira(total)}</button>
          <button className="btn-ghost py-3 text-sm" onClick={() => { setSure(false); setStep('form') }}>✏️ Edit details</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          {spec.note && <p className="rounded-2xl bg-sky-400/10 p-3 text-xs text-sky-200">{spec.note}</p>}
          <label className="text-xs text-slate-400">{spec.account}<input className="input mt-1" value={account} onChange={(e) => setAccount(e.target.value)} placeholder={spec.accountPlaceholder} inputMode={b.category === 'mobile' || billerId === 'lpg' ? 'tel' : 'text'} /></label>
          {spec.fields.map((f) => (
            <label key={f.key} className="text-xs text-slate-400">{f.label}{f.optional && <span className="text-slate-500"> (optional)</span>}
              {f.options ? (
                <div className="mt-1 flex flex-wrap gap-2">{f.options.map((o) => <button type="button" key={o} onClick={() => setDetails((d) => ({ ...d, [f.key]: o }))} className={`chip py-2 ${details[f.key] === o ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/40' : 'bg-fg/[0.06] text-slate-300'}`}>{o}</button>)}</div>
              ) : <input className="input mt-1" value={details[f.key] ?? ''} maxLength={80} placeholder={f.placeholder} onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))} />}
            </label>
          ))}
          {ibanBad && <p className="text-xs text-rose-300">The IBAN should be TR followed by 24 digits.</p>}
          <label className="text-xs text-slate-400">Amount on the bill (₺)<input className="input mt-1 text-lg font-bold" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="e.g. 640" inputMode="numeric" /></label>
          <div><p className="mb-1 text-xs text-slate-400">Photo of the bill (optional, helps us pay faster)</p><Attachments files={files} setFiles={(f) => setFiles(f.slice(0, 2))} /></div>
          {amount > 0 && <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
            <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Bill</span><span>{lira(amount)}</span></div>
            <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Service fee</span><span>{lira(fee)}</span></div>
            <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Total</span><b className="text-mint-300">{lira(total)}</b></div>
            <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Ready by</span><span className="text-mint-200">⚡ {eta}</span></div>
          </div>}
          {amount > 0 && total > bal && <p className="flex items-center gap-2 rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-200"><FileText size={14} /> Not enough in your Lira wallet ({lira(bal)}). <Link to="/exchange" className="underline">Convert Naira</Link> or <Link to="/wallet" className="underline">top up</Link>.</p>}
          <button className="btn-primary py-4" disabled={!ok} onClick={() => setStep('check')}>{missing.length ? `Fill in: ${missing[0].label}` : 'Review details'}</button>
        </div>
      )}
    </Sheet>
  )
}

const SAVED_DETAILS = 'luda.billDetails'
const savedDetails = (): Record<string, Record<string, string>> => { try { return JSON.parse(localStorage.getItem(SAVED_DETAILS) ?? '{}') } catch { return {} } }

/** Same rule as the server (billEta): ~2 h inside 09:00–19:00 Cyprus time, otherwise 11:00 next morning. Display only. */
export function etaText(now = new Date()) {
  const H = 3 * 3600_000, local = new Date(now.getTime() + H), h = local.getUTCHours() + local.getUTCMinutes() / 60
  const at = h >= 9 && h < 19 ? new Date(now.getTime() + 2 * 3600_000) : new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + (h >= 19 ? 1 : 0), 11) - H)
  return etaLabel(at.toISOString(), now)
}
export function etaLabel(iso: string, now = new Date()) {
  const at = new Date(iso), time = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const day = at.toDateString() === now.toDateString() ? 'today' : at.getTime() - now.getTime() < 2 * 86400_000 ? 'tomorrow' : at.toLocaleDateString()
  return `by ${time} ${day}`
}
