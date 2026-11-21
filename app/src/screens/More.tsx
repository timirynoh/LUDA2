// "More" (v1.36.0): everything grouped into clear sections with small tiles, no duplicates of the bottom bar.
import { motion } from 'framer-motion'
import { Landmark, LifeBuoy, ReceiptText, ShieldCheck, Siren, User, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Header } from '../components/ui'
import { WALLET } from '../config'
import { ACTIONS } from '../lib/actions'
import { LIVE } from '../lib/live'
import { useStore } from '../lib/store'

interface Tile { id: string; to: string; icon: LucideIcon; key: string; c: string }

/** Extra tiles that aren't home-screen shortcuts. */
const EXTRA: Record<string, Tile> = {
  payments: { id: 'payments', to: '/payments', icon: ReceiptText, key: 'My payments', c: 'from-emerald-400 to-teal-700' },
  'residency-fees': { id: 'residency-fees', to: '/bills?residency=1', icon: Landmark, key: 'Residency fees', c: 'from-teal-400 to-cyan-700' },
  security: { id: 'security', to: '/security', icon: ShieldCheck, key: 'Security Center', c: 'from-emerald-500 to-teal-800' },
  help: { id: 'help', to: '/help', icon: LifeBuoy, key: 'Help & Support', c: 'from-sky-400 to-blue-700' },
  profile: { id: 'profile', to: '/profile', icon: User, key: 'profile.title', c: 'from-slate-400 to-slate-600' },
}

const noWallet = LIVE && !WALLET
const GROUPS: [string, string, string[]][] = [
  ['💳', 'Pay', noWallet ? ['bills', 'transport', 'residency-fees', 'payments'] : ['bills', 'transport', 'send', 'savings']],
  ['🏠', 'Live in Cyprus', ['housing', 'jobs', 'uni', 'residency', 'nearby', 'welcome']],
  ['🤝', 'Community', ['community', 'news', 'market', 'flash', 'promos', ...(LIVE ? [] : ['deals', 'food'])]],
  ['🎁', 'Rewards', ['rewards', 'challenges', 'invite', 'ambassador']],
  ['⚙️', 'Account & help', ['profile', 'security', 'help', 'admin']],
]

const SOON = [['⚖️', 'Legal help'], ['🩺', 'Health & insurance'], ['📦', 'Send packages home'], ['🎓', 'Scholarships']]

export default function More() {
  const { s, t } = useStore()
  const find = (id: string): Tile | undefined => EXTRA[id] ?? ACTIONS.find((a) => a.id === id && (!a.admin || s.isAdmin))
  return (
    <div className="pb-6">
      <Header title={t('more.title')} />
      <div className="flex flex-col gap-5 px-5">
        {GROUPS.map(([emoji, title, ids], g) => {
          const tiles = ids.map(find).filter(Boolean) as Tile[]
          if (!tiles.length) return null
          return (
            <motion.section key={title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: g * 0.05 }}>
              <p className="label mb-2">{emoji} {title}</p>
              <div className="card grid grid-cols-3 gap-y-4 py-4 tab:grid-cols-6">
                {tiles.map(({ id, to, icon: Icon, key, c }) => (
                  <Link key={id} to={to} className="flex flex-col items-center gap-1.5 text-center">
                    <span className={`grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${c} text-white shadow-md transition active:scale-90`}><Icon size={21} /></span>
                    <span className="px-1 text-[11px] font-medium leading-tight text-slate-300">{t(key)}</span>
                  </Link>
                ))}
              </div>
            </motion.section>
          )
        })}

        <section>
          <p className="label mb-2">🚨 Emergency (TRNC)</p>
          <div className="grid grid-cols-3 gap-2">
            {[['Police', '155'], ['Ambulance', '112'], ['Fire', '199']].map(([n, num]) => (
              <a key={num} href={`tel:${num}`} className="card flex flex-col items-center gap-1 border-rose-400/20 bg-rose-500/5 py-3">
                <Siren size={18} className="text-rose-300" /><span className="text-lg font-extrabold">{num}</span><span className="text-xs text-slate-400">{n}</span>
              </a>
            ))}
          </div>
        </section>

        <section>
          <p className="label mb-2">Coming soon</p>
          <div className="flex flex-wrap gap-2">
            {SOON.map(([e, l]) => <span key={l} className="chip bg-fg/[0.05] py-2 text-slate-400">{e} {l}</span>)}
          </div>
        </section>
      </div>
    </div>
  )
}
