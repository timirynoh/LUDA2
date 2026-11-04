import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftRight, Grid2x2, Home as HomeIcon, MessageCircle, Wallet as WalletIcon } from 'lucide-react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Toasts } from './components/ui'
import { UnlockSheet, useTierCelebration } from './components/Verify'
import { useKycReview } from './components/Kyc'
import { useStore } from './lib/store'
import Bills from './screens/Bills'
import Exchange from './screens/Exchange'
import Home from './screens/Home'
import Housing from './screens/Housing'
import More from './screens/More'
import Nearby from './screens/Nearby'
import Onboarding from './screens/Onboarding'
import { Landing, LockScreen, ResetPassword, SignIn, SignUp, Splash, useOAuthReturn } from './screens/Auth'
import { LIVE, getSession } from './lib/live'
import { useCallback, useEffect, useRef, useState } from 'react'
import { IdleGuard } from './components/IdleGuard'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OfflineBanner } from './components/OfflineBanner'
import Security from './screens/Security'
import Inbox from './screens/Inbox'
import Search from './screens/Search'
import Help from './screens/Help'
import { DisputeList, DisputeView } from './screens/Disputes'
import { useDisputeProgress, useExchangerReview } from './lib/disputeFlow'
import { useRateAlerts } from './components/RateAlerts'
import SendScreen from './screens/Send'
import Savings from './screens/Savings'
import Market from './screens/Market'
import Person from './screens/Person'
import { Ambassadors, Deals, Invite, useReferralProgress, Welcome } from './screens/Growth'
import { Challenges, NewsScreen } from './screens/Engage'
import Promos, { usePromoConfirms } from './screens/Promos'
import Profile from './screens/Profile'
import Residency from './screens/Residency'
import Rewards from './screens/Rewards'
import Wallet from './screens/Wallet'
import Chats from './screens/Chats'
import ChatRoom from './screens/ChatRoom'
import Admin from './screens/Admin'
import Community from './screens/Community'
import Jobs from './screens/Jobs'
import Transport from './screens/Transport'
import PayReturn from './screens/PayReturn'
import LiveWallet from './screens/LiveWallet'
import KycReturn from './screens/KycReturn'
import LiveAdmin from './screens/LiveAdmin'
import LiveExchange from './screens/LiveExchange'
import { GuidedTour } from './components/GuidedTour'
import { PrivacyShield } from './components/PrivacyShield'
import { useTodoAlerts } from './components/LiveTodo'
import { useUniReminders } from './components/LiveUni'
import LiveBoard from './screens/LiveBoard'
import LiveChats from './screens/LiveChats'
import LiveP2POrder from './screens/LiveP2P'
import LiveChatRoom from './screens/LiveChatRoom'
import LiveBills from './screens/LiveBills'
import LiveSavings from './screens/LiveSavings'
import LiveMarket from './screens/LiveMarket'
import LiveFlash from './screens/LiveFlash'
import Uni from './screens/Uni'
import { useClassReminders } from './lib/reminders'
import { useGigProgress } from './lib/gigs'
import Flash from './screens/Flash'

const TABS = [
  { to: '/', icon: HomeIcon, key: 'nav.home' },
  { to: '/wallet', icon: WalletIcon, key: 'nav.wallet' },
  { to: '/exchange', icon: ArrowLeftRight, key: 'nav.exchange' },
  { to: '/chats', icon: MessageCircle, key: 'nav.chats' },
  { to: '/more', icon: Grid2x2, key: 'nav.more' },
]

export default function App() {
  const { s, t } = useStore()
  const loc = useLocation()
  useClassReminders()
  useGigProgress()
  useTierCelebration()
  useKycReview()
  useDisputeProgress()
  useExchangerReview()
  useRateAlerts()
  useReferralProgress()
  useTodoAlerts()
  useUniReminders()
  usePromoConfirms()
  useOAuthReturn()
  const inRoom = loc.pathname.startsWith('/chats/')
  const [splash, setSplash] = useState(true)
  const [authView, setAuthView] = useState<'landing' | 'signup' | 'signin'>('landing')
  const [unlocked, setUnlocked] = useState(false)
  const [forceLock, setForceLock] = useState(false)
  const lockNow = useCallback(() => { setUnlocked(false); setForceLock(true) }, [])
  useEffect(() => { const t = setTimeout(() => setSplash(false), 1700); return () => clearTimeout(t) }, [])
  // Just signed in or just finished onboarding in this session → no PIN prompt needed.
  const prev = useRef({ signedIn: s.signedIn, onboarded: s.onboarded })
  useEffect(() => {
    if ((!prev.current.signedIn && s.signedIn) || (!prev.current.onboarded && s.onboarded)) setUnlocked(true)
    if (prev.current.signedIn && !s.signedIn) { setUnlocked(false); setAuthView('signin') }
    prev.current = { signedIn: s.signedIn, onboarded: s.onboarded }
  }, [s.signedIn, s.onboarded])
  // Older demo profiles (before accounts existed) keep working.
  // (Never in live mode: real money always needs a real sign-in.)
  const legacy = !LIVE && !s.account && s.onboarded
  const authed = legacy || (!!s.account && s.signedIn && (!LIVE || !!getSession()))
  const [recovery, setRecovery] = useState(() => LIVE && window.location.hash.includes('type=recovery'))

  let gateScreen: React.ReactNode = null
  if (recovery) gateScreen = <ResetPassword onDone={() => { setRecovery(false); setAuthView('signin') }} />
  else if (!authed) gateScreen = authView === 'signup'
    ? <SignUp onBack={() => setAuthView('landing')} onSignIn={() => setAuthView('signin')} />
    : authView === 'signin' ? <SignIn onBack={() => setAuthView('landing')} onSignUp={() => setAuthView('signup')} />
    : <Landing onSignUp={() => setAuthView('signup')} onSignIn={() => setAuthView('signin')} />
  else if (!s.onboarded) gateScreen = <Onboarding />
  else if ((s.lockOnOpen || forceLock) && !unlocked && !legacy) gateScreen = <LockScreen onUnlock={() => { setUnlocked(true); setForceLock(false) }} />

  return (
    <div className="mx-auto min-h-dvh max-w-app desk:my-6 desk:min-h-[calc(100dvh-3rem)] desk:overflow-hidden desk:rounded-[2.5rem] desk:border desk:border-fg/10 desk:bg-ink-900/60 desk:shadow-2xl desk:shadow-black/60 relative">
      <Toasts />
      <OfflineBanner />
      {!gateScreen && !legacy && <IdleGuard minutes={s.security.autoLockMin} onLock={lockNow} />}
      {!gateScreen && <UnlockSheet />}
      <AnimatePresence>{splash && <Splash key="splash" />}</AnimatePresence>
      {gateScreen ? <AnimatePresence mode="wait"><motion.div key={`${authView}-${authed}-${s.onboarded}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>{gateScreen}</motion.div></AnimatePresence> : (
        <>
          <AnimatePresence mode="wait">
            <motion.main key={loc.pathname} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }} className="pb-32">
              <ErrorBoundary key={loc.pathname}>
              <Routes location={loc}>
                <Route path="/" element={<Home />} />
                <Route path="/wallet" element={LIVE ? <LiveWallet /> : <Wallet />} />
                <Route path="/exchange" element={LIVE ? <LiveExchange /> : <Exchange />} />
                <Route path="/nearby" element={<Nearby />} />
                <Route path="/more" element={<More />} />
                <Route path="/bills" element={LIVE ? <LiveBills /> : <Bills />} />
                <Route path="/housing" element={LIVE ? <LiveBoard key="housing" kind="housing" /> : <Housing />} />
                <Route path="/jobs" element={LIVE ? <LiveBoard key="job" kind="job" /> : <Jobs />} />
                <Route path="/community" element={LIVE ? <LiveBoard key="event" kind="event" /> : <Community />} />
                <Route path="/uni" element={<Uni />} />
                <Route path="/transport" element={<Transport />} />
                <Route path="/pay/return" element={<PayReturn />} />
                <Route path="/kyc/return" element={<KycReturn />} />
                <Route path="/admin" element={LIVE ? <LiveAdmin /> : <Admin />} />
                <Route path="/flash" element={LIVE ? <LiveFlash /> : <Flash />} />
                <Route path="/security" element={<Security />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/search" element={<Search />} />
                <Route path="/help" element={<Help />} />
                <Route path="/disputes" element={LIVE ? <Navigate to="/help" replace /> : <DisputeList />} />
                <Route path="/send" element={LIVE ? <Navigate to="/wallet?a=send" replace /> : <SendScreen />} />
                <Route path="/savings" element={LIVE ? <LiveSavings /> : <Savings />} />
                <Route path="/market" element={LIVE ? <LiveMarket /> : <Market />} />
                <Route path="/u/:name" element={<Person />} />
                <Route path="/invite" element={<Invite />} />
                <Route path="/ambassadors" element={<Ambassadors />} />
                <Route path="/deals" element={LIVE ? <Navigate to="/promos" replace /> : <Deals />} />
                <Route path="/welcome" element={<Welcome />} />
                <Route path="/news" element={LIVE ? <LiveBoard key="news" kind="news" /> : <NewsScreen />} />
                <Route path="/challenges" element={<Challenges />} />
                <Route path="/promos" element={LIVE ? <LiveBoard key="promo" kind="promo" /> : <Promos />} />
                <Route path="/places" element={<LiveBoard key="place" kind="place" />} />
                <Route path="/disputes/:id" element={LIVE ? <Navigate to="/help" replace /> : <DisputeView />} />
                <Route path="/p2p/:id" element={<LiveP2POrder />} />
                <Route path="/chats" element={LIVE ? <LiveChats /> : <Chats />} />
                <Route path="/chats/:id" element={LIVE ? <LiveChatRoom /> : <ChatRoom />} />
                <Route path="/residency" element={<Residency />} />
                <Route path="/rewards" element={<Rewards />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="*" element={<Home />} />
              </Routes>
              </ErrorBoundary>
            </motion.main>
          </AnimatePresence>
          <GuidedTour />
          <PrivacyShield />
          {!inRoom && <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-around rounded-[1.75rem] border border-fg/10 bg-ink-900/85 px-2 py-2 shadow-2xl shadow-black/50 backdrop-blur-2xl">
              {TABS.map(({ to, icon: Icon, key }) => (
                <NavLink key={to} to={to} end={to === '/'} data-tour={`nav${to}`} className="relative flex flex-1 flex-col items-center gap-0.5 py-1.5">
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
          </nav>}
        </>
      )}
    </div>
  )
}
