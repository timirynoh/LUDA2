import { BadgeCheck, Monitor, Moon, ShieldCheck, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Header, Sheet } from '../components/ui'
import { KycFlow, KycStatus } from '../components/Kyc'
import { CITIES, COUNTRIES, LANGS } from '../lib/data'
import { useStore } from '../lib/store'

export default function Profile() {
  const { s, set, t, level, reset, gate } = useStore()
  const [kyc, setKyc] = useState(false)
  const [armed, setArmed] = useState(false)
  const country = COUNTRIES.find((c) => c.code === s.country)!

  return (
    <div>
      <Header back title={t('profile.title')} />
      <div className="flex flex-col gap-4 px-5">
        <div className="card flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-mint-400 to-gold-400 text-2xl font-black text-ink-950">{s.name[0]?.toUpperCase()}</div>
          <div className="flex-1">
            <p className="flex items-center gap-1 text-xl font-bold">{s.name} {s.verified && <BadgeCheck size={18} className="text-mint-400" />}</p>
            <p className="text-sm text-slate-400">{country.flag} {country.name} · {level.emoji} {level.name}</p>
          </div>
        </div>

        <button onClick={() => (s.phoneVerified ? setKyc(true) : gate(2, 'KYC verification'))} className="text-start">
          <KycStatus />
          {s.kyc.status === 'none' && <span className="btn-primary mt-2 w-full py-3 text-sm">Start KYC · +150 XP</span>}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <Link to="/security" className="card flex items-center gap-3 py-3"><ShieldCheck className="text-mint-300" size={20} /><span className="text-sm font-semibold">Security Center</span></Link>
          <Link to="/help" className="card flex items-center gap-3 py-3"><span className="text-lg">💬</span><span className="text-sm font-semibold">Help & Support</span></Link>
          <Link to="/wallet" className="card flex items-center gap-3 py-3"><span className="text-lg">💳</span><span className="text-sm font-semibold">Saved cards · {s.cards.length}</span></Link>
          <Link to="/disputes" className="card flex items-center gap-3 py-3"><span className="text-lg">🛡️</span><span className="text-sm font-semibold">My appeals</span></Link>
        </div>

        {s.account && (
          <section className="card grid gap-3">
            <p className="label">Account</p>
            <div className="flex items-center justify-between text-sm"><span className="text-slate-400">Username</span><span className="font-semibold">@{s.account.username}</span></div>
            <div className="flex items-center justify-between text-sm"><span className="text-slate-400">Email</span><span className="font-semibold">{s.account.email}</span></div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span><span className="block font-semibold">Ask for PIN when opening Luda</span><span className="text-xs text-slate-400">Recommended: protects your wallet if someone has your phone</span></span>
              <input type="checkbox" className="size-5 accent-emerald-500" checked={s.lockOnOpen} onChange={(e) => set((p) => ({ ...p, lockOnOpen: e.target.checked }))} />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">Keep me signed in</span>
              <input type="checkbox" className="size-5 accent-emerald-500" checked={s.account.stay} onChange={(e) => set((p) => ({ ...p, account: p.account ? { ...p.account, stay: e.target.checked } : p.account }))} />
            </label>
            <button className="btn-ghost py-2.5 text-sm" onClick={() => set((p) => ({ ...p, signedIn: false }))}>Sign out</button>
          </section>
        )}

        <section className="card flex items-center justify-between gap-3">
          <span><span className="block text-sm font-semibold">⚡ Flash help pop-ups</span><span className="text-xs text-slate-400">Max once per visit. Bubbles on Home always show open requests.</span></span>
          <input type="checkbox" aria-label="Flash pop-ups" className="size-5 accent-emerald-500" checked={s.flashPop} onChange={(e) => set((p) => ({ ...p, flashPop: e.target.checked }))} />
        </section>

        <section className="card">
          <p className="label mb-3">Theme</p>
          <div className="grid grid-cols-3 gap-2">
            {([['dark', 'Night', Moon], ['light', 'Day', Sun], ['system', 'Auto', Monitor]] as const).map(([v, label, Icon]) => (
              <button key={v} onClick={() => set((p) => ({ ...p, theme: v }))}
                className={`flex flex-col items-center gap-1 rounded-2xl p-3 text-xs font-semibold ${s.theme === v ? 'bg-mint-400/15 text-mint-200 ring-1 ring-mint-400/50' : 'bg-fg/[0.03] text-slate-400'}`}>
                <Icon size={20} />{label}
              </button>
            ))}
          </div>
        </section>

        <section className="card">
          <p className="label mb-3">{t('profile.lang')}</p>
          <div className="grid grid-cols-5 gap-2">
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => set((p) => ({ ...p, lang: l.code }))}
                className={`flex flex-col items-center gap-1 rounded-2xl p-2 text-[11px] font-semibold ${s.lang === l.code ? 'bg-mint-400/15 text-mint-200 ring-1 ring-mint-400/50' : 'bg-fg/[0.03] text-slate-400'}`}>
                <span className="text-xl">{l.flag}</span>{l.native}
              </button>
            ))}
          </div>
        </section>

        <section className="card grid gap-3">
          <label className="grid gap-1"><span className="label">{t('profile.city')}</span>
            <select className="input" value={s.city} onChange={(e) => set((p) => ({ ...p, city: e.target.value }))}>
              {CITIES.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.en}</option>)}
            </select>
          </label>
          <label className="grid gap-1"><span className="label">Home country</span>
            <select className="input" value={s.country} onChange={(e) => set((p) => ({ ...p, country: e.target.value }))}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
            </select>
          </label>
        </section>

        <section className="card">
          <div className="flex items-center gap-3">
            <ShieldCheck className={s.isAdmin ? 'text-mint-300' : 'text-slate-500'} />
            <div className="flex-1"><p className="font-semibold">Admin mode (app owner)</p><p className="text-xs text-slate-400">Review posts & post as Luda Official. In the live app this is a role on your account, not a switch.</p></div>
            <button onClick={() => set((p) => ({ ...p, isAdmin: !p.isAdmin, shortcuts: !p.isAdmin && !p.shortcuts.includes('admin') ? [...p.shortcuts.slice(0, 7), 'admin'] : p.shortcuts.filter((x) => x !== 'admin') }))}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${s.isAdmin ? 'bg-mint-400' : 'bg-fg/15'}`} aria-label="Toggle admin">
              <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${s.isAdmin ? 'start-6' : 'start-1'}`} />
            </button>
          </div>
          {s.isAdmin && <Link to="/admin" className="btn-primary mt-3 w-full py-2.5 text-sm">Open admin console</Link>}
          <p className="mt-2 text-xs text-slate-500">Phone: {s.phoneVerified ? '✅ verified' : 'not verified'} · Poster docs: {s.proofs.housing || s.proofs.business ? '✅ on file' : 'none yet'}</p>
        </section>

        <button className="btn-ghost text-rose-300" onClick={() => (armed ? reset() : setArmed(true))}>{armed ? 'Tap again to confirm reset' : t('profile.reset')}</button>
      </div>

      <Sheet open={kyc} onClose={() => setKyc(false)} title="KYC verification">
        <KycFlow />
      </Sheet>
    </div>
  )
}
