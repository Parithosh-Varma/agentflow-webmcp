import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    headers: {
      'Origin-Agent-Cluster': '?1',
    },
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
