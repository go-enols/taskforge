#!/usr/bin/env node
/**
 * unzip — cross-platform zip extractor (pure Node.js, zero native deps)
 *
 * Usage: unzip [-o] [-d DEST] <zipfile>
 *
 * Powered by adm-zip (pure JavaScript zip library).
 * Registered as a global binary via `npm link` in the client/ directory.
 *
 *   cd client && npm link   # makes `unzip` globally available
 */
'use strict'

const AdmZip = require('adm-zip')
const path = require('path')
const fs = require('fs')
const os = require('os')

// ---- parse args -----------------------------------------------------------
const argv = process.argv.slice(2)
let overwrite = false
let dest = ''
let zipfile = ''
let listOnly = false

for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '-o') overwrite = true
  else if (a === '-d') { dest = argv[++i] || '' }
  else if (a === '-q') { /* quiet — ignored */ }
  else if (a === '-l') { listOnly = true; zipfile = argv[++i] || '' }
  else if (!a.startsWith('-')) zipfile = a
}

if (!zipfile) {
  console.error('Usage: unzip [-o] [-d dest] <zipfile>')
  process.exit(1)
}
if (!dest) dest = '.'

// ---- extract --------------------------------------------------------------
try {
  if (!fs.existsSync(zipfile)) {
    console.error(`unzip: cannot find ${zipfile}`)
    process.exit(1)
  }

  const zip = new AdmZip(zipfile)

  if (listOnly) {
    const entries = zip.getEntries()
    for (const entry of entries) {
      console.log(entry.entryName)
    }
    process.exit(0)
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }

  zip.extractAllTo(dest, overwrite)

  // adm-zip has a quirk on Windows: file times come out as 1601-01-01.
  // Touch each extracted file to fix this.
  if (os.platform() === 'win32') {
    const now = new Date()
    const touchDir = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) touchDir(full)
        else { try { fs.utimesSync(full, now, now) } catch {} }
      }
    }
    touchDir(dest)
  }
} catch (err) {
  console.error('unzip error:', err.message)
  process.exit(1)
}
