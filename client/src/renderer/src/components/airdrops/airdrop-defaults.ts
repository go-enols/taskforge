/**
 * @file airdrop-defaults — 项目表单数据默认值与数据转换
 * @description 定义项目表单的数据结构（AirdropFormData 及各子表单接口）、
 *              空表单生成函数、空条目工厂函数、AirdropProject 与表单数据间的双向转换、
 *              以及基本字段校验逻辑。
 * @module renderer/components/airdrops
 */
import type {
  AirdropProject,
  AirdropStatus,
  AirdropProjectType,
  AirdropLink,
  AirdropTaskItem,
  AirdropTaskStatus,
  Earning,
  EligibilityCriterion,
  TaskTemplate
} from '../../../../shared/types'

/**
 * 精简版 TaskTemplate 类型，供 ClassificationSection 填充"脚本模板（可选）"下拉框。
 * 只保留渲染所需的字段。
 */
export interface TaskTemplateOption {
  /** 模板 ID */
  id: string
  /** 模板名称 */
  name: string
  /** 版本号 */
  version: string
}

/** 将 TaskTemplate 转换为 TaskTemplateOption */
export const toTaskTemplateOption = (t: TaskTemplate): TaskTemplateOption => ({
  id: t.id,
  name: t.name,
  version: t.version
})

/** 链接表单数据类型 */
export interface AirdropLinkFormData {
  /** 链接标签 */
  label: string
  /** 链接 URL */
  url: string
}

/** 资格标准表单数据类型 */
export interface AirdropEligibilityFormData {
  /** 唯一标识 */
  id: string
  /** 标准描述 */
  description: string
  /** 要求类型 */
  requirementType: string
  /** 要求值 */
  requirementValue: string
  /** 是否为强制要求 */
  required: boolean
  /** 是否已满足 */
  met: boolean
  /** 备注 */
  notes: string
}

/** 任务项表单数据类型 */
export interface AirdropTaskFormData {
  /** 唯一标识 */
  id: string
  /** 任务标题 */
  title: string
  /** 任务描述 */
  description: string
  /** 截止日期 */
  deadline: string
  /** 任务状态 */
  status: AirdropTaskStatus
  /** 备注 */
  notes: string
}

/** 收益记录表单数据类型 */
export interface AirdropEarningFormData {
  /** 唯一标识 */
  id: string
  /** 代币名称 */
  token: string
  /** 数量 */
  amount: number
  /** USD 估值 */
  valueUsd: number
  /** 日期 */
  date: string
  /** 备注 */
  notes: string
}

/** 项目表单完整数据结构 */
export interface AirdropFormData {
  /** 项目名称 */
  name: string
  /** 官网 URL */
  website: string
  /** 所属公链 */
  chain: string
  /** 项目描述（支持 Markdown） */
  description: string
  /** 关联脚本模板 ID（可选） */
  scriptTemplateId: string
  /** 关联账号池名称 */
  accountPool: string
  /** 项目状态 */
  status: AirdropStatus
  /** 项目类型 */
  projectType: AirdropProjectType
  /** 标签（逗号分隔字符串） */
  tags: string
  /** 分类标记（逗号分隔字符串） */
  labels: string
  /** 链接列表 */
  links: AirdropLinkFormData[]
  /** 资格标准列表 */
  eligibilityCriteria: AirdropEligibilityFormData[]
  /** 任务列表 */
  tasks: AirdropTaskFormData[]
  /** 收益记录列表 */
  earnings: AirdropEarningFormData[]
}

/** 创建空白的项目表单数据，用于创建模式 */
export const emptyForm = (): AirdropFormData => ({
  name: '',
  website: '',
  chain: '',
  description: '',
  scriptTemplateId: '',
  accountPool: '',
  status: 'ongoing',
  projectType: 'testnet',
  tags: '',
  labels: '',
  links: [],
  eligibilityCriteria: [],
  tasks: [],
  earnings: []
})

/** 创建空白的链接条目（用于添加新行） */
export const makeEmptyLink = (): AirdropLinkFormData => ({ label: '', url: '' })

/** 创建空白任务条目（使用随机 UUID 作为 ID） */
export const makeEmptyTask = (): AirdropTaskFormData => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  deadline: '',
  status: 'pending',
  notes: ''
})

/** 创建空白收益记录（日期默认为今天） */
export const makeEmptyEarning = (): AirdropEarningFormData => ({
  id: crypto.randomUUID(),
  token: '',
  amount: 0,
  valueUsd: 0,
  date: new Date().toISOString().slice(0, 10),
  notes: ''
})

/** 创建空白资格标准条目 */
export const makeEmptyEligibility = (): AirdropEligibilityFormData => ({
  id: crypto.randomUUID(),
  description: '',
  requirementType: '',
  requirementValue: '',
  required: false,
  met: false,
  notes: ''
})

/** 内部工具：将标签数组转换为逗号分隔字符串 */
const tagsToString = (tags: string[]): string => tags.join(', ')

/** 内部工具：将逗号分隔字符串拆分为数组，去除首尾空格和空元素 */
const splitCommaSeparated = (raw: string): string[] =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

/**
 * 将 AirdropProject 转换为表单数据结构
 *
 * tags/labels 数组合并为逗号分隔字符串，方便用户在文本框中编辑。
 *
 * @param p - 项目数据
 * @returns 表单数据
 */
export const toFormData = (p: AirdropProject): AirdropFormData => ({
  name: p.name ?? '',
  website: p.website ?? '',
  chain: p.chain ?? '',
  description: p.description ?? '',
  scriptTemplateId: p.scriptTemplateId ?? '',
  accountPool: p.accountPool ?? '',
  status: p.status,
  projectType: p.projectType,
  tags: tagsToString(p.tags ?? []),
  labels: tagsToString(p.labels ?? []),
  links: (p.links ?? []).map((l: AirdropLink) => ({
    label: l.label ?? '',
    url: l.url ?? ''
  })),
  eligibilityCriteria: (p.eligibilityCriteria ?? []).map((e: EligibilityCriterion) => ({
    id: e.id,
    description: e.description ?? '',
    requirementType: e.requirementType ?? '',
    requirementValue: e.requirementValue ?? '',
    required: !!e.required,
    met: !!e.met,
    notes: e.notes ?? ''
  })),
  tasks: (p.tasks ?? []).map((t: AirdropTaskItem) => ({
    id: t.id,
    title: t.title ?? '',
    description: t.description ?? '',
    deadline: t.deadline ?? '',
    status: t.status,
    notes: t.notes ?? ''
  })),
  earnings: (p.earnings ?? []).map((e: Earning) => ({
    id: e.id,
    token: e.token ?? '',
    amount: Number(e.amount) || 0,
    valueUsd: Number(e.valueUsd) || 0,
    date: e.date ?? '',
    notes: e.notes ?? ''
  }))
})

/**
 * 将表单数据转换为 API 需要的载荷格式
 *
 * 去除 id/createdAt/updatedAt 字段，使此函数同时适用于创建和更新操作。
 * 字符串字段会去除首尾空格，空字符串链接会被过滤。
 *
 * @param fd - 表单数据
 * @returns 可用于提交的项目数据（不含 id/createdAt/updatedAt）
 */
export const fromFormData = (fd: AirdropFormData): Omit<AirdropProject, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: fd.name.trim(),
  website: fd.website.trim(),
  chain: fd.chain.trim(),
  description: fd.description.trim(),
  scriptTemplateId: fd.scriptTemplateId.trim() || undefined,
  accountPool: fd.accountPool.trim(),
  status: fd.status,
  projectType: fd.projectType,
  tags: splitCommaSeparated(fd.tags),
  labels: splitCommaSeparated(fd.labels),
  links: fd.links
    .map((l) => ({ label: (l.label ?? '').trim(), url: (l.url ?? '').trim() }))
    .filter((l) => l.label.length > 0 || l.url.length > 0),
  eligibilityCriteria: fd.eligibilityCriteria.map((e) => ({
    id: e.id,
    description: e.description.trim(),
    requirementType: e.requirementType.trim(),
    requirementValue: e.requirementValue.trim(),
    required: e.required,
    met: e.met,
    notes: e.notes.trim()
  })),
  tasks: fd.tasks.map((t) => ({
    id: t.id,
    title: t.title.trim(),
    description: t.description.trim(),
    deadline: t.deadline.trim() || undefined,
    status: t.status,
    notes: t.notes.trim()
  })),
  earnings: fd.earnings
    .map((e) => ({
      id: e.id,
      token: e.token.trim(),
      amount: Number(e.amount) || 0,
      valueUsd: Number(e.valueUsd) || 0,
      date: e.date,
      notes: e.notes.trim()
    }))
    .filter((e) => e.token.length > 0)
})

/** 基本字段校验结果类型：校验通过或返回第一个失败的字段名 */
export type BasicValidation = { valid: true } | { valid: false; field: 'name' | 'website' | 'accountPool' }

/**
 * 校验三个必填顶级字段
 *
 * 只返回第一个校验失败项（而非所有失败项的列表），
 * 因为 UI 每次只显示一个内联错误提示。
 *
 * @param fd - 表单数据
 * @returns 校验结果
 */
export const validateBasic = (fd: AirdropFormData): BasicValidation => {
  if (!fd.name.trim()) return { valid: false, field: 'name' }
  if (!fd.website.trim()) return { valid: false, field: 'website' }
  if (!fd.accountPool.trim()) return { valid: false, field: 'accountPool' }
  return { valid: true }
}
