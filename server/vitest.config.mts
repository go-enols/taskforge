import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    // 单文件顺序执行：测试共享同一个临时 SQLite 数据库
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000
  }
})
