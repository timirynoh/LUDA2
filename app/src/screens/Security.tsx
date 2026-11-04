import { Download, EyeOff, Fingerprint, History, KeyRound, Lock, ShieldCheck, Smartphone, Snowflake, Timer, Trash2, Wallet } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Header, PinPad, Sheet } from '../components/ui'
import { checkLogin, makeAccount, passwordStrength } from '../lib/auth'
import { hashPin, randomSecret } from '../lib/crypto'
import { fmt } from '../lib/fx'
import { useStore } from '../lib/store'
import { LIVE, api } from '../lib/live'
import { bioOn, bioSupported, disableBio, enrollBio } from '../lib/bio'
import { useLive } from '../lib/liveStore'
import { NotificationSettings } from './Engage'

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button onClick={() => onChange(!on)} aria-label={label} className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-mint-400' : 'bg-fg/15'}`}>
      <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${on ? 'start-6' : 'start-1'}`} />
    </button>
  )
}

function Row({ icon, title, sub, children }: { icon: ReactNode; title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-fg/5 text-slate-300">{icon}</div>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p>{sub && <p className="text-xs text-slate-400">{sub}</p>}</div>
      {children}
    </div>
  )
}

export default function Security() {
  const { s, set, toast, notify, reset } = useStore()
  const sec = s.security
  const setSec = (patch: Partial<typeof sec>) => set((p) => ({ ...p, security: { ...p.security, ...patch } }))
  const [sheet, setSheet] = useState<null | 'pin' | 'password' | 'delete' | 'unfreeze'>(null)
  const { refresh } = useLive()
  const score = [s.phoneVerified, s.verified, s.lockOnOpen, LIVE ? bioOn() : sec.twoStep, !!s.account].filter(Boolean).length
  // Live: freezing is done on the server, so it stops every phone and every payment at once.
  const freezeLive = async () => { try { await api('POST', 'freeze', {}); await refresh(); notify('🧊', 'You froze your wallet. All payments are blocked'); toast({ title: 'Wallet frozen. No money can leave', emoji: '🧊' }) } catch (e) { toast({ title: e instanceof Error ? e.message : 'Could not freeze', emoji: '⚠️' }) } }

  const exportData = () => {
    // Secrets (PIN/password hashes, salts) are never included.
    const { pinHash: _p, salt: _s, account, ...rest } = s
    void _p; void _s
    const data = { exportedAt: new Date().toISOString(), account: account ? { email: account.email, username: account.username } : null, ...rest }
    try {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      a.download = 'my-luda-data.json'; document.body.appendChild(a); a.click(); a.remove()
      toast({ title: 'Your data was downloaded', emoji: '📦' })
    } catch { toast({ title: 'Downloads are blocked in this preview', emoji: 'ℹ️' }) }
  }

  return (
    <div>
      <Header back title="Security Center" sub="Keep your money and account safe" />
      <div className="flex flex-col gap-4 px-5">
        <div className="card flex items-center gap-4 bg-gradient-to-br from-mint-400/15 to-transparent">
          <div className="grid size-16 place-items-center rounded-2xl bg-mint-400/15 text-mint-300"><ShieldCheck size={32} /></div>
          <div className="flex-1"><p className="text-xs text-slate-400">Security score</p><p className="text-2xl font-extrabold">{score}/5 {score >= 4 ? '💪' : '⚠️'}</p>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-fg/10"><div className="h-full bg-gradient-to-r from-gold-300 to-mint-400" style={{ width: `${score * 20}%` }} /></div></div>
        </div>

        <button onClick={() => (sec.frozen ? setSheet('unfreeze') : LIVE ? void freezeLive() : (setSec({ frozen: true }), notify('🧊', 'You froze your wallet. All payments are blocked'), toast({ title: 'Wallet frozen. No money can leave', emoji: '🧊' })))}
          className={`flex items-center gap-4 rounded-3xl p-4 text-start ${sec.frozen ? 'bg-sky-500/20 ring-2 ring-sky-400' : 'bg-rose-500/10'}`}>
          <Snowflake size={32} className={sec.frozen ? 'text-sky-300' : 'text-rose-300'} />
          <div className="flex-1"><p className="font-bold">{sec.frozen ? 'Wallet is frozen' : 'Freeze my wallet'}</p><p className="text-xs text-slate-400">{sec.frozen ? 'Tap to unfreeze (password needed)' : 'Lost your phone or something feels wrong? Block all payments instantly.'}</p></div>
        </button>

        <section className="card divide-y divide-fg/5 py-1">
          <Row icon={<Lock size={18} />} title="PIN when opening Luda" sub="Protects your wallet if someone has your phone"><Toggle label="PIN on open" on={s.lockOnOpen} onChange={(v) => set((p) => ({ ...p, lockOnOpen: v }))} /></Row>
          <Row icon={<Timer size={18} />} title="Auto-lock when inactive" sub={`Asks "are you still there?" after ${sec.autoLockMin} min`}>
            <select className="input w-auto py-2 text-sm" value={sec.autoLockMin} onChange={(e) => setSec({ autoLockMin: +e.target.value })} aria-label="Auto-lock minutes">
              {[1, 3, 5, 10, 30].map((m) => <option key={m} value={m}>{m} min</option>)}</select>
          </Row>
          {!LIVE && <Row icon={<Smartphone size={18} />} title="2-step sign-in" sub="SMS code needed when signing in with your password"><Toggle label="2-step" on={sec.twoStep} onChange={(v) => { if (v && !s.phoneVerified) return toast({ title: 'Verify your phone first', emoji: '📱' }); setSec({ twoStep: v }) }} /></Row>}
          <Row icon={<EyeOff size={18} />} title="Privacy screen" sub="Covers Luda when you switch apps, so the app preview shows no balances or chats. Phones don't let websites block screenshots; the Luda store app will."><Toggle label="Privacy screen" on={sec.privacyScreen !== false} onChange={(v) => setSec({ privacyScreen: v })} /></Row>
          <Row icon={<EyeOff size={18} />} title="Hide balances by default" sub="Tap the eye to show them"><Toggle label="Hide balances" on={sec.hideBalances} onChange={(v) => setSec({ hideBalances: v })} /></Row>
          {LIVE ? <Row icon={<Wallet size={18} />} title="Daily limits" sub="Set by Luda: withdraw up to ₦1,000,000 and send up to ₦500,000 / ₺20,000 a day after identity check" /> :
          <Row icon={<Wallet size={18} />} title="Daily withdrawal limit" sub={`Max ${fmt(sec.dailyWithdraw, 'TRY')} can leave per day`}>
            <select className="input w-auto py-2 text-sm" value={sec.dailyWithdraw} onChange={(e) => setSec({ dailyWithdraw: +e.target.value })} aria-label="Daily limit">
              {[5000, 10000, 20000, 50000, 100000].map((m) => <option key={m} value={m}>₺{m.toLocaleString()}</option>)}</select>
          </Row>}
          <BioRow />
          <Row icon={<KeyRound size={18} />} title="Change PIN"><button className="chip bg-fg/5 py-2 text-slate-300" onClick={() => setSheet('pin')}>Change</button></Row>
          {s.account && <Row icon={<KeyRound size={18} />} title="Change password"><button className="chip bg-fg/5 py-2 text-slate-300" onClick={() => setSheet('password')}>Change</button></Row>}
        </section>

        <NotificationSettings />

        <section className="card">
          <p className="label mb-2 flex items-center gap-1"><History size={12} /> Recent sign-ins</p>
          {s.logins.length ? s.logins.slice(0, 6).map((l) => (
            <div key={l.ts} className="flex items-center justify-between py-1.5 text-sm"><span>{l.how} · <span className="text-slate-400">{l.device}</span></span><span className="text-xs text-slate-500">{new Date(l.ts).toLocaleString()}</span></div>
          )) : <p className="text-sm text-slate-400">No sign-ins recorded yet.</p>}
          <p className="mt-2 text-[11px] text-slate-500">Don't recognise one? Freeze your wallet and change your password.</p>
        </section>

        <section className="card divide-y divide-fg/5 py-1">
          <p className="label pt-2 pb-1">Your data</p>
          <Row icon={<Download size={18} />} title="Download my data" sub="Everything Luda stores about you (no passwords)"><button className="chip bg-fg/5 py-2 text-slate-300" onClick={exportData}>Download</button></Row>
          <Row icon={<Trash2 size={18} />} title="Delete my account" sub="Permanently removes your data from this phone"><button className="chip bg-rose-500/15 py-2 text-rose-300" onClick={() => setSheet('delete')}>Delete</button></Row>
        </section>
        <p className="pb-2 text-center text-[11px] text-slate-500">🔐 PIN & password are stored only as salted hashes. Your timetable photos never leave your phone.</p>
      </div>

      {sheet === 'pin' && <ChangePin onClose={() => setSheet(null)} />}
      {sheet === 'password' && (LIVE ? <LivePasswordSheet onClose={() => setSheet(null)} /> : <PasswordSheet mode="change" onClose={() => setSheet(null)} />)}
      {sheet === 'unfreeze' && (LIVE ? <LiveUnfreeze onClose={() => setSheet(null)} /> : <PasswordSheet mode="unfreeze" onClose={() => setSheet(null)} />)}
      {sheet === 'delete' && (LIVE ? <Sheet open onClose={() => setSheet(null)} title="Close my account"><p className="text-sm text-slate-300">Your account holds money, so closing it is done with the Luda team: they'll help you withdraw your balance first, then delete your data. Go to <b>Help</b> and choose "Close my account".</p></Sheet> : <PasswordSheet mode="delete" onClose={() => setSheet(null)} onDone={reset} />)}
    </div>
  )
}

/** Fingerprint / Face ID on this phone: unlock Luda and (live) approve payments. */
function BioRow() {
  const { s, checkPin, toast, notify } = useStore()
  const [supported, setSupported] = useState(false)
  const [on, setOn] = useState(bioOn)
  const [asking, setAsking] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { bioSupported().then(setSupported) }, [])
  if (!supported) return null
  const enable = async (pin: string) => {
    setErr('')
    if (!(await checkPin(pin))) return setErr('Wrong PIN')
    try {
      await enrollBio(pin, { username: s.account?.username ?? s.name, fullName: s.name })
      setOn(true); setAsking(false)
      notify('👆', 'Fingerprint / Face ID turned on for this phone'); toast({ title: 'Fingerprint on', emoji: '👆' })
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not turn it on') }
  }
  return (
    <>
      <Row icon={<Fingerprint size={18} />} title="Fingerprint / Face ID" sub={LIVE ? 'Unlock Luda and approve payments without typing your PIN' : 'Unlock Luda without typing your PIN'}>
        <Toggle label="Fingerprint" on={on} onChange={(v) => { if (v) setAsking(true); else { void disableBio(); setOn(false); toast({ title: 'Fingerprint off', emoji: '🔒' }) } }} />
      </Row>
      {asking && (
        <Sheet open onClose={() => setAsking(false)} title="Turn on fingerprint">
          <div className="flex flex-col items-center gap-3"><p className="text-center text-sm text-slate-300">Enter your PIN, then touch the sensor or look at the camera when your phone asks.</p>
            <PinPad error={err} onDone={enable} />
            <p className="text-center text-[11px] text-slate-500">Your fingerprint never leaves your phone. Your PIN keeps working as a backup.</p></div>
        </Sheet>
      )}
    </>
  )
}

/** Live: unfreeze with the PIN (server). A freeze set by the Luda team can only be lifted by support. */
function LiveUnfreeze({ onClose }: { onClose: () => void }) {
  const { notify, toast } = useStore()
  const { me, refresh } = useLive()
  const [err, setErr] = useState('')
  if (me?.profile.frozenBy === 'admin') return <Sheet open onClose={onClose} title="Account on hold"><p className="text-sm text-slate-300">The Luda team put your account on hold to protect it. Contact support from <b>Help</b> to lift it.</p></Sheet>
  const go = async (pin: string) => {
    setErr('')
    try { await api('POST', 'freeze', { freeze: false, pin }); await refresh(); notify('✅', 'Wallet unfrozen'); toast({ title: 'Wallet unfrozen', emoji: '✅' }); onClose() } catch (e) { setErr(e instanceof Error ? e.message : 'Try again') }
  }
  return <Sheet open onClose={onClose} title="Unfreeze wallet"><div className="flex flex-col items-center gap-3"><p className="text-sm text-slate-300">Enter your PIN to unfreeze</p><PinPad error={err} onDone={go} /></div></Sheet>
}

/** Live: change password on the server (needs the current one). */
function LivePasswordSheet({ onClose }: { onClose: () => void }) {
  const { notify, toast } = useStore()
  const [oldPw, setOld] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const strength = passwordStrength(pw)
  const save = async () => {
    setBusy(true); setErr('')
    try { await api('POST', 'change-password', { oldPassword: oldPw, newPassword: pw }); notify('🔑', 'Your password was changed'); toast({ title: 'Password changed', emoji: '🔑' }); onClose() } catch (e) { setErr(e instanceof Error ? e.message : 'Try again') } finally { setBusy(false) }
  }
  return (
    <Sheet open onClose={onClose} title="Change password">
      <div className="flex flex-col gap-3">
        <input className="input" type="password" autoComplete="current-password" placeholder="Current password" value={oldPw} onChange={(e) => setOld(e.target.value)} />
        <input className="input" type="password" autoComplete="new-password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {pw && <p className="text-xs text-slate-400">{strength.label}</p>}{err && <p className="text-sm text-rose-300">{err}</p>}
        <button className="btn-primary py-4" disabled={!oldPw || !strength.ok || busy} onClick={save}>Save new password</button>
      </div>
    </Sheet>
  )
}

function ChangePin({ onClose }: { onClose: () => void }) {
  const { checkPin, set, toast, notify } = useStore()
  const [step, setStep] = useState<'old' | 'new' | 'confirm'>('old')
  const [first, setFirst] = useState('')
  const [old, setOld] = useState('')
  const [err, setErr] = useState('')
  const done = async (pin: string) => {
    setErr('')
    if (step === 'old') { if (LIVE || (await checkPin(pin))) { setOld(pin); return setStep('new') } return setErr('Wrong PIN') } // live: the server checks the old PIN
    if (step === 'new') { if (/^(\d)\1{3}$|^1234$|^0000$/.test(pin)) return setErr('Too easy to guess. Pick another'); setFirst(pin); return setStep('confirm') }
    if (pin !== first) { setStep('new'); return setErr("PINs didn't match") }
    if (LIVE) { try { await api('POST', 'pin', { pin, oldPin: old }) } catch (e) { const m = e instanceof Error ? e.message : 'Try again'; setStep(/wrong pin|too many/i.test(m) ? 'old' : 'new'); return setErr(m) } }
    const salt = LIVE ? '' : randomSecret(8), pinHash = LIVE ? 'server' : await hashPin(pin, salt)
    set((p) => ({ ...p, salt, pinHash })); notify('🔑', 'Your PIN was changed'); toast({ title: 'PIN changed', emoji: '🔑' }); onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Change PIN">
      <div className="flex flex-col items-center gap-4"><p className="text-sm text-slate-300">{step === 'old' ? 'Enter your current PIN' : step === 'new' ? 'Choose a new 4-digit PIN' : 'Enter the new PIN again'}</p><PinPad key={step} error={err} onDone={done} /></div>
    </Sheet>
  )
}

function PasswordSheet({ mode, onClose, onDone }: { mode: 'change' | 'unfreeze' | 'delete'; onClose: () => void; onDone?: () => void }) {
  const { s, set, toast, notify } = useStore()
  const [pw, setPw] = useState('')
  const [next, setNext] = useState('')
  const [err, setErr] = useState('')
  const verify = async () => !s.account || (await checkLogin(s.account, s.account.username, pw)) === 'ok'
  const go = async () => {
    if (!(await verify())) return setErr('Wrong password')
    if (mode === 'change') {
      if (!passwordStrength(next).ok) return setErr('New password is too weak')
      const acc = await makeAccount(s.account!.email, s.account!.username, next, s.account!.stay)
      set((p) => ({ ...p, account: acc })); notify('🔐', 'Your password was changed'); toast({ title: 'Password changed', emoji: '🔐' })
    } else if (mode === 'unfreeze') {
      set((p) => ({ ...p, security: { ...p.security, frozen: false } })); notify('✅', 'Wallet unfrozen'); toast({ title: 'Wallet unfrozen', emoji: '✅' })
    } else onDone?.()
    onClose()
  }
  const title = mode === 'change' ? 'Change password' : mode === 'unfreeze' ? 'Unfreeze wallet' : 'Delete account'
  return (
    <Sheet open onClose={onClose} title={title}>
      <div className="flex flex-col gap-3">
        {mode === 'delete' && <p className="rounded-2xl bg-rose-500/10 p-3 text-sm text-rose-200">This removes your account, wallet history, posts and chats from this phone. It can't be undone.</p>}
        {s.account ? <input className="input" type="password" placeholder="Current password" value={pw} onChange={(e) => { setPw(e.target.value); setErr('') }} /> : <p className="text-sm text-slate-400">Confirm to continue.</p>}
        {mode === 'change' && <input className="input" type="password" placeholder="New password" value={next} onChange={(e) => { setNext(e.target.value); setErr('') }} />}
        {err && <p className="text-sm text-rose-300">{err}</p>}
        <button className={mode === 'delete' ? 'btn bg-rose-500 py-4 text-white' : 'btn-primary py-4'} onClick={go}>{mode === 'delete' ? 'Delete forever' : 'Confirm'}</button>
      </div>
    </Sheet>
  )
}
