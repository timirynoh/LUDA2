// v1.35.0: residency fees (state hospital medicals, tax office permit fee) paid like a bill. The student copies the
// payment page link from the official site (after tapping its payment button), adds a screenshot showing the amount,
// and pays Luda at checkout. The Luda team opens that page, pays it and adds the official receipt; if it can't be
// paid the money goes back to the card. Never asks for the portal password.
import { ClipboardPaste, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { lira, toMinor } from './LiveKit'
import { DirectPay } from './Checkout'
import { Attachments, type Upload } from './LiveSupport'
import { Sheet } from './ui'

const PAYEES = [
  { id: 'Tax office', emoji: '🏛️', title: 'Tax office', sub: 'Permit fee (harç) + stamp duty', how: 'On the tax office page, pick your fee (e.g. Öğrenci İzin Harcı) so the total shows, then copy the page link.' },
  { id: 'State hospital', emoji: '🏥', title: 'State hospital', sub: 'Medicals / blood test fee', how: 'On the official site, tap the payment button for the medical check. When the payment page opens, copy its link.' },
] as const

const isGov = (link: string) => { try { const u = new URL(link); return u.protocol === 'https:' && (u.hostname === 'gov.ct.tr' || u.hostname.endsWith('.gov.ct.tr')) } catch { return false } }
const isLink = (link: string) => { try { return new URL(link).protocol === 'https:' } catch { return false } }

export function ResidencyFeeSheet({ feeFor, onClose }: { feeFor: (amount: number) => number; onClose: () => void }) {
  const [payee, setPayee] = useState<(typeof PAYEES)[number]['id'] | null>(null)
  const [link, setLink] = useState('')
  const [idNo, setIdNo] = useState('')
  const [name, setName] = useState('')
  const [amt, setAmt] = useState('')
  const [files, setFiles] = useState<Upload[]>([])
  const [step, setStep] = useState<'form' | 'check' | 'pay'>('form')
  const [sure, setSure] = useState(false)
  const p = PAYEES.find((x) => x.id === payee)
  const amount = toMinor(amt), fee = feeFor(amount), total = amount + fee
  const url = link.trim()
  const ok = !!p && isLink(url) && idNo.replace(/\s/g, '').length >= 3 && name.trim().length >= 2 && amount >= 10_00 && files.length > 0
  const need = !p ? 'Pick who the fee is for' : !isLink(url) ? 'Paste the payment page link' : idNo.replace(/\s/g, '').length < 3 ? 'Add your ID or tax number' : name.trim().length < 2 ? 'Add your full name' : amount < 10_00 ? 'Enter the amount on the page' : !files.length ? 'Add a screenshot of the payment page' : ''
  const paste = async () => { try { const t = await navigator.clipboard.readText(); if (t) setLink(t.trim()) } catch { /* the phone didn't allow it: they can paste by hand */ } }
  return (
    <Sheet open onClose={onClose} title="Residency fees">
      {step === 'pay' && p ? (
        <DirectPay onClose={() => setStep('check')}
          body={{ kind: 'bill', type: 'residency', biller: 'residency', provider: p.id, account: idNo.replace(/\s/g, ''), amountMinor: amount, details: { name: name.trim(), link: url }, confirmed: true, files: files.map(({ name: n, type, data }) => ({ name: n, type, data })) }}
          rows={[['For', `${p.emoji} ${p.title}`], ['ID / tax no.', idNo], ['Fee on the page', lira(amount)]]}
          note="The Luda team pays it on the official page and adds the receipt. If it can't be paid, the money goes back to your card or bank." />
      ) : step === 'check' && p ? (
        <div className="flex flex-col gap-3 pb-4">
          <p className="text-sm text-slate-300">Check every detail. We pay <b>exactly</b> this fee on the page you sent.</p>
          <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
            {([['For', `${p.emoji} ${p.title}`], ['Full name', name], ['ID / tax no.', idNo], ['Payment page', new URL(url).hostname], ['Fee on the page', lira(amount)], ['Service fee', lira(fee)], ['Total', lira(total)]] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 px-4 py-2.5"><span className="text-slate-400">{k}</span><span className="selectable break-all text-end font-semibold">{v}</span></div>
            ))}
          </div>
          <label className="flex items-start gap-3 rounded-2xl bg-mint-400/10 p-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-emerald-400" checked={sure} onChange={(e) => setSure(e.target.checked)} />
            <span>The link and amount are from my own payment page, and the details are correct.</span>
          </label>
          <button className="btn-primary py-4" disabled={!sure} onClick={() => setStep('pay')}>Continue to pay {lira(total)}</button>
          <button className="btn-ghost py-3 text-sm" onClick={() => { setSure(false); setStep('form') }}>✏️ Edit details</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <p className="text-sm text-slate-300">Luda pays your permit fees for you. Pick the fee, send us the payment page, and we add the official receipt.</p>
          <div className="grid grid-cols-2 gap-2">
            {PAYEES.map((x) => (
              <button key={x.id} onClick={() => setPayee(x.id)} className={`card flex flex-col items-start gap-1 py-3 text-start ${payee === x.id ? 'ring-2 ring-mint-400' : ''}`}>
                <span className="text-2xl">{x.emoji}</span><span className="text-sm font-semibold">{x.title}</span><span className="text-[11px] text-slate-400">{x.sub}</span>
              </button>
            ))}
          </div>
          {p && <>
            <ol className="flex flex-col gap-1.5 rounded-2xl bg-sky-400/10 p-3 text-xs text-sky-100">
              <li>1. {p.how}</li>
              <li>2. Copy the link from the address bar and paste it below.</li>
              <li>3. Take a screenshot of that page so we can see the amount.</li>
            </ol>
            <label className="text-xs text-slate-400">Payment page link
              <div className="mt-1 flex gap-2"><input className="input flex-1" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" inputMode="url" autoCapitalize="off" autoCorrect="off" />
                <button type="button" className="btn-ghost shrink-0 px-3 text-xs" onClick={() => void paste()}><ClipboardPaste size={15} /> Paste</button></div>
            </label>
            {url && !isLink(url) && <p className="text-xs text-rose-300">This doesn't look like a payment page link. It should start with https://</p>}
            {isLink(url) && !isGov(url) && <p className="rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100">⚠️ This isn't a gov.ct.tr address. Make sure you copied it from the official site; the team checks it before paying.</p>}
            <label className="text-xs text-slate-400">Kimlik No, tax number or passport no. (as on the page)<input className="input mt-1" value={idNo} onChange={(e) => setIdNo(e.target.value)} placeholder="e.g. 123-456-789" /></label>
            <label className="text-xs text-slate-400">Full name<input className="input mt-1" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="As on your passport" /></label>
            <label className="text-xs text-slate-400">Total amount on the page (₺)<input className="input mt-1 text-lg font-bold" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="e.g. 1570" inputMode="decimal" /></label>
            <div><p className="mb-1 text-xs text-slate-400">Screenshot of the payment page (required)</p><Attachments files={files} setFiles={(f) => setFiles(f.slice(0, 2))} /></div>
            {amount > 0 && <div className="divide-y divide-fg/5 rounded-2xl bg-fg/[0.04] text-sm">
              <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Fee on the page</span><span>{lira(amount)}</span></div>
              <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Service fee</span><span>{lira(fee)}</span></div>
              <div className="flex justify-between px-4 py-2.5"><span className="text-slate-400">Total</span><b className="text-mint-300">{lira(total)}</b></div>
            </div>}
            <p className="flex items-start gap-2 text-[11px] text-slate-400"><ShieldCheck size={14} className="mt-0.5 shrink-0 text-mint-300" /> Never send your portal password. We only need the payment page.</p>
          </>}
          <button className="btn-primary py-4" disabled={!ok} onClick={() => setStep('check')}>{need || 'Review details'}</button>
        </div>
      )}
    </Sheet>
  )
}
