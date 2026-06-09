/**
 * @file zipExtractor 单元测试
 * @description 验证 extractZip / readZipEntry 的核心行为，尤其是 source 路径与 dest 目录
 *              重叠时的安全性（不应误删源文件）。这是修复 #ADM-ZIP Invalid filename 回归的关键测试。
 *
 * 注意：本文件必须在 node 环境运行（vitest 默认 jsdom 会导致 adm-zip 的 Buffer 行为异常，
 *      提取出的文件内容长度为0）。
 * @module tests/main/utils
 */

// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import AdmZip from 'adm-zip'
import { extractZip, readZipEntry } from '../../../src/main/utils/zipExtractor'

/**
 * Helper: build a valid in-memory zip containing manifest.json + index.js,
 * write it to `destPath`, and return the SHA-256 of the resulting file.
 */
function buildSampleZip(destPath: string): void {
  const zip = new AdmZip()
  zip.addFile(
    'manifest.json',
    Buffer.from(
      JSON.stringify({
        id: 'sample',
        name: 'Sample',
        version: '1.0.0',
        description: 'sample',
        entryPoint: 'index.js',
        runtime: 'node',
        schema: { type: 'object' }
      })
    )
  )
  zip.addFile('index.js', Buffer.from('console.log("hello")'))
  zip.writeZip(destPath)
}

describe('zipExtractor.extractZip', () => {
  let workDir: string

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'zipExtractor-test-'))
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  it('extracts a valid zip into the destination directory', () => {
    const archivePath = join(workDir, 'archive.zip')
    const destDir = join(workDir, 'extracted')
    buildSampleZip(archivePath)

    extractZip(archivePath, destDir)

    expect(existsSync(join(destDir, 'manifest.json'))).toBe(true)
    expect(existsSync(join(destDir, 'index.js'))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(destDir, 'manifest.json'), 'utf-8'))
    expect(manifest.id).toBe('sample')
  })

  it('throws "zip 文件不存在" when archive path does not exist (preflight check)', () => {
    const archivePath = join(workDir, 'does-not-exist.zip')
    const destDir = join(workDir, 'dest')
    mkdirSync(destDir, { recursive: true })

    expect(() => extractZip(archivePath, destDir)).toThrow(/zip 文件不存在/)
  })

  /**
   * REGRESSION TEST — fix for ADM-ZIP: Invalid filename
   *
   * Root cause of the original bug: script-fetcher.ts:138 calls
   *   extractZip(scriptDir/download.tmp, scriptDir)
   * i.e. the source archive lives INSIDE the destination directory.
   *
   * The previous implementation called `rmSync(destDir, { recursive: true })`
   * BEFORE opening the zip, which deleted the source file. The subsequent
   * `new AdmZip(archivePath)` then threw `ADM-ZIP: Invalid filename`.
   *
   * The fix: extractZip must NOT delete a source archive that is located
   * inside (or equal to) the destination directory BEFORE reading it.
   * After successful extraction, the source archive may be cleaned up.
   */
  it('does not delete the source archive before opening it (regression for ADM-ZIP Invalid filename)', () => {
    // Lay out: workDir/<scriptId>/download.tmp  (this is exactly what
    // script-fetcher.ts produces before calling extractZip)
    const scriptDir = join(workDir, 'script-id-123')
    mkdirSync(scriptDir, { recursive: true })
    const archivePath = join(scriptDir, 'download.tmp')
    buildSampleZip(archivePath)

    expect(existsSync(archivePath)).toBe(true)

    // Same call shape as script-fetcher.ts:138. Must NOT throw
    // "ADM-ZIP: Invalid filename".
    expect(() => extractZip(archivePath, scriptDir)).not.toThrow()

    // And the contents should have been extracted
    expect(existsSync(join(scriptDir, 'manifest.json'))).toBe(true)
    expect(existsSync(join(scriptDir, 'index.js'))).toBe(true)

    // The extracted manifest must be a non-empty valid JSON.
    const manifest = JSON.parse(readFileSync(join(scriptDir, 'manifest.json'), 'utf-8'))
    expect(manifest.id).toBe('sample')
  })

  it('clears stale files in destDir when archive lives outside destDir', () => {
    const archivePath = join(workDir, 'archive.zip')
    const destDir = join(workDir, 'dest')
    mkdirSync(destDir, { recursive: true })
    writeFileSync(join(destDir, 'stale.txt'), 'leftover')
    buildSampleZip(archivePath)

    extractZip(archivePath, destDir)

    expect(existsSync(join(destDir, 'stale.txt'))).toBe(false)
    expect(existsSync(join(destDir, 'manifest.json'))).toBe(true)
  })
})

describe('zipExtractor.readZipEntry', () => {
  let workDir: string

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'zipExtractor-read-'))
  })

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true })
  })

  it('returns the entry content as a utf-8 string', () => {
    const archivePath = join(workDir, 'archive.zip')
    buildSampleZip(archivePath)

    const content = readZipEntry(archivePath, 'manifest.json')
    expect(content).not.toBeNull()
    const parsed = JSON.parse(content as string)
    expect(parsed.id).toBe('sample')
  })

  it('returns null when the requested entry does not exist', () => {
    const archivePath = join(workDir, 'archive.zip')
    buildSampleZip(archivePath)

    expect(readZipEntry(archivePath, 'nope.txt')).toBeNull()
  })

  it('throws "zip 文件不存在" when archive path does not exist', () => {
    expect(() => readZipEntry(join(workDir, 'missing.zip'), 'manifest.json')).toThrow(/zip 文件不存在/)
  })
})