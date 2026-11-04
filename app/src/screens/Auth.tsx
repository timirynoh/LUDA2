import { AnimatePresence, motion } from 'framer-motion'
import { AtSign, Check, ChevronLeft, Eye, EyeOff, Fingerprint, Globe, Lock, Mail, User } from 'lucide-react'
import { bioOn, bioUnlock } from '../lib/bio'
import { useEffect, useState, type ReactNode } from 'react'
import { LogoMark, Wordmark } from '../components/Logo'
import { PinPad, Sheet } from '../components/ui'
import { checkLogin, EMAIL_RE, makeAccount, passwordStrength, USERNAME_RE } from '../lib/auth'
import { hashPin } from '../lib/crypto'
import { LANGS } from '../lib/data'
import { checkText } from '../lib/moderation'
import { useStore } from '../lib/store'
import { knownAccounts, switchAccount } from '../lib/accounts'
import { LIVE, api, checkAvailable, googleSignIn, liveConfig, liveRecover, liveSetPassword, liveSignIn, liveSignUp, takeOAuthReturn, type Me } from '../lib/live'

const device = () => {
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Linux'
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'Browser'
  return `${br} on ${os}`
}
export const loginEntry = (how: string) => ({ ts: Date.now(), how, device: device() })

/* ------------------------------ Splash ------------------------------ */

export function Splash() {
  return (
    <motion.div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-ink-950" exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
      <motion.div className="absolute size-72 rounded-full bg-mint-400/20 blur-3xl" animate={{ scale: [0.8, 1.15, 1], opacity: [0, 1, 0.7] }} transition={{ duration: 1.4 }} />
      <motion.div initial={{ scale: 0.4, rotate: -25, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', damping: 12, stiffness: 120 }}>
        <LogoMark size={112} className="drop-shadow-[0_20px_40px_rgba(16,185,129,.45)]" />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="mt-6 text-center">
        <Wordmark className="text-5xl text-white" />
        <p className="mt-2 text-sm text-slate-400">Your whole life in North Cyprus</p>
      </motion.div>
      <motion.div className="absolute bottom-14 h-1 w-24 overflow-hidden rounded-full bg-white/10" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        <motion.div className="h-full bg-gradient-to-r from-mint-400 to-gold-400" initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ delay: 0.6, duration: 0.9 }} />
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------ Landing ------------------------------ */

const SLIDES: { title: string; sub: string; art: ReactNode }[] = [
  {
    title: 'Your money, sorted', sub: 'Hold Lira, Naira, Cedi & CFA. Convert at live rates and swap cash safely with escrow.',
    art: (
      <div className="relative h-full w-full">
        <div className="absolute inset-x-6 top-6 rotate-[-6deg] rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-700 to-emerald-950 p-5 text-white shadow-2xl">
          <p className="text-xs text-white/70">Total balance</p><p className="text-3xl font-extrabold">₺24,850</p>
          <div className="mt-3 flex gap-2"><span className="chip bg-black/20">🇹🇷 ₺18,200</span><span className="chip bg-black/20">🇳🇬 ₦230k</span></div>
        </div>
        <div className="absolute right-4 bottom-10 rotate-[5deg] rounded-2xl border border-white/10 bg-ink-800 px-4 py-3 shadow-xl"><p className="text-xs text-slate-400">₦1,000 =</p><p className="text-lg font-bold text-mint-300">₺28.72</p></div>
        <div className="absolute bottom-4 left-6 rounded-2xl bg-fuchsia-500/90 px-4 py-2 text-sm font-semibold text-white shadow-xl">🔒 SafeSwap escrow</div>
      </div>
    ),
  },
  {
    title: 'Life in North Cyprus, easier', sub: 'Verified houses, jobs & quick gigs, group chats, events, and fixers on demand.',
    art: (
      <div className="relative h-full w-full">
        {[['🏠', 'Room in Gönyeli', '£200/mo', 'left-4 top-6 rotate-[-4deg]'], ['💼', 'Barista · Dereboyu', '₺150/hr', 'right-3 top-24 rotate-[4deg]'], ['⚡', 'Plumber on the way', 'escrow ✓', 'left-8 top-44 rotate-[-2deg]'], ['💬', 'Naija in North Cyprus', '312 online', 'right-6 bottom-2 rotate-[3deg]']].map(([e, a, b, pos]) => (
          <div key={a} className={`absolute ${pos} flex items-center gap-3 rounded-2xl border border-white/10 bg-ink-800/95 px-4 py-3 shadow-xl`}>
            <span className="text-2xl">{e}</span><span><span className="block text-sm font-semibold">{a}</span><span className="text-xs text-mint-300">{b}</span></span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Study & travel smarter', sub: 'Timetable from a screenshot, your school’s deadlines, and cheaper bus tickets.',
    art: (
      <div className="relative h-full w-full">
        <div className="absolute inset-x-6 top-6 rotate-[3deg] rounded-3xl bg-gradient-to-br from-indigo-500 via-blue-700 to-indigo-950 p-5 text-white shadow-2xl">
          <p className="text-xs text-white/70">Next class · in 15 min</p><p className="text-3xl font-extrabold">MATH101</p><p className="text-sm text-white/80">Room B204 · 🔔 reminder on</p>
        </div>
        <div className="absolute bottom-6 left-5 rotate-[-4deg] rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-700 px-4 py-3 text-white shadow-xl"><p className="text-xs text-white/70">🎟️ VirgoBus</p><p className="font-bold">Girne → Lefkoşa</p><p className="text-sm">₺238 <span className="text-white/60 line-through">₺250</span></p></div>
        <div className="absolute right-5 bottom-14 rounded-2xl border border-white/10 bg-ink-800 px-4 py-3 text-sm shadow-xl">🪪 Residency guide</div>
      </div>
    ),
  },
]

export function Landing({ onSignUp, onSignIn }: { onSignUp: () => void; onSignIn: () => void }) {
  const { s, set } = useStore()
  const [i, setI] = useState(0)
  const [langOpen, setLangOpen] = useState(false)
  useEffect(() => { const t = setInterval(() => setI((x) => (x + 1) % SLIDES.length), 4500); return () => clearInterval(t) }, [])
  const lang = LANGS.find((l) => l.code === s.lang)!
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col px-6 desk:min-h-[calc(100dvh-3rem)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2"><LogoMark size={36} /><Wordmark className="text-2xl" /></div>
        <button onClick={() => setLangOpen(true)} className="chip glass py-2 text-slate-300"><Globe size={14} /> {lang.flag} {lang.native}</button>
      </div>
      <motion.div className="relative mt-6 h-80 cursor-grab touch-pan-y" drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2}
        onDragEnd={(_, info) => { if (info.offset.x < -50) setI((i + 1) % SLIDES.length); if (info.offset.x > 50) setI((i - 1 + SLIDES.length) % SLIDES.length) }}>
        <div className="absolute inset-0 rounded-[2.5rem] bg-gradient-to-br from-mint-400/15 via-transparent to-gold-400/15" />
        <AnimatePresence mode="wait">
          <motion.div key={i} className="absolute inset-0" initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -40, scale: 0.96 }} transition={{ duration: 0.35 }}>{SLIDES[i].art}</motion.div>
        </AnimatePresence>
      </motion.div>
      <div className="mt-8 min-h-28">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            <h1 className="text-4xl leading-tight font-extrabold tracking-tight">{SLIDES[i].title}</h1>
            <p className="mt-3 text-slate-400">{SLIDES[i].sub}</p>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-4 flex gap-1.5">{SLIDES.map((_, k) => <button key={k} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-8 bg-mint-400' : 'w-1.5 bg-fg/20'}`} />)}</div>
      <div className="mt-auto flex flex-col gap-3 pt-8">
        <GoogleButton />
        <button className="btn-primary py-4 text-base" onClick={onSignUp}>Create free account</button>
        <button className="btn-ghost py-4 text-base" onClick={onSignIn}>I have an account · Sign in</button>
        <p className="text-center text-xs text-slate-500">Made for the African community in North Cyprus 🇳🇬 🇨🇩 🇨🇲 🇿🇼 🇬🇭 🇰🇪 🇸🇩</p>
        <p className="text-center text-[10px] text-slate-600">v{__VERSION__}</p>
      </div>
      <Sheet open={langOpen} onClose={() => setLangOpen(false)} title="Language">
        <div className="grid gap-2">{LANGS.map((l) => (
          <button key={l.code} onClick={() => { set((p) => ({ ...p, lang: l.code })); setLangOpen(false) }} className={`glass flex items-center gap-3 rounded-2xl px-4 py-3.5 text-start ${s.lang === l.code ? 'border-mint-400/60 bg-mint-400/10' : ''}`}>
            <span className="text-2xl">{l.flag}</span><span className="flex-1 font-semibold">{l.native}</span>{s.lang === l.code && <Check size={18} className="text-mint-300" />}
          </button>
        ))}</div>
      </Sheet>
    </div>
  )
}

/* ------------------------------ Shared form bits ------------------------------ */

function Field({ icon, children, error, ok }: { icon: ReactNode; children: ReactNode; error?: string; ok?: string }) {
  return (
    <div>
      <div className="relative"><span className="absolute start-4 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>{children}</div>
      {error ? <p className="mt-1 ps-1 text-xs text-rose-300">{error}</p> : ok ? <p className="mt-1 ps-1 text-xs text-mint-300">✓ {ok}</p> : null}
    </div>
  )
}

function AuthShell({ title, sub, onBack, children }: { title: string; sub: string; onBack: () => void; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} className="pt-safe pb-safe flex min-h-dvh flex-col px-6 desk:min-h-[calc(100dvh-3rem)]">
      <button onClick={onBack} className="glass grid size-10 place-items-center rounded-2xl rtl:rotate-180" aria-label="Back"><ChevronLeft size={20} /></button>
      <div className="mt-6 mb-8"><LogoMark size={44} /><h1 className="mt-4 text-3xl font-extrabold tracking-tight">{title}</h1><p className="mt-1 text-slate-400">{sub}</p></div>
      {children}
    </motion.div>
  )
}

/* ------------------------------ Sign up ------------------------------ */

/** "Continue with Google" (live mode, when switched on in Supabase). */
export function GoogleButton() {
  const [on, setOn] = useState(false)
  useEffect(() => { if (LIVE) liveConfig().then((c) => setOn(!!c.google)).catch(() => {}) }, [])
  if (!on) return null
  return (
    <>
      <button className="glass flex w-full items-center justify-center gap-3 rounded-2xl py-3.5 text-base font-semibold" onClick={googleSignIn}>
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        Continue with Google
      </button>
      <div className="flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-fg/10" />or<span className="h-px flex-1 bg-fg/10" /></div>
    </>
  )
}

/** Finishes "Continue with Google" when Google sends the user back to the app. */
export function useOAuthReturn() {
  const { set } = useStore()
  useEffect(() => {
    if (!takeOAuthReturn()) return
    api<Me>('GET', 'me').then((m) => set((p) => ({
      ...switchAccount(p, m.profile, true), signedIn: true,
      logins: [loginEntry('Google sign-in'), ...(p.account?.username === m.profile.username ? p.logins : [])].slice(0, 20),
    }))).catch(() => {})
  }, [set])
}

export function SignUp({ onBack, onSignIn }: { onBack: () => void; onSignIn: () => void }) {
  const { s, set } = useStore()
  const [f, setF] = useState({ name: '', username: '', email: '', password: '' })
  const [show, setShow] = useState(false)
  const [stay, setStay] = useState(true)
  const [agree, setAgree] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [avail, setAvail] = useState<{ username: boolean | null; email: boolean | null }>({ username: null, email: null })
  // Tell people straight away if the username or email is already registered.
  useEffect(() => {
    if (!LIVE) return
    const u = USERNAME_RE.test(f.username) ? f.username : '', e = EMAIL_RE.test(f.email.trim()) ? f.email.trim() : ''
    if (!u && !e) return
    const t = setTimeout(() => { checkAvailable(u, e).then(setAvail).catch(() => {}) }, 450)
    return () => clearTimeout(t)
  }, [f.username, f.email])
  const strength = passwordStrength(f.password)
  const nameBad = !checkText(`${f.name} ${f.username}`).ok
  const errors = {
    name: f.name.trim().length < 2 ? 'Enter your name' : nameBad ? 'Please choose a respectful name' : LIVE && !/\S+\s+\S+/.test(f.name.trim()) ? 'Enter your first and last name exactly as on your ID' : '',
    username: !USERNAME_RE.test(f.username) ? '3–20 characters: lowercase letters, numbers, _ or .' : avail.username === false ? 'This username is already taken' : '',
    email: !EMAIL_RE.test(f.email.trim()) ? 'Enter a valid email' : avail.email === false ? 'An account with this email already exists' : '',
    password: !strength.ok ? 'At least 8 characters, mixing letters and numbers' : '',
  }
  const valid = !Object.values(errors).some(Boolean) && agree
  const submit = async () => {
    setTouched(true)
    if (!valid) return
    if (!LIVE && s.account && (s.account.email === f.email.trim().toLowerCase() || s.account.username === f.username)) return
    setBusy(true); setErr('')
    if (LIVE) {
      try {
        const r = await liveSignUp({ email: f.email.trim(), username: f.username, fullName: f.name.trim().replace(/\s+/g, ' '), password: f.password, country: s.country })
        if (r.needsConfirm) { setConfirm(true); setBusy(false); return }
      } catch (e) { setErr(e instanceof Error ? e.message : 'Could not create your account'); setBusy(false); return }
    }
    if (LIVE) {
      // A new account on a phone that already has one gets its own fresh set-up (its own PIN, nothing of the other account).
      set((p) => ({ ...switchAccount(p, { username: f.username, email: f.email.trim().toLowerCase(), fullName: f.name.trim() }, stay), signedIn: true, logins: [loginEntry('Account created')] }))
      return
    }
    const account = await makeAccount(f.email, f.username, f.password, stay)
    set((p) => ({ ...p, account, signedIn: true, name: f.name.trim().split(' ')[0], logins: [loginEntry('Account created'), ...p.logins].slice(0, 20) }))
  }
  const taken = !LIVE && s.account && (s.account.email === f.email.trim().toLowerCase() || s.account.username === f.username)
  return (
    <AuthShell title="Create your account" sub="It takes less than a minute." onBack={onBack}>
      <div className="flex flex-col gap-3">
        <GoogleButton />
        <Field icon={<User size={18} />} error={touched ? errors.name : ''}><input className="input ps-11" placeholder="Full name" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field icon={<AtSign size={18} />} error={touched || avail.username === false ? errors.username : ''} ok={LIVE && avail.username === true && !errors.username ? 'Username available' : ''}><input className="input ps-11" placeholder="username" autoComplete="username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} /></Field>
        <Field icon={<Mail size={18} />} error={touched || avail.email === false ? errors.email : ''}><input className="input ps-11" type="email" placeholder="Email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field icon={<Lock size={18} />} error={touched ? errors.password : ''}>
          <input className="input ps-11 pe-12" type={show ? 'text' : 'password'} placeholder="Password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <button className="absolute end-4 top-1/2 -translate-y-1/2 text-slate-500" onClick={() => setShow(!show)} aria-label="Show password">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </Field>
        {f.password && (
          <div className="flex items-center gap-2 ps-1">
            <div className="flex flex-1 gap-1">{[0, 1, 2, 3, 4].map((k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${k < strength.score ? (strength.score >= 4 ? 'bg-mint-400' : strength.score >= 2 ? 'bg-gold-400' : 'bg-rose-400') : 'bg-fg/10'}`} />)}</div>
            <span className="text-xs text-slate-400">{strength.label}</span>
          </div>
        )}
        <label className="flex items-center gap-3 ps-1 text-sm text-slate-300"><input type="checkbox" className="size-4 accent-emerald-500" checked={stay} onChange={(e) => setStay(e.target.checked)} /> Keep me signed in on this phone</label>
        <label className="flex items-start gap-3 ps-1 text-xs text-slate-400"><input type="checkbox" className="mt-0.5 size-4 accent-emerald-500" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree to Luda's Terms and Privacy Policy and the community rules (no scams, no hate, no spam).</label>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        {confirm && <p className="rounded-2xl bg-mint-400/10 p-3 text-sm text-mint-200">📧 Almost done! We sent a confirmation link to <b>{f.email.trim()}</b>. Open it, then <button className="underline" onClick={onSignIn}>sign in</button>.</p>}
        {taken && <p className="text-sm text-rose-300">That email or username is already registered. <button className="underline" onClick={onSignIn}>Sign in instead</button></p>}
        <button className="btn-primary mt-2 py-4 text-base" disabled={busy} onClick={submit}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="text-center text-sm text-slate-400">Already have an account? <button className="font-semibold text-mint-300" onClick={onSignIn}>Sign in</button></p>
      </div>
    </AuthShell>
  )
}

/* ------------------------------ Sign in ------------------------------ */

export function SignIn({ onBack, onSignUp }: { onBack: () => void; onSignUp: () => void }) {
  const { s, set } = useStore()
  const known = LIVE ? knownAccounts() : []
  const [id, setId] = useState(s.account?.username ?? '')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [stay, setStay] = useState(s.account?.stay ?? true)
  const [err, setErr] = useState('')
  const [tries, setTries] = useState(0)
  const [forgot, setForgot] = useState(false)
  const [twoStep, setTwoStep] = useState(false)
  const [code, setCode] = useState('')
  const locked = !LIVE && tries >= 5 // live: the server limits attempts per account and per network
  const finish = () => set((p) => ({ ...p, signedIn: true, account: p.account ? { ...p.account, stay } : p.account, logins: [loginEntry('Password sign-in'), ...p.logins].slice(0, 20), inbox: [{ id: String(Date.now()), ts: Date.now(), emoji: '🔐', title: 'New sign-in to your account. Not you? Freeze your wallet in Security Center', read: false, to: '/security' }, ...p.inbox] }))
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (locked || busy) return
    if (LIVE) {
      setBusy(true); setErr('')
      try {
        await liveSignIn(id, pw)
        const m = await api<Me>('GET', 'me')
        // Each account on this phone keeps its own set-up: switching saves one and restores the other.
        set((p) => switchAccount(p, m.profile, stay))
        finish()
      } catch (e) {
        setTries(tries + 1)
        const m = e instanceof Error ? e.message : 'Sign-in failed'
        setErr(/wrong/i.test(m) && known.length > 1 ? `${m}. Check the account: you're signing in as ${id.includes('@') ? id : '@' + id.replace(/^@/, '')}.` : m)
      } finally { setBusy(false) }
      return
    }
    const r = await checkLogin(s.account, id, pw)
    if (r === 'ok') { if (s.security.twoStep) setTwoStep(true); else finish() }
    else { setTries(tries + 1); setErr(r === 'no_account' ? 'No account on this phone yet. Create one first.' : r === 'unknown_user' ? 'We couldn’t find that email or username.' : 'Wrong password. Try again.') }
  }
  return (
    <AuthShell title="Welcome back" sub="Sign in with your email or username." onBack={onBack}>
      <div className="flex flex-col gap-3">
        <GoogleButton />
        {known.length > 1 && <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-400">Accounts on this phone · tap the one you're signing in to</p>
          <div className="flex flex-wrap gap-2">{known.map((a) => { const on = id.replace(/^@/, '').toLowerCase() === a.username; return (
            <button key={a.username} onClick={() => { setId(a.username); setPw(''); setErr('') }} className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-start text-sm ${on ? 'bg-mint-400/20 ring-1 ring-mint-400/50' : 'glass'}`}>
              <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-mint-400/40 to-emerald-700/50 text-xs font-bold">{a.name.slice(0, 1).toUpperCase()}</span>
              <span className="leading-tight"><b className="block text-xs">{a.name.split(' ')[0]}</b><span className="text-[11px] text-slate-400">@{a.username}</span></span>
            </button>) })}
            <button onClick={() => { setId(''); setPw(''); setErr('') }} className="glass rounded-2xl px-3 py-2 text-xs text-slate-300">+ Another account</button>
          </div>
        </div>}
        <Field icon={<AtSign size={18} />}><input className="input ps-11" placeholder="Email or username" autoComplete="username" value={id} onChange={(e) => { setId(e.target.value); setErr('') }} /></Field>
        <Field icon={<Lock size={18} />}>
          <input className="input ps-11 pe-12" type={show ? 'text' : 'password'} placeholder="Password" autoComplete="current-password" value={pw} onChange={(e) => { setPw(e.target.value); setErr('') }} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <button className="absolute end-4 top-1/2 -translate-y-1/2 text-slate-500" onClick={() => setShow(!show)} aria-label="Show password">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </Field>
        <div className="flex items-center justify-between ps-1">
          <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" className="size-4 accent-emerald-500" checked={stay} onChange={(e) => setStay(e.target.checked)} /> Keep me signed in</label>
          <button className="text-sm text-mint-300" onClick={() => setForgot(true)}>Forgot password?</button>
        </div>
        {err && <p className="text-sm text-rose-300">{err}</p>}
        {locked && <p className="text-sm text-rose-300">Too many attempts. For your safety, reset your password to continue.</p>}
        <button className="btn-primary mt-2 py-4 text-base" disabled={!id || !pw || locked || busy} onClick={submit}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="text-center text-sm text-slate-400">New to Luda? <button className="font-semibold text-mint-300" onClick={onSignUp}>Create an account</button></p>
      </div>
      {forgot && <ForgotPassword onClose={() => { setForgot(false); setTries(0) }} />}
      {twoStep && (
        <Sheet open onClose={() => setTwoStep(false)} title="2-step verification">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-400">Enter the code we sent to your phone. <span className="text-gold-300">Demo code: 482913</span></p>
            <input className="input font-mono text-lg tracking-widest" autoFocus maxLength={6} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <button className="btn-primary py-4" disabled={code !== '482913'} onClick={finish}>Verify & sign in</button>
          </div>
        </Sheet>
      )}
    </AuthShell>
  )
}

function ForgotPassword({ onClose }: { onClose: () => void }) {
  if (LIVE) return <LiveForgot onClose={onClose} />
  return <DemoForgot onClose={onClose} />
}

function LiveForgot({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const send = async () => { try { await liveRecover(email.trim()); setSent(true) } catch (e) { setErr(e instanceof Error ? e.message : 'Try again') } }
  return (
    <Sheet open onClose={onClose} title="Reset your password">
      {sent ? <p className="text-sm text-slate-300">📧 If <b>{email}</b> has a Luda account, a reset link is on its way. Open it on this phone to choose a new password.</p> : (
        <div className="flex flex-col gap-3">
          <input className="input" type="email" placeholder="Your email" value={email} onChange={(e) => { setEmail(e.target.value); setErr('') }} />{err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-4" disabled={!EMAIL_RE.test(email.trim())} onClick={send}>Send reset link</button>
        </div>
      )}
    </Sheet>
  )
}

/** Opened from the email reset link (live mode): #access_token=…&type=recovery */
export function ResetPassword({ onDone }: { onDone: () => void }) {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('access_token') ?? ''
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const strength = passwordStrength(pw)
  const save = async () => {
    try { await liveSetPassword(token, pw); setDone(true); history.replaceState(null, '', '/') } catch (e) { setErr(e instanceof Error ? e.message : 'Try again') }
  }
  return (
    <AuthShell title="Choose a new password" sub="Then sign in with it." onBack={onDone}>
      {done ? <div className="flex flex-col gap-3"><p className="text-sm text-mint-200">✅ Password changed. For your safety, withdrawals and sending are paused for 24 hours.</p><button className="btn-primary py-4" onClick={onDone}>Sign in</button></div> : (
        <div className="flex flex-col gap-3">
          <input className="input" type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={(e) => { setPw(e.target.value); setErr('') }} />
          {pw && <p className="text-xs text-slate-400">{strength.label}</p>}{err && <p className="text-sm text-rose-300">{err}</p>}
          <button className="btn-primary py-4" disabled={!strength.ok || !token} onClick={save}>Save password</button>
        </div>
      )}
    </AuthShell>
  )
}

function DemoForgot({ onClose }: { onClose: () => void }) {
  const { s, set } = useStore()
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const send = () => { if (!s.account || email.trim().toLowerCase() !== s.account.email) return setErr('No account with that email on this phone.'); setErr(''); setStep('code') }
  const save = async () => {
    if (code !== '482913') return setErr('Wrong code.')
    if (!passwordStrength(pw).ok) return setErr('Choose a stronger password (8+ characters, letters and numbers).')
    const acc = await makeAccount(s.account!.email, s.account!.username, pw, s.account!.stay)
    set((p) => ({ ...p, account: acc })); setStep('done')
  }
  return (
    <Sheet open onClose={onClose} title="Reset password">
      {step === 'email' && <div className="flex flex-col gap-3"><p className="text-sm text-slate-400">We'll email you a 6-digit code.</p>
        <input className="input" type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />{err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-3.5" disabled={!EMAIL_RE.test(email.trim())} onClick={send}>Send code</button></div>}
      {step === 'code' && <div className="flex flex-col gap-3"><p className="text-sm text-slate-400">Code sent to {email}. <span className="text-gold-300">Demo code: 482913</span></p>
        <input className="input font-mono tracking-widest" maxLength={6} inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <input className="input" type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />{err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-3.5" onClick={save}>Save new password</button></div>}
      {step === 'done' && <div className="flex flex-col items-center gap-3 py-4 text-center"><p className="text-4xl">✅</p><p className="font-bold">Password updated</p><button className="btn-primary w-full" onClick={onClose}>Back to sign in</button></div>}
    </Sheet>
  )
}

/* ------------------------------ Quick unlock ------------------------------ */

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { s, set } = useStore()
  const [err, setErr] = useState('')
  const [fails, setFails] = useState(0)
  const [bioErr, setBioErr] = useState('')
  const unlockWithBio = async () => {
    setBioErr('')
    try { if (await bioUnlock()) { set((p) => ({ ...p, logins: [loginEntry('Fingerprint unlock'), ...p.logins].slice(0, 20) })); onUnlock() } } catch (e) { setBioErr(e instanceof Error ? e.message : 'Try your PIN') }
  }
  // Offer the fingerprint straight away when it's set up on this phone.
  useEffect(() => { if (bioOn()) void unlockWithBio() }, []) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  const tryPin = async (pin: string) => {
    if (LIVE) {
      // Live: the PIN is checked by the server only (it locks after 5 wrong tries); the phone keeps no copy of it.
      try { await api('POST', 'pin-check', { pin }); set((p) => ({ ...p, logins: [loginEntry('PIN unlock'), ...p.logins].slice(0, 20) })); return onUnlock() }
      catch (e) {
        const m = e instanceof Error ? e.message : 'Try again'
        if (!/wrong pin|too many/i.test(m)) return setErr(m) // offline / server busy: not a wrong PIN
        const n = fails + 1; setFails(n)
        if (n >= 5) { set((p) => ({ ...p, signedIn: false })); return }
        return setErr(m)
      }
    }
    if ((await hashPin(pin, s.salt)) === s.pinHash) { set((p) => ({ ...p, logins: [loginEntry('PIN unlock'), ...p.logins].slice(0, 20) })); return onUnlock() }
    const n = fails + 1
    setFails(n)
    if (n >= 5) { set((p) => ({ ...p, signedIn: false })); return }
    setErr(`Wrong PIN · ${5 - n} tries left`)
  }
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pb-safe flex min-h-dvh flex-col items-center px-6 pt-[max(4rem,env(safe-area-inset-top))] desk:min-h-[calc(100dvh-3rem)]">
      {s.avatar ? <img src={s.avatar} alt="" className="size-20 rounded-full object-cover ring-4 ring-mint-400/30" /> : <LogoMark size={64} />}
      <p className="mt-6 text-slate-400">{greet},</p>
      <p className="text-3xl font-extrabold">{s.name} 👋🏾</p>
      <p className="mt-2 mb-10 text-sm text-slate-400">Enter your PIN to open Luda</p>
      <PinPad error={err} onDone={tryPin} />
      {bioOn() && <button className="mt-5 flex items-center gap-2 rounded-2xl bg-mint-400/10 px-4 py-3 text-sm font-semibold text-mint-300" onClick={unlockWithBio}><Fingerprint size={20} /> Unlock with fingerprint / Face ID</button>}
      {bioErr && <p className="mt-2 text-xs text-slate-500">{bioErr}</p>}
      <button className="mt-auto pt-8 text-sm text-slate-400" onClick={() => set((p) => ({ ...p, signedIn: false }))}>Forgot PIN? <span className="text-mint-300">Sign in with password</span></button>
      <p className="mt-2 text-xs text-slate-600">Not {s.name}? <button className="underline" onClick={() => set((p) => ({ ...p, signedIn: false }))}>Switch account</button></p>
    </motion.div>
  )
}
