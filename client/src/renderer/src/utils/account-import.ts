import type { Account, Template } from '../types'

export type ParsedAccount = Omit<Account, 'id' | 'createdAt' | 'updatedAt'>

export interface ParseError {
  row: number
  message: string
}

export interface ParseResult {
  valid: ParsedAccount[]
  errors: ParseError[]
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse a JSON string into account entries.
 * Returns both valid entries (with defaults applied) and a list of errors.
 * Invalid rows are still included in `valid` if they have minimal data,
 * but their issues are reported in `errors`.
 */
export function parseAccountImport(raw: string, templates: Template[]): ParseResult {
  const valid: ParsedAccount[] = []
  const errors: ParseError[] = []
  const templateMap = new Map(templates.map((t) => [t.id, t]))

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    errors.push({ row: 0, message: `无效 JSON: ${(err as Error).message}` })
    return { valid, errors }
  }

  if (!Array.isArray(parsed)) {
    errors.push({ row: 0, message: 'JSON 顶层必须是数组' })
    return { valid, errors }
  }

  if (parsed.length === 0) {
    errors.push({ row: 0, message: 'JSON 数组为空' })
    return { valid, errors }
  }

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i]
    const row = i + 1
    const rowErrors: string[] = []

    if (!isPlainObject(item)) {
      errors.push({ row, message: `第 ${row} 行不是对象` })
      continue
    }

    const templateId = typeof item.templateId === 'string' ? item.templateId.trim() : ''
    if (!templateId) {
      rowErrors.push('缺少 templateId')
    } else if (!templateMap.has(templateId)) {
      rowErrors.push(`templateId "${templateId}" 未找到（跳过校验）`)
    }

    const data = isPlainObject(item.data) ? (item.data as Record<string, unknown>) : {}

    const pool = typeof item.pool === 'string' ? item.pool.trim() : 'default'
    if (!pool) {
      // If pool is empty after trim, keep but note it — the consumer will use 'default'
      rowErrors.push('pool 为空，将使用默认值 "default"')
    }

    let labels: string[] = []
    if (item.labels !== undefined && item.labels !== null) {
      if (Array.isArray(item.labels) && item.labels.every((l: unknown) => typeof l === 'string')) {
        labels = item.labels as string[]
      } else {
        rowErrors.push('labels 必须是字符串数组')
      }
    }

    const notes = typeof item.notes === 'string' ? item.notes : ''

    valid.push({ templateId: templateId || '', data, pool: pool || 'default', labels, notes })

    for (const msg of rowErrors) {
      errors.push({ row, message: msg })
    }
  }

  return { valid, errors }
}
