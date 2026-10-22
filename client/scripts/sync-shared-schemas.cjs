#!/usr/bin/env node
/**
 * @file 共享 manifest schema 同步脚本
 * @description 以仓库根 `shared/schemas/manifest.ts` 为唯一事实来源（single source of truth），
 *              同步到 client / server 的 `src/shared/schemas/manifest.ts`。
 *              避免三份 schema 各自漂移（历史上 client 与服务端校验规则不一致会放过坏包）。
 *
 * 用法：
 *   node scripts/sync-shared-schemas.cjs          # 复制（写入 client / server）
 *   node scripts/sync-shared-schemas.cjs --check  # 只校验，不一致则退出码 1（CI 用）
 * @module client/scripts
 */
const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..', '..')
const canonical = path.join(repoRoot, 'shared', 'schemas', 'manifest.ts')
const targets = [
  path.join(repoRoot, 'client', 'src', 'shared', 'schemas', 'manifest.ts'),
  path.join(repoRoot, 'server', 'src', 'shared', 'schemas', 'manifest.ts')
]

const checkOnly = process.argv.includes('--check')

if (!fs.existsSync(canonical)) {
  console.error(`[sync-shared-schemas] canonical schema not found: ${canonical}`)
  process.exit(1)
}

const source = fs.readFileSync(canonical, 'utf8')
let failed = false

for (const target of targets) {
  const relative = path.relative(repoRoot, target)
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
  if (current === source) {
    console.log(`[sync-shared-schemas] OK ${relative}`)
    continue
  }
  if (checkOnly) {
    console.error(`[sync-shared-schemas] OUT OF SYNC ${relative} (run: node scripts/sync-shared-schemas.cjs)`)
    failed = true
    continue
  }
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, source, 'utf8')
  console.log(`[sync-shared-schemas] synced -> ${relative}`)
}

if (failed) process.exit(1)
