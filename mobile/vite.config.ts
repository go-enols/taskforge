import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TaskForge 移动端
// - Web/PWA 构建：base=/app/，部署在 https://task.likecloud.top/app/
// - Android App 构建（--mode android）：base=./，由 Capacitor 从本地 assets 加载
export default defineConfig(({ mode }) => ({
  base: mode === 'android' ? './' : '/app/',
  plugins: [react()],
  server: {
    port: 5174,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8268',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'app',
    target: 'es2020',
    sourcemap: false
  }
}))
