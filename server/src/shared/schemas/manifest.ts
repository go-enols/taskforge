/**
 * @file Script manifest zod schema — synced copy for server
 * @description CANONICAL SOURCE: ../../../../shared/schemas/manifest.ts
 *              Keep this file in sync with the root shared copy.
 *              Validates manifest.json structure per AGENTS.md §6.1.
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
}).passthrough()

const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/

/** Script manifest schema — exact contract per AGENTS.md §6.1 */
export const ScriptManifestSchema = z.object({
  id: z.string().min(1, 'id is required'),
  name: z.string().min(1, 'name is required'),
  version: z
    .string()
    .min(1, 'version is required')
    .regex(semverRegex, 'version must be valid semver (e.g. 1.0.0)'),
  description: z.string().min(1, 'description is required'),
  entryPoint: z.string().min(1, 'entryPoint is required'),
  runtime: z.literal('node'),
  schema: jsonSchemaSchema,
  dataRequirements: z.array(dataRequirementSchema).optional(),
  permissions: z.array(z.enum(['network', 'filesystem'])).optional(),
  tags: z.array(z.string()).optional(),
  changelog: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
})

/** 推断的 manifest 类型 */
export type ScriptManifest = z.infer<typeof ScriptManifestSchema>
