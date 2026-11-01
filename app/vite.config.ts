import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  // Normal hosting serves the app from the domain root, so deep links like /pay/return
  // or /chats/abc load their files correctly. The Claude artifact demo (embed mode)
  // is served from an unknown folder, so it uses relative paths and a memory router.
  base: mode === 'embed' ? './' : '/',
  plugins: [react(), tailwindcss()],
}))
