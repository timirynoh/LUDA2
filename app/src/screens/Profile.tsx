import { BadgeCheck, Camera, IdCard, Loader2, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Header, Sheet, Success } from '../components/ui'
import { CITIES, COUNTRIES, LANGS } from '../lib/data'
import { useStore } from '../lib/store'

export default function Profile() {
  const { s, set, t, level, reward, reset } = useStore()
  const [kyc, setKyc] = useState<0 | 1 | 2 | 3 | 4>(0)
  const [armed, setArmed] = useState(false)
  const country = COUNTRIES.find((c) => c.code === s.country)!

  const next = async (n: 2 | 3) => {
    setKyc(n)
    if (n === 3) {
      await new Promise((r) => setTimeout(r, 1800))
      set((p) => ({ ...p, verified: true }))
      reward(150, { quest: 'verify', badge: 'verified', title: 'Identity verified' })
      setKyc(4)
    }
  }

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

        {!s.verified ? (
          <button onClick={() => setKyc(1)} className="card flex items-center gap-3 border-gold-400/40 bg-gold-400/10 text-start">
            <ShieldCheck className="text-gold-300" />
            <div className="flex-1"><p className="font-semibold">{t('profile.verify')}</p><p className="text-xs text-slate-400">Unlock P2P swaps & higher limits · +150 XP</p></div>
          </button>
        ) : (
          <div className="card flex items-center gap-3 border-mint-400/30 bg-mint-400/5"><ShieldCheck className="text-mint-300" /><p className="font-semibold">{t('profile.verified')} · Tier 2</p></div>
        )}

        <section className="card">
          <p className="label mb-3">{t('profile.lang')}</p>
          <div className="grid grid-cols-5 gap-2">
            {LANGS.map((l) => (
              <button key={l.code} onClick={() => set((p) => ({ ...p, lang: l.code }))}
                className={`flex flex-col items-center gap-1 rounded-2xl p-2 text-[11px] font-semibold ${s.lang === l.code ? 'bg-mint-400/15 text-mint-200 ring-1 ring-mint-400/50' : 'bg-white/[0.03] text-slate-400'}`}>
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

        <button className="btn-ghost text-rose-300" onClick={() => (armed ? reset() : setArmed(true))}>{armed ? 'Tap again to confirm reset' : t('profile.reset')}</button>
      </div>

      <Sheet open={kyc > 0} onClose={() => setKyc(0)} title={t('profile.verify')}>
        {kyc === 1 && (
          <div className="flex flex-col gap-4 text-center">
            <div className="mx-auto grid size-20 place-items-center rounded-3xl bg-white/5"><IdCard size={36} className="text-mint-300" /></div>
            <p className="font-semibold">Scan your passport or residence card</p>
            <p className="text-sm text-slate-400">We check the document's security features and expiry. Your data is encrypted and only used for verification.</p>
            <label className="btn-primary cursor-pointer py-4"><Camera size={18} /> Take photo / upload
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={() => next(2)} /></label>
            <button className="text-xs text-slate-500" onClick={() => next(2)}>Skip (demo)</button>
          </div>
        )}
        {kyc === 2 && (
          <div className="flex flex-col gap-4 text-center">
            <div className="mx-auto grid size-40 place-items-center rounded-full border-4 border-dashed border-mint-400/60 text-6xl">🙂</div>
            <p className="font-semibold">Liveness selfie</p>
            <p className="text-sm text-slate-400">Look at the camera, then turn your head slowly. This proves it's really you.</p>
            <label className="btn-primary cursor-pointer py-4"><Camera size={18} /> Start selfie
              <input type="file" accept="image/*" capture="user" className="hidden" onChange={() => next(3)} /></label>
            <button className="text-xs text-slate-500" onClick={() => next(3)}>Skip (demo)</button>
          </div>
        )}
        {kyc === 3 && <div className="flex flex-col items-center gap-3 py-12 text-slate-300"><Loader2 className="animate-spin text-mint-300" size={40} />Matching face to document…</div>}
        {kyc === 4 && <Success title="You're verified ✅" sub="P2P SafeSwap unlocked." onClose={() => setKyc(0)} />}
      </Sheet>
    </div>
  )
}
