import type { CapacitorConfig } from '@capacitor/cli'

/**
 * TaskForge Android App（Capacitor）
 *
 * webDir 为 `app`：`vite build --mode android` 输出 + `scripts/copy-nodejs.cjs` 注入 Node 运行时工程。
 * Node.js 运行时由 @capawesome/capacitor-nodejs 在 App 启动时自动在后台线程执行 `nodejs/main.js`。
 */
const config: CapacitorConfig = {
  appId: 'top.likecloud.taskforge',
  appName: 'TaskForge',
  webDir: 'app',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Nodejs: {
      nodeDir: 'nodejs',
      startMode: 'auto'
    }
  }
}

export default config
