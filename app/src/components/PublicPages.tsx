// Public pages (v1.32.0): useluda.com/about, /fees, /terms, /privacy, /refunds, /aml open WITHOUT an account, so payment
// providers (Paystack, Flutterwave) and anyone else can read who runs Luda, what it sells, the prices and the policies.
// The words live on the server (table `guides`, edited in Luda HQ → Guides & terms); the fees come from GET config.
import { ArrowLeft } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FeeList } from './LiveFees'
import { GuideBody, useGuide } from './LiveGuides'
import { LogoMark, Wordmark } from './Logo'

export const COMPANY = 'Luda Digital Systems Limited'
export const PUBLIC_PAGES: { path: string; slug: string | null; label: string }[] = [
  { path: '/about', slug: 'about', label: 'About & contact' },
  { path: '/fees', slug: null, label: 'Fees' },
  { path: '/terms', slug: 'terms', label: 'Terms' },
  { path: '/privacy', slug: 'privacy', label: 'Privacy' },
  { path: '/refunds', slug: 'refunds', label: 'Refunds' },
  { path: '/aml', slug: 'aml', label: 'AML & KYC' },
]
export const isPublicPath = (p: string) => PUBLIC_PAGES.some((x) => x.path === p) || p === '/contact'

/** Small row of links to every public page, with the company name. */
export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={`flex flex-col items-center gap-1.5 text-center ${className}`}>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
        {PUBLIC_PAGES.map((p) => <Link key={p.path} to={p.path} className="text-slate-400 underline-offset-2 hover:text-mint-300 hover:underline">{p.label}</Link>)}
      </div>
      <p className="text-[10px] text-slate-600"><span translate="no">© {new Date().getFullYear()} {COMPANY}</span></p>
    </nav>
  )
}

/** One page's content (inside the app or on the public site). */
export function PolicyContent({ path }: { path: string }) {
  const page = PUBLIC_PAGES.find((x) => x.path === (path === '/contact' ? '/about' : path)) ?? PUBLIC_PAGES[0]
  const { g, err } = useGuide(page.slug)
  if (!page.slug) return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-slate-300">Creating a Luda account is free.</p>
      <FeeList />
    </div>
  )
  return g ? <GuideBody g={g} /> : <p className="text-sm text-slate-500">{err || 'Loading…'}</p>
}

const titleOf = (path: string) => (PUBLIC_PAGES.find((x) => x.path === (path === '/contact' ? '/about' : path))?.label ?? 'Luda')

/** Full page for people who are not signed in (or for links shared outside the app). */
export function PublicPage({ path }: { path: string }) {
  const nav = useNavigate()
  const page = PUBLIC_PAGES.find((x) => x.path === (path === '/contact' ? '/about' : path))
  const { g } = useGuide(page?.slug ?? null)
  const title = g?.title ?? (page?.slug ? titleOf(path) : 'Fees')
  // Search engines and browser tabs: each public page has its own title (the built HTML files carry the same).
  useEffect(() => { document.title = `${title} – Luda` }, [title])
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col px-5 desk:min-h-[calc(100dvh-3rem)]">
      <header className="flex items-center justify-between py-4">
        <button onClick={() => nav('/')} className="flex items-center gap-2" aria-label="Luda home"><LogoMark size={32} /><Wordmark className="text-xl" /></button>
        <button onClick={() => nav('/')} className="chip glass py-2 text-sm"><ArrowLeft size={14} /> Open Luda</button>
      </header>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{title}</h1>
      <p className="mt-1 text-xs text-slate-500"><span translate="no">{COMPANY}</span> · useluda.com</p>
      <main className="mt-5 flex-1"><PolicyContent path={path} /></main>
      <LegalLinks className="mt-10 pb-6" />
    </div>
  )
}
