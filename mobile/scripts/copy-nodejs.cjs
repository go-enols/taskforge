#!/usr/bin/env node
/**
 * 把 Node.js 运行时工程（nodejs/）和 sandbox-enforcer 拷贝进 Android 构建产物。
 *
 * @capawesome/capacitor-nodejs 会把 `webDir(nodeDir)` 目录从 APK assets 拷贝到应用私有目录，
 * 因此 Node 工程必须出现在 Capacitor webDir（mobile/app/nodejs）中。
 * Web/PWA 构建不需要该目录（也不希望把运行时暴露到公网静态站点）。
 *
 * 用法：vite build --mode android 之后执行
 * @module mobile/scripts
 */
const fs = require('fs')
const path = require('path')

const mobileRoot = path.resolve(__dirname, '..')
const sourceDir = path.join(mobileRoot, 'nodejs')
const targetDir = path.join(mobileRoot, 'app', 'nodejs')
const enforcerSource = path.resolve(
  mobileRoot,
  '..',
  'client',
  'src',
  'main',
  'services',
  'sandbox-enforcer.cjs'
)

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dest = path.join(to, entry.name)
    if (entry.isDirectory()) copyDir(src, dest)
    else if (entry.isFile()) fs.copyFileSync(src, dest)
  }
}

if (!fs.existsSync(sourceDir)) {
  console.error(`[copy-nodejs] source not found: ${sourceDir}`)
  process.exit(1)
}
fs.rmSync(targetDir, { recursive: true, force: true })
copyDir(sourceDir, targetDir)

if (!fs.existsSync(enforcerSource)) {
  console.error(`[copy-nodejs] sandbox enforcer not found: ${enforcerSource}`)
  process.exit(1)
}
fs.copyFileSync(enforcerSource, path.join(targetDir, 'sandbox-enforcer.cjs'))

const files = fs.readdirSync(targetDir)
console.log(`[copy-nodejs] nodejs runtime copied to app/nodejs (${files.join(', ')})`)
