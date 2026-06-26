// Test
// Permissions: network, filesystem
// Schema params: msg
// Runtime detection
const path = require('path')
const fs = require('fs')
const isTaskForge = !!process.env.TASK_ID

// Load config from TaskForge env or local demo file
let config, wallets, accounts
if (isTaskForge) {
  config = JSON.parse(process.env.TASK_CONFIG || '{}')
  wallets = JSON.parse(process.env.TASK_DATA_WALLETS || '[]')
  accounts = JSON.parse(process.env.TASK_DATA_ACCOUNTS || '[]')
} else {
  const demoPath = path.join(__dirname, 'demo-config.json')
  if (fs.existsSync(demoPath)) {
    const demo = JSON.parse(fs.readFileSync(demoPath, 'utf-8'))
    config = demo.config || {}
    wallets = demo.wallets || []
    accounts = demo.accounts || []
    console.log('[demo] Running in standalone mode with demo data')
  } else {
    console.warn('[demo] No demo-config.json found, using empty data')
    config = {}
    wallets = []
    accounts = []
  }
}

console.log('[script] started with config:', JSON.stringify(config))

// ── 权限自检（由 TaskForge 注入）──
const canNetwork = isTaskForge ? process.env.TASK_PERM_NETWORK === '1' : true
const canFilesystem = isTaskForge ? process.env.TASK_PERM_FILESYSTEM === '1' : true
const isSandbox = isTaskForge ? process.env.TASK_SANDBOX === '1' : false
if (isSandbox) {
  console.warn('[script] Running in sandbox mode — network and filesystem access disabled')
}

// ── 读取钱包数据（由 TaskForge 注入）──
if (wallets.length > 0) {
  console.log('[script] loaded', wallets.length, 'wallet(s)')
}

// ── 读取账户数据（由 TaskForge 注入）──
if (accounts.length > 0) {
  console.log('[script] loaded', accounts.length, 'account(s)')
}

// TODO: add your script logic here
