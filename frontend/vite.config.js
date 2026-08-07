import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// The backend runs on the same machine as the Vite dev server, so the proxy
// targets localhost. Override with VITE_PROXY_TARGET if the backend lives elsewhere.
const backendTarget =
  process.env.VITE_PROXY_TARGET ||
  `http://127.0.0.1:${process.env.BACKEND_PORT || process.env.PORT || 3000}`

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0', // Listen on all network interfaces
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'localhost',
      'megaswipes',
      'megaswipes.local',
      '192.168.153.28',
      '10.62.160.44',
      '169.254.96.197',
      '169.254.131.225',
    ],
    cors: true,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      '/images': {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
