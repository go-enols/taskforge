#!/usr/bin/env node
/**
 * unzip.js — cross-platform zip extractor (pure Node.js, zero dependencies)
 *
 * Usage: node unzip.js [-o] [-d DEST] <zipfile>
 *
 * Windows: delegates to PowerShell Expand-Archive (built into Win 10+)
 * Unix:    delegates to system unzip command
 *
 * Installed globally via npm to provide `unzip` on PATH:
 *   npm install -g unzip  (or copy this file + unzip.cmd to npm global bin)
 */
const { spawnSync } = require('child_process')
const os = require('os')
const path = require('path')
const fs = require('fs')

const args = process.argv.slice(2)

if (os.platform() === 'win32') {
  // Parse args: unzip [-o] [-d dest] zipfile
  let overwrite = false
  let dest = ''
  let zipfile = ''

  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '-o') { overwrite = true }
    else if (a === '-d') { dest = args[++i] || '' }
    else if (a === '-q') { /* quiet — ignored */ }
    else if (a === '-l') { zipfile = args[++i] || ''; listZip(zipfile); process.exit(0) }
    else { zipfile = a }
  }

  if (!zipfile) {
    console.error('Usage: unzip [-o] [-d dest] <zipfile>')
    process.exit(1)
  }
  if (!dest) dest = '.'

  extractWin(zipfile, dest, overwrite)
} else {
  // Unix — delegate to system unzip
  const r = spawnSync('unzip', args, { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}

// ---- Windows helpers (PowerShell-powered, built into OS, zero deps) ----

function listZip(zipfile) {
  // Use .NET ZipFile to list entries — no external binary needed
  const ps = `
    [Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null
    $z = [System.IO.Compression.ZipFile]::OpenRead('${escapePS(zipfile)}')
    $z.Entries | ForEach-Object { Write-Host $_.FullName }
    $z.Dispose()
  `
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' })
  process.exit(r.status ?? 1)
}

function extractWin(zipfile, dest, overwrite) {
  const ps = `
    $ErrorActionPreference = 'Stop'
    [Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null
    $zip = '${escapePS(zipfile)}'
    $dst = '${escapePS(dest)}'
    if (-not (Test-Path $dst)) { [void](New-Item $dst -ItemType Directory -Force) }
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dst)
  `
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
    stdio: 'inherit',
    timeout: 300000
  })
  process.exit(r.status ?? 1)
}

function escapePS(s) {
  return s.replace(/'/g, "''")
}
