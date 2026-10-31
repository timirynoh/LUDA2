import { AnimatePresence, motion } from 'framer-motion'
import { CalendarClock, Check, ExternalLink, Lock, RotateCw, X } from 'lucide-react'
import { useState } from 'react'
import { Header, Ring } from '../components/ui'
import { RESIDENCY_PORTAL_URL } from '../config'
import { useStore } from '../lib/store'

const STEPS = [
  ['📝', 'Fill in the online application', 'Register on the Ministry of Interior portal. Details must match your passport exactly.'],
  ['💬', 'SMS confirmation', 'You receive an SMS once your registration is accepted.'],
  ['🩺', 'Health insurance & medical check', 'Pay the health insurance premium online, then attend the required health checks.'],
  ['🏛️', 'Immigration (Muhaceret) review', 'The Immigration Department reviews your file and medical report.'],
  ['💳', 'Pay the residence fee', 'After approval, pay the residence permit fee online.'],
  ['🖨️', 'Print your permit', 'Log in with your personal password and print your permit.'],
]

const DOCS = [
  'Valid passport (6+ months)', 'Passport-size photos', 'Student certificate / work contract', 'Health report',
  'Health insurance receipt', 'Rental contract or dorm letter', 'Bank statement / financial guarantee', 'Entry stamp page copy',
]

export default function Residency() {
  const { s, set, t, reward } = useStore()
  const [portal, setPortal] = useState(false)
  const [frameKey, setFrameKey] = useState(0)
  const done = s.docs.length
  const days = s.permitExpiry ? Math.ceil((Date.parse(s.permitExpiry) - Date.now()) / 86_400_000) : null

  const toggle = (d: string) => {
    const has = s.docs.includes(d)
    const docs = has ? s.docs.filter((x) => x !== d) : [...s.docs, d]
    set((p) => ({ ...p, docs }))
    if (!has && docs.length === DOCS.length) reward(120, { quest: 'residency', badge: 'paperwork', title: 'Residency file complete!' })
  }

  return (
    <div>
      <Header back title={t('res.title')} sub="Residence permit (İkamet İzni)" />
      <div className="flex flex-col gap-4 px-5">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-teal-500 via-cyan-700 to-cyan-950 p-6 text-white">
          <div className="absolute -top-10 -right-10 size-40 rounded-full bg-fg/10 blur-2xl" />
          <p className="text-sm text-cyan-100/80">TRNC Ministry of Interior</p>
          <p className="mt-1 text-2xl font-extrabold">Residency portal</p>
          <p className="mt-1 text-sm text-cyan-50/80">Log in, upload, track & print — without leaving Luda.</p>
          <button className="btn mt-4 w-full bg-white py-3.5 text-ink-950" onClick={() => setPortal(true)}><Lock size={16} /> {t('res.open')}</button>
        </div>

        <div className="card flex items-center gap-4">
          <div className="grid size-12 place-items-center rounded-2xl bg-cyan-500/15 text-cyan-300"><CalendarClock /></div>
          <div className="flex-1">
            <p className="label">{t('res.expiry')}</p>
            <input type="date" className="mt-1 bg-transparent text-sm font-semibold outline-none" value={s.permitExpiry}
              onChange={(e) => set((p) => ({ ...p, permitExpiry: e.target.value }))} />
          </div>
          {days !== null && (
            <div className={`text-end ${days < 30 ? 'text-rose-300' : days < 60 ? 'text-gold-300' : 'text-mint-300'}`}>
              <p className="text-2xl font-extrabold">{days}</p><p className="text-xs">days left</p>
            </div>
          )}
        </div>
        {days !== null && days < 60 && <p className="-mt-2 rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-200">⏰ Start your renewal now — applications can take several weeks.</p>}

        <section className="card">
          <div className="mb-3 flex items-center gap-3">
            <Ring value={done / DOCS.length} size={48} stroke={4}><span className="text-xs font-bold">{done}/{DOCS.length}</span></Ring>
            <div><p className="font-bold">{t('res.docs')}</p><p className="text-xs text-slate-400">Tick off as you collect · +120 XP when complete</p></div>
          </div>
          <div className="flex flex-col gap-1">
            {DOCS.map((d) => {
              const on = s.docs.includes(d)
              return (
                <button key={d} onClick={() => toggle(d)} className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-start hover:bg-fg/[0.03]">
                  <span className={`grid size-6 place-items-center rounded-lg border transition ${on ? 'border-mint-400 bg-mint-400 text-ink-950' : 'border-fg/20'}`}>{on && <Check size={14} strokeWidth={3} />}</span>
                  <span className={`text-sm ${on ? 'text-slate-500 line-through' : ''}`}>{d}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <p className="label mb-3">{t('res.steps')}</p>
          <div className="flex flex-col gap-2">
            {STEPS.map(([e, title, body], i) => (
              <div key={title} className="card flex gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-fg/5 text-lg">{e}</div>
                <div><p className="text-sm font-semibold"><span className="text-slate-500">{i + 1}.</span> {title}</p><p className="text-xs text-slate-400">{body}</p></div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-slate-500">Process summary for guidance only. Always confirm current requirements and fees with the TRNC Immigration Department or your university's international office.</p>
        </section>
      </div>

      {/* In-app secure browser */}
      <AnimatePresence>
        {portal && (
          <motion.div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-ink-900" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 280 }}>
            <div className="flex items-center gap-2 border-b border-fg/10 px-3 pt-4 pb-3">
              <button onClick={() => setPortal(false)} className="glass grid size-9 place-items-center rounded-xl" aria-label="Close"><X size={18} /></button>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-fg/5 px-3 py-2 text-xs">
                <Lock size={12} className="shrink-0 text-mint-400" /><span className="truncate text-slate-300">{RESIDENCY_PORTAL_URL.replace('https://', '')}</span>
              </div>
              <button onClick={() => setFrameKey(frameKey + 1)} className="glass grid size-9 place-items-center rounded-xl" aria-label="Reload"><RotateCw size={16} /></button>
              <a href={RESIDENCY_PORTAL_URL} target="_blank" rel="noreferrer" className="glass grid size-9 place-items-center rounded-xl" aria-label="Open externally"><ExternalLink size={16} /></a>
            </div>
            <div className="relative flex-1 bg-white">
              <iframe key={frameKey} src={RESIDENCY_PORTAL_URL} title="Residency portal" className="absolute inset-0 size-full"
                sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-downloads" referrerPolicy="no-referrer" />
            </div>
            <p className="bg-ink-900 px-4 py-2 text-center text-[11px] text-slate-400">
              🔐 You log in directly with the government. Luda never sees or stores your portal password. If the page stays blank, the portal blocks embedding — tap <ExternalLink size={10} className="inline" />.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
