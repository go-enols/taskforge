import { z } from 'zod'

export interface FieldMeta {
  name: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect'
  label: string
  required: boolean
  defaultValue?: unknown
  options?: Array<{ label: string; value: string }>
  description?: string
  min?: number
  max?: number
  pattern?: string
}

export function extractFieldMeta(schema: z.ZodObject<z.ZodRawShape>): FieldMeta[] {
  const shape = schema.shape
  const fields: FieldMeta[] = []

  for (const [name, fieldSchema] of Object.entries(shape)) {
    const meta = parseZodField(name, fieldSchema as z.ZodTypeAny)
    fields.push(meta)
  }

  return fields
}

/**
 * Convert a JSON Schema object to FieldMeta[].
 * Handles the manifest.json schema format: { type: "object", properties: {...}, required: [...] }
 * Nested objects are flattened with dot-notation field names (e.g. "parent.child").
 */
export function jsonSchemaToFieldMeta(jsonSchema: Record<string, unknown>): FieldMeta[] {
  const fields: FieldMeta[] = []
  if (jsonSchema.type !== 'object' || !jsonSchema.properties) return fields

  const properties = jsonSchema.properties as Record<string, Record<string, unknown>>
  const requiredList = (jsonSchema.required as string[]) ?? []

  for (const [name, propSchema] of Object.entries(properties)) {
    const enumValues = propSchema.enum as string[] | undefined
    const propType = propSchema.type as string | undefined

    // Nested object: recursively flatten child properties
    if (propType === 'object' && propSchema.properties) {
      const nestedFields = flattenNestedProperties(
        name,
        propSchema.properties as Record<string, Record<string, unknown>>,
        (propSchema.required as string[]) ?? [],
        propSchema
      )
      fields.push(...nestedFields)
      continue
    }

    const meta: FieldMeta = {
      name,
      type: mapJsonSchemaType(propType ?? 'string', enumValues),
      label: (propSchema.title as string) || (propSchema.description as string) || name,
      required: requiredList.includes(name),
      description: (propSchema.description as string) || undefined,
      defaultValue: propSchema.default
    }

    if (enumValues) {
      meta.options = enumValues.map((v) => ({ label: v, value: v }))
    }

    if (meta.type === 'number') {
      if (propSchema.minimum !== undefined) meta.min = propSchema.minimum as number
      if (propSchema.maximum !== undefined) meta.max = propSchema.maximum as number
    }

    if (propSchema.pattern) {
      meta.pattern = propSchema.pattern as string
    }

    fields.push(meta)
  }

  return fields
}

/**
 * Recursively flatten nested object properties into dot-notation FieldMeta entries.
 */
function flattenNestedProperties(
  prefix: string,
  properties: Record<string, Record<string, unknown>>,
  requiredList: string[],
  parentSchema: Record<string, unknown>
): FieldMeta[] {
  const fields: FieldMeta[] = []

  const parentLabel =
    (parentSchema.title as string) || (parentSchema.description as string) || prefix

  for (const [name, propSchema] of Object.entries(properties)) {
    const fullName = `${prefix}.${name}`
    const enumValues = propSchema.enum as string[] | undefined
    const propType = propSchema.type as string | undefined

    // Recurse into deeper nested objects
    if (propType === 'object' && propSchema.properties) {
      const deeper = flattenNestedProperties(
        fullName,
        propSchema.properties as Record<string, Record<string, unknown>>,
        (propSchema.required as string[]) ?? [],
        propSchema
      )
      fields.push(...deeper)
      continue
    }

    const meta: FieldMeta = {
      name: fullName,
      type: mapJsonSchemaType(propType ?? 'string', enumValues),
      label: `${parentLabel} › ${(propSchema.title as string) || (propSchema.description as string) || name}`,
      required: requiredList.includes(name),
      description: (propSchema.description as string) || undefined,
      defaultValue: propSchema.default
    }

    if (enumValues) {
      meta.options = enumValues.map((v) => ({ label: v, value: v }))
    }

    if (meta.type === 'number') {
      if (propSchema.minimum !== undefined) meta.min = propSchema.minimum as number
      if (propSchema.maximum !== undefined) meta.max = propSchema.maximum as number
    }

    if (propSchema.pattern) {
      meta.pattern = propSchema.pattern as string
    }

    fields.push(meta)
  }

  return fields
}

function mapJsonSchemaType(jsonType: string, enumValues: string[] | undefined): FieldMeta['type'] {
  if (enumValues?.length) return 'select'
  switch (jsonType) {
    case 'boolean':
      return 'boolean'
    case 'integer':
    case 'number':
      return 'number'
    default:
      return 'string'
  }
}

function parseZodField(name: string, schema: z.ZodTypeAny): FieldMeta {
  const meta: FieldMeta = {
    name,
    type: 'string',
    label: name,
    required: true
  }

  const description = (schema as any).description as string | undefined
  if (description) {
    meta.label = description
    meta.description = description
  }

  const unwrapped = unwrapSchema(schema)
  const schemaType = unwrapped._def.type as string

  switch (schemaType) {
    case 'string':
      meta.type = 'string'
      break
    case 'number': {
      meta.type = 'number'
      const numSchema = unwrapped as any
      const checks = numSchema._def?.checks as Array<{ kind: string; value: number }> | undefined
      if (checks?.length) {
        for (const check of checks) {
          if (check.kind === 'min' && meta.min == null) meta.min = check.value
          if (check.kind === 'max' && meta.max == null) meta.max = check.value
        }
      }
      break
    }
    case 'boolean':
      meta.type = 'boolean'
      break
    case 'enum': {
      meta.type = 'select'
      const values = (unwrapped._def as any).values as string[] | undefined
      if (values?.length) {
        meta.options = values.map((v) => ({ label: v, value: v }))
      }
      break
    }
    default:
      meta.type = 'string'
  }

  if (isOptionalSchema(schema)) {
    meta.required = false
  }

  const def = schema._def as any
  if (def.type === 'default' && def.defaultValue !== undefined) {
    meta.defaultValue = def.defaultValue
    meta.required = false
  }

  return meta
}

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  const def = schema._def as any
  if (def.type === 'optional' || def.type === 'default') {
    return unwrapSchema(def.innerType)
  }
  return schema
}

function isOptionalSchema(schema: z.ZodTypeAny): boolean {
  const def = schema._def as any
  if (def.type === 'optional') return true
  if (def.type === 'default') return true
  return false
}

/**
 * Validate form values against FieldMeta[] definitions.
 * Returns a map of field name → error message. Empty map means valid.
 */
export function validateFormFields(
  fields: FieldMeta[],
  values: Record<string, unknown>
): Record<string, string> {
  const errors: Record<string, string> = {}

  for (const field of fields) {
    const value = values[field.name]
    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0)

    if (field.required && isEmpty) {
      errors[field.name] = field.type === 'select' ? '请选择' : '此字段为必填项'
      continue
    }

    if (isEmpty) continue

    if (field.type === 'number') {
      const num = typeof value === 'number' ? value : Number(value)
      if (Number.isFinite(num)) {
        if (field.min !== undefined && num < field.min) {
          errors[field.name] = `最小值为 ${field.min}`
          continue
        }
        if (field.max !== undefined && num > field.max) {
          errors[field.name] = `最大值为 ${field.max}`
          continue
        }
      }
    }

    if (field.pattern && typeof value === 'string') {
      try {
        const re = new RegExp(field.pattern)
        if (!re.test(value)) {
          errors[field.name] = '格式不正确'
          continue
        }
      } catch {
        void 0
      }
    }
  }

  return errors
}

/**
 * Convert a flat object with dot-notation keys into a nested object.
 * Example: { "profile.name": "Alice", "profile.age": 30, "url": "x" }
 *       → { profile: { name: "Alice", age: 30 }, url: "x" }
 *
 * If a non-object leaf value already exists at an intermediate path, it is
 * replaced with an object so the deeper key can be inserted.
 */
export function unflattenDotNotation(values: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(values)) {
    if (!key.includes('.')) {
      const existing = result[key]
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        continue
      }
      result[key] = value
      continue
    }

    const parts = key.split('.')
    let cursor: Record<string, unknown> = result
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      const next = cursor[part]
      if (!next || typeof next !== 'object' || Array.isArray(next)) {
        const obj: Record<string, unknown> = {}
        cursor[part] = obj
        cursor = obj
      } else {
        cursor = next as Record<string, unknown>
      }
    }
    cursor[parts[parts.length - 1]] = value
  }

  return result
}

export function fieldMetaToZodSchema(
  fields: FieldMeta[]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const field of fields) {
    let schema: z.ZodTypeAny

    switch (field.type) {
      case 'number': {
        let numSchema = z.number()
        if (field.min !== undefined) numSchema = numSchema.min(field.min)
        if (field.max !== undefined) numSchema = numSchema.max(field.max)
        schema = numSchema
        break
      }
      case 'boolean':
        schema = z.boolean()
        break
      case 'select':
        if (field.options?.length) {
          const values = field.options.map((o) => o.value) as [string, ...string[]]
          schema = z.enum(values)
        } else {
          schema = z.string()
        }
        break
      case 'multiselect':
        schema = z.array(z.string())
        break
      case 'string':
      default: {
        let strSchema = z.string()
        if (field.pattern) {
          try {
            strSchema = strSchema.regex(new RegExp(field.pattern))
          } catch {
            // Invalid regex pattern, skip
          }
        }
        schema = strSchema
        break
      }
    }

    if (!field.required) {
      schema = schema.optional()
    }

    if (field.defaultValue !== undefined) {
      schema = schema.default(field.defaultValue)
    }

    shape[field.name] = schema
  }

  return z.object(shape)
}

export const commonTaskParams = z.object({
  proxyEnabled: z.boolean().default(false).describe('使用代理'),
  headless: z.boolean().default(true).describe('无头模式'),
  maxRetries: z.number().int().min(0).max(10).default(3).describe('最大重试次数'),
  timeout: z.number().int().min(0).default(300).describe('超时时间(秒)')
})

export type CommonTaskParams = z.infer<typeof commonTaskParams>
