import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftRight, Grid2x2, Home as HomeIcon, MapPin, Wallet as WalletIcon } from 'lucide-react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Toasts } from './components/ui'
import { useStore } from './lib/store'
import Bills from './screens/Bills'
import Exchange from './screens/Exchange'
import Home from './screens/Home'
import More from './screens/More'
import Nearby from './screens/Nearby'
import Onboarding from './screens/Onboarding'
import Profile from './screens/Profile'
import Residency from './screens/Residency'
import Rewards from './screens/Rewards'
import Wallet from './screens/Wallet'

const TABS = [
  { to: '/', icon: HomeIcon, key: 'nav.home' },
  { to: '/wallet', icon: WalletIcon, key: 'nav.wallet' },
  { to: '/exchange', icon: ArrowLeftRight, key: 'nav.exchange' },
  { to: '/nearby', icon: MapPin, key: 'nav.nearby' },
  { to: '/more', icon: Grid2x2, key: 'nav.more' },
]

export default function App() {
  const { s, t } = useStore()
  const loc = useLocation()

  return (
    <div className="mx-auto min-h-dvh max-w-md sm:my-6 sm:min-h-[calc(100dvh-3rem)] sm:overflow-hidden sm:rounded-[2.5rem] sm:border sm:border-white/10 sm:bg-ink-950/60 sm:shadow-2xl sm:shadow-black/60 relative">
      <Toasts />
      {!s.onboarded ? <Onboarding /> : (
        <>
          <AnimatePresence mode="wait">
            <motion.main key={loc.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }} className="pb-32">
              <Routes location={loc}>
                <Route path="/" element={<Home />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/exchange" element={<Exchange />} />
                <Route path="/nearby" element={<Nearby />} />
                <Route path="/more" element={<More />} />
                <Route path="/bills" element={<Bills />} />
                <Route path="/residency" element={<Residency />} />
                <Route path="/rewards" element={<Rewards />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="*" element={<Home />} />
              </Routes>
            </motion.main>
          </AnimatePresence>
          <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-around rounded-[1.75rem] border border-white/10 bg-ink-900/85 px-2 py-2 shadow-2xl shadow-black/50 backdrop-blur-2xl">
              {TABS.map(({ to, icon: Icon, key }) => (
                <NavLink key={to} to={to} end={to === '/'} className="relative flex flex-1 flex-col items-center gap-0.5 py-1.5">
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.div layoutId="tab" className="absolute inset-0 rounded-2xl bg-gradient-to-b from-mint-400/20 to-transparent" />}
                      <Icon size={21} className={isActive ? 'text-mint-300' : 'text-slate-500'} strokeWidth={isActive ? 2.4 : 2} />
                      <span className={`text-[10px] font-semibold ${isActive ? 'text-mint-200' : 'text-slate-500'}`}>{t(key)}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        </>
      )}
    </div>
  )
}
