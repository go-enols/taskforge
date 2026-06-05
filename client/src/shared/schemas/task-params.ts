/**
 * @file 任务参数校验 schema
 * @description 提供 JSON Schema ↔ FieldMeta 互转、表单校验、扁平/嵌套数据转换等功能。
 *              用于任务脚本参数表单的动态渲染和校验。
 * @module shared/schemas
 */
import { z } from 'zod'

/** 表单字段元数据：描述一个表单字段的类型、标签、校验规则和选项 */
export interface FieldMeta {
  /** 字段名称 */
  name: string
  /** 字段类型 */
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect'
  /** 显示标签 */
  label: string
  /** 是否必填 */
  required: boolean
  /** 默认值 */
  defaultValue?: unknown
  /** 选项列表（select/multiselect 类型使用） */
  options?: Array<{ label: string; value: string }>
  /** 字段描述 */
  description?: string
  /** 最小值（number 类型） */
  min?: number
  /** 最大值（number 类型） */
  max?: number
  /** 正则校验模式（string 类型） */
  pattern?: string
}

/**
 * 从 Zod Schema 提取 FieldMeta 列表
 *
 * 遍历 ZodObject 的每个字段，解析类型信息和校验规则
 *
 * @param schema - Zod 对象 schema
 * @returns 字段元数据数组
 */
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
 * 将 JSON Schema 对象转换为 FieldMeta[] 数组
 *
 * 处理 manifest.json 的 schema 格式：{ type: "object", properties: {...}, required: [...] }
 * 嵌套对象会被展开为点号表示法（如 "parent.child"）。
 *
 * @param jsonSchema - JSON Schema 对象
 * @returns 字段元数据数组
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
 * 递归展开嵌套对象属性为点号表示法的 FieldMeta 条目
 *
 * @param prefix - 父级字段名前缀（如 "profile"）
 * @param properties - 当前级别的属性定义
 * @param requiredList - 当前级别的必填字段列表
 * @param parentSchema - 父级 schema（用于获取 label）
 * @returns 展开后的字段元数据数组
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

/** 将 JSON Schema 类型映射为 FieldMeta 类型 */
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

/** 解析单个 Zod 字段为 FieldMeta 元数据 */
function parseZodField(name: string, schema: z.ZodTypeAny): FieldMeta {
  const meta: FieldMeta = {
    name,
    type: 'string',
    label: name,
    required: true
  }

  const description = (schema as { description?: string }).description
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
      const numSchema = unwrapped as unknown as { _def?: { checks?: Array<{ kind: string; value: number }> } }
      const checks = numSchema._def?.checks
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
      const values = (unwrapped._def as unknown as { values?: string[] }).values
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

  const def = schema._def as unknown as { type?: string; defaultValue?: unknown }
  if (def.type === 'default' && def.defaultValue !== undefined) {
    meta.defaultValue = def.defaultValue
    meta.required = false
  }

  return meta
}

/** 解包 Zod 包装类型（Optional、Default），获取内部真实类型 */
function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  const def = schema._def as unknown as { type?: string; innerType?: z.ZodTypeAny }
  if ((def.type === 'optional' || def.type === 'default') && def.innerType) {
    return unwrapSchema(def.innerType)
  }
  return schema
}

/** 判断 Zod Schema 是否为可选类型 */
function isOptionalSchema(schema: z.ZodTypeAny): boolean {
  const def = schema._def as unknown as { type?: string }
  if (def.type === 'optional') return true
  if (def.type === 'default') return true
  return false
}

/**
 * 校验表单字段值
 *
 * 根据 FieldMeta[] 定义检查必填、数值范围和正则匹配。
 *
 * @param fields - 字段元数据数组
 * @param values - 表单值键值对
 * @returns 字段名 → 错误消息的映射（空对象表示校验通过）
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
 * 将点号表示法的扁平对象转换为嵌套对象
 *
 * 示例：{ "profile.name": "Alice", "profile.age": 30, "url": "x" }
 *    → { profile: { name: "Alice", age: 30 }, url: "x" }
 *
 * 如果中间路径上已存在非对象值，会将其替换为对象以便插入深层属性。
 *
 * @param values - 点号表示法的扁平键值对
 * @returns 嵌套结构对象
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

/**
 * 将 FieldMeta[] 转换为 Zod Schema
 *
 * 用于将动态表单定义转换为可执行的校验 schema。
 *
 * @param fields - 字段元数据数组
 * @returns Zod 对象 schema
 */
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

/** 通用任务参数 schema：代理、无头模式、重试次数、超时时间 */
export const commonTaskParams = z.object({
  proxyEnabled: z.boolean().default(false).describe('使用代理'),
  headless: z.boolean().default(true).describe('无头模式'),
  maxRetries: z.number().int().min(0).max(10).default(3).describe('最大重试次数'),
  timeout: z.number().int().min(0).default(300).describe('超时时间(秒)')
})

/** 通用任务参数的类型推导 */
export type CommonTaskParams = z.infer<typeof commonTaskParams>
