import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App'
import { StoreProvider } from './lib/store'
import { LiveProvider } from './lib/liveStore'
import { registerWorker } from './lib/push'

// Luda's address is useluda.com (owner, 2026-11-17). The old pages.dev address and www. forward there, keeping
// the page the person was on. (Phones keep their saved sign-in per address, so people sign in once on the new one;
// their account, money and settings are on the server and come back.)
const MOVED = ['luda-ct6.pages.dev', 'www.useluda.com']
const moving = import.meta.env.VITE_ROUTER !== 'memory' && MOVED.includes(location.hostname)
if (moving) location.replace(`https://useluda.com${location.pathname}${location.search}${location.hash}`)
if (!moving) registerWorker()

// Embedded/sandboxed hosts can't use URL paths, so they route in memory.
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : BrowserRouter

if (!moving) createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <StoreProvider>
        <LiveProvider>
          <MotionConfig reducedMotion="user">
            <App />
          </MotionConfig>
        </LiveProvider>
      </StoreProvider>
    </Router>
  </StrictMode>,
)
