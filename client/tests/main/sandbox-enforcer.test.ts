/**
 * tests/main/sandbox-enforcer.test.ts
 *
 * Tests that the root-level sandbox enforcer DENIES network and filesystem
 * operations when the task is sandboxed (or lacks the relevant permission),
 * regardless of what the script tries to do.
 *
 * End-to-end: spawn a real Node child process with the enforcer loaded
 * via NODE_OPTIONS=--require, run a small inline script that attempts
 * the forbidden operation, and assert the error code is
 * ERR_PERMISSION_DENIED.
 */

import { spawn } from 'child_process'
import { resolve, join } from 'path'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { describe, it, expect } from 'vitest'

const ENFORCER_PATH = resolve(__dirname, '../../src/main/services/sandbox-enforcer.cjs')

interface ChildResult {
  code: number | null
  stdout: string
  stderr: string
}

function runChild(script: string, env: Record<string, string>): Promise<ChildResult> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(process.execPath, ['-e', script], {
      env: {
        ...process.env,
        ...env,
        NODE_OPTIONS: `--require ${ENFORCER_PATH}`
      } as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', rejectP)
    child.on('exit', (code) => {
      resolveP({ code, stdout, stderr })
    })
  })
}

/**
 * 以真实入口文件（而非 -e）启动子进程，模拟 TaskService.startTask 的启动方式：
 * NODE_OPTIONS 中的路径统一转正斜杠并加引号（Windows 必需）。
 */
function runEntry(
  entryPath: string,
  cwd: string,
  env: Record<string, string>
): Promise<ChildResult> {
  return new Promise((resolveP, rejectP) => {
    const enforcerArg = `"${ENFORCER_PATH.replace(/\\/g, '/')}"`
    const child = spawn(process.execPath, [entryPath], {
      cwd,
      env: {
        ...process.env,
        ...env,
        NODE_OPTIONS: `--require ${enforcerArg}`
      } as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += d.toString() })
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', rejectP)
    child.on('exit', (code) => {
      resolveP({ code, stdout, stderr })
    })
  })
}

// describe: 沙箱强制器根 describe 块，分组测试各权限场景
describe('sandbox-enforcer', () => {
  // describe: 网络权限禁用场景（TASK_PERM_NETWORK=0）
  describe('when TASK_PERM_NETWORK=0', () => {
    it('http.request throws ERR_PERMISSION_DENIED', async () => {
      // 用例：http.request 在网络权限禁用时抛出 ERR_PERMISSION_DENIED
      const script = `try { require('http').request('http://example.com'); console.log('NO_THROW'); } catch (e) { console.log('THREW:' + e.code); }`
      const { stdout } = await runChild(script, {
        TASK_PERM_NETWORK: '0',
        TASK_PERM_FILESYSTEM: '0'
      })
      expect(stdout).toContain('THREW:ERR_PERMISSION_DENIED')
      expect(stdout).not.toContain('NO_THROW')
    })

    it('https.get throws ERR_PERMISSION_DENIED', async () => {
      // 用例：https.get 在网络权限禁用时抛出 ERR_PERMISSION_DENIED
      const script = `try { require('https').get('https://example.com'); console.log('NO_THROW'); } catch (e) { console.log('THREW:' + e.code); }`
      const { stdout } = await runChild(script, {
        TASK_PERM_NETWORK: '0',
        TASK_PERM_FILESYSTEM: '0'
      })
      expect(stdout).toContain('THREW:ERR_PERMISSION_DENIED')
    })

    it('net.connect throws ERR_PERMISSION_DENIED', async () => {
      // 用例：net.connect 在网络权限禁用时抛出 ERR_PERMISSION_DENIED
      const script = `try { require('net').connect(80, 'example.com'); console.log('NO_THROW'); } catch (e) { console.log('THREW:' + e.code); }`
      const { stdout } = await runChild(script, {
        TASK_PERM_NETWORK: '0',
        TASK_PERM_FILESYSTEM: '0'
      })
      expect(stdout).toContain('THREW:ERR_PERMISSION_DENIED')
    })

    it('tls.connect throws ERR_PERMISSION_DENIED', async () => {
      // 用例：tls.connect 在网络权限禁用时抛出 ERR_PERMISSION_DENIED
      const script = `try { require('tls').connect(443, 'example.com'); console.log('NO_THROW'); } catch (e) { console.log('THREW:' + e.code); }`
      const { stdout } = await runChild(script, {
        TASK_PERM_NETWORK: '0',
        TASK_PERM_FILESYSTEM: '0'
      })
      expect(stdout).toContain('THREW:ERR_PERMISSION_DENIED')
    })

    it('global fetch throws ERR_PERMISSION_DENIED', async () => {
      // 用例：globalThis.fetch 在网络权限禁用时抛出 ERR_PERMISSION_DENIED
      const script = `try { fetch('http://example.com'); console.log('NO_THROW'); } catch (e) { console.log('THREW:' + e.code); }`
      const { stdout } = await runChild(script, {
        TASK_PERM_NETWORK: '0',
        TASK_PERM_FILESYSTEM: '0'
      })
      expect(stdout).toContain('THREW:ERR_PERMISSION_DENIED')
    })

    it('child_process.spawn throws ERR_PERMISSION_DENIED', async () => {
      // 用例：child_process.spawn 在网络权限禁用时抛出 ERR_PERMISSION_DENIED
      const script = `try { require('child_process').spawn('echo', ['hi']); console.log('NO_THROW'); } catch (e) { console.log('THREW:' + e.code); }`
      const { stdout } = await runChild(script, {
        TASK_PERM_NETWORK: '0',
        TASK_PERM_FILESYSTEM: '0'
      })
      expect(stdout).toContain('THREW:ERR_PERMISSION_DENIED')
    })
  })

  // describe: 网络权限启用场景（TASK_PERM_NETWORK=1）
  describe('when TASK_PERM_NETWORK=1', () => {
    it('http.request does NOT throw synchronously (permission granted)', async () => {
      // 用例：网络权限已启用时 http.request 不抛出异常
      // Use an invalid host so the request fails fast; we only check
      // that the function itself doesn't throw synchronously.
      const script = `try { const r = require('http').request('http://127.0.0.1:1'); r.on('error', () => {}); r.end(); console.log('OK'); } catch (e) { console.log('THREW:' + e.code); }`
      const { stdout } = await runChild(script, {
        TASK_PERM_NETWORK: '1',
        TASK_PERM_FILESYSTEM: '0'
      })
      expect(stdout).toContain('OK')
    })
  })

  // describe: 文件系统权限禁用场景（TASK_PERM_FILESYSTEM=0）
  describe('when TASK_PERM_FILESYSTEM=0', () => {
    it('fs.readFileSync throws ERR_PERMISSION_DENIED', async () => {
      // 用例：fs.readFileSync 在文件系统权限禁用时抛出 ERR_PERMISSION_DENIED
      const script = `try { require('fs').readFileSync('/etc/hostname'); console.log('NO_THROW'); } catch (e) { console.log('THREW:' + e.code); }`
      const { stdout } = await runChild(script, {
        TASK_PERM_NETWORK: '1',
        TASK_PERM_FILESYSTEM: '0'
      })
      expect(stdout).toContain('THREW:ERR_PERMISSION_DENIED')
    })

    it('fs.writeFileSync throws ERR_PERMISSION_DENIED', async () => {
      // 用例：fs.writeFileSync 在文件系统权限禁用时抛出 ERR_PERMISSION_DENIED
      const script = `try { require('fs').writeFileSync('/tmp/should-not-exist.txt', 'x'); console.log('NO_THROW'); } catch (e) { console.log('THREW:' + e.code); }`
      const { stdout } = await runChild(script, {
        TASK_PERM_NETWORK: '1',
        TASK_PERM_FILESYSTEM: '0'
      })
      expect(stdout).toContain('THREW:ERR_PERMISSION_DENIED')
    })

    it('fs.promises.readFile rejects with ERR_PERMISSION_DENIED', async () => {
      // 用例：fs.promises.readFile 在文件系统权限禁用时拒绝并返回 ERR_PERMISSION_DENIED
      const script = `require('fs').promises.readFile('/etc/hostname').then(() => console.log('NO_THROW')).catch(e => console.log('REJECTED:' + e.code))`
      const { stdout } = await runChild(script, {
        TASK_PERM_NETWORK: '1',
        TASK_PERM_FILESYSTEM: '0'
      })
      expect(stdout).toContain('REJECTED:ERR_PERMISSION_DENIED')
    })
  })

  // describe: 真实入口文件执行（模块加载器兼容性回归）
  // 背景：enforcer 现在真正进入构建产物并被 NODE_OPTIONS 加载。Node 的模块加载器
  // 会通过公开 fs API 读取入口脚本/require 的文件；若在无 filesystem 权限时把这些
  // 读取也一并拒绝，任务会在启动阶段崩溃。此用例用真实文件入口覆盖该回归。
  describe('real entry file under enforcement', () => {
    it('starts the entry file and permits reading its own directory only', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'sandbox-entry-'))
      try {
        writeFileSync(join(dir, 'data.txt'), 'sibling-ok')
        writeFileSync(
          join(dir, 'entry.js'),
          [
            "const fs = require('fs')",
            "let inside = 'READ_FAIL'",
            "try { inside = fs.readFileSync(require('path').join(__dirname, 'data.txt'), 'utf-8') } catch (e) { inside = 'THREW:' + e.code }",
            "let outside = 'NO_THROW'",
            "try { fs.readFileSync('/etc/hostname'); } catch (e) { outside = 'THREW:' + e.code }",
            "console.log(inside + '|' + outside)"
          ].join('\n')
        )
        const result = await runEntry(join(dir, 'entry.js'), dir, {
          TASK_PERM_NETWORK: '0',
          TASK_PERM_FILESYSTEM: '0',
          TASK_CWD_RESOLVED: dir
        })
        expect(result.stdout).toContain('sibling-ok')
        expect(result.stdout).toContain('THREW:ERR_PERMISSION_DENIED')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  // describe: 绕过标志场景（TASK_PERM_BYPASS=1，禁用所有强制补丁）
  describe('when TASK_PERM_BYPASS=1', () => {
    it('no patches applied — http.request does not throw synchronously', async () => {
      // 用例：BYPASS 标志启用时所有补丁被跳过，http.request 正常执行不抛出
      const script = `try { const r = require('http').request('http://127.0.0.1:1'); r.on('error', () => {}); r.end(); console.log('OK'); } catch (e) { console.log('THREW:' + e.code); }`
      const { stdout } = await runChild(script, {
        TASK_PERM_NETWORK: '0',
        TASK_PERM_FILESYSTEM: '0',
        TASK_PERM_BYPASS: '1'
      })
      expect(stdout).toContain('OK')
    })
  })
})
