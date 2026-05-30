import { useState, useEffect, useCallback, useRef } from 'react'
import type { ListResponse } from '../types'

interface UsePaginatedListResult<T> {
  items: T[]
  total: number
  page: number
  totalPages: number
  loading: boolean
  error: boolean
  setPage: (page: number | ((prev: number) => number)) => void
  setSearch: (search: string) => void
  search: string
  refresh: () => void
}

export function usePaginatedList<T>(
  apiFn: (page: number, pageSize: number, search: string) => Promise<ListResponse<T>>,
  pageSize = 50
): UsePaginatedListResult<T> {
  const [items, setItems] = useState<T[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const apiFnRef = useRef(apiFn)
  // Intentionally update ref to get latest apiFn on every render - this is a common React pattern
  // eslint-disable-next-line react-hooks/refs
  apiFnRef.current = apiFn

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await apiFnRef.current(page, pageSize, debouncedSearch)
      setItems(res.items)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch {
      setItems([])
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData()
  }, [fetchData])

  return {
    items,
    total,
    page,
    totalPages,
    loading,
    error,
    setPage,
    setSearch,
    search,
    refresh: fetchData
  }
}
