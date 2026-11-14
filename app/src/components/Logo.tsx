/**
 * Luda logo: a bold "L" whose base becomes a Mediterranean wave (the journey to
 * North Cyprus, and a smile), with a gold sun/coin (warmth, home, money).
 */
export function LogoMark({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={className} aria-label="Luda" role="img">
      <defs>
        <linearGradient id="luda-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#34d399" /><stop offset=".55" stopColor="#059669" /><stop offset="1" stopColor="#064e3b" /></linearGradient>
        <radialGradient id="luda-sun" cx=".35" cy=".35"><stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f59e0b" /></radialGradient>
        <linearGradient id="luda-shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".22" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="120" height="120" rx="34" fill="url(#luda-bg)" />
      <rect width="120" height="120" rx="34" fill="url(#luda-shine)" />
      <path d="M40 28 V74 C40 86 48 90 58 88 C68 86 74 80 84 82 C88 83 91 85 94 88" fill="none" stroke="#fff" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="80" cy="40" r="12" fill="url(#luda-sun)" />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`font-extrabold tracking-tight ${className}`}>luda<span className="text-gold-400">.</span></span>
}
