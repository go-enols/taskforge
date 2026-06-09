/**
 * postinstall.cjs — cross‑platform wrapper for `electron-builder install-app-deps`
 *
 * SKIPS entirely on Windows (unzip not available by default) and in CI.
 * Native modules are rebuilt via `npm run rebuild:electron` before `npm run dev`.
 */
const os = require('os')
const { execSync } = require('child_process')

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
} catch (err) {
  console.warn(
    '⚠ postinstall: electron-builder install-app-deps failed\n' +
      '  Run `npm run rebuild:electron` before `npm run dev` if needed.'
  )
}
