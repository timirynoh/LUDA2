// SEO (v1.37.0): what search engines and link previews see for each public page of useluda.com.
// The build writes a real HTML file per page (dist/about/index.html …) with its own title, description,
// canonical link and readable text, so Google, Bing and WhatsApp/Facebook previews work without running the app.
export const SITE = 'https://useluda.com'
export const NAME = 'Luda'
export const COMPANY = 'Luda Digital Systems Limited'
export const OG_IMAGE = `${SITE}/og.png`

export const HOME = {
  path: '/',
  title: 'Luda – Pay bills, bus tickets, rent & permit fees in North Cyprus',
  description: 'Luda is the app for African students in North Cyprus (TRNC). Pay KIB-TEK and water bills, rent, airtime, Girne–Lefkoşa bus tickets and residency permit fees by card, bank transfer or USSD. Plus housing, jobs and community.',
  h1: 'Luda – life in North Cyprus, made easy',
  body: [
    'Luda helps African students and families living in North Cyprus (TRNC / KKTC) pay for everyday services from one app.',
    'Pay electricity (KIB-TEK), water, internet and phone bills, rent, airtime, Girne ⇄ Lefkoşa bus tickets and residency permit fees (state hospital and tax office). Pay in Naira or your own currency by card, bank transfer or USSD through Paystack and Flutterwave. Luda never holds your money: you pay for each service, and if we can\'t deliver it the money goes back to your card or bank.',
    'Find rooms and roommates, jobs, community events, a marketplace, Flash help from people nearby, university dates and places near you in Girne, Lefkoşa, Gazimağusa and beyond.',
  ],
}

export const PAGES = [
  { path: '/about', title: 'About Luda – Luda Digital Systems Limited', description: 'Who runs Luda, what we offer to students in North Cyprus, how payments work and how to contact us: support@useluda.com.', h1: 'About Luda' },
  { path: '/fees', title: 'Fees – Luda', description: 'Luda prices and fees: no booking fee on bus tickets, a small service fee on bills, free refunds. You always see the exact price before you pay.', h1: 'Luda fees' },
  { path: '/terms', title: 'Terms & Conditions – Luda', description: 'The terms for using Luda, the app run by Luda Digital Systems Limited for people living in North Cyprus.', h1: 'Luda Terms & Conditions' },
  { path: '/privacy', title: 'Privacy notice – Luda', description: 'What personal data Luda collects, why, who we share it with and your choices.', h1: 'Luda Privacy notice' },
  { path: '/refunds', title: 'Refund & cancellation policy – Luda', description: 'When and how Luda returns money: refunds go back to the card or bank account you paid with.', h1: 'Refund & cancellation policy' },
  { path: '/aml', title: 'AML & KYC policy – Luda', description: 'How Luda checks identities and prevents fraud and money laundering.', h1: 'AML & KYC policy' },
  { path: '/contact', title: 'Contact Luda', description: 'Contact the Luda team: support@useluda.com, hello@useluda.com, or Help → Message us in the app.', h1: 'Contact Luda', canonical: '/about' },
]

/** Structured data Google uses for the brand panel and rich results. */
export const JSON_LD = [
  { '@context': 'https://schema.org', '@type': 'Organization', name: COMPANY, alternateName: NAME, url: SITE, logo: `${SITE}/icon-512.png`,
    email: 'support@useluda.com', contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer support', email: 'support@useluda.com', availableLanguage: ['English', 'French', 'Turkish', 'Swahili', 'Arabic'] }] },
  { '@context': 'https://schema.org', '@type': 'WebSite', name: NAME, url: SITE, inLanguage: 'en' },
  { '@context': 'https://schema.org', '@type': 'WebApplication', name: NAME, url: SITE, applicationCategory: 'FinanceApplication', operatingSystem: 'Android, iOS, Web',
    description: HOME.description, areaServed: { '@type': 'Country', name: 'Northern Cyprus' }, offers: { '@type': 'Offer', price: '0', priceCurrency: 'TRY' },
    publisher: { '@type': 'Organization', name: COMPANY } },
]

/** Pages that should never be indexed (private or only make sense when signed in). */
export const NOINDEX = ['/admin', '/pay/', '/kyc/', '/check', '/u/', '/p2p/', '/flash/', '/chats/', '/inbox', '/security', '/profile', '/payments', '/wallet']
