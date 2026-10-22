#!/usr/bin/env node
/**
 * scripts/verify-artifacts.cjs
 *
 * 校验 electron-vite build 产物是否完整。CI 必须运行，用于防止“构建配置漏拷贝”
 * 类回归（典型：sandbox-enforcer.cjs 没有进入 out/main，导致运行时权限层静默失效）。
 *
 * Run: node scripts/verify-artifacts.cjs
 *   or: npm run verify:artifacts
 *
 * Exits 0 when all required artifacts exist, 1 otherwise.
 */

'use strict'

const fs = require('fs')
const path = require('path')

const CLIENT_DIR = path.resolve(__dirname, '..')

/** 构建产物中必须存在的文件（相对 client/） */
const REQUIRED_ARTIFACTS = [
  'out/main/index.js',
  // 安全关键：任务子进程通过 NODE_OPTIONS=--require 加载它
  'out/main/sandbox-enforcer.cjs',
  'out/preload/index.js',
  'out/renderer/index.html'
]

const missing = REQUIRED_ARTIFACTS.filter((relPath) => {
  return !fs.existsSync(path.join(CLIENT_DIR, relPath))
})

if (missing.length > 0) {
  console.error('[verify-artifacts] Missing build artifacts:')
  for (const relPath of missing) {
    console.error('  - ' + relPath)
  }
  console.error(
    '\nHint: run `npx electron-vite build` first. ' +
      'If out/main/sandbox-enforcer.cjs is missing, check the copy-sandbox-enforcer ' +
      'plugin in electron.vite.config.ts.'
  )
  process.exit(1)
}

console.log('[verify-artifacts] OK — all required artifacts present:')
for (const relPath of REQUIRED_ARTIFACTS) {
  console.log('  ✓ ' + relPath)
}
