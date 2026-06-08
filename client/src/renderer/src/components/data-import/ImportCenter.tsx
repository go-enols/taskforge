/**
 * @file ImportCenter — 批量导入中心
 * @description 统一入口，支持账户/代理/验证码/混合数据的 CSV/JSON 导入。
 *              含智能类型检测、预览、分批导入和错误报告导出。
 * @module renderer/components/data-import
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Users, Globe, Key, Layers, Download
} from 'lucide-react'
import FileDropzone from './FileDropzone'
import type { FileInfo } from './FileDropzone'
import ImportPreviewTable from './ImportPreviewTable'
import {
  parseImportData,
  generateErrorCSV,
  type DetectableType,
  type ParsedRow
} from '../../utils/data-import-parser'
import { scriptParamApi, proxyApi, captchaKeyApi, templateApi, dialogApi } from '../../api'
import type { Template } from '../../types'

/* ═══════════════════════════════════════════
   Types
   ═══════════════════════════════════════════ */

type ImportTab = 'account' | 'proxy' | 'captcha' | 'mixed'

interface TabDef {
  key: ImportTab
  icon: typeof Users
  labelKey: string
  expectedType?: DetectableType
  acceptFormats: string[]
}

const TABS: TabDef[] = [
  {
    key: 'account',
    icon: Users,
    labelKey: 'data.import.accountTab',
    expectedType: 'scriptParam',
    acceptFormats: ['.json', '.txt']
  },
  {
    key: 'proxy',
    icon: Globe,
    labelKey: 'data.import.proxyTab',
    expectedType: 'proxy',
    acceptFormats: ['.csv', '.json', '.txt']
  },
  {
    key: 'captcha',
    icon: Key,
    labelKey: 'data.import.captchaTab',
    expectedType: 'captcha',
    acceptFormats: ['.json', '.txt']
  },
  {
    key: 'mixed',
    icon: Layers,
    labelKey: 'data.import.mixedTab',
    acceptFormats: ['.json', '.txt']
  }
]

interface ImportResult {
  success: number
  failed: number
  errors: Array<{ index: number; message: string }>
}

/* ═══════════════════════════════════════════
   Batch size
   ═══════════════════════════════════════════ */

const BATCH_SIZE = 50

/* ═══════════════════════════════════════════
   ImportCenter
   ═══════════════════════════════════════════ */

export default function ImportCenter(): React.ReactElement {
  const { t } = useTranslation()

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<ImportTab>('account')
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [schemas, setSchemas] = useState<Template[]>([])
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const progressRef = useRef<ImportResult | null>(null)

  /* ── Load schemas on mount ── */
  useEffect(() => {
    templateApi.list().then((res) => {
      if (res?.items) {
        setSchemas(res.items)
      }
    }).catch(() => { /* ignore */ })
  }, [])

  /* ── File content handler ── */
  const handleFileContent = useCallback((content: string, fileName: string) => {
    if (!content || !fileName) {
      setFileError(t('data.import.errorFileRead'))
      return
    }

    setFileInfo({
      name: fileName,
      size: new Blob([content]).size,
      type: fileName === '粘贴输入' ? 'paste' : 'file'
    })
    setFileError(null)
    setImportResult(null)

    // Determine parse mode
    const isJSON = fileName.toLowerCase().endsWith('.json') || fileName === '粘贴输入'
    const tab = TABS.find((t) => t.key === activeTab)!
    const mode: 'csv' | 'json' | 'auto' = tab.key === 'mixed' ? 'auto' : (isJSON ? 'json' : 'csv')

    const result = parseImportData(content, mode, tab.expectedType, schemas)

    if (result.parseErrors.length > 0) {
      setFileError(result.parseErrors.join('; '))
      setParsedRows([])
      setParseErrors(result.parseErrors)
      return
    }

    setParsedRows(result.rows)
    setParseErrors([])
  }, [activeTab, schemas, t])

  /* ── Clear handler ── */
  const handleClear = useCallback(() => {
    setFileInfo(null)
    setFileError(null)
    setParsedRows([])
    setParseErrors([])
    setImportResult(null)
    setImportProgress(0)
  }, [])

  /* ── Tab change ── */
  const handleTabChange = useCallback((tab: ImportTab) => {
    setActiveTab(tab)
    handleClear()
  }, [handleClear])

  /* ── Import execution ── */
  const handleImport = useCallback(async () => {
    if (parsedRows.length === 0 || importing) return

    setImporting(true)
    setImportProgress(0)
    const result: ImportResult = { success: 0, failed: 0, errors: [] }
    progressRef.current = result

    const tab = TABS.find((t) => t.key === activeTab)!

    const total = parsedRows.length
    // Only import valid rows
    const validRows = parsedRows.filter((r) => r.errors.length === 0)

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE)

      for (const row of batch) {
        try {
          await importRow(row, tab.expectedType ?? row.detectedType)
          result.success++
        } catch (err) {
          result.failed++
          result.errors.push({
            index: row.index,
            message: (err as Error).message || '未知错误'
          })
        }
      }

      // Update progress
      setImportProgress(Math.min(Math.round(((i + batch.length) / total) * 100), 100))

      // Update ref for async access
      progressRef.current = { ...result }
    }

    setImporting(false)
    progressRef.current = null
    setImportResult(result)
  }, [parsedRows, importing, activeTab])

  /* ── Download error report ── */
  const handleDownloadErrors = useCallback(async () => {
    if (!importResult || importResult.errors.length === 0) return

    const csv = generateErrorCSV(
      parsedRows.filter((r) => importResult.errors.some((e) => e.index === r.index))
    )
    await dialogApi.saveFile('import-errors.csv', csv)
  }, [importResult, parsedRows])

  /* ── Count valid rows ── */
  const validCount = parsedRows.filter((r) => r.errors.length === 0).length
  const cannotImport = parsedRows.length === 0 || validCount === 0 || importing

  /* ── Tab definition ── */
  const currentTab = TABS.find((t) => t.key === activeTab)!

  return (
    <div className="bg-bg-card border border-border-light rounded-xl overflow-hidden">
      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-0">
        <h2 className="text-lg font-semibold text-text-primary">{t('data.import.title')}</h2>
        <p className="text-sm text-text-muted mt-1">{t('data.import.subtitle')}</p>
      </div>

      {/* ── Sub-tabs ── */}
      <div className="flex gap-1 px-6 pt-4 border-b border-border-light">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-[1px] border-b-2 ${
                activeTab === tab.key
                  ? 'text-primary border-primary bg-primary/5'
                  : 'text-text-muted border-transparent hover:text-text-secondary'
              }`}
            >
              <Icon size={15} />
              {t(tab.labelKey)}
            </button>
          )
        })}
      </div>

      {/* ── Body ── */}
      <div className="p-6 space-y-4">
        {/* File Dropzone */}
        <FileDropzone
          onFileContent={handleFileContent}
          onClear={handleClear}
          currentFile={fileInfo}
          error={fileError}
          acceptExtensions={currentTab.acceptFormats}
        />

        {/* Preview Table */}
        {parsedRows.length > 0 && (
          <ImportPreviewTable rows={parsedRows} />
        )}

        {/* Parse errors */}
        {parseErrors.length > 0 && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
            {parseErrors.map((err, i) => (
              <p key={i} className="text-sm text-red-600">{err}</p>
            ))}
          </div>
        )}

        {/* Import progress bar */}
        {importing && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">{t('data.import.importing')}</span>
              <span className="text-text-primary font-medium">{importProgress}%</span>
            </div>
            <div className="w-full bg-bg-page rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${importProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div className={`px-4 py-3 rounded-lg border ${
            importResult.failed === 0
              ? 'bg-green-50 border-green-200'
              : 'bg-yellow-50 border-yellow-200'
          }`}>
            <p className="text-sm font-medium">
              {importResult.failed === 0
                ? t('data.import.success', { count: importResult.success })
                : t('data.import.partialSuccess', {
                    success: importResult.success,
                    failed: importResult.failed
                  })}
            </p>
            {importResult.errors.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto space-y-1">
                {importResult.errors.slice(0, 5).map((err, i) => (
                  <p key={i} className="text-xs text-red-600">
                    #{err.index}: {err.message}
                  </p>
                ))}
                {importResult.errors.length > 5 && (
                  <p className="text-xs text-text-muted">
                    ...以及其他 {importResult.errors.length - 5} 条错误
                  </p>
                )}
              </div>
            )}
            {importResult.errors.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadErrors}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-primary hover:text-primary/80 bg-white border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
              >
                <Download size={14} />
                {t('data.import.downloadErrors')}
              </button>
            )}
          </div>
        )}

        {/* Import button */}
        <div className="flex items-center justify-between pt-2 border-t border-border-light">
          <p className="text-sm text-text-muted">
            {parsedRows.length > 0
              ? t('data.import.parsedRows', { count: parsedRows.length })
              : t('data.import.noData')}
          </p>
          <button
            type="button"
            onClick={handleImport}
            disabled={cannotImport}
            className="px-6 py-2.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing
              ? t('data.import.importing')
              : t('data.import.importButton', { count: validCount })}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   Row import helper
   ═══════════════════════════════════════════ */

async function importRow(
  row: ParsedRow,
  detectedType: DetectableType
): Promise<void> {
  switch (detectedType) {
    case 'scriptParam': {
      const data = (() => {
        try {
          return typeof row.raw.data === 'string' ? JSON.parse(row.raw.data) : {}
        } catch {
          return {}
        }
      })()
      await scriptParamApi.batchCreate([
        {
          templateId: row.raw.templateid || row.raw.templateId || '',
          data: data as Record<string, unknown>,
          pool: row.raw.pool || 'default',
          labels: parseLabels(row.raw.labels),
          notes: row.raw.notes || ''
        }
      ])
      break
    }
    case 'proxy': {
      await proxyApi.create({
        protocol: (row.raw.protocol || 'http') as 'http' | 'https' | 'socks5' | 'ws',
        host: row.raw.host || '',
        port: Number(row.raw.port) || 0,
        username: row.raw.username || null,
        password: row.raw.password || null,
        status: 'active',
        format: (row.raw.format || 'manual') as 'manual' | 'api' | 'ip' | 'ws',
        labels: parseLabels(row.raw.labels)
      })
      break
    }
    case 'captcha': {
      await captchaKeyApi.create({
        provider: row.raw.provider || '',
        apiKey: row.raw.apikey || row.raw.apiKey || '',
        balance: Number(row.raw.balance) || 0
      })
      break
    }
    default:
      throw new Error('无法识别的数据类型')
  }
}

/**
 * Parse labels from raw string.
 * Supports comma-separated or JSON array.
 */
function parseLabels(raw: string | undefined): string[] {
  if (!raw || raw.trim() === '') return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {
    // Not JSON, try comma-separated
  }
  return raw.split(',').map((s) => s.trim()).filter(Boolean)
}
