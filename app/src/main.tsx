import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App'
import { StoreProvider } from './lib/store'
import { LiveProvider } from './lib/liveStore'
import { registerWorker } from './lib/push'

registerWorker()

// Embedded/sandboxed hosts can't use URL paths, so they route in memory.
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
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
