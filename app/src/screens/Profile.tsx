import { BadgeCheck, Monitor, Moon, ShieldCheck, Sun } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar, avatarFrom } from '../components/Avatar'
import { ProfileComplete } from '../components/ProfileComplete'
import { checkText } from '../lib/moderation'
import { useState } from 'react'
import { Header, Sheet } from '../components/ui'
import { KycFlow, KycStatus } from '../components/Kyc'
import { CITIES, COUNTRIES, LANGS } from '../lib/data'
import { useStore } from '../lib/store'
import { LIVE } from '../lib/live'

export default function Profile() {
  const { s, set, t, level, reset, gate } = useStore()
  const [kyc, setKyc] = useState(false)
  const [armed, setArmed] = useState(false)
  const [edit, setEdit] = useState(false)
  const [photoSheet, setPhotoSheet] = useState(false)
  const nav = useNavigate()
  const onStep = (k: string) => {
    if (k === 'photo') setPhotoSheet(true)
    else if (k === 'bio') setEdit(true)
    else if (k === 'phone') gate(1, 'Verify your phone')
    else if (k === 'kyc') { if (s.phoneVerified) setKyc(true); else gate(2, 'KYC verification') }
    else if (k === 'security') nav('/security')
  }
  const country = COUNTRIES.find((c) => c.code === s.country)!

  return (
    <div>
      <Header back title={t('profile.title')} />
      <div className="flex flex-col gap-4 px-5">
        <div className="card flex items-center gap-4">
          <Avatar size={76} editable />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-xl font-bold">{s.name} {s.kyc.status === 'verified' && <BadgeCheck size={18} className="shrink-0 text-mint-400" />}</p>
            {s.account && <p className="truncate text-xs text-slate-400">@{s.account.username}</p>}
            <p className="text-sm text-slate-400">{country.flag} {country.name} · {level.emoji} {level.name}</p>
            {s.bio ? <p className="mt-1 line-clamp-2 text-sm text-slate-300">{s.bio}</p> : null}
          </div>
          <button className="chip shrink-0 bg-fg/5 py-2 text-slate-300" onClick={() => setEdit(true)}>Edit</button>
        </div>

        <ProfileComplete onStep={onStep} />

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

        {(!LIVE || s.isAdmin) && <section className="card">
          <div className="flex items-center gap-3">
            <ShieldCheck className={s.isAdmin ? 'text-mint-300' : 'text-slate-500'} />
            <div className="flex-1"><p className="font-semibold">Admin mode (app owner)</p><p className="text-xs text-slate-400">Review posts & post as Luda Official. In the live app this is a role on your account, not a switch.</p></div>
            {!LIVE && <button onClick={() => set((p) => ({ ...p, isAdmin: !p.isAdmin, shortcuts: !p.isAdmin && !p.shortcuts.includes('admin') ? [...p.shortcuts.slice(0, 7), 'admin'] : p.shortcuts.filter((x) => x !== 'admin') }))}
              className={`relative h-7 w-12 shrink-0 rounded-full transition ${s.isAdmin ? 'bg-mint-400' : 'bg-fg/15'}`} aria-label="Toggle admin">
              <span className={`absolute top-1 size-5 rounded-full bg-white shadow transition-all ${s.isAdmin ? 'start-6' : 'start-1'}`} />
            </button>}
          </div>
          {s.isAdmin && <Link to="/admin" className="btn-primary mt-3 w-full py-2.5 text-sm">{LIVE ? 'Open admin page' : 'Open admin console'}</Link>}
          <p className="mt-2 text-xs text-slate-500">Phone: {s.phoneVerified ? '✅ verified' : 'not verified'} · Poster docs: {s.proofs.housing || s.proofs.business ? '✅ on file' : 'none yet'}</p>
        </section>}

        <button className="btn-ghost text-rose-300" onClick={() => (armed ? reset() : setArmed(true))}>{armed ? 'Tap again to confirm reset' : t('profile.reset')}</button>
        <p className="text-center text-[11px] text-slate-500"><b className="text-slate-300">Luda v{__VERSION__}</b> · {LIVE ? '🟢 Live app · real money' : '🧪 Demo app · practice money'}<br />build {__BUILD__}</p>
      </div>

      {edit && <EditProfile onClose={() => setEdit(false)} />}
      {photoSheet && (
        <Sheet open onClose={() => setPhotoSheet(false)} title="Profile photo">
          <div className="flex flex-col items-center gap-4">
            <Avatar size={140} editable />
            <p className="text-center text-sm text-slate-400">Use a clear, real photo of your face: it helps people trust you in trades, jobs and chats. No logos, no group photos.</p>
            <label className="btn-primary w-full cursor-pointer py-3.5">📸 Take or choose a photo
              <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { set((p) => ({ ...p, avatar: undefined })); const url = await avatarFrom(f); set((p) => ({ ...p, avatar: url })); setPhotoSheet(false) } }} /></label>
            {s.avatar && <button className="text-sm text-rose-300" onClick={() => set((p) => ({ ...p, avatar: undefined }))}>Remove photo</button>}
          </div>
        </Sheet>
      )}
      <Sheet open={kyc} onClose={() => setKyc(false)} title="KYC verification">
        <KycFlow />
      </Sheet>
    </div>
  )
}

function EditProfile({ onClose }: { onClose: () => void }) {
  const { s, set, toast } = useStore()
  const [name, setName] = useState(s.name)
  const [bio, setBio] = useState(s.bio ?? '')
  const save = () => {
    if (!checkText(`${name} ${bio}`).ok) return toast({ title: 'Please keep your profile respectful', emoji: '⚠️' })
    set((p) => ({ ...p, name: name.trim() || p.name, bio: bio.trim() })); toast({ title: 'Profile saved', emoji: '✅' }); onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Edit profile">
      <div className="flex flex-col gap-3">
        <div className="flex justify-center"><Avatar size={96} editable /></div>
        <label className="grid gap-1 text-xs text-slate-400">Display name<input className="input" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-slate-400">Bio<textarea className="input min-h-24" maxLength={160} placeholder="e.g. Engineering student at NEU 🇳🇬 · I fix phones and love football" value={bio} onChange={(e) => setBio(e.target.value)} /></label>
        <p className="text-end text-[11px] text-slate-500">{bio.length}/160</p>
        <button className="btn-primary py-4" onClick={save}>Save</button>
      </div>
    </Sheet>
  )
}
