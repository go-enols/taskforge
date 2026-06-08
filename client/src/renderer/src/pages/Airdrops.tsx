/**
 * @file Airdrops — 项目追踪管理页
 * @description 管理项目的完整生命周期：创建、编辑、查看详情、删除。
 *              含 KPI 统计条、卡片网格、搜索分页和关联脚本/账号池选择。
 * @module renderer/pages
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, AlertCircle, Briefcase } from 'lucide-react'
import { airdropApi, scriptParamApi, scriptApi } from '../api'
import type { AirdropProject, AirdropAnalytics, InstalledScript, TaskTemplate } from '../types'
import {
  emptyForm,
  toFormData,
  fromFormData,
  type AirdropFormData
} from '../components/airdrops/airdrop-defaults'
import AirdropCard from '../components/airdrops/AirdropCard'
import AirdropKpiBar from '../components/airdrops/AirdropKpiBar'
import AirdropDetailModal from '../components/airdrops/AirdropDetailModal'
import AirdropFormModal, { type AirdropFormMode } from '../components/airdrops/AirdropFormModal'
import { usePaginatedList } from '../hooks'
import {
  SearchInput,
  Pagination,
  EmptyState,
  Skeleton,
  ConfirmDialog
} from '../components/common'
import { toast } from '../utils/toast'

/** 每页显示项目数 */
const PAGE_SIZE = 12

/** 分析数据的默认空值 */
const DEFAULT_ANALYTICS: AirdropAnalytics = {
  totalAirdrops: 0,
  ongoingCount: 0,
  completedCount: 0,
  claimedCount: 0,
  cancelledCount: 0,
  totalEarningsValueUsd: 0,
  tokenEarnings: [],
  upcomingDeadlines: []
}

/**
 * Airdrops — 项目管理页面组件
 *
 * 主页面包含 KPI 统计条、搜索栏、项目卡片网格和分页。
 * 支持创建/编辑/查看详情/删除项目，关联任务脚本模板和账号池。
 */
const Airdrops: React.FC = () => {
  const { t } = useTranslation()
  const { items, total, page, totalPages, loading, error, setPage, setSearch, search, refresh } =
    usePaginatedList<AirdropProject>((p, ps, s) => airdropApi.list(p, ps, s), PAGE_SIZE)

  // Form-modal state
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<AirdropFormMode>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<AirdropFormData | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formDataLoading, setFormDataLoading] = useState(false)

  // Dropdowns for the form (scripts + account pools)
  const [scriptTemplates, setScriptTemplates] = useState<TaskTemplate[]>([])
  const [accountPools, setAccountPools] = useState<string[]>([])
  const [dropdownsLoading, setDropdownsLoading] = useState(true)

  // Detail modal
  const [detailProject, setDetailProject] = useState<AirdropProject | null>(null)

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // KPI bar
  const [analytics, setAnalytics] = useState<AirdropAnalytics>(DEFAULT_ANALYTICS)

  useEffect(() => {
    const loadDropdowns = async (): Promise<void> => {
      const [scriptsResult, poolsResult] = await Promise.allSettled([
        scriptApi.listInstalled(),
        scriptParamApi.listPools()
      ])
      if (scriptsResult.status === 'fulfilled') {
        // scriptApi.listInstalled() returns InstalledScript[]; the form dropdown
        // only needs id+name+version which both shapes share, so we map explicitly.
        const list: InstalledScript[] = scriptsResult.value
        setScriptTemplates(
          list.map(
            (s): TaskTemplate => ({
              id: s.id,
              name: s.name,
              version: s.version,
              description: s.description,
              installPath: s.installPath,
              manifest: s.schema as Record<string, unknown>,
              remoteUrl: s.remoteUrl,
              isInstalled: true,
              downloadedAt: s.downloadedAt,
              updatedAt: s.updatedAt
            })
          )
        )
      }
      if (poolsResult.status === 'fulfilled') {
        setAccountPools(poolsResult.value)
      }
      setDropdownsLoading(false)
    }
    void loadDropdowns()
  }, [])

  const refreshAnalytics = useCallback(async () => {
    try {
      const a = await airdropApi.getAnalytics()
      setAnalytics(a)
    } catch {
      // KPI is best-effort; don't surface analytics errors to the user
    }
  }, [])

  // Initial + post-list-refresh analytics refresh. The lint rule flags setState
  // inside effects; here we call an async fetcher (not direct setState in render)
  // which is the documented pattern for syncing with an external source.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void refreshAnalytics()
  }, [refreshAnalytics])

  // Refetch analytics whenever the list changes (any refresh)
  useEffect(() => {
    void refreshAnalytics()
  }, [items, refreshAnalytics])
  /* eslint-enable react-hooks/set-state-in-effect */

  const openCreate = (): void => {
    setFormMode('create')
    setEditingId(null)
    setFormData(emptyForm())
    setFormError(null)
    setFormOpen(true)
  }

  /**
   * Staleness-aware open-edit: re-fetch the latest version from the API, compare
   * its updatedAt to what we have in `items`, and warn the user if another
   * process has touched the row since we loaded the list.
   */
  const openEdit = useCallback(
    async (id: string): Promise<void> => {
      const fromList = items.find((p) => p.id === id)
      setFormDataLoading(true)
      setFormMode('edit')
      setEditingId(id)
      setFormError(null)
      setFormOpen(true)
      try {
        const latest = await airdropApi.get(id)
        if (latest) {
          if (fromList && fromList.updatedAt !== latest.updatedAt) {
            toast.warning(t('airdrops.stalenessWarning'))
          }
          setFormData(toFormData(latest))
        } else {
          setFormData(fromList ? toFormData(fromList) : emptyForm())
        }
      } catch {
        setFormData(fromList ? toFormData(fromList) : emptyForm())
      } finally {
        setFormDataLoading(false)
      }
    },
    [items, t]
  )

  const closeForm = (): void => {
    setFormOpen(false)
    setFormData(null)
    setEditingId(null)
    setFormError(null)
  }

  const handleSubmit = useCallback(
    async (payload: ReturnType<typeof fromFormData>) => {
      if (formMode === 'create') {
        try {
          setSubmitting(true)
          await airdropApi.create(payload)
          toast.success(t('common.saveSuccess'))
          closeForm()
          refresh()
        } catch {
          setFormError(t('common.operationFailed'))
        } finally {
          setSubmitting(false)
        }
      } else if (editingId) {
        try {
          setSubmitting(true)
          await airdropApi.update(editingId, payload)
          toast.success(t('common.saveSuccess'))
          closeForm()
          refresh()
        } catch {
          setFormError(t('common.operationFailed'))
        } finally {
          setSubmitting(false)
        }
      }
    },
    [formMode, editingId, t, refresh]
  )

  const handleView = useCallback((id: string) => {
    const proj = items.find((p) => p.id === id) ?? null
    setDetailProject(proj)
  }, [items])

  const handleEditFromDetail = useCallback(
    (id: string) => {
      setDetailProject(null)
      void openEdit(id)
    },
    [openEdit]
  )

  const handleDeleteFromDetail = useCallback((id: string) => {
    setDetailProject(null)
    setDeleteId(id)
  }, [])

  const performDelete = useCallback(
    async (id: string, showUndo = true) => {
      const previous = items.find((p) => p.id === id)
      if (!previous) return
      try {
        await airdropApi.delete(id)
        refresh()
        if (showUndo) {
          toast(t('common.deleted'), {
            action: {
              label: t('common.undo'),
              onClick: () => {
                void airdropApi
                  .create({
                    name: previous.name,
                    chain: previous.chain,
                    website: previous.website,
                    scriptTemplateId: previous.scriptTemplateId,
                    accountPool: previous.accountPool,
                    status: previous.status,
                    projectType: previous.projectType,
                    description: previous.description,
                    links: previous.links,
                    eligibilityCriteria: previous.eligibilityCriteria,
                    tasks: previous.tasks,
                    earnings: previous.earnings,
                    tags: previous.tags,
                    labels: previous.labels
                  })
                  .then(() => {
                    toast.success(t('common.saveSuccess'))
                    refresh()
                  })
                  .catch(() => {
                    toast.error(t('common.operationFailed'))
                  })
              }
            }
          })
        }
      } catch {
        toast.error(t('common.operationFailed'))
      }
    },
    [items, refresh, t]
  )

  const confirmDelete = useCallback(async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await performDelete(deleteId, true)
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }, [deleteId, performDelete])

  // Render
  return (
    <div className="space-y-4">
      {/* 页面标题、搜索与创建按钮 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">{t('airdrops.title')}</h1>
        <div className="flex items-center gap-2.5">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('airdrops.searchPlaceholder')}
          />
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors shrink-0"
          >
            <Plus size={16} />
            {t('airdrops.createAirdrop')}
          </button>
        </div>
      </div>

      {/* KPI bar */}
      <AirdropKpiBar analytics={analytics} />

      {error && (
        <div className="text-danger text-sm bg-danger-light border border-danger/30 rounded-lg px-4 py-2 flex items-center gap-2">
          <AlertCircle size={16} />
          {t('common.error')}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-bg-card rounded-xl border border-border-light border-l-[3px] border-l-border-light p-4 space-y-2.5"
            >
              <div className="flex items-start justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-12" />
              </div>
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-4 w-14 rounded-full" />
                <Skeleton className="h-4 w-12 rounded-full" />
              </div>
              <Skeleton lines={2} className="h-3" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
            icon={Briefcase}
          title={t('airdrops.noAirdrops')}
          action={
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary-hover transition-colors"
            >
              <Plus size={16} />
              {t('airdrops.createAirdrop')}
            </button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <AirdropCard
                key={item.id}
                project={item}
                onEdit={(id) => void openEdit(id)}
                onDelete={setDeleteId}
                onView={handleView}
              />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            totalCountText={t('common.total', { count: total })}
            pageText={t('common.page', { current: page, total: totalPages })}
          />
        </>
      )}

      <AirdropFormModal
        open={formOpen}
        mode={formMode}
        onClose={closeForm}
        onSubmit={handleSubmit}
        formData={formData}
        onChange={setFormData}
        scriptTemplates={scriptTemplates}
        accountPools={accountPools}
        loadingFormData={formDataLoading || dropdownsLoading}
        submitting={submitting}
        errorMessage={formError}
      />

      <AirdropDetailModal
        project={detailProject ?? ({} as AirdropProject)}
        open={!!detailProject}
        onClose={() => setDetailProject(null)}
        onEdit={handleEditFromDetail}
        onDelete={handleDeleteFromDetail}
      />

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title={t('airdrops.confirmDelete')}
        message={t('airdrops.confirmDelete')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        loading={deleting}
      />
    </div>
  )
}

export default Airdrops
