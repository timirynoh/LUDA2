// Free manual ID check (v1.23.0, owner's pick): when Didit is out of credit or a check keeps failing, the person sends
// their details, a photo of the document and a selfie holding today's code. The Luda team checks it in Luda HQ.
// Everything is decided on the server (code, limits, the case); the phone only collects the photos.
import { Camera, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { errMsg } from './LiveMoney'
import { prepareFile, type Upload } from './LiveSupport'
import { Sheet, Success } from './ui'
import { api } from '../lib/live'
import { useLive } from '../lib/liveStore'

const DOCS: [string, string][] = [['Passport', '🛂'], ['National ID', '🪪'], ['Residence permit', '🏠'], ["Driver's licence", '🚗']]

function PhotoSlot({ label, sub, file, setFile, selfie }: { label: string; sub: string; file: Upload | null; setFile: (f: Upload | null) => void; selfie?: boolean }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const pick = async (list: FileList | null) => {
    const f = list?.[0]; if (!f) return
    setErr(''); setBusy(true)
    try { setFile(await prepareFile(f)) } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 ${file ? 'border-mint-400/40 bg-mint-400/[0.06]' : 'border-dashed border-fg/20'}`}>
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-fg/5">
        {busy ? <Loader2 className="animate-spin text-slate-400" /> : file?.preview ? <img src={file.preview} alt="" className="size-full object-cover" /> : <Camera className="text-slate-400" />}
      </span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-slate-400">{sub}</span>
        {file && <span className="mt-0.5 flex items-center gap-1 text-[11px] text-mint-300"><RefreshCw size={11} /> Tap to retake</span>}
        {err && <span className="block text-xs text-rose-300">{err}</span>}</span>
      <input type="file" accept="image/*" capture={selfie ? 'user' : 'environment'} className="hidden" onChange={(e) => void pick(e.target.files)} />
    </label>
  )
}

export function ManualKycSheet({ onClose }: { onClose: () => void }) {
  const { me, refresh } = useLive()
  const [info, setInfo] = useState<{ code: string; open: { id: string; status: string } | null } | null>(null)
  const [step, setStep] = useState<'details' | 'photos' | 'done'>('details')
  const [legal, setLegal] = useState(me?.profile.fullName ?? '')
  const [docType, setDocType] = useState('Passport')
  const [docNumber, setDocNumber] = useState('')
  const [country, setCountry] = useState('')
  const [dob, setDob] = useState('')
  const [front, setFront] = useState<Upload | null>(null)
  const [back, setBack] = useState<Upload | null>(null)
  const [selfie, setSelfie] = useState<Upload | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { api<{ code: string; open: { id: string; status: string } | null }>('GET', 'kyc-manual').then(setInfo).catch((e) => setErr(errMsg(e))) }, [])
  const detailsOk = legal.trim().split(/\s+/).length >= 2 && docNumber.replace(/\s/g, '').length >= 4 && country.trim().length >= 2 && !!dob
  const send = async () => {
    setBusy(true); setErr('')
    try {
      const files = [front, back, selfie].filter(Boolean).map((f) => ({ name: f!.name, type: f!.type, data: f!.data }))
      await api('POST', 'kyc-manual', { legalName: legal.trim(), docType, docNumber, country: country.trim(), dob, files })
      setStep('done'); void refresh(); window.dispatchEvent(new Event('luda:cases')); window.dispatchEvent(new Event('luda:todo'))
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title="Verify with the Luda team">
      {step === 'done' ? (
        <Success title="Sent to the Luda team ✅" sub="We usually check IDs within a few hours (09:00–21:00). You'll get a notification, and you can follow it in Help → My requests." onClose={onClose} />
      ) : !info ? (
        err ? <p className="text-sm text-rose-300">{err}</p> : <Loader2 className="mx-auto my-8 animate-spin text-slate-500" />
      ) : info.open ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center"><CheckCircle2 className="text-mint-300" size={36} />
          <p className="font-semibold">Your ID is already with the Luda team</p>
          <p className="text-sm text-slate-400">We'll tell you as soon as it's checked. To add a photo or answer a question, open Help → My requests.</p>
          <button className="btn-ghost mt-2 px-5 py-3 text-sm" onClick={onClose}>OK</button></div>
      ) : step === 'details' ? (
        <div className="flex flex-col gap-3 pb-4">
          <div className="flex items-start gap-3 rounded-2xl bg-mint-400/10 p-3"><ShieldCheck className="shrink-0 text-mint-300" />
            <p className="text-sm">Free and safe. A Luda team member checks your document and selfie by hand, usually within a few hours.</p></div>
          <div><p className="mb-1.5 text-xs text-slate-400">Document</p>
            <div className="grid grid-cols-2 gap-2">{DOCS.map(([d, e]) => <button key={d} onClick={() => setDocType(d)} className={`chip justify-center py-2.5 text-sm ${docType === d ? 'bg-mint-400/20 text-mint-200 ring-1 ring-mint-400/40' : 'bg-fg/[0.06] text-slate-300'}`}>{e} {d}</button>)}</div></div>
          <label className="text-xs text-slate-400">Full name exactly as on the document<input className="input mt-1" maxLength={80} value={legal} onChange={(e) => setLegal(e.target.value)} autoComplete="name" /></label>
          <label className="text-xs text-slate-400">Document number<input className="input mt-1 font-mono uppercase" maxLength={30} value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="e.g. A12345678" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-400">Issuing country<input className="input mt-1" maxLength={40} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Nigeria" /></label>
            <label className="text-xs text-slate-400">Date of birth<input className="input mt-1" type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></label>
          </div>
          {me?.profile.fullName && legal.trim() && !legal.toLowerCase().split(/\s+/).some((w) => me.profile.fullName.toLowerCase().includes(w)) && <p className="rounded-xl bg-gold-400/10 p-2.5 text-xs text-gold-100">{`This name looks different from your Luda name (${me.profile.fullName}). The team will check it.`}</p>}
          <button className="btn-primary py-4" disabled={!detailsOk} onClick={() => setStep('photos')}>Next: photos</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 pb-4">
          <div className="rounded-2xl border border-gold-400/40 bg-gold-400/10 p-4 text-center">
            <p className="text-xs text-gold-100">Write this code on a piece of paper</p>
            <p className="my-1 font-mono text-4xl font-extrabold tracking-[0.3em] text-gold-200" translate="no">{info.code}</p>
            <p className="text-xs text-slate-300">and hold it next to your face, with your document, in the selfie. It proves the photo was taken today, by you.</p>
          </div>
          <PhotoSlot label={`Front of your ${docType.toLowerCase()}`} sub="All text readable, no glare, all 4 corners in the photo" file={front} setFile={setFront} />
          {docType !== 'Passport' && <PhotoSlot label="Back of the document" sub="Optional, if it has information on the back" file={back} setFile={setBack} />}
          <PhotoSlot label={`Selfie with the document and the code ${info.code}`} sub="Your face, the document and the paper with the code, all visible" file={selfie} setFile={setSelfie} selfie />
          {err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-4" disabled={busy || !front || !selfie} onClick={() => void send()}>{busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />} Send to the Luda team</button>
          <button className="btn-ghost py-3 text-sm" onClick={() => setStep('details')}>✏️ Edit details</button>
          <p className="text-center text-[11px] text-slate-500">Your photos are stored privately and only the Luda team can see them.</p>
        </div>
      )}
    </Sheet>
  )
}
