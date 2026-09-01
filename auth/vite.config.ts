import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'GOOGLE_'],
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
