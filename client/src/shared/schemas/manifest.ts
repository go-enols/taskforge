/**
 * @file Script manifest zod schema — single source of truth
 * @description Validates manifest.json structure per AGENTS.md §6.1.
 *              Used by both client (pre-upload validation) and server (API validation).
 *
 *              Mandatory: id, name, version, description, entryPoint, runtime, schema
 *              Optional:  dataRequirements, permissions, tags, changelog
 * @module shared/schemas
 */
import { z } from 'zod'

/** 数据源类型 */
const dataSourceSchema = z.enum(['wallet', 'proxy', 'script_param'])

/** 数据需求声明 */
const dataRequirementSchema = z.object({
  key: z.string().min(1, 'key is required'),
  label: z.string().min(1, 'label is required'),
  templateType: z.string().min(1, 'templateType is required'),
  min: z.number().int().min(0).default(0),
  max: z.number().int().min(-1).default(-1),
  source: dataSourceSchema,
  description: z.string().optional()
})

export type JsonSchemaField = {
  type: string
  title?: string
  description?: string
  default?: unknown
  enum?: string[]
  required?: boolean
  properties?: Record<string, JsonSchemaField>
  items?: JsonSchemaField
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  pattern?: string
}

const jsonSchemaFieldSchema: z.ZodType<JsonSchemaField> = z.lazy(() =>
  z.object({
    type: z.string().min(1),
    title: z.string().optional(),
    description: z.string().optional(),
    default: z.unknown().optional(),
    enum: z.array(z.string()).optional(),
    required: z.boolean().optional(),
    properties: z.record(z.string(), jsonSchemaFieldSchema).optional(),
    items: jsonSchemaFieldSchema.optional(),
    minLength: z.number().optional(),
    maxLength: z.number().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    pattern: z.string().optional()
  })
)

const jsonSchemaSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), jsonSchemaFieldSchema).optional(),
  required: z.array(z.string()).optional()
})

const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/

/** Script manifest schema — exact contract per AGENTS.md §6.1 */
export const ScriptManifestSchema = z.object({
  /** 脚本唯一标识（UUID v4 或自定义 ID） */
  id: z.string().min(1, 'id is required'),
  /** 脚本显示名称 */
  name: z.string().min(1, 'name is required'),
  /** 语义化版本（如 1.0.0） */
  version: z
    .string()
    .min(1, 'version is required')
    .regex(semverRegex, 'version must be valid semver (e.g. 1.0.0)'),
  /** 脚本用途说明 */
  description: z.string().min(1, 'description is required'),
  /** 入口文件名（相对脚本目录） */
  entryPoint: z.string().min(1, 'entryPoint is required'),
  /** 运行时（当前仅支持 "node"） */
  runtime: z.literal('node'),
  /** 任务配置表单的 JSON Schema */
  schema: jsonSchemaSchema,
  /** 脚本需要的数据模板声明（替代旧的 requiredAccountTemplateIds） */
  dataRequirements: z.array(dataRequirementSchema).optional(),
  /** （可选）权限声明 */
  permissions: z.array(z.enum(['network', 'filesystem'])).optional(),
  /** （可选）分类标签 */
  tags: z.array(z.string()).optional(),
  /** （可选）更新日志 */
  changelog: z.string().optional()
})

/** 推断的 manifest 类型 */
export type ScriptManifest = z.infer<typeof ScriptManifestSchema>
