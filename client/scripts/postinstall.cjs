/**
 * postinstall.cjs — cross-platform wrapper for `electron-builder install-app-deps`
 *
 * 1) 先调用 install-electron.cjs 确保 Electron 运行时完整（自愈历史“二进制缺失”问题）
 * 2) Windows / CI 跳过 electron-builder install-app-deps
 * 3) 其他平台安装原生依赖
 */
const os = require('os')
const path = require('path')
const { execSync, execFileSync } = require('child_process')

// 0) Electron 运行时自愈：npm install 后立即检查二进制是否完整，缺失则自动修复。
//    --soft：修复失败不阻塞 npm install，只打印告警（用户可再手动执行 npm run electron:install）。
try {
  execFileSync(process.execPath, [path.join(__dirname, 'install-electron.cjs'), '--soft'], {
    stdio: 'inherit'
  })
} catch (err) {
  console.warn('[postinstall] Electron 运行时检查失败:', err && err.message)
}

// Windows: electron-builder needs `unzip` which is not in PATH by default. Skip.
// CI: no need to rebuild native deps — done during the build step.
if (os.platform() === 'win32' || process.env.CI === 'true') {
  console.log(
    'postinstall: skipped electron-builder install-app-deps ' +
      `(platform=${os.platform()} CI=${!!process.env.CI})\n` +
      '  Run `npm run rebuild:electron` before `npm run dev` to rebuild native modules.'
  )
  process.exit(0)
}

try {
  execSync('npx electron-builder install-app-deps', { stdio: 'inherit' })
} catch {
  console.warn(
    '⚠ postinstall: electron-builder install-app-deps failed\n' +
      '  Run `npm run rebuild:electron` before `npm run dev` if needed.'
  )
}
