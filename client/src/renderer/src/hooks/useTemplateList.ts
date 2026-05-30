import { useState, useEffect } from 'react'
import { templateApi } from '../api'
import type { Template } from '../types'

interface UseTemplateListResult {
  templates: Template[]
  loading: boolean
}

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
