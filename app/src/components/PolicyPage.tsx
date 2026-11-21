// The same public pages (About, Fees, Privacy, Refunds, AML) inside the signed-in app, with the normal header.
import { Header } from './ui'
import { LegalLinks, PolicyContent, PUBLIC_PAGES } from './PublicPages'
import { useGuide } from './LiveGuides'

export function PolicyPage({ path }: { path: string }) {
  const page = PUBLIC_PAGES.find((x) => x.path === (path === '/contact' ? '/about' : path))
  const { g } = useGuide(page?.slug ?? null)
  return (
    <div className="pb-10">
      <Header back title={g?.title ?? page?.label ?? 'Luda'} />
      <div className="px-5"><PolicyContent path={path} /><LegalLinks className="mt-8" /></div>
    </div>
  )
}
