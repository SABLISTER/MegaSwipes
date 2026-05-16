import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

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
        target: 'http://megaswipes:3000',
        changeOrigin: true,
        secure: false,
      },
      '/images': {
        target: 'http://megaswipes:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})

