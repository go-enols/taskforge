/**
 * postinstall.cjs — cross‑platform wrapper for `electron-builder install-app-deps`
 *
 * On Windows, electron-builder may fail because `unzip` is not in PATH.
 * This wrapper catches that error so `npm install` / git hooks never break.
 */
const { execSync } = require('child_process')

try {
  execSync('npx electron-builder install-app-deps', { stdio: 'inherit' })
} catch (err) {
  console.warn(
    '⚠ postinstall: electron-builder install-app-deps skipped\n' +
      '  (this is expected on platforms without unzip — native modules were not rebuilt)\n' +
      '  Run `npm run rebuild:electron` before `npm run dev` if needed.'
  )
}
