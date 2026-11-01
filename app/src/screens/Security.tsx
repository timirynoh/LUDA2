import { Download, EyeOff, History, KeyRound, Lock, ShieldCheck, Smartphone, Snowflake, Timer, Trash2, Wallet } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Header, PinPad, Sheet } from '../components/ui'
import { checkLogin, makeAccount, passwordStrength } from '../lib/auth'
import { hashPin, randomSecret } from '../lib/crypto'
import { fmt } from '../lib/fx'
import { useStore } from '../lib/store'
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
  const score = [s.phoneVerified, s.verified, s.lockOnOpen, sec.twoStep, !!s.account].filter(Boolean).length

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

        <button onClick={() => (sec.frozen ? setSheet('unfreeze') : (setSec({ frozen: true }), notify('🧊', 'You froze your wallet. All payments are blocked'), toast({ title: 'Wallet frozen. No money can leave', emoji: '🧊' })))}
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
          <Row icon={<Smartphone size={18} />} title="2-step sign-in" sub="SMS code needed when signing in with your password"><Toggle label="2-step" on={sec.twoStep} onChange={(v) => { if (v && !s.phoneVerified) return toast({ title: 'Verify your phone first', emoji: '📱' }); setSec({ twoStep: v }) }} /></Row>
          <Row icon={<EyeOff size={18} />} title="Hide balances by default" sub="Tap the eye to show them"><Toggle label="Hide balances" on={sec.hideBalances} onChange={(v) => setSec({ hideBalances: v })} /></Row>
          <Row icon={<Wallet size={18} />} title="Daily withdrawal limit" sub={`Max ${fmt(sec.dailyWithdraw, 'TRY')} can leave per day`}>
            <select className="input w-auto py-2 text-sm" value={sec.dailyWithdraw} onChange={(e) => setSec({ dailyWithdraw: +e.target.value })} aria-label="Daily limit">
              {[5000, 10000, 20000, 50000, 100000].map((m) => <option key={m} value={m}>₺{m.toLocaleString()}</option>)}</select>
          </Row>
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
      {sheet === 'password' && <PasswordSheet mode="change" onClose={() => setSheet(null)} />}
      {sheet === 'unfreeze' && <PasswordSheet mode="unfreeze" onClose={() => setSheet(null)} />}
      {sheet === 'delete' && <PasswordSheet mode="delete" onClose={() => setSheet(null)} onDone={reset} />}
    </div>
  )
}

function ChangePin({ onClose }: { onClose: () => void }) {
  const { checkPin, set, toast, notify } = useStore()
  const [step, setStep] = useState<'old' | 'new' | 'confirm'>('old')
  const [first, setFirst] = useState('')
  const [err, setErr] = useState('')
  const done = async (pin: string) => {
    setErr('')
    if (step === 'old') return (await checkPin(pin)) ? setStep('new') : setErr('Wrong PIN')
    if (step === 'new') { if (/^(\d)\1{3}$|^1234$|^0000$/.test(pin)) return setErr('Too easy to guess. Pick another'); setFirst(pin); return setStep('confirm') }
    if (pin !== first) { setStep('new'); return setErr("PINs didn't match") }
    const salt = randomSecret(8), pinHash = await hashPin(pin, salt)
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
