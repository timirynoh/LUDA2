// Online status (v1.14.0): worked out by the server from real activity (any use of the app, at most once a minute).
// Online = active in the last 5 minutes.
export function presenceOf(lastSeen?: string | null) {
  if (!lastSeen) return { online: false, label: 'Not active recently' }
  const m = Math.floor((Date.now() - Date.parse(lastSeen)) / 60_000)
  if (m < 5) return { online: true, label: 'Online' }
  if (m < 60) return { online: false, label: `Active ${m} min ago` }
  const h = Math.floor(m / 60)
  if (h < 24) return { online: false, label: h === 1 ? 'Active 1 hour ago' : `Active ${h} hours ago` }
  const d = Math.floor(h / 24)
  return { online: false, label: d === 1 ? 'Active yesterday' : d < 7 ? `Active ${d} days ago` : 'Not active recently' }
}

export function Presence({ at, className = '' }: { at?: string | null; className?: string }) {
  const p = presenceOf(at)
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${p.online ? 'font-semibold text-mint-300' : 'text-slate-400'} ${className}`}>
      <span className={`size-2 shrink-0 rounded-full ${p.online ? 'bg-mint-400 shadow-[0_0_6px] shadow-mint-400' : 'bg-slate-500/60'}`} />{p.label}
    </span>
  )
}
