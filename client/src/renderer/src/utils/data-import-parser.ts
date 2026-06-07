/**
 * @file 数据批量导入解析器
 * @description CSV/JSON 解析、类型智能检测、数据校验。
 * @module renderer/utils
 */

import type { Template } from '../types'

/* ═══════════════════════════════════════════
   Types
   ═══════════════════════════════════════════ */

export type DetectableType = 'account' | 'proxy' | 'captcha' | 'unknown'

export interface ParsedRow {
  index: number
  raw: Record<string, string>
  detectedType: DetectableType
  errors: string[]
}

export interface ParseResult {
  rows: ParsedRow[]
  totalLines: number
  parseErrors: string[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/* ═══════════════════════════════════════════
   CSV Parsing
   ═══════════════════════════════════════════ */

/**
 * Parse CSV text into an array of row objects.
 * Handles quoted fields (with embedded commas and newlines).
 * First row is header.
 */
export function parseCSV(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  const normalized = text.trim()
  if (!normalized) return rows

  const lines = splitCSVLines(normalized)
  if (lines.length < 2) return rows

  const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase())
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = j < values.length ? values[j].trim() : ''
    }
    if (Object.values(row).some((v) => v !== '')) {
      rows.push(row)
    }
  }

  return rows
}

/**
 * Split CSV content into logical lines, respecting quoted fields
 * that contain embedded newlines.
 */
function splitCSVLines(text: string): string[] {
  const lines: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      inQuotes = !inQuotes
      current += ch
    } else if (ch === '\n' && !inQuotes) {
      lines.push(current)
      current = ''
    } else if (ch === '\r' && !inQuotes) {
      // skip \r
    } else {
      current += ch
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Parse a single CSV line into an array of field values.
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  fields.push(current)
  return fields
}

/* ═══════════════════════════════════════════
   JSON Parsing
   ═══════════════════════════════════════════ */

/**
 * Parse a JSON text into an array of objects.
 * Returns the array or throws with a descriptive message.
 */
export function parseJSON(text: string): Record<string, unknown>[] {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('JSON 文本为空')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    throw new Error(`无效 JSON: ${(err as Error).message}`)
  }

  if (!Array.isArray(parsed)) {
    throw new Error('JSON 顶层必须是数组')
  }

  if (parsed.length === 0) {
    throw new Error('JSON 数组为空')
  }

  for (let i = 0; i < parsed.length; i++) {
    if (typeof parsed[i] !== 'object' || parsed[i] === null) {
      throw new Error(`第 ${i + 1} 项不是有效对象`)
    }
  }

  return parsed as Record<string, unknown>[]
}

/* ═══════════════════════════════════════════
   Type Detection
   ═══════════════════════════════════════════ */

/** Column name aliases mapping to canonical names */
const COLUMN_ALIASES: Record<string, string[]> = {
  protocol: ['protocol', '代理协议'],
  host: ['host', '代理host', '代理主机', '地址', '主机'],
  port: ['port', '端口', '代理端口'],
  username: ['username', '用户', '用户名', '代理用户名'],
  password: ['password', '密码', '代理密码'],
  format: ['format', '类型', '格式', '代理类型'],
  provider: ['provider', '提供商', '服务商', 'captchaprovider'],
  apiKey: ['apikey', 'api_key', 'key', '密钥', 'api密钥', 'captchaapikey'],
  templateId: ['templateid', 'template_id', '模板id', '模板'],
  pool: ['pool', '账号池', '池'],
  notes: ['notes', '备注'],
  labels: ['labels', '标签']
}

/**
 * Resolve a column name (case-insensitive) to its canonical form.
 */
function resolveColumn(key: string): string | null {
  const lower = key.toLowerCase().replace(/[\s_-]+/g, '')
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      if (alias.toLowerCase().replace(/[\s_-]+/g, '') === lower) {
        return canonical
      }
    }
  }
  return null
}

/**
 * Map raw row keys to canonical column names.
 */
export function normalizeColumns(row: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(row)) {
    const canonical = resolveColumn(key)
    if (canonical) {
      // Don't overwrite existing canonical value
      if (!(canonical in out) || out[canonical] === '') {
        out[canonical] = value
      }
    } else {
      // Keep original key if no mapping
      out[key] = value
    }
  }
  return out
}

/**
 * Detect the type of a single data row based on field names.
 * For JSON objects, also respects an explicit `type` field.
 */
export function detectType(row: Record<string, unknown>): DetectableType {
  // Explicit type field (for mixed tab)
  if (typeof row.type === 'string') {
    const t = row.type.toLowerCase().trim()
    if (t === 'account') return 'account'
    if (t === 'proxy') return 'proxy'
    if (t === 'captcha') return 'captcha'
  }

  const keys = Object.keys(row).map((k) => k.toLowerCase())
  const keySet = new Set(keys)

  // Check for proxy fields
  const hasPort = keySet.has('port') || keySet.has('端口')
  const hasHost = keySet.has('host') || keySet.has('代理host') || keySet.has('地址') || keySet.has('主机') || keySet.has('代理主机')
  const hasProtocol = keySet.has('protocol') || keySet.has('代理协议')

  // Check for captcha fields
  const hasProvider = keySet.has('provider') || keySet.has('提供商') || keySet.has('服务商')
  const hasApiKey = keySet.has('apikey') || keySet.has('api_key') || keySet.has('密钥') || keySet.has('api密钥') || keySet.has('key')

  // Check for account fields
  const hasTemplateId = keySet.has('templateid') || keySet.has('template_id') || keySet.has('模板id')

  if (hasProvider && hasApiKey && !hasPort && !hasHost) return 'captcha'
  if (hasPort && hasHost) return 'proxy'
  if (hasProtocol && hasHost) return 'proxy'
  if (hasTemplateId) return 'account'

  return 'unknown'
}

/* ═══════════════════════════════════════════
   Validation
   ═══════════════════════════════════════════ */

/**
 * Validate an account row against a template schema.
 */
export function validateAccount(
  row: Record<string, unknown>,
  schemas: Template[]
): ValidationResult {
  const errors: string[] = []

  const templateId = typeof row.templateId === 'string' ? row.templateId.trim() : String(row.templateId ?? '')
  if (!templateId) {
    errors.push('缺少 templateId')
    return { valid: false, errors }
  }

  const template = schemas.find((t) => t.id === templateId)
  if (!template) {
    errors.push(`模板 "${templateId}" 未找到`)
    return { valid: false, errors }
  }

  // Basic schema validation: check required fields
  const schema = template.schema as Record<string, unknown>
  if (schema && typeof schema === 'object') {
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : []
    const properties = (schema.properties as Record<string, unknown>) ?? {}

    const data = (row.data as Record<string, unknown>) ?? row

    for (const field of required) {
      const value = data[field]
      if (value === undefined || value === null || value === '') {
        const propDef = properties[field] as Record<string, unknown> | undefined
        const title = propDef?.title ?? field
        errors.push(`缺少必填字段: ${String(title)}`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate a proxy row.
 * Required: protocol, host, port
 */
export function validateProxy(row: Record<string, unknown>): ValidationResult {
  const errors: string[] = []

  const protocol = String(row.protocol ?? '').toLowerCase().trim()
  if (!protocol) {
    errors.push('缺少 protocol（代理协议）')
  } else if (!['http', 'https', 'socks5', 'ws'].includes(protocol)) {
    errors.push(`无效 protocol: ${protocol}（支持 http/https/socks5/ws）`)
  }

  const host = String(row.host ?? '').trim()
  if (!host) {
    errors.push('缺少 host（主机地址）')
  }

  const portRaw = row.port
  if (portRaw === undefined || portRaw === null || String(portRaw).trim() === '') {
    errors.push('缺少 port（端口）')
  } else {
    const port = Number(portRaw)
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push(`无效 port: ${portRaw}（需为 1-65535）`)
    }
  }

  const format = String(row.format ?? 'manual').toLowerCase().trim() as 'manual' | 'api' | 'ip' | 'ws'
  if (!['manual', 'api', 'ip', 'ws'].includes(format)) {
    errors.push(`无效 format: ${format}（支持 manual/api/ip/ws）`)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate a captcha key row.
 * Required: provider, apiKey
 */
export function validateCaptcha(row: Record<string, unknown>): ValidationResult {
  const errors: string[] = []

  const provider = String(row.provider ?? '').trim()
  if (!provider) {
    errors.push('缺少 provider（服务商名称）')
  }

  const apiKey = String(row.apiKey ?? '').trim()
  if (!apiKey) {
    errors.push('缺少 apiKey（API 密钥）')
  }

  const balanceRaw = row.balance
  if (balanceRaw !== undefined && balanceRaw !== null && String(balanceRaw).trim() !== '') {
    const balance = Number(balanceRaw)
    if (isNaN(balance) || balance < 0) {
      errors.push(`无效 balance: ${balanceRaw}（需为非负数）`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/* ═══════════════════════════════════════════
   Unified Parse
   ═══════════════════════════════════════════ */

/**
 * Parse raw text (CSV or JSON) into structured rows with type detection and validation.
 * @param text Raw text content
 * @param mode 'csv' | 'json' | 'auto' - auto tries JSON first, then CSV
 * @param expectedType Optional expected type override
 * @param schemas Template schemas for account validation
 */
export function parseImportData(
  text: string,
  mode: 'csv' | 'json' | 'auto' = 'auto',
  expectedType?: DetectableType,
  schemas: Template[] = []
): ParseResult {
  const parseErrors: string[] = []
  let rawRows: Record<string, string>[] = []

  // Try JSON first (for auto/json modes)
  if (mode === 'json' || mode === 'auto') {
    try {
      const parsed = parseJSON(text)
      rawRows = parsed.map((obj) => {
        const row: Record<string, string> = {}
        for (const [key, value] of Object.entries(obj)) {
          row[key] = value === null || value === undefined ? '' : String(value)
        }
        return row
      })
    } catch (err) {
      if (mode === 'json') {
        parseErrors.push((err as Error).message)
        return { rows: [], totalLines: 0, parseErrors }
      }
      // In auto mode, fall through to CSV
    }
  }

  // Try CSV if no JSON rows parsed in auto mode
  if (rawRows.length === 0 && (mode === 'csv' || mode === 'auto')) {
    rawRows = parseCSV(text)
    if (rawRows.length === 0 && mode === 'csv') {
      parseErrors.push('CSV 格式无效或为空')
      return { rows: [], totalLines: 0, parseErrors }
    }
  }

  if (rawRows.length === 0) {
    parseErrors.push('无法解析输入数据（请使用 JSON 数组或 CSV 格式）')
    return { rows: [], totalLines: 0, parseErrors }
  }

  // Normalize columns
  rawRows = rawRows.map(normalizeColumns)

  // Detect type and validate each row
  const rows: ParsedRow[] = rawRows.map((raw, index) => {
    const typedRow: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(raw)) {
      // Try number conversion for numeric fields
      if (key === 'port' || key === 'balance') {
        const num = Number(value)
        typedRow[key] = isNaN(num) ? value : num
      } else {
        typedRow[key] = value
      }
    }

    const detectedType = expectedType ?? detectType(typedRow)
    let validationResult: ValidationResult = { valid: true, errors: [] }

    switch (detectedType) {
      case 'account':
        validationResult = validateAccount(typedRow, schemas)
        break
      case 'proxy':
        validationResult = validateProxy(typedRow)
        break
      case 'captcha':
        validationResult = validateCaptcha(typedRow)
        break
      default:
        validationResult = { valid: false, errors: ['无法识别数据类型'] }
    }

    return {
      index: index + 1,
      raw,
      detectedType,
      errors: validationResult.errors
    }
  })

  return { rows, totalLines: rawRows.length, parseErrors }
}

/**
 * Generate CSV content for a downloadable error report.
 */
export function generateErrorCSV(rows: ParsedRow[]): string {
  const header = '行号,数据类型,原始数据,错误信息'
  const lines = [header]

  for (const row of rows) {
    if (row.errors.length > 0) {
      const rawData = JSON.stringify(row.raw).replace(/"/g, '""')
      const errors = row.errors.join('; ').replace(/"/g, '""')
      lines.push(`${row.index},"${row.detectedType}","${rawData}","${errors}"`)
    }
  }

  return lines.join('\n')
}
