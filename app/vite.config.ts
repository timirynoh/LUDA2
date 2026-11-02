import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  // A real-hosting build without the payment server address would silently publish the DEMO app over the
  // live one (people then see demo money one day and real money the next). Refuse to build instead, so
  // Cloudflare keeps serving the last good live version. Demo builds must say so: VITE_DEMO=1 or --mode embed.
  if (command === 'build' && mode !== 'embed' && !env.VITE_PAY_API && env.VITE_DEMO !== '1') {
    throw new Error('VITE_PAY_API is not set, so this would be a DEMO build. Set VITE_PAY_API (Cloudflare → Settings → Variables, for Production AND Preview), or set VITE_DEMO=1 to build the demo on purpose.')
  }
  const sha = (env.CF_PAGES_COMMIT_SHA || env.GITHUB_SHA || '').slice(0, 7)
  return {
    // Normal hosting serves the app from the domain root, so deep links like /pay/return
    // or /chats/abc load their files correctly. The Claude artifact demo (embed mode)
    // is served from an unknown folder, so it uses relative paths and a memory router.
    base: mode === 'embed' ? './' : '/',
    plugins: [react(), tailwindcss()],
    define: { __BUILD__: JSON.stringify(`${new Date().toISOString().slice(0, 16).replace('T', ' ')}${sha ? ' · ' + sha : ''}`) },
  }
})
