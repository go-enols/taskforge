import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// TaskForge 移动端 PWA
// 生产部署在 https://task.likecloud.top/app/（nginx 静态托管，同源调用 /api）
export default defineConfig({
  base: '/app/',
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
})
