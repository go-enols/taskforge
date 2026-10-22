#!/usr/bin/env node
/**
 * @file Electron 二进制安装 / 自愈检查（可全局使用）
 * @description 确保目标项目 `node_modules/electron/dist` 中的 Electron 运行时完整可用。
 *
 * 背景：在部分 Windows 环境（杀毒软件/中断/磁盘问题）下，electron 自带 postinstall
 * 可能只解压出部分文件就静默结束，表现为 `electron` 包在但二进制缺失/不完整，
 * `npm run dev` 直接无法启动。本脚本：
 *
 *   1. 定位 electron 包：`--project <目录>` → 从当前目录向上查找 → 脚本所在 node_modules（兼容全局安装）
 *   2. 快速检查：`dist/version` 与 `electron/package.json` 版本一致 && 可执行文件存在
 *   3. 修复：调用 electron 自带 `install.js`（走 ELECTRON_MIRROR，默认 npmmirror）
 *   4. 兜底：仍不完整时从本地下载缓存找到对应 zip，用系统 `tar`/`unzip` 直接解压
 *
 * 用法：
 *   node install-electron.cjs                     # 检查当前项目，缺失则修复
 *   node install-electron.cjs --project <目录>    # 指定项目目录
 *   node install-electron.cjs --check             # 只检查，不修复（退出码 0/1）
 *   node install-electron.cjs --soft              # 失败只告警（postinstall 用）
 *
 * 全局安装（任意项目可直接调用）：
 *   复制本文件到 `%APPDATA%\npm\ensure-electron.cjs`，并在同目录创建
 *   `ensure-electron.cmd`（内容：`@node "%~dp0ensure-electron.cjs" %*`）。
 * @module scripts/install-electron
 */
const fs = require('fs')
const path = require('path')
const os = require('os')
const { execFileSync } = require('child_process')

const argv = process.argv.slice(2)
const SOFT = argv.includes('--soft')
const CHECK_ONLY = argv.includes('--check')
const projectArgIndex = argv.indexOf('--project')
const explicitProject = projectArgIndex >= 0 ? argv[projectArgIndex + 1] : undefined

function log(msg) {
  console.log(`[install-electron] ${msg}`)
}

function fail(msg) {
  if (SOFT) {
    console.warn(`[install-electron] WARN ${msg}`)
    process.exit(0)
  }
  console.error(`[install-electron] ERROR ${msg}`)
  process.exit(1)
}

/**
 * 定位 electron 包目录。
 * 顺序：--project → 从 cwd 向上 → 脚本所在目录的 node_modules（兼容全局安装）。
 * @returns {{ electronDir: string, projectRoot: string } | null}
 */
function resolveElectron() {
  const candidates = []
  if (explicitProject) {
    candidates.push(path.resolve(explicitProject, 'node_modules', 'electron'))
  }
  let dir = process.cwd()
  for (;;) {
    candidates.push(path.join(dir, 'node_modules', 'electron'))
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  // 全局安装时，脚本位于 <npm-prefix>/ensure-electron.cjs，其同级 node_modules 即全局 node_modules
  candidates.push(path.join(__dirname, 'node_modules', 'electron'))
  candidates.push(path.join(__dirname, '..', 'node_modules', 'electron'))

  for (const electronDir of candidates) {
    if (fs.existsSync(path.join(electronDir, 'package.json'))) {
      return { electronDir, projectRoot: path.resolve(electronDir, '..', '..') }
    }
  }
  return null
}

const resolved = resolveElectron()
if (!resolved) {
  fail('未找到 node_modules/electron（请在项目目录执行，或使用 --project 指定项目，或先 npm install electron -g）')
}
const { electronDir, projectRoot } = resolved
const distDir = path.join(electronDir, 'dist')

const platform = process.env.npm_config_platform || process.platform
const arch = process.env.npm_config_arch || process.arch

/** Electron 可执行文件名 */
function exeName() {
  switch (platform) {
    case 'darwin':
    case 'mas':
      return 'Electron.app/Contents/MacOS/Electron'
    case 'win32':
      return 'electron.exe'
    default:
      return 'electron'
  }
}

/** 读取 electron 包版本 */
function electronVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(electronDir, 'package.json'), 'utf8')).version
  } catch {
    return null
  }
}

/** 检查 dist 是否完整（版本文件 + 可执行文件） */
function isInstalled() {
  const version = electronVersion()
  if (!version) return false
  let installedVersion = ''
  try {
    installedVersion = fs.readFileSync(path.join(distDir, 'version'), 'utf8').replace(/^v/, '').trim()
  } catch {
    return false
  }
  if (installedVersion !== version) return false
  return fs.existsSync(path.join(distDir, exeName()))
}

/** 递归查找本地 electron 下载缓存中的 zip */
function findCachedZip(version) {
  const cacheRoots = [
    process.env.electron_config_cache,
    path.join(os.homedir(), 'AppData', 'Local', 'electron', 'Cache'),
    path.join(os.homedir(), '.cache', 'electron'),
    path.join(os.homedir(), 'Library', 'Caches', 'electron')
  ].filter(Boolean)
  const target = `electron-v${version}-${platform}-${arch}.zip`
  for (const root of cacheRoots) {
    if (!fs.existsSync(root)) continue
    const stack = [root]
    while (stack.length) {
      const dir = stack.pop()
      let entries = []
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) stack.push(full)
        else if (entry.name === target) return full
      }
    }
  }
  return null
}

/** 从 zip 解压到 dist（Windows 用 tar；其他平台优先 unzip，回退 tar） */
function extractZip(zipPath) {
  fs.rmSync(distDir, { recursive: true, force: true })
  fs.mkdirSync(distDir, { recursive: true })
  if (platform === 'win32') {
    execFileSync('tar', ['-xf', zipPath, '-C', distDir], { stdio: 'inherit' })
    return
  }
  try {
    execFileSync('unzip', ['-oq', zipPath, '-d', distDir], { stdio: 'inherit' })
  } catch {
    execFileSync('tar', ['-xf', zipPath, '-C', distDir], { stdio: 'inherit' })
  }
}

function writePathFile() {
  fs.writeFileSync(path.join(electronDir, 'path.txt'), exeName(), 'utf8')
}

function main() {
  const version = electronVersion()
  if (!version) {
    fail('未找到 electron/package.json，请先执行 npm install')
  }
  const scope = path.relative(projectRoot, electronDir) || electronDir

  if (isInstalled()) {
    log(`OK — Electron v${version} 已完整安装（${scope}）`)
    process.exit(0)
  }

  if (CHECK_ONLY) {
    fail(`Electron v${version} 运行时缺失或不完整（${scope}），可执行: node install-electron.cjs${explicitProject ? ` --project "${explicitProject}"` : ''}`)
  }

  log(`检测到 Electron v${version} 运行时缺失/不完整（${scope}），开始修复…`)

  // 1) 先尝试 Electron 官方安装脚本（走镜像）
  if (!process.env.ELECTRON_MIRROR) {
    process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
  }
  try {
    execFileSync(process.execPath, [path.join(electronDir, 'install.js')], {
      stdio: 'inherit',
      env: process.env,
      cwd: electronDir
    })
  } catch (err) {
    console.warn('[install-electron] install.js 执行失败:', err && err.message)
  }
  if (isInstalled()) {
    writePathFile()
    log(`OK — 已通过 install.js 修复 Electron v${version}`)
    process.exit(0)
  }

  // 2) 兜底：从本地缓存 zip 直接解压
  const cachedZip = findCachedZip(version)
  if (!cachedZip) {
    fail(
      `无法自动修复：本地没有 electron-v${version}-${platform}-${arch}.zip 缓存。` +
        `请确认网络可访问 ${process.env.ELECTRON_MIRROR} 后重试`
    )
  }
  log(`使用缓存安装包: ${cachedZip}`)
  try {
    extractZip(cachedZip)
    writePathFile()
  } catch (err) {
    fail(`解压缓存安装包失败: ${err && err.message}`)
  }

  if (!isInstalled()) {
    fail('修复后检查仍未通过，请删除 node_modules/electron 后重新 npm install')
  }
  log(`OK — 已从缓存修复 Electron v${version}`)
}

main()
