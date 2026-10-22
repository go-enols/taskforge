import { resolve } from 'path'
import { copyFileSync, mkdirSync, readFileSync } from 'fs'
import { defineConfig } from 'electron-vite'
import type { PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** 应用版本号（构建时注入 renderer，用于登录页脚注等展示） */
const appVersion = (
  JSON.parse(readFileSync(resolve('package.json'), 'utf-8')) as { version: string }
).version

/**
 * 把 sandbox-enforcer.cjs 拷贝到主进程构建产物（out/main）。
 *
 * 该文件通过运行时字符串路径被 task.ts 加载（NODE_OPTIONS=--require），
 * 不会参与 rollup 打包；缺少这一步时 enforcer 在 dev/生产产物中都不存在，
 * 四层权限模型会静默失效（历史缺陷）。打包场景另由 electron-builder.yml 的
 * extraResources 拷贝到 resources/sandbox-enforcer.cjs。
 */
const copySandboxEnforcer: PluginOption = {
  name: 'copy-sandbox-enforcer',
  closeBundle() {
    const source = resolve('src/main/services/sandbox-enforcer.cjs')
    const outDir = resolve('out/main')
    mkdirSync(outDir, { recursive: true })
    copyFileSync(source, resolve(outDir, 'sandbox-enforcer.cjs'))
  }
}

export default defineConfig({
  main: {
    plugins: [copySandboxEnforcer],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {},
  renderer: {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        output: {
          // 把较大的三方依赖拆成独立 chunk：three 仅登录页按需加载，vendor 长期缓存
          manualChunks: {
            three: ['three'],
            vendor: ['react', 'react-dom', 'react-router-dom']
          }
        }
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
