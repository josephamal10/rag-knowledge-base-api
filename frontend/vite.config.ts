import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development, API calls are proxied to the NestJS backend so no CORS setup is needed.
// In production, set VITE_API_URL to the deployed backend URL instead.
const BACKEND_URL = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ask':    BACKEND_URL,
      '/health': BACKEND_URL,
      '/kb':     BACKEND_URL,
      '/rules':  BACKEND_URL,
    },
  },
})
