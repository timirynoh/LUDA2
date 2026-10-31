import { motion } from 'framer-motion'
import { ArrowDownLeft, ArrowUpRight, Building2, ChevronRight, Eye, EyeOff, Flame, Handshake, House, Repeat, UtensilsCrossed, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ring } from '../components/ui'
import { CITIES, COUNTRIES, CURRENCIES, QUESTS } from '../lib/data'
import { convert, fmt, useRates } from '../lib/fx'
import { useStore } from '../lib/store'

export default function Home() {
  const { s, t, level } = useStore()
  const { rates, live } = useRates()
  const [hide, setHide] = useState(false)
  const home = COUNTRIES.find((c) => c.code === s.country)!
  const city = CITIES.find((c) => c.id === s.city)!
  const total = Object.entries(s.balances).reduce((a, [c, v]) => a + convert(rates, v, c, 'TRY'), 0)
  const activeTrade = s.trades.find((x) => x.status === 'escrow' || x.status === 'meeting')

  const actions = [
    { to: '/wallet?a=deposit', icon: ArrowDownLeft, label: t('act.deposit'), c: 'from-mint-400 to-emerald-600' },
    { to: '/wallet?a=withdraw', icon: ArrowUpRight, label: t('act.withdraw'), c: 'from-sky-400 to-indigo-500' },
    { to: '/exchange', icon: Repeat, label: t('act.convert'), c: 'from-gold-300 to-amber-500' },
    { to: '/exchange?tab=p2p', icon: Handshake, label: t('act.p2p'), c: 'from-fuchsia-400 to-purple-600' },
    { to: '/bills', icon: Zap, label: t('act.bills'), c: 'from-orange-400 to-rose-500' },
    { to: '/nearby', icon: UtensilsCrossed, label: t('act.food'), c: 'from-rose-400 to-pink-600' },
    { to: '/residency', icon: Building2, label: t('act.residency'), c: 'from-teal-300 to-cyan-600' },
    { to: '/housing', icon: House, label: t('act.housing'), c: 'from-amber-400 to-orange-600' },
  ]

  return (
    <div className="flex flex-col gap-5 px-5 pt-6">
      {/* top bar */}
      <div className="flex items-center gap-3">
        <Link to="/profile">
          <Ring value={level.progress} size={52} stroke={4}>
            <div className="grid size-10 place-items-center rounded-full bg-ink-700 text-lg font-bold">{s.name[0]?.toUpperCase()}</div>
          </Ring>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-400">{t('home.hello')} {home.flag} · {city.name}</p>
          <p className="truncate text-lg font-bold">{s.name} <span className="text-sm font-medium text-slate-400">· {level.emoji} {level.name}</span></p>
        </div>
        <Link to="/rewards" className="chip bg-orange-500/15 py-2 text-orange-300"><Flame size={14} /> {s.streak}</Link>
      </div>

      {/* balance card */}
      <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }}
        className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-500 via-emerald-700 to-ink-800 p-6 shadow-2xl shadow-emerald-900/40">
        <div className="absolute -top-16 -right-10 size-56 rounded-full bg-gold-300/25 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 size-48 rounded-full bg-mint-300/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-emerald-100/80">{t('home.balance')}</p>
            <button onClick={() => setHide(!hide)} className="text-emerald-100/80" aria-label="Toggle balance">{hide ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          <p className="mt-1 text-4xl font-extrabold tracking-tight">{hide ? '₺ ••••••' : fmt(total, 'TRY')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(s.balances).map(([c, v]) => (
              <span key={c} className="chip bg-black/20 text-emerald-50 backdrop-blur">{CURRENCIES[c]?.flag} {hide ? '•••' : fmt(v, c, { compact: true })}</span>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-between text-xs text-emerald-100/80">
            <span>{t('home.level')} {level.idx} · {s.xp} / {level.next} XP</span>
            <span className="font-semibold text-gold-200">🪙 {s.points} pts</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/25">
            <motion.div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-amber-400" initial={{ width: 0 }} animate={{ width: `${level.progress * 100}%` }} transition={{ duration: 1 }} />
          </div>
        </div>
      </motion.div>

      {activeTrade && (
        <Link to="/exchange?tab=p2p" className="card flex items-center gap-3 border-fuchsia-400/30 bg-fuchsia-500/10">
          <div className="grid size-11 place-items-center rounded-2xl bg-fuchsia-500/20"><Handshake className="text-fuchsia-300" /></div>
          <div className="flex-1">
            <p className="font-semibold">Trade with {activeTrade.trader}</p>
            <p className="text-xs text-slate-400">🔒 {fmt(activeTrade.give, activeTrade.giveCur)} in escrow · {activeTrade.spot}</p>
          </div>
          <ChevronRight className="text-slate-500 rtl:rotate-180" />
        </Link>
      )}

      {/* quick actions */}
      <section>
        <p className="label mb-3">{t('home.quick')}</p>
        <div className="grid grid-cols-4 gap-3">
          {actions.map(({ to, icon: Icon, label, c }, i) => (
            <motion.div key={to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Link to={to} className="flex flex-col items-center gap-2 text-center">
                <div className={`grid size-14 place-items-center rounded-2xl bg-gradient-to-br ${c} text-white shadow-lg transition active:scale-90`}>
                  <Icon size={22} strokeWidth={2.2} />
                </div>
                <span className="text-[11px] leading-tight font-medium text-slate-300">{label}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* rates */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <p className="label">{t('home.rates')}</p>
          <span className={`chip ${live ? 'bg-mint-400/15 text-mint-300' : 'bg-white/5 text-slate-400'}`}>
            <span className={`size-1.5 rounded-full ${live ? 'animate-pulse bg-mint-400' : 'bg-slate-500'}`} /> {live ? t('fx.live') : t('fx.indicative')}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[home.currency === 'USD' ? 'NGN' : home.currency, 'USD', 'EUR'].map((c) => (
            <div key={c} className="rounded-2xl bg-white/[0.03] p-3">
              <p className="text-xs text-slate-400">{CURRENCIES[c]?.flag} 1 {c === 'NGN' || c === 'XAF' || c === 'CDF' ? '000 ' : ''}{c}</p>
              <p className="mt-1 font-bold">{fmt(convert(rates, ['NGN', 'XAF', 'CDF'].includes(c) ? 1000 : 1, c, 'TRY'), 'TRY')}</p>
            </div>
          ))}
        </div>
      </section>

      {/* quests */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="label">{t('home.quests')}</p>
          <span className="text-xs text-slate-400">{s.quests.length}/{QUESTS.length}</span>
        </div>
        <div className="flex flex-col gap-2">
          {QUESTS.filter((q) => !s.quests.includes(q.id)).slice(0, 4).map((q) => (
            <Link key={q.id} to={q.to} className="card flex items-center gap-3 py-3.5">
              <div className="grid size-9 place-items-center rounded-xl bg-gold-400/15 text-gold-300">★</div>
              <span className="flex-1 text-sm font-semibold">{q.title}</span>
              <span className="chip bg-gold-400/10 text-gold-300">+{q.xp} XP</span>
            </Link>
          ))}
          {s.quests.length === QUESTS.length && <div className="card text-center text-sm text-slate-300">🏆 All quests done. You're a legend.</div>}
        </div>
      </section>
    </div>
  )
}
