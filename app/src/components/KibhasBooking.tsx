// Live mode: KIBHAS airport shuttle is booked and paid on KIBHAS's own website (they issue the ticket),
// shown inside Luda so the student doesn't have to leave the app. Luda doesn't touch that payment.
import { ExternalLink, Info, Plane, RotateCw, X } from 'lucide-react'
import { useState } from 'react'

const KIBHAS_URL = 'https://kibhas.org'

export function KibhasLive() {
  const [open, setOpen] = useState(false)
  const [reload, setReload] = useState(0)
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-cyan-500 via-sky-700 to-sky-950 p-5 text-white">
        <Plane className="absolute -right-2 -bottom-2 size-28 rotate-12 text-white/10" />
        <p className="chip bg-white/15 text-white">KIBHAS airport shuttle</p>
        <p className="mt-3 text-2xl font-extrabold">Ercan ⇄ your city</p>
        <p className="text-sm text-cyan-50/90">Girne · Lefkoşa · Gazimağusa · Güzelyurt · Lefke</p>
        <button className="mt-4 w-full rounded-2xl bg-white py-3.5 text-base font-bold text-sky-900" onClick={() => setOpen(true)}>Book on KIBHAS</button>
      </div>
      <div className="flex items-start gap-2 rounded-2xl bg-fg/[0.04] p-3 text-xs text-slate-300">
        <Info size={16} className="mt-0.5 shrink-0 text-sky-300" />
        <span>KIBHAS sells these tickets themselves: you choose the trip and pay on <b>KIBHAS's own secure page</b> (it opens inside Luda), and they text you the ticket by SMS. Prices and times come from KIBHAS. For help with a KIBHAS booking, contact KIBHAS.</span>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
          <div className="pt-safe flex items-center gap-2 border-b border-fg/10 px-3 py-2">
            <button className="glass grid size-9 place-items-center rounded-xl" aria-label="Close" onClick={() => setOpen(false)}><X size={18} /></button>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">KIBHAS · kibhas.org</p><p className="text-[10px] text-mint-300">🔒 Secure page run by KIBHAS</p></div>
            <button className="glass grid size-9 place-items-center rounded-xl" aria-label="Reload" onClick={() => setReload((n) => n + 1)}><RotateCw size={16} /></button>
            <a className="glass grid size-9 place-items-center rounded-xl" aria-label="Open in browser" href={KIBHAS_URL} target="_blank" rel="noreferrer"><ExternalLink size={16} /></a>
          </div>
          <iframe key={reload} title="KIBHAS booking" src={KIBHAS_URL} className="w-full flex-1 bg-white" referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" />
          <p className="pb-safe px-4 py-2 text-center text-[11px] text-slate-400">Page blank or not loading? Some sites only open in the browser: tap <ExternalLink size={11} className="inline" /> above.</p>
        </div>
      )}
    </div>
  )
}
