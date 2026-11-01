import { motion } from 'framer-motion'
import { BadgeCheck, Briefcase, Clock, FileText, Languages, MapPin, MessageCircle, Phone, Plus, ShieldAlert, ShieldCheck, Trash2, Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { PostGate } from '../components/PostGate'
import { DemoNote, Header, Segmented, Sheet, Success } from '../components/ui'
import { CITIES } from '../lib/data'
import { AREAS } from '../lib/housing'
import { jobsFor, parseQuickJob, payText, type Job, type JobCat, type JobType } from '../lib/jobs'
import { PhoneVerify } from '../components/PhoneVerify'
import { checkText } from '../lib/moderation'
import { isStale, isVisible, type PostMeta } from '../lib/posting'
import { uid, useStore } from '../lib/store'

const CATS: ('All' | JobCat)[] = ['All', 'Quick', 'Hospitality', 'Delivery', 'Tutoring', 'Office', 'Tech', 'Beauty', 'Campus']

export function StatusChip({ m }: { m: PostMeta }) {
  if (m.status === 'pending') return <span className="chip bg-gold-400/15 text-gold-300">⏳ Under review</span>
  if (m.status === 'rejected') return <span className="chip bg-rose-500/15 text-rose-300">✕ Rejected</span>
  if (isStale(m)) return <span className="chip bg-fg/10 text-slate-400">Hidden · confirm it's still open</span>
  return <span className="chip bg-mint-400/15 text-mint-300">● Live</span>
}

export default function Jobs() {
  const { s, set, t, gate } = useStore()
  const [tab, setTab] = useState<'browse' | 'mine'>('browse')
  const [cat, setCat] = useState<'All' | JobCat>('All')
  const [open, setOpen] = useState<Job | null>(null)
  const [posting, setPosting] = useState(false)
  const city = CITIES.find((c) => c.id === s.city)!
  const jobs = useMemo(() => [...s.myJobs.filter((j) => j.city === s.city && isVisible(j)), ...jobsFor(s.city, AREAS[s.city] ?? AREAS.lefkosa)].filter((j) => !s.reports.includes(j.id)), [s.city, s.myJobs, s.reports])
  const list = jobs.filter((j) => cat === 'All' || j.cat === cat)

  return (
    <div>
      <Header back title={t('act.jobs')} sub={`📍 ${city.name} · verified employers`} />
      <div className="px-5"><Segmented value={tab} onChange={setTab} options={[{ value: 'browse', label: '💼 Browse' }, { value: 'mine', label: `📄 Mine${s.applications.length + s.myJobs.length ? ` · ${s.applications.length + s.myJobs.length}` : ''}` }]} /></div>

      {tab === 'browse' ? (
        <div className="flex flex-col gap-3 px-5 pt-4">
          <div className="flex items-start gap-3 rounded-2xl bg-gold-400/10 p-3 text-xs text-gold-100">
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-gold-300" />
            <span><b>Never pay to get a job.</b> Work legally: jobs marked <b>Permit support</b> mean the employer handles your work-permit paperwork.</span>
          </div>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
            {CATS.map((x) => <button key={x} onClick={() => setCat(x)} className={`chip shrink-0 px-4 py-2 text-sm ${cat === x ? 'bg-gradient-to-r from-lime-400 to-green-600 text-ink-950' : 'glass text-slate-300'}`}>{x}</button>)}
          </div>
          {list.map((j, i) => (
            <motion.button key={j.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }} onClick={() => setOpen(j)} className="card text-start">
              <div className="flex items-start gap-3">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-lime-400/30 to-green-700/30 text-2xl">{j.emoji}</div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 font-semibold">{j.title}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-slate-400">{j.verifiedBiz && <BadgeCheck size={13} className="shrink-0 text-mint-400" />}{j.official ? 'Luda Official' : j.quick ? 'Quick post' : j.company}{j.individual ? ' · Individual' : ''} · {j.area}</p>
                </div>
                <p className="shrink-0 font-extrabold text-mint-300">{payText(j)}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {!j.quick && <span className="chip bg-fg/5 text-slate-300">{j.type}</span>}
                {!j.quick && <span className="chip bg-fg/5 text-slate-300"><Clock size={11} /> {j.hours}</span>}
                {j.quick && !!j.workers && <span className="chip bg-fg/5 text-slate-300">👷🏾 {j.workers} needed</span>}
                {j.permit && <span className="chip bg-sky-400/10 text-sky-200"><ShieldCheck size={11} /> Permit support</span>}
                {j.urgent && <span className="chip animate-pulse bg-rose-500 text-white"><Zap size={11} /> URGENT</span>}
                {j.quick && <span className="chip bg-fg/5 text-slate-300">Quick post · phone verified</span>}
                {j.mine && <span className="chip bg-gold-400 text-ink-950">Your post</span>}
                {s.applications.some((a) => a.jobId === j.id) && <span className="chip bg-mint-400/15 text-mint-300">✓ Applied</span>}
              </div>
            </motion.button>
          ))}
          <div className="pointer-events-none fixed inset-x-0 bottom-28 z-30 mx-auto flex max-w-app justify-end px-5">
            <button onClick={() => gate(1, 'Post jobs') && setPosting(true)} className="btn-gold pointer-events-auto rounded-full px-5 shadow-2xl"><Plus size={18} /> Post a job</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-5 pt-4">
          <section>
            <p className="label mb-2">My applications</p>
            {s.applications.length ? s.applications.map((a) => {
              const mins = (Date.now() - a.ts) / 60000
              const stage = mins > 5 ? 'Interview invite 🎉' : mins > 1 ? 'Viewed by employer' : 'Sent'
              return (
                <div key={a.id} className="card mb-2 flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-lime-400/15 text-lime-300"><Briefcase size={18} /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.title}</p><p className="text-xs text-slate-400">{a.company}</p></div>
                  <span className="chip bg-fg/5 text-slate-300">{stage}</span>
                </div>
              )
            }) : <p className="card text-center text-sm text-slate-400">No applications yet. Find a job and tap Apply.</p>}
          </section>
          <section>
            <p className="label mb-2">Jobs I posted</p>
            {s.myJobs.length ? s.myJobs.map((j) => (
              <div key={j.id} className="card mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{j.emoji}</span>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{j.title}</p><p className="text-xs text-slate-400">{payText(j)} · {j.area}</p></div>
                  <button aria-label="Remove" onClick={() => set((p) => ({ ...p, myJobs: p.myJobs.filter((x) => x.id !== j.id) }))} className="text-slate-500"><Trash2 size={16} /></button>
                </div>
                <div className="mt-2 flex items-center justify-between"><StatusChip m={j} />
                  {j.status === 'live' && <button className="chip bg-mint-400/15 py-1.5 text-mint-300" onClick={() => set((p) => ({ ...p, myJobs: p.myJobs.map((x) => (x.id === j.id ? { ...x, confirmedAt: Date.now() } : x)) }))}>✓ Still hiring</button>}
                </div>
              </div>
            )) : <p className="card text-center text-sm text-slate-400">Hiring? Tap "Post a job" on Browse.</p>}
          </section>
        </div>
      )}
      <DemoNote />
      {open && <JobSheet job={open} onClose={() => setOpen(null)} />}
      <PostJob open={posting} onClose={() => setPosting(false)} />
    </div>
  )
}

function JobSheet({ job: j, onClose }: { job: Job; onClose: () => void }) {
  const { s, set, reward, toast, gate, allow } = useStore()
  const applied = s.applications.some((a) => a.jobId === j.id)
  const [msg, setMsg] = useState(`Hi! I'm ${s.name}, based in ${CITIES.find((c) => c.id === s.city)?.name}. I'd love to apply for the ${j.title} role.`)
  const [cv, setCv] = useState('')
  const [done, setDone] = useState(false)
  const apply = () => {
    set((p) => ({ ...p, applications: [{ id: uid(), jobId: j.id, title: j.title, company: j.company, ts: Date.now() }, ...p.applications] }))
    reward(s.quests.includes('job') ? 10 : 60, { quest: 'job', badge: 'hustler', title: 'Application sent' })
    setDone(true)
  }
  const report = () => { if (!allow('report')) return; set((p) => ({ ...p, reports: [...p.reports, j.id] })); reward(10, { badge: 'guardian', title: 'Thanks for reporting' }); toast({ title: 'Our team will review this job', emoji: '🛡️' }); onClose() }
  return (
    <Sheet open onClose={onClose} title={j.title}>
      {done ? <Success title="Application sent 💼" sub={`${j.company} will see your profile and message. Track it under "Mine".`} onClose={onClose} /> : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-lime-400/30 to-green-700/30 text-3xl">{j.emoji}</div>
            <div><p className="flex items-center gap-1 font-semibold">{j.official ? 'Luda Official' : j.company}{j.verifiedBiz && <BadgeCheck size={16} className="text-mint-400" />}</p>
              <p className="text-xs text-slate-400">{j.verifiedBiz ? 'Registered business · checked by Luda' : 'Individual poster · ID verified'}</p></div>
          </div>
          <p className="text-3xl font-extrabold text-mint-300">{payText(j)}</p>
          <div className="grid gap-2 text-sm">
            <p className="flex items-center gap-2"><MapPin size={15} className="text-slate-400" /> {j.area}</p>
            <p className="flex items-center gap-2"><Clock size={15} className="text-slate-400" /> {j.type} · {j.hours}</p>
            <p className="flex items-center gap-2"><Languages size={15} className="text-slate-400" /> {j.langs.join(', ')}</p>
            <p className="flex items-center gap-2"><ShieldCheck size={15} className={j.permit ? 'text-sky-300' : 'text-slate-500'} /> {j.permit ? 'Employer handles work-permit paperwork' : 'No permit support: check you can legally do this work'}</p>
          </div>
          <p className="rounded-2xl bg-fg/[0.03] p-3 text-sm text-slate-300">{j.desc}</p>
          {j.quick && !j.mine ? (
            <div className="grid grid-cols-2 gap-2">
              <a href={`tel:${j.contact}`} onClick={() => gate(1, 'Contact employers') && apply()} className="btn-primary py-4"><Phone size={18} /> Call</a>
              <a href={`https://wa.me/${(j.contact ?? '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer" onClick={() => gate(1, 'Contact employers') && apply()} className="btn bg-emerald-500/15 py-4 text-emerald-200"><MessageCircle size={18} /> WhatsApp</a>
              <p className="col-span-2 text-center text-xs text-slate-500" dir="ltr">📞 {j.contact}</p>
            </div>
          ) : !j.mine && (applied ? <p className="rounded-2xl bg-mint-400/10 p-3 text-center text-sm text-mint-200">✓ You applied. Check "Mine" for updates.</p> : (
            <>
              <textarea className="input min-h-24" value={msg} onChange={(e) => setMsg(e.target.value)} />
              <label className="glass flex cursor-pointer items-center gap-3 rounded-2xl p-3 text-sm">
                <FileText size={18} className="text-slate-400" /><span className="flex-1 truncate">{cv || 'Attach CV (optional)'}</span>
                <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={(e) => setCv(e.target.files?.[0]?.name ?? '')} />
              </label>
              <button className="btn-primary py-4" onClick={() => gate(1, 'Apply for jobs') && allow('apply') && apply()}>Apply now</button>
            </>
          ))}
          {!j.mine && <button className="text-xs text-slate-500 underline" onClick={report}>Report this job (scam, asks for money, fake)</button>}
        </div>
      )}
    </Sheet>
  )
}

function PostJob({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { s, set, toast, allow } = useStore()
  const areas = AREAS[s.city] ?? AREAS.lefkosa
  const [f, setF] = useState({ title: '', cat: 'Hospitality' as JobCat, type: 'Part-time' as JobType, pay: '', unit: 'hour' as Job['unit'], hours: '', area: areas[0], desc: '', permit: true })
  const [done, setDone] = useState(false)
  const [mode, setMode] = useState<'quick' | 'full'>('quick')
  const [q, setQ] = useState({ text: '', contact: '+90 5', urgent: true })
  const [err, setErr] = useState('')
  const close = () => { setDone(false); setErr(''); onClose() }
  const parsed = parseQuickJob(q.text, [...areas, ...CITIES.map((c) => c.name)])
  const quickSubmit = () => {
    const c = checkText(q.text)
    if (!c.ok) return setErr(c.scam ? `Blocked: ${c.scam}. Never ask workers for money.` : `Please remove inappropriate words (${c.bad.join(', ')})`)
    if (!allow('quickjob', q.text)) return
    const now = Date.now()
    const j: Job = {
      id: `myjob-${uid()}`, title: q.text.trim().slice(0, 80), company: s.isAdmin ? 'Luda Official' : s.name, city: s.city, area: parsed.area ?? areas[0],
      cat: 'Quick', type: 'Gig', pay: parsed.pay, unit: 'task', hours: parsed.urgent ? 'ASAP' : 'See description', langs: [], permit: false, verifiedBiz: s.isAdmin,
      posted: 0, desc: q.text.trim(), emoji: parsed.emoji, mine: true, quick: true, urgent: q.urgent || parsed.urgent, contact: q.contact, workers: parsed.workers || 1,
      status: 'live', official: s.isAdmin, createdAt: now, confirmedAt: now,
    }
    set((p) => ({ ...p, myJobs: [j, ...p.myJobs] }))
    toast({ title: 'Job is live ⚡', emoji: '✅' })
    setDone(true)
  }
  const submit = () => {
    const c = checkText(`${f.title} ${f.desc}`)
    if (!c.ok) return toast({ title: c.scam ? `Blocked: ${c.scam}` : 'Please remove inappropriate words', emoji: '⚠️' })
    if (!allow('job', `${f.title} ${f.desc}`)) return
    const now = Date.now()
    const j: Job = {
      id: `myjob-${uid()}`, title: f.title, company: s.isAdmin ? 'Luda Official' : s.proofs.business === 'company' ? `${s.name}'s business` : s.name,
      city: s.city, area: f.area, cat: f.cat, type: f.type, pay: +f.pay, unit: f.unit, hours: f.hours || 'Flexible', langs: ['English'], permit: f.permit,
      verifiedBiz: s.isAdmin || s.proofs.business === 'company', individual: !s.isAdmin && s.proofs.business === 'individual', posted: 0, desc: f.desc || '—', emoji: '✨', mine: true,
      status: s.isAdmin || s.proofs.business === 'company' ? 'live' : 'pending', official: s.isAdmin, createdAt: now, confirmedAt: now,
    }
    set((p) => ({ ...p, myJobs: [j, ...p.myJobs] }))
    toast({ title: j.status === 'live' ? 'Job published' : 'Submitted for review', emoji: j.status === 'live' ? '✅' : '⏳' })
    setDone(true)
  }
  return (
    <Sheet open={open} onClose={close} title="Post a job">
      {done ? (mode === 'quick'
        ? <Success title="Your job is live ⚡" sub="People can call or WhatsApp you right away. It hides itself after 7 days unless you confirm you're still hiring." onClose={close} />
        : <Success title={s.isAdmin || s.proofs.business === 'company' ? 'Job is live ✨' : 'Under review ⏳'} sub={s.isAdmin ? 'Published as Luda Official.' : s.proofs.business === 'company' ? 'Your business documents are on file, so it went live instantly.' : 'Luda checks every job before it goes live, usually within 24 hours. You can track it under "Mine".'} onClose={close} />) : (
        <>
        <div className="mb-4"><Segmented value={mode} onChange={setMode} options={[{ value: 'quick', label: '⚡ Quick post' }, { value: 'full', label: '📋 Full listing' }]} /></div>
        {mode === 'quick' ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-400">Just type what you need, like you'd text a friend. Perfect for urgent work.</p>
            <textarea className="input min-h-28 text-base" autoFocus placeholder="e.g. 1 worker needed in Girne for construction, ₺1500 per day, start tomorrow" value={q.text} maxLength={300}
              onChange={(e) => { setQ({ ...q, text: e.target.value }); setErr('') }} />
            {q.text.length > 5 && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="chip bg-mint-400/15 text-mint-200">{parsed.emoji} {parsed.kind ?? 'General work'}</span>
                <span className="chip bg-fg/5 text-slate-300">👷🏾 {parsed.workers || 1} needed</span>
                <span className="chip bg-fg/5 text-slate-300">📍 {parsed.area ?? 'Area not detected'}</span>
                {parsed.pay > 0 && <span className="chip bg-fg/5 text-slate-300">₺{parsed.pay.toLocaleString()}</span>}
              </div>
            )}
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <input className="input" inputMode="tel" placeholder="Contact number" value={q.contact} onChange={(e) => setQ({ ...q, contact: e.target.value })} />
              <button onClick={() => setQ({ ...q, urgent: !q.urgent })} className={`chip h-full px-4 ${q.urgent ? 'bg-rose-500 text-white' : 'bg-fg/5 text-slate-400'}`}><Zap size={14} /> Urgent</button>
            </div>
            {!s.phoneVerified && !s.isAdmin && <div className="rounded-2xl bg-fg/[0.03] p-3"><PhoneVerify /></div>}
            {err && <p className="text-sm text-rose-300">⚠️ {err}</p>}
            <button className="btn-primary py-4" disabled={q.text.trim().length < 10 || q.contact.replace(/\D/g, '').length < 10 || (!s.phoneVerified && !s.isAdmin)} onClick={quickSubmit}><Zap size={18} /> Post now</button>
            <p className="text-center text-[11px] text-slate-500">Goes live instantly. Our filter blocks scams and bad language automatically.</p>
          </div>
        ) : (
        <PostGate kind="job">
          <div className="flex flex-col gap-3">
            <input className="input" placeholder="Job title, e.g. Barista" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <div className="flex flex-wrap gap-2">{CATS.slice(1).map((c) => <button key={c} onClick={() => setF({ ...f, cat: c as JobCat })} className={`chip py-1.5 ${f.cat === c ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{c}</button>)}</div>
            <div className="flex flex-wrap gap-2">{(['Part-time', 'Full-time', 'Gig', 'Internship'] as JobType[]).map((c) => <button key={c} onClick={() => setF({ ...f, type: c })} className={`chip py-1.5 ${f.type === c ? 'bg-mint-400 text-ink-950' : 'bg-fg/5 text-slate-300'}`}>{c}</button>)}</div>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" inputMode="numeric" placeholder="Pay (₺)" value={f.pay} onChange={(e) => setF({ ...f, pay: e.target.value.replace(/\D/g, '') })} />
              <select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Job['unit'] })}><option value="hour">per hour</option><option value="month">per month</option><option value="task">per job</option></select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Hours, e.g. Evenings" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
              <select className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}>{areas.map((a) => <option key={a}>{a}</option>)}</select>
            </div>
            <textarea className="input min-h-20" placeholder="Describe the job" value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-emerald-500" checked={f.permit} onChange={(e) => setF({ ...f, permit: e.target.checked })} /> I will handle the worker's work-permit paperwork</label>
            <button className="btn-primary py-4" disabled={!f.title || !+f.pay} onClick={submit}>{s.isAdmin ? 'Publish' : s.proofs.business === 'company' ? 'Publish' : 'Submit for review'}</button>
          </div>
        </PostGate>
        )}
        </>
      )}
    </Sheet>
  )
}
