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
  X
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
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle')
  const [uploadError, setUploadError] = useState('')

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
    const props = m.schema && typeof m.schema === 'object' ? (m.schema as Record<string, unknown>).properties : undefined
    const propsStr = props ? `  "properties": ${JSON.stringify(props, null, 4).replace(/\n/g, '\n  ')}` : '  "properties": {}'
    return `/**
 * ${m.name || 'Script'} — 任务脚本配置清单
 *
 * id:               全局唯一标识符（推荐反向域名格式，如 com.example.my-script）
 * name:             脚本显示名称
 * version:          语义化版本号（SemVer）
 * description:      脚本用途说明
 * entryPoint:       入口文件名（相对于脚本目录）
 * runtime:          运行时环境（当前仅支持 "node"）
 * permissions:      运行时权限声明 ["network", "filesystem"]，默认全部拒绝
 * tags:             分类标签（用于市场搜索）
 * changelog:        更新日志
 * requiredAccountTemplateIds: 需要的参数模板 ID 列表（用于注入账户数据）
 * schema:           任务配置表单的 JSON Schema（用于 DynamicForm 自动渲染）
 */
{
  // 必填字段
  "id": ${JSON.stringify(m.id)},
  "name": ${JSON.stringify(m.name)},
  "version": ${JSON.stringify(m.version)},
  "description": ${JSON.stringify(m.description)},
  "entryPoint": ${JSON.stringify(m.entryPoint)},
  "runtime": "node",

  // 可选字段
  "permissions": ${JSON.stringify(m.permissions)},
  "tags": ${JSON.stringify(m.tags)},
  "changelog": ${JSON.stringify(m.changelog)},
  "requiredAccountTemplateIds": ${JSON.stringify(m.requiredAccountTemplateIds)},

  // Schema 定义（任务配置表单的 JSON Schema）
  "schema": {
    "type": "object",
${propsStr}${(m.schema as Record<string, unknown>)?.required ? `,\n    "required": ${JSON.stringify((m.schema as Record<string, unknown>).required)}` : ''}
  }
}
`
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
        requiredAccountTemplateIds: selectedTemplateIds,
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
const config = JSON.parse(process.env.TASK_CONFIG || '{}')
console.log('[script] started with config:', JSON.stringify(config))

// ── 权限自检（由 TaskForge 注入）──
const canNetwork = process.env.TASK_PERM_NETWORK === '1'
const canFilesystem = process.env.TASK_PERM_FILESYSTEM === '1'
const isSandbox = process.env.TASK_SANDBOX === '1'
if (isSandbox) {
  console.warn('[script] Running in sandbox mode — network and filesystem access disabled')
}

// ── 读取钱包数据（由 TaskForge 注入）──
const wallets = JSON.parse(process.env.TASK_WALLETS || '[]')
if (wallets.length > 0) {
  console.log('[script] loaded', wallets.length, 'wallet(s)')
}

// ── 读取账户数据（由 TaskForge 注入）──
const scriptParams = JSON.parse(process.env.TASK_SCRIPT_PARAMS || '[]')
if (scriptParams.length > 0) {
  console.log('[script] loaded', scriptParams.length, 'script param(s)')
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
        requiredAccountTemplateIds: [],
        schema: { type: 'object', properties: {} }
      }
      const json = JSON.stringify(basicManifest, null, 2)
      await fileApi.writeFile(`${folderPath}/manifest.json`, json)
      setHasManifest(true)
      setManifestContent(json)
    }

    setUploadStatus('zipping')
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
      if (!formFields.version) formFields.version = '1.0.0'

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

  const handleEditClick = (script: RemoteScript) => {
    setEditScript(script)
    setEditForm({
      name: script.name,
      description: script.description || '',
      version: script.version,
      tags: (script.tags || []).join(', '),
      changelog: script.changelog || ''
    })
  }

  const handleSaveEdit = async () => {
    if (!editScript) return
    setSaving(true)
    try {
      const tags = editForm.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      await marketplaceApi.patchScript(editScript.id, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        version: editForm.version.trim(),
        tags,
        changelog: editForm.changelog.trim()
      })
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
      </div>

      {/* ══════════════════════════════════════════
          Tab 4: SDK 文档
          ══════════════════════════════════════════ */}
      <div className={activeTab === 'sdk' ? 'space-y-4' : 'hidden'}>
        <h1 className="text-2xl font-bold text-text-primary">SDK 文档</h1>
        <p className="text-text-muted text-sm">TaskForge 任务脚本开发指南 — manifest.json 规范、运行时环境变量与沙箱权限模型。</p>

        <div className="bg-bg-card rounded-xl border border-border-light p-6 space-y-6">
          {/* manifest.json 规范 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">manifest.json 规范</h2>
            <p className="text-sm text-text-secondary mb-3">
              每个任务脚本在 zip 包根目录下必须包含 <code className="text-xs bg-bg-tertiary px-1.5 py-0.5 rounded">manifest.json</code>，定义脚本的元数据、参数 schema 和权限声明。
            </p>

            <table className="w-full text-sm">
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
                  ['id', 'string', '✅', '全局唯一标识符（推荐反向域名格式 com.example.my-script）'],
                  ['name', 'string', '✅', '脚本显示名称'],
                  ['version', 'string', '✅', '语义化版本号（SemVer）'],
                  ['description', 'string', '✅', '脚本用途说明'],
                  ['entryPoint', 'string', '✅', '入口文件名（相对于脚本目录，如 index.js）'],
                  ['runtime', 'string', '✅', '运行时环境（目前仅支持 "node"）'],
                  ['requiredAccountTemplateIds', 'string[]', '❌', '需要的参数模板 ID 列表'],
                  ['schema', 'object', '✅', '任务配置表单的 JSON Schema（自动渲染 DynamicForm）'],
                  ['permissions', 'string[]', '❌', '权限声明：["network", "filesystem"]，默认全部拒绝'],
                  ['tags', 'string[]', '❌', '分类标签（用于市场搜索）'],
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
          </section>

          {/* 运行时环境变量 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">运行时环境变量</h2>
            <p className="text-sm text-text-secondary mb-3">
              脚本子进程启动时由 TaskForge 注入以下环境变量，供脚本运行时自检和使用。
            </p>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-light text-left">
                  <th className="py-2 pr-4 font-medium text-text-primary">变量名</th>
                  <th className="py-2 font-medium text-text-primary">说明</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {[
                  ['TASK_ID', '任务 UUID'],
                  ['TASK_CONFIG', 'JSON 序列化的任务配置（根据 manifest schema 填写）'],
                  ['TASK_PERM_NETWORK', '"1" 或 "0"，生效的网络权限'],
                  ['TASK_PERM_FILESYSTEM', '"1" 或 "0"，生效的文件系统权限'],
                  ['TASK_SANDBOX', '"1" 或 "0"，是否沙箱模式'],
                  ['TASK_WALLETS', '(非沙箱) JSON 数组格式的钱包数据'],
                  ['TASK_SCRIPT_PARAMS', '(非沙箱) JSON 数组格式的脚本参数数据'],
                ].map(([name, desc]) => (
                  <tr key={name}>
                    <td className="py-2 pr-4"><code className="text-xs bg-bg-tertiary px-1.5 py-0.5 rounded font-mono">{name}</code></td>
                    <td className="py-2 text-text-secondary">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* 权限模型 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">四层权限模型</h2>
            <div className="space-y-3 text-sm text-text-secondary">
              <div className="p-3 rounded-lg bg-bg-page border border-border-light">
                <span className="font-medium text-text-primary">Layer 1 — 脚本声明权限 (manifest.permissions)</span>
                <p className="mt-1">脚本通过 manifest 声明需要的权限（network / filesystem）。未声明 = 全部拒绝。</p>
              </div>
              <div className="p-3 rounded-lg bg-bg-page border border-border-light">
                <span className="font-medium text-text-primary">Layer 2 — 沙箱模式覆盖 (task.is_sandbox)</span>
                <p className="mt-1">用户在创建任务时可启用沙箱模式，覆盖 Layer 1 的所有权限声明，全部拒绝。</p>
              </div>
              <div className="p-3 rounded-lg bg-bg-page border border-border-light">
                <span className="font-medium text-text-primary">Layer 3 — 系统关键环境变量白名单</span>
                <p className="mt-1">PATH、HOME、APPDATA 等系统环境变量只能从父进程继承，不可被 task.config 覆盖。</p>
              </div>
              <div className="p-3 rounded-lg bg-bg-page border border-border-light">
                <span className="font-medium text-text-primary">Layer 4 — 运行时强制 patch (sandbox-enforcer.cjs)</span>
                <p className="mt-1">通过 NODE_OPTIONS=--require 在用户脚本运行前 monkey-patch 所有受限 API（http、fs、child_process 等），脚本无法绕过。</p>
              </div>
            </div>
          </section>

          {/* 快速开始示例 */}
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-3">快速开始</h2>
            <pre className="bg-bg-page border border-border-light rounded-lg p-4 text-xs text-text-secondary overflow-auto">
{`// index.js — 一个简单的任务脚本模板
const config = JSON.parse(process.env.TASK_CONFIG || '{}')
console.log('[script] started with config:', JSON.stringify(config))

// 权限自检
const canNetwork = process.env.TASK_PERM_NETWORK === '1'
const isSandbox = process.env.TASK_SANDBOX === '1'

if (isSandbox) {
  console.warn('[script] Sandbox mode — network disabled')
}

// 读取钱包
const wallets = JSON.parse(process.env.TASK_WALLETS || '[]')
console.log('[script]', wallets.length, 'wallet(s) loaded')

// TODO: 在此编写你的脚本逻辑
// 退出码：0 = 成功，非 0 = 错误
`}
            </pre>
          </section>
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
