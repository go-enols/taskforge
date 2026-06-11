import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Code,
  List,
  Upload,
  BookOpen,
  FilePlus,
  FileBox,
  Code2,
  ArrowRight,
  FileText,
  FolderOpen,
  FileArchive,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Clock,
  Zap,
  MessageSquare,
  Pencil,
  Trash2,
  X,
  Copy,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { fileApi, zipApi, serverApi, getMarketplaceUrl, getMarketplaceHeaders, dialogApi, marketplaceApi } from '../api'
import { call } from '../transport'
import { toast } from '../utils/toast'
import { useAuth } from '../contexts/AuthContext'
import type { RemoteScript, RemoteTemplate } from '../types'
import TemplateEditor from './TemplateEditor'
import ProjectTemplates from './ProjectTemplates'

function validateManifest(manifest: Record<string, unknown>): string[] {
  const required = ['id', 'name', 'version', 'description', 'entryPoint', 'runtime', 'schema']
  const missing = required.filter((f) => !manifest[f])
  const warnings: string[] = []
  if (manifest.runtime && manifest.runtime !== 'node')
    warnings.push('runtime should be "node"')
  if (manifest.schema && typeof manifest.schema === 'object' && !Array.isArray(manifest.schema)) {
    const s = manifest.schema as Record<string, unknown>
    if (s.type !== 'object') warnings.push('schema.type should be "object"')
  }
  return [...missing.map((m) => `Missing: ${m}`), ...warnings]
}

type UploadStatus = 'idle' | 'zipping' | 'uploading' | 'success' | 'error'
type DevTab = 'scaffold' | 'pending' | 'myscripts' | 'sdk' | 'scriptParam' | 'project'

export default function DeveloperCenter() {
  const { t } = useTranslation()
  const { user, isDeveloper } = useAuth()

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<DevTab>('scaffold')

  // ─────────────────────────────────────────────
  // Tab 1: 项目脚手架 (QuickDev)
  // ─────────────────────────────────────────────
  const [folderPath, setFolderPath] = useState('')
  const [manifestContent, setManifestContent] = useState<string | null>(null)
  const [hasManifest, setHasManifest] = useState(false)
  /** Editable version override for the folder upload. Pre-filled from manifest.json,
   *  but the user can edit before upload (useful for hotfixes / version bump without
   *  rewriting the source manifest). */
  const [uploadVersion, setUploadVersion] = useState('')
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [uploadError, setUploadError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)

  // IPC progress events from main process upload
  useEffect(() => {
    const unsub = window.electronAPI?.on?.('upload:progress', (pct: unknown) => {
      setUploadProgress(Number(pct) || 0)
    })
    return () => { unsub?.() }
  }, [])

  const [zipPath, setZipPath] = useState('')
  const [zipManifest, setZipManifest] = useState<string | null>(null)
  const [validationResults, setValidationResults] = useState<string[]>([])

  const [projectMeta, setProjectMeta] = useState({
    id: '', name: '', version: '1.0.0', desc: '', entry: 'index.js',
    tags: '', changelog: '',
    permNetwork: false, permFilesystem: false,
  })
  const [schemaProps, setSchemaProps] = useState<Array<{ key: string; type: string; label: string; required: boolean }>>([])
  const [newProp, setNewProp] = useState({ key: '', type: 'string', label: '', required: false })
  const [projectStep, setProjectStep] = useState(0)
  const [projectFolder, setProjectFolder] = useState('')
  const [generating, setGenerating] = useState(false)
  const [availableTemplates, setAvailableTemplates] = useState<{id: string, name: string, type: string}[]>([])
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([])
  const [showDemoPanel, setShowDemoPanel] = useState(false)
  const [demoConfigContent, setDemoConfigContent] = useState('')

  const loadTemplates = async () => {
    try {
      const url = await getMarketplaceUrl()
      const headers = await getMarketplaceHeaders()
      const resp = await fetch(`${url}/api/templates?all=true`, { headers })
      const data = await resp.json()
      const items = (data.data?.items || []) as {id: string, name: string, type: string}[]
      setAvailableTemplates(items)
    } catch (err) {
      console.error('[DeveloperCenter] Failed to load templates:', err)
    }
  }

  const toggleTemplate = (id: string) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  const addSchemaProp = () => {
    const k = newProp.key.trim()
    if (!k || schemaProps.some((p) => p.key === k)) return
    setSchemaProps((prev) => [...prev, { ...newProp, key: k }])
    setNewProp({ key: '', type: 'string', label: '', required: false })
  }

  const removeSchemaProp = (key: string) => {
    setSchemaProps((prev) => prev.filter((p) => p.key !== key))
  }

  const parseManifest = (raw: string): Record<string, unknown> => {
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    return JSON.parse(stripped)
  }

  const buildManifestJson5 = (m: Record<string, unknown>): string => {
    return JSON.stringify(
      {
        id: m.id,
        name: m.name,
        version: m.version,
        description: m.description,
        entryPoint: m.entryPoint,
        runtime: m.runtime,
        permissions: m.permissions,
        tags: m.tags,
        changelog: m.changelog,
        dataRequirements: m.dataRequirements,
        schema: m.schema
      },
      null,
      2
    )
  }

  const initProject = async () => {
    if (!projectMeta.id.trim() || !projectMeta.name.trim()) return
    setGenerating(true)
    try {
      const folder = await fileApi.selectFolder()
      if (folder.canceled || !folder.folderPath) { setGenerating(false); return }
      const dir = folder.folderPath

      const properties: Record<string, Record<string, unknown>> = {}
      const requiredFields: string[] = []
      for (const prop of schemaProps) {
        const propDef: Record<string, unknown> = { type: prop.type, title: prop.label || prop.key }
        if (prop.type === 'number') propDef.default = 0
        if (prop.type === 'boolean') propDef.default = false
        properties[prop.key] = propDef
        if (prop.required) requiredFields.push(prop.key)
      }

      const permissions: string[] = []
      if (projectMeta.permNetwork) permissions.push('network')
      if (projectMeta.permFilesystem) permissions.push('filesystem')

      const tags = projectMeta.tags.trim()
        ? projectMeta.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : []

      const manifest: Record<string, unknown> = {
        id: projectMeta.id.trim(),
        name: projectMeta.name.trim(),
        version: projectMeta.version.trim() || '1.0.0',
        description: projectMeta.desc.trim(),
        entryPoint: projectMeta.entry.trim() || 'index.js',
        runtime: 'node',
        permissions,
        tags,
        changelog: projectMeta.changelog.trim(),
        dataRequirements: selectedTemplateIds.map((id: string) => ({
          key: id.replace(/[^a-zA-Z0-9]/g, '_'),
          label: id,
          templateType: id,
          min: 1,
          max: -1,
          source: 'script_param'
        })),
        schema: {
          type: 'object',
          properties,
          ...(requiredFields.length > 0 ? { required: requiredFields } : {})
        }
      }

      const templateComment = selectedTemplateIds.length > 0
        ? `\n// Account templates: ${selectedTemplateIds.join(', ')}`
        : ''
      const permComment = permissions.length > 0
        ? `\n// Permissions: ${permissions.join(', ')}`
        : ''
      const indexPath = `${dir}/${projectMeta.entry.trim() || 'index.js'}`
      const schemaFieldsNote = schemaProps.length > 0
        ? `\n// Schema params: ${schemaProps.map((p) => p.key).join(', ')}`
        : ''
      const entryCode = `// ${projectMeta.name.trim() || 'Script'}${templateComment}${permComment}${schemaFieldsNote}
// Runtime detection
const path = require('path')
const fs = require('fs')
const isTaskForge = !!process.env.TASK_ID

// Load config from TaskForge env or local demo file
let config, wallets, accounts
if (isTaskForge) {
  config = JSON.parse(process.env.TASK_CONFIG || '{}')
  wallets = JSON.parse(process.env.TASK_DATA_WALLETS || '[]')
  accounts = JSON.parse(process.env.TASK_DATA_ACCOUNTS || '[]')
} else {
  const demoPath = path.join(__dirname, 'demo-config.json')
  if (fs.existsSync(demoPath)) {
    const demo = JSON.parse(fs.readFileSync(demoPath, 'utf-8'))
    config = demo.config || {}
    wallets = demo.wallets || []
    accounts = demo.accounts || []
    console.log('[demo] Running in standalone mode with demo data')
  } else {
    console.warn('[demo] No demo-config.json found, using empty data')
    config = {}
    wallets = []
    accounts = []
  }
}

console.log('[script] started with config:', JSON.stringify(config))

// ── 权限自检（由 TaskForge 注入）──
const canNetwork = isTaskForge ? process.env.TASK_PERM_NETWORK === '1' : true
const canFilesystem = isTaskForge ? process.env.TASK_PERM_FILESYSTEM === '1' : true
const isSandbox = isTaskForge ? process.env.TASK_SANDBOX === '1' : false
if (isSandbox) {
  console.warn('[script] Running in sandbox mode — network and filesystem access disabled')
}

// ── 读取钱包数据（由 TaskForge 注入）──
if (wallets.length > 0) {
  console.log('[script] loaded', wallets.length, 'wallet(s)')
}

// ── 读取账户数据（由 TaskForge 注入）──
if (accounts.length > 0) {
  console.log('[script] loaded', accounts.length, 'account(s)')
}

// TODO: add your script logic here
`
      const schemaSection = schemaProps.length > 0
        ? `\n## Schema Params\n\n${schemaProps.map((p) => `| \`${p.key}\` | ${p.type} | ${p.label || '-'} | ${p.required ? 'Yes' : 'No'} |`).join('\n')}`
        : ''
      const readme = `# ${projectMeta.name.trim() || 'Script'}

${projectMeta.desc.trim() || 'Task script for TaskForge'}

## Permissions

${permissions.length > 0 ? permissions.map((p) => `- \`${p}\``).join('\n') : '(none declared — all denied by default)'}
${schemaSection}
## Environment Variables

| Variable | Description |
|----------|-------------|
| \`TASK_CONFIG\` | 任务配置 JSON |
| \`TASK_WALLETS\` | 钱包列表 JSON（address, privateKey, mnemonic, walletType）|
| \`TASK_SCRIPT_PARAMS\` | 匹配的脚本参数数据 JSON |
| \`TASK_PERM_NETWORK\` | 网络权限 "1" 或 "0" |
| \`TASK_PERM_FILESYSTEM\` | 文件系统权限 "1" 或 "0" |
| \`TASK_SANDBOX\` | 沙箱模式 "1" 或 "0" |

## Usage

Install via TaskForge marketplace, then create a task using this script.
`
      const manifestJson5 = buildManifestJson5(manifest)
      await fileApi.writeFile(`${dir}/manifest.json`, manifestJson5)
      await fileApi.writeFile(indexPath, entryCode)
      // Generate demo config for standalone testing
      const demoConfigData: Record<string, unknown> = {}
      for (const prop of schemaProps) {
        if (prop.type === 'string') demoConfigData[prop.key] = `${prop.label || prop.key}_示例值`
        else if (prop.type === 'number') demoConfigData[prop.key] = 0
        else if (prop.type === 'boolean') demoConfigData[prop.key] = false
        else demoConfigData[prop.key] = ''
      }
      const demoConfigJsonContent = JSON.stringify({
        config: demoConfigData,
        wallets: [],
        accounts: []
      }, null, 2)
      await fileApi.writeFile(`${dir}/demo-config.json`, demoConfigJsonContent)
      setDemoConfigContent(demoConfigJsonContent)
      setShowDemoPanel(true)
      await fileApi.writeFile(`${dir}/README.md`, readme)
      setProjectFolder(dir)
      setProjectStep(2)
      toast.success('项目已初始化')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '初始化失败')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSelectFolder() {
    const result = await fileApi.selectFolder()
    if (result.canceled || !result.folderPath) return

    setFolderPath(result.folderPath)
    setUploadStatus('idle')
    setUploadError('')
    setUploadVersion('')
    setZipPath('')
    setZipManifest(null)
    setValidationResults([])

    const manifestPath = `${result.folderPath}/manifest.json`
    const exists = await fileApi.exists(manifestPath)
    setHasManifest(exists)

    if (exists) {
      try {
        const readResult = await fileApi.readFile(manifestPath)
        if (readResult.success && readResult.content) {
          setManifestContent(readResult.content)
          // Pre-fill uploadVersion from manifest so the user can override
          try {
            const m = parseManifest(readResult.content)
            if (m.version) setUploadVersion(String(m.version))
          } catch { /* keep empty */ }
        }
      } catch {
        setManifestContent(null)
      }
    } else {
      setManifestContent(null)
    }
  }

  async function handleUpload() {
    if (!folderPath) return

    const folderName = folderPath.split(/[/\\]/).pop() || 'script'

    if (!hasManifest) {
      const basicManifest = {
        id: `com.dev.${folderName}`,
        name: folderName,
        version: '1.0.0',
        description: '',
        entryPoint: 'index.js',
        runtime: 'node',
        permissions: [],
        tags: [],
        changelog: '',
        dataRequirements: [],
        schema: { type: 'object', properties: {} }
      }
      const json = JSON.stringify(basicManifest, null, 2)
      await fileApi.writeFile(`${folderPath}/manifest.json`, json)
      setHasManifest(true)
      setManifestContent(json)
    }

    setUploadStatus('zipping')
    setUploadProgress(0)
    try {
      const zipName = `${folderName}-${Date.now()}.zip`
      const tmpZipPath = `${await call<string>('app:getTempDir')}/${zipName}`
      const zipResult = await zipApi.create(tmpZipPath, folderPath)
      if (!zipResult.success) {
        throw new Error(zipResult.error || 'ZIP creation failed')
      }

      setUploadStatus('uploading')
      const base = await getMarketplaceUrl()
      const headers = await getMarketplaceHeaders()

      const formFields: Record<string, string> = {}
      try {
        const m = manifestContent ? parseManifest(manifestContent) : {}
        if (m.name) formFields.name = m.name as string
        if (m.version) formFields.version = m.version as string
        if (m.description) formFields.description = m.description as string
        if (m.entryPoint) formFields.entryPoint = m.entryPoint as string
      } catch (err) {
        console.error('[DeveloperCenter] Failed to parse manifest for form fields:', err)
      }
      if (!formFields.name) formFields.name = folderName
      // User-editable version override wins over manifest-derived value
      if (uploadVersion.trim()) {
        formFields.version = uploadVersion.trim()
      } else if (!formFields.version) {
        formFields.version = '1.0.0'
      }

      const uploadResult = await serverApi.upload(`${base}/api/scripts`, tmpZipPath, headers, formFields)
      const data = uploadResult as { success: boolean; status: number; data?: { error?: { message?: string } }; error?: string }

      if (data.success || (data.status && data.status >= 200 && data.status < 300)) {
        setUploadStatus('success')
        toast.success(t('quickDev.uploadSuccess') || 'Upload successful')
      } else {
        const msg = data.data?.error?.message || data.error || `HTTP ${data.status || 'unknown'}`
        setUploadStatus('error')
        setUploadError(msg)
        toast.error(t('quickDev.uploadError', { error: msg }) || `Error: ${msg}`)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setUploadStatus('error')
      setUploadError(msg)
      toast.error(msg)
    }
  }

  async function handleSelectZip() {
    const result = await dialogApi.openFile([{ name: 'ZIP', extensions: ['zip'] }])
    if (result.canceled || !result.filePath) return

    setZipPath(result.filePath)
    setValidationResults([])
    setZipManifest(null)
    setFolderPath('')
    setHasManifest(false)
    setManifestContent(null)
    setUploadStatus('idle')
    setUploadError('')

    const extractResult = await zipApi.extractManifest(result.filePath)
    if (extractResult.success && extractResult.manifest) {
      const json = JSON.stringify(extractResult.manifest, null, 2)
      setZipManifest(json)
      const results = validateManifest(extractResult.manifest as Record<string, unknown>)
      setValidationResults(results)
    } else {
      setValidationResults(['No manifest.json found in ZIP'])
    }
  }

  // ─────────────────────────────────────────────
  // Tab 2: 我的待审核 (DeveloperPendingPage)
  // ─────────────────────────────────────────────
  type PendingTab = 'scripts' | 'templates'
  const [pendingTab, setPendingTab] = useState<PendingTab>('scripts')
  const [pendingScripts, setPendingScripts] = useState<RemoteScript[]>([])
  const [pendingTemplates, setPendingTemplates] = useState<RemoteTemplate[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)

  const fetchPending = useCallback(async () => {
    setPendingLoading(true)
    try {
      const [scriptsRes, templatesRes] = await Promise.all([
        marketplaceApi.getMyPendingScripts(),
        marketplaceApi.getMyPendingTemplates()
      ])
      setPendingScripts(scriptsRes.data?.items || [])
      setPendingTemplates(templatesRes.data?.items || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '获取待审核项目失败')
    } finally {
      setPendingLoading(false)
    }
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchPending()
  }, [fetchPending])
  /* eslint-enable react-hooks/set-state-in-effect */

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="text-xs px-2 py-0.5 rounded bg-success/10 text-success flex items-center gap-1">
            <CheckCircle size={12} />
            {t('review.approved')}
          </span>
        )
      case 'rejected':
        return (
          <span className="text-xs px-2 py-0.5 rounded bg-danger/10 text-danger flex items-center gap-1">
            <XCircle size={12} />
            {t('review.rejected')}
          </span>
        )
      default:
        return (
          <span className="text-xs px-2 py-0.5 rounded bg-warning/10 text-warning flex items-center gap-1">
            <Clock size={12} />
            {t('review.pending')}
          </span>
        )
    }
  }

  // ─────────────────────────────────────────────
  // Tab 3: 我的脚本
  // ─────────────────────────────────────────────
  const [myScripts, setMyScripts] = useState<RemoteScript[]>([])
  const [myScriptsLoading, setMyScriptsLoading] = useState(false)
  const [editScript, setEditScript] = useState<RemoteScript | null>(null)
  const [editForm, setEditForm] = useState({ name: '', description: '', version: '', tags: '', changelog: '' })
  /** Optional new code package (folder or ZIP) selected in the My Scripts edit modal */
  const [editZipPath, setEditZipPath] = useState('')
  /** Whether the selected editZipPath is a folder (true) or ZIP file (false) */
  const [editZipIsFolder, setEditZipIsFolder] = useState(false)
  /** manifest.json from editZipPath (if readable) — drives version auto-bump */
  const [editZipManifest, setEditZipManifest] = useState<{ version?: string } | null>(null)
  const [editAutoBumpVersion, setEditAutoBumpVersion] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchMyScripts = useCallback(async () => {
    if (!user) return
    setMyScriptsLoading(true)
    try {
      const res = await marketplaceApi.listScripts()
      const items = (res.items || []).filter((s) => s.createdBy === user.id)
      setMyScripts(items)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '获取脚本列表失败')
    } finally {
      setMyScriptsLoading(false)
    }
  }, [user])

  /** Read manifest.json from a folder or ZIP and apply auto-bump if enabled. */
  const loadEditManifest = useCallback(async (sourcePath: string) => {
    try {
      const result = await call<{ success: boolean; manifest: { version?: string } | null }>(
        'zip:extractManifest',
        [sourcePath]
      )
      if (result.success && result.manifest) {
        setEditZipManifest(result.manifest)
        if (editAutoBumpVersion && result.manifest.version) {
          setEditForm((f) => ({ ...f, version: result.manifest!.version! }))
        }
      } else {
        setEditZipManifest(null)
      }
    } catch {
      setEditZipManifest(null)
    }
  }, [editAutoBumpVersion])

  const handleEditSelectFolder = useCallback(async () => {
    const result = await fileApi.selectFolder()
    if (result.canceled || !result.folderPath) return
    setEditZipPath(result.folderPath)
    setEditZipIsFolder(true)
    await loadEditManifest(result.folderPath)
  }, [loadEditManifest])

  const handleEditSelectZip = useCallback(async () => {
    const result = await dialogApi.openFile([{ name: 'ZIP', extensions: ['zip'] }])
    if (result.canceled || !result.filePath) return
    setEditZipPath(result.filePath)
    setEditZipIsFolder(false)
    await loadEditManifest(result.filePath)
  }, [loadEditManifest])

  const handleEditClearZip = useCallback(() => {
    setEditZipPath('')
    setEditZipIsFolder(false)
    setEditZipManifest(null)
  }, [])

  const handleEditClick = (script: RemoteScript) => {
    setEditScript(script)
    setEditForm({
      name: script.name,
      description: script.description || '',
      version: script.version,
      tags: (script.tags || []).join(', '),
      changelog: script.changelog || ''
    })
    setEditZipPath('')
    setEditZipIsFolder(false)
    setEditZipManifest(null)
  }

  const handleSaveEdit = async () => {
    if (!editScript) return
    setSaving(true)
    try {
      const tags = editForm.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      if (editZipPath) {

        // If the user selected a folder, auto-ZIP it first (same as scaffold tab flow)
        let actualZipPath = editZipPath
        if (editZipIsFolder) {
          const folderName = editZipPath.split(/[/\\]/).pop() || 'script'
          const tmpZipPath = `${await call<string>('app:getTempDir')}/${folderName}-${Date.now()}.zip`
          const zipResult = await zipApi.create(tmpZipPath, editZipPath)
          if (!zipResult.success) {
            throw new Error(zipResult.error || 'ZIP creation failed')
          }
          actualZipPath = tmpZipPath
        }

        const formFields: Record<string, string> = {
          name: editForm.name.trim(),
          description: editForm.description.trim(),
          version: editForm.version.trim(),
          tags: JSON.stringify(tags),
          changelog: editForm.changelog.trim()
        }
        const result = await marketplaceApi.updateScript(
          editScript.id,
          formFields,
          actualZipPath
        )
        if (!result.success) {
          throw new Error(result.error || `Update failed (status ${result.status})`)
        }
      } else {
        // Metadata-only PATCH (no ZIP — keeps existing binary on server)
        await marketplaceApi.patchScript(editScript.id, {
          name: editForm.name.trim(),
          description: editForm.description.trim(),
          version: editForm.version.trim(),
          tags,
          changelog: editForm.changelog.trim()
        })
      }
      toast.success('脚本已更新')
      setEditScript(null)
      await fetchMyScripts()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteScript = async (id: string) => {
    if (!window.confirm('确定要删除此脚本吗？此操作不可撤销。')) return
    try {
      await marketplaceApi.deleteScript(id)
      toast.success('脚本已删除')
      await fetchMyScripts()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  // ─────────────────────────────────────────────
  // Role guard
  // ─────────────────────────────────────────────
  if (!isDeveloper) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary text-sm">{t('auth.noAccess')}</p>
      </div>
    )
  }

  // ─────────────────────────────────────────────
  // Tab definition
  // ─────────────────────────────────────────────
  const TABS: { id: DevTab; icon: React.ReactNode; label: string }[] = [
    { id: 'scaffold', icon: <Code size={16} />, label: '项目脚手架' },
    { id: 'pending', icon: <List size={16} />, label: '我的待审核' },
    { id: 'myscripts', icon: <Upload size={16} />, label: '我的脚本' },
    { id: 'scriptParam', icon: <FilePlus size={16} />, label: '创建参数模板' },
    { id: 'project', icon: <FileBox size={16} />, label: '项目模板' },
    { id: 'sdk', icon: <BookOpen size={16} />, label: 'SDK 文档' },
  ]

  const pendingItems = pendingTab === 'scripts' ? pendingScripts : pendingTemplates
  const totalPending = pendingScripts.length + pendingTemplates.length

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{t('nav.developerCenter')}</h1>
      </div>

      {/* ── Top-level tab bar ── */}
      <div className="flex gap-2 border-b border-border-light pb-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-[1px] border-b-2 ${
              activeTab === tab.id
                ? 'text-primary border-primary bg-primary/5'
                : 'text-text-muted border-transparent hover:text-text-secondary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════
          Tab 1: 项目脚手架
          ══════════════════════════════════════════ */}
      <div className={activeTab === 'scaffold' ? '' : 'hidden'}>
        {/* Project Scaffold */}
        <div className="bg-bg-card border border-border-light rounded-xl p-5 mb-4">
          <h3 className="text-base font-semibold text-text-primary">
            {t('quickDev.title')}
          </h3>
          <p className="text-xs text-text-muted mb-4">
            {t('quickDev.subtitle') || '快速原型和测试工具'}
          </p>

          {/* Step 0: Config form */}
          {projectStep === 0 && (
            <div className="space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">ID *</label>
                  <input type="text" value={projectMeta.id} onChange={(e) => setProjectMeta((p) => ({ ...p, id: e.target.value }))}
                    placeholder="com.example.my-script"
                    className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">名称 *</label>
                  <input type="text" value={projectMeta.name} onChange={(e) => setProjectMeta((p) => ({ ...p, name: e.target.value }))}
                    placeholder="My Script"
                    className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">版本</label>
                  <input type="text" value={projectMeta.version} onChange={(e) => setProjectMeta((p) => ({ ...p, version: e.target.value }))}
                    placeholder="1.0.0"
                    className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">入口文件</label>
                  <input type="text" value={projectMeta.entry} onChange={(e) => setProjectMeta((p) => ({ ...p, entry: e.target.value }))}
                    placeholder="index.js"
                    className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
                </div>
              </div>

              {/* 描述 */}
              <div>
                <label className="block text-xs text-text-muted mb-1">描述</label>
                <input type="text" value={projectMeta.desc} onChange={(e) => setProjectMeta((p) => ({ ...p, desc: e.target.value }))}
                  placeholder="脚本用途说明"
                  className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
              </div>

              {/* 标签 & 更新日志 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">标签（逗号分隔）</label>
                  <input type="text" value={projectMeta.tags} onChange={(e) => setProjectMeta((p) => ({ ...p, tags: e.target.value }))}
                    placeholder="airdrop, testnet"
                    className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">更新日志</label>
                  <input type="text" value={projectMeta.changelog} onChange={(e) => setProjectMeta((p) => ({ ...p, changelog: e.target.value }))}
                    placeholder="v1.0.0 初始版本"
                    className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
                </div>
              </div>

              {/* 权限 */}
              <div>
                <label className="block text-xs text-text-muted mb-2">权限声明</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={projectMeta.permNetwork}
                      onChange={(e) => setProjectMeta((p) => ({ ...p, permNetwork: e.target.checked }))}
                      className="rounded" />
                    Network
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={projectMeta.permFilesystem}
                      onChange={(e) => setProjectMeta((p) => ({ ...p, permFilesystem: e.target.checked }))}
                      className="rounded" />
                    Filesystem
                  </label>
                </div>
              </div>

              {/* Schema Properties */}
              <div>
                <label className="block text-xs text-text-muted mb-2">配置参数 (Schema Properties)</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <input type="text" value={newProp.key} onChange={(e) => setNewProp((p) => ({ ...p, key: e.target.value }))}
                    placeholder="key" onKeyDown={(e) => e.key === 'Enter' && addSchemaProp()}
                    className="w-28 bg-bg-input border border-border-light rounded-lg px-2 py-1.5 text-xs focus:border-primary outline-none" />
                  <select value={newProp.type} onChange={(e) => setNewProp((p) => ({ ...p, type: e.target.value }))}
                    className="bg-bg-input border border-border-light rounded-lg px-2 py-1.5 text-xs focus:border-primary outline-none">
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                  </select>
                  <input type="text" value={newProp.label} onChange={(e) => setNewProp((p) => ({ ...p, label: e.target.value }))}
                    placeholder="显示名称" onKeyDown={(e) => e.key === 'Enter' && addSchemaProp()}
                    className="flex-1 bg-bg-input border border-border-light rounded-lg px-2 py-1.5 text-xs focus:border-primary outline-none" />
                  <label className="flex items-center gap-1 text-xs cursor-pointer shrink-0">
                    <input type="checkbox" checked={newProp.required}
                      onChange={(e) => setNewProp((p) => ({ ...p, required: e.target.checked }))} className="rounded" />
                    必填
                  </label>
                  <button onClick={addSchemaProp} disabled={!newProp.key.trim()}
                    className="px-2 py-1.5 rounded bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 disabled:opacity-40 shrink-0">
                    添加
                  </button>
                </div>
                {schemaProps.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {schemaProps.map((prop) => (
                      <div key={prop.key} className="flex items-center gap-2 px-2 py-1 rounded bg-bg-page border border-border-light text-xs">
                        <span className="font-mono text-text-primary w-20 truncate">{prop.key}</span>
                        <span className="text-text-muted w-14">{prop.type}</span>
                        <span className="text-text-secondary flex-1 truncate">{prop.label || '-'}</span>
                        {prop.required && <span className="text-danger text-xs">*</span>}
                        <button onClick={() => removeSchemaProp(prop.key)}
                          className="text-text-muted hover:text-danger ml-auto">&times;</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 参数模板 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs text-text-muted">参数模板（可选，选择脚本需要的参数类型）</label>
                  <button onClick={loadTemplates}
                    className="text-xs text-primary hover:underline">加载模板列表</button>
                </div>
                {availableTemplates.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                    {availableTemplates.map((tmpl) => (
                      <label key={tmpl.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                          selectedTemplateIds.includes(tmpl.id)
                            ? 'border-primary bg-primary/5'
                            : 'border-border-light hover:border-primary/30'
                        }`}>
                        <input type="checkbox" checked={selectedTemplateIds.includes(tmpl.id)}
                          onChange={() => toggleTemplate(tmpl.id)} className="rounded" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium truncate">{tmpl.name}</div>
                          <div className="text-xs text-text-muted">{tmpl.type}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">点击&quot;加载模板列表&quot;获取可用模板</p>
                )}
              </div>

              <button onClick={initProject} disabled={generating || !projectMeta.id.trim() || !projectMeta.name.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors">
                {generating ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                {generating ? '创建中...' : '选择文件夹并开始创建'}
              </button>
            </div>
          )}

          {projectStep === 2 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle size={16} />
                <span className="text-sm font-medium">项目已创建</span>
              </div>
              <div className="bg-bg-page border border-border-light rounded-lg p-3 font-mono text-xs text-text-secondary">
                {projectFolder}
              </div>
              <div className="flex gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bg-tertiary text-xs text-text-muted">
                  <FileText size={12} />manifest.json
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bg-tertiary text-xs text-text-muted">
                  <Code2 size={12} />{projectMeta.entry || 'index.js'}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bg-tertiary text-xs text-text-muted">
                  <FileText size={12} />README.md
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setProjectStep(0); setProjectMeta({ id: '', name: '', version: '1.0.0', desc: '', entry: 'index.js', tags: '', changelog: '', permNetwork: false, permFilesystem: false }); setSchemaProps([]); setProjectFolder('') }}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium border border-border-light text-text-secondary hover:border-primary transition-colors">
                  <FilePlus size={14} />创建另一个
                </button>
                <button onClick={() => { setFolderPath(projectFolder); setHasManifest(true); setManifestContent(null); setProjectStep(0) }}
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover transition-colors">
                  <ArrowRight size={14} />跳转到上传
                </button>
              </div>

              {/* Demo run panel */}
              <div className="border border-border-light rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowDemoPanel(!showDemoPanel)}
                  className="w-full flex items-center gap-2 px-4 py-3 bg-bg-tertiary hover:bg-bg-input transition-colors text-sm font-medium text-text-primary"
                >
                  {showDemoPanel ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {t('quickDev.testRun', '测试运行')}
                </button>
                {showDemoPanel && (
                  <div className="p-4 space-y-3 bg-bg-card">
                    <p className="text-xs text-text-muted">
                      {t('quickDev.standaloneHint', '直接运行 node index.js 即可使用示例数据测试')}
                    </p>
                    <div>
                      <label className="text-xs font-medium text-text-secondary mb-1 block">
                        {t('quickDev.runCommand', '运行命令')}
                      </label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-bg-page border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary font-mono select-all">
                          node {projectMeta.entry || 'index.js'}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`node ${projectMeta.entry || 'index.js'}`)
                            toast.success('已复制')
                          }}
                          className="shrink-0 p-2 rounded-lg border border-border-light text-text-muted hover:text-text-primary hover:border-primary transition-colors"
                          title="复制命令"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                    {demoConfigContent && (
                      <div>
                        <label className="text-xs font-medium text-text-secondary mb-1 block">
                          demo-config.json
                        </label>
                        <pre className="bg-bg-page border border-border-light rounded-lg p-3 text-xs text-text-secondary overflow-auto max-h-48 font-mono">
                          {demoConfigContent}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Folder Upload */}
        <div className="bg-bg-card border border-border-light rounded-xl p-5 mb-4">
          <h3 className="text-base font-semibold mb-1 text-text-primary">
            {t('quickDev.folderUpload')}
          </h3>
          <p className="text-xs text-text-muted mb-4">
            {t('quickDev.folderUploadHint') || '选择包含 manifest.json 的文件夹，自动打包为 ZIP 并上传。'}
          </p>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              readOnly
              value={folderPath}
              placeholder="No folder selected..."
              className="flex-1 bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary"
            />
            <button
              onClick={handleSelectFolder}
              disabled={uploadStatus === 'zipping' || uploadStatus === 'uploading'}
              className="border border-border-light text-text-secondary rounded-lg px-3 py-2 text-sm hover:bg-bg-input transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <FolderOpen size={16} />
              {t('quickDev.selectFolder') || '选择文件夹'}
            </button>
          </div>

          {folderPath && hasManifest && manifestContent && (
            <div className="mb-4">
              <p className="text-xs text-text-secondary mb-1 font-medium">
                {t('quickDev.manifestDetected') || 'manifest.json 已检测到:'}
              </p>
              <pre className="bg-bg-page border border-border-light rounded-lg p-3 text-xs text-text-secondary overflow-auto max-h-64">
                {manifestContent}
              </pre>
            </div>
          )}

          {/* Editable version override (pre-filled from manifest) */}
          {folderPath && (
            <div className="mb-4">
              <label className="block text-xs text-text-secondary mb-1 font-medium">
                {t('quickDev.versionLabel') || '版本号'}
              </label>
              <input
                type="text"
                value={uploadVersion}
                onChange={(e) => setUploadVersion(e.target.value)}
                placeholder="1.0.0"
                className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none"
              />
              <p className="text-[11px] text-text-muted mt-1">
                {t('quickDev.versionHint') || '留空则使用 manifest.json 里的 version。'}
              </p>
            </div>
          )}

          {folderPath && !hasManifest && (
            <div className="mb-4 text-xs text-warning flex items-center gap-1.5">
              <AlertTriangle size={14} />
              {t('quickDev.noManifestGenerate') || '未找到 manifest.json，将自动生成基础版本。'}
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!folderPath || uploadStatus === 'zipping' || uploadStatus === 'uploading'}
            className="bg-primary text-white hover:bg-primary-hover rounded-lg py-2.5 px-6 text-sm font-medium inline-flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploadStatus === 'zipping' || uploadStatus === 'uploading' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Upload size={18} />
            )}
            {uploadStatus === 'zipping'
              ? t('quickDev.zipping') || '打包中...'
              : uploadStatus === 'uploading'
              ? t('quickDev.uploading') || '上传中...'
              : t('quickDev.packAndUpload') || '打包并上传'}
          </button>

          {uploadStatus === 'uploading' && (
            <div className="mt-3 w-full">
              <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                <span>{t('quickDev.uploading') || '上传中...'}</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-bg-sunken rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {uploadStatus === 'success' && (
            <div className="mt-3 text-xs text-success flex items-center gap-1.5">
              <CheckCircle size={14} />
              {t('quickDev.uploadSuccess') || '上传成功'}
            </div>
          )}

          {uploadStatus === 'error' && (
            <div className="mt-3 text-xs text-danger flex items-center gap-1.5">
              <XCircle size={14} />
              {t('quickDev.uploadError', { error: uploadError }) || `错误: ${uploadError}`}
            </div>
          )}
        </div>

        {/* ZIP Validation */}
        <div className="bg-bg-card border border-border-light rounded-xl p-5">
          <h3 className="text-base font-semibold mb-1 text-text-primary">
            {t('quickDev.validateZip')}
          </h3>
          <p className="text-xs text-text-muted mb-4">
            {t('quickDev.validateZipHint') || '选择 ZIP 文件预览并验证其 manifest.json。'}
          </p>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              readOnly
              value={zipPath}
              placeholder="No ZIP selected..."
              className="flex-1 bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary"
            />
            <button
              onClick={handleSelectZip}
              className="border border-border-light text-text-secondary rounded-lg px-3 py-2 text-sm hover:bg-bg-input transition-colors inline-flex items-center gap-1.5"
            >
              <FileArchive size={16} />
              {t('quickDev.selectZip') || '选择 ZIP'}
            </button>
          </div>

          {zipPath && zipManifest && (
            <div className="mb-4">
              <p className="text-xs text-text-secondary mb-1 font-medium">
                {t('quickDev.manifestContent') || 'manifest.json 内容:'}
              </p>
              <pre className="bg-bg-page border border-border-light rounded-lg p-3 text-xs text-text-secondary overflow-auto max-h-64">
                {zipManifest}
              </pre>
            </div>
          )}

          {zipPath && !zipManifest && (
            <div className="mb-4 text-xs text-warning flex items-center gap-1.5">
              <AlertTriangle size={14} />
              {t('quickDev.noManifestInZip') || 'ZIP 中未找到 manifest.json'}
            </div>
          )}

          {validationResults.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={14} className={validationResults.some((r) => r.startsWith('Missing:')) ? 'text-danger' : validationResults.some((r) => !r.startsWith('Missing:')) ? 'text-warning' : 'text-success'} />
                <span className="text-xs font-medium">
                  {validationResults[0]}
                </span>
              </div>
              {validationResults.filter((v) => v.startsWith('Missing:')).length > 0 && (
                <div className="text-xs text-danger bg-danger/5 rounded-lg p-2 mb-2">
                  {validationResults.filter((v) => v.startsWith('Missing:')).length} missing field(s):{' '}
                  {(() => {
                    const missingFields = validationResults.filter((v) => v.startsWith('Missing:')).map((v) => v.replace('Missing: ', ''))
                    return missingFields.join(', ')
                  })()}
                </div>
              )}
              {validationResults.filter((v) => !v.startsWith('Missing:')).length > 0 && (
                <div className="space-y-1">
                  {validationResults.filter((v) => !v.startsWith('Missing:')).map((w, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-warning">
                      <AlertTriangle size={12} />
                      {w}
                    </div>
                  ))}
                </div>
              )}
              {validationResults.every((v) => !v.startsWith('Missing:') && !v.includes('manifest.json found')) && (
                <div className="text-xs text-success bg-success/5 rounded-lg p-2">
                  <CheckCircle size={12} className="inline mr-1" />
                  {t('quickDev.allFieldsComplete') || '所有必填字段完整'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          Tab 2: 我的待审核
          ══════════════════════════════════════════ */}
      <div className={activeTab === 'pending' ? 'space-y-4' : 'hidden'}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('developerPending.title')}</h1>
            <p className="text-text-muted text-sm">
              {t('developerPending.pendingCount', { count: totalPending })}
            </p>
          </div>
          <button
            onClick={fetchPending}
            disabled={pendingLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            {t('common.refresh')}
          </button>
        </div>

        {/* 脚本/模板子标签页 */}
        <div className="flex gap-2 border-b border-border-light pb-0">
          <button
            onClick={() => setPendingTab('scripts')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-[1px] border-b-2 ${
              pendingTab === 'scripts'
                ? 'text-primary border-primary bg-primary/5'
                : 'text-text-muted border-transparent hover:text-text-secondary'
            }`}
          >
            <Zap size={16} />
            {t('review.scripts')} ({pendingScripts.length})
          </button>
          <button
            onClick={() => setPendingTab('templates')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-[1px] border-b-2 ${
              pendingTab === 'templates'
                ? 'text-primary border-primary bg-primary/5'
                : 'text-text-muted border-transparent hover:text-text-secondary'
            }`}
          >
            <FileText size={16} />
            {t('review.templates')} ({pendingTemplates.length})
          </button>
        </div>

        {pendingLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : pendingItems.length === 0 ? (
          <div className="bg-bg-card rounded-xl border border-border-light p-12 text-center">
            <Clock size={48} className="mx-auto mb-4 text-text-muted" />
            <p className="text-text-muted">{t('developerPending.noPending')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="bg-bg-card rounded-xl border border-border-light p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium text-text-primary">{item.name}</h3>
                    <p className="text-xs text-text-muted font-mono mt-1">
                      ID: {item.id} · v{item.version}
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      {t('developerPending.submitted')}: {new Date(item.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  {getStatusBadge(item.reviewStatus)}
                </div>

                {item.description && (
                  <p className="text-sm text-text-secondary mb-3">{item.description}</p>
                )}

                {item.reviewComment && (
                  <div className="mt-3 p-3 bg-bg-tertiary rounded-lg">
                    <div className="flex items-center gap-1 text-xs text-text-muted mb-1">
                      <MessageSquare size={12} />
                      {t('review.adminComment')}:
                    </div>
                    <p className="text-sm text-text-secondary">{item.reviewComment}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════
          Tab 3: 我的脚本
          ══════════════════════════════════════════ */}
      <div className={activeTab === 'myscripts' ? 'space-y-4' : 'hidden'}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">我的脚本</h1>
            <p className="text-text-muted text-sm">管理您已发布的脚本，在线编辑或删除。</p>
          </div>
          <button
            onClick={fetchMyScripts}
            disabled={myScriptsLoading}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50"
          >
            {t('common.refresh')}
          </button>
        </div>

        {myScriptsLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : myScripts.length === 0 ? (
          <div className="bg-bg-card rounded-xl border border-border-light p-12 text-center">
            <Code2 size={48} className="mx-auto mb-4 text-text-muted" />
            <p className="text-text-muted">暂无已发布的脚本。使用&quot;项目脚手架&quot;创建新脚本并上传。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {myScripts.map((script) => (
              <div
                key={script.id}
                className="bg-bg-card rounded-xl border border-border-light p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-text-primary">{script.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded bg-bg-tertiary text-text-muted font-mono">v{script.version}</span>
                      {script.reviewStatus && (
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          script.reviewStatus === 'approved' ? 'bg-success/10 text-success' :
                          script.reviewStatus === 'rejected' ? 'bg-danger/10 text-danger' :
                          'bg-warning/10 text-warning'
                        }`}>
                          {script.reviewStatus === 'approved' ? '已发布' : script.reviewStatus === 'rejected' ? '已拒绝' : '审核中'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted font-mono mt-1">
                      ID: {script.id}
                    </p>
                    <p className="text-xs text-text-muted mt-1">
                      更新于: {new Date(script.updatedAt).toLocaleString()}
                      {script.downloads !== undefined && ` · 下载 ${script.downloads} 次`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleEditClick(script)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                      title="编辑"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteScript(script.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                      title="删除"
                    >
                      <Trash2 size={14} />
                    </button>
              </div>
            </div>

                {script.description && (
                  <p className="text-sm text-text-secondary mb-2">{script.description}</p>
                )}

                {script.tags && script.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {script.tags.map((tag) => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-bg-tertiary text-text-muted">{tag}</span>
                    ))}
                  </div>
                )}

                {script.changelog && (
                  <details className="text-xs text-text-muted">
                    <summary className="cursor-pointer hover:text-text-secondary">更新日志</summary>
                    <p className="mt-1 pl-2 border-l-2 border-border-light">{script.changelog}</p>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Edit Modal */}
        {editScript && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditScript(null)}>
            <div className="bg-bg-card rounded-xl border border-border-light p-6 w-full max-w-lg mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-text-primary">编辑脚本</h2>
                <button onClick={() => setEditScript(null)} className="text-text-muted hover:text-text-secondary">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">名称</label>
                  <input type="text" value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">版本</label>
                  <input type="text" value={editForm.version}
                    onChange={(e) => setEditForm((f) => ({ ...f, version: e.target.value }))}
                    className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">描述</label>
                  <textarea value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none resize-none" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">标签（逗号分隔）</label>
                  <input type="text" value={editForm.tags}
                    onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))}
                    className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">更新日志</label>
                  <input type="text" value={editForm.changelog}
                    onChange={(e) => setEditForm((f) => ({ ...f, changelog: e.target.value }))}
                    className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
                </div>

                {/* ZIP / folder re-upload (optional) */}
                <div className="pt-2 border-t border-border-light">
                  <label className="block text-xs text-text-muted mb-1">
                    {t('dashboard.myScripts.reuploadLabel') || '重新上传代码包（可选）'}
                  </label>
                  <p className="text-[11px] text-text-muted mb-2">
                    {t('dashboard.myScripts.reuploadHint') || '选择新的文件夹或 ZIP，将覆盖现有代码包并保留脚本 ID。留空则只更新元数据。'}
                  </p>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      readOnly
                      value={editZipPath}
                      placeholder={t('dashboard.myScripts.noPackageSelected') || '未选择新代码包'}
                      className="flex-1 bg-bg-input border border-border-light rounded-lg px-3 py-2 text-xs text-text-primary"
                    />
                    <button
                      type="button"
                      onClick={handleEditSelectFolder}
                      className="px-2 py-1 text-xs border border-border-light rounded-lg text-text-secondary hover:bg-bg-input transition-colors inline-flex items-center gap-1"
                    >
                      <FolderOpen size={12} />
                      {t('dashboard.myScripts.chooseFolder') || '文件夹'}
                    </button>
                    <button
                      type="button"
                      onClick={handleEditSelectZip}
                      className="px-2 py-1 text-xs border border-border-light rounded-lg text-text-secondary hover:bg-bg-input transition-colors inline-flex items-center gap-1"
                    >
                      <FileArchive size={12} />
                      {t('dashboard.myScripts.chooseZip') || 'ZIP'}
                    </button>
                    {editZipPath && (
                      <button
                        type="button"
                        onClick={handleEditClearZip}
                        className="px-2 py-1 text-xs border border-border-light rounded-lg text-text-muted hover:bg-bg-input transition-colors"
                        title={t('common.clear') || '清除'}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  {editZipPath && (
                    <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editAutoBumpVersion}
                        onChange={(e) => setEditAutoBumpVersion(e.target.checked)}
                        className="rounded"
                      />
                      <span>{t('dashboard.myScripts.autoBumpVersion') || '自动同步版本号（来自 manifest.json）'}</span>
                    </label>
                  )}
                  {editZipManifest?.version && editZipManifest.version !== editScript?.version && (
                    <p className="text-[11px] text-text-muted mt-1">
                      {t('dashboard.myScripts.versionWillChange', {
                        from: editScript?.version,
                        to: editZipManifest.version
                      }) || `版本将更新：v${editScript?.version} → v${editZipManifest.version}`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button onClick={() => setEditScript(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-border-light text-text-secondary hover:bg-bg-input transition-colors">
                  取消
                </button>
                <button onClick={handleSaveEdit} disabled={saving || !editForm.name.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary-hover disabled:opacity-50 transition-colors inline-flex items-center gap-1.5">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      {/* ══════════════════════════════════════════
          Tab 4: SDK 文档
          ══════════════════════════════════════════ */}
      <div className={activeTab === 'sdk' ? 'space-y-4' : 'hidden'}>
        <h1 className="text-2xl font-bold text-text-primary">SDK 文档</h1>
        <p className="text-text-muted text-sm">TaskForge 任务脚本开发指南 — 两种输入类型、manifest.json 规范、运行时环境变量与沙箱权限模型。</p>

        <div className="bg-bg-card rounded-xl border border-border-light p-6 space-y-6">

          {/* ============ 核心概念：两种输入 ============ */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">核心概念：脚本的两种输入</h2>
            <p className="text-sm text-text-secondary mb-4">
              每个任务脚本在运行时接收两种输入，由开发者通过 manifest.json 分别声明。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="p-4 rounded-lg bg-bg-page border border-primary/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-medium">schema</span>
                  <span className="font-medium text-text-primary">开发者自定义参数</span>
                </div>
                <p className="text-text-secondary mb-2">
                  由开发者在 manifest.schema 中定义，用户在创建任务时通过表单填写。运行时注入为 TASK_CONFIG 及 TASK_{"{"}KEY{"}"}。
                </p>
                <p className="text-xs text-text-muted">例：目标 URL、并发数、超时时间等一次性配置参数。</p>
              </div>

              <div className="p-4 rounded-lg bg-bg-page border border-purple/20">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded bg-purple/10 text-purple text-xs font-medium">dataRequirements</span>
                  <span className="font-medium text-text-primary">数据模板选择</span>
                </div>
                <p className="text-text-secondary mb-2">
                  由开发者声明需要哪种数据（钱包/代理/数据模板），用户在创建任务时从已有数据中勾选。运行时注入为 TASK_DATA_{"{"}KEY{"}"}。
                </p>
                <p className="text-xs text-text-muted">例：选择要操作的钱包列表、代理配置、社交媒体账号池。</p>
              </div>
            </div>
          </section>

          {/* ============ manifest.json 规范 ============ */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">manifest.json 规范</h2>
            <p className="text-sm text-text-secondary mb-3">
              每个任务脚本在 zip 包根目录下必须包含 manifest.json，定义脚本的元数据、两类输入声明和权限声明。
            </p>

            <p className="text-xs text-text-muted mb-2">完整示例：</p>
            <pre className="bg-bg-page border border-border-light rounded-lg p-4 text-xs text-text-secondary overflow-auto mb-4">
{`{
  "id": "com.example.daily-checkin",
  "name": "每日签到",
  "version": "1.0.0",
  "description": "多钱包自动签到脚本",
  "entryPoint": "index.js",
  "runtime": "node",
  "schema": {
    "type": "object",
    "properties": {
      "targetUrl": { "type": "string", "title": "签到 URL" },
      "threadCount": { "type": "number", "title": "并发数", "default": 1 }
    },
    "required": ["targetUrl"]
  },
  "dataRequirements": [
    {
      "key": "wallets",
      "label": "EVM 钱包",
      "templateType": "evm",
      "min": 1,
      "max": 5,
      "source": "wallet",
      "description": "选择要签到的 EVM 钱包"
    },
    {
      "key": "accounts",
      "label": "社交账号",
      "templateType": "twitter-account",
      "min": 1,
      "max": -1,
      "source": "script_param",
      "description": "绑定 Twitter 账号用于自动发推"
    }
  ],
  "permissions": ["network"],
  "tags": ["airdrop", "checkin"],
  "changelog": "v1.0.0 初始版本"
}`}
            </pre>

            <h3 className="text-md font-medium text-text-primary mb-2">基础字段</h3>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b border-border-light text-left">
                  <th className="py-2 pr-4 font-medium text-text-primary">字段</th>
                  <th className="py-2 pr-4 font-medium text-text-primary">类型</th>
                  <th className="py-2 pr-4 font-medium text-text-primary">必填</th>
                  <th className="py-2 font-medium text-text-primary">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {[
                  ['id', 'string', '✅', '全局唯一标识符（推荐反向域名格式）'],
                  ['name', 'string', '✅', '脚本显示名称'],
                  ['version', 'string', '✅', '语义化版本号（SemVer）'],
                  ['description', 'string', '✅', '脚本用途说明'],
                  ['entryPoint', 'string', '✅', '入口文件名（相对于脚本目录）'],
                  ['runtime', 'string', '✅', '运行时（目前仅支持 node）'],
                  ['schema', 'object', '✅', 'JSON Schema，定义自定义参数 → 运行时注入 TASK_CONFIG'],
                  ['dataRequirements', 'DataRequirement[]', '❌', '数据模板声明 → 运行时注入 TASK_DATA_{"{"}KEY{"}"}'],
                  ['permissions', 'string[]', '❌', '["network", "filesystem"]，默认全部拒绝'],
                  ['tags', 'string[]', '❌', '分类标签'],
                  ['changelog', 'string', '❌', '更新日志'],
                ].map(([field, type, required, desc]) => (
                  <tr key={field}>
                    <td className="py-2 pr-4"><code className="text-xs bg-bg-tertiary px-1.5 py-0.5 rounded font-mono">{field}</code></td>
                    <td className="py-2 pr-4 text-text-muted">{type}</td>
                    <td className="py-2 pr-4 text-text-muted">{required}</td>
                    <td className="py-2 text-text-secondary">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="text-md font-medium text-text-primary mb-2">schema 属性字段类型</h3>
            <table className="w-full text-sm mb-4">
              <thead>
                <tr className="border-b border-border-light text-left">
                  <th className="py-2 pr-4 font-medium text-text-primary">type</th>
                  <th className="py-2 font-medium text-text-primary">渲染</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {[
                  ['string', '单行文本输入框'],
                  ['number', '数字输入框（支持 min/max）'],
                  ['boolean', '复选框'],
                  ['string + enum', '下拉选择框'],
                ].map(([t, d]) => (
                  <tr key={t}>
                    <td className="py-2 pr-4"><code className="text-xs bg-bg-tertiary px-1.5 py-0.5 rounded font-mono">{t}</code></td>
                    <td className="py-2 text-text-secondary">{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="text-md font-medium text-text-primary mb-2">dataRequirements 字段说明</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-light text-left">
                  <th className="py-2 pr-4 font-medium text-text-primary">字段</th>
                  <th className="py-2 pr-4 font-medium text-text-primary">类型</th>
                  <th className="py-2 font-medium text-text-primary">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {[
                  ['key', 'string', '环境变量 key → 运行时通过 TASK_DATA_{"{"}KEY{"}"} 访问'],
                  ['label', 'string', '任务创建页显示的名称'],
                  ['templateType', 'string', '匹配 templates.type，决定系统从哪个数据表查询'],
                  ['min', 'number', '最少选择条数（默认 0）'],
                  ['max', 'number', '最多选择条数（-1 = 无上限）'],
                  ['source', '"wallet" | "proxy" | "script_param"', '数据来源路由'],
                  ['description', 'string（可选）', '帮助说明文字'],
                ].map(([field, type, desc]) => (
                  <tr key={field}>
                    <td className="py-2 pr-4"><code className="text-xs bg-bg-tertiary px-1.5 py-0.5 rounded font-mono">{field}</code></td>
                    <td className="py-2 pr-4 text-text-muted">{type}</td>
                    <td className="py-2 text-text-secondary">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ============ 运行时环境变量 ============ */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">运行时环境变量</h2>
            <p className="text-sm text-text-secondary mb-3">
              脚本子进程启动时由 TaskForge 注入以下环境变量。
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-light text-left">
                  <th className="py-2 pr-4 font-medium text-text-primary">变量名</th>
                  <th className="py-2 pr-4 font-medium text-text-primary">来源</th>
                  <th className="py-2 font-medium text-text-primary">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {[
                  ['TASK_ID', '系统', '任务 UUID'],
                  ['TASK_CONFIG', 'schema', '完整 JSON 配置（用户在表单填写的所有参数）'],
                  ['TASK_{"{"}KEY{"}"}', 'schema', '每个 schema 属性独立注入（如 TASK_TARGETURL）'],
                  ['TASK_DATA_{"{"}KEY{"}"}', 'dataRequirements', '用户选中的数据（如 TASK_DATA_WALLETS / TASK_DATA_ACCOUNTS）'],
                  ['TASK_PERM_NETWORK', '系统', '"1" 或 "0"，生效的网络权限'],
                  ['TASK_PERM_FILESYSTEM', '系统', '"1" 或 "0"，生效的文件系统权限'],
                  ['TASK_SANDBOX', '系统', '"1" 或 "0"，是否沙箱模式'],
                ].map(([name, source, desc]) => (
                  <tr key={name}>
                    <td className="py-2 pr-4"><code className="text-xs bg-bg-tertiary px-1.5 py-0.5 rounded font-mono">{name}</code></td>
                    <td className="py-2 pr-4 text-text-muted">{source}</td>
                    <td className="py-2 text-text-secondary">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* ============ 权限模型 ============ */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">四层权限模型</h2>
            <div className="space-y-3 text-sm text-text-secondary">
              <div className="p-3 rounded-lg bg-bg-page border border-border-light">
                <span className="font-medium text-text-primary">Layer 1 — 脚本声明权限 (manifest.permissions)</span>
                <p className="mt-1">脚本通过 manifest 声明需要的权限（network / filesystem）。未声明 = 全部拒绝。</p>
              </div>
              <div className="p-3 rounded-lg bg-bg-page border border-border-light">
                <span className="font-medium text-text-primary">Layer 2 — 沙箱模式覆盖 (task.is_sandbox)</span>
                <p className="mt-1">用户在创建任务时可启用沙箱模式，覆盖 Layer 1 的所有权限声明。</p>
              </div>
              <div className="p-3 rounded-lg bg-bg-page border border-border-light">
                <span className="font-medium text-text-primary">Layer 3 — 系统关键环境变量白名单</span>
                <p className="mt-1">PATH、HOME、APPDATA 等系统变量不可被 task.config 覆盖。</p>
              </div>
              <div className="p-3 rounded-lg bg-bg-page border border-border-light">
                <span className="font-medium text-text-primary">Layer 4 — 运行时强制 patch (sandbox-enforcer.cjs)</span>
                <p className="mt-1">通过 NODE_OPTIONS=--require monkey-patch 所有受限 API（http、fs、child_process），无法绕过。</p>
              </div>
            </div>
          </section>

          {/* ============ 快速开始 ============ */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">快速开始</h2>
            <pre className="bg-bg-page border border-border-light rounded-lg p-4 text-xs text-text-secondary overflow-auto">
{`// ── 读取自定义参数（schema）──
const config = JSON.parse(process.env.TASK_CONFIG || '{}')
console.log('[script] config:', config.targetUrl)

// ── 读取数据模板（dataRequirements）──
// key 即为 manifest 中声明的 key
const wallets  = JSON.parse(process.env.TASK_DATA_WALLETS || '[]')
const accounts = JSON.parse(process.env.TASK_DATA_ACCOUNTS || '[]')
console.log('[script]', wallets.length, 'wallets,', accounts.length, 'accounts')

// ── 权限自检 ──
const isSandbox = process.env.TASK_SANDBOX === '1'
if (isSandbox) {
  console.warn('[script] Sandbox mode — network disabled')
}

// ── 业务逻辑 ──
for (const wallet of wallets) {
  await checkIn(config.targetUrl, wallet, accounts)
}`}
            </pre>
          </section>
        </div>
      </div>
      </div>

      {/* ══════════════════════════════════════
          Tab 5: 创建参数模板 (TemplateEditor)
          ══════════════════════════════════════ */}
      <div className={activeTab === 'scriptParam' ? '' : 'hidden'}>
        <TemplateEditor />
      </div>

      {/* ══════════════════════════════════════
          Tab 6: 项目模板管理
          ══════════════════════════════════════ */}
      <div className={activeTab === 'project' ? '' : 'hidden'}>
        <ProjectTemplates />
      </div>
    </div>
  )
}
