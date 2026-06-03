import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FilePlus,
  Code2,
  ArrowRight,
  FileText,
  FolderOpen,
  Upload,
  FileArchive,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2
} from 'lucide-react'
import { fileApi, zipApi, serverApi, getMarketplaceUrl, getMarketplaceHeaders, dialogApi } from '../api'
import { call } from '../transport'
import { toast } from '../utils/toast'

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

export default function QuickDev() {
  const { t } = useTranslation()
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
      console.error('[QuickDev] Failed to load templates:', err)
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

  // 渲染进程中剥离注释后解析 JSON5
  const parseManifest = (raw: string): Record<string, unknown> => {
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    return JSON.parse(stripped)
  }

  // 生成带注释的 JSON5 格式 manifest
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
 * requiredAccountTemplateIds: 需要的账户模板 ID 列表（用于注入账户数据）
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

      // 构建 schema properties
      const properties: Record<string, Record<string, unknown>> = {}
      const requiredFields: string[] = []
      for (const prop of schemaProps) {
        const propDef: Record<string, unknown> = { type: prop.type, title: prop.label || prop.key }
        if (prop.type === 'number') propDef.default = 0
        if (prop.type === 'boolean') propDef.default = false
        properties[prop.key] = propDef
        if (prop.required) requiredFields.push(prop.key)
      }

      // 构建权限数组
      const permissions: string[] = []
      if (projectMeta.permNetwork) permissions.push('network')
      if (projectMeta.permFilesystem) permissions.push('filesystem')

      // 解析 tags
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

// ── 权限自检（由 Airdrop Farm 注入） ──
const canNetwork = process.env.TASK_PERM_NETWORK === '1'
const canFilesystem = process.env.TASK_PERM_FILESYSTEM === '1'
const isSandbox = process.env.TASK_SANDBOX === '1'
if (isSandbox) {
  console.warn('[script] Running in sandbox mode — network and filesystem access disabled')
}

// ── 读取钱包数据（由 Airdrop Farm 注入） ──
const wallets = JSON.parse(process.env.TASK_WALLETS || '[]')
if (wallets.length > 0) {
  console.log('[script] loaded', wallets.length, 'wallet(s)')
}

// ── 读取账户数据（由 Airdrop Farm 注入） ──
const accounts = JSON.parse(process.env.TASK_ACCOUNTS || '[]')
if (accounts.length > 0) {
  console.log('[script] loaded', accounts.length, 'account(s)')
}

// TODO: add your script logic here
`
      const schemaSection = schemaProps.length > 0
        ? `\n## Schema Params\n\n${schemaProps.map((p) => `| \`${p.key}\` | ${p.type} | ${p.label || '-'} | ${p.required ? 'Yes' : 'No'} |`).join('\n')}`
        : ''
      const readme = `# ${projectMeta.name.trim() || 'Script'}

${projectMeta.desc.trim() || 'Task script for Airdrop Farm'}

## Permissions

${permissions.length > 0 ? permissions.map((p) => `- \`${p}\``).join('\n') : '(none declared — all denied by default)'}
${schemaSection}
## Environment Variables

| Variable | Description |
|----------|-------------|
| \`TASK_CONFIG\` | 任务配置 JSON |
| \`TASK_WALLETS\` | 钱包列表 JSON（address, privateKey, mnemonic, walletType） |
| \`TASK_ACCOUNTS\` | 匹配的账户数据 JSON |
| \`TASK_PERM_NETWORK\` | 网络权限（"1" 或 "0"） |
| \`TASK_PERM_FILESYSTEM\` | 文件系统权限（"1" 或 "0"） |
| \`TASK_SANDBOX\` | 沙箱模式（"1" 或 "0"） |

## Usage

Install via Airdrop Farm marketplace, then create a task using this script.
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

      // 从 manifest.json 读取 name/version 作为表单字段
      const formFields: Record<string, string> = {}
      try {
        const m = manifestContent ? parseManifest(manifestContent) : {}
        if (m.name) formFields.name = m.name as string
        if (m.version) formFields.version = m.version as string
        if (m.description) formFields.description = m.description as string
        if (m.entryPoint) formFields.entryPoint = m.entryPoint as string
      } catch (err) {
        console.error('[QuickDev] Failed to parse manifest for form fields:', err)
      }
      if (!formFields.name) formFields.name = folderName
      if (!formFields.version) formFields.version = '1.0.0'

      const uploadResult = await serverApi.upload(`${base}/api/scripts`, tmpZipPath, headers, formFields)
      const data = uploadResult as { success: boolean; status: number; data?: { error?: { message?: string } }; error?: string }

      if (data.success || (data.status && data.status >= 200 && data.status < 300)) {
        setUploadStatus('success')
        toast.success(t('quickDev.uploadSuccess') || 'Upload successful')
      } else {
        const serverMsg = data.data?.error?.message
        const fullError = serverMsg || data.error || `HTTP ${data.status}`
        // 尝试打印更详细的调试信息
        console.error('[QuickDev] Upload failed:', { status: data.status, serverMsg, formFields, zipPath: tmpZipPath })
        throw new Error(fullError)
      }
    } catch (e: unknown) {
      setUploadStatus('error')
      const msg = e instanceof Error ? e.message : String(e)
      setUploadError(msg)
      toast.error(msg)
    }
  }

  async function handleSelectZip() {
    const result = await dialogApi.openFile([{ name: 'ZIP Files', extensions: ['zip'] }])
    if (result.canceled || !result.filePath) return

    setZipPath(result.filePath)
    setZipManifest(null)
    setValidationResults([])
    setFolderPath('')
    setManifestContent(null)
    setHasManifest(false)
    setUploadStatus('idle')
    setUploadError('')

    try {
      const extractResult = await zipApi.extractManifest(result.filePath)
      if (extractResult.success && extractResult.manifest) {
        const manifestStr = JSON.stringify(extractResult.manifest, null, 2)
        setZipManifest(manifestStr)
        const results = validateManifest(extractResult.manifest)
        setValidationResults(results)
      } else {
        setValidationResults([t('quickDev.noManifestFound') || 'No manifest.json found in ZIP'])
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setValidationResults([`Error reading ZIP: ${msg}`])
    }
  }

  const missingFields = validationResults
    .filter((r) => r.startsWith('Missing: '))
    .map((r) => r.replace('Missing: ', ''))

  const otherWarnings = validationResults.filter(
    (r) => !r.startsWith('Missing: ') && !r.startsWith('Error')
  )

  const hasNoManifestError = validationResults.some((r) =>
    r.includes('No manifest.json')
  )
  const hasZipError = validationResults.some((r) =>
    r.includes('Error reading ZIP')
  )
  const allValid =
    !hasNoManifestError && !hasZipError && missingFields.length === 0 && otherWarnings.length === 0

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{t('quickDev.title') || '快速开发'}</h2>
      <p className="text-text-muted text-sm">
        {t('quickDev.subtitle') || '快速原型和测试工具'}
      </p>

      <div className="bg-bg-card border border-border-light rounded-xl p-5">
        <h3 className="text-base font-semibold mb-1 text-text-primary flex items-center gap-2">
          <FilePlus size={18} className="text-primary" />
          初始化新项目
        </h3>
        <p className="text-xs text-text-muted mb-4">
          填写脚本基本信息，选择一个空文件夹，自动生成 manifest.json、入口文件和 README。
        </p>

        {projectStep === 0 && (
          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-muted mb-1">脚本 ID <span className="text-danger">*</span></label>
                <input type="text" value={projectMeta.id} onChange={(e) => setProjectMeta((p) => ({ ...p, id: e.target.value }))}
                  placeholder="com.example.my-script"
                  className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">名称 <span className="text-danger">*</span></label>
                <input type="text" value={projectMeta.name} onChange={(e) => setProjectMeta((p) => ({ ...p, name: e.target.value }))}
                  placeholder="My Script"
                  className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">版本</label>
                <input type="text" value={projectMeta.version} onChange={(e) => setProjectMeta((p) => ({ ...p, version: e.target.value }))}
                  className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">入口文件</label>
                <input type="text" value={projectMeta.entry} onChange={(e) => setProjectMeta((p) => ({ ...p, entry: e.target.value }))}
                  className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-text-muted mb-1">描述</label>
                <input type="text" value={projectMeta.desc} onChange={(e) => setProjectMeta((p) => ({ ...p, desc: e.target.value }))}
                  placeholder="脚本用途说明"
                  className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-text-muted mb-1">标签（逗号分隔）</label>
                <input type="text" value={projectMeta.tags} onChange={(e) => setProjectMeta((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="airdrop, testnet, swap"
                  className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-text-muted mb-1">更新日志</label>
                <input type="text" value={projectMeta.changelog} onChange={(e) => setProjectMeta((p) => ({ ...p, changelog: e.target.value }))}
                  placeholder="v1.0.0 初始版本"
                  className="w-full bg-bg-input border border-border-light rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary outline-none" />
              </div>
            </div>

            {/* 权限 */}
            <div>
              <label className="block text-xs text-text-muted mb-2">运行时权限</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={projectMeta.permNetwork}
                    onChange={(e) => setProjectMeta((p) => ({ ...p, permNetwork: e.target.checked }))}
                    className="rounded" />
                  <span className="text-text-secondary">network</span>
                </label>
                <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={projectMeta.permFilesystem}
                    onChange={(e) => setProjectMeta((p) => ({ ...p, permFilesystem: e.target.checked }))}
                    className="rounded" />
                  <span className="text-text-secondary">filesystem</span>
                </label>
              </div>
            </div>

            {/* Schema Properties */}
            <div>
              <label className="block text-xs text-text-muted mb-2">Schema 参数（任务配置表单字段）</label>
              <div className="flex gap-2 mb-2">
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

            {/* 账号模板 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs text-text-muted">账号模板（可选，选择脚本需要的账户类型）</label>
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
      <div className="bg-bg-card border border-border-light rounded-xl p-5">
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
          <p className="text-sm mt-3 text-success flex items-center gap-1.5">
            <CheckCircle size={16} />
            {t('quickDev.uploadSuccess') || '上传成功'}
          </p>
        )}
        {uploadStatus === 'error' && (
          <p className="text-sm mt-3 text-danger flex items-center gap-1.5">
            <XCircle size={16} />
            {t('quickDev.uploadError', { error: uploadError }) || `错误: ${uploadError}`}
          </p>
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
            placeholder="未选择 ZIP 文件..."
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

        {zipManifest && (
          <div className="mb-4">
            <p className="text-xs text-text-secondary mb-1 font-medium">
              {t('quickDev.manifestContent') || 'manifest.json 内容:'}
            </p>
            <pre className="bg-bg-page border border-border-light rounded-lg p-3 text-xs text-text-secondary overflow-auto max-h-64">
              {zipManifest}
            </pre>
          </div>
        )}

        {hasNoManifestError && (
          <p className="text-sm mt-3 text-danger flex items-center gap-1.5">
            <XCircle size={16} />
            {t('quickDev.noManifestInZip') || 'ZIP 中未找到 manifest.json'}
          </p>
        )}

        {hasZipError && (
          <p className="text-sm mt-3 text-danger flex items-center gap-1.5">
            <XCircle size={16} />
            {validationResults[0]}
          </p>
        )}

        {!hasNoManifestError && !hasZipError && (
          <>
            {missingFields.length > 0 && (
              <p className="text-sm mt-3 text-warning flex items-center gap-1.5">
                <AlertTriangle size={16} />
                Missing: {missingFields.join(', ')}
              </p>
            )}

            {otherWarnings.map((w, i) => (
              <p key={i} className="text-sm mt-1 text-warning flex items-center gap-1.5">
                <AlertTriangle size={14} />
                {w}
              </p>
            ))}

            {allValid && (
              <p className="text-sm mt-3 text-success flex items-center gap-1.5">
                <CheckCircle size={16} />
                {t('quickDev.allFieldsComplete') || '所有必填字段完整'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
