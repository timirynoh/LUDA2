import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeftRight, Grid2x2, Home as HomeIcon, MessageCircle, ReceiptText, Wallet as WalletIcon, Zap } from 'lucide-react'
import { WALLET } from './config'
import { Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { Header, Toasts } from './components/ui'
import { UnlockSheet, useTierCelebration } from './components/Verify'
import { useKycReview } from './components/Kyc'
import { useStore } from './lib/store'
import Home from './screens/Home'
import Onboarding from './screens/Onboarding'
import { PolicyPage } from './components/PolicyPage'
import { isPublicPath, PublicPage } from './components/PublicPages'
import { Landing, LockScreen, ResetPassword, SignIn, SignUp, Splash, useOAuthReturn } from './screens/Auth'
import { LIVE, getSession, staffCan } from './lib/live'
import { useLive } from './lib/liveStore'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { IdleGuard } from './components/IdleGuard'
import { ErrorBoundary } from './components/ErrorBoundary'
import { OfflineBanner } from './components/OfflineBanner'
import { useDisputeProgress, useExchangerReview } from './lib/disputeFlow'
import { useRateAlerts } from './components/RateAlerts'
import { Ambassadors, Deals, Invite, useReferralProgress, Welcome } from './screens/Growth'
import Promos, { usePromoConfirms } from './screens/Promos'
import { RateFromLink } from './components/Ratings'
import { GuidedTour } from './components/GuidedTour'
import { PrivacyShield } from './components/PrivacyShield'
import { GuidePage, TermsGate } from './components/LiveGuides'
import { PasscodeNudge } from './components/Passcode'
import { TicketCheck } from './components/TicketCheck'
import { useTodoAlerts } from './components/LiveTodo'
import { usePushSync } from './components/PushSync'
import { useAutoUpdate } from './components/AutoUpdate'
import { useUniReminders } from './components/LiveUni'
import { useClassReminders } from './lib/reminders'
import { useGigProgress } from './lib/gigs'

// Screens load when they are first opened (v1.33.0), so the app starts faster: Home, sign-in and the public pages
// are in the first download, everything else comes in small pieces.
const Bills = lazy(() => import('./screens/Bills'))
const Exchange = lazy(() => import('./screens/Exchange'))
const Housing = lazy(() => import('./screens/Housing'))
const Nearby = lazy(() => import('./screens/Nearby'))
const Security = lazy(() => import('./screens/Security'))
const Inbox = lazy(() => import('./screens/Inbox'))
const LiveStatements = lazy(() => import('./screens/LiveStatements'))
const Search = lazy(() => import('./screens/Search'))
const Help = lazy(() => import('./screens/Help'))
const SendScreen = lazy(() => import('./screens/Send'))
const Savings = lazy(() => import('./screens/Savings'))
const Market = lazy(() => import('./screens/Market'))
const Person = lazy(() => import('./screens/Person'))
const Profile = lazy(() => import('./screens/Profile'))
const Residency = lazy(() => import('./screens/Residency'))
const Rewards = lazy(() => import('./screens/Rewards'))
const Wallet = lazy(() => import('./screens/Wallet'))
const Chats = lazy(() => import('./screens/Chats'))
const ChatRoom = lazy(() => import('./screens/ChatRoom'))
const Admin = lazy(() => import('./screens/Admin'))
const Community = lazy(() => import('./screens/Community'))
const Jobs = lazy(() => import('./screens/Jobs'))
const Transport = lazy(() => import('./screens/Transport'))
const PayReturn = lazy(() => import('./screens/PayReturn'))
const LiveWallet = lazy(() => import('./screens/LiveWallet'))
const Payments = lazy(() => import('./screens/Payments'))
const KycReturn = lazy(() => import('./screens/KycReturn'))
const LiveAdmin = lazy(() => import('./screens/LiveAdmin'))
const LiveExchange = lazy(() => import('./screens/LiveExchange'))
const LiveBoard = lazy(() => import('./screens/LiveBoard'))
const LiveChats = lazy(() => import('./screens/LiveChats'))
const LiveP2POrder = lazy(() => import('./screens/LiveP2P'))
const LiveChatRoom = lazy(() => import('./screens/LiveChatRoom'))
const LiveBills = lazy(() => import('./screens/LiveBills'))
const LiveSavings = lazy(() => import('./screens/LiveSavings'))
const LiveMarket = lazy(() => import('./screens/LiveMarket'))
const Uni = lazy(() => import('./screens/Uni'))
const Flash = lazy(() => import('./screens/Flash'))
const More = lazy(() => import('./screens/More'))
const DisputeList = lazy(() => import('./screens/Disputes').then((m) => ({ default: m.DisputeList })))
const DisputeView = lazy(() => import('./screens/Disputes').then((m) => ({ default: m.DisputeView })))
const Challenges = lazy(() => import('./screens/Engage').then((m) => ({ default: m.Challenges })))
const NewsScreen = lazy(() => import('./screens/Engage').then((m) => ({ default: m.NewsScreen })))
const LiveFlash = lazy(() => import('./screens/LiveFlash'))
const LiveFlashJob = lazy(() => import('./screens/LiveFlash').then((m) => ({ default: m.LiveFlashJob })))

// v1.34.0 (no wallet): Home · Bills · Payments · Chats · More. With WALLET on: Home · Wallet · Exchange · Chats · More.
const TABS = WALLET ? [
  { to: '/', icon: HomeIcon, key: 'nav.home' },
  { to: '/wallet', icon: WalletIcon, key: 'nav.wallet' },
  { to: '/exchange', icon: ArrowLeftRight, key: 'nav.exchange' },
  { to: '/chats', icon: MessageCircle, key: 'nav.chats' },
  { to: '/more', icon: Grid2x2, key: 'nav.more' },
] : [
  { to: '/', icon: HomeIcon, key: 'nav.home' },
  { to: '/bills', icon: Zap, key: 'nav.bills' },
  { to: '/payments', icon: ReceiptText, key: 'nav.payments' },
  { to: '/chats', icon: MessageCircle, key: 'nav.chats' },
  { to: '/more', icon: Grid2x2, key: 'nav.more' },
]

/** Old /wallet links (notifications, emails, bookmarks) land on My payments; '?a=kyc' still opens the ID check. */
function WalletGone() {
  const { search } = useLocation()
  return <Navigate to={`/payments${new URLSearchParams(search).get('a') === 'kyc' ? '?a=kyc' : ''}`} replace />
}

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
  usePushSync()
  useAutoUpdate()
  useUniReminders()
  usePromoConfirms()
  useOAuthReturn()
  const inRoom = loc.pathname.startsWith('/chats/')
  const [splash, setSplash] = useState(true)
  const [authView, setAuthView] = useState<'landing' | 'signup' | 'signin'>('landing')
  // Coming back from Paystack/Flutterwave or the ID check reloads the page: don't ask for the code again if this
  // tab was unlocked in the last 30 minutes (owner: the top-up flow asked for the PIN again right after paying).
  const [unlocked, setUnlocked] = useState(() => {
    try { return /^\/(pay|kyc)\/return/.test(window.location.pathname) && Date.now() - Number(sessionStorage.getItem('luda.unlockedAt') ?? 0) < 30 * 60e3 } catch { return false }
  })
  useEffect(() => {
    if (!unlocked) return
    const mark = () => { try { sessionStorage.setItem('luda.unlockedAt', String(Date.now())) } catch { /* private mode */ } }
    mark(); window.addEventListener('pagehide', mark) // leaving for the payment page counts as 'just used'
    return () => window.removeEventListener('pagehide', mark)
  }, [unlocked])
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
  if (!authed && !recovery && isPublicPath(loc.pathname)) gateScreen = <PublicPage path={loc.pathname} />
  else if (recovery) gateScreen = <ResetPassword onDone={() => { setRecovery(false); setAuthView('signin') }} />
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
              <Suspense fallback={<ScreenLoading />}>
              <Routes location={loc}>
                <Route path="/" element={<Home />} />
                <Route path="/wallet" element={LIVE && !WALLET ? <WalletGone /> : LIVE ? <LiveWallet /> : <Wallet />} />
                <Route path="/exchange" element={LIVE && !WALLET ? <Navigate to="/payments" replace /> : LIVE ? <LiveExchange /> : <Exchange />} />
                <Route path="/payments" element={LIVE ? <Payments /> : <Navigate to="/wallet" replace />} />
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
                {LIVE && <Route path="/flash/:id" element={<LiveFlashJob />} />}
                <Route path="/security" element={<Security />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/statements" element={LIVE && WALLET ? <LiveStatements /> : <Navigate to={LIVE ? '/payments' : '/wallet'} replace />} />
                <Route path="/search" element={<Search />} />
                <Route path="/help" element={<Help />} />
                <Route path="/check" element={<TicketCheckPage />} />
                <Route path="/terms" element={<GuidePage slug="terms" />} />
                {(['/about', '/contact', '/fees', '/privacy', '/refunds', '/aml'] as const).map((p) => <Route key={p} path={p} element={<PolicyPage path={p} />} />)}
                <Route path="/guide/:slug" element={<GuideRoute />} />
                <Route path="/disputes" element={LIVE ? <Navigate to="/help" replace /> : <DisputeList />} />
                <Route path="/send" element={LIVE ? <Navigate to={WALLET ? '/wallet?a=send' : '/payments'} replace /> : <SendScreen />} />
                <Route path="/savings" element={LIVE && !WALLET ? <Navigate to="/payments" replace /> : LIVE ? <LiveSavings /> : <Savings />} />
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
              </Suspense>
              </ErrorBoundary>
            </motion.main>
          </AnimatePresence>
          <GuidedTour />
          <PrivacyShield />
          <TermsGate />
          <RateFromLink />
          <PasscodeNudge />
          {!inRoom && <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-app px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-around rounded-[1.75rem] border border-fg/10 bg-ink-900/85 px-2 py-2 shadow-2xl shadow-black/50 backdrop-blur-2xl">
              {TABS.map(({ to, icon: Icon, key }) => (
                <NavLink key={to} to={to} end={to === '/'} replace={loc.pathname !== '/'} data-tour={`nav${to}`} className="relative flex flex-1 flex-col items-center gap-0.5 py-1.5">
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


function GuideRoute() {
  const { slug = '' } = useParams()
  return <GuidePage key={slug} slug={slug} />
}

/** Drivers / staff with the 'tickets' role: scan passengers' bus tickets (checked on the server). Same app, own page. */
function TicketCheckPage() {
  const { me } = useLive()
  const ok = LIVE && staffCan(me?.profile.staff, 'tickets', 'edit')
  return <div className="pb-10"><Header back title="Ticket check" sub="Scan the passenger's live ticket QR" /><div className="px-5">{ok ? <TicketCheck /> : <p className="pt-10 text-center text-sm text-slate-400">This page is for drivers and the Luda team with ticket-check access.</p>}</div></div>
}

/** Shown for a moment while a screen's code downloads. */
function ScreenLoading() {
  return <div className="flex min-h-[50dvh] items-center justify-center" aria-label="Loading"><span className="size-8 animate-spin rounded-full border-2 border-mint-400/30 border-t-mint-400" /></div>
}
