import { motion } from 'framer-motion'
import { Siren, User } from 'lucide-react'
import { ACTIONS } from '../lib/actions'
import { Link } from 'react-router-dom'
import { Header } from '../components/ui'
import { useStore } from '../lib/store'

const SOON = [
  ['⚖️', 'Legal help'], ['🩺', 'Health & insurance'], ['🛒', 'Buy & sell'], ['📦', 'Send packages home'], ['💬', 'Group chats'], ['🎓', 'Scholarships'],
]

export default function More() {
  const { s, t } = useStore()
  const items = ACTIONS.filter((a) => !['deposit', 'withdraw', 'convert'].includes(a.id) && (!a.admin || s.isAdmin))
  return (
    <div>
      <Header title={t('more.title')} />
      <div className="grid grid-cols-2 gap-3 px-5">
        {[...items, { id: 'profile', to: '/profile', icon: User, key: 'profile.title', c: 'from-slate-400 to-slate-600' }].map(({ id, to, icon: Icon, key, c }, i) => (
          <motion.div key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Link to={to} className="card flex h-full flex-col gap-3">
              <div className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${c} text-white shadow-lg`}><Icon size={22} /></div>
              <p className="font-semibold">{t(key)}</p>
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
