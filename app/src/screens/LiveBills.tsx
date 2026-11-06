// Live: bill pay. The bill amount + service fee leaves the Lira wallet (held), then either the top-up partner sends
// it automatically (prepaid mobile TL, when switched on) or the Luda team pays it on the official site / by bank
// transfer and posts the receipt here. If it can't be paid, everything comes back. v1.22.0: saved bills (on the
// server, so they follow the account) with a monthly reminder and two-tap pay, and a simpler rent flow.
import { BellRing, Droplets, FileText, Flame, Home, Landmark, LifeBuoy, MoreHorizontal, Smartphone, Trash2, Wifi, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Ago, BillCard } from '../components/LiveBillCard'
import { Empty, Steps, lira, toMinor, useApi } from '../components/LiveKit'
import { ReviewAndPin, errMsg } from '../components/LiveMoney'
import { Attachments, CasesHub, type Upload } from '../components/LiveSupport'
import { Header, Sheet, Success } from '../components/ui'
import { BILLERS, BILL_FIELDS, CITIES, type BillCategory } from '../lib/data'
import { api } from '../lib/live'
import { useLive } from '../lib/liveStore'
import { useStore } from '../lib/store'
import { HelpChip } from '../components/HelpCenter'

const ICONS: Record<BillCategory, typeof Zap> = { electricity: Zap, water: Droplets, gas: Flame, internet: Wifi, mobile: Smartphone, rent: Home }
const SERVER_TYPE: Record<BillCategory, string> = { electricity: 'electricity', water: 'water', gas: 'other', internet: 'internet', mobile: 'phone', rent: 'rent' }
const REMIND_DAYS = [0, 1, 5, 10, 15, 20, 25, 28]
const isTopup = (kind?: string) => /top-up/i.test(kind ?? '')

export interface LiveBill { biller?: string | null; claimed_at?: string | null; auto?: { status: string } | null; details?: Record<string, string>; eta_at?: string | null; id: string; type: string; provider: string; account_ref: string; amount_minor: number; fee_minor: number; status: 'pending' | 'paid' | 'refunded'; note: string | null; created_at: string; updated_at: string; receiptUrls: (string | null)[]; photoUrls: (string | null)[] }
export interface SavedBill { id: string; biller: string; type: string; provider: string; account: string; details: Record<string, string>; label: string | null; amount_minor: number | null; remind_day: number | null; last_paid_at: string | null; paidThisMonth: boolean; due: boolean }
type Fees = { billMinor: number; billHighMinor?: number; billStepMinor?: number }
type Features = { bills: LiveBill[]; saved: SavedBill[]; fees: Fees; topup?: { billers: string[]; maxMinor: number } }

export default function LiveBills() {
  const { s } = useStore()
  const { me, refresh } = useLive()
  const { data, reload } = useApi<Features>('features')
  const [params, setParams] = useSearchParams()
  const [biller, setBiller] = useState<string | null>(null)
  const [quick, setQuick] = useState<SavedBill | null>(null)
  const [manage, setManage] = useState<SavedBill | null>(null)
  const [help, setHelp] = useState<string | null>(null)
  const city = CITIES.find((c) => c.id === s.city)
  const fees = data?.fees
  const fee = fees?.billMinor ?? 10_00
  // display only: the server charges the real fee (same rule) when the bill is sent
  const feeFor = (amount: number) => (fees?.billStepMinor && fees.billHighMinor && amount > fees.billStepMinor ? fees.billHighMinor : fee)
  const name = (id: string, n: string) => (id === 'water' ? `${city?.name ?? ''} Municipality Water`.trim() : n)
  const pending = (data?.bills ?? []).filter((b) => b.status === 'pending')
  const saved = data?.saved ?? []
  const auto = data?.topup?.billers ?? []

  // /bills?pay=<saved id> (from the monthly reminder) opens two-tap pay
  const payId = params.get('pay')
  useEffect(() => {
    if (!payId || !data) return
    const sb = data.saved.find((x) => x.id === payId)
    if (sb) setQuick(sb) // eslint-disable-line react-hooks/set-state-in-effect -- opening from a link
    setParams((p) => { p.delete('pay'); return p }, { replace: true })
  }, [payId, data, setParams])
  const done = () => { reload(); void refresh() }

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

        {saved.length > 0 && <>
          <p className="label">Saved bills</p>
          <div className="flex flex-col gap-2">
            {saved.map((sb) => { const b = BILLERS.find((x) => x.id === sb.biller); const I = b ? ICONS[b.category] : FileText; return (
              <div key={sb.id} className={`card flex items-center gap-3 py-3 ${sb.due ? 'ring-1 ring-gold-400/50' : ''}`}>
                <span className={`grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${b?.color ?? 'from-slate-400 to-slate-600'} text-white`}><I size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{sb.label || sb.provider}</p>
                  <p className="truncate text-[11px] text-slate-400">
                    {sb.label ? `${sb.provider} · ` : ''}••{sb.account.slice(-4)}
                    {pending.some((x) => x.biller === sb.biller && x.account_ref === sb.account) ? <span className="text-gold-200"> · Being paid</span> : sb.due ? <span className="text-gold-200"> · Due this month</span> : sb.paidThisMonth ? <span className="text-mint-300"> · Paid this month</span> : sb.remind_day ? ` · Reminder on day ${sb.remind_day}` : ''}
                  </p>
                </div>
                <button className="grid size-9 place-items-center rounded-xl text-slate-400" aria-label="Manage" onClick={() => setManage(sb)}><MoreHorizontal size={18} /></button>
                <button className="btn-primary px-4 py-2 text-sm" onClick={() => setQuick(sb)}>Pay</button>
              </div>
            ) })}
          </div>
        </>}

        <p className="label">Choose a bill</p>
        <div className="grid grid-cols-2 gap-2.5 tab:grid-cols-3">
          {BILLERS.map((b) => { const I = ICONS[b.category]; return (
            <button key={b.id} onClick={() => setBiller(b.id)} className="card flex items-center gap-3 text-start">
              <span className={`grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${b.color} text-white`}><I size={20} /></span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{name(b.id, b.name)}</span>
                {auto.includes(b.id) ? <span className="block truncate text-[11px] text-mint-300">⚡ Instant top-up</span> : b.id === 'rent' ? <span className="block truncate text-[11px] text-slate-400">Bank transfer</span> : null}</span>
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
      {biller === 'rent' && <RentSheet saved={saved.find((x) => x.biller === 'rent') ?? null} feeFor={feeFor} onClose={() => setBiller(null)} onDone={done} />}
      {biller && biller !== 'rent' && <PaySheet billerId={biller} label={name(biller, BILLERS.find((x) => x.id === biller)!.name)} auto={auto.includes(biller)} maxAuto={data?.topup?.maxMinor ?? 0}
        prefill={saved.find((x) => x.biller === biller) ?? null} feeFor={feeFor} onClose={() => setBiller(null)} onDone={done} />}
      {quick && <QuickPay sb={quick} auto={auto.includes(quick.biller)} feeFor={feeFor} onClose={() => setQuick(null)} onDone={done} onEdit={() => { setBiller(quick.biller); setQuick(null) }} />}
      {manage && <ManageSaved sb={manage} onClose={() => setManage(null)} onDone={done} />}
      {help && <CasesHub start="new" category="payment" reference={help} subject="Problem with a bill payment" onClose={() => setHelp(null)} />}
    </div>
  )
}

/** "Save this bill" + monthly reminder, shown under every pay form. */
function SaveBox({ save, setSave, remind, setRemind, label, setLabel }: { save: boolean; setSave: (v: boolean) => void; remind: number; setRemind: (v: number) => void; label: string; setLabel: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-fg/[0.04] p-3">
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-emerald-400" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save this bill to pay again in two taps</label>
      {save && <>
        <input className="input text-sm" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name it (optional), e.g. My flat" />
        <p className="flex items-center gap-1.5 text-xs text-slate-400"><BellRing size={13} /> Remind me every month on</p>
        <div className="flex flex-wrap gap-1.5">{REMIND_DAYS.map((d) => <button type="button" key={d} onClick={() => setRemind(d)} className={`chip px-3 py-1.5 text-xs ${remind === d ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/40' : 'bg-fg/[0.06] text-slate-300'}`}>{d === 0 ? 'No reminder' : `Day ${d}`}</button>)}</div>
      </>}
    </div>
  )
}

const cleanDetails = (details: Record<string, string>) => Object.fromEntries(Object.entries(details).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))

function PaySheet({ billerId, label, auto, maxAuto, prefill, feeFor, onClose, onDone }: { billerId: string; label: string; auto: boolean; maxAuto: number; prefill: SavedBill | null; feeFor: (amount: number) => number; onClose: () => void; onDone: () => void }) {
  const { me } = useLive()
  const b = BILLERS.find((x) => x.id === billerId)!
  const spec = BILL_FIELDS[billerId] ?? { account: b.hint, accountPlaceholder: b.hint, fields: [] }
  const [account, setAccount] = useState(prefill?.account ?? '')
  const [details, setDetails] = useState<Record<string, string>>(() => ({ ...(prefill?.details ?? {}) }))
  const [amt, setAmt] = useState('')
  const [files, setFiles] = useState<Upload[]>([])
  const [step, setStep] = useState<'form' | 'check' | 'pay'>('form')
  const [sure, setSure] = useState(false)
  const [save, setSave] = useState(true)
  const [remind, setRemind] = useState(prefill?.remind_day ?? 0)
  const [name, setName] = useState(prefill?.label ?? '')
  const [result, setResult] = useState<string | null>(null)
  const instant = auto && isTopup(details.kind)
  const amount = toMinor(amt), fee = feeFor(amount), total = amount + fee, bal = me?.balances.TRY ?? 0
  const missing = spec.fields.filter((f) => !f.optional && !(details[f.key] ?? '').trim())
  const ok = account.replace(/\s/g, '').length >= 3 && amount >= 10_00 && amount % 100 === 0 && total <= bal && !missing.length && (!instant || amount <= maxAuto)
  const filled = spec.fields.filter((f) => (details[f.key] ?? '').trim()).map((f) => [f.label, details[f.key].trim()] as [string, string])
  const eta = instant ? 'in seconds' : etaText()
  return (
    <Sheet open onClose={onClose} title={label}>
      {step === 'pay' ? (
        <ReviewAndPin holdLabel={`Hold to pay ${lira(total)}`} onClose={() => setStep('check')}
          rows={[['Bill', label], [spec.account, account], ['Bill amount', lira(amount)], ['Service fee', lira(fee)], ['From Lira wallet', <b key="t">{lira(total)}</b>], ['Ready', instant ? '⚡ Instant' : eta]]}
          warning="If the bill can't be paid, the full amount and the fee come back to your wallet automatically."
          run={async (auth) => {
            const r = await api<{ bill: LiveBill }>('POST', 'bill-create', { type: SERVER_TYPE[b.category], biller: billerId, provider: label, account: account.replace(/\s/g, ''), amountMinor: amount, details: cleanDetails(details), confirmed: true, save, label: name.trim(), remind, files: files.map(({ name: n, type, data }) => ({ name: n, type, data })), ...auth })
            setResult(r.bill.status === 'paid' ? 'paid' : r.bill.auto ? r.bill.auto.status : 'pending')
            onDone()
          }}
          done={result === 'paid' ? <Success title="Top-up sent ✅" sub={`${lira(amount)} is on ${account}. It can take a minute to show on the phone.`} onClose={onClose} />
            : result === 'processing' ? <Success title="Sending your top-up ⚡" sub="It usually takes a few seconds. You'll get a notification when it's done." onClose={onClose} />
            : <Success title="Your bill is being paid ⚡" sub={`We're paying ${lira(amount)} to ${label}. Expected ${etaText()}. The receipt will appear in My bills.`} onClose={onClose} />} />
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
          {instant && <p className="rounded-2xl bg-mint-400/10 p-3 text-xs text-mint-200">⚡ Instant: this top-up is sent automatically in seconds. If the operator doesn't accept it, the Luda team sends it for you instead.</p>}
          <label className="text-xs text-slate-400">Amount on the bill (₺)<input className="input mt-1 text-lg font-bold" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="e.g. 640" inputMode="numeric" /></label>
          {instant && amount > maxAuto && <p className="text-xs text-rose-300">{`Top-ups can be up to ${lira(maxAuto)} at a time.`}</p>}
          {!instant && <div><p className="mb-1 text-xs text-slate-400">Photo of the bill (optional, helps us pay faster)</p><Attachments files={files} setFiles={(f) => setFiles(f.slice(0, 2))} /></div>}
          {amount > 0 && <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
            <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Bill</span><span>{lira(amount)}</span></div>
            <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Service fee</span><span>{lira(fee)}</span></div>
            <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Total</span><b className="text-mint-300">{lira(total)}</b></div>
            <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Ready</span><span className="text-mint-200">⚡ {eta}</span></div>
          </div>}
          {amount > 0 && total > bal && <NotEnough bal={bal} />}
          <SaveBox save={save} setSave={setSave} remind={remind} setRemind={setRemind} label={name} setLabel={setName} />
          <button className="btn-primary py-4" disabled={!ok} onClick={() => setStep('check')}>{missing.length ? `Fill in: ${missing[0].label}` : 'Review details'}</button>
        </div>
      )}
    </Sheet>
  )
}

const NotEnough = ({ bal }: { bal: number }) => <p className="flex items-center gap-2 rounded-2xl bg-rose-500/10 p-3 text-xs text-rose-200"><FileText size={14} /> Not enough in your Lira wallet ({lira(bal)}). <Link to="/exchange" className="underline">Convert Naira</Link> or <Link to="/wallet" className="underline">top up</Link>.</p>

/** Two taps for a saved bill: confirm the amount → hold + PIN. */
function QuickPay({ sb, auto, feeFor, onClose, onDone, onEdit }: { sb: SavedBill; auto: boolean; feeFor: (amount: number) => number; onClose: () => void; onDone: () => void; onEdit: () => void }) {
  const { me } = useLive()
  const [amt, setAmt] = useState(sb.amount_minor ? String(sb.amount_minor / 100) : '')
  const [step, setStep] = useState<'amount' | 'pay'>('amount')
  const [result, setResult] = useState<string | null>(null)
  const b = BILLERS.find((x) => x.id === sb.biller)
  const rent = sb.biller === 'rent'
  const [month, setMonth] = useState(months()[0])
  const amount = toMinor(amt), fee = feeFor(amount), total = amount + fee, bal = me?.balances.TRY ?? 0
  const instant = auto && isTopup(sb.details.kind)
  const ok = amount >= 10_00 && amount % 100 === 0 && total <= bal
  const title = sb.label || sb.provider
  return (
    <Sheet open onClose={onClose} title={`Pay ${title}`}>
      {step === 'pay' ? (
        <ReviewAndPin holdLabel={`Hold to pay ${lira(total)}`} onClose={() => setStep('amount')}
          rows={[['Bill', sb.provider], ['Number', `••${sb.account.slice(-4)}`], ...(rent ? [['Landlord', sb.details.landlord ?? ''], ['Month', month]] as [string, string][] : []), ['Bill amount', lira(amount)], ['Service fee', lira(fee)], ['From Lira wallet', <b key="t">{lira(total)}</b>]]}
          warning="If the bill can't be paid, the full amount and the fee come back to your wallet automatically."
          run={async (auth) => {
            const details = rent ? { ...sb.details, period: month } : sb.details
            const r = await api<{ bill: LiveBill }>('POST', 'bill-create', { type: sb.type, biller: sb.biller, provider: sb.provider, account: sb.account, amountMinor: amount, details, confirmed: true, save: true, ...auth })
            setResult(r.bill.status === 'paid' ? 'paid' : r.bill.auto?.status ?? 'pending')
            onDone()
          }}
          done={result === 'paid' ? <Success title="Top-up sent ✅" sub={`${lira(amount)} is on the phone.`} onClose={onClose} />
            : <Success title="Your bill is being paid ⚡" sub={instant ? 'You’ll get a notification when it’s done.' : `Expected ${etaText()}. The receipt will appear in My bills.`} onClose={onClose} />} />
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <div className="flex items-center gap-3 rounded-2xl bg-fg/[0.04] p-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${b?.color ?? 'from-slate-400 to-slate-600'} text-white`}>{b ? (() => { const I = ICONS[b.category]; return <I size={18} /> })() : <FileText size={18} />}</span>
            <div className="min-w-0 flex-1 text-sm"><p className="truncate font-semibold">{sb.provider}</p><p className="truncate text-xs text-slate-400">••{sb.account.slice(-4)}{sb.details.kind ? ` · ${sb.details.kind}` : ''}{sb.details.landlord ? ` · ${sb.details.landlord}` : ''}</p></div>
            <button className="text-xs text-slate-400 underline" onClick={onEdit}>Change details</button>
          </div>
          {rent && <div><p className="mb-1 text-xs text-slate-400">Rent month</p><div className="flex flex-wrap gap-2">{months().map((m) => <button key={m} onClick={() => setMonth(m)} className={`chip py-2 ${month === m ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/40' : 'bg-fg/[0.06] text-slate-300'}`}>{m}</button>)}</div></div>}
          <label className="text-xs text-slate-400">Amount on the bill (₺){sb.amount_minor ? <span className="text-slate-500"> · last time {lira(sb.amount_minor)}</span> : null}
            <input className="input mt-1 text-2xl font-extrabold" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="e.g. 640" inputMode="numeric" autoFocus={!sb.amount_minor} /></label>
          {amount > 0 && <p className="text-xs text-slate-400">Service fee {lira(fee)} · total <b className="text-mint-300">{lira(total)}</b> · {instant ? '⚡ instant' : `ready ${etaText()}`}</p>}
          {amount > 0 && total > bal && <NotEnough bal={bal} />}
          <button className="btn-primary py-4" disabled={!ok} onClick={() => setStep('pay')}>Pay {amount ? lira(total) : ''}</button>
        </div>
      )}
    </Sheet>
  )
}

/** Rename a saved bill, change or turn off its monthly reminder, or remove it. */
function ManageSaved({ sb, onClose, onDone }: { sb: SavedBill; onClose: () => void; onDone: () => void }) {
  const [label, setLabel] = useState(sb.label ?? '')
  const [remind, setRemind] = useState(sb.remind_day ?? 0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async (remove: boolean) => {
    setBusy(true); setErr('')
    try {
      if (remove) await api('POST', 'saved-bill-remove', { id: sb.id })
      else await api('POST', 'saved-bill-save', { biller: sb.biller, type: sb.type, provider: sb.provider, account: sb.account, details: sb.details, label: label.trim(), remind })
      onDone(); onClose()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title={sb.label || sb.provider}>
      <div className="flex flex-col gap-3 pb-4">
        <p className="text-xs text-slate-400">{sb.provider} · ••{sb.account.slice(-4)}</p>
        <label className="text-xs text-slate-400">Name<input className="input mt-1" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. My flat" /></label>
        <p className="flex items-center gap-1.5 text-xs text-slate-400"><BellRing size={13} /> Remind me every month on</p>
        <div className="flex flex-wrap gap-1.5">{REMIND_DAYS.map((d) => <button key={d} onClick={() => setRemind(d)} className={`chip px-3 py-1.5 text-xs ${remind === d ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/40' : 'bg-fg/[0.06] text-slate-300'}`}>{d === 0 ? 'No reminder' : `Day ${d}`}</button>)}</div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-3.5" disabled={busy} onClick={() => void go(false)}>Save</button>
        <button className="btn-ghost py-3 text-sm text-rose-300" disabled={busy} onClick={() => void go(true)}><Trash2 size={15} /> Remove this saved bill</button>
      </div>
    </Sheet>
  )
}

/** This month and the next two, as "November 2026". */
const months = () => [0, 1, 2].map((i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + i); return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) })
const fmtIban = (v: string) => v.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim()

/** Rent by bank transfer: landlord + IBAN once, then the month and amount. The team sends a FAST transfer and posts the bank receipt. */
function RentSheet({ saved, feeFor, onClose, onDone }: { saved: SavedBill | null; feeFor: (amount: number) => number; onClose: () => void; onDone: () => void }) {
  const { me } = useLive()
  const [landlord, setLandlord] = useState(saved?.details.landlord ?? '')
  const [iban, setIban] = useState(saved?.details.iban ? fmtIban(saved.details.iban) : '')
  const [flat, setFlat] = useState(saved?.account ?? '')
  const [month, setMonth] = useState(months()[0])
  const [desc, setDesc] = useState('')
  const [amt, setAmt] = useState(saved?.amount_minor ? String(saved.amount_minor / 100) : '')
  const [step, setStep] = useState<'form' | 'check' | 'pay'>('form')
  const [sure, setSure] = useState(false)
  const [save, setSave] = useState(true)
  const [remind, setRemind] = useState(saved?.remind_day ?? 0)
  const [label, setLabel] = useState(saved?.label ?? '')
  const raw = iban.replace(/\s+/g, '').toUpperCase(), ibanOk = /^TR\d{24}$/.test(raw)
  const amount = toMinor(amt), fee = feeFor(amount), total = amount + fee, bal = me?.balances.TRY ?? 0
  const ok = landlord.trim().length >= 3 && ibanOk && flat.trim().length >= 3 && amount >= 10_00 && amount % 100 === 0 && total <= bal
  const description = desc.trim() || `Rent ${month}`
  return (
    <Sheet open onClose={onClose} title="Pay rent">
      {step === 'pay' ? (
        <ReviewAndPin holdLabel={`Hold to pay ${lira(total)}`} onClose={() => setStep('check')}
          rows={[['To', landlord], ['IBAN', fmtIban(raw)], ['Month', month], ['Rent', lira(amount)], ['Service fee', lira(fee)], ['From Lira wallet', <b key="t">{lira(total)}</b>], ['Ready', etaText()]]}
          warning="If the transfer can't be made, the full amount and the fee come back to your wallet automatically."
          run={async (auth) => {
            await api('POST', 'bill-create', { type: 'rent', biller: 'rent', provider: 'Rent', account: flat.replace(/\s/g, ''), amountMinor: amount, details: { landlord: landlord.trim(), iban: raw, period: month, reference: description }, confirmed: true, save, label: label.trim(), remind, ...auth })
            onDone()
          }}
          done={<Success title="Your rent is on its way 🏠" sub={`We're sending ${lira(amount)} to ${landlord}. Expected ${etaText()}. The bank receipt will appear in My bills to show your landlord.`} onClose={onClose} />} />
      ) : step === 'check' ? (
        <div className="flex flex-col gap-3 pb-4">
          <p className="text-sm text-slate-300">Check the IBAN and name carefully. A bank transfer can't be taken back.</p>
          <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
            {([["Landlord's name", landlord], ['IBAN', fmtIban(raw)], ['Room / flat', flat], ['Month', month], ['Description', description], ['Rent', lira(amount)]] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-4 py-2.5"><span className="text-slate-400">{k}</span><span className="selectable break-all text-end font-semibold">{v}</span></div>
            ))}
          </div>
          <label className="flex items-start gap-3 rounded-2xl bg-mint-400/10 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-emerald-400" checked={sure} onChange={(e) => setSure(e.target.checked)} />
            <span>The name and IBAN are my landlord’s and they are correct.</span>
          </label>
          <button className="btn-primary py-4" disabled={!sure} onClick={() => setStep('pay')}>Continue to pay {lira(total)}</button>
          <button className="btn-ghost py-3 text-sm" onClick={() => { setSure(false); setStep('form') }}>✏️ Edit details</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <Steps steps={[['🏠', 'Landlord’s name and IBAN'], ['🏦', 'Luda sends a bank transfer'], ['🧾', 'Bank receipt (dekont) here']]} />
          <label className="text-xs text-slate-400">Landlord’s full name (account holder)<input className="input mt-1" maxLength={80} value={landlord} onChange={(e) => setLandlord(e.target.value)} placeholder="Exactly as on the bank account" /></label>
          <label className="text-xs text-slate-400">IBAN<input className="input mt-1 font-mono" value={iban} onChange={(e) => setIban(fmtIban(e.target.value).slice(0, 32))} placeholder="TR00 0000 0000 0000 0000 0000 00" autoCapitalize="characters" /></label>
          {raw.length > 4 && !ibanOk && <p className="text-xs text-rose-300">The IBAN should be TR followed by 24 digits.</p>}
          {ibanOk && <p className="flex items-center gap-1.5 text-xs text-mint-300"><Landmark size={13} /> Looks like a valid Turkish IBAN</p>}
          <label className="text-xs text-slate-400">Room / flat / dorm<input className="input mt-1" maxLength={40} value={flat} onChange={(e) => setFlat(e.target.value)} placeholder="e.g. Flat 4B" /></label>
          <div><p className="mb-1 text-xs text-slate-400">Rent month</p><div className="flex flex-wrap gap-2">{months().map((m) => <button key={m} onClick={() => setMonth(m)} className={`chip py-2 ${month === m ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/40' : 'bg-fg/[0.06] text-slate-300'}`}>{m}</button>)}</div></div>
          <label className="text-xs text-slate-400">Rent amount (₺)<input className="input mt-1 text-lg font-bold" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="e.g. 8000" inputMode="numeric" /></label>
          <label className="text-xs text-slate-400">Payment description <span className="text-slate-500">(optional)</span><input className="input mt-1" maxLength={60} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={`Rent ${month}`} /></label>
          {amount > 0 && <p className="text-xs text-slate-400">Service fee {lira(fee)} · total <b className="text-mint-300">{lira(total)}</b> · ready {etaText()}</p>}
          {amount > 0 && total > bal && <NotEnough bal={bal} />}
          <SaveBox save={save} setSave={setSave} remind={remind} setRemind={setRemind} label={label} setLabel={setLabel} />
          <button className="btn-primary py-4" disabled={!ok} onClick={() => setStep('check')}>Review details</button>
        </div>
      )}
    </Sheet>
  )
}

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
