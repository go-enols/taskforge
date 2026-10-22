import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['tests/setup/electron-mock.ts'],
    testTimeout: 15000,
    hookTimeout: 15000
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared'),
      // electron-updater 在导入时依赖 electron 二进制（CI 未安装），测试统一使用桩
      'electron-updater': resolve(__dirname, 'tests/setup/electron-updater-mock.ts')
    }
  }
})
