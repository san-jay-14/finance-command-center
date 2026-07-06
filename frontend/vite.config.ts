import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
  },
  define: {
    // react-draggable (bundled inside react-rnd) reads process.env.DRAGGABLE_DEBUG
    // at runtime; Vite doesn't polyfill Node's `process` global in the browser
    // bundle, so without this it throws "process is not defined" on every
    // externally-driven position/size update (i.e. every drag/resize).
    'process.env': {},
  },
})
