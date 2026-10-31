import { motion } from 'framer-motion'
import { Building2, Gift, Handshake, MapPin, Siren, User, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Header } from '../components/ui'
import { useStore } from '../lib/store'

const SOON = [
  ['🏠', 'Housing & roommates'], ['💼', 'Part-time jobs'], ['🎓', 'Uni fees & deadlines'], ['🚌', 'Bus & taxi'],
  ['🧑🏾‍🤝‍🧑🏾', 'Community events'], ['⚖️', 'Legal help'],
]

export default function More() {
  const { t } = useStore()
  const items = [
    { to: '/bills', icon: Zap, label: t('act.bills'), c: 'from-orange-400 to-rose-500' },
    { to: '/residency', icon: Building2, label: t('act.residency'), c: 'from-teal-300 to-cyan-600' },
    { to: '/exchange?tab=p2p', icon: Handshake, label: t('act.p2p'), c: 'from-fuchsia-400 to-purple-600' },
    { to: '/nearby', icon: MapPin, label: t('nav.nearby'), c: 'from-rose-400 to-pink-600' },
    { to: '/rewards', icon: Gift, label: t('act.rewards'), c: 'from-violet-400 to-indigo-600' },
    { to: '/profile', icon: User, label: t('profile.title'), c: 'from-slate-400 to-slate-600' },
  ]
  return (
    <div>
      <Header title={t('more.title')} />
      <div className="grid grid-cols-2 gap-3 px-5">
        {items.map(({ to, icon: Icon, label, c }, i) => (
          <motion.div key={to} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Link to={to} className="card flex h-full flex-col gap-3">
              <div className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${c} text-white shadow-lg`}><Icon size={22} /></div>
              <p className="font-semibold">{label}</p>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="px-5 pt-6">
        <p className="label mb-3">🚨 Emergency (TRNC)</p>
        <div className="grid grid-cols-3 gap-2">
          {[['Police', '155'], ['Ambulance', '112'], ['Fire', '199']].map(([n, num]) => (
            <a key={num} href={`tel:${num}`} className="card flex flex-col items-center gap-1 border-rose-400/20 bg-rose-500/5 py-3">
              <Siren size={18} className="text-rose-300" /><span className="text-lg font-extrabold">{num}</span><span className="text-xs text-slate-400">{n}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="px-5 pt-6">
        <p className="label mb-3">Coming soon</p>
        <div className="grid grid-cols-3 gap-2">
          {SOON.map(([e, l]) => (
            <div key={l} className="card flex flex-col items-center gap-1 p-3 text-center opacity-70">
              <span className="text-2xl">{e}</span><span className="text-[11px] font-medium text-slate-400">{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
