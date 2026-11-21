import { Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Header } from './ui'

/** Live mode: features that still move demo money stay closed until they're switched to the real wallet. */
export function LiveSoon({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <Header back title={title} />
      <div className="flex flex-col items-center gap-3 px-8 pt-14 text-center">
        <span className="grid size-16 place-items-center rounded-3xl bg-mint-400/15 text-3xl">🚧</span>
        <p className="text-xl font-extrabold">Coming soon with real money</p>
        <p className="text-sm text-slate-400">{children ?? `${title} is being connected to your real Luda wallet. Meanwhile you can top up, withdraw, convert, send money and buy bus tickets.`}</p>
        <Link to="/wallet" className="btn-primary mt-3 w-full max-w-xs py-4"><Wallet size={18} /> Open my wallet</Link>
      </div>
    </div>
  )
}
