/**
 * @file SDK 示例脚本 — 展示如何通过 stdout JSON 协议与主进程通信
 *
 * 协议见 AGENTS.md 6.3 节。最小可工作示例: 不依赖任何外部包。
 *
 * 用法:
 *   1. 将此目录打包成 zip (包含 manifest.json)
 *   2. 上传到 Marketplace 或本地安装
 *   3. 在 Tasks 页面选择此脚本, 启动任务
 *   4. 主进程 stdout 解析器会:
 *      - JSON log → task_logs 表 + UI 实时日志
 *      - JSON progress → 任务进度条
 *      - 非 JSON 行 (console.log 普通文本) → 也会作为 info 日志
 */

/**
 * 输出结构化日志 (推荐: 用 level + message + 可选 fields)
 */
function sdk(level, message, fields) {
  const obj = { type: 'log', level, message }
  if (fields) obj.fields = fields
  process.stdout.write(JSON.stringify(obj) + '\n')
}

/**
 * 上报任务进度 (0-100)
 */
function progress(percent, message) {
  const obj = { type: 'progress', percent }
  if (message) obj.message = message
  process.stdout.write(JSON.stringify(obj) + '\n')
}

/**
 * 报告最终结果
 */
function result(ok, data, error) {
  const obj = { type: 'result', ok }
  if (data) obj.data = data
  if (error) obj.error = error
  process.stdout.write(JSON.stringify(obj) + '\n')
}

async function main() {
  sdk('info', 'SDK 示例脚本启动', { version: '1.0.0' })
  progress(0, '初始化')

  // 模拟工作循环
  const steps = [
    { pct: 20, msg: '加载配置' },
    { pct: 40, msg: '准备账户' },
    { pct: 60, msg: '执行任务' },
    { pct: 80, msg: '等待响应' },
    { pct: 100, msg: '完成' }
  ]
  for (const step of steps) {
    await new Promise((r) => setTimeout(r, 200))
    sdk('info', step.msg, { percent: step.pct })
    progress(step.pct, step.msg)
  }

  // 报告结果
  result(true, { processed: 42, success: 42, failed: 0 })
  sdk('info', '脚本结束')
}

main().catch((err) => {
  // 错误也走结构化通道
  sdk('error', err.message, { stack: err.stack })
  result(false, undefined, err.message)
  process.exit(1)
})
