/**
 * @file 模板列表获取 Hook
 * @description 从主进程获取参数模板列表的简单 Hook，用于需要一次性加载所有模板的场景。
 * @module renderer/hooks
 */
import { useState, useEffect } from 'react'
import { templateApi } from '../api'
import type { Template } from '../types'

/** useTemplateList 返回结果的结构 */
interface UseTemplateListResult {
  /** 模板列表 */
  templates: Template[]
  /** 是否正在加载 */
  loading: boolean
}

/**
 * useTemplateList — 获取所有模板列表
 *
 * 组件挂载时自动加载一次模板列表，适用于不需要分页的场景。
 *
 * @returns {{ templates: Template[], loading: boolean }}
 */
export function useTemplateList(): UseTemplateListResult {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    templateApi
      .list()
      .then((res) => setTemplates(res.items || []))
      .catch((err) => {
        console.warn('Failed to load templates', err)
        setTemplates([])
      })
      .finally(() => setLoading(false))
  }, [])

  return { templates, loading }
}
