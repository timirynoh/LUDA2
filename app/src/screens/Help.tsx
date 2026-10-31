import { ChevronDown, FileText, Mail, MessageCircle, Siren } from 'lucide-react'
import { useState } from 'react'
import { Header, Sheet } from '../components/ui'
import { checkText } from '../lib/moderation'
import { useStore } from '../lib/store'

const FAQ: [string, string][] = [
  ['Is my money safe in Luda?', 'In the live app, money is held by a licensed payment partner in separate accounts. Every payment needs your PIN, and you can freeze your wallet any time in Security Center.'],
  ['How does SafeSwap protect me?', 'Your side of the exchange is locked in escrow before you meet. You only release it after checking the cash and scanning the rotating QR code. Disputes freeze the money until our team helps.'],
  ['Why do I need to verify my phone and ID?', 'It keeps scammers and fake accounts out. Phone unlocks posting and chatting; ID unlocks money features. Documents are encrypted and only used for verification.'],
  ['How do I post my house?', 'Housing → List a room. If you live there, upload your KIB-TEK or water bill and it goes live instantly. Photos-only posts wait for admin approval.'],
  ['How does Flash help payment work?', 'You accept a fixer’s offer and pay into escrow. The fixer is paid only when you tap “Job done”. Cash is possible but not protected.'],
  ['What is Ride Saver?', 'Verified members who opt in get 2 discounted bus/airport tickets per month (₺12 off one-way, ₺14 off return). Tickets are personal with a live QR code.'],
  ['I forgot my PIN or password', 'On the lock screen tap “Forgot PIN? Sign in with password”. For a password, tap “Forgot password?” on the sign-in screen and we’ll email you a code.'],
  ['How do I report a scam or abuse?', 'Use the report button on any post, message or person, or use “Report a problem” below. Repeated reports hide content until our team reviews it.'],
]

export const TERMS = `Luda Terms (summary). By using Luda you agree to: use your real identity; post only real, available and legal listings; not resell discounted tickets; not harass, scam or spam anyone; keep your PIN and password private. Payments, escrow and wallets are provided with licensed partners; Luda may freeze accounts involved in fraud. Breaking the rules can lead to removal. Full terms will be published before launch.`
export const PRIVACY = `Luda Privacy (summary). We collect what you give us (name, contacts, verification documents, posts) and what's needed to run payments safely. Verification documents are encrypted and only used for checks. Timetable screenshots are processed on your phone and never uploaded. We never sell your data. You can download or delete your data any time in Security Center.`

export default function Help() {
  const { toast, notify, allow } = useStore()
  const [open, setOpen] = useState<number | null>(0)
  const [legal, setLegal] = useState<null | 'terms' | 'privacy'>(null)
  const [report, setReport] = useState(false)
  const [text, setText] = useState('')
  const send = () => {
    const c = checkText(text)
    if (!c.ok) return toast({ title: 'Please remove inappropriate words', emoji: '⚠️' })
    if (!allow('report', text)) return
    notify('📨', 'We received your report. Support will reply within 24h'); toast({ title: 'Sent to Luda support', emoji: '📨' }); setReport(false); setText('')
  }
  return (
    <div>
      <Header back title="Help & Support" sub="We're here for you" />
      <div className="flex flex-col gap-4 px-5">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <a href="https://wa.me/905000000000" target="_blank" rel="noreferrer" className="card flex flex-col items-center gap-1 py-4"><MessageCircle className="text-emerald-300" /> WhatsApp</a>
          <a href="mailto:support@luda.app" className="card flex flex-col items-center gap-1 py-4"><Mail className="text-sky-300" /> Email</a>
          <button onClick={() => setReport(true)} className="card flex flex-col items-center gap-1 py-4"><Siren className="text-rose-300" /> Report a problem</button>
        </div>
        <section>
          <p className="label mb-2">Frequently asked</p>
          <div className="card divide-y divide-fg/5 p-1">
            {FAQ.map(([q, a], i) => (
              <div key={q}>
                <button className="flex w-full items-center gap-3 px-3 py-3.5 text-start text-sm font-semibold" onClick={() => setOpen(open === i ? null : i)}>
                  <span className="flex-1">{q}</span><ChevronDown size={16} className={`text-slate-500 transition ${open === i ? 'rotate-180' : ''}`} />
                </button>
                {open === i && <p className="px-3 pb-3 text-sm text-slate-400">{a}</p>}
              </div>
            ))}
          </div>
        </section>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost text-sm" onClick={() => setLegal('terms')}><FileText size={16} /> Terms</button>
          <button className="btn-ghost text-sm" onClick={() => setLegal('privacy')}><FileText size={16} /> Privacy</button>
        </div>
        <p className="text-center text-[11px] text-slate-500">Emergency in TRNC: Police 155 · Ambulance 112 · Fire 199</p>
      </div>
      {legal && <Sheet open onClose={() => setLegal(null)} title={legal === 'terms' ? 'Terms of use' : 'Privacy policy'}><p className="text-sm leading-relaxed text-slate-300">{legal === 'terms' ? TERMS : PRIVACY}</p></Sheet>}
      {report && (
        <Sheet open onClose={() => setReport(false)} title="Report a problem">
          <div className="flex flex-col gap-3">
            <textarea className="input min-h-28" placeholder="What happened? Include usernames, amounts and times if it's about a scam." value={text} onChange={(e) => setText(e.target.value)} maxLength={800} />
            <button className="btn-primary py-4" disabled={text.trim().length < 10} onClick={send}>Send to support</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
